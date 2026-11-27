"use client";
// ─────────────────────────────────────────────────────────────────────────────
// AuctionPanel — ⚖️ 경매 물건을 **한 곳에서만** 보는 전용 패널 (2026-11-27 개편)
//
//   · 예전에는 같은 물건이 **오른쪽 구역 상세 패널**(「⚖️ 구역 내 진행 경매 N건」 목록)과
//     **왼쪽 카드**(핀을 누르면 뜨는 물건 상세)에 두 번 나와 화면이 난잡했다(사용자 지적).
//     이제 경매 목록·상세는 **이 패널 하나**에서만 본다. 오른쪽 패널에는 「⚖️ 경매 N건」 버튼
//     한 줄만 남고, 그것을 누르면 이 패널이 구역 전체 목록으로 열린다.
//   · 안쪽은 두 화면이다: **목록**(사건별로 묶은 구역 전체 물건) ↔ **물건 상세**(감정·최저·보증금·
//     기일·비고·기일내역·면적·감정평가요항·사진). 뒤로 가면 목록, 앞뒤 화살표로 이웃 물건.
//   · 공매(온비드)는 2단계에서 붙인다 — 탭 구조(CHANNELS)와 `SaleChannel` 타입을 미리 나눠 두어
//     목록 컴포넌트를 다시 뜯지 않고 탭 하나를 켜면 되게 했다. 지금은 「공매 · 준비 중」.
//   · 값은 **보유한 것만** 보여 준다. 대법원 사건상세에서만 나오는 항목(회차별 기일결과·임차인·
//     매각물건명세서·사진)은 `public/data/auction-details.json` 에 수집돼 있으면 펼치고,
//     없으면 "대법원 원문에서 확인"과 사건번호 복사·원문 열기를 보여 준다. **추정값을 만들지 않는다.**
//   · 좁은 화면(<768px)에서는 지도 아래에서 올라오는 **시트**로 열린다(오른쪽 패널은 접힘).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import {
  auctionDateStatus,
  auctionNoteFlags,
  auctionSaleKey,
  countAuctionCases,
  countAuctionSales,
  daysUntilSale,
  formatSaleDate,
  formatWon,
  minimumDeposit,
  shortCaseNo,
  type AuctionItem,
  type AuctionsMeta,
  type SaleChannel,
} from "@/lib/auctions";
import { loadAuctionDetails, detailForItem, type AuctionDetail, type AuctionDetailsData } from "@/lib/auction-details";

export const AUCTION_ACCENT = "#b45309";

/** 탭 정의 — 공매는 2단계에서 `enabled: true` 로 바꾸고 목록 공급원만 연결하면 된다 */
const CHANNELS: {
  id: SaleChannel;
  label: string;
  enabled: boolean;
  hint: string;
}[] = [
  { id: "court", label: "경매", enabled: true, hint: "대법원 법원경매정보" },
  { id: "onbid", label: "공매", enabled: false, hint: "온비드(캠코) — 다음 단계에서 연결" },
];

/** 접었을 때 처음 보여 주는 사건 수 */
const CASES_PREVIEW = 6;
/** 한 사건에서 기본으로 펼쳐 보여 주는 목적물 수 */
const ITEMS_PER_CASE = 3;
/** 상세에서 이웃 물건으로 넘길 때 쓰는 정렬 — 매각기일 → 최저가 */
const bySaleOrder = (a: AuctionItem, b: AuctionItem) =>
  (a.saleDate || "99999999").localeCompare(b.saleDate || "99999999") ||
  (a.minimum ?? Infinity) - (b.minimum ?? Infinity);

const COURT_SHORT = (court: string) => court.replace("지방법원", "").replace("지원", "");

/** `영등포구 문래동3가 16-17` → `문래동3가 16-17` — 좁은 알약에 들어가게 */
const SHORT_JIBUN = (jibun: string) => (jibun || "").replace(/^\S+?(구|군)\s+/, "");

/**
 * 일괄매각 목적물 알약의 이름 — 지번이 같아도 구분되도록 **도로명·번지 뒤의 동·호수**를 쓴다.
 *   `서울특별시 중구 마장로1길 21 지하1층16호(신당동,광희시장)` → `지하1층16호(신당동,광희시장)`
 */
function spotLabel(address: string, fallback: string): string {
  const clean = (address || "").replace(/^서울(특별시)?\s+\S+?(구|군)\s+/, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const tail = parts.length > 2 ? parts.slice(2).join(" ") : parts[parts.length - 1] || "";
  return (tail || fallback).slice(0, 18);
}

/** 원문 표기에서 첫 면적(㎡) — `철근콘크리트구조 20.3968㎡` → 20.3968 */
function firstAreaSqm(text: string): number | null {
  const m = (text || "").match(/([0-9][0-9,.]*)\s*㎡/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      <dt className="whitespace-nowrap pt-[1px] text-[10px] text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-[11.5px] leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

export default function AuctionPanel({
  items,
  zoneId,
  zoneName,
  zoneTotal,
  activeId,
  onSelect,
  onClose,
  onLocate,
  onShowZoneAll,
  meta,
  mobileSheet = true,
}: {
  /** 패널이 보여 줄 물건 — 핀에서 들어오면 그 핀에 묶인 물건, 구역 버튼에서 들어오면 구역 전체 */
  items: AuctionItem[];
  zoneId?: string;
  zoneName?: string;
  /** 그 구역의 전체 경매 건수(매각단위) — 핀 묶음보다 많으면 「구역 전체 보기」를 띄운다 */
  zoneTotal?: number;
  /** 펼친 물건 id — null 이면 목록 */
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  /** 지도에서 이 물건 위치를 보여 준다 */
  onLocate?: (item: AuctionItem) => void;
  /** 구역 전체 목록으로 바꾼다(핀에서 들어온 경우) */
  onShowZoneAll?: () => void;
  meta?: AuctionsMeta | null;
  /** 좁은 화면에서 바닥 시트로 띄운다 */
  mobileSheet?: boolean;
}) {
  const [channel, setChannel] = useState<SaleChannel>("court");
  const [casesOpen, setCasesOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<AuctionDetailsData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 상세 데이터 — 세션에 한 번만. 파일이 없거나 그 사건이 비어 있으면 '미수집' 안내를 쓴다.
  useEffect(() => {
    let alive = true;
    loadAuctionDetails().then((d) => {
      if (alive) setDetails(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 물건을 바꾸면 본문을 맨 위로 — 좁은 패널에서 이전 스크롤이 남지 않게
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activeId, channel]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1600);
    } catch {
      /* 클립보드가 막힌 브라우저 — 사건번호는 화면에 그대로 보이므로 선택해 복사할 수 있다 */
    }
  }

  // 사건(법원+사건번호)별 묶음 — 목록의 기본 단위는 여전히 사건이다(일괄매각 24필지 = 1사건)
  const groups = useMemo(() => {
    const q = query.trim();
    const filtered = q
      ? items.filter((it) => {
          const hay = `${it.address} ${it.jibun} ${it.building} ${shortCaseNo(it)} ${it.caseNo} ${it.usage}`;
          return hay.includes(q);
        })
      : items;
    const m = new Map<string, AuctionItem[]>();
    for (const it of filtered) {
      const key = `${it.courtCode}|${it.caseNo}`;
      const arr = m.get(key);
      if (arr) arr.push(it);
      else m.set(key, [it]);
    }
    return [...m.entries()]
      .map(([key, list]) => ({ key, items: [...list].sort(bySaleOrder) }))
      .sort((a, b) => bySaleOrder(a.items[0], b.items[0]));
  }, [items, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const active = useMemo(() => items.find((it) => it.id === activeId) ?? null, [items, activeId]);
  const activeIndex = active ? flat.findIndex((it) => it.id === active.id) : -1;

  const salesTotal = countAuctionSales(items);
  const caseTotal = countAuctionCases(items);
  const asOf = meta?.collectedAt ? meta.collectedAt.slice(0, 10) : null;
  const zoneAllAvailable = !!onShowZoneAll && !!zoneTotal && zoneTotal > salesTotal;

  // 강조 물건이 들어오면 그 사건 묶음을 펼친다
  useEffect(() => {
    if (!activeId) return;
    const g = groups.find((gr) => gr.items.some((it) => it.id === activeId));
    if (!g) return;
    setCasesOpen(true);
    setOpenGroups((prev) => (prev.has(g.key) ? prev : new Set(prev).add(g.key)));
  }, [activeId, groups]);

  if (items.length === 0) return null;

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const wrapper =
    "pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-amber-300 bg-white shadow-2xl " +
    (mobileSheet
      ? "fixed inset-x-2 bottom-2 z-[640] max-h-[78dvh] rounded-2xl md:static md:inset-auto md:z-auto md:max-h-[calc(100dvh-8.5rem)] md:w-full md:rounded-xl "
      : "relative z-[640] max-h-[calc(100dvh-8.5rem)] w-full ");

  return (
    <section
      data-testid="auction-panel"
      data-auction-active={active?.id ?? ""}
      role="dialog"
      aria-label="경매 물건 패널"
      className={wrapper}
    >
      {/* 머리 — 경매 탭 + 구역 + 닫기 */}
      <div className="shrink-0 border-b border-amber-200 bg-amber-50/95 px-2.5 pb-1.5 pt-2">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded px-1.5 py-[1px] text-[10px] font-extrabold text-white"
            style={{ background: AUCTION_ACCENT }}
          >
            ⚖️ 경매
          </span>
          <b className="min-w-0 truncate text-[12.5px] font-bold text-slate-900" title={zoneName}>
            {zoneName || "경매 물건"}
          </b>
          <span className="shrink-0 rounded bg-white px-1.5 py-[1px] text-[10px] font-bold text-amber-900 ring-1 ring-amber-200">
            {salesTotal}건
          </span>
          {items.length > salesTotal && (
            <span
              className="shrink-0 text-[9.5px] text-amber-800/70"
              title="일괄매각 목적물(필지·호실) 줄 수 — 매각은 1건입니다"
            >
              목적물 {items.length}
            </span>
          )}
          <button
            type="button"
            aria-label="경매 패널 닫기"
            onClick={onClose}
            className="ml-auto shrink-0 rounded border border-amber-300 bg-white px-1.5 py-[1px] text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            ✕
          </button>
        </div>

        {/* 탭 — 경매 / 공매(준비 중). 2단계에서 공매를 켜면 이 자리에서 바로 전환된다 */}
        <div className="mt-1.5 flex items-center gap-1" role="tablist" aria-label="매각 구분">
          {CHANNELS.map((c) => {
            const on = channel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={!c.enabled}
                data-testid={`auction-tab-${c.id}`}
                onClick={() => c.enabled && setChannel(c.id)}
                title={c.hint}
                className={
                  "rounded-full px-2 py-[2px] text-[11px] font-bold transition " +
                  (on
                    ? "bg-amber-700 text-white"
                    : c.enabled
                      ? "border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                      : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400")
                }
              >
                {c.label}
                {!c.enabled && <span className="ml-1 text-[9px] font-semibold">준비 중</span>}
              </button>
            );
          })}
          <span className="ml-auto truncate text-[9.5px] text-amber-800/70">
            {CHANNELS.find((c) => c.id === channel)?.hint}
          </span>
        </div>
      </div>

      <div ref={bodyRef} className="ui-scroll min-h-0 flex-1 overflow-y-auto">
        {channel !== "court" ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] font-semibold text-slate-700">공매(온비드)는 다음 단계에서 연결합니다</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">
              지금은 대법원 법원경매정보의 경매 물건만 보여 줍니다. 공매를 붙이면 이 패널의 같은 자리에서
              경매·공매를 오가며 볼 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setChannel("court")}
              className="mt-2 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
            >
              경매로 돌아가기
            </button>
          </div>
        ) : active ? (
          <ItemDetail
            item={active}
            detail={detailForItem(details, active)}
            position={activeIndex >= 0 ? { index: activeIndex + 1, total: flat.length } : null}
            onBack={() => onSelect(null)}
            onPrev={
              activeIndex > 0 ? () => onSelect(flat[activeIndex - 1].id) : undefined
            }
            onNext={
              activeIndex >= 0 && activeIndex < flat.length - 1
                ? () => onSelect(flat[activeIndex + 1].id)
                : undefined
            }
            siblings={items}
            onSelect={onSelect}
            onLocate={onLocate}
            zoneName={zoneName}
            meta={meta}
            copied={copied}
            onCopy={copyText}
            saleCount={salesTotal}
          />
        ) : (
          <div className="px-2.5 pb-2.5 pt-2">
            <ListSummary
              items={items}
              salesTotal={salesTotal}
              caseTotal={caseTotal}
              asOf={asOf}
              rangeFrom={meta?.saleDateFrom}
              rangeTo={meta?.saleDateTo}
              zoneAllAvailable={zoneAllAvailable}
              zoneTotal={zoneTotal}
              onShowZoneAll={onShowZoneAll}
              onOpen={(id) => onSelect(id)}
            />

            {items.length >= 8 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="주소·사건번호·물건종류로 찾기"
                aria-label="경매 물건 찾기"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-[11.5px] text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
              />
            )}

            {groups.length === 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 px-2 py-3 text-center text-[11px] text-slate-500">
                ‘{query}’에 해당하는 물건이 없습니다.
              </p>
            )}

            <ul className="mt-1.5 space-y-2">
              {(casesOpen ? groups : groups.slice(0, CASES_PREVIEW)).map((g) => {
                const head = g.items[0];
                const open = openGroups.has(g.key);
                const visible = open ? g.items : g.items.slice(0, ITEMS_PER_CASE);
                const hidden = g.items.length - visible.length;
                const groupSales = countAuctionSales(g.items);
                const isBatch = g.items.length > 1 && groupSales === 1;
                return (
                  <li
                    key={g.key}
                    data-testid="auction-case"
                    className="rounded-lg border border-slate-200 bg-slate-50/60 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {head.usage || "용도 미상"}
                      </span>
                      <b className="text-[11px] font-semibold text-slate-800">{shortCaseNo(head)}</b>
                      <span className="text-[10px] text-slate-500">{COURT_SHORT(head.court)}</span>
                      {head.courtDept && (
                        <span className="text-[10px] text-slate-400">{head.courtDept}</span>
                      )}
                      {g.items.length > 1 && (
                        <span
                          className="ml-auto rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                          title={
                            isBatch
                              ? `일괄매각 — 필지·호실 ${g.items.length}개를 한꺼번에 매각합니다(경매 1건)`
                              : `이 사건에서 따로 매각되는 물건 ${groupSales}건(목적물 ${g.items.length}줄)`
                          }
                        >
                          {isBatch ? `일괄 ${g.items.length}개` : `물건 ${groupSales}건`}
                        </span>
                      )}
                    </div>

                    <ul className="mt-1 space-y-1.5">
                      {visible.map((it) => (
                        <li key={it.id}>
                          <ListRow item={it} onOpen={() => onSelect(it.id)} />
                        </li>
                      ))}
                    </ul>

                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="mt-1.5 w-full rounded border border-slate-200 py-0.5 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
                      >
                        이 사건 {isBatch ? "목적물" : "물건"} {g.items.length}건{" "}
                        {open ? "접기" : `모두 보기 (+${hidden})`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {groups.length > CASES_PREVIEW && (
              <button
                type="button"
                onClick={() => setCasesOpen((v) => !v)}
                className="mt-2 w-full rounded-lg border border-slate-200 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
              >
                {casesOpen ? "접기" : `사건 ${groups.length}개 모두 보기 (+${groups.length - CASES_PREVIEW})`}
              </button>
            )}

            <p className="mt-2 text-[9.5px] leading-relaxed text-slate-400">
              감정가·최저가·기일은 대법원 법원경매정보 원문 기준입니다. 일괄매각으로 한꺼번에 매각되는
              필지·호실은 1건으로 셉니다. 입찰 전 권리분석은 매각물건명세서로 확인하세요.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────────── 목록 ───────────────────────────── */

function ListSummary({
  items,
  salesTotal,
  caseTotal,
  asOf,
  rangeFrom,
  rangeTo,
  zoneAllAvailable,
  zoneTotal,
  onShowZoneAll,
  onOpen,
}: {
  items: AuctionItem[];
  salesTotal: number;
  caseTotal: number;
  asOf: string | null;
  rangeFrom?: string;
  rangeTo?: string;
  zoneAllAvailable: boolean;
  zoneTotal?: number;
  onShowZoneAll?: () => void;
  onOpen: (id: string) => void;
}) {
  // 가장 급한 기일 — 목록을 열자마자 "언제까지 준비해야 하는지"가 보이게
  const next = items.reduce<AuctionItem | null>((acc, it) => {
    if (!it.saleDate) return acc;
    const d = daysUntilSale(it.saleDate);
    if (d == null || d < 0) return acc;
    if (!acc) return it;
    return (it.saleDate || "") < (acc.saleDate || "") ? it : acc;
  }, null);
  const nextLeft = next ? daysUntilSale(next.saleDate) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] text-slate-600">
        <span>
          경매 <b className="font-bold text-slate-900">{salesTotal}건</b>
        </span>
        {caseTotal < salesTotal && <span>사건 {caseTotal}개</span>}
        {asOf && <span className="ml-auto text-[9.5px] text-slate-400">{asOf} 수집</span>}
      </div>

      {next && (
        <button
          type="button"
          onClick={() => onOpen(next.id)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1 text-left"
        >
          <span className="shrink-0 text-[10px] font-bold text-amber-900">가장 급한 기일</span>
          <b className="min-w-0 truncate text-[11px] font-extrabold text-amber-900">
            {formatSaleDate(next.saleDate)} {next.saleTime}
          </b>
          <span
            className={
              "shrink-0 rounded px-1 py-[1px] text-[9.5px] font-bold " +
              (nextLeft != null && nextLeft <= 7 ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-1 ring-rose-200")
            }
          >
            {nextLeft === 0 ? "오늘" : nextLeft != null ? `${nextLeft}일 뒤` : "-"}
          </span>
          <span className="ml-auto shrink-0 truncate text-[9.5px] text-amber-800/80">
            {next.zoneName || ""}
          </span>
        </button>
      )}

      {zoneAllAvailable && (
        <button
          type="button"
          onClick={onShowZoneAll}
          className="w-full rounded-lg border border-amber-300 bg-white py-1 text-[10.5px] font-semibold text-amber-800 hover:bg-amber-50"
        >
          이 구역 경매 {zoneTotal}건 전체 보기 →
        </button>
      )}

      {rangeFrom && rangeTo && (
        <p className="text-[9.5px] text-slate-400">
          매각기일 {formatSaleDate(rangeFrom)}~{formatSaleDate(rangeTo)} 범위의 공고중 물건
        </p>
      )}
    </div>
  );
}

function ListRow({ item, onOpen }: { item: AuctionItem; onOpen: () => void }) {
  const left = daysUntilSale(item.saleDate);
  const flags = auctionNoteFlags(item.note);
  const deposit = minimumDeposit(item.minimum);
  return (
    <button
      type="button"
      data-testid="auction-row"
      data-row-id={item.id}
      onClick={onOpen}
      className="w-full rounded border border-slate-200 bg-white p-1.5 text-left transition hover:border-amber-400 hover:bg-amber-50/40"
    >
      <p className="line-clamp-2 text-[11px] leading-snug text-slate-700">{item.address}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px]">
        <span className="rounded bg-slate-900 px-1 py-[1px] text-[9px] font-bold text-white">
          {item.usage || "물건"}
        </span>
        <span className="text-slate-500">
          감정 <b className="font-semibold text-slate-700">{formatWon(item.appraised)}</b>
        </span>
        <span className="text-slate-400">→</span>
        <span className="text-slate-500">
          최저 <b className="font-extrabold text-rose-700">{formatWon(item.minimum)}</b>
          {item.minimumRate != null && (
            <span className="ml-0.5 text-[9.5px] font-semibold text-rose-600">{item.minimumRate}%</span>
          )}
        </span>
        {item.failCount != null && item.failCount > 0 ? (
          <span className="rounded bg-amber-100 px-1 py-[1px] text-[9.5px] font-semibold text-amber-800">
            유찰 {item.failCount}회
          </span>
        ) : (
          <span className="rounded bg-sky-50 px-1 py-[1px] text-[9.5px] font-semibold text-sky-700">신건</span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] text-slate-500">
        <span className="font-semibold text-slate-700">
          매각 {formatSaleDate(item.saleDate)} {item.saleTime}
        </span>
        {left != null && left >= 0 && left <= 7 && (
          <span className="rounded bg-rose-50 px-1 py-[1px] font-semibold text-rose-700">
            {left === 0 ? "오늘" : `${left}일 뒤`}
          </span>
        )}
        {deposit != null && <span>보증금 {formatWon(deposit)}</span>}
        {flags.slice(0, 2).map((f) => (
          <span
            key={f.key}
            className={
              "rounded px-1 py-[1px] font-semibold " +
              (f.tone === "rose"
                ? "bg-rose-100 text-rose-800"
                : f.tone === "amber"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700")
            }
          >
            {f.label}
          </span>
        ))}
        <span className="ml-auto shrink-0 font-semibold text-amber-700">상세 ›</span>
      </div>
    </button>
  );
}

/* ───────────────────────────── 물건 상세 ───────────────────────────── */

function Section({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
        <b className="text-[11px] font-bold text-slate-700">{title}</b>
        {hint && <span className="ml-auto text-[9.5px] font-medium text-slate-400">{hint}</span>}
      </summary>
      <div className="border-t border-slate-100 px-2 py-1.5">{children}</div>
    </details>
  );
}

function MissingNote({ what, onCopy, caseNo, copied }: {
  what: string;
  onCopy: (text: string, key: string) => void;
  caseNo: string;
  copied: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] leading-relaxed text-slate-500">
        ‘<b className="text-slate-700">{what}</b>’ 항목은 리디브에 아직 수집되지 않았습니다. 대법원
        사건검색에서 사건번호 <b className="text-slate-700">{caseNo}</b>로 확인하세요.
      </p>
      <CopyButton onCopy={onCopy} caseNo={caseNo} copied={copied} />
    </div>
  );
}

function CopyButton({ onCopy, caseNo, copied }: {
  onCopy: (text: string, key: string) => void;
  caseNo: string;
  copied: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(caseNo, "case")}
      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
    >
      {copied === "case" ? "✓ 사건번호 복사됨" : "사건번호 복사"}
    </button>
  );
}

function ItemDetail({
  item,
  detail,
  position,
  onBack,
  onPrev,
  onNext,
  siblings,
  onSelect,
  onLocate,
  zoneName,
  meta,
  copied,
  onCopy,
  saleCount,
}: {
  item: AuctionItem;
  detail?: AuctionDetail;
  position: { index: number; total: number } | null;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  siblings: AuctionItem[];
  onSelect: (id: string) => void;
  onLocate?: (item: AuctionItem) => void;
  zoneName?: string;
  meta?: AuctionsMeta | null;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  saleCount: number;
}) {
  const caseNo = shortCaseNo(item);
  const d = daysUntilSale(item.saleDate);
  const rate = item.minimumRate;
  const flags = auctionNoteFlags(item.note);
  const dateStatus = auctionDateStatus(item.saleDate);
  const depositRate = detail?.depositRate ?? 10;
  const deposit = minimumDeposit(item.minimum, depositRate);
  const schedule = detail?.schedules?.[item.itemNo] ?? [];
  const courtStatus = detail?.itemStatus?.[item.itemNo];
  const specSheetId = detail?.specSheetIds?.[item.itemNo];
  const asOf = meta?.collectedAt ? meta.collectedAt.slice(0, 10) : null;
  const areaSqm = firstAreaSqm(item.area);
  const bulkKey = auctionSaleKey(item);
  const bulkItems = siblings.filter((s) => auctionSaleKey(s) === bulkKey);
  const isBulk = bulkItems.length > 1;
  // 같은 좌표에 모인 물건(호실 여러 개) — 목록에서는 사건이 달라도 지도에서는 한 핀이다
  const sameSpot = isBulk
    ? []
    : siblings.filter(
        (s) =>
          s.id !== item.id &&
          Math.abs(s.lat - item.lat) < 1e-6 &&
          Math.abs(s.lng - item.lng) < 1e-6 &&
          auctionSaleKey(s) !== bulkKey
      );
  const chipItems = (isBulk ? bulkItems : sameSpot).slice(0, isBulk ? 24 : 8);

  return (
    <div className="px-2.5 pb-2.5 pt-2">
      {/* 상단 — 목록으로 + 이웃 물건 */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
        >
          ← 경매 목록
        </button>
        {position && (
          <span className="text-[9.5px] text-slate-400">
            {position.index} / {position.total}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={!onPrev}
            onClick={onPrev}
            aria-label="이전 물건"
            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={!onNext}
            onClick={onNext}
            aria-label="다음 물건"
            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-30"
          >
            ›
          </button>
        </span>
      </div>

      {/* 사건 머리 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-slate-900 px-1.5 py-[1px] text-[10px] font-bold text-white">
          {item.usage || "물건"}
        </span>
        <b className="text-[13px] font-extrabold text-slate-900">{caseNo}</b>
        <span className="rounded bg-white px-1 py-[1px] text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
          {COURT_SHORT(item.court)}
        </span>
        {dateStatus && (
          <span className="rounded bg-slate-100 px-1 py-[1px] text-[9.5px] font-semibold text-slate-600">
            {dateStatus}
          </span>
        )}
        {item.failCount != null && item.failCount > 0 ? (
          <span className="rounded bg-rose-100 px-1 py-[1px] text-[10px] font-bold text-rose-700">
            유찰 {item.failCount}회
          </span>
        ) : (
          <span className="rounded bg-sky-100 px-1 py-[1px] text-[10px] font-bold text-sky-700">신건</span>
        )}
      </div>

      {/* 소재지 */}
      <div className="mt-1.5">
        <p className="text-[12px] font-semibold leading-snug text-slate-900">{item.address || item.jibun}</p>
        <p className="mt-[1px] text-[10.5px] leading-snug text-slate-500">
          {[item.jibun, item.building].filter(Boolean).join(" · ")}
          {zoneName ? ` · ${zoneName}` : ""}
        </p>
      </div>

      {/* 가격 — 감정 → 최저 → 보증금 */}
      <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-slate-500">
            감정 <b className="text-[11.5px] font-semibold text-slate-700">{formatWon(item.appraised)}</b>
          </span>
          <span className="text-[10px] text-slate-500">최저매각가격{isBulk ? "(일괄 전체)" : ""}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-1">
          <b className="text-[18px] font-extrabold leading-tight text-rose-700">{formatWon(item.minimum)}</b>
          {rate != null && <span className="text-[11px] font-bold text-rose-600">감정가의 {rate}%</span>}
        </div>
        {rate != null && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, rate))}%`, background: AUCTION_ACCENT }}
            />
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
          <span>
            입찰보증금 <b className="text-[11px] font-extrabold text-slate-800">{formatWon(deposit)}</b>
            <span className="text-slate-400">
              {" "}· 최저가의 {depositRate}%{detail?.depositRate ? "" : " (계산)"}
            </span>
          </span>
        </div>
        {item.appraised != null && item.minimum != null && item.appraised > item.minimum && (
          <p className="mt-0.5 text-[9.5px] text-slate-500">
            감정가 대비 <b className="font-semibold text-slate-700">{formatWon(item.appraised - item.minimum)}</b> 낮음
          </p>
        )}
        {isBulk && (
          <p className="mt-1 text-[9.5px] leading-snug text-slate-500">
            목적물 {bulkItems.length}개를 한꺼번에 매각합니다 — 금액은 법원이 고시한 일괄 전체 기준입니다.
          </p>
        )}
      </div>

      {/* 매각기일 — 가장 급한 정보 */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5">
        <span className="text-[10px] font-semibold text-amber-900">매각기일</span>
        <b className="text-[12.5px] font-extrabold text-amber-900">
          {formatSaleDate(item.saleDate)} {item.saleTime}
        </b>
        {d != null && (
          <span
            className={
              "rounded px-1 py-[1px] text-[10px] font-bold " +
              (d <= 7 && d >= 0 ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-1 ring-rose-200")
            }
          >
            {d === 0 ? "오늘" : d > 0 ? `${d}일 뒤` : `${-d}일 지남`}
          </span>
        )}
        {item.salePlace && (
          <span className="w-full break-words text-[10px] text-amber-900/80">{item.salePlace}</span>
        )}
      </div>

      {/* 일괄매각 목적물 / 같은 자리 물건 — 눌러서 전환 */}
      {chipItems.length > 0 && (
        <div className="mt-1.5">
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500">
              {isBulk
                ? `일괄매각 목적물 ${bulkItems.length}개`
                : `같은 자리 물건 ${sameSpot.length + 1}건`}
            </span>
            <span className="text-[9px] text-slate-400">눌러서 전환</span>
          </div>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {chipItems.map((s, i) => {
              const on = s.id === item.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid="auction-detail-chip"
                  data-on={on ? "1" : "0"}
                  onClick={() => onSelect(s.id)}
                  title={`${shortCaseNo(s)} · ${s.address}`}
                  className={
                    "max-w-full truncate rounded-full border px-1.5 py-[1px] text-[10px] font-semibold transition " +
                    (on
                      ? "border-amber-600 bg-amber-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-amber-500 hover:text-amber-800")
                  }
                >
                  {isBulk
                    ? `${i + 1}. ${spotLabel(s.address, SHORT_JIBUN(s.jibun) || s.objectNo || "목적물")}`
                    : `${i + 1}. ${shortCaseNo(s).slice(-5)} ${formatWon(s.minimum)}`}
                </button>
              );
            })}
            {(isBulk ? bulkItems.length : sameSpot.length) > chipItems.length && (
              <span className="self-center text-[9.5px] text-slate-400">
                외 {(isBulk ? bulkItems.length : sameSpot.length) - chipItems.length}건
              </span>
            )}
          </div>
        </div>
      )}

      {/* 핵심 정보 */}
      <dl className="mt-2 space-y-1">
        <Row label="법원">
          {item.court}
          {detail?.courtDept || item.courtDept ? ` ${detail?.courtDept || item.courtDept}` : ""}
          {(detail?.courtTel || item.courtTel) && (
            <span className="text-slate-500"> · 경매계 ☎ {detail?.courtTel || item.courtTel}</span>
          )}
          {detail?.execTel && <span className="text-slate-500"> · 집행관 ☎ {detail.execTel}</span>}
        </Row>
        <Row label="사건번호">
          <span className="font-semibold">{caseNo}</span>
          <button
            type="button"
            onClick={() => onCopy(caseNo, "case")}
            className="ml-1.5 rounded border border-slate-200 px-1 py-[1px] text-[9.5px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
          >
            {copied === "case" ? "복사됨 ✓" : "복사"}
          </button>
          {detail?.caseName && <span className="ml-1 text-slate-500"> · {detail.caseName}</span>}
        </Row>
        <Row label="물건번호">
          {item.itemNo || "-"}
          {item.objectNo ? ` (목적물 ${item.objectNo})` : ""}
        </Row>
        <Row label="물건종류">
          {detail?.objectKind || item.usage || "-"}
          {item.landCategory ? <span className="text-slate-500"> · {item.landCategory}</span> : null}
        </Row>
        <Row label="면적">
          {item.area || "-"}
          {areaSqm != null && (
            <span className="text-slate-400"> (약 {(areaSqm / 3.3058).toFixed(1)}평)</span>
          )}
        </Row>
        <Row label="진행">
          {courtStatus ? <b className="font-semibold text-slate-800">{courtStatus}</b> : dateStatus || "-"}
          {item.failCount != null && courtStatus !== "유찰" ? ` · 유찰 ${item.failCount}회` : ""}
        </Row>
        {item.decisionDate && <Row label="매각결정">{formatSaleDate(item.decisionDate)}</Row>}
        {detail?.receiptDate && <Row label="사건접수">{formatSaleDate(detail.receiptDate)}</Row>}
        {detail?.commenceDate && <Row label="경매개시">{formatSaleDate(detail.commenceDate)}</Row>}
        {detail?.dividendDeadline && (
          <Row label="배당요구">{formatSaleDate(detail.dividendDeadline)}</Row>
        )}
        {detail?.claimAmount != null && <Row label="청구금액">{formatWon(detail.claimAmount)}</Row>}
        {detail?.bidPeriod && <Row label="입찰기간">{detail.bidPeriod}</Row>}
        {detail?.status && <Row label="법원상태">{detail.status}</Row>}
      </dl>

      {/* 비고·특수권리 — 법원 원문 */}
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1.5">
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-amber-900">
          비고 · 특수권리
          {flags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {flags.map((f) => (
                <span
                  key={f.key}
                  className={
                    "rounded px-1 py-[1px] text-[9px] font-bold " +
                    (f.tone === "rose"
                      ? "bg-rose-600 text-white"
                      : f.tone === "amber"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-600 text-white")
                  }
                >
                  {f.label}
                </span>
              ))}
            </span>
          )}
        </p>
        {item.note ? (
          <p className="whitespace-pre-wrap break-words text-[10.5px] leading-relaxed text-amber-900/90">
            {item.note}
          </p>
        ) : (
          <p className="text-[10.5px] text-amber-900/60">법원 목록에 적힌 비고가 없습니다.</p>
        )}
        {detail?.note && detail.note !== item.note && (
          <p className="mt-1 whitespace-pre-wrap break-words border-t border-amber-200/70 pt-1 text-[10.5px] leading-relaxed text-amber-900/90">
            {detail.note}
          </p>
        )}
      </div>

      {/* 상세 — 수집돼 있으면 항목별로 펼치고, 한 건도 없으면 안내 한 칸으로 묶는다 */}
      <div className="mt-2 space-y-1.5">
        {!detail ? (
          <Section title="대법원 원문 상세" hint="미수집" defaultOpen>
            <p className="text-[10.5px] leading-relaxed text-slate-600">
              이 물건의 <b>회차별 기일·결과</b>, <b>목적물 면적·대지권</b>, <b>감정평가요항표</b>,
              <b>사건 사진</b>은 대법원 사건상세 화면에서만 볼 수 있어 아직 수집되지 않았습니다.
              사건번호를 복사해 대법원 사건검색에 붙여 넣으면 바로 확인할 수 있습니다.
            </p>
            <ul className="mt-1 mb-1.5 space-y-0.5 text-[10px] text-slate-500">
              <li>· 기일내역 — 회차별 기일·결과·최저가</li>
              <li>· 면적·대지권 — 토지·건물·전유부 목록</li>
              <li>· 감정평가요항표 — 감정 이유 요약</li>
              <li>· 사건 사진 — 법원이 촬영한 현장 사진</li>
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <CopyButton onCopy={onCopy} caseNo={caseNo} copied={copied} />
              <a
                href={item.detailUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-50"
                title="대법원 사건상세는 주소만으로 열리지 않습니다 — 사건검색 화면에서 사건번호를 붙여 넣으세요"
              >
                대법원 사건검색 열기 ↗
              </a>
            </div>
          </Section>
        ) : (
          <>
        <Section
          title="기일내역"
          hint={schedule.length ? `${schedule.length}회` : "미수집"}
        >
          {schedule.length ? (
            <table className="w-full text-[10px]">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-0.5 font-medium">기일</th>
                  <th className="py-0.5 font-medium">종류</th>
                  <th className="py-0.5 text-right font-medium">결과</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s, i) => (
                  <tr key={`${s.date}-${i}`} className="border-t border-slate-100">
                    <td className="py-0.5">
                      {formatSaleDate(s.date)}
                      {s.time ? (
                        <span className="text-slate-400"> {s.time.slice(0, 2)}:{s.time.slice(2)}</span>
                      ) : null}
                    </td>
                    <td className="py-0.5 text-slate-500">{s.kind || "매각기일"}</td>
                    <td className="py-0.5 text-right font-semibold text-slate-700">{s.result || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <MissingNote what="회차별 기일·결과" caseNo={caseNo} onCopy={onCopy} copied={copied} />
          )}
          {schedule.some((s) => s.place) && (
            <p className="mt-1 break-words text-[9.5px] text-slate-500">
              장소: {schedule.find((s) => s.place)?.place}
            </p>
          )}
        </Section>

        <Section
          title="목록·면적"
          hint={
            detail?.areas?.length
              ? `${detail.areas.length}건`
              : detail?.lists?.length
                ? `${detail.lists.length}건`
                : "미수집"
          }
        >
          {detail?.areas?.length ? (
            <ul className="space-y-0.5 text-[10.5px]">
              {detail.areas.map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-[1px] text-[9.5px] font-semibold text-slate-600">
                    {a.kind}
                  </span>
                  <span className="min-w-0 break-words text-slate-700">{a.detail}</span>
                </li>
              ))}
            </ul>
          ) : detail?.lists?.length ? (
            <ul className="space-y-1 text-[10.5px]">
              {detail.lists.map((l, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-[1px] text-[9.5px] font-semibold text-slate-600">
                    {l.kind}
                  </span>
                  <span className="min-w-0 break-words text-slate-700">{l.address}</span>
                </li>
              ))}
              <li className="pt-0.5 text-[9.5px] leading-relaxed text-slate-400">
                면적(전용·대지권)은 법원 사건상세의 목적물 목록에서만 나옵니다 — 필요하면 원문에서 확인하세요.
              </li>
            </ul>
          ) : (
            <MissingNote what="목적물 면적·대지권 내역" caseNo={caseNo} onCopy={onCopy} copied={copied} />
          )}
        </Section>

        <Section
          title="감정평가 요항"
          hint={detail?.appraisalNote ? "원문" : "미수집"}
        >
          {detail?.appraisalNote ? (
            <p className="whitespace-pre-wrap break-words text-[10.5px] leading-relaxed text-slate-700">
              {detail.appraisalNote}
            </p>
          ) : (
            <MissingNote what="감정평가요항표" caseNo={caseNo} onCopy={onCopy} copied={copied} />
          )}
        </Section>

        <Section title="사건 사진" hint={detail?.photos?.length ? `${detail.photos.length}장` : "미수집"}>
          {detail?.photos?.length ? (
            <div className="grid grid-cols-2 gap-1">
              {detail.photos.slice(0, 6).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${caseNo} 사건 사진 ${i + 1}`}
                  className="h-24 w-full rounded border border-slate-200 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <MissingNote what="법원 사건 사진" caseNo={caseNo} onCopy={onCopy} copied={copied} />
          )}
        </Section>
          </>
        )}

        <Section title="임차인·권리분석" hint="매각물건명세서">
          <p className="text-[10.5px] leading-relaxed text-slate-600">
            임차인·배당요구·인수되는 권리는 <b>매각물건명세서</b>와 현황조사서에서 확인합니다.
            대법원은 매각물건명세서를 <b>매각기일 1주 전부터</b>, 현황조사서·감정평가서를 2주 전부터
            공개합니다. 리디브는 이 문서를 가공하지 않고, 아래 사건번호로 대법원 원문에서 바로
            찾아볼 수 있게 연결합니다.
          </p>
          {specSheetId && (
            <p className="mt-1 text-[10px] text-slate-500">
              이 물건은 법원에 <b>매각물건명세서</b>가 등록되어 있습니다. 대법원 사건검색에서
              사건번호를 열면 「매각물건명세서」 버튼으로 바로 볼 수 있습니다.
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <CopyButton onCopy={onCopy} caseNo={caseNo} copied={copied} />
            <a
              href={item.detailUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-50"
              title="대법원 사건상세는 주소만으로 열리지 않습니다 — 사건검색 화면에서 사건번호를 붙여 넣으세요"
            >
              대법원 사건검색 열기 ↗
            </a>
          </div>
        </Section>
      </div>

      {/* 동작 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onLocate && (
          <button
            type="button"
            onClick={() => onLocate(item)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
          >
            📍 지도에서 위치
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-amber-800 hover:border-amber-500 hover:bg-amber-50"
        >
          ⚖️ 경매 {saleCount}건 목록으로
        </button>
      </div>

      <p className="mt-2 text-[9.5px] leading-relaxed text-slate-400">
        대법원 법원경매정보 원문 기준{asOf ? ` · ${asOf} 수집` : ""}. 사건상세(기일내역·면적·감정평가요항·사진)는
        대법원 사건상세 조회에서만 나오므로, 수집되지 않은 항목은 원문에서 확인하세요. 매각기일·최저가는
        변경될 수 있습니다.
        {detail?.collectedAt ? ` · 상세 ${detail.collectedAt.slice(0, 10)} 수집` : ""}
      </p>
    </div>
  );
}
