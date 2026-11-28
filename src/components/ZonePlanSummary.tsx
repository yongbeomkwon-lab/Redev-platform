"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZonePlanSummary — 구역 상세의 「사업개요」 카드 (세대수·규모·시공사·최신 현황)
//
// 왜 따로 두나
//   · 서울시 고시 레코드(OA-22712)에는 구역면적·단계만 있고 **세대수·시공사·동수**는 없다.
//     대표 구역 6곳은 앱의 샘플 값(Zone)에 그 값이 붙어 있었지만, 나머지 2,300여 구역은
//     사업 규모를 볼 자리가 아예 없었다.
//   · 공개 자료로 확인한 구역부터 구역 레코드(seoul-zones.json → zones.geojson)에
//     households·householdsSale·householdsRental·contractor·buildScale·planNote 를 넣고,
//     이 카드가 그 값을 보여 준다.
//   · 값이 하나도 없는 구역은 카드를 그리지 않는다 — 없는 수치를 지어내지 않는다.
//   · 대표 구역(샘플 값)은 기존 「사업개요」 카드를 그대로 쓰므로 이 카드를 겹쳐 그리지 않는다
//     (ZoneOfficialPanel 은 featured 가 아닌 구역에서만 이 컴포넌트를 부른다).
// ─────────────────────────────────────────────────────────────────────────────
import type { SeoulZone } from "@/lib/seoul-zones";

function n(v: number): string {
  return v.toLocaleString("ko-KR");
}

export default function ZonePlanSummary({ zone }: { zone: SeoulZone }) {
  const total = zone.households;
  const sale = zone.householdsSale;
  const rental = zone.householdsRental;
  const hasAny =
    typeof total === "number" ||
    typeof sale === "number" ||
    typeof rental === "number" ||
    !!zone.contractor ||
    !!zone.buildScale ||
    !!zone.planNote;
  if (!hasAny) return null;

  // 분양 아래 보조줄 — 조합원·일반분양을 알 때만 적는다(합계만 알면 합계만)
  const parts: string[] = [];
  if (typeof zone.householdsMember === "number") parts.push(`조합원 ≈${n(zone.householdsMember)}`);
  if (typeof zone.householdsGeneral === "number") parts.push(`일반분양 ≈${n(zone.householdsGeneral)}`);
  if (typeof rental === "number") parts.push(`임대 ${n(rental)}`);
  const saleSub = parts.length ? parts.join(" · ") : undefined;

  return (
    <div data-testid="zone-plan-summary" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[11px] font-bold text-slate-700">사업개요</span>
        {zone.planAsOf && (
          <span className="whitespace-nowrap text-[10px] text-slate-400">{zone.planAsOf} 기준</span>
        )}
      </div>

      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px]">
        {typeof total === "number" && (
          <>
            <dt className="whitespace-nowrap text-slate-500">총 세대수</dt>
            <dd className="min-w-0 text-right">
              <span className="text-[13px] font-bold tabular-nums text-slate-900">{n(total)}세대</span>
              {typeof sale === "number" && (
                <span className="mt-0.5 block break-keep text-[10px] leading-snug text-slate-500">
                  분양 {n(sale)}세대{saleSub ? ` (${saleSub})` : ""}
                </span>
              )}
              {typeof sale !== "number" && saleSub && (
                <span className="mt-0.5 block break-keep text-[10px] leading-snug text-slate-500">{saleSub}</span>
              )}
            </dd>
          </>
        )}
        {!total && saleSub && (
          <>
            <dt className="whitespace-nowrap text-slate-500">공급 계획</dt>
            <dd className="min-w-0 break-keep text-right font-semibold text-slate-800">{saleSub}</dd>
          </>
        )}
        {zone.buildScale && (
          <>
            <dt className="whitespace-nowrap text-slate-500">규모</dt>
            <dd className="min-w-0 break-keep text-right font-semibold text-slate-800">{zone.buildScale}</dd>
          </>
        )}
        {zone.contractor && (
          <>
            <dt className="whitespace-nowrap text-slate-500">시공사</dt>
            <dd className="min-w-0 break-keep text-right font-semibold text-slate-800">{zone.contractor}</dd>
          </>
        )}
      </dl>

      {zone.planNote && (
        <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <div className="text-[10px] font-semibold text-slate-500">최신 진행 현황</div>
          <p className="mt-0.5 break-keep text-[11px] leading-relaxed text-slate-700">{zone.planNote}</p>
        </div>
      )}

      {zone.planSource && (
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">출처: {zone.planSource}</p>
      )}
    </div>
  );
}
