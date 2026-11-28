"use client";
// ─────────────────────────────────────────────────────────────────────────────
// StageTimeline — 구역 상세 패널의 「사업 진행단계」 카드
//   ① 이미 지난 단계(체크 · 날짜가 있으면 함께) ② 지금 단계(강조) ③ 남은 단계(회색)
//   를 세로 스텝퍼 하나로 보여준다. 400px 드로어 안에서만 쓰므로 1단·11px 기준.
//   날짜는 서울시 고시·공고 문자열에 적힌 것만 표시한다(비어 있으면 비워 둔다).
//   후보지 취소·추천 제외처럼 멈춘 구역은 사다리 대신 중단 배지와 사유만 보여준다.
// ─────────────────────────────────────────────────────────────────────────────
import { buildStageTimeline, type StageTimelineInput } from "@/lib/stage-timeline";

function Check() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden className="h-[7px] w-[7px]">
      <path d="M1.8 5.2 4.1 7.4 8.2 2.8" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StageTimeline({ zone }: { zone: StageTimelineInput }) {
  const t = buildStageTimeline(zone);

  // ── 멈춘 구역: 사다리 대신 중단 사유 ──────────────────────────────────────
  if (t.status === "halted") {
    return (
      <div
        data-testid="stage-timeline-halted"
        className="rounded-xl border border-rose-200 bg-rose-50/70 p-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-rose-900">사업 진행단계</span>
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">중단</span>
        </div>
        <p className="mt-1.5 text-[12px] font-semibold leading-snug text-rose-900">{t.haltedReason}</p>
        {t.lastReached && (
          <p className="mt-1 text-[10px] leading-relaxed text-rose-700/90">
            중단 전 마지막 단계 · {t.lastReached}
            {t.lastReachedDate && <span className="ml-1 tabular-nums">{t.lastReachedDate}</span>}
          </p>
        )}
        <p className="mt-1 break-words text-[10px] leading-relaxed text-rose-600/80">서울시 표기: {t.rawStage}</p>
      </div>
    );
  }

  const pct = Math.round((t.currentIndex / Math.max(1, t.total - 1)) * 100);
  const showRaw = t.rawStage && t.rawStage !== t.currentLabel;

  return (
    <div data-testid="stage-timeline" className="rounded-xl border border-[#D6E6F3] bg-brand-tint/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[11px] font-bold text-brand-deep">사업 진행단계</span>
        <span className="whitespace-nowrap text-[10px] text-slate-500">
          {t.status === "completed" ? (
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">준공</span>
          ) : (
            <>
              <b className="text-brand-deep">{t.currentIndex + 1}</b> / {t.total}단계
            </>
          )}
        </span>
      </div>

      {/* 진행률 — 사다리에서 지금 어디쯤인지 한 줄로 */}
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white ring-1 ring-[#D6E6F3]">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>

      {/* 지금 단계 — 서울시 표기 원문을 함께 둔다 */}
      <div className="mt-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-[#D6E6F3]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-brand/70">현재</span>
          <span className="text-[12px] font-bold leading-snug text-brand-deep">{t.currentLabel}</span>
          {t.steps[t.currentIndex].inProgress && (
            <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[9px] font-bold text-brand">진행 중</span>
          )}
        </div>
        {showRaw && (
          <p className="mt-0.5 break-words text-[10px] leading-snug text-slate-500">{t.rawStage}</p>
        )}
        <p className="mt-0.5 text-[9px] text-slate-400">
          {t.familyLabel}
          {t.asOf && ` · 단계 기준 ${t.asOf}`}
        </p>
      </div>

      {/* 권리산정기준일 — 조합원·분양받을 권리를 가르는 날짜라 현재 단계 바로 아래에 둔다 */}
      {t.rightsDate && (
        <div
          data-testid="stage-rights-date"
          className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200"
        >
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[10px] font-bold text-amber-900">권리산정기준일</span>
            <span className="text-[12px] font-bold tabular-nums text-amber-900">{t.rightsDate}</span>
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-amber-800/80">
            이 날 이후에 취득한 주택은 분양받을 권리 산정에서 빠질 수 있습니다
          </p>
        </div>
      )}

      <ol className="mt-2">
        {t.steps.map((s, i) => {
          const done = s.state === "done";
          const current = s.state === "current";
          return (
            <li key={s.label} className="relative flex min-h-[19px] items-start gap-2 pl-[18px]">
              {/* 세로 연결선 — 지나온 구간은 브랜드색 */}
              {i < t.steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[5px] top-[11px] h-[calc(100%-4px)] w-[1.5px] rounded"
                  style={{ background: i < t.currentIndex ? "#0054a6" : "#DFE7EF" }}
                />
              )}
              {/* 점 — 지난 단계는 체크, 지금 단계는 강조 링, 남은 단계는 빈 원 */}
              <span
                aria-hidden
                className={
                  "absolute left-0 top-[3px] flex h-[11px] w-[11px] items-center justify-center rounded-full " +
                  (done
                    ? "bg-brand"
                    : current
                      ? "bg-brand shadow-[0_0_0_3px_rgba(0,84,166,0.16)]"
                      : "border border-[#CBD5E1] bg-white")
                }
              >
                {done && <Check />}
                {current && <span className="h-[3px] w-[3px] rounded-full bg-white/90" />}
              </span>

              <span
                className={
                  "flex-1 break-keep text-[11px] leading-[17px] " +
                  (current
                    ? "font-bold text-brand-deep"
                    : done
                      ? "text-slate-600"
                      : "text-slate-400")
                }
              >
                {s.label}
                {current && s.note && (
                  <span className="ml-1 text-[9px] font-medium text-slate-500">· {s.note}</span>
                )}
                {current && !s.inProgress && (
                  <span className="ml-1 text-[9px] font-semibold text-emerald-600">완료</span>
                )}
              </span>
              {s.date && (
                <span className="shrink-0 pt-[2px] text-[9px] tabular-nums leading-[15px] text-slate-400">{s.date}</span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
        {t.hasStatsDates
          ? "날짜: 사업장 추진경과에 적힌 값 그대로(서울시 도시정비사업 통계 2026.6월말 · 정비사업 정보몽땅·보도자료)"
          : "날짜는 서울시 고시·공고에 적힌 것만 표시합니다"}
      </p>
    </div>
  );
}
