"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 매물 저장소 — 정식 검증 매물 + 샘플 매물 + 이 브라우저에서 등록한 매물
//
//  ▶ 왜 세 곳을 합치나
//    · `src/data/verified-listings.json` : 중개사가 확인한 **정식 검증 매물**(배포본에 함께 나간다).
//    · `src/data/sample.ts` LISTINGS     : 첫 화면용 샘플. 예전 링크·화면이 그대로 이어지도록 남긴다.
//    · `localStorage(redev.customListings.v1)` : `/register` 에서 바로 등록한 매물. 서버가 없으므로
//      **이 브라우저에만** 저장된다(새로고침해도 유지, 다른 기기와는 공유되지 않음).
//  ▶ 화면(메인 지도 `/` · 매물 목록 `/listings`)은 언제나 `allListings()` 하나만 본다.
//  ▶ 내보내기(JSON 다운로드·복사)는 `verified-listings.json` 과 **같은 모양**으로 만든다 —
//    대표님이 그 파일을 받아 `src/data/verified-listings.json` 에 그대로 넣으면 정식 매물이 된다.
//
//  leaflet·kakao 를 임포트하지 않는 순수 모듈(지도·페이지 어디서든 안전).
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing, Zone } from "@/lib/types";
import { LISTINGS, ZONES } from "@/data/sample";
import verifiedFile from "@/data/verified-listings.json";

export const CUSTOM_LISTINGS_STORAGE_KEY = "redev.customListings.v1";
/** 매물이 바뀌었음을 같은 화면 안에 알리는 이벤트(등록 직후 지도·목록 갱신용) */
export const LISTINGS_CHANGED_EVENT = "redev:listings-changed";

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/**
 * 저장된/불러온 JSON 한 건 → Listing.
 *   · 구역(zoneId)과 매매가가 없으면 매물로 성립하지 않는다(깨진 항목은 버린다 — 화면이 죽지 않게).
 *   · 중개사 정보가 비어 있으면 "미기재"로 채운다(검증 매물 JSON 이 짧아도 목록이 깨지지 않게).
 */
export function normalizeListing(raw: unknown): Listing | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Partial<Listing> & Record<string, unknown>;
  const zoneId = str(l.zoneId);
  const salePrice = num(l.salePrice);
  if (!zoneId || salePrice === undefined) return null;
  const deposit = num(l.deposit);
  const expectedJeonse = num(l.expectedJeonse);
  return {
    id: str(l.id) ?? newListingId(),
    zoneId,
    ...(str(l.zoneName) ? { zoneName: str(l.zoneName) } : {}),
    ...(str(l.gu) ? { gu: str(l.gu) } : {}),
    ...(str(l.propertyType) ? { propertyType: str(l.propertyType) } : {}),
    brokerName: str(l.brokerName) ?? "미기재",
    brokerAgency: str(l.brokerAgency) ?? "미기재",
    brokerPhone: str(l.brokerPhone) ?? "문의 요청 시 안내",
    ...(str(l.brokerLicense) ? { brokerLicense: str(l.brokerLicense) } : {}),
    unitType: str(l.unitType) ?? "일반매물",
    salePrice,
    ...(num(l.appraisedValue) !== undefined ? { appraisedValue: num(l.appraisedValue) } : {}),
    ...(num(l.premium) !== undefined ? { premium: num(l.premium) } : {}),
    ...(bool(l.transferFeeIncluded) !== undefined ? { transferFeeIncluded: bool(l.transferFeeIncluded) } : {}),
    ...(num(l.transferFee) !== undefined ? { transferFee: num(l.transferFee) } : {}),
    ...(deposit !== undefined ? { deposit } : {}),
    ...(expectedJeonse !== undefined ? { expectedJeonse } : {}),
    ...(num(l.expectedAdditionalCost) !== undefined ? { expectedAdditionalCost: num(l.expectedAdditionalCost) } : {}),
    ...(num(l.exclusiveAreaSqm) !== undefined ? { exclusiveAreaSqm: num(l.exclusiveAreaSqm) } : {}),
    ...(num(l.landShareSqm) !== undefined ? { landShareSqm: num(l.landShareSqm) } : {}),
    ...(bool(l.leaseOperatorOnly) !== undefined ? { leaseOperatorOnly: bool(l.leaseOperatorOnly) } : {}),
    ...(bool(l.landPermitRequired) !== undefined ? { landPermitRequired: bool(l.landPermitRequired) } : {}),
    ...(str(l.note) ? { note: str(l.note) } : {}),
    verified: l.verified === true,
    ...(str(l.createdAt) ? { createdAt: str(l.createdAt) } : {}),
  };
}

/** 정식 검증 매물 (src/data/verified-listings.json) */
export function verifiedListings(): Listing[] {
  const raw = (verifiedFile as { listings?: unknown[] }).listings ?? [];
  return raw.map(normalizeListing).filter((l): l is Listing => !!l);
}

/** 이 브라우저에 등록한 매물 — 깨진 항목은 버린다 */
export function parseCustomListings(raw: string | null): Listing[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed as { listings?: unknown[] })?.listings;
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeListing).filter((l): l is Listing => !!l);
  } catch {
    return [];
  }
}

export function loadCustomListings(): Listing[] {
  if (typeof window === "undefined") return [];
  try {
    return parseCustomListings(window.localStorage.getItem(CUSTOM_LISTINGS_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** localStorage 저장 — 실패(용량·사생활 모드)해도 화면은 살아 있게 결과만 돌려준다 */
export function saveCustomListings(list: Listing[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CUSTOM_LISTINGS_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(LISTINGS_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** 등록(같은 id 는 교체) — 저장 성공 여부와 저장된 목록을 돌려준다 */
export function upsertCustomListing(listing: Listing): { ok: boolean; list: Listing[] } {
  const cur = loadCustomListings();
  const i = cur.findIndex((l) => l.id === listing.id);
  const next = i >= 0 ? cur.map((l, k) => (k === i ? listing : l)) : [...cur, listing];
  return { ok: saveCustomListings(next), list: next };
}

/** 삭제 — 지운 뒤의 목록을 돌려준다 */
export function deleteCustomListing(id: string): Listing[] {
  const next = loadCustomListings().filter((l) => l.id !== id);
  saveCustomListings(next);
  return next;
}

export function newListingId(): string {
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 화면이 보는 전체 매물 = 정식 검증 매물 + 샘플 매물 + 이 브라우저 등록 매물.
 * 같은 id 가 두 곳에 있으면 앞의 것을 쓴다(검증 JSON 이 샘플보다 우선).
 */
export function allListings(): Listing[] {
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const l of [...verifiedListings(), ...LISTINGS.map((l) => normalizeListing(l)).filter((l): l is Listing => !!l), ...loadCustomListings()]) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

// ─── 구역 매칭 · 집계 ────────────────────────────────────────────────────────

/** 매물이 이 구역의 것인지 — zoneId 우선, 없으면 구역명으로 맞춘다(옛 저장분·직접 입력) */
export function listingMatchesZone(l: Listing, zoneId?: string, zoneName?: string): boolean {
  if (zoneId && l.zoneId === zoneId) return true;
  // 구역 id 는 데이터 개편(중복 병합·공식명 전환)으로 바뀔 수 있다 — 그때도 매물이 사라지지 않도록
  // 이름(공백 무시)으로 한 번 더 본다. 같은 이름의 구역은 데이터에서 하나로 합쳐져 있다.
  if (zoneName && l.zoneName) return l.zoneName.replace(/\s+/g, "") === zoneName.replace(/\s+/g, "");
  return false;
}

/** 구역별 매물 수 — 지도 배지(`🏠 매물 N`)용. zoneId 기준 */
export function listingCountsByZoneId(list: Listing[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const l of list) m[l.zoneId] = (m[l.zoneId] ?? 0) + 1;
  return m;
}

/** 매물의 구역 이름 — 매물에 적힌 이름 → 샘플 구역 → 서울시 전수 목록 순 */
export function listingZoneName(l: Listing, seoulZones?: { id: string; name: string }[]): string {
  return l.zoneName ?? ZONES.find((z) => z.id === l.zoneId)?.name ?? seoulZones?.find((z) => z.id === l.zoneId)?.name ?? l.zoneId;
}

/** 구역 정보(자치구·구역명)를 매물에 붙인다 — 등록 폼에서 쓴다 */
export function withZoneInfo(l: Listing, zone: { id: string; name: string; gu?: string }): Listing {
  return { ...l, zoneId: zone.id, zoneName: zone.name, ...(zone.gu ? { gu: zone.gu } : {}) };
}

// ─── 내보내기 ────────────────────────────────────────────────────────────────

/** 정식 검증 매물 파일과 같은 모양의 JSON — 이 파일을 verified-listings.json 에 넣으면 정식 매물이 된다 */
export function listingsToJson(list: Listing[]): string {
  return JSON.stringify(
    {
      metadata: {
        source: "리디브 매물 내보내기",
        asOf: new Date().toISOString().slice(0, 10),
        count: list.length,
        note: "이 JSON 을 src/data/verified-listings.json 의 listings 배열에 넣으면 모든 방문자에게 보이는 정식 매물이 됩니다.",
      },
      listings: list,
    },
    null,
    2
  );
}

/** 내려받기 파일 이름 — listings-YYYYMMDD-HHMM.json */
export function listingExportFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `listings-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** 구역 목록에 매물 수를 붙여 돌려준다(대표 구역 목록용) */
export function zonesWithListingCount(list: Listing[], zones: Zone[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const z of zones) m[z.id] = list.filter((l) => listingMatchesZone(l, z.id, z.name)).length;
  return m;
}
