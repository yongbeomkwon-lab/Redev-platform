"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneVitalStats — 구역 상세 패널의 「구역현황 (추정)」
//
//   구역 폴리곤을 /api/zone-stats 로 보내 그 안의 건축물·필지로
//   노후도(30·20년)·건축물 동수·동수밀도·과소필지율을 받아 카드로 보여준다.
//   · 정식 등록 구역·대표 구역·직접 그린 구역이 같은 컴포넌트를 쓴다.
//   · 숫자는 1차 추정치다(건축물대장 사용승인일 + 연속지적도). 구조·층별 세대수는 반영하지
//     않으므로 재개발닷컴의 구역현황과 다를 수 있다 — 카드 아래 문구로 항상 밝힌다.
//   · 경계가 없는 구역(미고시 후보지)은 부모가 이 컴포넌트를 그리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { ZoneShapeInput, ZoneStatsPayload, ZoneStatsResponse } from "@/lib/zone-stats";

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
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "slate" | "rose" | "amber" | "sky";
  testId?: string;
}) {
  const valueTone =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "sky"
          ? "text-sky-700"
          : "text-slate-900";
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
      <div className="truncate text-[10px] font-medium text-slate-500">{label}</div>
      <div className={`flex items-baseline gap-0.5 ${valueTone}`} data-testid={testId}>
        <span className="text-sm font-bold tabular-nums leading-tight">{value}</span>
        {unit && <span className="text-[10px] font-semibold">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</div>}
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

  // 구역이 바뀌면 다시 계산한다 — 링 전체를 의존성으로 쓰면 매 렌더마다 바뀌므로 요약 키를 쓴다
  const requestKey = useMemo(() => {
    const first = shape.polygon?.[0];
    return [shape.polygon?.length ?? 0, first?.[0] ?? 0, first?.[1] ?? 0, areaSqm ?? 0].join(":");
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

  const hasBuildings = status === "ok" && stats != null && stats.buildings > 0;

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

      {status === "ok" && meta?.truncated && (
        <p className="mt-2 text-[10px] leading-snug text-amber-700">
          ※ 브이월드 응답 한도(1,000동)에 걸려 일부 건물이 빠졌습니다 — 실제보다 적게 잡혔을 수 있습니다.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        리디브 건축물대장 연식 색인·연속지적도 기준 <b className="font-semibold text-slate-500">1차 추정치</b>입니다.
        구조·층별 세대수와 도로·공원 면적은 반영하지 않아 재개발닷컴 등 공식 구역현황과 다를 수 있습니다.
      </p>
    </section>
  );
}
