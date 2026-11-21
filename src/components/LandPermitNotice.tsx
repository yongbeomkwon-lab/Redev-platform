"use client";
// ─────────────────────────────────────────────────────────────────────────────
// LandPermitNotice — 구역 상세 패널 **맨 위**의 「토허제 참고 안내」
//
//  · 토지거래허가구역(토허제)은 개별 필지 단위 지정이라 이 앱이 확정 판정을 할 수 없다.
//    그래서 '지정 대상 자치구·사업유형' 기준으로 미리 알아 둘 구역만 조용히 알린다.
//  · 배지를 누르면 근거·기간·허가 기준이 펼쳐지고, 링크에서 원문을 확인할 수 있다.
//  · 근거가 없는 구역(대상 아님)에는 아무것도 그리지 않는다 — 근거 없는 경고를 만들지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { LAND_PERMIT_DISCLAIMER, landPermitNotice } from "@/lib/land-permit";

export default function LandPermitNotice({
  gu,
  names,
  type,
  kind,
  flagged,
  defaultOpen = false,
}: {
  gu?: string;
  names?: string[];
  type?: string;
  kind?: string;
  /** 구역 데이터의 토허제 적용 표시 */
  flagged?: boolean;
  /** 처음부터 근거를 펼쳐 둘지 */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const namesKey = (names ?? []).join("|");
  const info = useMemo(
    () => landPermitNotice({ gu, names: namesKey ? namesKey.split("|") : [], type, kind, flagged }),
    [gu, namesKey, type, kind, flagged]
  );

  if (!info) return null;
  const designated = info.level === "designated";

  return (
    <section
      data-testid="land-permit-notice"
      data-level={info.level}
      className={
        "rounded-xl border p-2.5 " +
        (designated ? "border-[#E6D9BC] bg-[#FBF7EF]" : "border-line bg-slate-50")
      }
    >
      <div className="flex items-start gap-1.5">
        <span
          className={
            "mt-px shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white " +
            (designated ? "bg-[#745E34]" : "bg-slate-600")
          }
        >
          토허제 참고 안내
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={
              "text-[11px] font-bold leading-snug " + (designated ? "text-[#4A3A1D]" : "text-slate-800")
            }
          >
            {info.badge}
          </p>
          <p className={"mt-0.5 text-[10px] leading-snug " + (designated ? "text-[#5C4A28]" : "text-slate-600")}>
            {info.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="land-permit-more"
          className={
            "shrink-0 whitespace-nowrap rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold " +
            (designated
              ? "border-[#D8C79F] text-[#745E34] hover:border-[#B08D48]"
              : "border-slate-300 text-slate-700 hover:border-slate-500")
          }
        >
          {open ? "접기" : "근거 보기"}
        </button>
      </div>

      {open && (
        <div className="mt-1.5 space-y-1">
          <ul className="space-y-0.5 text-[10px] leading-relaxed text-slate-600">
            {info.details.map((d) => (
              <li key={d}>· {d}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
            {info.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline decoration-blue-200 hover:decoration-blue-500"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <p
        className={
          "mt-1.5 border-t pt-1 text-[9.5px] leading-snug " +
          (designated ? "border-[#E6D9BC] text-[#745E34]" : "border-slate-200 text-slate-500")
        }
      >
        {LAND_PERMIT_DISCLAIMER}
      </p>
    </section>
  );
}
