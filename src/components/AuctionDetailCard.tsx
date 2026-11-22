"use client";
// ─────────────────────────────────────────────────────────────────────────────
// AuctionDetailCard — 지도 ⚖️ 경매 핀을 눌렀을 때 **왼쪽 대시보드 창**에 뜨는 물건 상세
//
//   · 예전에는 핀 바로 위에 말풍선 카드(AuctionPinCard)가 떴다. 사용자 요구(2026-11-22)로
//     말풍선을 없애고, 핀을 누르면 이 카드가 왼쪽(검색창 아래)에 열린다. 오른쪽 패널은
//     그 구역의 정보(진행단계·실거래·경매 목록)를 그대로 보여 준다.
//   · 대법원 외부 링크는 넣지 않는다 — 수집해 둔 정보만으로 판단할 수 있게 채운다.
//   · 같은 좌표에 여러 물건(호실·지분)이 묶인 핀이면 카드 안에서 전환하며 모두 볼 수 있다.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { daysUntilSale, formatSaleDate, formatWon, type AuctionItem } from "@/lib/auctions";

/** 경매 핀·카드의 앰버 색 — 지도 핀과 같은 값 */
export const AUCTION_ACCENT = "#b45309";

const COURT_SHORT = (court: string) => court.replace("지방법원", "").replace("지원", "");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.1rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      <dt className="whitespace-nowrap pt-[1px] text-[10px] text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-[11.5px] leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

export default function AuctionDetailCard({
  items,
  activeId,
  onSelect,
  onClose,
  onLocate,
  onOpenList,
  zoneName,
  collectedAt,
}: {
  /** 이 핀에 묶인 물건들 — 최저가·매각기일 순 */
  items: AuctionItem[];
  /** 지금 펼쳐 보는 물건 id */
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** 지도에서 이 물건 위치로 이동 */
  onLocate?: (item: AuctionItem) => void;
  /** 오른쪽 패널의 「구역 내 진행 경매」 목록으로 */
  onOpenList?: (item: AuctionItem) => void;
  zoneName?: string;
  /** 수집 시점(YYYY-MM-DD...) — 카드 하단에 밝힌다 */
  collectedAt?: string | null;
}) {
  const active = useMemo(
    () => items.find((it) => it.id === activeId) ?? items[0],
    [items, activeId]
  );
  if (!active) return null;

  const many = items.length > 1;
  const d = daysUntilSale(active.saleDate);
  const caseNo =
    active.caseYear && active.casePart && active.caseSerial
      ? `${active.caseYear}${active.casePart}${active.caseSerial}`
      : active.caseNoPrint.replace(active.court, "").trim() || active.caseNo;
  const rate = active.minimumRate;
  const asOf = collectedAt ? collectedAt.slice(0, 10) : null;

  return (
    <div
      data-testid="auction-detail-card"
      data-auction-active={active.id}
      className="pointer-events-auto max-h-[min(72vh,640px)] overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-2xl"
    >
      {/* 머리 — 경매 표시 + 사건번호 + 닫기 */}
      <div className="sticky top-0 z-10 flex items-center gap-1.5 rounded-t-xl border-b border-amber-200 bg-amber-50/95 px-2.5 py-1.5 backdrop-blur">
        <span
          className="rounded px-1.5 py-[1px] text-[10px] font-extrabold text-white"
          style={{ background: AUCTION_ACCENT }}
        >
          ⚖️ 경매
        </span>
        <b className="truncate text-[12.5px] font-bold text-slate-900" title={`${active.court} ${caseNo}`}>
          {caseNo}
        </b>
        <span className="shrink-0 rounded bg-white px-1 py-[1px] text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
          {COURT_SHORT(active.court)}
        </span>
        {active.failCount != null && active.failCount > 0 ? (
          <span className="shrink-0 rounded bg-rose-100 px-1 py-[1px] text-[10px] font-bold text-rose-700">
            유찰 {active.failCount}회
          </span>
        ) : (
          <span className="shrink-0 rounded bg-sky-100 px-1 py-[1px] text-[10px] font-bold text-sky-700">신건</span>
        )}
        <button
          type="button"
          aria-label="경매 물건 상세 닫기"
          onClick={onClose}
          className="ml-auto shrink-0 rounded border border-amber-300 bg-white px-1.5 py-[1px] text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        {/* 이 핀에 묶인 물건이 여럿이면 — 눌러서 전환 */}
        {many && (
          <div>
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500">같은 자리 물건 {items.length}건</span>
              <span className="text-[9.5px] text-slate-400">눌러서 전환</span>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {items.map((it, i) => {
                const on = it.id === active.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    data-testid="auction-detail-chip"
                    data-on={on ? "1" : "0"}
                    onClick={() => onSelect(it.id)}
                    title={`${it.caseNoPrint} · ${it.address}`}
                    className={
                      "max-w-full truncate rounded-full border px-1.5 py-[1px] text-[10px] font-semibold transition " +
                      (on
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-amber-500 hover:text-amber-800")
                    }
                  >
                    {i + 1}. {it.usage || "물건"} {formatWon(it.minimum)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 소재지 */}
        <div>
          <p className="text-[12px] font-semibold leading-snug text-slate-900">{active.address || active.jibun}</p>
          {(active.jibun || active.building) && (
            <p className="mt-[1px] text-[10.5px] text-slate-500">
              {[active.jibun, active.building].filter(Boolean).join(" · ")}
              {zoneName ? ` · ${zoneName}` : ""}
            </p>
          )}
        </div>

        {/* 가격 — 감정 → 최저 */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              감정 <b className="text-[11.5px] font-semibold text-slate-700">{formatWon(active.appraised)}</b>
            </span>
            <span className="text-[10px] text-slate-500">최저매각가격</span>
          </div>
          <div className="flex items-baseline gap-1">
            <b className="text-[17px] font-extrabold leading-tight text-rose-700">{formatWon(active.minimum)}</b>
            {rate != null && (
              <span className="text-[11px] font-bold text-rose-600">감정가의 {rate}%</span>
            )}
          </div>
          {rate != null && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, Math.min(100, rate))}%`, background: AUCTION_ACCENT }}
              />
            </div>
          )}
        </div>

        {/* 매각기일 — 가장 급한 정보라 위에 */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-amber-900">매각기일</span>
          <b className="text-[12.5px] font-extrabold text-amber-900">
            {formatSaleDate(active.saleDate)} {active.saleTime}
          </b>
          {d != null && (
            <span
              className={
                "rounded px-1 py-[1px] text-[10px] font-bold " +
                (d <= 7 ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-1 ring-rose-200")
              }
            >
              {d === 0 ? "오늘" : d > 0 ? `${d}일 뒤` : `${-d}일 지남`}
            </span>
          )}
          {active.salePlace && (
            <span className="w-full break-words text-[10px] text-amber-900/80">{active.salePlace}</span>
          )}
        </div>

        {/* 수집된 상세 */}
        <dl className="space-y-1">
          <Row label="법원">
            {active.court}
            {active.courtDept ? ` ${active.courtDept}` : ""}
            {active.courtTel ? <span className="text-slate-500"> · {active.courtTel}</span> : null}
          </Row>
          <Row label="물건종류">
            {active.usage || "-"}
            {active.landCategory ? <span className="text-slate-500"> · {active.landCategory}</span> : null}
            {active.area ? <span className="text-slate-500"> · {active.area}</span> : null}
          </Row>
          <Row label="물건번호">
            {active.itemNo || "-"}
            {active.objectNo ? ` (목적물 ${active.objectNo})` : ""}
          </Row>
          <Row label="감정·최저">
            {formatWon(active.appraised)} → <b className="font-extrabold text-rose-700">{formatWon(active.minimum)}</b>
            {rate != null ? ` (${rate}%)` : ""}
          </Row>
          <Row label="유찰">
            {active.failCount != null ? `${active.failCount}회` : "-"}
          </Row>
          {active.decisionDate && (
            <Row label="매각결정">{formatSaleDate(active.decisionDate)}</Row>
          )}
          {active.saleDate && (
            <Row label="매각장소">{active.salePlace || "-"}</Row>
          )}
        </dl>

        {/* 비고 / 특이사항 — 일괄매각·지분매각·대항력 포기조건 등 법원 원문 */}
        {active.note && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1.5">
            <p className="mb-0.5 text-[10px] font-bold text-amber-900">비고 · 특이사항</p>
            <p className="whitespace-pre-wrap break-words text-[10.5px] leading-relaxed text-amber-900/90">
              {active.note}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {onLocate && (
            <button
              type="button"
              onClick={() => onLocate(active)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
            >
              📍 지도에서 위치
            </button>
          )}
          {onOpenList && (
            <button
              type="button"
              onClick={() => onOpenList(active)}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-50"
            >
              ⚖️ 구역 경매 목록에서 보기
            </button>
          )}
        </div>

        <p className="text-[9.5px] leading-relaxed text-slate-400">
          대법원 법원경매정보 원문 기준{asOf ? ` · ${asOf} 수집` : ""}. 입찰 전 매각물건명세서로 권리분석을
          확인하세요. 매각기일·최저가는 변경될 수 있습니다.
        </p>
      </div>
    </div>
  );
}
