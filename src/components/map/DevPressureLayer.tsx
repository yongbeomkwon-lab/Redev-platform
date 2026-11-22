"use client";
// 🔥 개발압력 레이어 — 지도 위에 「주변이 정비구역·아파트로 둘러싸인 노후 저층지」 핫스팟을 얹는다.
//
//   · 데이터: public/data/dev-pressure.json (scripts/build-dev-pressure.py)
//   · 좌표는 카카오 `map.getProjection().containerPointFromCoords()` 로 매 이동·확대마다 다시 잡는다.
//     (구역 폴리곤은 캔버스가 직접 그리지만, 점 핀은 DOM 이 눌러야 해서 이 레이어가 맡는다)
//   · 멀리 보면 점수 높은 곳만 남긴다 — 서울 전체에서 540여 개 핀이 지도를 덮지 않게.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KakaoMap, KakaoSDK } from "./kakao-loader";
import {
  DEV_GRADE_COLOR,
  formatBlockArea,
  loadDevBlocks,
  loadDevPressure,
  minScoreForLevel,
  type DevBlock,
  type DevHotspot,
} from "@/lib/dev-pressure";
import DevPressureCard from "./DevPressureCard";

type Mark = { spot: DevHotspot; x: number; y: number };

/** 가상 구역경계 — 지도 좌표를 그대로 그리기 위해 「1e-6도」 격자 단위의 Path 문자열로 미리 만든다.
 *  (매 프레임 꼭짓점 4,000개를 다시 투영하지 않고, SVG 그룹 transform 만 옮긴다) */
const BLOCK_UNIT = 1e6;
const BLOCK_REF_LAT = 37.55;
const BLOCK_REF_LNG = 126.9;
/** 이 배율보다 멀리 보면 가상 경계는 그리지 않는다 — 서울 전체에서 80개 폴리곤이 지도를 덮지 않게 */
const BLOCK_MAX_LEVEL = 6;

function blockPathD(block: DevBlock): string {
  const toX = (lng: number) => ((lng - BLOCK_REF_LNG) * BLOCK_UNIT).toFixed(1);
  const toY = (lat: number) => (-(lat - BLOCK_REF_LAT) * BLOCK_UNIT).toFixed(1);
  const ring = (pts: [number, number][]) =>
    pts.length < 3
      ? ""
      : `M${pts.map(([lat, lng]) => `${toX(lng)},${toY(lat)}`).join("L")}Z`;
  let d = ring(block.polygon);
  for (const h of block.holes ?? []) d += ring(h); // evenodd 로 구멍이 뚫린다
  return d;
}

/** 한 화면에 그릴 핀 상한 — DOM 수를 묶어 이동할 때 끊기지 않게 */
const MAX_MARKS = 64;
/** 핀 사이 최소 간격(px) — 겹치면 뒤 핀을 누를 수 없어 점수 높은 쪽만 남긴다
 *  (2026-11-22: 숫자만 찍던 원형 핀을 「84점」 알약으로 바꾸면서 폭이 늘어 26px 로 넓혔다) */
const MIN_GAP_PX = 26;

/** 등급별 알약 크기 — 글자가 잘리지 않게 폭은 글자에 맞춰 늘어난다(고정 height + 좌우 padding) */
const PIN_SIZE = {
  최상: { height: 24, padX: 7, fontSize: 11.5 },
  높음: { height: 22, padX: 6, fontSize: 11 },
  보통: { height: 20, padX: 5, fontSize: 10 },
} as const;

export default function DevPressureLayer({
  sdk,
  map,
  onOpenZone,
  onPickJibun,
  onCloseLayer,
  focus,
}: {
  sdk: KakaoSDK;
  map: KakaoMap;
  onOpenZone?: (zoneId: string) => void;
  onPickJibun?: (lat: number, lng: number) => void;
  onCloseLayer?: () => void;
  /** 첫 화면 패널에서 핫스팟을 눌렀을 때 — 그 좌표로 지도를 옮기고 카드를 연다 */
  focus?: { id: string; lat: number; lng: number; token: number } | null;
}) {
  const [spots, setSpots] = useState<DevHotspot[] | null>(null);
  const [blocks, setBlocks] = useState<DevBlock[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(map.getLevel());
  /** SVG 그룹 변환 — { x, y, kx, ky } 를 ref 로 두고 DOM 에 직접 적용한다(매 프레임 리렌더 방지) */
  const blockGRef = useRef<SVGGElement | null>(null);
  /** 가상 경계 중심의 화면 좌표 — 폴리곤을 눌렀을 때 카드를 띄울 자리(핀이 없어도 된다) */
  const blockCentersRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [blockLayerShown, setBlockLayerShown] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;
  /** place() 가 최신 블록 목록을 클로저 없이 읽기 위한 ref */
  const blocksRef = useRef<DevBlock[] | null>(null);

  blocksRef.current = blocks;
  /** 블록 경로 문자열 — 데이터가 한 번만 바뀌므로 한 번만 만든다 */
  const blockPaths = useMemo(
    () => (blocks ?? []).map((b) => ({ block: b, d: blockPathD(b) })),
    [blocks]
  );

  useEffect(() => {
    let alive = true;
    loadDevPressure()
      .then((d) => {
        if (alive) setSpots(d.hotspots);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    // 가상 구역경계는 핀과 별개 파일 — 없거나 실패해도 핀은 그대로 보여 준다
    loadDevBlocks()
      .then((d) => {
        if (alive) setBlocks(d.blocks);
      })
      .catch(() => {
        /* 가상 경계만 없는 상태로 둔다 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const place = useCallback(() => {
    if (!spots) return;
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
    const minScore = minScoreForLevel(lv);
    const out: Mark[] = [];
    for (const s of spots) {
      if (s.score < minScore) continue;
      if (s.lat < sw.getLat() - 0.002 || s.lat > ne.getLat() + 0.002) continue;
      if (s.lng < sw.getLng() - 0.002 || s.lng > ne.getLng() + 0.002) continue;
      const p = proj.containerPointFromCoords(new sdk.maps.LatLng(s.lat, s.lng));
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      // 정수 픽셀에 앉힌다 — 소수점 좌표 + translate(-50%,-50%) 는 핀 숫자를 서브픽셀에서 다시 그려 흐려진다
      out.push({ spot: s, x: Math.round(p.x), y: Math.round(p.y) });
    }
    out.sort((a, b2) => b2.spot.score - a.spot.score);
    // 겹침 정리 — 점수 높은 핀부터 두고, 22px 안에 이미 놓인 핀이 있으면 건너뛴다
    const kept: Mark[] = [];
    for (const m of out) {
      if (kept.length >= MAX_MARKS) break;
      if (kept.some((k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_GAP_PX)) continue;
      kept.push(m);
    }
    setMarks(kept);

    // ── 가상 구역경계(SVG) 위치 맞추기 ────────────────────────────────────
    //   꼭짓점은 「1e-6도」 단위로 미리 그려 두고, 여기서는 지도 중심의 축척만 재서
    //   그룹 transform 하나를 옮긴다(폴리곤 80개 · 꼭짓점 4천여 개를 매 프레임 투영하지 않는다).
    // 폴리곤 중심의 화면 좌표 — 카드 앵커(폴리곤 클릭 시)로 쓴다
    if (blocksRef.current) {
      const m2 = new Map<string, { x: number; y: number }>();
      for (const b of blocksRef.current) {
        const p = proj.containerPointFromCoords(new sdk.maps.LatLng(b.center[0], b.center[1]));
        m2.set(b.id, { x: Math.round(p.x), y: Math.round(p.y) });
      }
      blockCentersRef.current = m2;
    }

    const scene = blockGRef.current;
    if (scene) {
      const showBlocks = lv <= BLOCK_MAX_LEVEL;
      setBlockLayerShown(showBlocks);
      if (showBlocks) {
        const c = map.getCenter();
        const cLat = c.getLat();
        const cLng = c.getLng();
        const p0 = proj.containerPointFromCoords(new sdk.maps.LatLng(cLat, cLng));
        const p1 = proj.containerPointFromCoords(new sdk.maps.LatLng(cLat, cLng + 0.01));
        const p2 = proj.containerPointFromCoords(new sdk.maps.LatLng(cLat + 0.01, cLng));
        const kxDeg = (p1.x - p0.x) / 0.01; // px per degree(lng)
        const kyDeg = (p2.y - p0.y) / 0.01; // px per degree(lat) — 화면 y 는 남쪽(+)
        if (Math.abs(kxDeg) > 1e-6 && Math.abs(kyDeg) > 1e-6) {
          const tx = Math.round((p0.x + (BLOCK_REF_LNG - cLng) * kxDeg) * 100) / 100;
          const ty = Math.round((p0.y + (BLOCK_REF_LAT - cLat) * kyDeg) * 100) / 100;
          const sx = kxDeg / BLOCK_UNIT;
          const sy = -kyDeg / BLOCK_UNIT;
          scene.setAttribute("transform", `translate(${tx} ${ty}) scale(${sx} ${sy})`);
        }
      }
    }
  }, [map, sdk, spots]);

  useEffect(() => {
    if (!blocks) return;
    place();
  }, [blocks, place]);

  // 첫 화면 패널 → 핫스팟 카드: 지도를 그 자리로 옮기고 카드를 연다(token 이 바뀔 때만)
  useEffect(() => {
    if (!focus) return;
    setSelId(focus.id);
    try {
      if (map.getLevel() > 6) map.setLevel(5); // 500m 안팎 — 핫스팟과 둘러싼 구역이 함께 보이게
      map.panTo(new sdk.maps.LatLng(focus.lat, focus.lng));
    } catch {
      /* 지도 준비 전이면 idle 에서 다시 자리를 잡는다 */
    }
  }, [focus, map, sdk]);

  useEffect(() => {
    if (!spots) return;
    place();
    const handler = () => place();
    const closeOnMapClick = () => setSelId(null);
    sdk.maps.event.addListener(map, "idle", handler);
    sdk.maps.event.addListener(map, "zoom_changed", handler);
    sdk.maps.event.addListener(map, "center_changed", handler);
    sdk.maps.event.addListener(map, "click", closeOnMapClick);
    window.addEventListener("resize", handler);
    return () => {
      sdk.maps.event.removeListener(map, "idle", handler);
      sdk.maps.event.removeListener(map, "zoom_changed", handler);
      sdk.maps.event.removeListener(map, "center_changed", handler);
      sdk.maps.event.removeListener(map, "click", closeOnMapClick);
      window.removeEventListener("resize", handler);
    };
  }, [map, place, sdk, spots]);

  // 카드는 핀을 눌렀든 가상 경계(폴리곤)를 눌렀든 같은 스팟으로 연다.
  //   · 핀이 이 화면에 없을 수 있으므로(확대 배율에 따라 핀을 솎아 낸다) 스팟은 전체 목록에서 찾는다.
  const selectedMark = marks.find((m) => m.spot.id === selId) ?? null;
  const selectedSpot = selectedMark?.spot ?? (selId ? (spots?.find((s) => s.id === selId) ?? null) : null);
  const selectedBlock = selectedSpot ? (blocks?.find((b) => b.id === selectedSpot.id) ?? null) : null;
  const anchor = selectedMark ?? (selectedBlock ? blockCentersRef.current.get(selectedBlock.id) ?? null : null);
  const selected = selectedSpot && anchor ? { spot: selectedSpot, x: anchor.x, y: anchor.y } : null;
  const total = spots?.length ?? 0;
  const blockCount = blocks?.length ?? 0;

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[98]" data-testid="dev-pressure-layer">
      {/* ── 가상 구역경계 (추정) — 🔥 개발압력이 켜졌을 때만 여기 마운트된다 ─────────
          · 주황 점선 테두리 + 반투명 산호색 채움. 실제 추진 구역과 헷갈리지 않게 «점선»으로만.
          · 꼭짓점은 1e-6도 단위 Path 로 미리 그렸고, 이동·확대 때 그룹 transform 만 바뀐다. */}
      {blockPaths.length > 0 && (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ zIndex: 0, display: blockLayerShown ? "block" : "none", overflow: "visible" }}
          aria-hidden={false}
          data-testid="dev-block-layer"
        >
          <g ref={blockGRef}>
            {blockPaths.map(({ block, d }) => {
              const active = block.id === selId;
              return (
                <path
                  key={block.id}
                  d={d}
                  fillRule="evenodd"
                  data-testid="dev-block-polygon"
                  data-block-id={block.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelId(block.id);
                  }}
                  style={{
                    fill: active ? "rgba(249,115,22,0.30)" : "rgba(249,115,22,0.17)",
                    stroke: active ? "#ea580c" : "#f97316",
                    strokeWidth: active ? 2.8 : 2.2,
                    strokeDasharray: "6 4",
                    strokeLinejoin: "round",
                    vectorEffect: "non-scaling-stroke",
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  <title>
                    {`${block.gu} ${block.dong} 가상 구역경계 (추정) · ${formatBlockArea(block.areaM2)}`}
                  </title>
                </path>
              );
            })}
          </g>
        </svg>
      )}

      {/* 핀 — 「84점」 알약. 숫자만으로는 무엇인지 알 수 없어 단위(점)를 붙였다 */}
      {marks.map((m) => {
        const s = m.spot;
        const color = DEV_GRADE_COLOR[s.grade];
        const active = s.id === selId;
        const pin = PIN_SIZE[s.grade];
        return (
          <button
            key={s.id}
            type="button"
            data-testid="dev-pressure-pin"
            data-hotspot-id={s.id}
            data-score={s.score}
            title={`${s.gu} ${s.dong} · 개발압력 ${Math.round(s.score)}점 (${s.grade}) — 누르면 근거를 봅니다`}
            onClick={(e) => {
              e.stopPropagation();
              setSelId((v) => (v === s.id ? null : s.id));
            }}
            className="dev-pressure-pin"
            style={{
              position: "absolute",
              left: m.x,
              top: m.y,
              height: pin.height,
              minWidth: pin.height,
              padding: `0 ${pin.padX}px`,
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              border: `2px solid ${active ? "#111827" : "#fff"}`,
              background: color,
              color: "#fff",
              fontSize: pin.fontSize,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              boxShadow: active
                ? `0 0 0 4px ${color}44, 0 6px 16px -4px rgba(16,24,40,.6)`
                : `0 0 0 5px ${color}22, 0 4px 12px -4px rgba(16,24,40,.5)`,
              pointerEvents: "auto",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: active ? 3 : 1,
            }}
          >
            {Math.round(s.score)}점
          </button>
        );
      })}

      {/* 선택한 핫스팟 카드 — 핀 위쪽에 붙는다 */}
      {selected && (
        <div
          style={{
            position: "absolute",
            left: Math.max(140, Math.min(selected.x, (wrapRef.current?.clientWidth ?? 600) - 140)),
            // 카드가 위로 잘리면(핀이 화면 위쪽) 핀 아래로 뒤집어 붙인다
            ...(selected.y < 352
              ? { top: selected.y + 22, transform: "translate(-50%, 0)" }
              : { top: selected.y - 22, transform: "translate(-50%, -100%)" }),
            pointerEvents: "auto",
            zIndex: 5,
          }}
        >
          <DevPressureCard
            spot={selected.spot}
            block={selectedBlock}
            onClose={() => setSelId(null)}
            onOpenZone={onOpenZone}
            onPickJibun={onPickJibun}
          />
        </div>
      )}

      {/* 범례 */}
      <div
        data-testid="dev-pressure-legend"
        className="pointer-events-auto absolute bottom-2 left-2 z-[600] w-max max-w-[min(92vw,344px)] rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur md:bottom-auto md:left-1/2 md:top-2 md:-translate-x-1/2"
      >
        <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <b className="text-slate-900">🔥 개발압력</b>
          {spots ? (
            <span className="text-slate-600">
              <b className="font-bold text-slate-800">{total.toLocaleString()}곳</b> · 핀 숫자 = 100점 만점 압력 점수
            </span>
          ) : (
            <span className="text-slate-500">{failed ? "불러오지 못했습니다" : "불러오는 중…"}</span>
          )}
          {(onCloseLayer || failed) && (
            <button
              type="button"
              onClick={onCloseLayer ?? (() => window.location.reload())}
              className="ml-0.5 rounded px-1 text-[11px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="개발압력 끄기"
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-0.5 text-[9.5px] leading-tight text-slate-500">
          정비구역·아파트에 둘러싸인 노후 저층지 — 아파트 동·단지를 뺀 저층 건물 기준
          {level >= 8 ? " · 확대하면 더 많이 보입니다" : ""}
          {blockCount > 0 && (
            <>
              <br />
              <span className="inline-flex items-center gap-1">
                <svg width="18" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="18" y2="4" stroke="#f97316" strokeWidth="2" strokeDasharray="5 3" />
                </svg>
                <b className="font-bold text-orange-600">점선 구역경계</b> = 가상 구역경계(추정) {blockCount}곳
                {level > BLOCK_MAX_LEVEL ? " · 확대하면 보입니다" : ""}
              </span>
            </>
          )}
          <br />
          아파트 동: © OpenStreetMap contributors (ODbL) · 구역: 서울시 고시
        </div>
      </div>
    </div>
  );
}
