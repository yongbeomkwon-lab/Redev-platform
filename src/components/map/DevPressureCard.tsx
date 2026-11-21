"use client";
// 개발압력 핫스팟 카드 — 지도의 🔥 핀을 눌렀을 때 뜬다.
//   · 추정 위치(구·법정동·행정동), 점수·등급, 포위 유형, 인접 정비구역, 노후도
//   · 「주변 정비구역 바로가기」 = 구역 상세 열기, 「지번·실거래 보기」 = 그 자리 지번 핀(실거래 5년)
import { DEV_GRADE_COLOR, type DevHotspot } from "@/lib/dev-pressure";

export default function DevPressureCard({
  spot,
  onClose,
  onOpenZone,
  onPickJibun,
}: {
  spot: DevHotspot;
  onClose: () => void;
  onOpenZone?: (zoneId: string) => void;
  onPickJibun?: (lat: number, lng: number) => void;
}) {
  const color = DEV_GRADE_COLOR[spot.grade];
  const place = [spot.gu, spot.dong].filter(Boolean).join(" ");
  return (
    <div
      data-testid="dev-pressure-card"
      data-hotspot-id={spot.id}
      className="w-[262px] overflow-hidden rounded-xl border border-line bg-white text-left shadow-[0_12px_32px_-12px_rgba(16,24,40,.5)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2 px-3 pb-1.5 pt-2.5">
        <span
          className="mt-[1px] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-white"
          style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }}
          aria-hidden
        >
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-extrabold leading-tight text-ink">개발압력 {Math.round(spot.score)}</span>
            <span
              className="rounded-full px-1.5 py-[1px] text-[9.5px] font-bold text-white"
              style={{ background: color }}
            >
              {spot.grade}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-600" title={place}>
            {place}
            {spot.hjd && spot.hjd !== spot.dong && (
              <span className="ml-1 font-normal text-slate-400">({spot.hjd})</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-1 -mt-1 rounded p-1 text-[12px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-1.5">
        {spot.types.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-1.5 py-[1px] text-[9.5px] font-semibold text-slate-600">
            {t}
          </span>
        ))}
        {spot.inZone && (
          <span className="rounded-full bg-amber-50 px-1.5 py-[1px] text-[9.5px] font-semibold text-amber-700">
            이미 지정 · {spot.inZone}
          </span>
        )}
      </div>

      <div className="px-3 pb-2 text-[10.5px] leading-[1.45] text-slate-600">{spot.reason}</div>

      <div className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-50 px-1.5 py-1.5 text-center">
        <div>
          <div className="text-[9px] text-slate-400">노후(30년↑)</div>
          <div className="text-[11.5px] font-bold text-ink">{spot.oldPct}%</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400">저층 비율</div>
          <div className="text-[11.5px] font-bold text-ink">{spot.lowPct}%</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400">아파트 동</div>
          <div className="text-[11.5px] font-bold text-ink">{spot.aptCount}</div>
        </div>
      </div>

      {spot.zones.length > 0 && (
        <div className="px-3 pb-2">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">주변 정비구역</div>
          <div className="flex flex-col gap-1">
            {spot.zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => onOpenZone?.(z.id)}
                disabled={!onOpenZone}
                title={`${z.name} — ${z.stage} (${z.dist}m). 누르면 이 구역 상세가 열립니다`}
                className="group flex items-center gap-1.5 rounded-md border border-line/80 px-1.5 py-1 text-left hover:border-brand/40 hover:bg-brand-tint/40 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-ink group-hover:text-brand">
                  {z.name}
                </span>
                <span className="shrink-0 text-[9px] text-slate-400">{z.stage}</span>
                <span className="shrink-0 text-[9.5px] font-bold text-slate-500">{z.dist}m</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {spot.station && (
        <div className="px-3 pb-2 text-[10px] text-slate-500">
          🚇 {spot.station.name}역 {spot.station.dist}m
        </div>
      )}

      <div className="flex gap-1.5 border-t border-line/70 px-2.5 py-2">
        <button
          type="button"
          onClick={() => onPickJibun?.(spot.lat, spot.lng)}
          disabled={!onPickJibun}
          data-testid="dev-pressure-jibun"
          title="이 지점의 지번을 찍고 실거래 5년 이력을 봅니다"
          className="flex-1 rounded-lg bg-brand px-2 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          지번·실거래 보기
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
