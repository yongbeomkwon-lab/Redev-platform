"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneAppraisalRank — 구역 상세 패널의 「📊 추정 감평 순위 (공시가격 기반)」
//
//   구역 안 필지마다 국토부 공시가격을 모아(공동주택 호별 · 개별주택 · 개별공시지가×면적)
//   **보정률을 곱한 추정 감정가**로 1등~꼴등 순위와 분위 분포를 보여 준다.
//   · 값은 `/api/zone-appraisal-rank` 가 두 단계로 낸다 — ① 구역 필지 목록(plan)
//     ② 필지별 공시가격(appraise, 25필지씩). 화면은 ②를 2개씩 나란히 보내며 진행률을 그린다.
//   · 순위·분위 계산은 **화면에서** 한다(`lib/appraisal-rank.ts`). 보정률 슬라이더를 움직일 때
//     서버를 다시 부르지 않아야 즉시 반응하고, 같은 구역을 다시 열면 저장해 둔 결과로 바로 뜬다.
//   · 필지가 많은 구역(수백 곳)은 브이월드 왕복이 100회를 넘는다 — 그래서 **자동으로 돌리지 않고**
//     「불러오기」를 눌렀을 때만 조회한다(일일 쿼터·체감 속도). 한 번 받은 구역은 30일 저장.
//   · 광고·비교 문구는 쓰지 않는다. 값의 성격(참고용 추정치)만 카드 아래에 항상 밝힌다.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  matchJibun,
  parseAmount,
  rankItems,
  rankOfAmount,
  summarizeRank,
  wonFull,
  wonLabel,
  type AppraisalItem,
  type RankedItem,
} from "@/lib/appraisal-rank";
import type { ZoneShapeInput } from "@/lib/zone-stats";

/** 기본 보정률 — 공시가격에 곱해 추정 감정가를 낸다(사용자가 슬라이더로 바꾼다) */
const DEFAULT_MULTIPLIER = 1.3;
const MIN_MULTIPLIER = 0.8;
const MAX_MULTIPLIER = 2;
/** 한 요청에 담는 필지 수 — 서버 상한(30)보다 작게 둬 함수 시간을 안전하게 지킨다 */
const CHUNK = 25;
/** 동시에 보내는 청크 수 */
const PARALLEL = 2;
const CACHE_PREFIX = "redev-appraisal:v2:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** localStorage 에 담는 항목 수 상한 — 아파트 대단지(수천 호)까지 담되 넘으면 저장하지 않는다 */
const CACHE_MAX_ITEMS = 8000;

type PlanParcel = {
  pnu: string;
  jibun: string;
  addr: string | null;
  label: string;
  areaSqm: number | null;
};

type RankData = {
  year: number;
  items: AppraisalItem[];
  parcels: number;
  missing: number;
  /** 도로·구거·하천 등 공공 지목이라 순위에서 뺀 필지 수 */
  excluded: number;
  errors: string[];
};

type RankState =
  | { status: "idle" }
  | { status: "loading"; phase: "plan" | "appraise"; done: number; total: number }
  | { status: "ok"; data: RankData; at: number }
  | { status: "error"; message: string; detail?: string; hint?: string };

type PlanResponse =
  | {
      ok: true;
      mode: "plan";
      parcels: PlanParcel[];
      total: number;
      meta: { requests: number; truncated: boolean; excluded: number };
    }
  | { ok: false; error: string; detail?: string; hint?: string };

type AppraiseResponse =
  | {
      ok: true;
      mode: "appraise";
      year: number;
      items: AppraisalItem[];
      parcels: { pnu: string; count: number; missing: boolean; error: string | null }[];
      meta: { requests: number; missing: number; errors: string[]; truncated: boolean };
    }
  | { ok: false; error: string; detail?: string; hint?: string };

class AppraisalError extends Error {
  detail?: string;
  hint?: string;
  constructor(message: string, detail?: string, hint?: string) {
    super(message);
    this.detail = detail;
    this.hint = hint;
  }
}

function n(v: number): string {
  return v.toLocaleString("ko-KR");
}

/** 요약 한 칸 — 라벨(작게) + 큰 금액 */
function Stat({
  label,
  value,
  sub,
  tone = "slate",
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "emerald" | "amber" | "sky" | "rose";
  testId?: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "sky"
          ? "text-sky-700"
          : tone === "rose"
            ? "text-rose-700"
            : "text-slate-900";
  return (
    <div className="min-w-0 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
      <div className="truncate text-[10px] font-medium text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums leading-tight ${toneClass}`} data-testid={testId}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[9.5px] text-slate-400">{sub}</div>}
    </div>
  );
}

const BUCKET_COLOR: Record<string, string> = {
  top10: "bg-rose-500",
  top25: "bg-amber-500",
  mid: "bg-emerald-500",
  low25: "bg-sky-500",
  bottom: "bg-slate-400",
};

export default function ZoneAppraisalRank({
  shape,
  areaSqm = null,
  className = "",
}: {
  shape: ZoneShapeInput;
  areaSqm?: number | null;
  className?: string;
}) {
  const [state, setState] = useState<RankState>({ status: "idle" });
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER);
  const [lookupMode, setLookupMode] = useState<"jibun" | "amount">("jibun");
  const [query, setQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // 구역이 바뀌면 다시 계산한다 — 링 전체를 의존성으로 쓰면 매 렌더마다 바뀌므로 요약 키를 쓴다
  const requestKey = useMemo(() => {
    const first = shape.polygon?.[0];
    const last = shape.polygon?.[shape.polygon.length - 1];
    return [
      shape.polygon?.length ?? 0,
      first?.[0] ?? 0,
      first?.[1] ?? 0,
      last?.[0] ?? 0,
      last?.[1] ?? 0,
      (shape.parts?.length ?? 0) + (shape.holes?.length ?? 0),
      areaSqm ?? 0,
    ].join(":");
  }, [shape, areaSqm]);

  // 구역이 바뀌면 진행 중인 조회를 멈추고, 저장해 둔 결과가 있으면 바로 보여 준다
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
    setQuery("");
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CACHE_PREFIX + requestKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { at?: number; data?: RankData };
      if (!parsed?.data || typeof parsed.at !== "number") return;
      if (Date.now() - parsed.at > CACHE_TTL_MS) {
        window.localStorage.removeItem(CACHE_PREFIX + requestKey);
        return;
      }
      setState({ status: "ok", data: parsed.data, at: parsed.at });
    } catch {
      /* localStorage 차단·깨진 값 — 그냥 처음부터 */
    }
  }, [requestKey]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const run = useCallback(async () => {
    if (abortRef.current) return; // 이미 돌고 있다
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading", phase: "plan", done: 0, total: 0 });

    try {
      // ① 구역 안 필지 목록 — 연속지적도 1~3회
      const planRes = await fetch("/api/zone-appraisal-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "plan", shape }),
        signal: controller.signal,
      });
      const plan = (await planRes.json()) as PlanResponse;
      if (!plan.ok) throw new AppraisalError(plan.error, plan.detail, plan.hint);
      const parcels = plan.parcels ?? [];
      const total = parcels.length;
      if (total === 0) {
        abortRef.current = null;
        setState({
          status: "error",
          message: "구역 안에서 필지를 찾지 못했습니다 — 경계가 실제 필지와 어긋났거나(가상경계·근사원) 지적도에 필지가 없는 자리입니다.",
        });
        return;
      }

      // ② 필지별 공시가격 — 25필지씩, 2개씩 나란히
      const chunks: PlanParcel[][] = [];
      for (let i = 0; i < parcels.length; i += CHUNK) chunks.push(parcels.slice(i, i + CHUNK));
      setState({ status: "loading", phase: "appraise", done: 0, total });

      let done = 0;
      let cursor = 0;
      let year = 0;
      let missing = 0;
      const items: AppraisalItem[] = [];
      const errors: string[] = [];
      let failure: AppraisalError | null = null;

      const worker = async () => {
        while (cursor < chunks.length && !failure) {
          const index = cursor++;
          const chunk = chunks[index];
          const res = await fetch("/api/zone-appraisal-rank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "appraise",
              parcels: chunk.map((p) => ({ pnu: p.pnu, jibun: p.jibun, addr: p.addr, areaSqm: p.areaSqm })),
            }),
            signal: controller.signal,
          });
          const data = (await res.json()) as AppraiseResponse;
          if (!data.ok) throw new AppraisalError(data.error, data.detail, data.hint);
          if (data.year) year = data.year;
          missing += data.meta?.missing ?? 0;
          if (data.meta?.errors?.length) errors.push(...data.meta.errors);
          items.push(...(data.items ?? []));
          done += chunk.length;
          setState({ status: "loading", phase: "appraise", done: Math.min(done, total), total });
        }
      };

      try {
        await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
      } catch (e) {
        failure = e as AppraisalError;
      }
      if (controller.signal.aborted) {
        abortRef.current = null;
        return;
      }
      if (failure) {
        abortRef.current = null;
        const forbidden = /FORBIDDEN|INCORRECT_KEY|INVALID_KEY|UNAVAILABLE_KEY|UNAUTHORIZED/i.test(
          `${failure.message} ${failure.detail ?? ""}`
        );
        setState({
          status: "error",
          message: forbidden
            ? "브이월드가 공시가격 API 인증키를 거절했습니다."
            : "공시가격을 불러오지 못했습니다.",
          detail: failure.detail || failure.message,
          hint: failure.hint,
        });
        return;
      }
      if (items.length === 0) {
        abortRef.current = null;
        setState({
          status: "error",
          message: "구역 필지에서 공시가격을 찾지 못했습니다.",
          detail: errors.slice(0, 3).join(" · ") || undefined,
        });
        return;
      }

      const data: RankData = {
        year: year || new Date().getFullYear() - 1,
        items,
        parcels: total,
        missing,
        excluded: plan.meta?.excluded ?? 0,
        errors: errors.slice(0, 3),
      };
      const at = Date.now();
      abortRef.current = null;
      setState({ status: "ok", data, at });
      if (items.length <= CACHE_MAX_ITEMS) {
        try {
          window.localStorage.setItem(CACHE_PREFIX + requestKey, JSON.stringify({ at, data }));
        } catch {
          /* 저장 실패는 무시 — 결과는 지금 화면에 있다 */
        }
      }
    } catch (e) {
      abortRef.current = null;
      if ((e as Error)?.name === "AbortError") return;
      const err = e as AppraisalError;
      setState({
        status: "error",
        message: err?.message?.startsWith("VWORLD") || err?.message?.startsWith("NO_")
          ? "공시가격을 불러오지 못했습니다."
          : ((e as Error)?.message ?? String(e)),
        detail: err?.detail,
        hint: err?.hint,
      });
    }
  }, [shape, requestKey]);

  const ranked: RankedItem[] = useMemo(
    () => (state.status === "ok" ? rankItems(state.data.items, multiplier) : []),
    [state, multiplier]
  );
  const summary = useMemo(() => summarizeRank(ranked), [ranked]);

  /** 지번 datalist — 같은 지번이 여러 호로 늘어서므로 한 번만 넣는다(최대 400) */
  const jibunOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of ranked) {
      if (seen.has(r.jibun)) continue;
      seen.add(r.jibun);
      out.push(r.jibun);
      if (out.length >= 400) break;
    }
    return out;
  }, [ranked]);

  const allMatches = useMemo(
    () => (lookupMode === "jibun" ? matchJibun(ranked, query) : []),
    [lookupMode, ranked, query]
  );
  const matches = useMemo(() => allMatches.slice(0, 6), [allMatches]);
  const amount = useMemo(
    () => (lookupMode === "amount" ? parseAmount(query) : null),
    [lookupMode, query]
  );
  const amountRank = useMemo(
    () => (amount != null ? rankOfAmount(ranked, amount) : null),
    [amount, ranked]
  );
  const top5 = useMemo(() => ranked.slice(0, 5), [ranked]);

  const okState = state.status === "ok" ? state : null;
  const loadingState = state.status === "loading" ? state : null;
  const hasData = okState != null;
  const progressPct =
    loadingState && loadingState.total > 0
      ? Math.min(99, Math.round((loadingState.done / loadingState.total) * 100))
      : 0;

  return (
    <div
      className={`mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2 py-1.5 ${className}`}
      data-testid="zone-appraisal-rank"
    >
      <div className="flex items-center justify-between gap-1">
        <p className="min-w-0 truncate text-[11px] font-bold text-emerald-900">
          📊 추정 감평 순위 <span className="font-medium text-emerald-700">공시가격 기반</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {okState && (
            <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              {okState.data.year}년 공시
            </span>
          )}
          {loadingState ? (
            <button
              type="button"
              onClick={cancel}
              className="shrink-0 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              중단
            </button>
          ) : hasData ? (
            <button
              type="button"
              onClick={() => void run()}
              data-testid="zone-appraisal-run"
              className="shrink-0 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              ↻ 다시
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              data-testid="zone-appraisal-run"
              className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-800"
            >
              {state.status === "error" ? "다시 시도" : "불러오기"}
            </button>
          )}
        </div>
      </div>

      {state.status === "idle" && (
        <p className="mt-1 break-keep text-[10px] leading-snug text-emerald-900/80">
          구역 안 필지의 <b className="font-semibold">국토부 공시가격</b>(아파트 호별·단독주택·공시지가)을 모아{" "}
          <b className="font-semibold">보정률을 곱한 추정 감정가</b>로 순위와 분위를 냅니다. 필지 수만큼 브이월드를 조회해
          200필지면 30초 안팎 걸립니다.
        </p>
      )}

      {loadingState && (
        <div className="mt-1" data-testid="zone-appraisal-progress">
          <div className="h-1 w-full overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
              style={{ width: `${loadingState.phase === "plan" ? 4 : progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-medium text-emerald-900">
            {loadingState.phase === "plan"
              ? "구역 안 필지를 찾는 중…"
              : `공시가격 조회 중 ${progressPct}% (${n(loadingState.done)}/${n(loadingState.total)}필지)…`}
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
          <p className="text-[10px] font-semibold text-amber-900">{state.message}</p>
          {state.detail && <p className="mt-0.5 break-keep text-[9.5px] leading-snug text-amber-800">{state.detail}</p>}
          {state.hint && <p className="mt-0.5 break-keep text-[9.5px] leading-snug text-amber-700">{state.hint}</p>}
        </div>
      )}

      {hasData && (
        <div className="mt-1.5" data-testid="zone-appraisal-result">
          {/* 보정률 — 슬라이더를 움직이면 순위·분위가 즉시 다시 계산된다 */}
          <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
            <span className="shrink-0 text-[10px] font-semibold text-slate-600">보정률</span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-700" data-testid="zone-appraisal-mult">
              ×{multiplier.toFixed(2)}
            </span>
            <input
              type="range"
              min={MIN_MULTIPLIER}
              max={MAX_MULTIPLIER}
              step={0.05}
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              aria-label="추정 감정가 보정률"
              className="h-1 min-w-0 flex-1 accent-emerald-600"
              data-testid="zone-appraisal-slider"
            />
            <button
              type="button"
              onClick={() => setMultiplier(DEFAULT_MULTIPLIER)}
              className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-600 hover:bg-slate-200"
            >
              기본 1.30
            </button>
          </div>
          <p className="mt-0.5 break-keep text-[9.5px] leading-snug text-slate-500">
            추정 감정가 = 공시가격 × {multiplier.toFixed(2)} · 총 {n(summary.count)}건(호·필지)
            {okState && okState.data.missing > 0 && ` · 공시가격 없음 ${n(okState.data.missing)}필지(도로·제각 등)`}
          </p>

          {/* 분위 요약 */}
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <Stat label="최고" value={wonLabel(summary.max)} tone="rose" testId="zone-appraisal-max" />
            <Stat label="상위 10%" value={wonLabel(summary.top10)} tone="amber" />
            <Stat label="상위 25%" value={wonLabel(summary.top25)} tone="amber" testId="zone-appraisal-p25" />
            <Stat label="중위" value={wonLabel(summary.median)} tone="slate" testId="zone-appraisal-median" />
            <Stat label="하위 25%" value={wonLabel(summary.low25)} tone="sky" />
            <Stat label="최저" value={wonLabel(summary.min)} tone="sky" testId="zone-appraisal-min" />
          </div>

          {/* 5구간 분포 — 막대 길이는 건수 비율 */}
          <div className="mt-1.5 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-200" data-testid="zone-appraisal-dist">
            <div className="mb-1 flex items-baseline justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-700">분위 분포</span>
              <span className="text-[9.5px] font-medium text-slate-400">순위 5구간 · 추정 감정가</span>
            </div>
            <div className="space-y-1">
              {summary.buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-1.5">
                  <span className="w-[52px] shrink-0 text-[9.5px] font-medium text-slate-600">{b.label}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${BUCKET_COLOR[b.key] ?? "bg-slate-400"}`}
                      style={{ width: `${Math.max(3, Math.round((b.count / Math.max(1, summary.count)) * 100))}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[9.5px] tabular-nums text-slate-500">
                    {n(b.count)}건
                  </span>
                  <span
                    className="w-[76px] shrink-0 truncate text-right text-[9.5px] tabular-nums text-slate-400"
                    title={`${wonFull(b.max)} ~ ${wonFull(b.min)}`}
                  >
                    {wonLabel(b.max)}~{wonLabel(b.min)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 순위 조회 — 지번 또는 금액 */}
          <div className="mt-1.5 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-200" data-testid="zone-appraisal-lookup">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-700">내 물건 순위</span>
              <div className="flex gap-0.5">
                {(
                  [
                    ["jibun", "지번"],
                    ["amount", "금액"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setLookupMode(key);
                      setQuery("");
                    }}
                    className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${
                      lookupMode === key ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="text"
                inputMode={lookupMode === "amount" ? "numeric" : "text"}
                list={lookupMode === "jibun" ? "zone-appraisal-jibun" : undefined}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lookupMode === "jibun" ? "지번 (예: 467-19)" : "금액 (예: 9억 8000만)"}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                data-testid="zone-appraisal-query"
              />
              {lookupMode === "jibun" && (
                <datalist id="zone-appraisal-jibun">
                  {jibunOptions.map((j) => (
                    <option key={j} value={j} />
                  ))}
                </datalist>
              )}
            </div>

            {lookupMode === "jibun" && query.trim() && matches.length === 0 && (
              <p className="mt-1 text-[10px] text-slate-500">구역 안에서 그 지번을 찾지 못했습니다.</p>
            )}
            {lookupMode === "jibun" && matches.length > 0 && (
              <div className="mt-1 space-y-1" data-testid="zone-appraisal-match">
                {matches.map((m, i) => (
                  <div key={`${m.pnu}-${m.dongNm ?? ""}-${m.hoNm ?? ""}-${i}`} className="rounded-lg bg-emerald-50/70 px-2 py-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="min-w-0 truncate text-[10.5px] font-semibold text-slate-800">
                        {m.jibun}
                        {m.kind === "apart" && (m.dongNm || m.hoNm) && (
                          <span className="font-normal text-slate-500">
                            {" "}
                            {m.dongNm ?? ""}
                            {m.dongNm ? "동" : ""} {m.hoNm ?? ""}
                            {m.hoNm ? "호" : ""}
                          </span>
                        )}
                        {m.kind === "apart" && m.complexNm && (
                          <span className="font-normal text-slate-400"> {m.complexNm}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-700" data-testid="zone-appraisal-rank-of">
                        {n(summary.count)}건 중 {n(m.rank)}위
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-[9.5px] text-slate-500">
                        상위 {m.pctFromTop.toFixed(1)}% · {m.kind === "land" ? "공시지가×면적" : m.kind === "house" ? "개별주택가격" : "호별 공시가격"}{" "}
                        {wonLabel(m.price)}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums text-slate-700" title={wonFull(m.estimated)}>
                        추정 {wonLabel(m.estimated)}
                      </span>
                    </div>
                  </div>
                ))}
                {allMatches.length > matches.length && (
                  <p className="text-[9.5px] text-slate-400">
                    같은 지번 {n(allMatches.length)}건 중 상위 {matches.length}건만 보입니다.
                  </p>
                )}
              </div>
            )}

            {lookupMode === "amount" && amountRank && (
              <div className="mt-1 rounded-lg bg-emerald-50/70 px-2 py-1" data-testid="zone-appraisal-amount-rank">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[10.5px] font-semibold text-slate-800">{wonLabel(amount ?? 0)}</span>
                  <span className="text-[11px] font-bold tabular-nums text-emerald-700">
                    {n(amountRank.count)}건 중 {n(amountRank.rank)}위
                  </span>
                </div>
                <p className="mt-0.5 text-[9.5px] text-slate-500">
                  상위 {amountRank.pctFromTop.toFixed(1)}% · 이 금액보다 높은 물건 {n(amountRank.higher)}건
                  {amountRank.equal > 0 && ` · 같은 금액 ${n(amountRank.equal)}건`}
                </p>
              </div>
            )}

            {top5.length > 0 && (
              <div className="mt-1.5 border-t border-slate-100 pt-1">
                <p className="text-[9.5px] font-semibold text-slate-500">상위 5건</p>
                <ul className="mt-0.5 space-y-0.5">
                  {top5.map((t) => (
                    <li key={`${t.pnu}-${t.dongNm ?? ""}-${t.hoNm ?? ""}-${t.rank}`} className="flex items-baseline justify-between gap-1">
                      <span className="min-w-0 truncate text-[9.5px] text-slate-600">
                        <span className="font-semibold text-slate-700">{n(t.rank)}위</span> {t.jibun}
                        {t.kind === "apart" && (t.dongNm || t.hoNm)
                          ? ` ${t.dongNm ?? ""}${t.dongNm ? "동" : ""} ${t.hoNm ?? ""}${t.hoNm ? "호" : ""}`
                          : ""}
                      </span>
                      <span className="shrink-0 text-[9.5px] font-semibold tabular-nums text-slate-700">
                        {wonLabel(t.estimated)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {okState && okState.data.errors.length > 0 && (
            <p className="mt-1 break-keep text-[9.5px] leading-snug text-amber-700">
              일부 필지 조회 실패: {okState.data.errors.join(" · ")}
            </p>
          )}

          <p className="mt-1.5 break-keep text-[9.5px] leading-snug text-slate-500">
            국토부 공시가격 기반 <b className="font-semibold text-slate-600">참고용 추정치</b>이며 실제 감정평가·1인
            다물권 합산과는 다를 수 있습니다.
          </p>
          <p className="mt-0.5 break-keep text-[9.5px] leading-snug text-slate-400">
            공동주택은 호별 공시가격, 단독·다가구는 개별주택가격, 나대지·상가는 개별공시지가×토지면적으로 계산했습니다.
            공시가격이 없는 필지(도로·구거·미등록)는 빠지고, 공유지분 필지는 지분과 무관하게 필지 전체로 잡힙니다.
            {okState && okState.data.excluded > 0 &&
              ` 도로·구거·하천 등 공공 지목 ${n(okState.data.excluded)}필지는 개별 물권이 아니라 순위에서 뺐습니다.`}
            {okState &&
              ` 저장된 결과 ${new Date(okState.at).getMonth() + 1}월 ${new Date(okState.at).getDate()}일.`}
          </p>
        </div>
      )}
    </div>
  );
}
