"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneConsent — 구역 상세의 「동의율」 카드
//
//   · 동의율은 사업 추진을 가르는 핵심 수치라 모든 구역 상세(대표 구역·서울시 고시 구역·관리자 구역)에
//     같은 모양으로 붙는다.
//   · 값이 있으면 큰 숫자 + 진행률 막대 + 기준일 + 비고를 한 카드에 담는다.
//   · 값이 없으면(대부분의 구역) 점선 테두리 한 줄로 '미공개'라고만 적는다 —
//     0%와 '모르는 값'은 다르므로 숫자를 지어내지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { formatConsentDate, formatConsentRate, type ConsentInfo } from "@/lib/consent";

export default function ZoneConsent({
  rate,
  date,
  note,
  dense = false,
  edited = false,
}: ConsentInfo & {
  /** 관리자 패널 안처럼 좁은 자리 — 위아래 여백만 줄인다 */
  dense?: boolean;
  /** 관리자 화면에서 고쳐 저장한 값 */
  edited?: boolean;
}) {
  const rateText = formatConsentRate(rate);
  const dateText = formatConsentDate(date);

  if (rateText === null) {
    return (
      <div
        data-testid="zone-consent"
        className={
          "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 " +
          (dense ? "py-1.5" : "py-2")
        }
        title="이 구역은 토지등소유자 동의율이 공개되지 않았습니다 — 확인되면 관리자 화면에서 입력할 수 있습니다"
      >
        <span className="text-[11px] font-semibold text-slate-500">동의율</span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
          미공개
        </span>
        <span className="text-[10px] text-slate-400">이 구역은 동의율이 공개되지 않았습니다</span>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, rate as number));
  const strong = pct >= 70;

  return (
    <div
      data-testid="zone-consent"
      className={
        "rounded-xl border bg-brand-tint px-3 " +
        (strong ? "border-emerald-300/80 " : "border-blue-200 ") +
        (dense ? "py-2" : "py-2.5")
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold text-brand-deep">동의율</span>
        <b
          data-testid="zone-consent-rate"
          className={"text-xl font-extrabold leading-none tabular-nums " + (strong ? "text-emerald-700" : "text-brand-deep")}
        >
          {rateText}
        </b>
        {dateText && <span className="text-[10px] text-slate-500">{dateText} 기준</span>}
        {edited && (
          <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-sky-700 ring-1 ring-sky-200">
            관리자 입력
          </span>
        )}
      </div>
      {/* 진행률 막대 — 100%를 가득 채운다(60%면 60%만큼) */}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200" role="img" aria-label={`동의율 ${rateText}`}>
        <div
          className={"h-full rounded-full " + (strong ? "bg-emerald-500" : "bg-brand")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {note && <p className="mt-1 text-[10.5px] leading-snug text-slate-600">{note}</p>}
      <p className="mt-1 text-[9.5px] leading-snug text-slate-400">
        토지등소유자 동의율(공개된 값) — 진행에 따라 달라질 수 있습니다
      </p>
    </div>
  );
}
