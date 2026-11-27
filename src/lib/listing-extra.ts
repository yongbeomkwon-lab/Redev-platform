// ─────────────────────────────────────────────────────────────────────────────
// 매물의 **표시·광고 명시사항**을 DB 컬럼 없이 보관하는 포장기
//
//  ▶ 왜 필요한가
//    · 공인중개사법 시행규칙 제25조에 따라 매물 카드·목록에는 소재지·거래형태·해당층/총층수·
//      방/욕실 수·방향·입주가능일·주차·사용승인일·관리비·중개사무소 정보를 표시해야 한다.
//    · 그런데 Supabase `public.listings` 테이블에는 이 컬럼들이 없다(운영 DB 에 DDL 을 걸 수 없다).
//      새 컬럼을 넣으려다 실패하면 **매물 저장 자체가 깨진다** — 그래서 컬럼을 늘리지 않는다.
//    · 대신 이미 있는 `note`(text) 끝에 **표식 한 줄**로 함께 저장한다. 관리자 구역의 동의율을
//      `note` 끝 표식으로 보관하는 lib/consent.ts 와 같은 방식이다(운영 DB 에서도 값이 함께 보인다).
//
//  ▶ 저장 모양
//      note 본문
//      ⟦매물정보⟧{"address":"...","lat":37.5,...}
//    · 사람이 DB 를 직접 열어도 한 줄로 읽히고, 표식이 없으면(예전 행) 그대로 통과한다.
//    · 포장/해제는 **DB 행 변환(lib/db-mapping.ts)에서만** 한다 — 화면·JSON·localStorage 는
//      늘 `Listing` 그대로(풀린 상태) 다룬다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing, ListingTradeType } from "@/lib/types";

/** note 끝에 붙는 표식 — 이 문자열 뒤의 한 줄이 JSON 이다 */
export const LISTING_META_MARK = "⟦매물정보⟧";

/** 컬럼 없이 note 로 보관하는 필드들 (모두 Listing 의 선택 필드) */
export type ListingExtra = Pick<
  Listing,
  | "address"
  | "addressRoad"
  | "addressHidden"
  | "pnu"
  | "lat"
  | "lng"
  | "tradeType"
  | "monthlyRent"
  | "floor"
  | "totalFloors"
  | "rooms"
  | "baths"
  | "direction"
  | "moveIn"
  | "parking"
  | "approvalDate"
  | "maintenanceFee"
  | "platAreaSqm"
  | "buildingName"
  | "brokerAddress"
  | "brokerCeo"
>;

/** 포장할 필드 이름 — 목록을 한 곳에 두어 늘리는 곳과 읽는 곳이 어긋나지 않게 한다 */
export const LISTING_EXTRA_KEYS: (keyof ListingExtra)[] = [
  "address",
  "addressRoad",
  "addressHidden",
  "pnu",
  "lat",
  "lng",
  "tradeType",
  "monthlyRent",
  "floor",
  "totalFloors",
  "rooms",
  "baths",
  "direction",
  "moveIn",
  "parking",
  "approvalDate",
  "maintenanceFee",
  "platAreaSqm",
  "buildingName",
  "brokerAddress",
  "brokerCeo",
];

const TRADE_TYPES: ListingTradeType[] = ["매매", "전세", "월세"];

/** 값이 있는 필드만 추린다 — 빈 문자열·0·undefined 는 넣지 않는다(행을 가볍게) */
export function extrasOf(l: Listing): ListingExtra {
  const out: Record<string, unknown> = {};
  for (const key of LISTING_EXTRA_KEYS) {
    const v = l[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    out[key] = typeof v === "string" ? v.trim() : v;
  }
  return out as ListingExtra;
}

/** 표시·광고 항목이 하나라도 있는가 — 없으면 note 를 건드리지 않는다 */
export function hasExtra(l: Listing): boolean {
  return Object.keys(extrasOf(l)).length > 0;
}

/**
 * note + 표시·광고 항목 → DB 에 넣을 note 한 덩어리.
 *   · 항목이 없으면 본문 그대로(없으면 null).
 *   · 본문이 비어 있으면 표식 줄만 남는다.
 */
export function packListingNote(note: string | undefined, l: Listing): string | null {
  const body = (note ?? "").trim();
  if (!hasExtra(l)) return body || null;
  const line = `${LISTING_META_MARK}${JSON.stringify(extrasOf(l))}`;
  return body ? `${body}\n${line}` : line;
}

/** 저장된 note → { 본문, 표시·광고 항목 }. 표식이 없으면 본문만 돌려준다 */
export function unpackListingNote(note: string | undefined): { note?: string; extra: ListingExtra } {
  const raw = note ?? "";
  const at = raw.lastIndexOf(LISTING_META_MARK);
  if (at < 0) return { note: raw.trim() || undefined, extra: {} };

  const body = raw.slice(0, at).replace(/\s+$/, "");
  const jsonText = raw.slice(at + LISTING_META_MARK.length).split("\n")[0].trim();
  let parsed: Record<string, unknown> = {};
  try {
    const v: unknown = JSON.parse(jsonText);
    if (v && typeof v === "object" && !Array.isArray(v)) parsed = v as Record<string, unknown>;
  } catch {
    // 깨진 JSON 이면 본문만 살린다 — 매물 자체는 계속 보여야 한다
    return { note: body.trim() || undefined, extra: {} };
  }
  return { note: body.trim() || undefined, extra: sanitizeExtra(parsed) };
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/**
 * JSON 에서 읽은 값을 화면이 믿을 수 있는 모양으로 다듬는다.
 *   · 좌표는 서울·수도권 범위만 받는다(깨진 값으로 지도가 튀지 않게).
 *   · 거래형태는 세 값만, 숫자 필드는 유한한 수만.
 */
export function sanitizeExtra(raw: Record<string, unknown>): ListingExtra {
  const out: ListingExtra = {};
  const address = str(raw.address);
  if (address) out.address = address;
  const addressRoad = str(raw.addressRoad);
  if (addressRoad) out.addressRoad = addressRoad;
  const addressHidden = bool(raw.addressHidden);
  if (addressHidden !== undefined) out.addressHidden = addressHidden;
  const pnu = str(raw.pnu);
  if (pnu && /^\d{19}$/.test(pnu)) out.pnu = pnu;
  const lat = num(raw.lat);
  const lng = num(raw.lng);
  if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    out.lat = lat;
    out.lng = lng;
  }
  const tradeType = str(raw.tradeType) as ListingTradeType | undefined;
  if (tradeType && TRADE_TYPES.includes(tradeType)) out.tradeType = tradeType;
  for (const key of ["monthlyRent", "rooms", "baths", "platAreaSqm"] as const) {
    const n = num(raw[key]);
    if (n !== undefined && n >= 0) out[key] = n;
  }
  for (const key of [
    "floor",
    "totalFloors",
    "direction",
    "moveIn",
    "parking",
    "approvalDate",
    "maintenanceFee",
    "buildingName",
    "brokerAddress",
    "brokerCeo",
  ] as const) {
    const s = str(raw[key]);
    if (s) out[key] = s;
  }
  return out;
}
