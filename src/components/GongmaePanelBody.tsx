"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 🏛️ 공매(온비드) 목록·상세 — 경매 패널(AuctionPanel) 안의 「공매」 탭 본문
//
//   · 경매(대법원)와 같은 패널·같은 자리를 쓰되 색은 틸, 아이콘은 🏛️ 로 갈라 보여 준다.
//   · 주소(지번)별로 묶는다 — 온비드 공매는 한 건물의 호실이 여러 건으로 올라온다(마곡동 798-8 106건).
//   · 값은 **온비드가 준 것만** 보여 준다. 감정가·최저입찰가·입찰기간·유찰횟수·상태·재산유형이 전부다.
//     권리분석(임차인·등기)은 온비드 목록 API 에 없으므로 만들지 않고, 원문 확인으로 넘긴다.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { formatWon } from "@/lib/auctions";
import {
  formatBidPeriod,
  daysUntilBidEnd,
  ONBID_SEARCH_URL,
  type GongmaeAuctionItem,
  type GongmaeMeta,
} from "@/lib/gongmae";

export const GONGMAE_ACCENT = "#0f766e";

const STATUS_TONE: Record<string, string> = {
  입찰준비중: "bg-teal-50 text-teal-800 ring-teal-200",
  입찰진행중: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  수의계약가능: "bg-amber-50 text-amber-800 ring-amber-200",
  입찰마감: "bg-slate-100 text-slate-500 ring-slate-200",
};

/** `서울특별시 강서구 마곡동 730-82 판매시설-1(1704동) 204호 판매시설` → `204호` */
function unitLabel(it: GongmaeAuctionItem): string {
  const name = it.gongmae.name || "";
  const m = name.match(/(\d[0-9A-Za-z가-힣\-()]*호(?:\s*(?:및|,)\s*\d+호)?)/);
  if (m) return m[1].slice(0, 20);
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(-2).join(" ").slice(0, 24);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      <dt className="whitespace-nowrap pt-[1px] text-[10px] text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-[11.5px] leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

export function GongmaeList({
  items,
  meta,
  zoneTotal,
  onShowZoneAll,
  onOpen,
}: {
  items: GongmaeAuctionItem[];
  meta?: GongmaeMeta | null;
  zoneTotal?: number;
  onShowZoneAll?: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const PER_GROUP = 4;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) =>
          `${it.address} ${it.jibun} ${it.gongmae.name} ${it.usage} ${it.gongmae.cltrMngNo}`
            .toLowerCase()
            .includes(q)
        )
      : items;
    const m = new Map<string, GongmaeAuctionItem[]>();
    for (const it of filtered) {
      const key = it.gongmae.jibun || it.address || "기타";
      const arr = m.get(key);
      if (arr) arr.push(it);
      else m.set(key, [it]);
    }
    return [...m.entries()]
      .map(([key, list]) => ({
        key,
        items: [...list].sort(
          (a, b) => (a.gongmae.bidEnd || "").localeCompare(b.gongmae.bidEnd || "")
        ),
      }))
      .sort(
        (a, b) =>
          (a.items[0].gongmae.bidEnd || "").localeCompare(b.items[0].gongmae.bidEnd || "")
      );
  }, [items, query]);

  const asOf = meta?.collectedAt ? meta.collectedAt.slice(0, 10) : null;
  const soon = items.filter((it) => {
    const d = daysUntilBidEnd(it.gongmae.bidEndDate);
    return d != null && d >= 0 && d <= 7;
  }).length;

  if (items.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[12px] font-semibold text-slate-700">이 구역에는 지금 공매 물건이 없습니다</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">
          온비드에 입찰 예정·진행 중으로 올라온 서울 부동산 공매 중 이 구역 경계 안에 드는 물건이
          없습니다. 새 공고가 나오면 수집 때마다 반영됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="px-2.5 pb-2.5 pt-2">
      <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-2 py-1.5">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <b className="text-[12px] font-bold text-teal-900">🏛️ 온비드 공매 {items.length}건</b>
          {soon > 0 && (
            <span className="rounded bg-rose-50 px-1.5 py-[1px] text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
              7일 내 마감 {soon}
            </span>
          )}
          {asOf && <span className="ml-auto text-[9.5px] text-teal-800/60">수집 {asOf}</span>}
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-teal-900/70">
          감정가 대비 최저입찰가가 낮은 순서가 아니라 <b>입찰 마감이 가까운 순</b>입니다.
          값은 온비드 공고 원문(감정평가액·최저입찰가격) 기준입니다.
        </p>
        {zoneTotal != null && zoneTotal > items.length && onShowZoneAll && (
          <button
            type="button"
            onClick={onShowZoneAll}
            className="mt-1 rounded-full border border-teal-300 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-teal-800 hover:bg-teal-50"
          >
            구역 전체 공매 {zoneTotal}건 보기
          </button>
        )}
      </div>

      {items.length >= 8 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="주소·물건명·물건관리번호로 찾기"
          aria-label="공매 물건 찾기"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-[11.5px] text-slate-800 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none"
        />
      )}

      {groups.length === 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 px-2 py-3 text-center text-[11px] text-slate-500">
          ‘{query}’에 해당하는 공매 물건이 없습니다.
        </p>
      )}

      <ul className="mt-1.5 space-y-2">
        {groups.map((g) => {
          const open = openGroups.has(g.key);
          const head = g.items[0];
          const visible = open ? g.items : g.items.slice(0, PER_GROUP);
          const hidden = g.items.length - visible.length;
          const d = daysUntilBidEnd(head.gongmae.bidEndDate);
          return (
            <li key={g.key} data-testid="gongmae-group" className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <b className="text-[11px] font-semibold text-slate-800">{g.key}</b>
                {g.items.length > 1 && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    {g.items.length}건
                  </span>
                )}
                {d != null && d >= 0 && d <= 7 && (
                  <span className="ml-auto rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                    D-{d}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-1.5">
                {visible.map((it) => (
                  <li key={it.id}>
                    <GongmaeRow item={it} onOpen={() => onOpen(it.id)} />
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    })
                  }
                  className="mt-1.5 w-full rounded border border-slate-200 py-0.5 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
                >
                  {open ? "접기" : `이 주소 ${g.items.length}건 모두 보기 (+${hidden})`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[9.5px] leading-relaxed text-slate-400">
        출처: 온비드(캠코) 부동산 공매 공고 — 공공데이터포털 API. 온비드 물건 상세는 화면 간 이동만
        지원해 바로 링크되지 않으므로, 물건을 열면 <b>물건관리번호</b>를 복사해 온비드 물건검색에서
        찾을 수 있게 해 둡니다.
      </p>
    </div>
  );
}

function GongmaeRow({ item, onOpen }: { item: GongmaeAuctionItem; onOpen: () => void }) {
  const g = item.gongmae;
  const d = daysUntilBidEnd(g.bidEndDate);
  const urgent = d != null && d >= 0 && d <= 7;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="gongmae-row"
      className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
    >
      <div className="flex items-center gap-1">
        <span className="rounded bg-slate-800 px-1 py-[1px] text-[9.5px] font-semibold text-white">
          {g.usage || g.usageMid || "부동산"}
        </span>
        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-800">{unitLabel(item)}</span>
        <span
          className={`ml-auto shrink-0 rounded px-1 py-[1px] text-[9px] font-semibold ring-1 ${
            STATUS_TONE[g.status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
          }`}
        >
          {g.status || "공매"}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[10.5px] text-slate-500">
        <b className="text-[11.5px] font-bold text-teal-800">최저 {formatWon(g.minimum)}</b>
        {g.minimumRate != null && <span className="text-slate-400">감정가의 {g.minimumRate}%</span>}
        <span className={urgent ? "font-semibold text-rose-600" : ""}>
          {g.bidEndDate ? `${Number(g.bidEndDate.slice(4, 6))}.${Number(g.bidEndDate.slice(6, 8))} 마감` : ""}
        </span>
        {g.failCount ? <span className="text-slate-400">유찰 {g.failCount}회</span> : null}
      </div>
    </button>
  );
}

export function GongmaeDetail({
  item,
  position,
  onBack,
  onPrev,
  onNext,
  onLocate,
  copied,
  onCopy,
}: {
  item: GongmaeAuctionItem;
  position: { index: number; total: number } | null;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onLocate?: (item: GongmaeAuctionItem) => void;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const g = item.gongmae;
  const d = daysUntilBidEnd(g.bidEndDate);
  const urgent = d != null && d >= 0 && d <= 7;

  return (
    <div className="px-2.5 pb-3 pt-2" data-testid="gongmae-detail">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-slate-200 px-1.5 py-[1px] text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          ← 목록
        </button>
        {position && (
          <span className="text-[10px] text-slate-400">
            {position.index} / {position.total}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="rounded border border-slate-200 px-1.5 py-[1px] text-[10.5px] text-slate-600 disabled:opacity-40 hover:enabled:bg-slate-50"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="rounded border border-slate-200 px-1.5 py-[1px] text-[10.5px] text-slate-600 disabled:opacity-40 hover:enabled:bg-slate-50"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-start gap-1">
        <span className="shrink-0 rounded bg-teal-700 px-1.5 py-[1px] text-[10px] font-extrabold text-white">
          🏛️ 공매
        </span>
        <div className="min-w-0">
          <b className="block text-[12.5px] font-bold leading-snug text-slate-900">{g.name || g.address}</b>
          <p className="mt-0.5 text-[10.5px] text-slate-500">
            {g.address} · 온비드 물건관리번호 {g.cltrMngNo}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className={`rounded px-1.5 py-[1px] text-[10px] font-semibold ring-1 ${
            STATUS_TONE[g.status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
          }`}
        >
          {g.status || "공매"}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-[1px] text-[10px] font-medium text-slate-600">
          {g.prptDivNm || "재산유형 미상"}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-[1px] text-[10px] font-medium text-slate-600">
          {g.usageMid || "부동산"} {g.usage ? `· ${g.usage}` : ""}
        </span>
        {urgent && (
          <span className="rounded bg-rose-50 px-1.5 py-[1px] text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
            D-{d} 마감
          </span>
        )}
      </div>

      {/* 가격 — 감정평가액 · 최저입찰가격 */}
      <div className="mt-1.5 rounded-lg border border-teal-200 bg-teal-50/50 px-2 py-1.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[9.5px] font-semibold text-teal-800/70">최저입찰가격</p>
            <p className="text-[17px] font-extrabold leading-tight text-teal-900">{formatWon(g.minimum)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9.5px] text-slate-500">감정평가액</p>
            <p className="text-[12px] font-bold text-slate-700">{formatWon(g.appraised)}</p>
            {g.minimumRate != null && (
              <p className="text-[10px] font-semibold text-teal-700">감정가의 {g.minimumRate}%</p>
            )}
          </div>
        </div>
        <p className="mt-1 text-[10px] text-teal-900/70">
          입찰기간 <b>{formatBidPeriod(g.bidStart, g.bidEnd)}</b>
        </p>
      </div>

      <dl className="mt-1.5 space-y-1">
        <Row label="소재지">{g.address}</Row>
        <Row label="물건명">{g.name}</Row>
        <Row label="용도">{`${g.usageMid || "-"}${g.usage ? ` · ${g.usage}` : ""}`}</Row>
        <Row label="면적">{g.area || "-"}</Row>
        <Row label="재산유형">{g.prptDivNm || "-"}</Row>
        <Row label="공고기관">{g.rqstOrgNm || "-"}</Row>
        <Row label="유찰">{g.failCount != null ? `${g.failCount}회` : "-"}</Row>
        <Row label="입찰방식">{g.batcBidYn === "Y" ? "일괄입찰" : "물건 단위"}</Row>
        <Row label="지분">{g.alcYn === "Y" ? "지분 매각(전체가 아님)" : "전체 매각"}</Row>
        {g.dtbtRqrEdtmCont && <Row label="배분요구종기">{g.dtbtRqrEdtmCont}</Row>}
        {g.evcRsbyTrgtCont && <Row label="인수 책임">{g.evcRsbyTrgtCont}</Row>}
      </dl>

      <div className="mt-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onCopy(g.cltrMngNo, `gongmae:${g.cltrMngNo}`)}
          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied === `gongmae:${g.cltrMngNo}` ? "물건관리번호 복사됨 ✓" : "물건관리번호 복사"}
        </button>
        <a
          href={g.detailUrl || ONBID_SEARCH_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[10.5px] font-semibold text-teal-800 hover:bg-teal-100"
        >
          온비드에서 찾기 ↗
        </a>
        {onLocate && (
          <button
            type="button"
            onClick={() => onLocate(item)}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            📍 지도 위치
          </button>
        )}
      </div>

      {g.img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={g.img}
          alt={g.name}
          className="mt-1.5 h-32 w-full rounded-lg border border-slate-200 object-cover"
          referrerPolicy="no-referrer"
        />
      )}

      <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[9.5px] leading-relaxed text-slate-500">
        온비드 목록 공고에는 <b>임차인·등기 권리관계가 없습니다</b>. 입찰 전 온비드 물건 상세의
        ‘권리분석’과 현황조사서를 원문에서 확인하세요. 위 값은 공고 시점 기준이며 정정공고가 나면 달라질 수 있습니다.
      </p>
      <p className="mt-1 text-[9px] text-slate-400">
        출처: 공공데이터포털 · 한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스(15157207)
      </p>
    </div>
  );
}
