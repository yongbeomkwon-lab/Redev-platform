"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneTransactions — 구역 상세의 「최근 실거래가 (국토부)」
//
//  · 국토부 실거래가는 좌표를 주지 않는다. 그래서 구역 경계 안 거래를 가려내려면
//      ① 구역이 걸치는 **법정동 목록**을 구해 그 동들만 조회하고(`/api/transactions?dongs=…`),
//      ② 각 거래의 지번 주소를 카카오로 **지오코딩**해 좌표를 얻은 뒤,
//      ③ 그 점이 구역 폴리곤 안인지(pointInRing) 판정한다.
//    → 한남3·4·5구역을 각각 눌렀을 때 같은 '한남동 전체'가 아니라 **그 구역 안 거래만** 뜬다.
//
//  · 법정동 목록은 구역 안쪽 표본점(경계 격자 + 안쪽으로 당긴 꼭짓점)의 역지오코딩으로 모은다.
//    여러 법정동에 걸친 구역(한남동·보광동 등)도 놓치지 않는다.
//  · 지오코딩 결과는 지번 단위로 메모리 + sessionStorage 에 캐시하고, 6건씩 묶어 최근 거래부터
//    처리하며 진행률을 보여준다(카카오 쿼터·속도 부담을 줄인다).
//  · 단독·다가구는 국토부가 지번을 `1**`처럼 가려 와서 좌표를 얻을 수 없다 → '법정동 전체'에서만 보인다.
//  · 화면은 **구역 내**(기본) / **법정동 전체** 두 갈래다. 구역 내 0건이면 바로 전환하는 버튼을 준다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
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
import { geocodeJibun, legalDongAtPoint, type GeoPoint } from "@/lib/kakao-address";
import { hasShape, pointInZone, sampleZonePoints, type ZoneShape } from "@/lib/zone-geo";
import type { TxMapPin } from "@/components/map/props";

/** 지도에 찍는 핀 상한 — 구역 안 거래가 많아도 지도가 뭉개지지 않게(최신 거래부터) */
const PIN_CAP = 60;

const KIND_COLORS: Record<MolitTransactionKind, string> = {
  아파트: "#2563eb",
  "단독·다가구": "#b45309",
  "연립·다세대": "#7c3aed",
};

/** 지오코딩은 6건씩 묶어 보낸다 — 카카오 주소검색 부담과 화면 멈춤을 함께 줄인다 */
const GEO_BATCH = 6;
/**
 * 판정 상한 — 신림동처럼 거래가 수백 건인 큰 법정동도 끝까지 판정한다(최근 거래부터).
 *   · 카카오 주소검색 1건당 ~20-30ms라 800건이면 30초 안팎. 진행률을 보여주며 채우고,
 *     결과는 지번 단위로 캐시해 다시 열 때는 즉시 끝난다.
 *   · 이 값은 쿼터·과부하를 막는 안전선이다.
 */
const GEO_CAP = 1200;
/** 법정동 표본점 역지오코딩 동시 호출 수 */
const DONG_CONCURRENCY = 4;

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}

/** 지번이 좌표 조회에 쓸 수 있는 형태인가 — 단독·다가구의 `*`·`1**` 마스킹은 제외 */
function cleanJibun(jibun: string): boolean {
  return /^\d{1,4}(-\d{1,4})?$/.test(jibun.trim());
}

function txKey(t: { umdNm: string; jibun: string }): string {
  return `${t.umdNm}|${t.jibun}`;
}

export default function ZoneTransactions({
  gu,
  names,
  center,
  polygon,
  parts,
  holes,
  onTxPins,
}: {
  gu: string;
  /** 구역 이름·별칭 — 법정동·지번을 찾는 근거 */
  names: string[];
  /** 구역 중심 좌표(있으면 역지오코딩 대비책으로 쓴다) */
  center?: [number, number];
  /** 구역 경계 폴리곤([위도, 경도]) — 있으면 '구역 내' 판정을 직접 계산한다 */
  polygon?: [number, number][] | null;
  /** MultiPolygon 의 나머지 조각 */
  parts?: [number, number][][] | null;
  /** 구역 안에 뚫린 구멍 */
  holes?: [number, number][][] | null;
  /**
   * 구역 안 거래의 좌표를 지도 가격 핀으로 넘긴다.
   *   · 지번 좌표를 얻은 아파트·연립다세대 거래만, 같은 지번은 최신 1건만.
   *   · 구역이 바뀌거나 표시할 거래가 없으면 빈 배열을 넘긴다.
   */
  onTxPins?: (pins: TxMapPin[]) => void;
}) {
  const [dongs, setDongs] = useState<string[] | null>(null);
  const [dongNote, setDongNote] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [kind, setKind] = useState<MolitTransactionKind | "전체">("전체");
  const [mode, setMode] = useState<"zone" | "dong">("zone");
  const [data, setData] = useState<MolitResponse | null>(null);
  const [state, setState] = useState<"resolving" | "loading" | "ready" | "error">("resolving");
  const [visible, setVisible] = useState(20);
  const [reloadKey, setReloadKey] = useState(0);
  const [geo, setGeo] = useState<Record<string, GeoPoint | null>>({});
  const [progress, setProgress] = useState<{ done: number; total: number; found: number }>({
    done: 0,
    total: 0,
    found: 0,
  });
  const geoGen = useRef(0);

  const namesKey = names.join("|");
  const jibun = useMemo(() => zoneJibunInText(names), [namesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lat = center?.[0];
  const lng = center?.[1];
  const shape = useMemo<ZoneShape>(() => ({ polygon, parts, holes }), [polygon, parts, holes]);
  const shaped = hasShape(shape);
  const dongsKey = dongs?.join(",") ?? "";

  // 경계 도형이 없으면(경계 미고시 후보지) '구역 내'를 계산할 수 없다 → 법정동 전체만
  useEffect(() => {
    setMode(shaped ? "zone" : "dong");
  }, [shaped, namesKey]);

  // ── 1) 법정동 찾기 ────────────────────────────────────────────────────────
  //   이름에 동이 그대로 있으면 그 동을 기본으로 두고, 구역 안쪽 여러 지점을 역지오코딩해
  //   걸치는 동을 모두 더한다(한남3구역 → 한남동·보광동 …).
  useEffect(() => {
    let alive = true;
    setDongs(null);
    setDongNote(null);
    setState("resolving");

    const list = namesKey ? namesKey.split("|") : [];
    const exact = legalDongInText(gu, list);
    const stems = guessLegalDongsByStem(gu, list);
    const base = exact ? [exact] : stems;

    const points = shaped
      ? sampleZonePoints(shape, 12, lat !== undefined && lng !== undefined ? [lat, lng] : undefined)
      : lat !== undefined && lng !== undefined
        ? ([[lat, lng]] as [number, number][])
        : [];

    if (!points.length && base.length) {
      setDongs(base);
      return;
    }

    (async () => {
      const sampled: string[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < points.length) {
          const p = points[cursor++];
          const d = await legalDongAtPoint(p[0], p[1], gu);
          if (!alive) return;
          if (d && !sampled.includes(d)) sampled.push(d);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(DONG_CONCURRENCY, points.length) }, () => worker())
      );
      if (!alive) return;
      const out = [...base, ...sampled.filter((d) => !base.includes(d))].slice(0, 6);
      if (out.length) {
        setDongs(out);
        if (out.length >= 2) {
          setDongNote(`${out.join("·")}에 걸친 구역입니다.`);
        }
      } else {
        setDongNote("구역 이름·경계에서 법정동을 확인하지 못했습니다.");
        setState("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [gu, namesKey, lat, lng, shaped, shape]);

  // ── 2) 실거래 조회 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dongs?.length) return;
    let alive = true;
    setState("loading");
    const qs = new URLSearchParams({ gu, dongs: dongs.join(","), months: String(months) });
    // 경계 도형이 없을 때만 대표 지번 일치로 '구역 내'를 흉내 낸다
    if (!shaped && jibun && dongs.includes(jibun.dong)) qs.set("jibun", String(jibun.bonbun));
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
  }, [gu, dongsKey, months, jibun, shaped, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => data?.transactions ?? [], [data]);

  // ── 3) 지번 → 좌표 → 구역 안/밖 판정 ─────────────────────────────────────
  useEffect(() => {
    const gen = ++geoGen.current;
    if (!shaped || !data?.ok) {
      setProgress({ done: 0, total: 0, found: 0 });
      return;
    }
    const done = new Set<string>();
    const jobs = rows
      .filter((r) => r.kind !== "단독·다가구" && cleanJibun(r.jibun))
      .slice(0, GEO_CAP)
      .filter((r) => {
        if (done.has(txKey(r))) return false;
        done.add(txKey(r));
        return true;
      });
    if (!jobs.length) {
      setProgress({ done: 0, total: 0, found: 0 });
      return;
    }

    let cancelled = false;
    let found = 0;
    setProgress({ done: 0, total: jobs.length, found: 0 });

    (async () => {
      for (let i = 0; i < jobs.length; i += GEO_BATCH) {
        if (cancelled || geoGen.current !== gen) return;
        const chunk = jobs.slice(i, i + GEO_BATCH);
        const points = await Promise.all(chunk.map((r) => geocodeJibun(gu, r.umdNm, r.jibun)));
        if (cancelled || geoGen.current !== gen) return;
        const add: Record<string, GeoPoint | null> = {};
        chunk.forEach((r, k) => {
          const p = points[k];
          if (p) found += 1;
          add[txKey(r)] = p;
        });
        setGeo((prev) => ({ ...prev, ...add }));
        setProgress((prev) => ({
          done: Math.min(jobs.length, prev.done + chunk.length),
          total: jobs.length,
          found,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shaped, data, rows, gu]); // eslint-disable-line react-hooks/exhaustive-deps

  // 좌표가 구역 폴리곤 안에 드는 거래의 키 집합
  const insideKeys = useMemo(() => {
    const set = new Set<string>();
    if (!shaped) return set;
    for (const [k, p] of Object.entries(geo)) {
      if (p && pointInZone(shape, p.lat, p.lng)) set.add(k);
    }
    return set;
  }, [geo, shape, shaped]);

  const isInside = (t: MolitTransaction): boolean =>
    shaped ? insideKeys.has(txKey(t)) : t.scope === "zone";

  const zoneRows = useMemo(() => rows.filter(isInside), [rows, insideKeys, shaped]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedRows = mode === "zone" ? zoneRows : rows;

  const filtered = useMemo(
    () => (kind === "전체" ? scopedRows : scopedRows.filter((r) => r.kind === kind)),
    [scopedRows, kind]
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of scopedRows) if (!r.canceled) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [scopedRows]);
  const zoneCount = useMemo(() => zoneRows.filter((r) => !r.canceled).length, [zoneRows]);
  const totalCount = data?.summary?.count ?? 0;

  // ── 요약 바 — 건수 · 최근 최저~최고 · 평균 평당가 ──────────────────────────
  //   · 유형 탭(전체/아파트/단독·다가구/연립·다세대)에 따라 `filtered`가 바뀌므로
  //     요약도 같은 목록으로 다시 계산한다(탭과 숫자가 다른 말을 하지 않게).
  //   · 해제(취소)된 거래는 시세가 아니므로 건수·최저·최고·평균에서 모두 뺀다.
  const stats = useMemo(() => {
    const live = filtered.filter((r) => !r.canceled);
    const prices = live.map((r) => r.price).filter((v) => Number.isFinite(v) && v > 0);
    const mean = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    return {
      count: live.length,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      jeon: mean(live.filter((r) => r.pyeongBasis === "전용" && r.pyeongPrice).map((r) => r.pyeongPrice as number)),
      land: mean(live.filter((r) => r.pyeongBasis === "대지" && r.pyeongPrice).map((r) => r.pyeongPrice as number)),
    };
  }, [filtered]);

  // ── 지도 가격 핀 — 구역 경계 안 거래의 좌표를 위로 넘긴다 ──────────────────
  //   · 지번 좌표가 확인된 아파트·연립다세대만(단독·다가구는 지번이 가려져 있어 좌표가 없다).
  //   · 같은 지번에 여러 거래가 있으면 **최신 1건**만 남겨 핀이 겹치지 않게 한다.
  const mapPins = useMemo<TxMapPin[]>(() => {
    if (!shaped) return [];
    const byJibun = new Map<string, TxMapPin>();
    for (const t of rows) {
      if (t.kind === "단독·다가구" || t.canceled) continue;
      const k = txKey(t);
      if (!insideKeys.has(k)) continue;
      const p = geo[k];
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const prev = byJibun.get(k);
      if (prev && prev.dealDate >= t.dealDate) continue;
      byJibun.set(k, {
        id: t.id,
        name: t.name,
        kind: t.kind,
        lat: p.lat,
        lng: p.lng,
        price: t.price,
        priceLabel: eokShort(t.price),
        areaLabel: t.areaSqm ? `전용 ${Math.round(t.areaSqm)}㎡` : "",
        dealDate: t.dealDate,
        jibun: t.jibun,
        umdNm: t.umdNm,
        pyeongPrice: t.pyeongPrice ?? null,
      });
    }
    return [...byJibun.values()]
      .sort((a, b) => b.dealDate.localeCompare(a.dealDate))
      .slice(0, PIN_CAP);
  }, [rows, insideKeys, geo, shaped]);

  const pinsRef = useRef(onTxPins);
  pinsRef.current = onTxPins;
  const pinSig = mapPins.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    pinsRef.current?.(mapPins);
  }, [pinSig]); // eslint-disable-line react-hooks/exhaustive-deps
  // 패널을 닫거나 다른 구역으로 옮기면 지도 핀도 지운다
  useEffect(() => () => pinsRef.current?.([]), []);

  const missKinds = (data?.coverage ?? []).filter((c) => !c.ok);
  const dongLabel = dongs?.join("·") ?? "";
  const period = data?.query
    ? `${data.query.from.slice(0, 4)}.${data.query.from.slice(4)}~${data.query.to.slice(0, 4)}.${data.query.to.slice(4)}`
    : "";
  const geoRunning = shaped && progress.total > 0 && progress.done < progress.total;
  const geoCapped = shaped && rows.filter((r) => r.kind !== "단독·다가구" && cleanJibun(r.jibun)).length > GEO_CAP;
  const geoFailedAll = shaped && progress.total > 0 && progress.done === progress.total && progress.found === 0;
  const shown = filtered.slice(0, visible);

  return (
    <section data-testid="zone-tx" className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-[11px] font-bold text-blue-900">
          최근 실거래가 <span className="font-normal text-blue-700/80">(국토부)</span>
        </span>
        <span className="text-[10px] text-blue-700/70">
          {dongLabel ? `${dongLabel} · ${months}개월` : "법정동 확인 중"}
          {period ? ` · ${period}` : ""}
        </span>
      </div>

      {/* 구역 내 / 법정동 전체 — 경계 도형이 있을 때만 고를 수 있다 */}
      {shaped && state === "ready" && (
        <div className="mb-2 inline-flex overflow-hidden rounded-full border border-blue-300 bg-white text-[11px]">
          <button
            type="button"
            data-testid="tx-mode-zone"
            onClick={() => {
              setMode("zone");
              setVisible(20);
            }}
            className={
              mode === "zone"
                ? "bg-blue-900 px-2.5 py-1 text-[11px] font-bold text-white"
                : "px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50"
            }
          >
            구역 내 <span className="font-normal">{zoneCount}</span>
          </button>
          <button
            type="button"
            data-testid="tx-mode-dong"
            onClick={() => {
              setMode("dong");
              setVisible(20);
            }}
            className={
              mode === "dong"
                ? "bg-blue-900 px-2.5 py-1 text-[11px] font-bold text-white"
                : "px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50"
            }
          >
            {dongs && dongs.length > 1 ? "법정동 전체" : "동일 법정동"} <span className="font-normal">{totalCount}</span>
          </button>
        </div>
      )}

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
          전체 <span className="font-normal">{mode === "zone" ? zoneCount : totalCount}</span>
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
          {/* 요약 바 — 건수 · 최근 최저~최고 · 평균 평당가 (유형 탭·기간에 따라 자동 재계산) */}
          <div
            data-testid="tx-summary"
            className="mb-1.5 grid grid-cols-3 divide-x divide-blue-100 overflow-hidden rounded-lg border border-blue-200 bg-white"
          >
            <div className="px-2 py-1.5">
              <div className="text-[9px] font-semibold text-slate-500">{kind === "전체" ? "거래 건수" : `${kind} 건수`}</div>
              <div data-testid="tx-summary-count" className="text-[13px] font-bold leading-tight text-slate-900">
                {stats.count}
                <span className="text-[10px] font-semibold text-slate-500">건</span>
              </div>
              <div className="text-[9px] leading-tight text-slate-400">
                {months}개월 · {mode === "zone" ? "구역 내" : "법정동"}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[9px] font-semibold text-slate-500">최근 최저~최고</div>
              <div data-testid="tx-summary-range" className="text-[12px] font-bold leading-tight text-slate-900">
                {stats.min !== null && stats.max !== null ? (
                  stats.min === stats.max ? (
                    eokShort(stats.min)
                  ) : (
                    <>
                      {eokShort(stats.min)}
                      <span className="text-slate-400"> ~ </span>
                      {eokShort(stats.max)}
                    </>
                  )
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </div>
              <div className="text-[9px] leading-tight text-slate-400">해제 거래 제외</div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[9px] font-semibold text-slate-500">평균 평당(3.3㎡)</div>
              <div data-testid="tx-summary-pyeong" className="text-[12px] font-bold leading-tight text-slate-900">
                {stats.jeon !== null ? (
                  <>
                    {stats.jeon.toLocaleString()}
                    <span className="text-[10px] font-semibold text-slate-500">만</span>
                  </>
                ) : stats.land !== null ? (
                  <>
                    {stats.land.toLocaleString()}
                    <span className="text-[10px] font-semibold text-slate-500">만</span>
                  </>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </div>
              <div className="text-[9px] leading-tight text-slate-400">
                {stats.jeon !== null ? "전용 기준" : stats.land !== null ? "대지 기준" : "계산 불가"}
                {stats.jeon !== null && stats.land !== null ? ` · 대지 ${stats.land.toLocaleString()}만` : ""}
              </div>
            </div>
          </div>

          {/* 경계 판정 진행·해제 건수 — 요약 숫자의 근거를 함께 보여준다 */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-blue-900/80">
            {data?.summary?.canceled ? <span>해제(취소) {data.summary.canceled}건 별도</span> : null}
            {mode === "zone" && shaped && progress.total > 0 && (
              <span className="text-blue-800/70">
                경계 판정 {progress.done}/{progress.total}지번{geoCapped ? ` (최근 ${GEO_CAP}건까지)` : ""}
              </span>
            )}
            {mapPins.length > 0 && (
              <span data-testid="tx-pin-count" className="text-blue-800/70">
                지도 가격 핀 {mapPins.length}곳
              </span>
            )}
          </div>

          {/* 구역 경계 판정 진행 — 목록은 판정되는 대로 채워진다 */}
          {mode === "zone" && geoRunning && (
            <div className="mb-1.5 rounded-lg border border-blue-200 bg-white px-2 py-1" data-testid="tx-geo-progress">
              <div className="flex items-center gap-1.5 text-[10px] text-blue-800">
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-blue-300 border-t-blue-700" />
                지번 좌표로 구역 경계를 확인하는 중… {progress.done}/{progress.total}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-1 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* 거래 목록 */}
          {filtered.length === 0 ? (
            <EmptyState
              mode={mode}
              kind={kind}
              months={months}
              dongLabel={dongLabel}
              shaped={shaped}
              geoRunning={geoRunning}
              geoFailedAll={geoFailedAll}
              zoneCount={zoneCount}
              onShowAll={() => {
                setMode("dong");
                setVisible(20);
              }}
            />
          ) : (
            <ul
              data-testid="tx-rows"
              className="divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100 bg-white"
            >
              {shown.map((t) => (
                <TxRow key={t.id} t={t} inside={isInside(t)} showBadge={mode === "dong"} />
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
            {mode === "zone" && shaped && (
              <li>
                · 구역 경계 폴리곤 안에 좌표가 드는 아파트·연립다세대 거래만 보여줍니다(지번 주소를 카카오로
                좌표 변환). 단독·다가구는 국토부가 지번을 가려 판정할 수 없어 ‘법정동 전체’에서만 보입니다.
              </li>
            )}
            {!shaped && <li>· 이 구역은 경계 도형이 없어(경계 미고시) 법정동 전체 거래만 보여줍니다.</li>}
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

function EmptyState({
  mode,
  kind,
  months,
  dongLabel,
  shaped,
  geoRunning,
  geoFailedAll,
  zoneCount,
  onShowAll,
}: {
  mode: "zone" | "dong";
  kind: MolitTransactionKind | "전체";
  months: number;
  dongLabel: string;
  shaped: boolean;
  geoRunning: boolean;
  geoFailedAll: boolean;
  zoneCount: number;
  onShowAll: () => void;
}) {
  if (mode === "zone" && shaped) {
    if (kind === "단독·다가구") {
      return (
        <div className="rounded-lg border border-dashed border-blue-200 bg-white px-2 py-4 text-center text-[11px] leading-relaxed text-slate-500">
          단독·다가구는 국토부가 지번을 `1**`처럼 가려서 구역 안팎을 판정할 수 없습니다.
          <br />
          <button
            type="button"
            onClick={onShowAll}
            className="mt-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 hover:border-blue-500"
          >
            {dongLabel || "법정동"} 전체 보기
          </button>
        </div>
      );
    }
    if (geoFailedAll) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-4 text-center text-[11px] leading-relaxed text-amber-900">
          지번 주소를 좌표로 바꾸지 못해 구역 경계 안팎을 판정할 수 없습니다(카카오 주소 서비스 응답 없음).
          <br />
          <button
            type="button"
            onClick={onShowAll}
            className="mt-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:border-amber-500"
          >
            {dongLabel || "법정동"} 전체 보기
          </button>
        </div>
      );
    }
    return (
      <div
        data-testid="tx-zone-empty"
        className="rounded-lg border border-dashed border-blue-200 bg-white px-2 py-4 text-center text-[11px] leading-relaxed text-slate-500"
      >
        {geoRunning ? (
          <>구역 경계 안 거래를 찾는 중…</>
        ) : (
          <>
            구역 경계 안에서 최근 {months}개월 {kind === "전체" ? "아파트·연립다세대" : kind} 거래가 없습니다.
            {zoneCount === 0 ? "" : " (유형을 바꿔 보세요)"}
            <br />
            <button
              type="button"
              data-testid="tx-show-all"
              onClick={onShowAll}
              className="mt-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 hover:border-blue-500"
            >
              {dongLabel || "법정동"} 전체 보기
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <p className="rounded-lg border border-dashed border-blue-200 bg-white py-5 text-center text-[11px] text-slate-500">
      {kind === "전체" ? `최근 ${months}개월 ${dongLabel} 국토부 신고 거래가 없습니다.` : `${kind} 거래가 없습니다.`}
    </p>
  );
}

function TxRow({
  t,
  inside,
  showBadge,
}: {
  t: MolitTransaction;
  inside: boolean;
  showBadge: boolean;
}) {
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
          {showBadge && inside && (
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
