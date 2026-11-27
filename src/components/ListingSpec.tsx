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
  descriptionText,
  detailItems,
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

/**
 * 건물·거래 상세 한 줄 — 공급면적·현관구조·난방방식·엘리베이터·융자금·기월세·이주비·위반건축물.
 *   · 법정 명시사항(ListingSpecLine)과 따로 두어, 명시사항 줄이 길어지지 않게 한다.
 */
export function ListingDetailLine({ listing, className = "" }: { listing: Listing; className?: string }) {
  const items = detailItems(listing);
  if (items.length === 0) return null;
  return (
    <p
      data-testid="listing-detail-line"
      className={"flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] leading-snug text-slate-500 " + className}
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

/**
 * 상세 설명 — 길어서 카드에서는 접어 둔다(펼치면 전문).
 *   · 부동산포스 상세설명처럼 인사·푸터가 들어간 여러 줄 글이라 줄바꿈을 살린다.
 */
export function ListingDescription({ listing, className = "" }: { listing: Listing; className?: string }) {
  const text = descriptionText(listing);
  if (!text) return null;
  return (
    <details data-testid="listing-description" className={"mt-1 text-[11px] leading-snug text-slate-600 " + className}>
      <summary className="cursor-pointer select-none text-[10.5px] font-semibold text-slate-500 hover:text-slate-700">
        상세 설명 보기
      </summary>
      <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap">{text}</p>
    </details>
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
