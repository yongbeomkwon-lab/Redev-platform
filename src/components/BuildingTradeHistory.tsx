"use client";
// ─────────────────────────────────────────────────────────────────────────────
// BuildingTradeHistory — 단지·건물 하나의 최근 5년(60개월) 실거래 이력 창
//
//  · 지도 실거래 핀 또는 우측 「최근 실거래가」 목록의 아파트·연립다세대 행을 누르면 열린다.
//  · 지금까지는 구역(법정동) 전체 거래가 한꺼번에 나왔다 → 이 창은 **그 단지 하나**의
//    5년 흐름(가격 추이·최고/최저·평균 평당가)을 보여준다.
//  · 호출은 나눠서 한다 — ① 최근 24개월(첫 화면이 1~2초에 뜬다) ② 나머지 36개월(뒤이어 병합).
//    한 번에 60개월을 부르면 국토부 60콜이 겹쳐 느리고, 서버리스에서 타임아웃 위험이 있다.
//  · 기간(5년/3년/1년)과 전용면적 타입(평형) 필터는 **받아 둔 5년 데이터 안에서** 거른다 —
//    칩을 누를 때마다 다시 부르지 않으므로 즉시 바뀐다.
//  · 차트는 외부 라이브러리 없이 SVG 로 그린다(점·선 + 호버/탭 툴팁).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import {
  eokShort,
  toPyeong,
  type BuildingHistoryResponse,
  type BuildingTradeTarget,
  type MolitTransaction,
} from "@/lib/molit";

/** 첫 호출 — 최근 2년. 두 번째 호출로 나머지 3년을 채운다 */
const FIRST_CHUNK = 24;
/** 전체 창 — 5년 */
const WINDOW_MONTHS = 60;

type Period = 60 | 36 | 12;

const PERIODS: { months: Period; label: string }[] = [
  { months: 60, label: "5년" },
  { months: 36, label: "3년" },
  { months: 12, label: "1년" },
];

const KIND_TONE: Record<string, { bg: string; text: string }> = {
  아파트: { bg: "#0054a6", text: "#ffffff" },
  "연립·다세대": { bg: "#7c3aed", text: "#ffffff" },
};

function ymd(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}

function md(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}.${d}`;
}

/** 오늘 기준 N개월 전 날짜(YYYY-MM-DD) — 기간 필터의 시작일 */
function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * YYYYMM 이 지금부터 몇 달 전인가 — 서버의 `offset` 과 같은 셈법(0 = 이번 달).
 *   국토부 호출 한도로 빠진 달을 그 달만 다시 물어볼 때 쓴다.
 */
function monthOffsetOf(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return -1;
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth() - (y * 12 + (m - 1));
}

/** 거래 목록 병합 — id 로 중복을 없애고 최신순 유지 */
function mergeRows(a: MolitTransaction[], b: MolitTransaction[]): MolitTransaction[] {
  const seen = new Set(a.map((r) => r.id));
  const out = [...a];
  for (const r of b) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((x, y) => y.dealDate.localeCompare(x.dealDate) || y.price - x.price);
}

/** 전용면적 타입 클러스터 — 59.98·59.99 같은 표기는 한 타입으로 묶는다(±3㎡) */
type AreaGroup = { key: string; center: number; count: number };

function buildAreaGroups(rows: MolitTransaction[]): AreaGroup[] {
  const areas = [
    ...new Set(
      rows
        .filter((r) => !r.canceled && r.areaSqm && r.areaSqm > 0)
        .map((r) => Math.round((r.areaSqm as number) * 10) / 10)
    ),
  ].sort((a, b) => a - b);

  const groups: { sum: number; n: number; areas: number[] }[] = [];
  for (const a of areas) {
    const g = groups.find((grp) => Math.abs(grp.sum / grp.n - a) <= 3);
    if (g) {
      g.sum += a;
      g.n += 1;
      g.areas.push(a);
    } else {
      groups.push({ sum: a, n: 1, areas: [a] });
    }
  }
  return groups.map((g) => {
    const center = Math.round(g.sum / g.n);
    return { key: String(center), center, count: g.areas.length };
  });
}

/** 거래가 그 면적 타입에 속하는지 — 클러스터 중심 ±3㎡ */
function inAreaGroup(t: MolitTransaction, center: number): boolean {
  if (!t.areaSqm) return false;
  return Math.abs(t.areaSqm - center) <= 3;
}

export default function BuildingTradeHistory({
  target,
  onClose,
}: {
  target: BuildingTradeTarget;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MolitTransaction[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"first" | "older" | "done">("first");
  const [partial, setPartial] = useState(false);
  const [period, setPeriod] = useState<Period>(60);
  const [areaKey, setAreaKey] = useState<string>("all");
  const [visible, setVisible] = useState(30);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const { gu, dong, jibun, kind, name } = target;
  const key = `${gu}|${dong}|${jibun}|${kind}|${name}`;

  // ── 데이터: 24개월 → 나머지 36개월 ───────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    setRows([]);
    setState("loading");
    setError(null);
    setPartial(false);
    setPhase("first");
    setPeriod(60);
    setAreaKey("all");
    setVisible(30);

    const base = new URLSearchParams({ gu, dong, jibun, kind, name });
    const urlOf = (months: number, offset: number) =>
      `/api/transactions/building?${base.toString()}&months=${months}&offset=${offset}`;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    /**
     * 한 구간을 받아 온다.
     *   ① 응답이 partial 이면(국토부 호출 한도 429) 잠깐 쉬었다 다시
     *   ② 그래도 비어 있는 달이 있으면 **그 달만** 하나씩 다시 물어본다(콜이 적어 성공률이 높다)
     *   ③ 끝까지 받지 못한 달이 남을 때만 화면에 ‘일부 달 조회 실패’를 밝힌다
     */
    const loadChunk = async (months: number, offset: number): Promise<MolitTransaction[]> => {
      let rows: MolitTransaction[] = [];
      let missing: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(urlOf(months, offset), { cache: "no-store", signal: ac.signal });
        const json = (await res.json()) as BuildingHistoryResponse;
        if (!alive) return rows;
        if (!json.ok) {
          if (attempt === 0) {
            await sleep(700);
            continue;
          }
          if (!rows.length) throw new Error(json.message ?? "실거래 이력을 불러오지 못했습니다.");
          return rows;
        }
        rows = mergeRows(rows, json.transactions ?? []);
        missing = json.failedMonths ?? [];
        if (!missing.length) return rows;
        await sleep(500);
      }

      // 남은 달만 콕 집어 다시 — 한 달씩이면 호출이 적어 한도에 덜 걸린다
      const stillMissing: string[] = [];
      for (const ym of missing) {
        if (!alive) return rows;
        const off = monthOffsetOf(ym);
        if (off < 0 || off >= WINDOW_MONTHS) continue;
        await sleep(150);
        try {
          const res = await fetch(urlOf(1, off), { cache: "no-store", signal: ac.signal });
          const json = (await res.json()) as BuildingHistoryResponse;
          if (!alive) return rows;
          if (json.ok) rows = mergeRows(rows, json.transactions ?? []);
          else stillMissing.push(ym);
        } catch {
          if (!alive) return rows;
          stillMissing.push(ym);
        }
      }
      if (stillMissing.length) setPartial(true);
      return rows;
    };

    (async () => {
      try {
        const recent = await loadChunk(FIRST_CHUNK, 0);
        if (!alive) return;
        setRows(recent);
        setState("ready");
        setPhase("older");

        const rest = WINDOW_MONTHS - FIRST_CHUNK;
        const older = await loadChunk(rest, FIRST_CHUNK);
        if (!alive) return;
        setRows((prev) => mergeRows(prev, older));
        setPhase("done");
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "네트워크 오류");
        setState((prev) => (prev === "ready" ? prev : "error"));
        setPhase((p) => (p === "first" ? "done" : p));
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Esc 로 닫기 + 뒤 화면 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const areaGroups = useMemo(() => buildAreaGroups(rows), [rows]);
  // 기간이 바뀌었거나 데이터가 늘면 없는 타입은 '전체'로 되돌린다
  useEffect(() => {
    if (areaKey === "all") return;
    if (!areaGroups.some((g) => g.key === areaKey)) setAreaKey("all");
  }, [areaGroups, areaKey]);

  const cutoff = useMemo(() => monthsAgoIso(period), [period]);
  const periodRows = useMemo(
    () => rows.filter((r) => r.dealDate >= cutoff),
    [rows, cutoff]
  );
  const shownRows = useMemo(
    () =>
      areaKey === "all"
        ? periodRows
        : periodRows.filter((r) => inAreaGroup(r, Number(areaKey))),
    [periodRows, areaKey]
  );

  const live = useMemo(() => shownRows.filter((r) => !r.canceled), [shownRows]);
  const canceledCount = shownRows.length - live.length;

  const stats = useMemo(() => {
    const prices = live.map((r) => r.price).filter((v) => v > 0);
    const mean = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    const latestRow = live.length
      ? live.reduce((a, b) => (a.dealDate >= b.dealDate ? a : b))
      : null;
    return {
      count: live.length,
      latest: latestRow,
      max: prices.length ? Math.max(...prices) : null,
      min: prices.length ? Math.min(...prices) : null,
      pyeong: mean(live.map((r) => r.pyeongPrice).filter((v): v is number => !!v && v > 0)),
      landPyeong: mean(
        live.map((r) => r.landPyeongPrice).filter((v): v is number => !!v && v > 0)
      ),
    };
  }, [live]);

  /** 단지명이 같은 다른 지번까지 묶였는지 — 헤더에 '외 N개 지번'으로 밝힌다 */
  const jibuns = useMemo(() => [...new Set(rows.map((r) => r.jibun))], [rows]);
  const kindTone = KIND_TONE[kind] ?? { bg: "#334155", text: "#fff" };
  const periodLabel = PERIODS.find((p) => p.months === period)?.label ?? "5년";

  // 연도 구분선을 넣은 목록(최신순) — '더 보기' 상한까지
  const listGroups = useMemo(() => {
    const out: { year: string; items: MolitTransaction[] }[] = [];
    let count = 0;
    for (const r of shownRows) {
      if (count >= visible) break;
      const y = r.dealDate.slice(0, 4);
      const last = out[out.length - 1];
      if (last && last.year === y) last.items.push(r);
      else out.push({ year: y, items: [r] });
      count += 1;
    }
    return out;
  }, [shownRows, visible]);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
      data-testid="building-history"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 실거래 이력`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-[0_18px_48px_-12px_rgba(16,24,40,.45)] sm:max-h-[88vh] sm:rounded-2xl"
      >
        {/* ── 헤더 ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-line px-4 pb-2.5 pt-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded-[4px] px-1.5 py-[2px] text-[10px] font-bold leading-none"
                  style={{ background: kindTone.bg, color: kindTone.text }}
                >
                  {kind}
                </span>
                <h2 className="truncate text-[17px] font-bold leading-tight tracking-[-0.03em] text-ink">
                  {name}
                </h2>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {gu} {dong} {jibun}
                {jibuns.length > 1 ? ` 외 ${jibuns.length - 1}개 지번` : ""}
                <span className="text-slate-300"> · </span>
                국토부 실거래 · 최근 {periodLabel}
                {phase === "older" && (
                  <span className="ml-1 inline-flex items-center gap-1 text-brand">
                    <span className="inline-block h-2 w-2 animate-spin rounded-full border-[1.5px] border-blue-200 border-t-brand" />
                    나머지 기간 불러오는 중
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              data-testid="building-history-close"
              className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-canvas hover:text-ink"
            >
              ✕
            </button>
          </div>

          {/* 기간 + 타입 필터 */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <div className="inline-flex overflow-hidden rounded-full border border-line bg-white">
              {PERIODS.map((p) => (
                <button
                  key={p.months}
                  type="button"
                  data-testid={`bh-period-${p.months}`}
                  onClick={() => {
                    setPeriod(p.months);
                    setVisible(30);
                  }}
                  className={
                    "px-2.5 py-[3px] text-[11px] font-semibold transition " +
                    (period === p.months
                      ? "bg-brand text-white"
                      : "text-slate-600 hover:bg-brand-tint hover:text-brand")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="h-3.5 w-px bg-line" aria-hidden />
            <div className="flex flex-wrap items-center gap-1">
              <AreaChip active={areaKey === "all"} onClick={() => setAreaKey("all")}>
                전체
              </AreaChip>
              {areaGroups.map((g) => (
                <AreaChip
                  key={g.key}
                  active={areaKey === g.key}
                  onClick={() => {
                    setAreaKey(g.key);
                    setVisible(30);
                  }}
                >
                  {g.center}㎡
                  <span className={"ml-1 font-normal " + (areaKey === g.key ? "text-white/70" : "text-slate-400")}>
                    {toPyeong(g.center)}평
                  </span>
                </AreaChip>
              ))}
            </div>
          </div>
        </div>

        {/* ── 본문 ─────────────────────────────────────────────────────── */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
          {state === "loading" && (
            <div className="px-4 py-14 text-center text-[12px] text-slate-500">
              <span className="mx-auto mb-2 block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-brand" />
              최근 5년 실거래를 불러오는 중…
            </div>
          )}

          {state === "error" && (
            <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
              {error ?? "실거래 이력을 불러오지 못했습니다."}
            </div>
          )}

          {state === "ready" && (
            <>
              {/* 요약 지표 */}
              <div
                data-testid="bh-summary"
                className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5"
              >
                <Stat label={`${periodLabel} 거래`} value={`${stats.count}건`} />
                <Stat
                  label="최근 거래가"
                  value={stats.latest ? eokShort(stats.latest.price) : "-"}
                  sub={stats.latest ? ymd(stats.latest.dealDate) : "거래 없음"}
                  accent
                />
                <Stat
                  label={`${periodLabel} 최고`}
                  value={stats.max !== null ? eokShort(stats.max) : "-"}
                />
                <Stat
                  label={`${periodLabel} 최저`}
                  value={stats.min !== null ? eokShort(stats.min) : "-"}
                />
                <Stat
                  label="평균 평당가"
                  value={stats.pyeong !== null ? `${stats.pyeong.toLocaleString()}만` : "-"}
                  sub={kind === "연립·다세대" && stats.landPyeong
                    ? `지분 ${stats.landPyeong.toLocaleString()}만`
                    : "전용면적 기준"}
                />
              </div>

              {/* 가격 추이 차트 */}
              <div className="border-b border-line px-3 pb-1 pt-2.5">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-[11px] font-bold text-ink">가격 추이</h3>
                  <span className="text-[10px] text-slate-400">
                    점 1개 = 거래 1건 · 해제 거래 제외
                  </span>
                </div>
                <PriceTrendChart
                  rows={live}
                  periodLabel={periodLabel}
                  kind={kind}
                />
              </div>

              {/* 거래 이력 목록 */}
              <div className="px-1 pb-3">
                <div className="flex items-baseline justify-between px-2 pb-1 pt-2">
                  <h3 className="text-[11px] font-bold text-ink">
                    거래 이력 <span className="font-normal text-slate-400">{shownRows.length}건</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    최신순{partial ? " · 일부 달은 호출 한도로 빠짐" : ""}
                  </span>
                </div>

                {shownRows.length === 0 ? (
                  <p className="mx-2 rounded-lg border border-dashed border-line py-8 text-center text-[12px] text-slate-500">
                    최근 {periodLabel} 안에 이 {kind === "아파트" ? "단지" : "건물"}의 국토부 신고 거래가 없습니다.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-line">
                    {listGroups.map((group) => {
                      const items = group.items;
                      if (!items.length) return null;
                      return (
                        <div key={group.year}>
                          <div className="flex items-center gap-2 bg-canvas px-3 py-1">
                            <span className="text-[11px] font-bold text-slate-600">{group.year}년</span>
                            <span className="text-[10px] text-slate-400">{group.items.length}건</span>
                          </div>
                          <ul className="divide-y divide-line/70">
                            {items.map((t) => (
                              <HistoryRow key={t.id} t={t} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                {shownRows.length > visible && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + 40)}
                    className="mt-1.5 w-full rounded-lg border border-line bg-white py-1.5 text-[11px] font-semibold text-brand transition hover:border-brand/40 hover:bg-brand-tint"
                  >
                    {shownRows.length - visible}건 더 보기
                  </button>
                )}

                {canceledCount > 0 && (
                  <p className="px-2 pt-1.5 text-[10px] text-slate-400">
                    해제(취소)된 거래 {canceledCount}건은 목록에만 표시합니다.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-canvas px-4 py-1.5 text-[10px] text-slate-400">
          출처: 국토교통부 실거래가 공개시스템 · 계약일 기준 신고 자료라 최근 1~2개월은 건수가 적을 수 있습니다.
        </div>
      </div>
    </div>
  );
}

function AreaChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2 py-[2px] text-[11px] font-semibold transition " +
        (active
          ? "border-brand bg-brand text-white"
          : "border-line bg-white text-slate-600 hover:border-brand/40 hover:text-brand")
      }
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-[10px] font-semibold text-slate-500">{label}</div>
      <div
        className={
          "mt-0.5 text-[14px] font-bold leading-tight tracking-[-0.02em] " +
          (accent ? "text-brand" : "text-ink")
        }
      >
        {value}
      </div>
      {sub && <div className="text-[9px] leading-tight text-slate-400">{sub}</div>}
    </div>
  );
}

/** 거래 1건 — 계약일 · 전용면적(㎡/평) · 층 · 대지권(연립) · 거래금액 · 평당가 */
function HistoryRow({ t }: { t: MolitTransaction }) {
  const area = t.areaSqm ? `${t.areaSqm.toFixed(t.areaSqm >= 100 ? 0 : 1)}㎡` : null;
  const pyeong = t.areaSqm ? toPyeong(t.areaSqm) : null;
  const landSqm = t.plottageSqm && t.plottageSqm > 0 ? t.plottageSqm : null;
  const direct = (t.dealingType ?? "").includes("직거래");
  return (
    <li
      className={
        "grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-1.5 " +
        (t.canceled ? "bg-rose-50/40" : "bg-white")
      }
    >
      <div className="text-[11px] font-semibold tabular-nums text-slate-500">{md(t.dealDate)}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold text-ink">
          {area ? (
            <>
              <span>전용 {area}</span>
              {pyeong && <span className="text-[10px] font-normal text-slate-500">{pyeong}평</span>}
            </>
          ) : (
            <span className="text-slate-400">면적 미상</span>
          )}
          {t.floor ? <span className="text-[10px] font-normal text-slate-500">{t.floor}층</span> : null}
          {direct && (
            <span className="rounded-[3px] bg-slate-100 px-1 py-px text-[9px] font-bold text-slate-500">
              직거래
            </span>
          )}
          {t.canceled && (
            <span className="rounded-[3px] bg-rose-600 px-1 py-px text-[9px] font-bold text-white">해제</span>
          )}
        </div>
        <div className="truncate text-[10px] text-slate-400">
          {t.kind === "연립·다세대" && landSqm
            ? `대지권 ${landSqm.toFixed(landSqm >= 100 ? 0 : 1)}㎡ (${toPyeong(landSqm)}평)`
            : t.kind === "아파트" && t.buildYear
              ? `${t.buildYear}년 준공`
              : t.jibun}
          {t.canceled && t.canceledDate ? ` · 해제 ${t.canceledDate}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div
          className={
            "text-[13px] font-bold tabular-nums tracking-[-0.02em] " +
            (t.canceled ? "text-rose-400 line-through" : "text-ink")
          }
        >
          {eokShort(t.price)}
        </div>
        <div className="text-[10px] tabular-nums text-slate-500">
          {t.pyeongPrice ? `평당 ${t.pyeongPrice.toLocaleString()}만` : "-"}
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 가격 추이 차트 — 외부 라이브러리 없이 SVG 선·점. 마우스 호버/탭 시 거래 툴팁.
// ─────────────────────────────────────────────────────────────────────────────
const CHART_W = 640;
const CHART_H = 196;
const PAD = { l: 46, r: 12, t: 12, b: 20 };

function PriceTrendChart({
  rows,
  periodLabel,
  kind,
}: {
  rows: MolitTransaction[];
  periodLabel: string;
  kind: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      [...rows]
        .filter((r) => r.price > 0)
        .sort((a, b) => a.dealDate.localeCompare(b.dealDate)),
    [rows]
  );

  const layout = useMemo(() => {
    if (!points.length) return null;
    const times = points.map((p) => Date.parse(p.dealDate));
    const prices = points.map((p) => p.price);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    // 위아래 여백 — 거래가 하나뿐이면 ±10%
    const span = pMax - pMin || Math.max(1000, pMax * 0.2);
    const yMin = Math.max(0, pMin - span * 0.12);
    const yMax = pMax + span * 0.12;
    const innerW = CHART_W - PAD.l - PAD.r;
    const innerH = CHART_H - PAD.t - PAD.b;
    const x = (t: number) =>
      PAD.l + (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
    const y = (v: number) =>
      PAD.t + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

    const coords = points.map((p, i) => ({ p, x: x(times[i]), y: y(p.price) }));
    const ticks = [0, 0.5, 1].map((f) => {
      const v = yMin + (yMax - yMin) * f;
      return { v, y: y(v) };
    });
    const first = points[0].dealDate;
    const last = points[points.length - 1].dealDate;
    const mid = points[Math.floor(points.length / 2)].dealDate;
    return { coords, ticks, first, last, mid, xMin: PAD.l, xMax: CHART_W - PAD.r };
  }, [points]);

  if (!layout) {
    return (
      <p className="rounded-lg border border-dashed border-line py-8 text-center text-[11px] text-slate-400">
        최근 {periodLabel} 거래가 없어 추이를 그릴 수 없습니다.
      </p>
    );
  }

  const active = hover !== null ? layout.coords[hover] : null;
  const path = layout.coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const mm = (iso: string) => `${iso.slice(2, 4)}.${iso.slice(5, 7)}`;

  return (
    <div className="relative" data-testid="bh-chart">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label={`${periodLabel} 가격 추이`}
        onMouseLeave={() => setHover(null)}
      >
        {/* 가로 눈금 */}
        {layout.ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.l}
              x2={CHART_W - PAD.r}
              y1={t.y}
              y2={t.y}
              stroke="#e9edf1"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {eokShort(Math.round(t.v))}
            </text>
          </g>
        ))}

        {/* 가격 선 */}
        <path d={path} fill="none" stroke="#0054a6" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />

        {/* 거래 점 — 호버/탭 대상 */}
        {layout.coords.map((c, i) => {
          const on = hover === i;
          return (
            <g key={c.p.id}>
              <circle
                cx={c.x}
                cy={c.y}
                r={on ? 5 : 3.2}
                fill={on ? "#0054a6" : "#ffffff"}
                stroke="#0054a6"
                strokeWidth={on ? 2 : 1.4}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
              {/* 넓은 투명 판 — 작은 점을 정확히 누르기 어려운 문제를 줄인다 */}
              <circle
                cx={c.x}
                cy={c.y}
                r={9}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}

        {/* 선택 세로선 */}
        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.t}
            y2={CHART_H - PAD.b}
            stroke="#0054a6"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.4}
          />
        )}

        {/* X축 — 시작·중간·끝 */}
        <text x={layout.xMin} y={CHART_H - 5} fontSize={9} fill="#94a3b8">{mm(layout.first)}</text>
        <text x={(layout.xMin + layout.xMax) / 2} y={CHART_H - 5} fontSize={9} fill="#cbd5e1" textAnchor="middle">
          {mm(layout.mid)}
        </text>
        <text x={layout.xMax} y={CHART_H - 5} fontSize={9} fill="#94a3b8" textAnchor="end">{mm(layout.last)}</text>
      </svg>

      {/* 툴팁 — SVG 위에 겹치는 HTML (글자는 그대로 읽힌다) */}
      {active && (
        <div
          className="pointer-events-none absolute z-10 min-w-[132px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-2 py-1.5 shadow-[0_8px_20px_-8px_rgba(16,24,40,.4)]"
          style={{
            left: `${(active.x / CHART_W) * 100}%`,
            top: `${(active.y / CHART_H) * 100}%`,
            marginTop: -8,
          }}
        >
          <div className="text-[10px] font-semibold text-slate-500">{ymd(active.p.dealDate)}</div>
          <div className="text-[13px] font-bold leading-tight text-ink">{eokShort(active.p.price)}</div>
          <div className="text-[10px] leading-tight text-slate-500">
            {active.p.areaSqm ? `전용 ${active.p.areaSqm.toFixed(1)}㎡ (${toPyeong(active.p.areaSqm)}평)` : kind}
            {active.p.floor ? ` · ${active.p.floor}층` : ""}
          </div>
          {(kind === "연립·다세대" ? active.p.landPyeongPrice : active.p.pyeongPrice) ? (
            <div className="text-[10px] leading-tight text-slate-500">
              {kind === "연립·다세대" ? "지분" : "평당"}{" "}
              {(kind === "연립·다세대" ? active.p.landPyeongPrice : active.p.pyeongPrice)!.toLocaleString()}만
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
