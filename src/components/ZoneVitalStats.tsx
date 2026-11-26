"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneVitalStats — 구역 상세 패널의 「구역현황 (추정)」 + 「정밀 분석」
//
//   구역 폴리곤을 /api/zone-stats 로 보내 그 안의 건축물·필지로
//   노후도(30·20년)·건축물 동수·동수밀도·과소필지율을 받아 카드로 보여준다.
//   · 정식 등록 구역·대표 구역·직접 그린 구역이 같은 컴포넌트를 쓴다.
//   · 숫자는 1차 추정치다(건축물대장 사용승인일 + 연속지적도). 구조·층별 세대수는 반영하지
//     않으므로 공식 구역현황과 다를 수 있다 — 카드 아래 문구로 항상 밝힌다.
//   · 경계가 없는 구역(미고시 후보지)은 부모가 이 컴포넌트를 그리지 않는다.
//
//   「🔬 정밀 분석」은 국토교통부 건축물대장 표제부(getBrTitleInfo)를 구역 안 필지마다
//   조회해 **주구조·사용승인일·세대/가구수·대지면적**으로 서울시 조례 기준 노후도와
//   **조례 기준 호수밀도**, **추정 조합원(토지등소유자) 수**, 추정 대지지분을 낸다.
//   · 추정 조합원 = 공동주택 세대수 + 단독·다가구 필지당 1명 + 비주거 필지당 1명(집합건물은 호수).
//     세입자 가구수(fmlyCnt)는 조합원이 아니어서 세지 않는다.
//   · 노후도 요건은 재개발뷰식 가로 눈금바 대신 **모아타운 50%↑ / 신통기획 60%↑ 두 판정 타일**
//     (원형 게이지 + 충족/미달 + 초과·부족 %p)로 보여 주고, 그 아래에 구조별 기여
//     (철콘 30년↑ · 비철콘 20년↑ · 유효 동)를 한 줄로 붙인다 — 리디브 고유 표기.
//
//   자동 정밀 분석(2026-11-27):
//   · 구역계·사업이 이미 정해진 구역(정비구역 지정·추진위·조합설립·사업시행·관리처분·착공 등,
//     경계가 고시·공고 도면인 구역)은 패널을 열면 「분석 실행」 없이 **바로** 정밀 분석을 돌린다.
//   · 극초기·경계 추정 구역(추진준비·후보지 신청 전·공모·미지정, geom 이 가상경계·참고도·
//     추진위안내도·근사원·미고시)은 종전처럼 사용자가 「분석 실행」을 눌러야 돈다 —
//     확정 전 구역에서 대장 수백 건을 미리 조회해 기다리게 하지 않는다.
//   · 구역 단계는 부모가 `stage`/`geom` 으로 넘겨 주고, 안 넘어오면 지도가 이미 받아 둔
//     서울시 정비구역 목록(loadSeoulZones 캐시)에서 **같은 도형**을 찾아 단계를 확인한다
//     (직접 그린 구역처럼 목록에 없는 도형은 자동 분석하지 않는다).
//   · 필지가 많은 구역(450곳 초과)도 1차 수치를 먼저 그린 뒤 청크 단위로 백그라운드 조회하고
//     진행률만 갱신한다 — 화면을 막지 않는다. 캐시에 있으면 즉시 표시한다.
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
import { loadSeoulZones, type SeoulZone } from "@/lib/seoul-zones";
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

/** 노후도 요건 판정 타일 — 원형 게이지 + 충족/미달 + 초과·부족 %p (리디브 고유 표기) */
function RequirementTile({
  label,
  threshold,
  pct,
  tone,
  testId,
}: {
  label: string;
  threshold: number;
  pct: number;
  tone: "amber" | "indigo";
  testId: string;
}) {
  const ok = pct >= threshold;
  const delta = pct - threshold;
  const r = 17;
  const dash = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, pct / 100));
  const ring = tone === "amber" ? "#f59e0b" : "#6366f1";
  const track = tone === "amber" ? "#fef3c7" : "#e0e7ff";
  return (
    <div
      data-testid={testId}
      data-verdict={ok ? "meet" : "short"}
      className={`min-w-0 rounded-xl px-2 py-1.5 ring-1 ${
        ok ? "bg-emerald-50/60 ring-emerald-200" : "bg-slate-50 ring-slate-200"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 44 44" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r={r} fill="none" stroke={track} strokeWidth="6" />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={ring}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash * filled} ${dash}`}
          />
        </svg>
        <div className="min-w-0">
          <div className="truncate text-[10px] font-bold text-slate-700">{label}</div>
          <div className="whitespace-nowrap text-[9.5px] leading-tight text-slate-400">
            노후도 {threshold}%↑
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                ok ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-700"
              }`}
            >
              {ok ? "충족" : "미달"}
            </span>
            <span
              className={`whitespace-nowrap text-[10px] font-semibold tabular-nums ${
                ok ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta).toFixed(1)}%p
            </span>
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-baseline justify-between whitespace-nowrap text-[9.5px] text-slate-500">
        <span>현재 노후도</span>
        <span className="text-[11px] font-bold tabular-nums text-slate-800">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ── 자동 정밀 분석 판정 ─────────────────────────────
//   구역계·사업이 이미 정해진 구역만 자동으로 돌린다.
/** 경계 자체가 추정인 도형 — 이 위에서 자동 조회하면 엉뚱한 필지를 대장에서 찾게 된다 */
const PROVISIONAL_GEOM = new Set([
  "미고시",
  "고시미반영",
  "가상경계",
  "참고도",
  "근사원",
  "추진위안내도",
]);
/** 구역계·사업이 확정 단계로 넘어간 추진단계 (서울시 추진단계 표기 기준) */
const AUTO_STAGE =
  /정비구역\s*지정|구역지정|지구지정|추진위|조합설립|사업시행|관리처분|관리지역\s*고시|착공|건축심의|건축허가|사업계획\s*승인|사용승인|준공|입주|후보지\s*선정|대상지\s*선정|기획완료|신통기획\s*확정|지구변경|촉진계획|권리산정기준일|모집공고|선정구역/;
/** 아직 확정 전이라는 표시가 붙은 단계 — 자동 분석하지 않는다 */
const HOLD_STAGE = /\(추진중\)|추진\s*중\)|공람|\(안\)|신청\s*전|미선정|취소|사전|자문|검토|상정|입찰|MOU|심의|대기/;

/** 이 구역을 자동으로 정밀 분석할지 — 진행 단계 + 경계 신뢰도로 판단한다 */
export function shouldAutoAnalyze(
  stage: string | null | undefined,
  geom: string | null | undefined
): boolean {
  if (!stage) return false;
  if (geom && PROVISIONAL_GEOM.has(geom)) return false;
  if (HOLD_STAGE.test(stage)) return false;
  return AUTO_STAGE.test(stage);
}

/** 도형 지문 — 같은 구역을 서울시 목록에서 찾을 때 쓴다(정점 수 + 첫·끝 점) */
function shapeKey(polygon: [number, number][] | null | undefined): string | null {
  if (!polygon || polygon.length < 3) return null;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return [polygon.length, first[0].toFixed(6), first[1].toFixed(6), last[0].toFixed(6), last[1].toFixed(6)].join("|");
}

/** 지도가 이미 받아 둔 서울시 정비구역 목록에서 같은 도형의 구역을 찾는다 */
function findZoneByShape(
  zones: SeoulZone[],
  polygon: [number, number][] | null | undefined
): SeoulZone | null {
  const key = shapeKey(polygon);
  if (!key) return null;
  for (const zone of zones) {
    if (shapeKey(zone.polygon) === key) return zone;
  }
  return null;
}

/** 한 번에 보내는 필지 수 — 서버 상한(60)보다 작게 둬 함수 시간을 안전하게 지킨다 */
const CHUNK = 50;
/** 동시에 보내는 청크 수 — 2로 두면 1,400필지 구역도 60초 안에 끝난다 */
const PARALLEL = 2;
const CACHE_PREFIX = "redev-precise:v4:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type PreciseState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "ok"; result: PreciseSummary; at: number }
  | { status: "error"; message: string };

export default function ZoneVitalStats({
  shape,
  areaSqm,
  stage = null,
  geom = null,
  className = "",
}: {
  shape: ZoneShapeInput;
  /** 구역면적(㎡) — 고시면적이 있으면 그 값을 동수밀도 분모로 쓴다(없으면 도형 면적) */
  areaSqm?: number | null;
  /** 추진단계 — 넘기면 이 값으로 자동 분석 여부를 바로 정한다(없으면 도형으로 목록에서 찾는다) */
  stage?: string | null;
  /** 경계 도형 출처(고시도면·가상경계 등) — 추정 경계면 자동 분석하지 않는다 */
  geom?: string | null;
  className?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [stats, setStats] = useState<ZoneStatsPayload | null>(null);
  const [meta, setMeta] = useState<{ truncated: boolean } | null>(null);
  const [error, setError] = useState<string>("");
  const [precise, setPrecise] = useState<PreciseState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  // 구역 단계 — 부모가 주면 그대로, 아니면 도형 지문으로 서울시 목록에서 찾는다(null = 찾는 중)
  const [stageHint, setStageHint] = useState<{ stage: string | null; geom: string | null } | null>(
    stage ? { stage, geom: geom ?? null } : null
  );

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

  // 구역이 바뀌면 단계 표시를 다시 정한다 — 부모가 준 단계가 있으면 그대로, 없으면 목록에서 찾는다
  useEffect(() => {
    if (stage) {
      setStageHint({ stage, geom: geom ?? null });
      return;
    }
    let alive = true;
    setStageHint(null);
    loadSeoulZones()
      .then(({ zones }) => {
        if (!alive) return;
        const hit = findZoneByShape(zones, shape.polygon);
        setStageHint(hit ? { stage: hit.stage ?? null, geom: hit.geom ?? null } : { stage: null, geom: null });
      })
      .catch(() => {
        if (alive) setStageHint({ stage: null, geom: null });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, stage, geom]);

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

  // ── 자동 정밀 분석 ────────────────────────────────────────
  //   진행 단계 구역은 패널이 열리면 알아서 돌린다. 1차 구역현황이 그려진 뒤로 미뤄
  //   화면이 먼저 뜨게 하고(250ms), 한 번 돌린 구역은 다시 돌리지 않는다.
  const autoMode = stageHint ? shouldAutoAnalyze(stageHint.stage, stageHint.geom) : false;
  // 자동 조회를 이미 걸었는지 — 구역이 바뀌면 되돌린다(사용자가 '중단'한 뒤에는 버튼으로 남긴다)
  const [autoTried, setAutoTried] = useState(false);
  // 예약된 자동 조회 — 구역이 바뀌거나 화면을 떠날 때만 취소한다.
  //   (렌더마다 effect 를 정리하면 예약이 매번 지워져 자동 조회가 시작되지 않는다 — 2026-11-27 확인)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAutoTried(false);
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [requestKey]);
  useEffect(() => {
    if (!autoMode || autoTried) return;
    if (status !== "ok" || !stats || stats.buildings === 0) return;
    if (precise.status !== "idle") return;
    setAutoTried(true);
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null;
      void runPrecise();
    }, 250);
  }, [autoMode, autoTried, status, stats, precise.status, runPrecise]);

  const hasBuildings = status === "ok" && stats != null && stats.buildings > 0;
  const preciseResult = precise.status === "ok" ? precise.result : null;
  const preciseTotal = precise.status === "running" ? precise.total : 0;
  const precisePct =
    precise.status === "running" && precise.total > 0
      ? Math.min(99, Math.round((precise.done / precise.total) * 100))
      : 0;
  /** 필지가 많은 구역 — 자동 조회를 해도 1차 수치를 먼저 보여 주고 백그라운드로 채운다 */
  const largeZone = preciseTotal > 450;

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
          <div className="flex shrink-0 items-center gap-1">
            {autoMode && (
              <span
                data-testid="zone-precise-auto"
                title="구역계·사업이 정해진 구역이라 자동으로 분석합니다"
                className="whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800"
              >
                자동
              </span>
            )}
            {precise.status === "running" ? (
              <button
                type="button"
                onClick={cancelPrecise}
                className="shrink-0 rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
              >
                중단
              </button>
            ) : precise.status === "ok" ? (
              <button
                type="button"
                onClick={() => void runPrecise()}
                data-testid="zone-precise-run"
                className="shrink-0 rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
              >
                ↻ 다시
              </button>
            ) : precise.status === "idle" && autoMode && !autoTried && stageHint ? (
              // 자동 구역 — 돌기 전 짧은 사이에는 버튼 없이 불러오는 표시만
              <span className="whitespace-nowrap text-[9.5px] font-medium text-sky-700">
                불러오는 중…
              </span>
            ) : stageHint === null ? (
              // 구역 단계를 목록에서 찾는 동안 — 버튼이 잠깐 번쩍이지 않게
              <span className="whitespace-nowrap text-[9.5px] font-medium text-sky-700">확인 중…</span>
            ) : (
              <button
                type="button"
                onClick={() => void runPrecise()}
                data-testid="zone-precise-run"
                className="shrink-0 rounded-full bg-sky-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {precise.status === "error" ? "다시 시도" : "분석 실행"}
              </button>
            )}
          </div>
        </div>

        {precise.status === "idle" && !autoMode && (
          <p className="mt-1 text-[10px] leading-snug text-sky-800/80">
            국토교통부 건축물대장 표제부로 <b className="font-semibold">주구조별 노후도(서울시 조례 기준)</b>와{" "}
            <b className="font-semibold">조례 기준 호수밀도</b>·<b className="font-semibold">추정 조합원(토지등소유자) 수</b>·
            <b className="font-semibold">추정 대지지분</b>을 계산합니다.
            복수 세대·가구 필지는 층별개요까지 확인해 200필지면 30초 안팎 걸립니다.
          </p>
        )}

        {precise.status === "idle" && autoMode && stageHint && (
          <p className="mt-1 break-keep text-[10px] leading-snug text-sky-800/80" data-testid="zone-precise-auto-note">
            <b className="font-semibold">{stageHint.stage}</b> 구역이라 건축물대장을 바로 불러옵니다 —
            조례 기준 노후도·호수밀도·추정 조합원·대지지분이 아래에 나타나며, 이미 본 구역은 즉시 뜨게
            저장해 둡니다.
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
            {largeZone && (
              <p className="mt-0.5 break-keep text-[9.5px] leading-snug text-sky-800/80">
                필지 {n(preciseTotal)}곳 — 위 1차 수치는 이미 나왔고, 이 분석은 뒤에서 진행됩니다. 화면은 그대로
                쓰셔도 됩니다.
              </p>
            )}
            {!preciseResult && (
              <div className="mt-1.5 animate-pulse" aria-hidden>
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg bg-white/70 px-2 py-1.5 ring-1 ring-sky-100">
                      <div className="h-2 w-12 rounded bg-sky-100" />
                      <div className="mt-1.5 h-3 w-16 rounded bg-sky-100" />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                label="조례 기준 호수밀도"
                value={preciseResult.ordinanceDensity.toFixed(1)}
                unit="동/ha"
                sub={`조례 환산 ${n(preciseResult.ordinanceDong)}동 (총 ${n(preciseResult.units)}세대·가구) / ${preciseResult.areaHa.toFixed(2)}ha`}
                tone="sky"
                testId="zone-precise-density"
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
                label="추정 조합원(토지등소유자)"
                value={`약 ${n(preciseResult.owners)}`}
                unit="명"
                sub={`공동주택 ${n(preciseResult.ownerHouseholds)}세대 + 단독·다가구 ${n(
                  preciseResult.ownerDetached
                )} + 비주거 ${n(preciseResult.ownerNonResidential)}`}
                tone="emerald"
                testId="zone-precise-owners"
                wrap
                wide
              />
              <Cell
                label="추정 1인당 대지지분 (조합원)"
                value={
                  preciseResult.landShareOwnerPyeong != null
                    ? preciseResult.landShareOwnerPyeong.toFixed(1)
                    : "—"
                }
                unit={preciseResult.landShareOwnerPyeong != null ? "평" : undefined}
                sub={
                  preciseResult.landShareOwnerSqm != null
                    ? `${preciseResult.landShareOwnerSqm.toFixed(1)}㎡ · 대지 ÷ 조합원 ${n(
                        preciseResult.owners
                      )}명`
                    : "대지면적·조합원 수가 없어 산출 불가"
                }
                tone="amber"
                testId="zone-precise-owner-landshare"
                wrap
              />
              <Cell
                label="추정 평균 대지지분 (세대·가구)"
                value={preciseResult.landSharePyeong != null ? preciseResult.landSharePyeong.toFixed(1) : "—"}
                unit={preciseResult.landSharePyeong != null ? "평" : undefined}
                sub={
                  preciseResult.landShareSqm != null
                    ? `${preciseResult.landShareSqm.toFixed(1)}㎡ · 대지 ÷ 총 호수`
                    : "대장 대지면적·호수가 없어 산출 불가"
                }
                testId="zone-precise-landshare"
                wrap
              />
            </div>

            {/* 노후도 요건 — 재개발뷰식 가로 눈금바 대신 판정 타일 두 장(모아타운 50%↑ · 신통기획 60%↑) */}
            <div
              className="mt-2 rounded-xl bg-white/70 px-2 py-1.5 ring-1 ring-slate-200"
              data-testid="zone-precise-require"
            >
              <div className="mb-1 flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-bold text-slate-700">노후도 요건 판정</span>
                <span className="text-[10px] font-medium text-slate-400">조례 기준 노후도</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <RequirementTile
                  label="모아타운"
                  threshold={50}
                  pct={preciseResult.ordinancePct}
                  tone="amber"
                  testId="zone-precise-req-moa"
                />
                <RequirementTile
                  label="신통기획"
                  threshold={60}
                  pct={preciseResult.ordinancePct}
                  tone="indigo"
                  testId="zone-precise-req-sin"
                />
              </div>
              <p
                className="mt-1.5 break-keep text-[10px] leading-snug text-slate-600"
                data-testid="zone-precise-structure-share"
              >
                <span className="font-semibold text-slate-500">구조별 기여</span> ·{" "}
                <span className="font-semibold text-rose-700">철콘 30년↑ {n(preciseResult.over30Concrete)}동</span> ·{" "}
                <span className="font-semibold text-amber-700">비철콘 20년↑ {n(preciseResult.over20Other)}동</span>
                {preciseResult.unknownStructure > 0 && ` · 구조 미상 ${n(preciseResult.unknownStructure)}동`}
                <span className="text-slate-400"> (유효 {n(preciseResult.effectiveBuildings)}동)</span>
              </p>
            </div>

            {/* 유형별 현황 — 조합원 산정에 쓴 유형 비율 */}
            <div className="mt-1.5" data-testid="zone-precise-types">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <span
                  className="h-full bg-sky-500"
                  style={{
                    width: `${(preciseResult.ownerHouseholds / Math.max(1, preciseResult.owners)) * 100}%`,
                  }}
                  aria-hidden
                />
                <span
                  className="h-full bg-amber-500"
                  style={{
                    width: `${(preciseResult.ownerDetached / Math.max(1, preciseResult.owners)) * 100}%`,
                  }}
                  aria-hidden
                />
                <span
                  className="h-full bg-violet-400"
                  style={{
                    width: `${(preciseResult.ownerNonResidential / Math.max(1, preciseResult.owners)) * 100}%`,
                  }}
                  aria-hidden
                />
              </div>
              <p className="mt-1 break-keep text-[10px] leading-snug text-slate-600">
                <span className="font-semibold text-sky-700">공동주택 {n(preciseResult.ownerHouseholds)}세대</span> ·{" "}
                <span className="font-semibold text-amber-700">단독/다가구 {n(preciseResult.ownerDetached)}동</span> ·{" "}
                <span className="font-semibold text-violet-700">근린/기타 {n(preciseResult.ownerNonResidential)}</span>
              </p>
            </div>

            <div className="mt-1 flex flex-wrap gap-1">
              <Req ok={preciseResult.areaSqm >= 10000} text="면적 1만㎡↑" note="필수" />
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

            <p className="mt-1 break-keep text-[9.5px] leading-snug text-slate-400" data-testid="zone-precise-owner-note">
              추정 조합원 = 공동주택 <b className="font-semibold text-slate-500">세대수(hhldCnt)</b> + 단독·다가구{" "}
              <b className="font-semibold text-slate-500">필지당 1명</b> + 비주거{" "}
              <b className="font-semibold text-slate-500">필지당 1명</b>(오피스텔·상가 집합건물은 호수{" "}
              {n(preciseResult.ownerShopUnits)}호). 다가구 세입자 가구수는 조합원이 아니어서 뺐습니다
              {preciseResult.ownerHhldAdjusted > 0 && `(세대수 0 → 1명 보정 ${n(preciseResult.ownerHhldAdjusted)}동)`}. 나대지·대장
              미조회 필지, 공유지분·1+1 소유는 실제 조합원 수와 다를 수 있습니다.
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
        낮게 보일 수 있습니다 — 지자체·고시문 공식 구역현황과 다를 수 있습니다.
      </p>
    </section>
  );
}
