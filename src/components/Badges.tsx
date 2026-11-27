import type { ReactNode } from "react";
import type { ZoneType } from "@/lib/types";
import { TYPE_COLORS, TYPE_INK, TYPE_TINT, shortZoneType } from "@/components/map/colors";

/**
 * 사업유형 뱃지 — 지도 폴리곤과 같은 11색 팔레트.
 *   · 흰 패널 위에서는 원색을 그대로 칠하면 글자가 묻힌다 — 바탕은 10% 틴트,
 *     글자는 눌러 쓴 잉크색, 점 하나만 원색으로 두어 지도 색과 바로 이어진다.
 */
export function TypeBadge({ type }: { type: ZoneType }) {
  const color = TYPE_COLORS[type] ?? "#64748B";
  const ink = TYPE_INK[type] ?? "#334155";
  const tint = TYPE_TINT[type] ?? "#F1F5F9";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-[3px] text-[11px] font-bold leading-none"
      style={{ backgroundColor: tint, color: ink, boxShadow: `inset 0 0 0 1px ${color}26` }}
    >
      <i aria-hidden className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: color }} />
      {shortZoneType(type)}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "gold" | "red" | "blue" | "purple" | "brand";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-600 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    // 규제·주의 — 시안의 Hazelnut Gold 계열
    amber: "bg-[#FAF6EC] text-[#745E34] border-[#E8DCC2]",
    gold: "bg-[#FAF6EC] text-[#745E34] border-[#E8DCC2]",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-brand-tint text-brand border-[#D6E6F3]",
    brand: "bg-brand-tint text-brand border-[#D6E6F3]",
    purple: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-[5px] border px-1.5 py-[2px] text-[11px] font-semibold leading-[15px] " +
        tones[tone]
      }
    >
      {children}
    </span>
  );
}

/** 단계 진행 표시 (단계 뱃지) */
export function StageBadge({ stage, stageOrder }: { stage: string; stageOrder: number }) {
  const tone = stageOrder >= 5 ? "green" : stageOrder >= 3 ? "blue" : "amber";
  return <Badge tone={tone as "green" | "blue" | "amber"}>{stage}</Badge>;
}
