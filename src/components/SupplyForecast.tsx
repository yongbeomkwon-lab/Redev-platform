"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SupplyForecast — /supply 「연도별·자치구별 예상 입주물량」
//
//  · 데이터는 public/data/supply-forecast.json 하나만 읽는다(빌드 시 생성, 지도 데이터와 분리).
//  · 서울 전체 / 자치구 하나를 고르면 막대·표·구역 목록이 같은 기준으로 함께 바뀐다.
//  · 핵심 구간은 2026~2031. 2032년 이후는 토글로만 붙인다 — 초기 추진구역 대단지가
//    몰려 있어 기본 화면에 두면 2026~2031 막대가 눌린다.
//  · 아실식 막대 차트: 연도별 총세대수 + 참고선(연 4.5만~5만) + 주요 단지 툴팁.
//  · 구역 이름을 누르면 지도(`/?zone=<구역 id>`)에서 그 구역이 열린다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ZoneRow = {
  id: string;
  name: string;
  type: string | null;
  stage: string | null;
  households: number;
  year: number;
  basis: "official" | "estimated";
  yearConfidence: string | null;
  sale: number | null;
  rental: number | null;
  source: string | null;
  confidence: string | null;
};

type District = {
  gu: string;
  total: number;
  byYear: Record<string, number>;
  peakYear: number | null;
  beyond: { y2032: number; y2033plus: number; undated: number };
  /** 2032·2033+ 구역 목록 — 2026~2031 `zones` 와 같은 스키마(막대 툴팁·아래 목록용) */
  beyondZones: { y2032: ZoneRow[]; y2033plus: ZoneRow[] };
  zoneCount: number;
  zones: ZoneRow[];
};

type ForecastData = {
  meta: {
    title: string;
    subtitle: string;
    generatedAt: string;
    basePeriod: string;
    years: number[];
    demandGuide: { min: number; max: number; label: string };
    totalHouseholds: number;
    siteCount: number;
    officialSites: number;
    officialHouseholds: number;
    estimatedSites: number;
    estimatedHouseholds: number;
    yearTotals: { year: number; households: number }[];
    peakYear: { year: number; households: number };
    topDistrict: { gu: string; households: number };
    beyond: { y2032: number; y2033plus: number; undated: number; before2026: number };
    excluded: { rentalOnlySites: number; rentalOnlyHouseholds: number; note: string };
    sources: { name: string; detail: string; license: string }[];
    notes: string[];
  };
  districts: District[];
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("ko-KR");

// 막대 하나의 색 — 2026~2031은 브랜드 블루, 2032+ 는 회색 계열(성격이 다른 참고값)
const BAR_2026 = "from-brand-deep to-accent";

export default function SupplyForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [error, setError] = useState(false);
  const [gu, setGu] = useState<string | null>(null);
  // 막대 키 — 2026~2031 은 "2030" 처럼 연도, 2032 이후는 "2032"·"2033plus"
  const [selKey, setSelKey] = useState<string | null>(null);
  const [beyond, setBeyond] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/data/supply-forecast.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: ForecastData) => alive && setData(j))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const districts = data?.districts ?? [];
  const years = data?.meta.years ?? [];

  // 선택한 범위(서울 전체 또는 자치구 하나)의 연도별 합계·구역 목록
  const scope = useMemo(() => {
    if (!data)
      return {
        byYear: {} as Record<number, number>,
        zones: [] as (ZoneRow & { gu: string })[],
        beyondZones: { y2032: [] as (ZoneRow & { gu: string })[], y2033plus: [] as (ZoneRow & { gu: string })[] },
        beyond: { y2032: 0, y2033plus: 0, undated: 0 },
      };
    const list: District[] = gu ? data.districts.filter((d) => d.gu === gu) : data.districts;
    const byYear: Record<number, number> = {};
    for (const y of data.meta.years) byYear[y] = list.reduce((s, d) => s + (d.byYear[String(y)] ?? 0), 0);
    const zones = list.flatMap((d) => d.zones.map((z) => ({ ...z, gu: d.gu })));
    // 2032·2033+ — 막대 툴팁·목록이 쓰는 구역 배열(자치구별로 담겨 있으므로 범위에 맞춰 합친다)
    const laterOf = (k: "y2032" | "y2033plus") =>
      list.flatMap((d) => (d.beyondZones?.[k] ?? []).map((z) => ({ ...z, gu: d.gu })));
    return {
      byYear,
      zones,
      beyondZones: { y2032: laterOf("y2032"), y2033plus: laterOf("y2033plus") },
      beyond: {
        y2032: list.reduce((s, d) => s + d.beyond.y2032, 0),
        y2033plus: list.reduce((s, d) => s + d.beyond.y2033plus, 0),
        undated: list.reduce((s, d) => s + d.beyond.undated, 0),
      },
    };
  }, [data, gu]);

  const bars = useMemo(() => {
    const base = years.map((y) => ({ key: String(y), label: String(y), value: scope.byYear[y] ?? 0, kind: "main" as const }));
    if (!data || !beyond) return base;
    const list = gu ? data.districts.filter((d) => d.gu === gu) : data.districts;
    const y2032 = list.reduce((s, d) => s + d.beyond.y2032, 0);
    const y2033 = list.reduce((s, d) => s + d.beyond.y2033plus, 0);
    return [
      ...base,
      { key: "2032", label: "2032", value: y2032, kind: "later" as const },
      { key: "2033plus", label: "2033+", value: y2033, kind: "later" as const },
    ];
  }, [years, scope, data, gu, beyond]);

  const scaleMax = useMemo(() => {
    const maxBar = Math.max(...bars.map((b) => b.value), 1);
    // 서울 전체에서는 참고선(5만)이 잘리지 않게 위쪽을 조금 더 잡는다
    return Math.max(maxBar, gu ? 0 : data?.meta.demandGuide.max ?? 0) * 1.15;
  }, [bars, gu, data]);

  const peakYear = useMemo(() => {
    if (!years.length) return null;
    return years.reduce((best, y) => ((scope.byYear[y] ?? 0) > (scope.byYear[best] ?? 0) ? y : best), years[0]);
  }, [years, scope]);

  const activeKey = useMemo(() => {
    if (selKey != null && bars.some((b) => b.key === selKey)) return selKey;
    return peakYear != null ? String(peakYear) : null;
  }, [selKey, bars, peakYear]);

  const isLater = activeKey === "2032" || activeKey === "2033plus";

  /** 2032·2033+ 는 목록이 길어 상위 10곳만 보여 준다 — “전체 몇 곳 중”인지 함께 적는다 */
  const activePool = isLater
    ? activeKey === "2032"
      ? scope.beyondZones.y2032.length
      : scope.beyondZones.y2033plus.length
    : null;

  const activeZones = useMemo(() => {
    if (activeKey == null) return [];
    // 2032·2033+ — 데이터에 담긴 구역 목록에서 바로 (예전에는 “집계에서 제외”로 비어 있었다)
    if (activeKey === "2032" || activeKey === "2033plus") {
      const rows = activeKey === "2032" ? scope.beyondZones.y2032 : scope.beyondZones.y2033plus;
      return [...rows].sort((a, b) => b.households - a.households).slice(0, 10);
    }
    return scope.zones
      .filter((z) => z.year === Number(activeKey))
      .sort((a, b) => b.households - a.households)
      .slice(0, 10);
  }, [scope, activeKey]);

  const activeTotal = useMemo(() => {
    if (activeKey == null) return 0;
    if (activeKey === "2032") return scope.beyond.y2032;
    if (activeKey === "2033plus") return scope.beyond.y2033plus;
    return scope.byYear[Number(activeKey)] ?? 0;
  }, [scope, activeKey]);

  /** 목록 제목 — 2032·2033+ 는 “2032년”·“2033년 이후”로 읽힌다 */
  const activeLabel = isLater
    ? activeKey === "2032"
      ? "2032년"
      : "2033년 이후"
    : `${activeKey ?? "-"}년`;

  const guide = data?.meta.demandGuide;
  const guideTop = guide ? (guide.max / scaleMax) * 100 : 0;
  const guideBottom = guide ? (guide.min / scaleMax) * 100 : 0;
  const showGuide = !!guide && !gu;

  const cellMax = useMemo(
    () => (data ? Math.max(...data.districts.flatMap((d) => years.map((y) => d.byYear[String(y)] ?? 0)), 1) : 1),
    [data, years]
  );

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-slate-600">
          입주물량 데이터를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200/70" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
        <div className="h-[340px] animate-pulse rounded-2xl border border-line bg-white" />
      </div>
    );
  }

  const m = data.meta;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      {/* ── 제목 ───────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-2xl">
            연도별 예상 입주물량
          </h1>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600 sm:text-sm">
            서울 정비사업 <b className="font-bold text-ink">2,400여 구역</b>의 계획 세대수를 자치구·연도별로 모았습니다.
            구역을 누르면 지도에서 경계와 실거래까지 바로 열립니다.
          </p>
        </div>
        <p className="text-[11px] text-slate-400">기준 {m.basePeriod}</p>
      </header>

      {/* ── 요약 카드 ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-3.5 sm:p-4">
          <p className="text-[11px] font-medium text-slate-500">2026~2031 총 예상 입주</p>
          <p className="mt-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-brand sm:text-[26px]">
            {fmt(m.totalHouseholds)}
            <span className="ml-0.5 text-[12px] font-medium text-slate-500">세대</span>
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">사업장 {fmt(m.siteCount)}곳 · 2032년 이후 제외</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3.5 sm:p-4">
          <p className="text-[11px] font-medium text-slate-500">가장 많이 들어오는 해</p>
          <p className="mt-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-[26px]">
            {m.peakYear.year}
            <span className="ml-0.5 text-[12px] font-medium text-slate-500">년</span>
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">{fmt(m.peakYear.households)}세대</p>
        </div>
        <button
          type="button"
          onClick={() => setGu(gu === m.topDistrict.gu ? null : m.topDistrict.gu)}
          className="rounded-xl border border-line bg-white p-3.5 text-left transition-colors hover:border-brand/40 sm:p-4"
          title="이 자치구만 보기"
        >
          <p className="text-[11px] font-medium text-slate-500">물량이 가장 많은 자치구</p>
          <p className="mt-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-[26px]">
            {m.topDistrict.gu}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">{fmt(m.topDistrict.households)}세대 · 눌러서 보기</p>
        </button>
        <div className="rounded-xl border border-line bg-white p-3.5 sm:p-4">
          <p className="text-[11px] font-medium text-slate-500">반영 사업장</p>
          <p className="mt-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-[26px]">
            {fmt(m.siteCount)}
            <span className="ml-0.5 text-[12px] font-medium text-slate-500">곳</span>
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">
            공식 {m.officialSites} · 추정 {fmt(m.estimatedSites)}
          </p>
        </div>
      </div>

      {/* ── 차트 ───────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold text-ink sm:text-base">
              {gu ?? "서울 전체"} 연도별 예상 입주물량
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              막대를 누르면 그 해 주요 구역이 아래에 나옵니다
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={beyond}
              onClick={() => setBeyond((v) => !v)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors " +
                (beyond
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-slate-600 hover:border-brand/40 hover:text-brand")
              }
            >
              2032년 이후 포함
            </button>
          </div>
        </div>

        {/* 연도 막대 — 위쪽 여백은 값 라벨 자리 */}
        <div className="mt-5 pt-6">
          <div className="relative h-[210px] sm:h-[250px]">
            {/* 참고선(연 4.5만~5만) — 서울 전체일 때만. 자치구 하나를 보면 기준이 달라진다 */}
            {showGuide && (
              <div
                className="pointer-events-none absolute inset-x-0 z-0 border-y border-dashed border-gold/60 bg-gold/10"
                style={{ bottom: `${guideBottom}%`, height: `${Math.max(guideTop - guideBottom, 0.6)}%` }}
              />
            )}

            <div className="relative z-10 flex h-full items-end gap-1 px-0.5 sm:gap-2">
              {bars.map((b, i) => {
                const pct = (b.value / scaleMax) * 100;
                const active = activeKey === b.key;
                const tips = b.kind === "main"
                  ? scope.zones.filter((z) => z.year === Number(b.key))
                  : b.key === "2032"
                    ? scope.beyondZones.y2032
                    : scope.beyondZones.y2033plus;
                const hoverTop = [...tips].sort((a, c) => c.households - a.households).slice(0, 3);
                // 툴팁 첫 줄 — 2033+ 막대는 “2033+년”이 아니라 “2033년 이후”로 읽힌다
                const barTitle = b.kind === "later" ? (b.key === "2032" ? "2032년" : "2033년 이후") : `${b.label}년`;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setSelKey(b.key)}
                    aria-label={`${b.label} ${fmt(b.value)}세대`}
                    className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end outline-none"
                  >
                    <div className="relative mx-auto w-full max-w-[58px] sm:max-w-[76px]" style={{ height: `${Math.max(pct, 1.2)}%` }}>
                      <div
                        className={
                          "absolute inset-x-0 bottom-0 top-0 rounded-t-[5px] bg-gradient-to-t transition-[filter] " +
                          (b.kind === "later" ? "from-slate-400 to-slate-300 " : BAR_2026 + " ") +
                          (active ? "ring-2 ring-brand/40 ring-offset-0 " : "") +
                          "group-hover:brightness-110"
                        }
                      />
                      <span
                        className={
                          "absolute inset-x-0 -top-[18px] text-center text-[9.5px] font-semibold tabular-nums tracking-[-0.03em] sm:text-[11px] " +
                          (active ? "text-brand" : "text-slate-600")
                        }
                      >
                        {b.value > 0 ? fmt(b.value) : "–"}
                      </span>
                    </div>

                    {/* 호버 툴팁 — 데스크톱에서만(폰은 누르면 아래 목록이 바뀐다) */}
                    <span
                      className={
                        "pointer-events-none absolute bottom-full z-30 mb-1 hidden w-44 flex-col gap-0.5 rounded-lg bg-ink/95 px-2.5 py-2 text-left text-white shadow-lg group-hover:flex " +
                        (i === 0
                          ? "left-0"
                          : i === bars.length - 1
                            ? "right-0"
                            : "left-1/2 -translate-x-1/2")
                      }
                    >
                      <span className="flex items-baseline justify-between text-[10px] text-white/60">
                        <span>{barTitle}</span>
                        <span className="font-semibold text-white">
                          {fmt(b.value)}세대
                          {b.kind === "later" ? " (참고)" : ""}
                        </span>
                      </span>
                      {hoverTop.length > 0 ? (
                        hoverTop.map((z) => (
                          <span key={z.id} className="flex items-baseline justify-between gap-2 text-[10.5px]">
                            <span className="truncate">{z.name}</span>
                            <span className="shrink-0 tabular-nums text-white/70">{fmt(z.households)}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-white/60">세대수 공개 구역 없음</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 연도 축 */}
          <div className="mt-1.5 flex gap-1 border-t border-line pt-1.5 sm:gap-2">
            {bars.map((b) => (
              <span
                key={b.key}
                className={
                  "flex-1 text-center text-[10px] tabular-nums sm:text-[12px] " +
                  (activeKey === b.key ? "font-bold text-brand" : b.kind === "later" ? "text-slate-400" : "text-slate-500")
                }
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>

          {/* 참고선 범례 — 차트 안에 글자를 넣으면 막대와 겹친다 */}
          {showGuide && (
            <p className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
              <span className="inline-block h-2 w-5 rounded-sm border-y border-dashed border-gold/70 bg-gold/10" />
              {guide?.label ?? "연 4.5만~5만 참고선"}
            </p>
          )}

        {/* 2032+ 요약 — 토글을 켜지 않아도 규모를 알 수 있게 한 줄로 */}
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          2032년 <b className="font-semibold text-slate-700">{fmt(m.beyond.y2032)}세대</b> · 2033년 이후{" "}
          <b className="font-semibold text-slate-700">{fmt(m.beyond.y2033plus)}세대</b> · 연도 미정{" "}
          <b className="font-semibold text-slate-700">{fmt(m.beyond.undated)}세대</b>
          <span className="hidden sm:inline">
            {" "}
            — 목동·압구정·잠실처럼 조합설립·구역지정 단계 대단지가 몰려 있어 기본 차트에서 뺐습니다.
          </span>
        </p>
      </section>

      {/* ── 자치구 필터 ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h2 className="text-[13px] font-bold text-ink sm:text-sm">자치구 선택</h2>
          <span className="text-[11px] text-slate-400">차트·표·구역 목록이 함께 바뀝니다</span>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setGu(null)}
            aria-pressed={gu === null}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " +
              (gu === null ? "border-brand bg-brand text-white" : "border-line bg-white text-slate-600 hover:border-brand/40")
            }
          >
            서울 전체
            <span className={"ml-1 text-[10px] " + (gu === null ? "text-white/70" : "text-slate-400")}>
              {fmt(m.totalHouseholds)}
            </span>
          </button>
          {districts.map((d) => (
            <button
              key={d.gu}
              type="button"
              onClick={() => setGu(gu === d.gu ? null : d.gu)}
              aria-pressed={gu === d.gu}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (gu === d.gu ? "border-brand bg-brand text-white" : "border-line bg-white text-slate-600 hover:border-brand/40")
              }
            >
              {d.gu}
              <span className={"ml-1 text-[10px] " + (gu === d.gu ? "text-white/70" : "text-slate-400")}>
                {d.total > 0 ? fmt(d.total) : "–"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 연도별 주요 구역 ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-[15px] font-bold text-ink sm:text-base">
            {activeLabel} 주요 입주 예정 구역
            <span className="ml-1.5 text-[12px] font-medium text-slate-500">{fmt(activeTotal)}세대</span>
          </h2>
          <span className="text-[11px] text-slate-400">
            {gu ?? "서울 전체"} ·{" "}
            {activePool != null && activePool > activeZones.length
              ? `전체 ${fmt(activePool)}곳 중 상위 ${activeZones.length}곳`
              : `상위 ${activeZones.length}곳`}
          </span>
        </div>

        {activeZones.length === 0 ? (
          <p className="mt-4 rounded-lg bg-canvas px-3 py-6 text-center text-[12px] text-slate-500">
            이 해에 세대수가 확인된 구역이 없습니다. 다른 연도를 눌러 보세요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {activeZones.map((z, i) => (
              <li key={z.id} className="flex items-center gap-2.5 py-2 sm:gap-3">
                <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/?zone=${encodeURIComponent(z.id)}`}
                      className="truncate text-[13px] font-semibold text-ink hover:text-brand hover:underline sm:text-sm"
                    >
                      {z.name}
                    </Link>
                    {z.basis === "official" ? (
                      <span className="shrink-0 rounded bg-brand/10 px-1.5 py-[1px] text-[9px] font-semibold text-brand">
                        공식
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-[1px] text-[9px] font-semibold text-slate-500">
                        추정
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {gu ? "" : `${z.gu} · `}
                    {z.stage ?? "단계 미상"}
                    {z.type ? ` · ${z.type}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold tabular-nums text-ink sm:text-sm">{fmt(z.households)}</p>
                  <p className="text-[10px] text-slate-400">세대</p>
                </div>
                <Link
                  href={`/?zone=${encodeURIComponent(z.id)}`}
                  className="hidden shrink-0 rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-slate-600 hover:border-brand/40 hover:text-brand sm:block"
                >
                  지도
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10.5px] text-slate-400">
          공식 = 준공·이전고시·착공일 등 확인된 날짜 기준 · 추정 = 단계별 평균 소요기간을 더해 산출
        </p>
      </section>

      {/* ── 자치구 비교 히트맵 ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-[15px] font-bold text-ink sm:text-base">자치구별 비교</h2>
          <span className="text-[11px] text-slate-400">행을 누르면 그 자치구만 봅니다 · 단위 세대</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-[9.5px] tabular-nums sm:text-[12px]">
            <thead>
              <tr className="text-[10.5px] text-slate-500">
                <th className="sticky left-0 z-10 w-[52px] whitespace-nowrap border-b border-line bg-white px-1 py-1.5 text-left font-medium sm:w-auto sm:px-2">
                  자치구
                </th>
                {years.map((y) => (
                  <th key={y} className="border-b border-line px-0.5 py-1.5 text-center font-medium sm:px-1">
                    {y}
                  </th>
                ))}
                <th className="border-b border-line px-1 py-1.5 text-right font-semibold sm:px-2">합계</th>
              </tr>
            </thead>
            <tbody>
              {districts.map((d) => {
                const on = gu === d.gu;
                return (
                  <tr
                    key={d.gu}
                    onClick={() => setGu(on ? null : d.gu)}
                    className={"cursor-pointer " + (on ? "outline outline-2 -outline-offset-2 outline-brand/60" : "")}
                  >
                    <td
                      className={
                        "sticky left-0 z-10 whitespace-nowrap border-b border-line/70 px-1 py-[5px] text-left font-semibold sm:px-2 " +
                        (on ? "bg-brand-tint text-brand" : "bg-white text-ink")
                      }
                    >
                      {d.gu}
                    </td>
                    {years.map((y) => {
                      const v = d.byYear[String(y)] ?? 0;
                      const a = v > 0 ? 0.07 + 0.85 * Math.pow(v / cellMax, 0.75) : 0;
                      return (
                        <td
                          key={y}
                          className="border-b border-line/70 px-0.5 py-[5px] text-center sm:px-1"
                          style={{
                            backgroundColor: v > 0 ? `rgba(0,84,166,${a.toFixed(3)})` : "transparent",
                            color: a > 0.7 ? "#fff" : v > 0 ? "#0f172a" : "#cbd5e1",
                          }}
                        >
                          {v > 0 ? fmt(v) : "–"}
                        </td>
                      );
                    })}
                    <td className="border-b border-line/70 px-1 py-[5px] text-right font-bold text-ink sm:px-2">{fmt(d.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-[9.5px] font-bold sm:text-[11.5px]">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-1 py-2 text-left sm:px-2">서울 전체</td>
                {years.map((y) => (
                  <td key={y} className="px-0.5 py-2 text-center text-brand sm:px-1">
                    {fmt(scopeAllYear(data, y))}
                  </td>
                ))}
                <td className="px-1 py-2 text-right text-brand sm:px-2">{fmt(m.totalHouseholds)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── 출처·유의사항 ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <h2 className="text-[13px] font-bold text-ink sm:text-sm">출처와 유의사항</h2>
        <ul className="mt-2 space-y-1.5">
          {m.sources.map((s) => (
            <li key={s.name} className="text-[11.5px] leading-relaxed text-slate-600">
              <b className="font-semibold text-ink">{s.name}</b> — {s.detail}
              <span className="text-slate-400"> ({s.license})</span>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {m.notes.map((n) => (
            <li key={n} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <span className="text-slate-300">·</span>
              <span>{n}</span>
            </li>
          ))}
          <li className="flex gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <span className="text-slate-300">·</span>
            <span>
              SH 임대세대수만 공개된 {m.excluded.rentalOnlySites}곳({fmt(m.excluded.rentalOnlyHouseholds)}세대)은
              분양 물량과 섞이지 않도록 기본 집계에서 제외했습니다.
            </span>
          </li>
        </ul>
        <p className="mt-3 text-[10.5px] text-slate-400">
          자료 기준일 {m.generatedAt} · 리디브(redev) · 서울 정비사업 실거래·매물 지도
        </p>
      </section>
    </div>
  );
}

// 히트맵 하단 합계 — 자치구 선택과 무관하게 서울 전체 연도 합계를 보여준다
function scopeAllYear(data: ForecastData, year: number) {
  return data.districts.reduce((s, d) => s + (d.byYear[String(year)] ?? 0), 0);
}
