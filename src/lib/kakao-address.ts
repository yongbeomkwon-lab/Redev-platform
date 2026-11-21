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
  type KakaoCoordDoc,
  type KakaoKeywordDoc,
  type KakaoRegionDoc,
  type KakaoSDK,
} from "@/components/map/kakao-loader";
import { SEOUL_BOUNDS } from "@/components/map/props";
import { SEOUL_LEGAL_DONGS } from "@/lib/seoul-legal-dongs";

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
 * 좌표 → **법정동 이름** (예: 상도동).
 *   · 국토부 실거래가는 법정동(umdNm)으로만 조회할 수 있어, 구역 이름에 동이 없을 때
 *     구역 중심 좌표로 법정동을 알아낸다.
 *   · 카카오 services SDK 가 없거나(키·도메인 문제) 결과가 구와 다르면 null.
 *   · 좌표별 결과는 메모리 캐시에 둔다(같은 구역을 다시 열어도 재호출하지 않는다).
 */
export async function legalDongAt(lat: number, lng: number, gu?: string): Promise<string | null> {
  return legalDongAtPoint(lat, lng, gu);
}

/** 역지오코딩 결과 캐시 — 좌표를 소수 5자리(≈1m)로 반올림해 키로 쓴다 */
const dongAtCache = new Map<string, string | null>();

/**
 * 좌표 → 법정동 이름 ("성수동1가"처럼 '가'로 끝나는 동도 그대로 돌려준다).
 *   · 구역이 걸치는 법정동을 찾을 때 표본점마다 부른다.
 *   · 같은 구의 법정동 목록(SEOUL_LEGAL_DONGS)에 있는 이름만 받는다 — 행정동(상도제1동)이나
 *     다른 구 결과를 걸러내기 위해서다.
 */
export async function legalDongAtPoint(lat: number, lng: number, gu?: string): Promise<string | null> {
  const ck = `${gu ?? ""}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  if (dongAtCache.has(ck)) return dongAtCache.get(ck) ?? null;
  const loaded = await loadKakaoServices();
  // SDK 가 아직(또는 영영) 안 뜨는 경우는 캐시하지 않는다 — 나중에 키·도메인이 풀리면 다시 시도해야 한다
  if (!loaded.ok || !loaded.sdk.maps.services) return null;
  const sdk = loaded.sdk;
  const doc = await new Promise<KakaoRegionDoc | null>((resolve) => {
    try {
      const geocoder = new sdk.maps.services!.Geocoder();
      geocoder.coord2RegionCode(
        lng,
        lat,
        (data, status) => {
          if (status !== "OK" || !Array.isArray(data)) return resolve(null);
          // 법정동(B) 우선 — 행정동(H)은 '상도제1동'처럼 법정동과 이름이 다르다
          resolve(data.find((d) => d.region_type === "B") ?? data[0] ?? null);
        }
      );
    } catch {
      resolve(null);
    }
  });
  const found = doc ? nameFromRegionDoc(doc, gu) : null;
  dongAtCache.set(ck, found);
  return found;
}

function nameFromRegionDoc(doc: KakaoRegionDoc, gu?: string): string | null {
  if (gu && doc.region_2depth_name && doc.region_2depth_name !== gu) return null;
  const name = (doc.region_3depth_name ?? "").trim();
  if (!name) return null;
  const known = gu ? SEOUL_LEGAL_DONGS[gu] : undefined;
  if (known) return known.includes(name) ? name : null;
  return name.endsWith("동") || name.endsWith("가") ? name : null;
}

// ── 지번 → 좌표 (실거래 구역 내 판정용) ─────────────────────────────────────

export type GeoPoint = { lat: number; lng: number };

const SESSION_KEY = "redev:jibun-geo:v1";
const jibunCache = new Map<string, GeoPoint | null>();
const jibunInflight = new Map<string, Promise<GeoPoint | null>>();
let sessionLoaded = false;

function loadSessionCache() {
  if (sessionLoaded || typeof window === "undefined") return;
  sessionLoaded = true;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, [number, number] | null>;
    for (const [k, v] of Object.entries(obj)) {
      jibunCache.set(k, Array.isArray(v) ? { lat: v[0], lng: v[1] } : null);
    }
  } catch {
    /* 저장소를 못 쓰면 메모리 캐시만 쓴다 */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * sessionStorage 쓰기는 1.5초에 한 번으로 묶는다 — 수백 지번을 연달아 판정할 때
 * 매 건마다 전체 맵을 직렬화하면 느려진다.
 */
function saveSessionCacheSoon() {
  if (typeof window === "undefined" || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj: Record<string, [number, number] | null> = {};
      for (const [k, v] of jibunCache) obj[k] = v ? [v.lat, v.lng] : null;
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
    } catch {
      /* 용량·차단 문제는 무시 — 다음 열람에서 다시 지오코딩하면 된다 */
    }
  }, 1500);
}

/**
 * `서울특별시 {구} {동} {지번}` → 좌표.
 *   · 국토부 실거래가에는 좌표가 없어 구역 경계 안팎을 계산하려면 지번 주소로 되짚어야 한다.
 *   · 결과(없음 포함)는 메모리 + sessionStorage 에 남겨 같은 지번을 다시 부르지 않는다.
 *   · 주소 검색이 ZERO_RESULT 면 `서울 {구} {동} {지번}`으로 한 번 더 시도한다.
 */
export async function geocodeJibun(gu: string, dong: string, jibun: string): Promise<GeoPoint | null> {
  const key = `${gu}|${dong}|${jibun}`;
  loadSessionCache();
  if (jibunCache.has(key)) return jibunCache.get(key) ?? null;
  const running = jibunInflight.get(key);
  if (running) return running;

  const job = (async (): Promise<GeoPoint | null> => {
    const loaded = await loadKakaoServices();
    if (!loaded.ok || !loaded.sdk.maps.services) return null;
    const sdk = loaded.sdk;
    for (const q of [`서울특별시 ${gu} ${dong} ${jibun}`, `서울 ${gu} ${dong} ${jibun}`]) {
      const { status, docs } = await addressSearchOnce(sdk, q);
      if (status !== "OK" || !docs.length) continue;
      for (const d of docs) {
        const lat = Number(d.y);
        const lng = Number(d.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        // 다른 구로 떨어지는 결과는 버린다(동 이름만 같고 구가 다른 경우)
        const rGu = d.address?.region_2depth_name;
        if (rGu && rGu !== gu) continue;
        if (!inSeoul(lat, lng)) continue;
        return { lat, lng };
      }
    }
    return null;
  })();

  jibunInflight.set(key, job);
  const point = await job;
  jibunInflight.delete(key);
  jibunCache.set(key, point);
  saveSessionCacheSoon();
  return point;
}

/** 이미 지오코딩해 둔 지번인가 — 진행률 표시에서 다시 세지 않으려고 */
export function hasCachedJibun(gu: string, dong: string, jibun: string): boolean {
  loadSessionCache();
  return jibunCache.has(`${gu}|${dong}|${jibun}`);
}

// ── 좌표 → 주소 (지도에서 찍은 지번) ─────────────────────────────────────────

export type ReverseAddress = {
  /** 자치구 (예: 동작구) */
  gu: string | null;
  /** 법정동 (예: 상도동) — 국토부 조회의 umdNm */
  dong: string | null;
  /** 지번 (예: 209-12). 산(山) 지번은 `산12-3` */
  jibun: string | null;
  /** 지번 주소 전체 (예: 서울특별시 동작구 상도동 209-12) */
  jibunAddress: string | null;
  /** 도로명 주소 전체 (예: 서울특별시 동작구 장승배기로 1) */
  roadAddress: string | null;
  /** 건물명 (예: 상도23구역 다원씨앤아이) */
  buildingName: string | null;
};

/**
 * 좌표 → 지번·도로명 주소 (kakao Geocoder.coord2Address).
 *   · 지도에서 임의의 지점을 찍었을 때 "어느 동 몇 번지"인지 바로 알려 준다.
 *   · 좌표 캐시는 두지 않는다 — 클릭한 자리가 매번 다르다.
 *   · SDK services 가 없거나(키·도메인 문제) 결과가 없으면 null.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseAddress | null> {
  const loaded = await loadKakaoServices();
  if (!loaded.ok || !loaded.sdk.maps.services) return null;
  const sdk = loaded.sdk;
  const doc = await new Promise<KakaoCoordDoc | null>((resolve) => {
    try {
      const geocoder = new sdk.maps.services!.Geocoder();
      geocoder.coord2Address(
        lng,
        lat,
        (data, status) => {
          if (status !== "OK" || !Array.isArray(data) || !data.length) return resolve(null);
          resolve(data[0] ?? null);
        }
      );
    } catch {
      resolve(null);
    }
  });
  if (!doc) return null;

  const region = doc.address;
  const road = doc.road_address;
  const bonbun = region?.main_address_no?.trim() ?? "";
  const bubun = region?.sub_address_no?.trim() ?? "";
  const jibun = bonbun ? (bubun && Number(bubun) > 0 ? `${bonbun}-${bubun}` : bonbun) : null;
  const dong = (region?.region_3depth_name ?? road?.region_3depth_name ?? "").trim() || null;

  return {
    gu: (region?.region_2depth_name ?? road?.region_2depth_name ?? "").trim() || null,
    dong,
    jibun: jibun ? (region?.mountain_yn === "Y" ? `산${jibun}` : jibun) : null,
    jibunAddress: region?.address_name?.trim() || null,
    roadAddress: road?.address_name?.trim() || null,
    buildingName: road?.building_name?.trim() || null,
  };
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
