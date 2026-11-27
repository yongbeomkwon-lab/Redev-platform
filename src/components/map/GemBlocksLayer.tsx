"use client";
// 💎 원석 찾기 레이어 — 아직 정비구역으로 지정되지 않은 노후 저층 블록 후보를 지도에 얹는다.
//
//   · 데이터: public/data/gem-blocks.json (scripts/build-gem-blocks.mjs)
//   · 폴리곤은 **우리 SVG 레이어**(z-97)에 그린다. 카카오 Polygon 은 지도 캔버스 아래에 깔려
//     앱이 직접 그리는 구역 캔버스(.kakao-zone-canvas)에 가려진다 — 개발압력 레이어와 같은 이유로
//     화면 좌표로 직접 그린다.
//   · 경계는 **추정**이다 — 카드·범례에 그렇게 적는다. 고시 구역계가 아니다.
//   · 멀리 보면 등급 높은 블록만 남긴다 — 280곳이 한 화면을 덮지 않게.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KakaoMap, KakaoSDK } from "./kakao-loader";
import { GEM_GRADE_COLOR, gemSummary, loadGemBlocks, type GemBlock, type GemData } from "@/lib/gem-blocks";

type Mark = { block: GemBlock; x: number; y: number };
type Shape = { block: GemBlock; points: string; x: number; y: number };

/** 한 화면에 그릴 배지 상한 */
const MAX_MARKS = 55;
/** 배지 사이 최소 간격(px) */
const MIN_GAP_PX = 34;

/** 확대 배율에 따라 남길 등급 — 멀리서는 S만 */
function gradesForLevel(level: number): Set<GemBlock["grade"]> {
  if (level <= 6) return new Set(["S", "A", "B"]);
  if (level === 7) return new Set(["S", "A"]);
  return new Set(["S"]);
}

/** 카드 자리 — 배지 위, 위가 좁으면 아래 */
function cardSpot(sel: { x: number; y: number }, cardH: number, wrap: HTMLElement | null) {
  const cw = wrap?.clientWidth ?? 900;
  const ch = (wrap?.clientHeight ?? 800) - 48;
  const left = Math.max(140, Math.min(sel.x, cw - 140));
  const above = sel.y - 26 - cardH;
  const below = sel.y + 26;
  if (above >= 8) return { left, top: above };
  if (below + cardH <= ch - 8) return { left, top: below };
  return { left, top: Math.max(8, Math.min(sel.y - 80, ch - 8 - cardH)) };
}

export default function GemBlocksLayer({
  sdk,
  map,
  focus,
  onOpenZone,
  onPickJibun,
  onCloseLayer,
}: {
  sdk: KakaoSDK;
  map: KakaoMap;
  /** 첫 화면 패널에서 블록을 눌렀을 때 — 그 자리로 지도를 옮기고 카드를 연다 */
  focus?: { id: string; lat: number; lng: number; token: number } | null;
  onOpenZone?: (zoneId: string) => void;
  onPickJibun?: (lat: number, lng: number) => void;
  onCloseLayer?: () => void;
}) {
  const [data, setData] = useState<GemData | null>(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [cardH, setCardH] = useState(320);
  const [level, setLevel] = useState<number>(map.getLevel());
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const centersRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const blockByIdRef = useRef<Map<string, GemBlock>>(new Map());

  useEffect(() => {
    let alive = true;
    loadGemBlocks()
      .then((d) => {
        if (!alive) return;
        setData(d);
        for (const b of d.blocks) blockByIdRef.current.set(b.id, b);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // ── 화면 좌표 잡기(폴리곤 + 배지) ─────────────────────────────────────────
  const place = useCallback(() => {
    if (!data) return;
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w !== size.w || h !== size.h) setSize({ w, h });
    const proj = map.getProjection();
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const lv = map.getLevel();
    setLevel(lv);
    const grades = gradesForLevel(lv);
    const outMarks: Mark[] = [];
    const outShapes: Shape[] = [];
    const centers = new Map<string, { x: number; y: number }>();
    for (const block of data.blocks) {
      const want = grades.has(block.grade) || block.id === selId;
      if (!want) continue;
      // 선택된 블록의 카드 자리는 화면 밖으로 나가도 계속 알아 둔다(조금만 움직여도 카드가 사라지지 않게)
      const p = proj.containerPointFromCoords(new sdk.maps.LatLng(block.lat, block.lng));
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      centers.set(block.id, { x, y });
      if (block.lat < sw.getLat() - 0.004 || block.lat > ne.getLat() + 0.004) continue;
      if (block.lng < sw.getLng() - 0.004 || block.lng > ne.getLng() + 0.004) continue;
      if (block.polygon.length >= 3) {
        const pts = block.polygon
          .map(([lat, lng]) => {
            const q = proj.containerPointFromCoords(new sdk.maps.LatLng(lat, lng));
            return `${Math.round(q.x)},${Math.round(q.y)}`;
          })
          .join(" ");
        outShapes.push({ block, points: pts, x, y });
      }
      if (block.id === selId) continue; // 선택된 블록은 카드가 대신한다
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      outMarks.push({ block, x, y });
    }
    centersRef.current = centers;
    outMarks.sort((a, b2) => b2.block.score - a.block.score);
    const kept: Mark[] = [];
    for (const m of outMarks) {
      if (kept.length >= MAX_MARKS) break;
      if (kept.some((k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_GAP_PX)) continue;
      kept.push(m);
    }
    setMarks(kept);
    setShapes(outShapes);
  }, [data, map, sdk, selId, size.w, size.h]);

  useEffect(() => {
    if (!data) return;
    place();
    const handler = () => place();
    const close = () => setSelId(null);
    sdk.maps.event.addListener(map, "idle", handler);
    sdk.maps.event.addListener(map, "zoom_changed", handler);
    sdk.maps.event.addListener(map, "center_changed", handler);
    sdk.maps.event.addListener(map, "click", close);
    window.addEventListener("resize", handler);
    return () => {
      sdk.maps.event.removeListener(map, "idle", handler);
      sdk.maps.event.removeListener(map, "zoom_changed", handler);
      sdk.maps.event.removeListener(map, "center_changed", handler);
      sdk.maps.event.removeListener(map, "click", close);
      window.removeEventListener("resize", handler);
    };
  }, [data, place, map, sdk]);

  // 첫 화면 패널 → 블록 카드
  useEffect(() => {
    if (!focus) return;
    setSelId(focus.id);
    try {
      if (map.getLevel() > 6) map.setLevel(5);
      map.panTo(new sdk.maps.LatLng(focus.lat, focus.lng));
    } catch {
      /* 지도 준비 전이면 idle 에서 다시 잡는다 */
    }
  }, [focus, map, sdk]);

  useEffect(() => {
    if (!selId) return;
    const id = requestAnimationFrame(() => {
      const h = cardRef.current?.offsetHeight;
      if (h && Math.abs(h - cardH) > 2) setCardH(h);
    });
    return () => cancelAnimationFrame(id);
  }, [selId, cardH]);

  const selectedBlock = selId ? blockByIdRef.current.get(selId) ?? null : null;
  const anchor = selectedBlock
    ? centersRef.current.get(selectedBlock.id) ?? null
    : null;

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[97]" data-testid="gem-layer">
      {/* ── 경계 폴리곤 — SVG 로 직접 그린다(카카오 폴리곤은 앱 구역 캔버스에 가린다) ── */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.w || "100%"}
        height={size.h || "100%"}
        aria-hidden
        data-testid="gem-shapes"
      >
        {shapes.map((s) => {
          const active = s.block.id === selId;
          const color = GEM_GRADE_COLOR[s.block.grade];
          return (
            <polygon
              key={s.block.id}
              points={s.points}
              data-gem-id={s.block.id}
              fill={color}
              fillOpacity={active ? 0.34 : s.block.grade === "S" ? 0.17 : 0.12}
              stroke={color}
              strokeWidth={active ? 3 : 1.8}
              strokeDasharray={active ? "0" : "7 5"}
              strokeLinejoin="round"
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                setSelId(s.block.id);
              }}
            />
          );
        })}
      </svg>

      {/* 배지 */}
      {marks.map((m) => (
        <button
          key={m.block.id}
          type="button"
          data-testid="gem-badge"
          data-gem-id={m.block.id}
          onClick={(e) => {
            e.stopPropagation();
            setSelId(m.block.id);
          }}
          title={`${m.block.gu} ${m.block.dong ?? ""} ${m.block.jibun ?? ""} — ${gemSummary(m.block)} (누르면 상세)`}
          className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[3px] whitespace-nowrap rounded-full border px-[7px] py-[2px] text-[10.5px] font-extrabold leading-none shadow-[0_1px_3px_rgba(0,0,0,.28)]"
          style={{
            left: m.x,
            top: m.y,
            color: m.block.grade === "S" ? "#ffffff" : "#3b2400",
            background: m.block.grade === "S" ? GEM_GRADE_COLOR.S : m.block.grade === "A" ? "#fde3b4" : "#fff4dc",
            borderColor: GEM_GRADE_COLOR[m.block.grade],
          }}
        >
          💎 노후 {m.block.old30Pct}%
        </button>
      ))}

      {/* 카드 */}
      {selectedBlock && anchor && (() => {
        const pos = cardSpot(anchor, cardH, wrapRef.current);
        return (
          <div
            ref={cardRef}
            data-testid="gem-card"
            data-gem-id={selectedBlock.id}
            className="pointer-events-auto absolute w-[268px] overflow-hidden rounded-xl border border-amber-200 bg-white text-left shadow-[0_12px_32px_-12px_rgba(16,24,40,.5)]"
            style={{ left: pos.left, top: pos.top, transform: "translate(-50%, 0)", zIndex: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2 bg-gradient-to-b from-amber-50 to-white px-3 pb-1.5 pt-2.5">
              <span
                className="mt-[1px] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-white"
                style={{ background: GEM_GRADE_COLOR[selectedBlock.grade] }}
                aria-hidden
              >
                💎
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-extrabold leading-tight text-ink">
                    원석 블록 {Math.round(selectedBlock.score)}점
                  </span>
                  <span
                    className="rounded-full px-1.5 py-[1px] text-[9.5px] font-bold text-white"
                    style={{ background: GEM_GRADE_COLOR[selectedBlock.grade] }}
                  >
                    {selectedBlock.grade}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-600" title={selectedBlock.addr ?? ""}>
                  {selectedBlock.gu} {selectedBlock.dong ?? ""} {selectedBlock.jibun ?? ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelId(null)}
                aria-label="닫기"
                className="-mr-1 -mt-1 rounded p-1 text-[12px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 px-3 py-1.5">
              {[
                ["30년↑ 노후도", `${selectedBlock.old30Pct}%`, true],
                ["20년↑ 노후도", `${selectedBlock.old20Pct}%`, false],
                ["10년 내 신축", `${selectedBlock.new10Pct}%`, false],
                ["저층 건물", `${selectedBlock.bldCount}동`, false],
              ].map(([label, value, strong]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 px-2 py-1">
                  <div className="text-[9.5px] font-semibold text-slate-500">{label}</div>
                  <div className={`text-[12.5px] font-extrabold ${strong ? "text-amber-700" : "text-slate-800"}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1.5 text-[10.5px] text-slate-600">
              <span>
                추정 면적 <b className="text-slate-800">{(selectedBlock.areaM2 / 10000).toFixed(2)}만㎡</b> ({selectedBlock.pyeong.toLocaleString()}평)
              </span>
              <span>
                평균 건물 <b className="text-slate-800">{selectedBlock.avgFootprint}㎡</b>
              </span>
            </div>

            <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[10px] leading-[1.45] text-amber-900">
              <b>미지정 잠재 구역</b> — 아직 정비구역으로 지정되지 않은 노후 저층지입니다. 경계는 건물 위치로 추정한
              참고선이고 고시 구역계가 아닙니다.
            </div>

            {selectedBlock.zonesNear.length > 0 && (
              <div className="px-3 pb-1.5">
                <div className="mb-0.5 text-[9.5px] font-bold text-slate-500">주변 정비구역</div>
                <div className="flex flex-wrap gap-1">
                  {selectedBlock.zonesNear.map((z) => (
                    <button
                      key={z.id + z.dist}
                      type="button"
                      onClick={() => z.id && onOpenZone?.(z.id)}
                      className="rounded-full border border-slate-200 bg-white px-1.5 py-[1px] text-[9.5px] font-semibold text-slate-600 hover:border-brand/40 hover:text-brand"
                      title={`${z.stage} · ${z.dist}m`}
                    >
                      {z.name} <span className="text-slate-400">{z.dist}m</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-1 border-t border-slate-100 px-3 py-1.5">
              <span className="text-[10px] text-slate-500">
                {selectedBlock.station ? `🚇 ${selectedBlock.station.name} ${selectedBlock.station.dist}m` : "역 700m 밖"}
              </span>
              <button
                type="button"
                onClick={() => onPickJibun?.(selectedBlock.lat, selectedBlock.lng)}
                className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-800"
              >
                이 자리 지번·실거래
              </button>
            </div>
          </div>
        );
      })()}

      {/* 범례 — 켜져 있는 동안만. 왼쪽 아래 구역 범례와 겹치지 않게 위쪽 가운데에 둔다 */}
      {data && (
        <div
          data-testid="gem-legend"
          className="pointer-events-auto absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-amber-200 bg-white/95 px-2.5 py-1 text-[10px] leading-[1.5] text-slate-600 shadow-md"
        >
          <span className="flex items-center gap-1.5 font-bold text-amber-800">
            <span aria-hidden>💎</span> 원석 블록 {data.summary.total}곳
            <span className="font-normal text-slate-500">
              S {data.blocks.filter((b) => b.grade === "S").length} · A {data.blocks.filter((b) => b.grade === "A").length} ·{" "}
              {level}단계 {marks.length}개
            </span>
            <span className="font-normal text-slate-400">경계는 추정 · 고시 아님</span>
            <button type="button" onClick={onCloseLayer} className="font-semibold text-amber-700 hover:underline">
              끄기
            </button>
          </span>
        </div>
      )}

      {failed && (
        <div className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 shadow">
          💎 원석 블록 데이터를 불러오지 못했습니다
        </div>
      )}
    </div>
  );
}
