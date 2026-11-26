"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneVitalStats — 구역 상세 패널의 「구역현황 (추정)」 + 「정밀 분석」
//
//   구역 폴리곤을 /api/zone-stats 로 보내 그 안의 건축물·필지로
//   노후도(30·20년)·건축물 동수·동수밀도·과소필지율을 받아 카드로 보여준다.
//   · 정식 등록 구역·대표 구역·직접 그린 구역이 같은 컴포넌트를 쓴다.
//   · 숫자는 1차 추정치다(건축물대장 사용승인일 + 연속지적도). 구조·층별 세대수는 반영하지
//     않으므로 재개발닷컴의 구역현황과 다를 수 있다 — 카드 아래 문구로 항상 밝힌다.
//   · 경계가 없는 구역(미고시 후보지)은 부모가 이 컴포넌트를 그리지 않는다.
//
//   「🔬 정밀 분석」은 국토교통부 건축물대장 표제부(getBrTitleInfo)를 구역 안 필지마다
//   조회해 **주구조·사용승인일·세대/가구수·대지면적**으로 서울시 조례 기준 노후도와
//   **조례 기준 호수밀도**, 추정 평균 대지지분을 낸다.
//   · 호수밀도는 서울시 도시 및 주거환경정비 조례 제2조제5호를 따른다 — 공동·다가구주택은
//     '세대(가구)수가 가장 많은 1개 층'을 1동으로 보고, 비주거용은 건축면적 90㎡당 1동이다.
//     그래서 표제부 세대수를 그대로 더한 값보다 작게 나온다(과대계상 해소).
//   · 층별 세대수는 표제부에서 복수 세대·가구이거나 공동·다가구로 확인된 필지에만
//     층별개요(getBrFlrOulnInfo)를 더 물어 확인한다.
//   필지가 많은 구역도 함수 시간(60초)을 넘지 않도록 50필지씩 나눠 보내고 진행률을 보여 준다.
//   결과는 구역별로 localStorage 에 남겨 다시 열 때 즉시 보여 주고, ↻ 로 새로 조회한다.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZoneShapeInput, ZoneStatsPayload, ZoneStatsResponse } from "@/lib/zone-stats";
import {
  sumPrecise,
  type PreciseChunkResponse,
  type PreciseChunkStats,
  type PreciseSummary,
} from "@/lib/zone-ledger";

function n(v: number): string {
  return v.toLocaleString("ko-KR");
}

function man(v: number): string {
  // 연면적은 ㎡ 그대로가 읽기 어려워 만㎡ 로 줄인다(1만㎡ 미만은 ㎡)
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만㎡`;
  return `${n(Math.round(v))}㎡`;
}

/** 지표 한 칸 — 라벨(작게) + 큰 숫자 + 보조설명 */
function Cell({
  label,
  value,
  unit,
  sub,
  tone = "slate",
  testId,
  wrap = false,
  wide = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "slate" | "rose" | "amber" | "sky" | "emerald";
  testId?: string;
  /** 보조설명을 한 줄로 자르지 않고 두 줄까지 보여 준다(정밀 분석 칸) */
  wrap?: boolean;
  /** 한 줄을 다 쓰는 칸(2열 그리드에서 col-span-2) */
  wide?: boolean;
}) {
  const valueTone =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "sky"
          ? "text-sky-700"
          : tone === "emerald"
            ? "text-emerald-700"
            : "text-slate-900";
  return (
    <div className={`min-w-0 rounded-lg bg-slate-50 px-2 py-1.5${wide ? " col-span-2" : ""}`}>
      <div className="truncate text-[10px] font-medium text-slate-500">{label}</div>
      <div className={`flex items-baseline gap-0.5 ${valueTone}`} data-testid={testId}>
        <span className="text-sm font-bold tabular-nums leading-tight">{value}</span>
        {unit && <span className="text-[10px] font-semibold">{unit}</span>}
      </div>
      {sub && (
        <div className={`mt-0.5 text-[10px] text-slate-500 ${wrap ? "break-keep leading-snug" : "truncate"}`}>{sub}</div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-1.5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="h-2 w-14 animate-pulse rounded bg-slate-200" />
          <div className="mt-1.5 h-3.5 w-16 animate-pulse rounded bg-slate-200" />
          <div className="mt-1 h-2 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/** 신통기획 요건 참고 뱃지 — 필수(면적·노후도)와 선택(호수밀도)을 구분한다 */
function Req({ ok, text, note }: { ok: boolean; text: string; note?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "–"}</span>
      {text}
      {note && <span className="font-normal opacity-70">{note}</span>}
    </span>
  );
}

/** 한 번에 보내는 필지 수 — 서버 상한(60)보다 작게 둬 함수 시간을 안전하게 지킨다 */
const CHUNK = 50;
/** 동시에 보내는 청크 수 — 2로 두면 1,400필지 구역도 60초 안에 끝난다 */
const PARALLEL = 2;
const CACHE_PREFIX = "redev-precise:v3:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type PreciseState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "ok"; result: PreciseSummary; at: number }
  | { status: "error"; message: string };

export default function ZoneVitalStats({
  shape,
  areaSqm,
  className = "",
}: {
  shape: ZoneShapeInput;
  /** 구역면적(㎡) — 고시면적이 있으면 그 값을 동수밀도 분모로 쓴다(없으면 도형 면적) */
  areaSqm?: number | null;
  className?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [stats, setStats] = useState<ZoneStatsPayload | null>(null);
  const [meta, setMeta] = useState<{ truncated: boolean } | null>(null);
  const [error, setError] = useState<string>("");
  const [precise, setPrecise] = useState<PreciseState>({ status: "idle" });
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
      areaSqm ?? 0,
    ].join(":");
  }, [shape, areaSqm]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setStatus("loading");
    setStats(null);
    setError("");
    setMeta(null);

    fetch("/api/zone-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shape, areaSqm: areaSqm ?? null }),
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<ZoneStatsResponse>)
      .then((data) => {
        if (!alive) return;
        if (data.ok) {
          setStats(data.stats);
          setMeta({ truncated: data.meta.truncated });
          setStatus("ok");
        } else {
          setError(data.detail || data.error);
          setStatus("error");
        }
      })
      .catch((e) => {
        if (!alive || (e as Error)?.name === "AbortError") return;
        setError(String((e as Error)?.message ?? e));
        setStatus("error");
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // 구역이 바뀌면 정밀 분석 상태를 되돌리고, 저장해 둔 결과가 있으면 바로 보여 준다
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPrecise({ status: "idle" });
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CACHE_PREFIX + requestKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { at?: number; result?: PreciseSummary };
      if (!parsed?.result || typeof parsed.at !== "number") return;
      if (Date.now() - parsed.at > CACHE_TTL_MS) {
        window.localStorage.removeItem(CACHE_PREFIX + requestKey);
        return;
      }
      setPrecise({ status: "ok", result: parsed.result, at: parsed.at });
    } catch {
      /* localStorage 차단·깨진 값 — 그냥 처음부터 */
    }
  }, [requestKey]);

  const cancelPrecise = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPrecise({ status: "idle" });
  }, []);

  /** 구역 안 필지 PNU 목록 — 카드가 이미 받은 stats 를 쓰고, 없으면 다시 한 번 받는다 */
  const loadPnus = useCallback(
    async (): Promise<{
      pnus: string[];
      unknown: string[];
      area: number;
      /** PNU → 연속지적도 필지면적(㎡) — 대장 대지면적이 빈 필지 보완용 */
      parcelAreas: Record<string, number>;
    }> => {
      if (stats?.parcels?.pnus?.length) {
        return {
          pnus: stats.parcels.pnus,
          unknown: stats.unknownPnu ?? [],
          area: stats.areaSqm,
          parcelAreas: stats.parcels.areaByPnu ?? {},
        };
      }
      const res = await fetch("/api/zone-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape, areaSqm: areaSqm ?? null }),
      });
      const data = (await res.json()) as ZoneStatsResponse;
      if (!data.ok) throw new Error(data.detail || data.error);
      return {
        pnus: data.stats.parcels?.pnus ?? [],
        unknown: data.stats.unknownPnu ?? [],
        area: data.stats.areaSqm,
        parcelAreas: data.stats.parcels?.areaByPnu ?? {},
      };
    },
    [stats, shape, areaSqm]
  );

  const runPrecise = useCallback(async () => {
    if (abortRef.current) return; // 이미 돌고 있다
    const controller = new AbortController();
    abortRef.current = controller;
    setPrecise({ status: "running", done: 0, total: 0 });

    try {
      const { pnus, unknown, area, parcelAreas } = await loadPnus();
      if (pnus.length === 0) {
        setPrecise({ status: "error", message: "구역 안 필지(PNU)를 받지 못했습니다 — 경계를 다시 확인해 주세요." });
        abortRef.current = null;
        return;
      }
      const chunks: string[][] = [];
      for (let i = 0; i < pnus.length; i += CHUNK) chunks.push(pnus.slice(i, i + CHUNK));

      let done = 0;
      const total = pnus.length;
      setPrecise({ status: "running", done: 0, total });

      const results: PreciseChunkStats[] = new Array(chunks.length);
      let cursor = 0;
      let failed: string | null = null;

      async function worker() {
        while (cursor < chunks.length && !failed) {
          const index = cursor++;
          // 이 청크 필지의 연속지적도 면적만 보낸다(대장 platArea 가 빈 필지 보완용)
          const chunkAreas: Record<string, number> = {};
          for (const pnu of chunks[index]) {
            const value = parcelAreas[pnu];
            if (typeof value === "number" && value > 0) chunkAreas[pnu] = value;
          }
          const res = await fetch("/api/zone-stats/precise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pnus: chunks[index],
              unknownPnus: unknown.slice(0, 2000),
              parcelAreas: chunkAreas,
            }),
            signal: controller.signal,
          });
          const data = (await res.json()) as PreciseChunkResponse;
          if (!data.ok) throw new Error(data.detail || data.error);
          results[index] = data.chunk;
          done += chunks[index].length;
          setPrecise({ status: "running", done: Math.min(done, total), total });
        }
      }

      try {
        await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          abortRef.current = null;
          return;
        }
        failed = (e as Error)?.message ?? String(e);
      }
      if (failed) {
        abortRef.current = null;
        setPrecise({ status: "error", message: failed });
        return;
      }
      if (controller.signal.aborted) {
        abortRef.current = null;
        return;
      }

      const result = sumPrecise(results, area);
      const at = Date.now();
      try {
        window.localStorage.setItem(CACHE_PREFIX + requestKey, JSON.stringify({ at, result }));
      } catch {
        /* 저장 실패는 무시 — 결과는 지금 화면에 있다 */
      }
      abortRef.current = null;
      setPrecise({ status: "ok", result, at });
    } catch (e) {
      abortRef.current = null;
      if ((e as Error)?.name === "AbortError") return;
      setPrecise({ status: "error", message: (e as Error)?.message ?? String(e) });
    }
  }, [loadPnus, requestKey]);

  const hasBuildings = status === "ok" && stats != null && stats.buildings > 0;
  const preciseResult = precise.status === "ok" ? precise.result : null;
  const preciseTotal = precise.status === "running" ? precise.total : 0;
  const precisePct =
    precise.status === "running" && precise.total > 0
      ? Math.min(99, Math.round((precise.done / precise.total) * 100))
      : 0;

  return (
    <section
      data-testid="zone-vital-stats"
      className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="whitespace-nowrap text-xs font-bold text-slate-800">
          구역현황 <span className="font-medium text-slate-400">(추정)</span>
        </h3>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          연식 색인 기준
        </span>
      </div>

      {status === "loading" && (
        <div>
          <Skeleton />
          <p className="mt-2 text-[10px] text-slate-400">구역 안 건축물·필지를 계산하는 중…</p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5" title={error}>
          <p className="text-[11px] font-semibold text-amber-900">구역현황을 계산하지 못했습니다</p>
          <p className="mt-0.5 text-[10px] leading-snug text-amber-800">
            브이월드 응답이 지연되거나 일시 차단된 상태입니다. 잠시 후 구역을 다시 열면 다시 계산합니다.
          </p>
        </div>
      )}

      {status === "ok" && stats && !hasBuildings && (
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <p className="text-[11px] font-semibold text-slate-700">구역 안에서 건축물을 찾지 못했습니다</p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            경계가 실제 필지와 어긋났거나(가상경계·근사원), 아직 건축물이 없는 나지 구역일 수 있습니다.
          </p>
        </div>
      )}

      {hasBuildings && stats && (
        <div className="grid grid-cols-2 gap-1.5">
          <Cell
            label={`노후도 30년↑ (${stats.over30.cutoffYear}년 이하 승인)`}
            value={`${stats.over30.pct.toFixed(1)}`}
            unit="%"
            sub={`${n(stats.over30.count)}동 / ${n(stats.buildings)}동`}
            tone="rose"
            testId="zone-vital-30"
          />
          <Cell
            label={`노후도 20년↑ (${stats.over20.cutoffYear}년 이하 승인)`}
            value={`${stats.over20.pct.toFixed(1)}`}
            unit="%"
            sub={`${n(stats.over20.count)}동 / ${n(stats.buildings)}동`}
            tone="amber"
            testId="zone-vital-20"
          />
          <Cell
            label="건축물 동수"
            value={n(stats.buildings)}
            unit="동"
            sub={stats.unknownYear > 0 ? `연식 미상 ${n(stats.unknownYear)}동` : "연식 확인 완료"}
            testId="zone-vital-buildings"
          />
          <Cell
            label="동수밀도"
            value={stats.density.toFixed(1)}
            unit="동/ha"
            sub={`구역 ${stats.areaHa.toFixed(2)}ha${stats.areaSource === "shape" ? "(도형)" : ""}`}
            tone="sky"
            testId="zone-vital-density"
          />
          {stats.floorArea.over30Pct != null && (
            <Cell
              label="노후도 30년↑ (연면적 기준)"
              value={stats.floorArea.over30Pct.toFixed(1)}
              unit="%"
              sub={`연면적 ${man(stats.floorArea.total)}`}
              tone="rose"
              testId="zone-vital-floor"
            />
          )}
          {stats.parcels && (
            <Cell
              label="필지 · 90㎡ 미만 과소필지"
              value={n(stats.parcels.count)}
              unit="필지"
              sub={`과소 ${stats.parcels.under90Pct.toFixed(1)}% (${n(stats.parcels.under90)}필지)`}
              testId="zone-vital-parcels"
            />
          )}
        </div>
      )}

      {/* ── 정밀 분석(건축물대장 구조·호수) ─────────────────────────────────── */}
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 px-2 py-1.5" data-testid="zone-precise">
        <div className="flex items-center justify-between gap-1">
          <p className="min-w-0 truncate text-[11px] font-bold text-sky-900">
            🔬 정밀 분석{" "}
            <span className="font-medium text-sky-700">건축물대장 구조·호수·대지지분</span>
          </p>
          {precise.status === "running" ? (
            <button
              type="button"
              onClick={cancelPrecise}
              className="shrink-0 rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
            >
              중단
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runPrecise()}
              data-testid="zone-precise-run"
              className="shrink-0 rounded-full bg-sky-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              {precise.status === "ok" ? "↻ 다시" : precise.status === "error" ? "다시 시도" : "분석 실행"}
            </button>
          )}
        </div>

        {precise.status === "idle" && (
          <p className="mt-1 text-[10px] leading-snug text-sky-800/80">
            국토교통부 건축물대장 표제부로 <b className="font-semibold">주구조별 노후도(서울시 조례 기준)</b>와{" "}
            <b className="font-semibold">조례 기준 호수밀도</b>·<b className="font-semibold">추정 평균 대지지분</b>을 계산합니다.
            복수 세대·가구 필지는 층별개요까지 확인해 200필지면 30초 안팎 걸립니다.
          </p>
        )}

        {precise.status === "running" && (
          <div className="mt-1" data-testid="zone-precise-progress">
            <div className="h-1 w-full overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
                style={{ width: `${precisePct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] font-medium text-sky-900">
              분석 중 {precisePct}% ({n(precise.done)}/{n(preciseTotal)}필지)…
            </p>
          </div>
        )}

        {precise.status === "error" && (
          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
            <p className="text-[10px] font-semibold text-amber-900">정밀 분석을 마치지 못했습니다</p>
            <p className="mt-0.5 text-[10px] leading-snug text-amber-800">{precise.message}</p>
          </div>
        )}

        {preciseResult && (
          <div className="mt-1.5" data-testid="zone-precise-result">
            <div className="grid grid-cols-2 gap-1.5">
              <Cell
                label="조례 기준 노후도"
                value={preciseResult.ordinancePct.toFixed(1)}
                unit="%"
                sub={`철콘30↑ ${n(preciseResult.over30Concrete)} + 기타20↑ ${n(preciseResult.over20Other)} / 유효 ${n(
                  preciseResult.effectiveBuildings
                )}동`}
                tone="rose"
                testId="zone-precise-ordinance"
                wrap
              />
              <Cell
                label="조례 기준 호수밀도"
                value={preciseResult.ordinanceDensity.toFixed(1)}
                unit="동/ha"
                sub={`조례 환산 ${n(preciseResult.ordinanceDong)}동 (총 ${n(preciseResult.units)}세대·가구) / ${preciseResult.areaHa.toFixed(2)}ha`}
                tone="sky"
                testId="zone-precise-density"
                wrap
              />
              <Cell
                label="구조 분포"
                value={`철콘 ${n(preciseResult.concrete)}`}
                unit="동"
                sub={`비철콘 ${n(preciseResult.other)}동${
                  preciseResult.unknownStructure > 0 ? ` · 구조 미상 ${n(preciseResult.unknownStructure)}동` : ""
                }`}
                testId="zone-precise-structure"
                wrap
              />
              <Cell
                label="연식 보정"
                value={n(preciseResult.ageResolved)}
                unit="동"
                sub={
                  !stats || stats.unknownYear === 0
                    ? "1차 추정 연식 미상 없음"
                    : preciseResult.ageResolved > 0
                      ? `1차 추정 미상 ${n(stats.unknownYear)}동 중 ${n(preciseResult.ageResolved)}동 확인`
                      : `1차 추정 미상 ${n(stats.unknownYear)}동 — 대장에도 사용승인일 없음`
                }
                tone="emerald"
                testId="zone-precise-age"
                wrap
              />
              <Cell
                label="추정 평균 대지지분"
                value={preciseResult.landSharePyeong != null ? preciseResult.landSharePyeong.toFixed(1) : "—"}
                unit={preciseResult.landSharePyeong != null ? "평" : undefined}
                sub={
                  preciseResult.landShareSqm != null
                    ? `${preciseResult.landShareSqm.toFixed(1)}㎡ · 대장 대지면적 ÷ 총 호수`
                    : "대장 대지면적·호수가 없어 산출 불가"
                }
                tone="amber"
                testId="zone-precise-landshare"
                wrap
                wide
              />
            </div>

            <div className="mt-1 flex flex-wrap gap-1">
              <Req ok={preciseResult.areaSqm >= 10000} text="면적 1만㎡↑" note="필수" />
              <Req ok={preciseResult.ordinancePct >= 60} text="노후도 60%↑" note="필수" />
              <Req ok={preciseResult.ordinanceDensity >= 60} text="호수밀도 60동/ha↑" note="선택" />
            </div>

            <p className="mt-1 break-keep text-[10px] leading-snug text-slate-500">
              조회 필지 {n(preciseResult.parcels)} · 매칭 동 {n(preciseResult.buildings)} · 층별개요{" "}
              {n(preciseResult.floorParcels)}필지 · 대장 없음 {n(preciseResult.missingParcels)}필지
              {preciseResult.errors > 0 && ` · 조회 실패 ${n(preciseResult.errors)}필지`}
              {preciseResult.floorErrors > 0 && ` · 층별개요 실패 ${n(preciseResult.floorErrors)}필지`}
              {preciseResult.structures.length > 0 && (
                <>
                  <br />
                  주구조: {preciseResult.structures.map((s) => `${s.name} ${n(s.count)}`).join(" · ")}
                </>
              )}
            </p>

            <p className="mt-1 break-keep text-[9.5px] leading-snug text-slate-400" data-testid="zone-precise-ordinance-note">
              서울시 도시 및 주거환경정비 조례 제2조제5호 — 공동·다가구는 세대(가구)수가 가장 많은 1개 층만 1동
              (층별 {n(preciseResult.ordinanceFloor)}동, 가구수 미기재 {n(preciseResult.ordinanceEstimated)}동은
              주거용 지상층 수로 추정), 단독 1가구 1동({n(preciseResult.ordinanceSingle)}동), 비주거는 건축면적
              90㎡당 1동({n(preciseResult.ordinanceNonResidential)}동). 세대수 단순합산은{" "}
              {preciseResult.density.toFixed(1)}호/ha입니다.
            </p>

            <p className="mt-1 break-keep text-[9.5px] leading-snug text-slate-400">
              건축물대장 표제부 기준{preciseResult.attached > 0 ? `(부속건축물 ${n(preciseResult.attached)}동 제외). ` : ". "}
              호수는 공동주택 세대수·가구수 중 큰 값이고, 둘 다 0인 주거용 건물은 1가구로 보정했습니다(
              {n(preciseResult.minUnitAdjusted)}동). 상가·오피스 호수는 제외. 무허가·미등록 건축물은 대장이 없어
              미조회로 남습니다.
              {precise.status === "ok" &&
                ` 저장된 결과 ${new Date(precise.at).getMonth() + 1}월 ${new Date(precise.at).getDate()}일.`}
            </p>

            <p className="mt-1 break-keep text-[9.5px] leading-snug text-slate-400" data-testid="zone-precise-landshare-note">
              추정 평균 대지지분 = 필지별 대지면적{preciseResult.landFallbackParcels > 0
                ? `(대장 값이 빈 ${n(preciseResult.landFallbackParcels)}필지는 연속지적도 면적)`
                : ""}{" "}
              합 {n(preciseResult.landArea)}㎡(대지면적 확보 {n(preciseResult.landParcels)}필지) ÷ 총 호수{" "}
              {n(preciseResult.units)}호. 도로·나대지 필지는 대장이 없어 빠지고, 공동주택·다가구는 실소유자 수와
              차이가 날 수 있습니다.
            </p>
          </div>
        )}
      </div>

      {status === "ok" && meta?.truncated && (
        <p className="mt-2 text-[10px] leading-snug text-amber-700">
          ※ 브이월드 응답 한도(1,000동)에 걸려 일부 건물이 빠졌습니다 — 실제보다 적게 잡혔을 수 있습니다.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        리디브 건축물대장 연식 색인·연속지적도 기준 <b className="font-semibold text-slate-500">1차 추정치</b>입니다.
        구조·층별 세대수를 반영하지 않았고, 필지에는 도로·잡종지가 섞여 있어 과소필지율이 실제 대지 기준보다
        낮게 보일 수 있습니다 — 재개발닷컴 등 공식 구역현황과 다릅니다.
      </p>
    </section>
  );
}
