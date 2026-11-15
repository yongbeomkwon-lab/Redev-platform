"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneExplorer — 메인 탐색기
//  · 재개발닷컴 스타일: 유형/단계 필터 칩 + 구역 요약 뱃지(등록매물수·최저가·최저 초기투자금)
//  · 갈타맵 스타일: 구역 상세(사업개요·추진경과 타임라인·실거래 배수 분석·매물 비교)
//  · 재개발뷰 스타일: 실거주 의무/토허제 뱃지, 예상 입주 구간
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { Listing, Transaction, Zone, ZoneStage, ZoneType } from "@/lib/types";
import { STAGE_ORDER, calcMultiple } from "@/lib/types";
import { getProvider } from "@/lib/data-provider";
import { man } from "@/lib/format";
import MapPanel from "@/components/map/MapPanel";
import { Badge, StageBadge, TypeBadge } from "@/components/Badges";
import { ListingCompare } from "@/components/ListingCompare";
import { UnlockModal } from "@/components/ListingUnlockModal";

const ZONE_TYPES: (ZoneType | "전체")[] = ["전체", "신통기획", "모아타운", "도공복", "일반재개발"];
const STAGES: (ZoneStage | "전체")[] = ["전체", "추진위원회", "사업계획승인", "관리처분", "이주·철거", "착공", "준공"];

export default function ZoneExplorer() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [typeFilter, setTypeFilter] = useState<ZoneType | "전체">("전체");
  const [stageFilter, setStageFilter] = useState<ZoneStage | "전체">("전체");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

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
  const selectedTx = transactions.filter((t) => t.zoneId === selectedId);
  const selectedListings = listings.filter((l) => l.zoneId === selectedId);

  function unlock(id: string) {
    setUnlocked((prev) => new Set(prev).add(id));
  }

  if (loading) {
    return <div className="py-24 text-center text-slate-500">데이터를 불러오는 중…</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── 필터 칩 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">사업유형</span>
        {ZONE_TYPES.map((t) => (
          <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
            {t}
          </Chip>
        ))}
        <span className="ml-3 text-xs font-semibold text-slate-500">추진단계</span>
        {STAGES.map((s) => (
          <Chip key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
            {s}
          </Chip>
        ))}
      </div>

      {/* ── 지도 + 구역 목록 ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="h-[440px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <MapPanel zones={filtered} selectedZoneId={selectedId} onSelectZone={setSelectedId} />
        </div>
        <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
          {filtered.map((z) => {
            const zListings = listings.filter((l) => l.zoneId === z.id);
            const lowest = transactions.filter((t) => t.zoneId === z.id).reduce((m, t) => Math.min(m, t.price), Infinity);
            return (
              <button
                key={z.id}
                onClick={() => setSelectedId(z.id)}
                className={
                  "w-full rounded-xl border p-3 text-left transition " +
                  (selectedId === z.id
                    ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-400"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={z.type} />
                  <StageBadge stage={z.stage} stageOrder={STAGE_ORDER[z.stage]} />
                  <Badge tone={z.residenceRequired ? "red" : "slate"}>
                    {z.residenceRequired ? "실거주 의무" : "실거주 무관"}
                  </Badge>
                  {z.toehoApplied && <Badge tone="purple">토허제 적용</Badge>}
                </div>
                <div className="font-bold text-slate-900">
                  {z.name} <span className="text-sm font-normal text-slate-500">{z.district}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  <span>매물 <b className="text-slate-900">{zListings.length}건</b></span>
                  <span>최저가 <b className="text-slate-900">{isFinite(lowest) ? man(lowest) : "-"}</b>만원</span>
                  {z.lowestInitialInvestment && (
                    <span>최저 초기투자금 <b className="text-slate-900">{man(z.lowestInitialInvestment)}</b>만원</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-400">예상 입주 {z.moveInEstimate}</div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              조건에 맞는 구역이 없습니다.
            </p>
          )}
        </div>
      </div>

      {/* ── 구역 상세 (갈타맵 스타일) ── */}
      {selected && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
            <TypeBadge type={selected.type} />
            <StageBadge stage={selected.stage} stageOrder={STAGE_ORDER[selected.stage]} />
            <Badge tone={selected.residenceRequired ? "red" : "slate"}>
              {selected.residenceRequired ? "실거주 의무" : "실거주 무관"}
            </Badge>
            {selected.toehoApplied && <Badge tone="purple">토허제 적용</Badge>}
            <Badge tone="blue">예상 입주 {selected.moveInEstimate}</Badge>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 사업개요 */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">사업개요</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-200 p-4 text-sm">
                <dt className="text-slate-500">총 세대수</dt>
                <dd className="text-right font-semibold">{selected.households.toLocaleString()}세대</dd>
                <dt className="text-slate-500">추정 비례율</dt>
                <dd className="text-right font-semibold">{selected.ratioEstimate}%</dd>
                <dt className="text-slate-500">시공사</dt>
                <dd className="text-right font-semibold">{selected.constructor}</dd>
                <dt className="text-slate-500">예상 입주</dt>
                <dd className="text-right font-semibold">{selected.moveInEstimate}</dd>
              </dl>
              <p className="mt-2 text-xs text-slate-500">{selected.summary}</p>

              <h3 className="mb-2 mt-5 text-sm font-bold text-slate-700">추진경과</h3>
              <ol className="ml-2 space-y-3 border-l-2 border-slate-200 pl-4 text-sm">
                {selected.timeline.map((t) => (
                  <li key={t.date} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <div className="text-xs text-slate-400">{t.date}</div>
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
              <p className="mt-2 text-xs text-slate-400">
                ※ 고시·공고 근거 링크는 정비사업 정보몽땅/서울시 고시 데이터 연동 후 활성화됩니다.
              </p>
            </div>

            {/* 실거래가 분석 */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">실거래가 분석</h3>
              <TransactionTrend transactions={selectedTx} />
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
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
          </div>

          {/* 매물 비교 */}
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-bold text-slate-700">
              구역 내 등록 매물 비교
              <span className="ml-2 text-xs font-normal text-slate-400">
                매수자 열람은 유료 열람권 / 중개사 등록은 유료 플랜
              </span>
            </h3>
            <ListingCompare listings={selectedListings} zones={zones} unlockedIds={unlocked} onUnlockRequest={setUnlockTarget} />
          </div>
        </section>
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
        "rounded-full border px-3 py-1 text-xs font-medium transition " +
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {kinds.map((k) => {
        const rows = transactions.filter((t) => t.kind === k).sort((a, b) => a.date.localeCompare(b.date));
        const max = Math.max(...rows.map((r) => r.price));
        return (
          <div key={k} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-600">{k}</span>
              <span className="text-[11px] text-slate-400">만원</span>
            </div>
            <div className="flex h-16 items-end gap-1">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-1 flex-col items-center gap-0.5" title={r.date + " " + man(r.price) + "만원"}>
                  <div
                    className="w-full rounded-t bg-blue-500/80"
                    style={{ height: Math.max(8, (r.price / max) * 56) + "px" }}
                  />
                  <span className="text-[9px] text-slate-400">{r.date.slice(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              최저 {man(Math.min(...rows.map((r) => r.price)))} ~ 최고 {man(max)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
