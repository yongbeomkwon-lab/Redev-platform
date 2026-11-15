import type { ReactNode } from "react";
import type { ZoneType } from "@/lib/types";
import { TYPE_COLORS } from "@/components/map/colors";

/** 사업유형 뱃지 (지도 색상과 동일한 팔레트) */
export function TypeBadge({ type }: { type: ZoneType }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: TYPE_COLORS[type] }}
    >
      {type}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    purple: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span className={"inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium " + tones[tone]}>
      {children}
    </span>
  );
}

/** 단계 진행 표시 (재개발닷컴 스타일 단계 뱃지) */
export function StageBadge({ stage, stageOrder }: { stage: string; stageOrder: number }) {
  const tone = stageOrder >= 5 ? "green" : stageOrder >= 3 ? "blue" : "amber";
  return <Badge tone={tone as "green" | "blue" | "amber"}>{stage}</Badge>;
}
