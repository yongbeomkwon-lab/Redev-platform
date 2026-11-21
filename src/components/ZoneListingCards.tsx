"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneListingCards — 구역 상세 패널에 붙는 「검증 매물 N건」 카드
//
//  · 메인 지도에서 구역을 고르면(서울시 고시 구역 · 대표 구역 모두) 이 카드가 맨 위에 붙는다.
//  · 실무에서 먼저 보는 값 순서로 적는다: 매매가 → 기보증금 → **초기투자금**(매매가−기보증금)
//    → 임대사업자 승계/토허제 조건 → 특징.
//  · 매물이 없으면 카드 자체를 그리지 않는다(빈 상자를 늘어놓지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { calcInitialInvestment, listingDeposit } from "@/lib/types";
import { formatMan } from "@/lib/format";
import { isMyListing } from "@/lib/my-listings";
import { Badge } from "./Badges";
import Icon from "./Icon";

/** 임대사업자 승계 · 토허제(실거주) 조건 배지 — 매물 카드·목록에서 같은 말을 쓴다 */
export function ListingConditionBadges({ listing }: { listing: Listing }) {
  // 부동산포스에서 옮긴 내 매물은 토지거래허가·실거주 조건을 함께 받아 오지 않았다
  // — '없음'이라고 단정하지 않고 '확인 필요'로 보여 준다(계약 전 확인 사항).
  const permitKnown = !isMyListing(listing);
  return (
    <>
      {listing.verified && <Badge tone="green">검증</Badge>}
      {listing.leaseOperatorOnly && <Badge tone="amber">임대사업자 승계 필수</Badge>}
      {listing.landPermitRequired ? (
        <Badge tone="red">토허제 · 실거주 의무</Badge>
      ) : permitKnown ? (
        <Badge tone="blue">실거주·토허제 없음</Badge>
      ) : (
        <Badge tone="slate">토허제·실거주 확인 필요</Badge>
      )}
    </>
  );
}

export function ZoneListingCards({
  listings,
  zoneId,
  zoneName,
}: {
  listings: Listing[];
  zoneId: string;
  zoneName: string;
}) {
  if (listings.length === 0) return null;
  return (
    <div
      data-testid="zone-listing-card"
      className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span aria-hidden className="text-slate-400">
          <Icon name="home" size={14} />
        </span>
        <b className="text-xs font-bold text-amber-900">검증 매물 {listings.length}건</b>
        <span className="truncate text-[10px] text-amber-800/80">{zoneName}</span>
        <Link
          href={`/register?zone=${encodeURIComponent(zoneId)}`}
          data-testid="zone-listing-register-link"
          className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-amber-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-800"
        >
          매물 등록하기
        </Link>
      </div>
      <ul className="space-y-2">
        {listings.map((l) => {
          const deposit = listingDeposit(l);
          return (
            <li
              key={l.id}
              data-testid="zone-listing-item"
              className="rounded-lg border border-amber-200 bg-white p-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <b className="text-sm font-extrabold text-slate-900">{formatMan(l.salePrice)}</b>
                <span className="text-[11px] font-medium text-slate-600">
                  {l.propertyType ? `${l.propertyType} · ` : ""}
                  {l.unitType}
                </span>
                {l.exclusiveAreaSqm ? (
                  <span className="text-[10px] text-slate-500">
                    전용 {l.exclusiveAreaSqm}㎡ ({(l.exclusiveAreaSqm / 3.305785).toFixed(1)}평)
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                {deposit > 0 && <span>기보증금 {formatMan(deposit)}</span>}
                <span className="font-semibold text-slate-900">
                  초기투자금 {formatMan(calcInitialInvestment(l))}
                </span>
                {l.landShareSqm ? <span>대지지분 {l.landShareSqm}㎡</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <ListingConditionBadges listing={l} />
              </div>
              {l.note && (
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-slate-600">{l.note}</p>
              )}
              <p className="mt-1 text-[10px] text-slate-400">
                {l.brokerAgency}
                {l.brokerName ? ` · ${l.brokerName}` : ""}
                {l.brokerPhone ? ` · ${l.brokerPhone}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
