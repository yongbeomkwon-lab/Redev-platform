"use client";
// 💎 원석 찾기 레이어 — 아직 정비구역으로 지정되지 않은 노후 저층 블록 후보를 지도에 얹는다.
//
//   · 데이터: public/data/gem-blocks.json (scripts/build-gem-blocks.mjs)
//   · 폴리곤은 카카오 Polygon(호박색 점선 + 반투명), 배지는 DOM 알약(`💎 노후 72%`)이다.
//     배지는 화면 좌표를 매 이동·확대마다 다시 잡는다(구역 폴리곤처럼 캔버스를 직접 그리지 않는다).
//   · 경계는 **추정**이다 — 카드·범례에 그렇게 적는다. 고시 구역계가 아니다.
//   · 멀리 보면 등급 높은 블록만 남긴다 — 280곳이 한 화면을 덮지 않게.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KakaoMap, KakaoSDK } from "./kakao-loader";
import { GEM_GRADE_COLOR, gemSummary, loadGemBlocks, type GemBlock, type GemData } from "@/lib/gem-blocks";

type Mark = { block: GemBlock; x: number; y: number };

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
  const [selId, setSelId] = useState<string | null>(null);
  const [cardH, setCardH] = useState(320);
  const [level, setLevel] = useState<number>(map.getLevel());

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const polysRef = useRef<Map<string, { setOptions(o: Record<string, unknown>): void; setMap(m: KakaoMap | null): void }>>(new Map());
  const centersRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const blockByIdRef = useRef<Map<string, GemBlock>>(new Map());
  const selIdRef = useRef<string | null>(null);
  selIdRef.current = selId;

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

  // ── 폴리곤 그리기 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const polys = polysRef.current;
    for (const b of data.blocks) {
      const path = b.polygon.map(([lat, lng]) => new sdk.maps.LatLng(lat, lng));
      if (path.length < 3) continue;
      const color = GEM_GRADE_COLOR[b.grade];
      const poly = new sdk.maps.Polygon({
        path,
        strokeWeight: 2,
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeStyle: "dash",
        fillColor: color,
        fillOpacity: b.grade === "S" ? 0.16 : 0.11,
        zIndex: 62,
      });
      poly.setMap(map);
      sdk.maps.event.addListener(poly, "click", () => {
        setSelId(b.id);
      });
      sdk.maps.event.addListener(poly, "mouseover", () => {
        poly.setOptions({ fillOpacity: 0.26, strokeWeight: 3 });
      });
      sdk.maps.event.addListener(poly, "mouseout", () => {
        if (selIdRef.current === b.id) return;
        poly.setOptions({ fillOpacity: b.grade === "S" ? 0.16 : 0.11, strokeWeight: 2 });
      });
      polys.set(b.id, poly);
    }
    return () => {
      for (const p of polys.values()) p.setMap(null);
      polys.clear();
    };
  }, [data, map, sdk]);

  // ── 선택 강조 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    for (const b of data.blocks) {
      const poly = polysRef.current.get(b.id);
      if (!poly) continue;
      const color = GEM_GRADE_COLOR[b.grade];
      if (b.id === selId) {
        poly.setOptions({ fillOpacity: 0.34, strokeWeight: 3, strokeColor: color, zIndex: 63 });
      } else {
        poly.setOptions({ fillOpacity: b.grade === "S" ? 0.16 : 0.11, strokeWeight: 2, zIndex: 62 });
      }
    }
  }, [selId, data]);

  // ── 배지 자리 ─────────────────────────────────────────────────────────────
  const place = useCallback(() => {
    if (!data) return;
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const proj = map.getProjection();
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const lv = map.getLevel();
    setLevel(lv);
    const grades = gradesForLevel(lv);
    const out: Mark[] = [];
    const centers = new Map<string, { x: number; y: number }>();
    for (const block of data.blocks) {
      if (block.id === selId) continue; // 선택된 블록은 카드가 대신한다
      if (!grades.has(block.grade)) continue;
      if (block.lat < sw.getLat() - 0.003 || block.lat > ne.getLat() + 0.003) continue;
      if (block.lng < sw.getLng() - 0.003 || block.lng > ne.getLng() + 0.003) continue;
      const p = proj.containerPointFromCoords(new sdk.maps.LatLng(block.lat, block.lng));
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      centers.set(block.id, { x, y });
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      out.push({ block, x, y });
    }
    centersRef.current = centers;
    out.sort((a, b2) => b2.block.score - a.block.score);
    const kept: Mark[] = [];
    for (const m of out) {
      if (kept.length >= MAX_MARKS) break;
      if (kept.some((k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_GAP_PX)) continue;
      kept.push(m);
    }
    setMarks(kept);
  }, [data, map, sdk, selId]);

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
    ? centersRef.current.get(selectedBlock.id) ??
      (() => {
        try {
          const p = map.getProjection().containerPointFromCoords(new sdk.maps.LatLng(selectedBlock.lat, selectedBlock.lng));
          return { x: Math.round(p.x), y: Math.round(p.y) };
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[97]" data-testid="gem-layer">
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
                      key={z.name + z.dist}
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

      {/* 범례 — 켜져 있는 동안만 */}
      {data && (
        <div
          data-testid="gem-legend"
          className="pointer-events-auto absolute bottom-2 left-2 rounded-lg border border-amber-200 bg-white/95 px-2.5 py-1.5 text-[10px] leading-[1.5] text-slate-600 shadow-md md:bottom-2"
        >
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <span aria-hidden>💎</span> 원석 블록 {data.summary.total}곳
            <span className="font-normal text-slate-500">
              (S {data.blocks.filter((b) => b.grade === "S").length} · A {data.blocks.filter((b) => b.grade === "A").length})
            </span>
          </div>
          <div className="mt-0.5 text-slate-500">
            정비구역 아닌 노후 저층지 · 현재 {level}단계 {marks.length}개 표시
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-slate-400">경계는 추정 · 고시 아님</span>
            <button type="button" onClick={onCloseLayer} className="font-semibold text-amber-700 hover:underline">
              끄기
            </button>
          </div>
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
