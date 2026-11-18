// ─────────────────────────────────────────────────────────────────────────────
// DB 행(Supabase · PostgREST) ↔ 화면 데이터 변환 — 서버·클라이언트 공용 순수 모듈
//
//   · DB 컬럼은 snake_case, 화면 데이터는 camelCase 다. 변환은 이 파일 한 곳에서만 한다.
//     - public.listings    : `Listing`(매물) 1건 = 1행
//     - public.custom_zones: 관리자 구역 1건 = 1행 (ring_lat_lng 는 jsonb 배열)
//   · leaflet·kakao·React·process.env 를 쓰지 않는다 — 어디서 import 해도 안전하다.
//   · 값이 비었거나 깨진 행은 null 로 버려 화면이 죽지 않게 한다(예전과 같은 원칙).
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing } from "@/lib/types";

const strOf = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const numOf = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const boolOf = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** 'YYYY-MM-DD' / ISO 문자열 → DB timestamptz 에 넣을 ISO 문자열. 못 읽으면 undefined */
const toIso = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

// ─── 매물 (public.listings) ──────────────────────────────────────────────────

/** DB 행 → Listing. 구역 id·매매가가 없으면 매물로 성립하지 않는다 */
export function listingFromRow(row: Record<string, unknown>): Listing | null {
  const zoneId = strOf(row.zone_id);
  const salePrice = numOf(row.sale_price);
  if (!zoneId || salePrice === undefined) return null;
  const createdAt = strOf(row.created_at);
  return {
    id: strOf(row.id) ?? `db-${zoneId}-${salePrice}`,
    zoneId,
    ...(strOf(row.zone_name) ? { zoneName: strOf(row.zone_name) } : {}),
    ...(strOf(row.gu) ? { gu: strOf(row.gu) } : {}),
    ...(strOf(row.property_type) ? { propertyType: strOf(row.property_type) } : {}),
    brokerName: strOf(row.broker_name) ?? "미기재",
    brokerAgency: strOf(row.broker_agency) ?? "미기재",
    brokerPhone: strOf(row.broker_phone) ?? "문의 요청 시 안내",
    ...(strOf(row.broker_license) ? { brokerLicense: strOf(row.broker_license) } : {}),
    unitType: strOf(row.unit_type) ?? "일반매물",
    salePrice,
    ...(numOf(row.appraised_value) !== undefined ? { appraisedValue: numOf(row.appraised_value) } : {}),
    ...(boolOf(row.transfer_fee_included) !== undefined
      ? { transferFeeIncluded: boolOf(row.transfer_fee_included) }
      : {}),
    ...(numOf(row.transfer_fee) !== undefined ? { transferFee: numOf(row.transfer_fee) } : {}),
    ...(numOf(row.deposit) !== undefined ? { deposit: numOf(row.deposit) } : {}),
    ...(numOf(row.expected_jeonse) !== undefined ? { expectedJeonse: numOf(row.expected_jeonse) } : {}),
    ...(numOf(row.expected_additional_cost) !== undefined
      ? { expectedAdditionalCost: numOf(row.expected_additional_cost) }
      : {}),
    ...(numOf(row.exclusive_area_sqm) !== undefined ? { exclusiveAreaSqm: numOf(row.exclusive_area_sqm) } : {}),
    ...(numOf(row.land_share_sqm) !== undefined ? { landShareSqm: numOf(row.land_share_sqm) } : {}),
    ...(boolOf(row.lease_operator_only) !== undefined ? { leaseOperatorOnly: boolOf(row.lease_operator_only) } : {}),
    ...(boolOf(row.land_permit_required) !== undefined
      ? { landPermitRequired: boolOf(row.land_permit_required) }
      : {}),
    ...(strOf(row.note) ? { note: strOf(row.note) } : {}),
    verified: row.verified === true,
    // 화면·정식 JSON 은 날짜만 쓴다('YYYY-MM-DD')
    ...(createdAt ? { createdAt: createdAt.slice(0, 10) } : {}),
  };
}

/**
 * Listing → DB 행.
 *   · `premium` 은 DB 컬럼이 없다(매매가 − 감정가로 언제든 다시 계산된다) — 저장하지 않는다.
 *   · createdAt 이 없으면 키를 빼서 DB 기본값(now())을 쓰게 한다.
 */
export function listingToRow(l: Listing): Record<string, unknown> {
  const createdAt = toIso(l.createdAt);
  const deposit = l.deposit ?? l.expectedJeonse;
  return {
    id: l.id,
    zone_id: l.zoneId,
    zone_name: l.zoneName ?? null,
    gu: l.gu ?? null,
    broker_name: l.brokerName,
    broker_agency: l.brokerAgency,
    broker_phone: l.brokerPhone,
    broker_license: l.brokerLicense ?? null,
    property_type: l.propertyType ?? null,
    unit_type: l.unitType,
    sale_price: l.salePrice,
    deposit: deposit ?? 0,
    appraised_value: l.appraisedValue ?? 0,
    transfer_fee_included: l.transferFeeIncluded === true,
    transfer_fee: l.transferFee ?? 0,
    expected_jeonse: deposit ?? 0,
    expected_additional_cost: l.expectedAdditionalCost ?? 0,
    exclusive_area_sqm: l.exclusiveAreaSqm ?? null,
    land_share_sqm: l.landShareSqm ?? null,
    lease_operator_only: l.leaseOperatorOnly === true,
    land_permit_required: l.landPermitRequired === true,
    verified: l.verified === true,
    note: l.note ?? null,
    ...(createdAt ? { created_at: createdAt } : {}),
  };
}

// ─── 관리자 구역 (public.custom_zones) ───────────────────────────────────────

/** 화면의 관리자 구역 — custom-zones.ts 의 `CustomZone` 과 같은 모양(사업유형만 string) */
export type ZoneRecord = {
  id: string;
  name: string;
  type: string;
  stage: string;
  gu: string;
  note: string;
  /** 외곽 링 — [위도, 경도] (첫 점을 끝에 반복하지 않는다) */
  ring: [number, number][];
  areaSqm: number;
  replacesZoneId?: string;
  replacesName?: string;
  replacesArea?: number;
  createdAt: string;
  updatedAt: string;
};

/** 사업유형 → 서울시 사업유형 소분류(kind). 민간도심복합만 소분류 이름이 유형에 들어 있다 */
export const ZONE_TYPE_KIND: Partial<Record<string, string>> = {
  "민간도심복합(성장거점형)": "민간도심복합개발(성장거점형)",
  "민간도심복합(주거중심형)": "민간도심복합개발(주거중심형)",
};

const isFinitePair = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length === 2 &&
  Number.isFinite(p[0] as number) &&
  Number.isFinite(p[1] as number) &&
  Math.abs(p[0] as number) <= 90 &&
  Math.abs(p[1] as number) <= 180;

/** 구면 다각형 면적(㎡) — DB 에 area 가 비어 있는 예전 행의 값을 되살린다 */
export function ringAreaSqm(ring: [number, number][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const R = 6378137;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % n];
    let dLng = lng2 - lng1;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    sum += dLng * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * R * R) / 2);
}

/** 필드 하나를 snake_case(DB 행) 또는 camelCase(API 응답) 어느 쪽에서도 읽는다 */
const pickOf = (row: Record<string, unknown>, snake: string, camel: string): unknown =>
  row[snake] !== undefined && row[snake] !== null ? row[snake] : row[camel];

/**
 * DB 행(**또는 `/api/custom-zones` 응답 항목**) → 관리자 구역.
 *   · 서버 라우트는 이미 화면 모양(camelCase·ring)으로 바꿔 내려주므로, 두 모양을 모두 받는다.
 *   · id·name·링(3점 이상)이 없으면 버린다.
 */
export function zoneFromRow(row: Record<string, unknown>): ZoneRecord | null {
  const id = strOf(row.id);
  const name = strOf(row.name);
  const ringRaw = Array.isArray(row.ring_lat_lng) ? row.ring_lat_lng : Array.isArray(row.ring) ? row.ring : null;
  if (!id || !name || !ringRaw) return null;
  const ring = ringRaw.filter(isFinitePair);
  if (ring.length < 3) return null;
  const area = numOf(row.area) ?? numOf(row.areaSqm);
  const createdAt = strOf(row.created_at) ?? strOf(row.createdAt) ?? new Date().toISOString();
  const updatedAt = strOf(row.updated_at) ?? strOf(row.updatedAt) ?? createdAt;
  const replacesZoneId = strOf(pickOf(row, "replaces_zone_id", "replacesZoneId"));
  const replacesName = strOf(pickOf(row, "replaces_name", "replacesName"));
  return {
    id,
    name,
    type: strOf(row.type) ?? "기타",
    stage: strOf(row.stage) ?? "추진준비",
    gu: strOf(row.gu) ?? "",
    note: strOf(row.note) ?? "",
    ring,
    areaSqm: area && area > 0 ? area : Math.round(ringAreaSqm(ring)),
    ...(replacesZoneId ? { replacesZoneId } : {}),
    ...(replacesName ? { replacesName } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * 관리자 구역 → DB 행.
 *   · `replacesArea`(고시면적)는 DB 컬럼이 없다 — 이 브라우저의 localStorage 에만 남는다.
 *   · kind 는 유형에서 계산해 넣는다(내보내기 GeoJSON 과 같은 값).
 */
export function zoneToRow(z: ZoneRecord): Record<string, unknown> {
  return {
    id: z.id,
    name: z.name,
    type: z.type,
    kind: z.replacesZoneId ? "관리자 경계 보정" : (ZONE_TYPE_KIND[z.type] ?? "관리자 직접 입력"),
    stage: z.stage,
    gu: z.gu,
    area: Math.round(z.areaSqm),
    geom: "가상경계",
    note: z.note,
    replaces_zone_id: z.replacesZoneId ?? null,
    replaces_name: z.replacesName ?? null,
    ring_lat_lng: z.ring.map(([lat, lng]) => [Number(lat.toFixed(7)), Number(lng.toFixed(7))]),
    ...(toIso(z.createdAt) ? { created_at: toIso(z.createdAt) } : {}),
    ...(toIso(z.updatedAt) ? { updated_at: toIso(z.updatedAt) } : {}),
  };
}
