"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneAuctions — 구역 상세 패널의 「⚖️ 구역 내 진행 경매 N건」
//
//  · 대법원 법원경매정보에서 받은 공고중 물건 중 **이 구역 경계 안**에 있는 것만 보여준다.
//    (매칭은 scripts/build-auction-zones.py 가 지번 좌표 → 폴리곤 Point-in-Polygon 으로 미리 계산)
//  · 실무에서 먼저 보는 순서로 적는다: 용도·사건번호 → 감정가 → 최저가(감정가 대비 %) →
//    유찰횟수 → 매각기일 → 면적·비고 → 대법원 원문.
//  · 물건이 없으면 섹션 자체를 그리지 않는다(빈 상자를 늘어놓지 않는다).
//  · 건물 한 채에 호실이 수십 개 걸린 사건(예: 쌍문동 에드가쌍문 109건)은 접어서 보여준다.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import {
  daysUntilSale,
  formatSaleDate,
  formatWon,
  type AuctionItem,
} from "@/lib/auctions";

/** 접었을 때 처음 보여 주는 건수 */
const PREVIEW = 3;

export default function ZoneAuctions({
  items,
  meta,
  onLocate,
}: {
  items: AuctionItem[];
  /** 수집 기준일·기일 범위 — 캡션에 그대로 적는다 */
  meta?: { collectedAt?: string; saleDateFrom?: string; saleDateTo?: string } | null;
  /** 지도에서 이 물건 위치를 보여 준다 */
  onLocate?: (item: AuctionItem) => void;
}) {
  const [open, setOpen] = useState(false);
  // 사건별로 묶는다 — 같은 사건의 여러 호실은 한 줄로 접어 보여 준다
  const groups = useMemo(() => {
    const m = new Map<string, AuctionItem[]>();
    for (const it of items) {
      const key = `${it.courtCode}|${it.caseNo}`;
      const arr = m.get(key);
      if (arr) arr.push(it);
      else m.set(key, [it]);
    }
    return [...m.values()].sort(
      (a, b) =>
        (a[0].saleDate || "99999999").localeCompare(b[0].saleDate || "99999999") ||
        (a[0].minimum ?? Infinity) - (b[0].minimum ?? Infinity)
    );
  }, [items]);

  if (items.length === 0) return null;

  const shown = open ? groups : groups.slice(0, PREVIEW);
  const hidden = groups.length - shown.length;
  const asOf = meta?.collectedAt ? meta.collectedAt.slice(0, 10) : null;

  return (
    <section
      data-testid="zone-auctions"
      className="rounded-xl border border-slate-300 bg-white p-3"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <h3 className="text-xs font-bold text-slate-800">
          ⚖️ 구역 내 진행 경매 {items.length}건
        </h3>
        <span className="text-[10px] text-slate-500">대법원 법원경매정보</span>
        {asOf && <span className="ml-auto text-[10px] text-slate-400">{asOf} 수집</span>}
      </div>

      <ul className="space-y-2">
        {shown.map((group) => {
          const it = group[0];
          const left = daysUntilSale(it.saleDate);
          return (
            <li
              key={`${it.courtCode}-${it.caseNo}`}
              data-testid="zone-auction-item"
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-2"
            >
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {it.usage || "용도 미상"}
                </span>
                <span className="text-[11px] font-semibold text-slate-800">
                  {it.caseYear && it.casePart && it.caseSerial
                    ? `${it.caseYear}${it.casePart}${it.caseSerial}`
                    : it.caseNoPrint.replace(it.court, "").trim() || it.caseNo}
                </span>
                <span className="text-[10px] text-slate-500">{it.court.replace("지방법원", "")}</span>
                {group.length > 1 && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    이 사건 물건 {group.length}건
                  </span>
                )}
              </div>

              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600">{it.address}</p>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                <span className="text-slate-500">
                  감정 <b className="font-semibold text-slate-700">{formatWon(it.appraised)}</b>
                </span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-500">
                  최저{" "}
                  <b className="font-extrabold text-rose-700">{formatWon(it.minimum)}</b>
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

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
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
                    {it.note.length > 24 ? it.note.slice(0, 24) + "…" : it.note}
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                {onLocate && (
                  <button
                    onClick={() => onLocate(it)}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900"
                  >
                    📍 지도 위치
                  </button>
                )}
                <a
                  href={it.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`${it.court} ${it.caseYear}${it.casePart}${it.caseSerial} — 대법원 사건검색 화면이 열립니다(법원·연도·번호를 그대로 넣으세요)`}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900"
                >
                  대법원에서 사건 조회 ↗
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {groups.length > PREVIEW && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2 w-full rounded-lg border border-slate-200 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
        >
          {open ? "접기" : `사건 ${groups.length}개 모두 보기 (+${hidden})`}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        감정가·최저가·기일은 대법원 법원경매정보 원문 기준입니다. 매각기일이 앞으로 약 2주인
        공고중 물건만 담았고
        {meta?.saleDateFrom && meta?.saleDateTo
          ? ` (기일 ${formatSaleDate(meta.saleDateFrom)}~${formatSaleDate(meta.saleDateTo)})`
          : ""}
        , 같은 사건의 다른 호실·지분매각은 각각 한 건으로 셉니다. 입찰 전 권리분석은 원문과
        매각물건명세서로 확인하세요.
      </p>
    </section>
  );
}
