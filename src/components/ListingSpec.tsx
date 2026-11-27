"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ListingSpec — 매물 카드의 **중개대상물 표시·광고 명시사항** 묶음
//
//  · 구역 상세 패널(ZoneListingCards) · 매물 목록(/listings) · 등록 화면 미리보기가
//    같은 부품을 쓴다 — 한 곳을 고치면 세 화면의 법정 표시가 함께 맞는다.
//  · 공인중개사법 시행규칙 제25조 명시사항(소재지·거래형태·해당층/총층수·방/욕실·방향·
//    입주가능일·주차·사용승인일·관리비·중개사무소 정보)을 값이 있는 것만 그린다.
//  · 값이 없는 예전 매물은 아무것도 그리지 않는다(빈 라벨을 늘어놓지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing } from "@/lib/types";
import { listingTradeType } from "@/lib/types";
import { formatMan } from "@/lib/format";
import {
  addressText,
  brokerLegalLines,
  depositLine,
  priceHeadline,
  priceLabel,
  specItems,
  upfrontLabel,
  upfrontValue,
} from "@/lib/listing-fields";

/** 소재지 한 줄 — 비공개면 번지를 뗀 주소가 온다(무엇이 비공개인지 함께 적는다) */
export function ListingAddress({
  listing,
  className = "",
  testId = "listing-address",
}: {
  listing: Listing;
  className?: string;
  testId?: string;
}) {
  const text = addressText(listing);
  if (!text) return null;
  return (
    <span data-testid={testId} className={"inline-flex min-w-0 items-center gap-1 " + className}>
      <span className="truncate">{text}</span>
      {listing.addressHidden && <span className="shrink-0 text-[9px] text-slate-400">번지 비공개</span>}
    </span>
  );
}

/** 명시사항 한 줄 — `매매 · 남향 · 3층/5층 · 방 3 · 욕실 1 · 즉시입주 · 승인 1995-08-10` */
export function ListingSpecLine({ listing, className = "" }: { listing: Listing; className?: string }) {
  const items = specItems(listing);
  if (items.length === 0) return null;
  return (
    <p
      data-testid="listing-spec-line"
      className={"flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] leading-snug text-slate-600 " + className}
    >
      {items.map((v, i) => (
        <span key={`${v}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-slate-300">·</span>}
          <span>{v}</span>
        </span>
      ))}
    </p>
  );
}

/** 가격 한 줄(거래형태 포함) + 기보증금/처음 드는 돈 */
export function ListingPriceLine({
  listing,
  tone = "slate",
}: {
  listing: Listing;
  tone?: "slate" | "amber";
}) {
  const trade = listingTradeType(listing);
  const deposit = depositLine(listing);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <b className={"text-base font-extrabold " + (tone === "amber" ? "text-amber-950" : "text-slate-900")}>
        {priceHeadline(listing)}
      </b>
      {trade === "매매" && <span className="text-[10px] font-medium text-slate-500">{priceLabel(listing)}</span>}
      {deposit && <span className="text-[11px] text-slate-600">{deposit}</span>}
      <span className="text-[11px] text-slate-600">
        {upfrontLabel(listing)} <b className="font-semibold text-slate-900">{formatMan(upfrontValue(listing))}</b>
      </span>
    </div>
  );
}

/**
 * 중개사무소 법정 표시 — 사무소명·등록번호·대표자·소속공인중개사·연락처·소재지.
 *   · 카드에서는 작은 회색 글씨 2~3줄로 붙는다.
 */
export function ListingBrokerLegal({
  listing,
  className = "",
  withAddress = false,
}: {
  listing: Listing;
  className?: string;
  withAddress?: boolean;
}) {
  const lines = brokerLegalLines(listing).filter((line) => withAddress || !line.startsWith("사무소 소재지"));
  if (lines.length === 0) return null;
  return (
    <div data-testid="listing-broker-legal" className={"mt-1 space-y-0.5 text-[10px] leading-snug text-slate-500 " + className}>
      {lines.map((line, i) => (
        <p key={i} className={i === 0 ? "font-medium text-slate-600" : ""}>
          {line}
        </p>
      ))}
    </div>
  );
}
