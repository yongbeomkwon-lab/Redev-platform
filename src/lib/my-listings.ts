// ─────────────────────────────────────────────────────────────────────────────
// 내 매물 — 부동산포스(rfine.kr)에 올린 권용범 대표 매물의 **지도 핀 데이터**
//
//  · 원천: `src/data/my-listings.json` (scripts/build-my-listings.py 가 만든다)
//     - 부동산포스 수집 원본(downloads/rfine_seoul_listings_2026-11-18.json) 63건
//     - 좌표는 카카오 지오코딩, 소속 정비구역은 좌표 Point-in-Polygon + 매물설명 대조
//  · DB(public.listings)에는 62건이 올라가 있다 — 상도23 다원씨앤아이 404호는 이미
//    `verified-listings.json` 에 검증 매물로 있어 중복 등록하지 않았다(핀으로는 보인다).
//  · 「내 매물만 보기」는 이 파일을 핀의 단일 원천으로 쓰고, 매물 목록(/listings)·구역 배지는
//    `isMyListing()` 으로 같은 기준(전화번호·id 접두)을 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import raw from "@/data/my-listings.json";
import type { MyListingPin } from "@/components/map/props";
import type { Listing } from "@/lib/types";
import { listingTradeType } from "@/lib/types";
import { formatMan } from "@/lib/format";
import { eokShort, toPyeong } from "@/lib/molit";

type RawFile = {
  metadata: {
    title: string;
    asOf: string;
    count: number;
    owner: string;
    ownerPhone: string;
    source: string;
    geocoding: string;
    note: string;
  };
  listings: Record<string, unknown>[];
};

const file = raw as unknown as RawFile;

/** 내 매물 대표 전화번호 — DB·검증 매물의 `brokerPhone` 과 같은 값 */
export const MY_PHONE = "010-2758-5292";
const PHONE_DIGITS = MY_PHONE.replace(/\D/g, "");

/** 내 매물 id 접두 — DB 에 올린 내 매물은 모두 `rfine-<부동산포스 매물번호>` */
export const MY_LISTING_ID_PREFIX = "rfine-";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const strOrEmpty = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 지도 핀 63건 — 좌표가 없는 항목은 버린다(핀을 찍을 수 없으므로) */
export const MY_LISTINGS: MyListingPin[] = (file.listings ?? [])
  .map((r) => {
    const lat = numOrNull(r.lat);
    const lng = numOrNull(r.lng);
    const id = str(r.id);
    if (!id || lat === null || lng === null) return null;
    return {
      id,
      rfineNo: strOrEmpty(r.rfineNo),
      zoneId: str(r.zoneId) ?? null,
      zoneName: str(r.zoneName) ?? null,
      gu: strOrEmpty(r.gu),
      dong: strOrEmpty(r.dong),
      jibun: strOrEmpty(r.jibun),
      address: strOrEmpty(r.address),
      jibunAddress: strOrEmpty(r.jibunAddress),
      buildingName: strOrEmpty(r.buildingName),
      propertyType: strOrEmpty(r.propertyType),
      dealType: strOrEmpty(r.dealType),
      priceLabel: strOrEmpty(r.priceLabel),
      priceText: strOrEmpty(r.priceText),
      areaLabel: strOrEmpty(r.areaLabel),
      floor: strOrEmpty(r.floor),
      feature: strOrEmpty(r.feature),
      detailUrl: strOrEmpty(r.detailUrl),
      expiresAt: strOrEmpty(r.expiresAt),
      geoPrecision: strOrEmpty(r.geoPrecision),
      duplicateOf: str(r.duplicateOf) ?? null,
      lat,
      lng,
    } satisfies MyListingPin;
  })
  .filter((p): p is MyListingPin => p !== null);

/** 내 매물 총 건수(핀 기준) — 토글 버튼의 N */
export const MY_LISTINGS_COUNT = MY_LISTINGS.length;

/** 이 파일을 만든 기준일 */
export const MY_LISTINGS_AS_OF = file.metadata?.asOf ?? "";

/** 내 매물의 정비구역 id 집합 — 「내 매물만 보기」에서 남길 구역 */
export const MY_LISTING_ZONE_IDS = new Set(
  MY_LISTINGS.map((p) => p.zoneId).filter((id): id is string => !!id)
);

/**
 * 이 매물이 내가 올린 매물인가.
 *   · `/register` 로 올린 내 매물은 id 접두 `rfine-`, 연락처가 내 번호다
 *   · 검증 매물(상도23 다원씨앤아이)도 연락처가 같아 함께 잡힌다
 *   · 샘플 매물(김중개·박중개 …)은 번호가 달라 걸리지 않는다
 */
export function isMyListing(l: { id?: string; brokerPhone?: string }): boolean {
  if (l.id?.startsWith(MY_LISTING_ID_PREFIX)) return true;
  const digits = (l.brokerPhone ?? "").replace(/\D/g, "");
  return digits !== "" && digits === PHONE_DIGITS;
}

/**
 * `/register` 로 등록한 매물(공용 DB·이 브라우저 저장분)을 **지도 핀**으로 바꾼다.
 *   · 2026-11-27 제보: 등록해도 「내 매물만 보기」에 정적 63건만 떠서 새 매물이 지도에 안 나왔다.
 *     그래서 등록 매물을 같은 핀 모양(가격표·주소·면적)으로 바꿔 63건 뒤에 함께 찍는다.
 *   · 좌표는 매물에 저장된 주소 좌표(lat·lng)를 먼저 쓰고, 없으면 소속 구역 중심을 쓴다
 *     (주소 없이 구역만 고른 매물도 지도에서 사라지지 않게).
 *   · `rfineNo`·`detailUrl` 은 부동산포스 전용이라 비워 둔다 — 핀 카드가 '직접 등록'으로 보여 준다.
 */
export function myPinFromListing(l: Listing, fallbackCenter?: [number, number] | null): MyListingPin | null {
  const lat = typeof l.lat === "number" && Number.isFinite(l.lat) ? l.lat : fallbackCenter?.[0];
  const lng = typeof l.lng === "number" && Number.isFinite(l.lng) ? l.lng : fallbackCenter?.[1];
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const trade = listingTradeType(l);
  const priceLabel =
    trade === "전세"
      ? `전 ${eokShort(l.salePrice)}`
      : trade === "월세"
        ? `월 ${eokShort(l.salePrice)}${l.monthlyRent && l.monthlyRent > 0 ? `/${l.monthlyRent.toLocaleString()}` : ""}`
        : `매 ${eokShort(l.salePrice)}`;
  const priceText =
    trade === "전세"
      ? `전세 ${formatMan(l.salePrice)}`
      : trade === "월세"
        ? `보증금 ${formatMan(l.salePrice)} / 월 ${formatMan(l.monthlyRent ?? 0)}`
        : `매매가 ${formatMan(l.salePrice)}`;
  const area = typeof l.exclusiveAreaSqm === "number" && l.exclusiveAreaSqm > 0 ? l.exclusiveAreaSqm : null;
  const areaLabel = area !== null ? `전 ${area}㎡·${toPyeong(area)}평` : "";

  return {
    id: l.id,
    rfineNo: "",
    zoneId: l.zoneId || null,
    zoneName: l.zoneName ?? null,
    gu: l.gu ?? "",
    dong: "",
    jibun: "",
    address: (l.address ?? "").trim(),
    jibunAddress: (l.addressRoad ?? l.address ?? "").trim(),
    buildingName: (l.buildingName ?? "").trim(),
    propertyType: (l.propertyType ?? l.unitType ?? "매물").trim(),
    dealType: trade,
    priceLabel,
    priceText,
    areaLabel,
    floor: (l.floor ?? "").trim(),
    feature: (l.description ?? "").trim(),
    detailUrl: "",
    expiresAt: "",
    geoPrecision: typeof l.lat === "number" && typeof l.lng === "number" ? "주소" : "구역중심",
    duplicateOf: null,
    lat,
    lng,
  };
}

/** 구역 id 로 내 매물 핀을 고른다(구역 패널에서 쓸 때) */
export function myPinsInZone(zoneId?: string): MyListingPin[] {
  if (!zoneId) return [];
  return MY_LISTINGS.filter((p) => p.zoneId === zoneId);
}

/** 내 매물인 매물 목록에서 건수 — /listings 필터 칩에 병기 */
export function countMyListings<T extends { id?: string; brokerPhone?: string }>(list: T[]): number {
  return list.filter(isMyListing).length;
}
