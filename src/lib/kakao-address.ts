"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 카카오 주소 검색 (Geocoder.addressSearch → 없으면 Places.keywordSearch)
//
//  · 사용자는 "신림동 808-49", "테헤란로 152"처럼 **서울을 빼고** 치는 일이 많다.
//    → 원문으로 먼저 찾고, 없으면 `서울 ` / `서울특별시 ` 를 붙여 다시 찾는다.
//  · 재개발 상담 대상은 서울뿐이라 **서울 밖 결과는 버린다**(경기·인천 주소가 섞이면
//    구역 판별이 "구역 밖"으로만 나와 사용자를 헷갈리게 한다).
//  · SDK services 라이브러리가 없으면(키·도메인 문제) ok:false + 이유를 돌려준다.
//    호출측(ZoneExplorer)은 그때 주소 검색 줄만 감추고 구역명 검색은 그대로 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  loadKakaoServices,
  type KakaoAddressDoc,
  type KakaoKeywordDoc,
  type KakaoSDK,
} from "@/components/map/kakao-loader";
import { SEOUL_BOUNDS } from "@/components/map/props";

export type AddressCandidate = {
  key: string;
  /** 지번 주소(없으면 도로명·장소명) — 목록의 주 줄 */
  label: string;
  /** 도로명·건물명 — 목록의 보조 줄 */
  detail?: string;
  kind: "지번" | "도로명" | "장소";
  lat: number;
  lng: number;
  gu?: string;
  dong?: string;
};

export type AddressSearchResult = {
  ok: boolean;
  candidates: AddressCandidate[];
  /** ok:false 일 때 이유 (services 미로드 등) */
  detail?: string;
};

/** 서울 경계(살짝 여유) — 경계선 밖 근교 주소까지는 받아 준다 */
function inSeoul(lat: number, lng: number): boolean {
  const [[s, w], [n, e]] = SEOUL_BOUNDS;
  const pad = 0.01;
  return lat >= s - pad && lat <= n + pad && lng >= w - pad && lng <= e + pad;
}

/** 주소처럼 보이는 입력인가 — 구역명 검색과 주소 검색을 나누는 기준 */
export function looksLikeAddress(q: string): boolean {
  const t = q.trim();
  if (t.length < 3) return false;
  const hasNumber = /\d/.test(t);
  const hasAddressWord = /(동|가|로|길|번지|번길|아파트|단지|빌라|타워|오피스텔)/.test(t);
  return hasNumber || hasAddressWord;
}

function fromAddressDoc(d: KakaoAddressDoc): AddressCandidate | null {
  const lat = Number(d.y);
  const lng = Number(d.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSeoul(lat, lng)) return null;

  const jibun = d.address?.address_name;
  const road = d.road_address?.address_name;
  const building = d.road_address?.building_name;
  const isRoad = d.address_type === "ROAD" || d.address_type === "ROAD_ADDR";

  const label = (isRoad ? road ?? jibun : jibun ?? road) ?? d.address_name;
  if (!label) return null;
  const detailParts = [jibun && road && jibun !== road ? road : undefined, building || undefined].filter(
    (v): v is string => !!v
  );

  return {
    key: `addr:${label}:${lat.toFixed(6)},${lng.toFixed(6)}`,
    label,
    detail: detailParts.length ? detailParts.join(" · ") : undefined,
    kind: isRoad ? "도로명" : "지번",
    lat,
    lng,
    gu: d.address?.region_2depth_name ?? d.road_address?.region_2depth_name,
    dong: d.address?.region_3depth_name,
  };
}

function fromKeywordDoc(d: KakaoKeywordDoc): AddressCandidate | null {
  const lat = Number(d.y);
  const lng = Number(d.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const where = d.address_name || "";
  if (!where.includes("서울") && !inSeoul(lat, lng)) return null;
  const gu = where.split(" ")[1];
  return {
    key: `place:${d.id ?? d.place_name}:${lat.toFixed(6)},${lng.toFixed(6)}`,
    label: d.place_name,
    detail: [d.road_address_name || where].filter(Boolean).join(" · ") || undefined,
    kind: "장소",
    lat,
    lng,
    gu,
  };
}

function addressSearchOnce(
  sdk: KakaoSDK,
  query: string
): Promise<{ status: string; docs: KakaoAddressDoc[] }> {
  return new Promise((resolve) => {
    try {
      const geocoder = new sdk.maps.services!.Geocoder();
      geocoder.addressSearch(
        query,
        (data, status) => resolve({ status, docs: Array.isArray(data) ? data : [] }),
        { size: 8 }
      );
    } catch {
      resolve({ status: "ERROR", docs: [] });
    }
  });
}

function keywordSearchOnce(sdk: KakaoSDK, query: string): Promise<KakaoKeywordDoc[]> {
  return new Promise((resolve) => {
    try {
      const places = new sdk.maps.services!.Places();
      places.keywordSearch(
        query,
        (data, status) =>
          resolve(status === "OK" && Array.isArray(data) ? (data as KakaoKeywordDoc[]) : []),
        { size: 8, sort: "accuracy" }
      );
    } catch {
      resolve([]);
    }
  });
}

/**
 * 주소 검색 — 서울 후보만 돌려준다.
 *   ① 입력 그대로 지번·도로명 주소 검색
 *   ② 없으면 `서울 ` / `서울특별시 ` 를 붙여 다시
 *   ③ 그래도 없으면 키워드(장소·건물명) 검색
 */
export async function searchAddresses(query: string): Promise<AddressSearchResult> {
  const term = query.trim();
  if (term.length < 2) return { ok: true, candidates: [] };

  const loaded = await loadKakaoServices();
  if (!loaded.ok) return { ok: false, candidates: [], detail: loaded.detail };
  const sdk = loaded.sdk;
  if (!sdk.maps.services) return { ok: false, candidates: [], detail: "services-missing" };

  const out: AddressCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: AddressCandidate | null) => {
    if (!c || seen.has(c.label)) return;
    seen.add(c.label);
    out.push(c);
  };

  const variants = /^서울/.test(term) ? [term] : [term, `서울 ${term}`, `서울특별시 ${term}`];

  for (const v of variants) {
    const { docs } = await addressSearchOnce(sdk, v);
    for (const d of docs) {
      // 구역 판별은 "번지"가 기준이라 지번 주소를 우선한다(도로명 문서도 지번을 함께 준다)
      push(fromAddressDoc(d));
    }
    if (out.length >= 5) break;
  }

  if (out.length === 0) {
    const kwTerm = /^서울/.test(term) ? term : `서울 ${term}`;
    for (const d of await keywordSearchOnce(sdk, kwTerm)) push(fromKeywordDoc(d));
  }

  return { ok: true, candidates: out.slice(0, 8) };
}
