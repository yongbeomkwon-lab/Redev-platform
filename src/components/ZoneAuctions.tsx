"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneAuctions — 구역 상세 패널의 「⚖️ 구역 내 진행 경매 N건」
//
//  · 대법원 법원경매정보에서 받은 진행 중 물건 중 **이 구역 경계 안**에 있는 것만 보여준다.
//    (매칭은 scripts/build-auction-zones.py 가 지번 좌표 → 폴리곤 Point-in-Polygon 으로 미리 계산)
//  · 실무에서 먼저 보는 순서로 적는다: 용도·사건번호 → 감정가 → 최저가(감정가 대비 %) →
//    유찰횟수 → 매각기일 → 면적·비고.
//  · 같은 사건에 물건(호실)이 여러 개면 사건 한 줄로 묶고, 그 아래에 물건을 2건까지 펼친다.
//    (예: 쌍문동 507-1일원 한 사건에 109개 호실 — 사건 목록이 109줄로 늘어서지 않게)
//  · **대법원 외부 링크는 두지 않는다**(사용자 요구 2026-11-22). 물건을 누르면 왼쪽 창에
//    그 물건의 상세가 열린다 — 판단에 필요한 값은 왼쪽 카드 안에서 다 보인다.
//  · 물건이 없으면 섹션 자체를 그리지 않는다(빈 상자를 늘어놓지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import {
  countAuctionCases,
  countAuctionSales,
  daysUntilSale,
  formatSaleDate,
  formatWon,
  type AuctionItem,
} from "@/lib/auctions";

/** 사건 묶음 하나에서 기본으로 펼쳐 보여 주는 물건 수 */
const ITEMS_PER_CASE = 2;
/** 접었을 때 처음 보여 주는 사건 수 */
const CASES_PREVIEW = 4;

type CaseGroup = { key: string; items: AuctionItem[] };

export default function ZoneAuctions({
  items,
  meta,
  onLocate,
  onSelectItem,
  highlightId,
  scrollToken,
}: {
  items: AuctionItem[];
  /** 수집 기준일·기일 범위 — 캡션에 그대로 적는다 */
  meta?: { collectedAt?: string; saleDateFrom?: string; saleDateTo?: string } | null;
  /** 지도에서 이 물건 위치를 보여 준다 */
  onLocate?: (item: AuctionItem) => void;
  /** 이 물건을 왼쪽 창(경매 물건 상세)에서 연다 */
  onSelectItem?: (item: AuctionItem) => void;
  /** 왼쪽 창에서 보고 있는 물건 — 이 줄을 강조하고, 필요하면 펼친다 */
  highlightId?: string | null;
  /** 값이 바뀔 때마다 강조한 줄로 스크롤한다(왼쪽 카드의 「구역 경매 목록에서 보기」) */
  scrollToken?: number | null;
}) {
  const [casesOpen, setCasesOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLElement | null>(null);

  // 사건(법원+사건번호)별로 묶는다 — 물건(호실)은 그 안에서 매각기일·최저가 순
  const groups = useMemo<CaseGroup[]>(() => {
    const m = new Map<string, AuctionItem[]>();
    for (const it of items) {
      const key = `${it.courtCode}|${it.caseNo}`;
      const arr = m.get(key);
      if (arr) arr.push(it);
      else m.set(key, [it]);
    }
    const out = [...m.entries()].map(([key, list]) => ({
      key,
      items: [...list].sort(
        (a, b) =>
          (a.saleDate || "99999999").localeCompare(b.saleDate || "99999999") ||
          (a.minimum ?? Infinity) - (b.minimum ?? Infinity)
      ),
    }));
    return out.sort(
      (a, b) =>
        (a.items[0].saleDate || "99999999").localeCompare(b.items[0].saleDate || "99999999") ||
        (a.items[0].minimum ?? Infinity) - (b.items[0].minimum ?? Infinity)
    );
  }, [items]);

  // 강조할 물건이 들어오면 그 사건 묶음을 펼치고 사건 목록도 전체로 연다
  const highlightGroupKey = useMemo(() => {
    if (!highlightId) return null;
    const g = groups.find((gr) => gr.items.some((it) => it.id === highlightId));
    return g?.key ?? null;
  }, [groups, highlightId]);

  useEffect(() => {
    if (!highlightGroupKey) return;
    setCasesOpen(true);
    setOpenGroups((prev) => (prev.has(highlightGroupKey) ? prev : new Set(prev).add(highlightGroupKey)));
  }, [highlightGroupKey]);

  // 「구역 경매 목록에서 보기」 — 그 줄을 화면 가운데로 부드럽게 옮긴다
  useEffect(() => {
    if (!scrollToken || !highlightId) return;
    const el = rootRef.current?.querySelector<HTMLElement>(
      `[data-auction-item-id="${highlightId}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollToken, highlightId]);

  if (items.length === 0) return null;

  // 실제 매각 건수 — 일괄매각 목적물(필지·호실 목록) 여러 줄은 1건으로 센다.
  //   헤더·상단 배지가 이 값을 쓴다(줄 수 items.length 로 세면 24·17처럼 부풀려 보인다).
  const salesCount = countAuctionSales(items);
  const caseCount = countAuctionCases(items);
  const shown = casesOpen ? groups : groups.slice(0, CASES_PREVIEW);
  const asOf = meta?.collectedAt ? meta.collectedAt.slice(0, 10) : null;
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section
      ref={rootRef}
      id="zone-auctions"
      data-testid="zone-auctions"
      className="scroll-mt-2 rounded-xl border border-slate-300 bg-white p-3"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <h3 className="text-xs font-bold text-slate-800">⚖️ 구역 내 진행 경매 {salesCount}건</h3>
        {caseCount < salesCount && (
          <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
            사건 {caseCount}개
          </span>
        )}
        <span className="text-[10px] text-slate-500">대법원 법원경매정보</span>
        {asOf && <span className="ml-auto text-[10px] text-slate-400">{asOf} 수집</span>}
      </div>

      <ul className="space-y-2">
        {shown.map((g) => {
          const head = g.items[0];
          const open = openGroups.has(g.key);
          const visible = open ? g.items : g.items.slice(0, ITEMS_PER_CASE);
          const hidden = g.items.length - visible.length;
          // 한 사건 안에서 몇 개가 따로 매각되는가 — 일괄매각이면 목적물이 여러 줄이어도 1건이다
          const groupSales = countAuctionSales(g.items);
          const isBatch = g.items.length > 1 && groupSales === 1;
          return (
            <li
              key={g.key}
              data-testid="zone-auction-item"
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-2"
            >
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {head.usage || "용도 미상"}
                </span>
                <b className="text-[11px] font-semibold text-slate-800">
                  {head.caseYear && head.casePart && head.caseSerial
                    ? `${head.caseYear}${head.casePart}${head.caseSerial}`
                    : head.caseNoPrint.replace(head.court, "").trim() || head.caseNo}
                </b>
                <span className="text-[10px] text-slate-500">{head.court.replace("지방법원", "")}</span>
                {g.items.length > 1 && (
                  <span
                    className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                    title={
                      isBatch
                        ? `일괄매각 — 필지·호실 ${g.items.length}개를 한꺼번에 매각합니다(경매 1건)`
                        : `이 사건에서 따로 매각되는 물건 ${groupSales}건(목적물 ${g.items.length}줄)`
                    }
                  >
                    {isBatch ? `일괄매각 · 목적물 ${g.items.length}개` : `물건 ${groupSales}건`}
                  </span>
                )}
              </div>

              <ul className="mt-1 space-y-1.5">
                {visible.map((it) => {
                  const left = daysUntilSale(it.saleDate);
                  const on = highlightId === it.id;
                  return (
                    <li
                      key={it.id}
                      data-auction-item-id={it.id}
                      data-highlighted={on ? "1" : undefined}
                      className={
                        "rounded border p-1.5 transition " +
                        (on
                          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                          : "border-slate-200 bg-white")
                      }
                    >
                      <p className="line-clamp-2 text-[11px] leading-snug text-slate-600">{it.address}</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="text-slate-500">
                          감정 <b className="font-semibold text-slate-700">{formatWon(it.appraised)}</b>
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-500">
                          최저 <b className="font-extrabold text-rose-700">{formatWon(it.minimum)}</b>
                          {it.minimumRate != null && (
                            <span className="ml-0.5 text-[10px] font-semibold text-rose-600">
                              {it.minimumRate}%
                            </span>
                          )}
                        </span>
                        {it.failCount != null && it.failCount > 0 && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                            유찰 {it.failCount}회
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          매각 {formatSaleDate(it.saleDate)} {it.saleTime}
                        </span>
                        {left != null && left >= 0 && left <= 7 && (
                          <span className="rounded bg-rose-50 px-1 py-0.5 font-semibold text-rose-700">
                            {left === 0 ? "오늘" : `${left}일 뒤`}
                          </span>
                        )}
                        {it.area && <span>{it.area}</span>}
                        {it.note && (
                          <span className="rounded bg-slate-200/80 px-1 py-0.5 font-medium text-slate-700">
                            {it.note.length > 20 ? it.note.slice(0, 20) + "…" : it.note}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {onSelectItem && (
                          <button
                            onClick={() => onSelectItem(it)}
                            className={
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold " +
                              (on
                                ? "border border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                                : "border border-amber-300 bg-white text-amber-800 hover:border-amber-500 hover:bg-amber-50")
                            }
                          >
                            {on ? "왼쪽 창에 열림" : "⚖️ 상세 보기"}
                          </button>
                        )}
                        {onLocate && (
                          <button
                            onClick={() => onLocate(it)}
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900"
                          >
                            📍 지도 위치
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {hidden > 0 && (
                <button
                  onClick={() => toggleGroup(g.key)}
                  className="mt-1.5 w-full rounded border border-slate-200 py-0.5 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
                >
                  이 사건 {isBatch ? "목적물" : "물건"} {g.items.length}건 {open ? "접기" : `모두 보기 (+${hidden})`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {groups.length > CASES_PREVIEW && (
        <button
          onClick={() => setCasesOpen((v) => !v)}
          className="mt-2 w-full rounded-lg border border-slate-200 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
        >
          {casesOpen ? "접기" : `사건 ${groups.length}개 모두 보기 (+${groups.length - CASES_PREVIEW})`}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        감정가·최저가·기일은 대법원 법원경매정보 원문 기준입니다. 서울 5개 지방법원(서부지법 포함)의
        진행 중 물건을 담았고
        {meta?.saleDateFrom && meta?.saleDateTo
          ? ` (매각기일 ${formatSaleDate(meta.saleDateFrom)}~${formatSaleDate(meta.saleDateTo)})`
          : ""}
        , 일괄매각으로 한꺼번에 매각되는 필지·호실 목록은 1건으로 셉니다(사건 안에서 펼쳐 볼 수 있습니다).
        같은 사건이라도 물건번호가 다르면 따로 매각되는 물건이라 각각 셉니다. 입찰 전 권리분석은
        매각물건명세서로 확인하세요.
      </p>
    </section>
  );
}
