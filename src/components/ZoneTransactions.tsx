"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneTransactions — 구역 상세의 「최근 실거래가 (국토부)」 섹션
//
//  · 구역의 자치구 + 이름·별칭에서 **법정동을 찾아** `/api/transactions` 를 부른다.
//      이름에 법정동이 적혀 있으면(예: "상도동 182-13") 그 동
//      → 없으면 같은 구 법정동 접두어("상도23구역" → 상도동)
//      → 그래도 없으면 카카오 역지오코딩(구역 중심 좌표)
//  · 국토부 API 는 좌표를 주지 않는다. 그래서 '구역 경계 안'을 계산하지 않고,
//    구역 대표 지번과 같은 필지 거래만 '구역 내'로 표시하고 나머지는 '동일 법정동'으로 둔다.
//  · 유형별 연동 상태를 그대로 보여준다 — 연립·다세대가 아직 미신청(코드 30)이어도
//    아파트·단독다가구는 정상 표시되고, 미연동 배지가 붙는다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import {
  MOLIT_KINDS,
  eokShort,
  guessLegalDongsByStem,
  legalDongInText,
  toPyeong,
  zoneJibunInText,
  type MolitResponse,
  type MolitTransaction,
  type MolitTransactionKind,
} from "@/lib/molit";
import { legalDongAt } from "@/lib/kakao-address";

const KIND_COLORS: Record<MolitTransactionKind, string> = {
  아파트: "#2563eb",
  "단독·다가구": "#b45309",
  "연립·다세대": "#7c3aed",
};

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}

export default function ZoneTransactions({
  gu,
  names,
  center,
}: {
  gu: string;
  /** 구역 이름·별칭 — 법정동·지번을 찾는 근거 */
  names: string[];
  /** 구역 중심 좌표(있으면 역지오코딩 대비책으로 쓴다) */
  center?: [number, number];
}) {
  const [dongs, setDongs] = useState<string[] | null>(null);
  const [dongNote, setDongNote] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [kind, setKind] = useState<MolitTransactionKind | "전체">("전체");
  const [data, setData] = useState<MolitResponse | null>(null);
  const [state, setState] = useState<"resolving" | "loading" | "ready" | "error">("resolving");
  const [visible, setVisible] = useState(20);
  const [reloadKey, setReloadKey] = useState(0);

  const namesKey = names.join("|");
  const jibun = useMemo(() => zoneJibunInText(names), [namesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lat = center?.[0];
  const lng = center?.[1];

  // ── 1) 법정동 찾기 ────────────────────────────────────────────────────────
  //   이름에 동이 그대로 있으면 즉시, 접두어 후보가 1개면 즉시,
  //   후보가 2~4개(성수동1가·성수동2가)면 카카오 역지오코딩으로 좁혀 본다.
  useEffect(() => {
    let alive = true;
    setDongs(null);
    setDongNote(null);
    setState("resolving");

    const list = namesKey ? namesKey.split("|") : [];
    const exact = legalDongInText(gu, list);
    if (exact) {
      setDongs([exact]);
      return;
    }
    const stems = guessLegalDongsByStem(gu, list);
    if (stems.length === 1) {
      setDongs(stems);
      return;
    }

    (async () => {
      let found: string[] | null = null;
      if (lat !== undefined && lng !== undefined) {
        // SDK 가 응답하지 않는 경우에 패널이 멈추지 않도록 2.5초 상한을 둔다
        const guess = await Promise.race([
          legalDongAt(lat, lng, gu),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (!alive) return;
        if (guess) found = [guess];
      }
      if (!found && stems.length) found = stems;
      if (found) setDongs(found);
      else {
        setDongNote("구역 이름·위치에서 법정동을 확인하지 못했습니다.");
        setState("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [gu, namesKey, lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2) 실거래 조회 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dongs?.length) return;
    let alive = true;
    setState("loading");
    const qs = new URLSearchParams({
      gu,
      dong: dongs.join(","),
      months: String(months),
    });
    if (jibun && dongs.includes(jibun.dong)) qs.set("jibun", String(jibun.bonbun));
    fetch(`/api/transactions?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<MolitResponse>)
      .then((json) => {
        if (!alive) return;
        setData(json);
        setState(json.ok ? "ready" : "error");
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [gu, dongs, months, jibun, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.transactions ?? [];
  const filtered = useMemo(
    () => (kind === "전체" ? rows : rows.filter((r) => r.kind === kind)),
    [rows, kind]
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (!r.canceled) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [rows]);

  // 지금 고른 유형·기간의 평균 평당가 — 전용(아파트·연립)과 대지(단독·다가구)를 섞지 않는다
  const avg = useMemo(() => {
    const live = filtered.filter((r) => !r.canceled && r.pyeongPrice);
    const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      jeon: mean(live.filter((r) => r.pyeongBasis === "전용").map((r) => r.pyeongPrice as number)),
      land: mean(live.filter((r) => r.pyeongBasis === "대지").map((r) => r.pyeongPrice as number)),
    };
  }, [filtered]);

  const missKinds = (data?.coverage ?? []).filter((c) => !c.ok);
  const dongLabel = dongs?.join("·") ?? "";
  const period = data?.query ? `${data.query.from.slice(0, 4)}.${data.query.from.slice(4)}~${data.query.to.slice(0, 4)}.${data.query.to.slice(4)}` : "";

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-[11px] font-bold text-blue-900">
          최근 실거래가 <span className="font-normal text-blue-700/80">(국토부)</span>
        </span>
        <span className="text-[10px] text-blue-700/70">
          {dongLabel ? `${dongLabel} · ${months}개월` : "법정동 확인 중"}
          {period ? ` · ${period}` : ""}
        </span>
      </div>

      {/* 유형 필터 + 기간 */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setKind("전체")}
          className={
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition " +
            (kind === "전체"
              ? "border-blue-900 bg-blue-900 text-white"
              : "border-blue-200 bg-white text-blue-800 hover:border-blue-400")
          }
        >
          전체 <span className="font-normal">{data?.summary?.count ?? ""}</span>
        </button>
        {MOLIT_KINDS.map((k) => {
          const off = missKinds.some((c) => c.kind === k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              title={off ? `${k}는 국토부 활용신청 승인 후 표시됩니다` : undefined}
              className={
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition " +
                (kind === k
                  ? "border-blue-900 bg-blue-900 text-white"
                  : off
                    ? "border-dashed border-slate-300 bg-white text-slate-400"
                    : "border-blue-200 bg-white text-blue-800 hover:border-blue-400")
              }
            >
              {k}
              {off ? <span className="ml-1 text-[9px]">미연동</span> : <span className="ml-1 font-normal">{counts[k] ?? 0}</span>}
            </button>
          );
        })}
        <span className="ml-auto inline-flex overflow-hidden rounded-full border border-blue-200 bg-white text-[10px]">
          {[3, 6].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              className={months === m ? "bg-blue-900 px-2 py-0.5 font-semibold text-white" : "px-2 py-0.5 text-blue-800"}
            >
              {m}개월
            </button>
          ))}
        </span>
      </div>

      {/* 상태 */}
      {state === "resolving" && <p className="py-4 text-center text-[11px] text-slate-500">법정동을 확인하는 중…</p>}
      {state === "loading" && <p className="py-4 text-center text-[11px] text-slate-500">국토부 실거래를 불러오는 중…</p>}

      {state === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
          {data?.reason === "key_missing" ? (
            <>
              서버에 국토부 API 키(<code className="rounded bg-white/70 px-1">MOLIT_API_KEY</code>)가 아직 없습니다.
              Vercel 환경변수에 넣으면 이 구역부터 바로 실거래가 표시됩니다.
            </>
          ) : (
            <>
              {data?.message ?? dongNote ?? "실거래를 불러오지 못했습니다."}
              <button
                type="button"
                onClick={() => setReloadKey((v) => v + 1)}
                className="ml-1.5 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      )}

      {state === "ready" && (
        <>
          {/* 요약 */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-blue-900/80">
            <span>
              <b className="text-blue-900">{data?.summary?.count ?? 0}건</b>
              {data?.summary?.canceled ? ` (해제 ${data.summary.canceled}건 별도)` : ""}
            </span>
            {avg.jeon ? <span>평균 평당 <b className="text-blue-900">{avg.jeon.toLocaleString()}만</b></span> : null}
            {avg.land ? <span>대지 평당 <b className="text-blue-900">{avg.land.toLocaleString()}만</b></span> : null}
            {data?.summary?.inZone ? <span className="font-semibold text-blue-900">구역 내 {data.summary.inZone}건</span> : null}
          </div>

          {/* 거래 목록 */}
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-blue-200 bg-white py-5 text-center text-[11px] text-slate-500">
              {kind === "전체" ? `최근 ${months}개월 ${dongLabel} 국토부 신고 거래가 없습니다.` : `${kind} 거래가 없습니다.`}
            </p>
          ) : (
            <ul className="divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100 bg-white">
              {filtered.slice(0, visible).map((t) => (
                <TxRow key={t.id} t={t} />
              ))}
            </ul>
          )}

          {filtered.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 30)}
              className="mt-1.5 w-full rounded-lg border border-blue-200 bg-white py-1 text-[11px] font-semibold text-blue-800 hover:border-blue-400"
            >
              {filtered.length - visible}건 더 보기
            </button>
          )}

          {/* 안내 */}
          <ul className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-slate-500">
            {(data?.notices ?? []).map((n) => (
              <li key={n}>· {n}</li>
            ))}
            <li>
              · 출처:{" "}
              <a
                href="https://rt.molit.go.kr"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-300 hover:text-slate-700"
              >
                국토교통부 실거래가 공개시스템
              </a>
              {data?.cached ? " · 1시간 캐시" : ""}
            </li>
          </ul>
        </>
      )}

      {state === "ready" && missKinds.length > 0 && (
        <p className="mt-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-900">
          {missKinds.map((c) => c.kind).join("·")} 미연동
          {missKinds[0]?.code ? ` (국토부 코드 ${missKinds[0].code})` : ""} — 활용신청 승인 후 자동 표시
        </p>
      )}
    </section>
  );
}

function TxRow({ t }: { t: MolitTransaction }) {
  const area = t.areaSqm ? `${t.areaSqm.toFixed(t.areaSqm >= 100 ? 0 : 1)}㎡` : null;
  const pyeong = t.areaSqm ? toPyeong(t.areaSqm) : null;
  const land = t.plottageSqm ? `${t.plottageSqm.toFixed(0)}㎡` : null;
  return (
    <li className={"flex items-start gap-2 px-2.5 py-1.5 " + (t.canceled ? "bg-rose-50/50" : "")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <i
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: KIND_COLORS[t.kind] }}
            aria-hidden
          />
          <span className="truncate text-[12px] font-semibold text-slate-900">{t.name}</span>
          {t.scope === "zone" && (
            <span className="shrink-0 rounded bg-emerald-600 px-1 py-px text-[9px] font-bold text-white">구역 내</span>
          )}
          {t.canceled && (
            <span className="shrink-0 rounded bg-rose-600 px-1 py-px text-[9px] font-bold text-white">해제</span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
          {shortDate(t.dealDate)}
          {t.kind === "단독·다가구" ? (
            <>
              {land ? ` · 대지 ${land}` : ""}
              {area ? ` · 연면적 ${area}` : ""}
            </>
          ) : (
            <>
              {area ? ` · 전용 ${area}` : ""}
              {pyeong ? ` (${pyeong}평)` : ""}
            </>
          )}
          {t.floor ? ` · ${t.floor}층` : ""}
          {t.buildYear ? ` · ${t.buildYear}년` : ""}
        </div>
        <div className="text-[10px] text-slate-400">
          {t.umdNm} {t.jibun}
          {t.dealingType ? ` · ${t.dealingType}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={"text-[13px] font-bold " + (t.canceled ? "text-rose-500 line-through" : "text-slate-900")}>
          {eokShort(t.price)}
        </div>
        <div className="text-[10px] text-slate-500">
          {t.pyeongPrice ? `평당 ${t.pyeongPrice.toLocaleString()}만` : "-"}
        </div>
        <div className="text-[9px] text-slate-400">
          {t.pyeongBasis === "대지" ? "대지 기준" : "전용 기준"}
        </div>
      </div>
    </li>
  );
}
