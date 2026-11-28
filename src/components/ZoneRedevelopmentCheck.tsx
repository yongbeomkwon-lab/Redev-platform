"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneRedevelopmentCheck — 「🛡️ 5년 재당첨 제한 · 입주권 자가진단」
//
//  구역 유형(type)·진행단계(stage)·자치구를 자동으로 읽어 **어느 법이 적용되는지**를 가른 뒤,
//  상담 현장에서 바로 쓰는 세 가지를 판정한다.
//    ① 5년 재당첨 제한 — 투기과열지구 정비사업 분양대상자(및 그 세대)는 선정일부터 5년간
//       다른 투기과열지구 정비사업에서 분양신청을 할 수 없다 (도시정비법 제72조제6항).
//       → 이 구역의 분양신청 마감일이 5년 안에 걸리면 **현금청산 위험**.
//    ② 조합원 지위 양도 제한 — 재개발은 관리처분계획인가 후, 재건축·소규모정비는 조합설립인가 후
//       매수하면 원칙적으로 승계 불가(도시정비법 제39조제2항 / 소규모주택정비법 제24조제2항).
//    ③ 소규모정비법(모아타운·가로주택·소규모재건축·자율주택)은 **도정법 제72조제6항 적용 대상이 아니다**
//       — 5년 재당첨 제한은 걸리지 않지만, 조합원 지위 양도 제한(5년 소유·3년 거주 예외)은 따로 본다.
//
//  · 법 조문·시행일: 도시정비법 제72조제6항(2017.10.24 신설, 2018.2.9 시행), 제39조제2항,
//    소규모주택정비법 제24조제2항(2022.8.4 시행). 서울 25개 구 전역은 2025-10-15 대책으로
//    투기과열지구(효력 2025-10-16)다.
//  · 결과는 **참고 판정**이다 — 개별 사실관계(취득 시점·세대 구성·부칙 경과규정)에 따라 달라진다.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Badge } from "@/components/Badges";

type Family = "redev" | "rebuild" | "small" | "other";

const SMALL_TYPES = ["모아타운", "모아타운통합기획", "가로주택", "소규모"];
const REDEV_TYPES = ["일반재개발", "신통기획", "공공재개발", "역세권"];
const REBUILD_TYPES = ["재건축"];

function familyOf(type: string, kind?: string): Family {
  const k = `${type} ${kind ?? ""}`;
  if (/모아타운|가로주택|소규모|자율주택/.test(k) && !/소규모재건축/.test(k)) {
    if (SMALL_TYPES.some((t) => type === t) || /모아타운|가로주택|소규모정비|자율주택/.test(k)) return "small";
  }
  if (/소규모재건축/.test(k)) return "small";
  if (REBUILD_TYPES.includes(type) || /재건축/.test(kind ?? "")) return "rebuild";
  if (REDEV_TYPES.includes(type) || /재개발/.test(kind ?? "")) return "redev";
  return "other";
}

const FAMILY_TEXT: Record<Family, { label: string; law: string; applies5yr: boolean }> = {
  redev: { label: "도시정비법 · 재개발", law: "도시정비법", applies5yr: true },
  rebuild: { label: "도시정비법 · 재건축", law: "도시정비법", applies5yr: true },
  small: { label: "소규모주택정비법", law: "소규모주택정비법", applies5yr: false },
  other: { label: "도시정비법 정비사업 아님", law: "-", applies5yr: false },
};

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}
function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number | null {
  const x = Date.parse(`${a}T00:00:00`);
  const y = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86400000);
}

export default function ZoneRedevelopmentCheck({
  zoneName,
  type,
  stage,
  gu,
  kind,
  stageDates,
  initialPrior = "",
  initialDeadline = "",
}: {
  zoneName: string;
  /** 서울시 사업유형 (모아타운·신통기획·일반재개발·재건축 …) */
  type: string;
  /** 진행 단계 문구 */
  stage: string;
  /** 자치구 */
  gu: string;
  /** 서울시 소분류 (예: 신속통합기획(재개발)) — 유형보다 정확할 때가 있다 */
  kind?: string;
  /** 단계별 공식 날짜 — 조합설립인가(union)·관리처분인가(disposition) 를 자동으로 채운다 */
  stageDates?: Partial<Record<string, string>>;
  /** 선행 분양 이력 날짜를 미리 채운다(상담 재개·검수용) */
  initialPrior?: string;
  /** 이 구역 분양신청 마감일을 미리 채운다 */
  initialDeadline?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialPrior || initialDeadline));
  const [prior, setPrior] = useState(initialPrior);
  const [noPrior, setNoPrior] = useState(false);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [deadlineUnknown, setDeadlineUnknown] = useState(false);
  const [purchase, setPurchase] = useState<"" | "before" | "after">("");
  const [copied, setCopied] = useState(false);

  const family = familyOf(type, kind);
  const fam = FAMILY_TEXT[family];

  const unionDate = stageDates?.union ?? "";
  const dispositionDate = stageDates?.disposition ?? "";
  /** 지위 양도가 막히는 시점 — 재개발은 관리처분인가, 재건축·소규모는 조합설립인가 */
  const blockDate = family === "redev" ? dispositionDate : unionDate;
  const blockName = family === "redev" ? "관리처분계획인가" : "조합설립인가";

  const result = useMemo(() => {
    const expire = prior ? addYears(prior, 5) : "";
    const lines: string[] = [];
    let tone: "danger" | "ok" | "warn" | "unknown" = "unknown";
    let headline = "입력하면 바로 판정합니다";
    let detail = "① 선행 분양 이력(없으면 ‘해당 없음’)만 넣어도 5년 제한 만료일이 계산됩니다.";

    if (!fam.applies5yr) return { tone: "ok" as const, headline: "", detail: "", lines: [], expire: "" };

    if (!prior && !noPrior) {
      return { tone, headline, detail, lines, expire };
    }

    if (noPrior) {
      tone = "ok";
      headline = "✅ 5년 재당첨 제한 통과";
      detail = "최근 5년 안에 투기과열지구 정비사업 분양대상자로 선정된 이력이 없다면, 이 구역 분양신청은 막히지 않습니다.";
      lines.push("· 선행 이력 없음 → 제한 기간 없음");
    } else if (prior) {
      lines.push(`· 선행 분양 ${fmtDate(prior)} → 제한 만료 ${fmtDate(expire)}`);
      if (deadline && !deadlineUnknown) {
        const d = daysBetween(deadline, expire);
        if (d !== null && d > 0) {
          tone = "danger";
          headline = "⚠️ 현금청산 위험 — 5년 안에 분양신청";
          detail = `분양신청 마감(${fmtDate(deadline)})이 제한 만료(${fmtDate(expire)})보다 ${d.toLocaleString()}일 앞입니다. 이 구역에서 분양신청을 하면 분양대상자에서 빠지고 현금청산 대상이 될 수 있습니다.`;
        } else if (d !== null) {
          tone = "ok";
          headline = "✅ 5년 재당첨 제한 통과";
          detail = `분양신청 마감(${fmtDate(deadline)})이 제한 만료(${fmtDate(expire)}) 이후입니다 — 5년이 지나 분양신청할 수 있습니다.`;
        }
      } else {
        tone = "warn";
        headline = "🕒 분양신청 마감일을 넣으면 판정됩니다";
        detail = `제한 만료는 ${fmtDate(expire)}입니다. 이 구역 분양신청 마감일이 그 전이면 현금청산 위험, 후면 통과입니다.`;
      }
    }

    lines.push("· 예외: 상속·결혼·이혼으로 조합원 자격을 취득한 경우(분양대상자 선정일 이후)만 분양신청 가능");
    lines.push("· 조합원 분양의 기산일은 ‘최초 관리처분계획인가일’, 일반분양은 당첨 확정일");

    if (blockDate) {
      lines.push(
        `· 조합원 지위 양도: ${blockName}(${fmtDate(blockDate)}) 후 매수 시 원칙적으로 승계 불가` +
          (family === "small" ? " (1세대 1주택 5년 소유·3년 거주 예외)" : " (1세대 1주택 10년 보유·5년 거주 예외)")
      );
    }
    return { tone, headline, detail, lines, expire };
  }, [prior, noPrior, deadline, deadlineUnknown, family, fam.applies5yr, blockDate, blockName]);

  const transferVerdict = (() => {
    if (!purchase) return null;
    if (family === "other") return { tone: "ok" as const, text: "도시정비법상 정비사업이 아니어서 이 제한은 적용되지 않습니다." };
    if (!blockDate) {
      return purchase === "before"
        ? { tone: "ok" as const, text: `${blockName} 전 매수 — 조합원 지위를 승계받을 수 있습니다(권리산정기준일·분양대상 요건은 별도).` }
        : { tone: "warn" as const, text: `${blockName} 전인지 확정되지 않았습니다 — 인가일을 확인해야 승계 여부가 갈립니다.` };
    }
    if (purchase === "before") {
      return { tone: "ok" as const, text: `${blockName}(${fmtDate(blockDate)}) 전 매수 — 지위 승계 가능성이 있습니다.` };
    }
    return {
      tone: "danger" as const,
      text: `${blockName}(${fmtDate(blockDate)}) 후 매수 — 원칙적으로 조합원 지위 승계 불가(현금청산). ${
        family === "small" ? "매도인이 1세대 1주택 5년 소유·3년 거주면 예외." : "매도인이 1세대 1주택 10년 보유·5년 거주면 예외."
      }`,
    };
  })();

  const summary = useMemo(() => {
    const rows: string[] = [];
    rows.push(`[리디브] ${zoneName} · 5년 재당첨 제한 자가진단`);
    rows.push(`· 사업유형: ${type}${kind ? ` (${kind})` : ""} — ${fam.label}`);
    if (gu) rows.push(`· 자치구: ${gu} — 투기과열지구(서울 25개 구, 2025.10.16~)`);
    if (!fam.applies5yr) {
      rows.push("· 판정: 소규모정비법 사업 — 도시정비법 제72조제6항(5년 재당첨) 적용 대상 아님");
      rows.push("· 다만 투기과열지구 조합설립인가 후 조합원 지위 양도 제한은 적용(1세대 1주택 5년 소유·3년 거주 예외)");
    } else {
      rows.push(`· 선행 분양 이력: ${noPrior ? "해당 없음" : prior ? fmtDate(prior) : "미입력"}`);
      if (result.expire) rows.push(`· 5년 제한 만료: ${fmtDate(result.expire)}`);
      rows.push(`· 이 구역 분양신청 마감(예상): ${deadline && !deadlineUnknown ? fmtDate(deadline) : "미확인"}`);
      rows.push(`· 판정: ${result.headline.replace(/^[✅⚠️🕒]\s*/, "")}`);
    }
    if (blockDate) rows.push(`· ${blockName}: ${fmtDate(blockDate)}`);
    if (transferVerdict) rows.push(`· 지위 양도: ${transferVerdict.text}`);
    rows.push("· 근거: 도시정비법 제72조제6항·제39조제2항, 소규모주택정비법 제24조제2항");
    rows.push("· 개별 사실관계(취득 시점·세대 구성·부칙)에 따라 달라질 수 있습니다 — 리디브");
    return rows.join("\n");
  }, [zoneName, type, kind, gu, fam.label, fam.applies5yr, noPrior, prior, deadline, deadlineUnknown, result, blockDate, blockName, transferVerdict]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2600);
    } catch {
      /* 권한 없음 — 조용히 둔다 */
    }
  };

  const toneCls =
    result.tone === "danger"
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : result.tone === "ok"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
        : result.tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <section data-testid="zone-redev-check" className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
        data-testid="zone-redev-check-toggle"
      >
        <span className="text-[13px] font-bold text-indigo-950">🛡️ 5년 재당첨 제한 · 입주권 자가진단</span>
        <span className="ml-auto rounded-full border border-indigo-300 bg-white px-1.5 py-[1px] text-[10px] font-semibold text-indigo-800">
          {open ? "접기" : "열기"}
        </span>
      </button>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge tone={fam.applies5yr ? "blue" : "slate"}>{fam.label}</Badge>
        {gu && <span className="text-[10px] text-indigo-900/70">{gu} · 투기과열지구</span>}
        <span className="text-[10px] text-indigo-900/60">
          {type}
          {stage ? ` · ${stage}` : ""}
        </span>
      </div>

      {!open && (
        <p className="mt-1 break-keep text-[10.5px] leading-snug text-indigo-900/70">
          {fam.applies5yr
            ? "선행 분양 이력만 넣으면 이 구역 분양신청 가능 여부(5년 재당첨)를 바로 판정합니다."
            : "소규모정비법 사업 — 5년 재당첨 제한은 적용되지 않고, 조합원 지위 양도 제한만 봅니다."}
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          {!fam.applies5yr ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-2 text-[11px] leading-relaxed text-slate-700">
              <p className="font-bold text-emerald-800">✅ 도시정비법 제72조제6항(5년 재당첨 제한) 적용 대상 아님</p>
              <p className="mt-1">
                {family === "small"
                  ? "모아타운·가로주택·소규모재건축·자율주택은 「빈집 및 소규모주택 정비에 관한 특례법」 사업이라 5년 재당첨 제한이 걸리지 않습니다."
                  : "이 구역은 도시정비법상 재개발·재건축 정비사업이 아니어서 5년 재당첨 제한 대상이 아닙니다."}
              </p>
              {family === "small" && (
                <p className="mt-1 text-rose-700">
                  ⚠️ 대신 투기과열지구에서는 <b>조합설립인가 후</b> 조합원 지위 양도가 제한됩니다(소규모주택정비법 제24조제2항).
                  매도인이 1세대 1주택으로 <b>5년 이상 소유·3년 이상 거주</b>해야 승계됩니다. 자율주택정비사업은 이 제한 대상이 아닙니다.
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="block text-[10px] font-semibold text-indigo-900/80">
                ① 본인·세대원의 최근 5년 투기과열지구 분양 이력
                <span className="ml-1 font-normal text-indigo-900/50">(조합원분양: 최초 관리처분인가일 / 일반분양: 당첨일)</span>
              </label>
              <div className="flex flex-wrap items-center gap-1">
                <input
                  type="date"
                  value={prior}
                  disabled={noPrior}
                  onChange={(e) => {
                    setPrior(e.target.value);
                    if (e.target.value) setNoPrior(false);
                  }}
                  data-testid="zone-redev-prior"
                  className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    setNoPrior((v) => !v);
                    setPrior("");
                  }}
                  data-testid="zone-redev-no-prior"
                  className={
                    "rounded-full border px-2 py-0.5 text-[10.5px] font-semibold " +
                    (noPrior ? "border-emerald-600 bg-emerald-600 text-white" : "border-indigo-200 bg-white text-indigo-800")
                  }
                >
                  해당 없음
                </button>
              </div>

              <label className="block text-[10px] font-semibold text-indigo-900/80">
                ② 이 구역 분양신청 마감일 (예상·실제)
              </label>
              <div className="flex flex-wrap items-center gap-1">
                <input
                  type="date"
                  value={deadline}
                  disabled={deadlineUnknown}
                  onChange={(e) => {
                    setDeadline(e.target.value);
                    if (e.target.value) setDeadlineUnknown(false);
                  }}
                  data-testid="zone-redev-deadline"
                  className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDeadlineUnknown((v) => !v);
                    setDeadline("");
                  }}
                  className={
                    "rounded-full border px-2 py-0.5 text-[10.5px] font-semibold " +
                    (deadlineUnknown ? "border-slate-600 bg-slate-600 text-white" : "border-indigo-200 bg-white text-indigo-800")
                  }
                >
                  모름
                </button>
              </div>
            </>
          )}

          {/* 조합원 지위 양도 — 매수 시점 */}
          <div>
            <span className="block text-[10px] font-semibold text-indigo-900/80">
              ③ 매수 시점 <span className="font-normal text-indigo-900/50">({blockDate ? `${blockName} ${fmtDate(blockDate)}` : `${blockName} 전/후`})</span>
            </span>
            <div className="mt-0.5 flex gap-1">
              {(
                [
                  ["before", "인가 전"],
                  ["after", "인가 후"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPurchase((p) => (p === v ? "" : v))}
                  className={
                    "flex-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold " +
                    (purchase === v
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-indigo-200 bg-white text-indigo-800")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 결과 */}
          {fam.applies5yr && (prior || noPrior) && (
            <div data-testid="zone-redev-result" className={"rounded-lg border p-2 " + toneCls}>
              <p className="text-[12px] font-bold leading-snug">{result.headline}</p>
              <p className="mt-0.5 break-keep text-[10.5px] leading-relaxed">{result.detail}</p>
              <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed">
                {result.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          {transferVerdict && (
            <div
              className={
                "rounded-lg border p-2 text-[10.5px] leading-relaxed " +
                (transferVerdict.tone === "danger"
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : transferVerdict.tone === "ok"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-900")
              }
            >
              {transferVerdict.text}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copy()}
              data-testid="zone-redev-copy"
              className={
                "rounded-full border px-2.5 py-1 text-[10.5px] font-bold " +
                (copied
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-indigo-700 bg-white text-indigo-900 hover:bg-indigo-50")
              }
            >
              {copied ? "복사됨 — 카톡에 붙여넣기" : "📋 요약 복사 (상담용)"}
            </button>
            <span className="text-[9.5px] leading-tight text-indigo-900/50">
              도시정비법 제72조제6항 기준 · 참고 판정
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
