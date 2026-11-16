"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneExplorer — 메인 탐색기 (지도 중심 · 전체 화면 레이아웃)
//  · 재개발뷰(jaeview.com)·네이버지도처럼 **지도가 화면 전체**를 채우고,
//    검색·필터·범례·구역 상세는 지도 위에 떠 있는 패널로 올린다.
//  · 재개발닷컴 스타일: 유형/단계 필터 칩 + 구역 요약 뱃지(등록매물수·최저가·최저 초기투자금)
//  · 갈타맵 스타일: 구역 상세(사업개요·추진경과 타임라인·실거래 배수 분석·매물 비교)
//  · 재개발뷰 스타일: 실거주 의무/토허제 뱃지, 예상 입주 구간
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { Listing, MapZoneType, Transaction, Zone, ZoneStage, ZoneType } from "@/lib/types";
import { STAGE_ORDER, calcMultiple } from "@/lib/types";
import { loadSeoulZones, isCompletedZone, type SeoulZone, type SeoulZonesMeta } from "@/lib/seoul-zones";
import { getProvider } from "@/lib/data-provider";
import { man } from "@/lib/format";
import MapPanel from "@/components/map/MapPanel";
import { TYPE_COLORS, TYPE_ORDER } from "@/components/map/colors";
import ZoneOfficialPanel from "@/components/ZoneOfficialPanel";
import { Badge, StageBadge, TypeBadge } from "@/components/Badges";
import { ListingCompare } from "@/components/ListingCompare";
import { UnlockModal } from "@/components/ListingUnlockModal";

const ZONE_TYPES: (ZoneType | "전체")[] = ["전체", "신통기획", "모아타운", "도공복", "일반재개발"];
const STAGES: (ZoneStage | "전체")[] = ["전체", "추진위원회", "사업계획승인", "관리처분", "이주·철거", "착공", "준공"];

export default function ZoneExplorer() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  // 서울시 정비구역 전수 (public/data/zones.geojson → 클라이언트 fetch)
  const [seoulZones, setSeoulZones] = useState<SeoulZone[]>([]);
  const [seoulMeta, setSeoulMeta] = useState<SeoulZonesMeta | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ZoneType | "전체">("전체");
  const [stageFilter, setStageFilter] = useState<ZoneStage | "전체">("전체");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  // 준공 완료 구역 표시 여부 — 기본은 숨김(진행 중 구역만 보여준다)
  const [showCompleted, setShowCompleted] = useState(false);
  // 지도 위 떠 있는 패널 열림 상태
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  // 좁은 화면에서는 상세 패널을 접은 채로 시작해 지도를 가리지 않게 한다
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelOpen(false);
      setLegendOpen(false);
    }
  }, []);

  useEffect(() => {
    const p = getProvider();
    Promise.all([p.getZones(), p.getTransactions(), p.getListings()])
      .then(([z, t, l]) => {
        setZones(z);
        setTransactions(t);
        setListings(l);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 서울시 정비구역 전수 레이어
  useEffect(() => {
    loadSeoulZones().then((d) => {
      setSeoulZones(d.zones);
      setSeoulMeta(d.meta);
    });
  }, []);

  const filtered = useMemo(
    () =>
      zones.filter(
        (z) =>
          (typeFilter === "전체" || z.type === typeFilter) &&
          (stageFilter === "전체" || z.stage === stageFilter)
      ),
    [zones, typeFilter, stageFilter]
  );

  const selected = zones.find((z) => z.id === selectedId);
  // 대표 구역이 아닌 구역 — 서울시 고시 데이터만 있는 구역
  const selectedSeoul = selected ? undefined : seoulZones.find((z) => z.id === selectedId);
  const selectedTx = transactions.filter((t) => t.zoneId === selectedId);
  const selectedListings = listings.filter((l) => l.zoneId === selectedId);

  // ── 준공 완료 구역(준공·준공(일부) 260곳) 숨김 ──────────────────────────────
  //   이미 입주까지 끝나 아파트가 된 구역이라 상담 대상이 아니다. 기본 지도·검색·
  //   범례 숫자에서 모두 빼고, ‘준공 완료 포함’ 토글을 켠 때만 다시 보여준다(점선 표시).
  const completedZones = useMemo(() => seoulZones.filter(isCompletedZone), [seoulZones]);
  const visibleSeoulZones = useMemo(
    () => (showCompleted ? seoulZones : seoulZones.filter((z) => !isCompletedZone(z))),
    [seoulZones, showCompleted]
  );

  function toggleCompleted() {
    const next = !showCompleted;
    setShowCompleted(next);
    // 숨기는 순간 준공 구역이 선택돼 있으면 선택을 풀어 유령 선택이 남지 않게 한다
    if (!next) {
      const z = seoulZones.find((s) => s.id === selectedId);
      if (z && isCompletedZone(z)) setSelectedId(undefined);
    }
  }

  // 구역명·별칭·자치구 검색 (1,800여 구역 중 원하는 곳으로 바로 이동)
  //   · 공식 별칭까지 훑는다 — '사당동 419-1'로도 '사당15'로도 같은 구역이 뜬다
  //   · 띄어쓰기를 무시해 '사당동419-1', '사당 15' 같은 입력도 걸린다
  //   · 기본(준공 숨김)에서는 준공 구역이 결과에 안 뜨고, 그 구역만 맞았을 때
  //     '준공 완료라 숨겨져 있다'는 안내를 대신 보여준다(데이터가 없는 줄 오해하지 않게)
  const search = useMemo(() => {
    const term = query.trim();
    const empty = { results: [] as SeoulZone[], hidden: [] as SeoulZone[] };
    if (!term) return empty;
    const flat = term.replace(/\s+/g, "");
    const hit = (s?: string) => !!s && s.replace(/\s+/g, "").includes(flat);
    const rank = (z: SeoulZone) => (hit(z.name) ? 0 : (z.alias ?? []).some(hit) ? 1 : 2);
    const matches = (list: SeoulZone[]) =>
      list.filter((z) => hit(z.name) || z.gu.includes(term) || (z.alias ?? []).some(hit));
    const sortFn = (a: SeoulZone, b: SeoulZone) =>
      rank(a) - rank(b) ||
      Number(b.featured) - Number(a.featured) ||
      Number(!b.polygon) - Number(!a.polygon) ||
      b.area - a.area;
    const results = matches(visibleSeoulZones).sort(sortFn).slice(0, 8);
    const hidden =
      !showCompleted && results.length === 0 ? matches(completedZones).sort(sortFn).slice(0, 3) : [];
    return { results, hidden };
  }, [query, visibleSeoulZones, completedZones, showCompleted]);

  // 범례 카운터 — 지금 지도에 깔린 구역 수(준공 숨김 상태면 진행 중 구역만)
  const typeCounts = useMemo(() => {
    const m: Partial<Record<MapZoneType, number>> = {};
    for (const z of visibleSeoulZones) m[z.type] = (m[z.type] ?? 0) + 1;
    return m;
  }, [visibleSeoulZones]);

  function unlock(id: string) {
    setUnlocked((prev) => new Set(prev).add(id));
  }

  function pickZone(id: string) {
    setSelectedId(id);
    setPanelOpen(true);
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-52px)] items-center justify-center bg-slate-100 text-sm text-slate-500">
        데이터를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-52px)] w-full overflow-hidden bg-slate-200">
      {/* ── 지도: 화면 전체 ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        <MapPanel
          zones={filtered}
          seoulZones={visibleSeoulZones}
          selectedZoneId={selectedId}
          onSelectZone={pickZone}
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          completedCount={completedZones.length}
        />
      </div>

      {/* ── 좌상단: 검색 + 필터 ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-2 z-[620] flex w-[min(94vw,382px)] flex-col gap-2 sm:left-3 sm:top-3">
        <div className="pointer-events-auto relative z-[650] rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden className="text-base leading-none text-slate-400">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="구역명·자치구 검색 — 예: 목동4단지, 성수전략, 은평구"
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="rounded px-1 text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* 검색 결과 */}
          {(search.results.length > 0 || search.hidden.length > 0) && (
            <div className="absolute inset-x-0 top-full z-[660] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              {search.results.length > 0 && (
                <ul className="max-h-[46vh] overflow-y-auto">
                  {search.results.map((z) => (
                    <li key={z.id}>
                      <button
                        onClick={() => {
                          pickZone(z.id);
                          setQuery("");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <i
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: TYPE_COLORS[z.type] }}
                        />
                        <span className="font-medium text-slate-800">{z.name}</span>
                        {z.alias?.[0] && !z.name.includes(z.alias[0]) && (
                          <span className="text-xs text-slate-400">{z.alias[0]}</span>
                        )}
                        <span className="text-xs text-slate-500">{z.gu}</span>
                        <span className="ml-auto text-xs text-slate-400">
                          {z.polygon ? z.stage : "경계 미고시"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* 준공 완료라 숨겨진 구역만 검색됐을 때 — 데이터 누락으로 오해하지 않도록 안내 */}
              {search.hidden.length > 0 && (
                <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p>
                    <b>{search.hidden[0].name}</b>
                    {search.hidden[0].stage ? ` (${search.hidden[0].stage})` : ""}
                    {search.hidden.length > 1 ? ` 외 ${search.hidden.length - 1}곳` : ""}은 준공 완료 구역이라
                    기본 지도에서 숨겨져 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCompleted(true)}
                    className="mt-1 rounded-full border border-amber-400 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    준공 완료 포함해서 보기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 필터 — 접었다 펼 수 있는 카드 */}
        <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <span className="text-xs font-bold text-slate-800">필터</span>
            <span className="truncate text-[11px] text-slate-500">
              {typeFilter} · {stageFilter}
            </span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400">
              {filtersOpen ? "접기 ▲" : "펼치기 ▼"}
            </span>
          </button>
          {filtersOpen && (
            <div className="max-h-[46vh] space-y-2 overflow-y-auto border-t border-slate-100 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">구역 유형</span>
                {ZONE_TYPES.map((t) => (
                  <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">추진단계</span>
                {STAGES.map((s) => (
                  <Chip key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={toggleCompleted}
                  aria-pressed={showCompleted}
                  title={
                    showCompleted
                      ? "준공·입주 완료 구역을 지도에서 다시 숨깁니다"
                      : "이미 준공·입주가 끝난 구역까지 지도에 표시합니다"
                  }
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition " +
                    (showCompleted
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-dashed border-slate-300 bg-white text-slate-500 hover:border-slate-500 hover:text-slate-700")
                  }
                >
                  <span aria-hidden>{showCompleted ? "👁" : "🏁"}</span>
                  준공 완료 포함 ({completedZones.length})
                </button>
                <span className="text-[11px] leading-tight text-slate-500">
                  {showCompleted
                    ? `준공·입주 완료 ${completedZones.length}곳까지 표시 중 (점선)`
                    : `준공 구역 ${completedZones.length}곳 숨김 · 진행 중 ${visibleSeoulZones.length.toLocaleString()}곳`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 좌하단: 범례 ───────────────────────────────────────────────────── */}
      <div className="pointer-events-auto absolute bottom-14 left-2 z-[600] max-w-[min(94vw,430px)] rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur md:bottom-[3.4rem] md:left-2">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
        >
          <span className="text-xs font-bold text-slate-800">범례</span>
          <span className="truncate text-[11px] text-slate-500">
            서울시 {showCompleted ? "정비구역 전체" : "진행 중 정비구역"}{" "}
            {visibleSeoulZones.length.toLocaleString()}곳
            {seoulMeta?.asOf ? ` · ${seoulMeta.asOf} 기준` : ""}
          </span>
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400">
            {legendOpen ? "▲" : "▼"}
          </span>
        </button>
        {legendOpen && (
          <div className="space-y-1.5 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {TYPE_ORDER.map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLORS[t] }} />
                  {t}
                  <b className="font-semibold text-slate-800">{(typeCounts[t] ?? 0).toLocaleString()}</b>
                </span>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              경계·면적·단계: 서울시 도시계획사업(서울플랜+)·의제처리구역(UQ181) 실데이터 ·{" "}
              <b>점</b>은 구역계 미고시 후보지(예: 사당21구역) · <b>점선</b>은 준공·입주 완료 구역
            </p>
            <p className="text-[10px] leading-snug text-slate-400">
              구역을 클릭하면 서울시 고시 데이터가 열립니다 · 지도를 움직여 둘러보세요
            </p>
          </div>
        )}
      </div>

      {/* ── 우측: 구역 상세 · 목록 패널 ─────────────────────────────────────── */}
      {panelOpen ? (
        <aside className="absolute z-[610] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl inset-x-2 bottom-2 top-auto max-h-[62dvh] md:inset-x-auto md:left-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-[400px]">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <b className="text-sm font-bold text-slate-900">
              {selected ? selected.name : selectedSeoul ? "서울시 고시 구역" : "대표 구역"}
            </b>
            {!selected && !selectedSeoul && (
              <span className="text-[11px] text-slate-500">{filtered.length}곳 · 실거래·매물 상세</span>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="패널 접기"
              className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              접기 ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* 1) 대표 구역 상세 */}
            {selected && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={selected.type} />
                  <StageBadge stage={selected.stage} stageOrder={STAGE_ORDER[selected.stage]} />
                  <Badge tone={selected.residenceRequired ? "red" : "slate"}>
                    {selected.residenceRequired ? "실거주 의무" : "실거주 무관"}
                  </Badge>
                  {selected.toehoApplied && <Badge tone="purple">토허제 적용</Badge>}
                  <Badge tone="blue">예상 입주 {selected.moveInEstimate}</Badge>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">사업개요</h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-slate-200 p-3 text-xs">
                    <dt className="text-slate-500">총 세대수</dt>
                    <dd className="text-right font-semibold">{selected.households.toLocaleString()}세대</dd>
                    <dt className="text-slate-500">추정 비례율</dt>
                    <dd className="text-right font-semibold">{selected.ratioEstimate}%</dd>
                    <dt className="text-slate-500">시공사</dt>
                    <dd className="text-right font-semibold">{selected.constructor}</dd>
                    <dt className="text-slate-500">예상 입주</dt>
                    <dd className="text-right font-semibold">{selected.moveInEstimate}</dd>
                  </dl>
                </div>

                {/* 서울시 고시 데이터 (구역 경계·면적·단계의 근거) */}
                {selected.official && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[11px]">
                    <div className="mb-1 flex items-center justify-between font-semibold text-emerald-800">
                      <span>서울시 고시 데이터</span>
                      <span className="font-normal text-emerald-700/70">{selected.official.asOf} 기준</span>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-emerald-900">
                      <dt className="text-emerald-700/80">고시 명칭</dt>
                      <dd>{selected.official.name}</dd>
                      <dt className="text-emerald-700/80">사업유형</dt>
                      <dd>{selected.official.kind}</dd>
                      <dt className="text-emerald-700/80">추진단계</dt>
                      <dd>{selected.official.stage}</dd>
                      <dt className="text-emerald-700/80">구역면적</dt>
                      <dd>
                        {selected.official.area.toLocaleString()}㎡
                        {(selected.official.area / 3.3058 / 1000).toFixed(1)}천평
                      </dd>
                      {selected.official.geomSource?.startsWith("UQ181") && (
                        <>
                          <dt className="text-emerald-700/80">경계 도형</dt>
                          <dd>
                            의제처리구역 실경계(필지선 추종)
                            <span className="text-emerald-700/70"> · {selected.official.geomAsOf} 기준</span>
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-slate-500">{selected.summary}</p>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">추진경과</h3>
                  <ol className="ml-1.5 space-y-2 border-l-2 border-slate-200 pl-3 text-xs">
                    {selected.timeline.map((t) => (
                      <li key={t.date} className="relative">
                        <span className="absolute -left-[18px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                        <div className="text-[10px] text-slate-400">{t.date}</div>
                        {t.sourceUrl ? (
                          <a
                            href={t.sourceUrl}
                            className="font-medium text-blue-700 underline decoration-blue-200 hover:decoration-blue-500"
                          >
                            {t.label}
                          </a>
                        ) : (
                          <span className="font-medium">{t.label}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">실거래가 분석</h3>
                  <TransactionTrend transactions={selectedTx} />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">거래월</th>
                          <th className="px-2 py-1.5 font-medium">유형</th>
                          <th className="px-2 py-1.5 font-medium">동/층</th>
                          <th className="px-2 py-1.5 text-right font-medium">전용</th>
                          <th className="px-2 py-1.5 text-right font-medium">거래가</th>
                          <th className="px-2 py-1.5 text-right font-medium">대지지분</th>
                          <th className="px-2 py-1.5 text-right font-medium">공시가 배수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTx.map((t) => (
                          <tr key={t.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5">{t.date}</td>
                            <td className="px-2 py-1.5">{t.kind}</td>
                            <td className="px-2 py-1.5">{t.dong}</td>
                            <td className="px-2 py-1.5 text-right">{t.areaSqm}㎡</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{man(t.price)}</td>
                            <td className="px-2 py-1.5 text-right">{t.landShareSqm ? t.landShareSqm + "㎡" : "-"}</td>
                            <td className="px-2 py-1.5 text-right">{calcMultiple(t) ? calcMultiple(t) + "배" : "-"}</td>
                          </tr>
                        ))}
                        {selectedTx.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-2 py-6 text-center text-slate-400">
                              실거래 데이터가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">
                    구역 내 등록 매물 비교
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                      열람은 유료 열람권 / 등록은 유료 플랜
                    </span>
                  </h3>
                  <ListingCompare
                    listings={selectedListings}
                    zones={zones}
                    unlockedIds={unlocked}
                    onUnlockRequest={setUnlockTarget}
                  />
                </div>

                <p className="text-[10px] leading-snug text-slate-400">
                  ※ 구역 경계·면적·추진단계는 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」(OA-22712)
                  실데이터이며, 경계 도형은 같은 구역의 「서울시 의제처리구역 위치정보」(OA-20957/UQ181) 정밀
                  도형이 있으면 그것을 씁니다. 세대수·비례율·시공사·거래·매물은 데모 샘플값입니다.
                </p>
              </div>
            )}

            {/* 2) 서울시 고시 구역 상세 (대표 구역이 아닌 구역) */}
            {selectedSeoul && (
              <ZoneOfficialPanel
                zone={selectedSeoul}
                meta={
                  seoulMeta ?? {
                    source: "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+)",
                    sourceDetail: "OA-20957 서울시 의제처리구역 위치정보(UQ181)",
                    asOf: "2026-09-10",
                    asOfDetail: "2026-09-11",
                    count: seoulZones.length,
                  }
                }
                onClose={() => setSelectedId(undefined)}
              />
            )}

            {/* 3) 아무것도 선택되지 않았을 때: 대표 구역 목록 */}
            {!selected && !selectedSeoul && (
              <div className="space-y-2">
                {filtered.map((z) => {
                  const zListings = listings.filter((l) => l.zoneId === z.id);
                  const lowest = transactions
                    .filter((t) => t.zoneId === z.id)
                    .reduce((m, t) => Math.min(m, t.price), Infinity);
                  return (
                    <button
                      key={z.id}
                      onClick={() => pickZone(z.id)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={z.type} />
                        <StageBadge stage={z.stage} stageOrder={STAGE_ORDER[z.stage]} />
                        {z.toehoApplied && <Badge tone="purple">토허제</Badge>}
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {z.name} <span className="text-xs font-normal text-slate-500">{z.district}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                        <span>
                          매물 <b className="text-slate-900">{zListings.length}건</b>
                        </span>
                        <span>
                          최저가 <b className="text-slate-900">{isFinite(lowest) ? man(lowest) : "-"}</b>만원
                        </span>
                        {z.lowestInitialInvestment && (
                          <span>
                            초기투자 <b className="text-slate-900">{man(z.lowestInitialInvestment)}</b>만원
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">예상 입주 {z.moveInEstimate}</div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    조건에 맞는 구역이 없습니다.
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute bottom-2 right-2 z-[610] rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur hover:bg-white md:bottom-auto md:right-3 md:top-3"
        >
          구역 정보 ▲
        </button>
      )}

      {unlockTarget && (
        <UnlockModal
          listing={unlockTarget}
          zone={zones.find((z) => z.id === unlockTarget.zoneId)}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={unlock}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition " +
        (active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
      }
    >
      {children}
    </button>
  );
}

/** 유형별 실거래 추이 — 간단한 미니 바차트 (외부 차트 라이브러리 의존성 없음) */
function TransactionTrend({ transactions }: { transactions: Transaction[] }) {
  const kinds = [...new Set(transactions.map((t) => t.kind))];
  if (transactions.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {kinds.map((k) => {
        const rows = transactions.filter((t) => t.kind === k).sort((a, b) => a.date.localeCompare(b.date));
        const max = Math.max(...rows.map((r) => r.price));
        return (
          <div key={k} className="rounded-xl border border-slate-200 p-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-slate-600">{k}</span>
              <span className="text-[10px] text-slate-400">만원</span>
            </div>
            <div className="flex h-14 items-end gap-1">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-1 flex-col items-center gap-0.5" title={r.date + " " + man(r.price) + "만원"}>
                  <div
                    className="w-full rounded-t bg-blue-500/80"
                    style={{ height: Math.max(8, (r.price / max) * 48) + "px" }}
                  />
                  <span className="text-[9px] text-slate-400">{r.date.slice(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              최저 {man(Math.min(...rows.map((r) => r.price)))} ~ 최고 {man(max)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
