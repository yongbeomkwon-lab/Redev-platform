"use client";
// ─────────────────────────────────────────────────────────────────────────────
// JibunPinCard — 지도에서 찍은 지번 핀에 붙는 카드
//
//  · 「📍 지번 찍기」/우클릭/구역 밖 클릭으로 찍은 좌표의 **지번 주소**, 그 지점이 속한
//    **정비구역(단계) 바로가기**, 그리고 **[이 지번 실거래 5년 보기]** 버튼을 보여준다.
//  · 카카오맵·Leaflet 이 같은 카드를 쓴다(모양이 갈라지지 않게).
// ─────────────────────────────────────────────────────────────────────────────
import type { JibunPin } from "./props";

export default function JibunPinCard({
  pin,
  onClose,
  onOpenHistory,
  onOpenZone,
  historyLoading = false,
}: {
  pin: JibunPin;
  onClose?: () => void;
  onOpenHistory?: (pin: JibunPin) => void;
  onOpenZone?: (zoneId: string) => void;
  historyLoading?: boolean;
}) {
  const loading = pin.state === "loading";
  const title = loading
    ? "주소 확인 중…"
    : pin.jibunAddress || (pin.dong ? `${pin.dong} ${pin.jibun}`.trim() : "주소 미확인");
  const canOpen = !!onOpenHistory && !!pin.jibun && !loading && pin.state !== "error";

  return (
    <div
      data-testid="jibun-pin-card"
      className="w-[236px] overflow-hidden rounded-xl border border-line bg-white text-left shadow-[0_10px_28px_-10px_rgba(16,24,40,.45)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-1 px-2.5 pb-1 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            <span className="text-[9px] font-bold uppercase tracking-wide text-brand">찍은 지번</span>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] font-bold leading-tight text-ink" title={title}>
            {title}
          </div>
          {!loading && (pin.roadAddress || pin.buildingName) && (
            <div className="mt-0.5 truncate text-[10px] text-slate-500">
              {[pin.roadAddress, pin.buildingName ? `(${pin.buildingName})` : null]
                .filter(Boolean)
                .join(" ")}
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="지번 핀 지우기"
            data-testid="jibun-pin-close"
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] leading-none text-slate-400 hover:bg-canvas hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* 소속 정비구역 — 누르면 그 구역 상세를 연다 */}
      <div className="px-2.5 pb-1">
        {loading ? (
          <div className="text-[10px] text-slate-400">이 지점의 구역을 확인하는 중…</div>
        ) : pin.zones.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {pin.zones.slice(0, 3).map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => onOpenZone?.(z.id)}
                title={`${z.name}${z.stage ? ` · ${z.stage}` : ""} 상세 열기`}
                className="max-w-full truncate rounded-full border border-brand/30 bg-brand-tint px-1.5 py-[2px] text-[10px] font-semibold text-brand hover:border-brand"
              >
                {z.name}
                {z.completed && <span className="ml-1 font-normal text-slate-400">준공</span>}
                {z.stage && !z.completed && (
                  <span className="ml-1 font-normal text-brand/70">{z.stage}</span>
                )}
              </button>
            ))}
            {pin.zones.length > 3 && (
              <span className="text-[10px] text-slate-400">외 {pin.zones.length - 3}곳</span>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-slate-500">정비구역 밖 지점입니다.</div>
        )}
      </div>

      <div className="px-2.5 pb-2">
        <button
          type="button"
          disabled={!canOpen || historyLoading}
          onClick={() => onOpenHistory?.(pin)}
          data-testid="jibun-open-history"
          className={
            "mt-1 w-full rounded-lg py-1.5 text-[11px] font-bold transition " +
            (canOpen && !historyLoading
              ? "bg-brand text-white hover:bg-brand-deep"
              : "cursor-not-allowed bg-slate-100 text-slate-400")
          }
        >
          {historyLoading ? "실거래 확인 중…" : "이 지번 실거래 5년 보기"}
        </button>
        {pin.note && (
          <p className="mt-1 text-[10px] leading-snug text-amber-700">{pin.note}</p>
        )}
      </div>
    </div>
  );
}
