"use client";
// 🔥 개발압력 레이어 — 지도 위에 「주변이 정비구역·아파트로 둘러싸인 노후 저층지」 핫스팟을 얹는다.
//
//   · 데이터: public/data/dev-pressure.json (scripts/build-dev-pressure.py)
//   · 생활권: public/data/dev-pressure-areas.json (scripts/build-dev-pressure-areas.py)
//       30년↑ 저층 건물 덩어리 안쪽에 놓은 참고용 원 — 대로 회랑(도로 반폭+4m)을 비켜
//       중심을 잡았고, 반경은 그 자리에서 원이 들어가는 최대 반경(24~110m)이다.
//   · 좌표는 카카오 `map.getProjection().containerPointFromCoords()` 로 매 이동·확대마다 다시 잡는다.
//     (구역 폴리곤은 캔버스가 직접 그리지만, 점 핀·원은 DOM 이라 이 레이어가 맡는다)
//   · 멀리 보면 점수 높은 곳만 남긴다 — 서울 전체에서 540여 개 핀이 지도를 덮지 않게.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KakaoMap, KakaoSDK } from "./kakao-loader";
import {
  DEV_GRADE_COLOR,
  loadDevAreas,
  loadDevPressure,
  minScoreForLevel,
  type DevArea,
  type DevHotspot,
} from "@/lib/dev-pressure";
import DevPressureCard from "./DevPressureCard";

type Mark = {
  spot: DevHotspot;
  /** 배지 좌표 — 생활권이 있으면 그 원의 중심(대로에서 비켜 놓인 자리) */
  x: number;
  y: number;
  area?: DevArea;
  /** 생활권 원의 화면 반경(px) — 너무 작으면(멀리 보면) 원은 그리지 않는다 */
  radiusPx?: number;
};

/** 한 화면에 그릴 핀 상한 — DOM 수를 묶어 이동할 때 끊기지 않게 */
const MAX_MARKS = 64;
/** 핀 사이 최소 간격(px) — 겹치면 뒤 핀을 누를 수 없어 점수 높은 쪽만 남긴다
 *  (2026-11-22: 숫자만 찍던 원형 핀을 「84점」 알약으로 바꾸면서 폭이 늘어 26px 로 넓혔다) */
const MIN_GAP_PX = 26;
/** 생활권 원이 이보다 작게 그려지면(멀리 보면) 원 없이 배지만 — 배지에 묻혀 어수선해진다 */
const MIN_CIRCLE_PX = 12;

/** 등급별 알약 크기 — 글자가 잘리지 않게 폭은 글자에 맞춰 늘어난다(고정 height + 좌우 padding) */
const PIN_SIZE = {
  최상: { height: 24, padX: 7, fontSize: 11.5 },
  높음: { height: 22, padX: 6, fontSize: 11 },
  보통: { height: 20, padX: 5, fontSize: 10 },
} as const;

/** 카드 자리 — 배지 위에 붙이는 것이 기본. 위·아래가 다 좁으면(화면 가장자리) 옆으로 비켜
 *  범례·지도 도구를 덮지 않게 한다. 높이는 실측값(cardH)을 쓴다. */
function cardSpot(
  sel: { x: number; y: number },
  cardH: number,
  wrap: HTMLElement | null
): { left: number; top: number; transform: string } {
  const cw = wrap?.clientWidth ?? 900;
  // 아래 지도 도구(확대·축소·토글, 약 44px)를 덮지 않게 바닥 여유를 둔다
  const ch = (wrap?.clientHeight ?? 800) - 48;
  const CARD_W = 262;
  const left = Math.max(140, Math.min(sel.x, cw - 140));
  const above = sel.y - 22 - cardH;
  const below = sel.y + 22;
  if (above >= 8) return { left, top: above, transform: "translate(-50%, 0)" };
  if (below + cardH <= ch - 8) return { left, top: below, transform: "translate(-50%, 0)" };
  const right = sel.x + 26 + CARD_W / 2;
  const sideLeft = right + CARD_W / 2 < cw - 8 ? right : Math.max(140, sel.x - 26 - CARD_W / 2);
  return {
    left: Math.max(140, Math.min(sideLeft, cw - 140)),
    top: Math.max(8, Math.min(sel.y - 70, ch - 8 - cardH)),
    transform: "translate(-50%, 0)",
  };
}

/** 동심원 반지름 비율 — 바깥 테두리 · 가운데 · 안쪽 */
const RINGS = [1, 0.7, 0.42] as const;

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
  const [areas, setAreas] = useState<DevArea[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(map.getLevel());
  /** 카드 높이(px) — 배지가 화면 위쪽일 때 카드가 위로 잘리지 않게 재서 뒤집는다 */
  const [cardH, setCardH] = useState(470);
  /** 생활권 중심의 화면 좌표 — 배지가 화면 밖이어도 카드를 띄울 자리를 찾는다 */
  const centersRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const spotByIdRef = useRef<Map<string, DevHotspot>>(new Map());
  const areaByIdRef = useRef<Map<string, DevArea>>(new Map());

  for (const s of spots ?? []) spotByIdRef.current.set(s.id, s);
  for (const a of areas ?? []) areaByIdRef.current.set(a.id, a);

  useEffect(() => {
    let alive = true;
    loadDevPressure()
      .then((d) => {
        if (alive) setSpots(d.hotspots);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    // 생활권 원은 핀과 별개 파일 — 없거나 실패해도 핀은 그대로 보여 준다
    loadDevAreas()
      .then((d) => {
        if (alive) setAreas(d.areas);
      })
      .catch(() => {
        /* 생활권 원만 없는 상태로 둔다 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const coordOf = useCallback((s: DevHotspot): [number, number] => {
    const a = areaByIdRef.current.get(s.id);
    return a ? a.center : [s.lat, s.lng];
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

    // 화면 1px 이 몇 m 인지 — 생활권 반경(m)을 원의 크기(px)로 바꾼다.
    //   경도 0.001도는 위도에 따라 달라지므로 지도 중심 위도로 계산한다.
    const c0 = map.getCenter();
    const lat0 = c0.getLat();
    const q0 = proj.containerPointFromCoords(new sdk.maps.LatLng(lat0, c0.getLng()));
    const q1 = proj.containerPointFromCoords(new sdk.maps.LatLng(lat0, c0.getLng() + 0.001));
    const pxPerDeg = Math.abs(q1.x - q0.x); // 위도 lat0 에서 경도 0.001도(=약 88m)의 화면 폭
    const mPerDeg = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const pxPerM = pxPerDeg > 0 && mPerDeg > 0 ? pxPerDeg / (mPerDeg * 0.001) : 0;

    const minScore = minScoreForLevel(lv);
    const out: Mark[] = [];
    const centers = new Map<string, { x: number; y: number }>();
    for (const s of spots) {
      if (s.score < minScore) continue;
      if (s.lat < sw.getLat() - 0.002 || s.lat > ne.getLat() + 0.002) continue;
      if (s.lng < sw.getLng() - 0.002 || s.lng > ne.getLng() + 0.002) continue;
      const [lat, lng] = coordOf(s);
      const area = areaByIdRef.current.get(s.id);
      const p = proj.containerPointFromCoords(new sdk.maps.LatLng(lat, lng));
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      centers.set(s.id, { x, y });
      // 정수 픽셀에 앉힌다 — 소수점 좌표 + translate(-50%,-50%) 는 핀 숫자를 서브픽셀에서 다시 그려 흐려진다
      out.push({
        spot: s,
        x,
        y,
        area,
        radiusPx: area && pxPerM > 0 ? area.radiusM * pxPerM : undefined,
      });
    }
    centersRef.current = centers;

    out.sort((a, b2) => b2.spot.score - a.spot.score);
    // 겹침 정리 — 점수 높은 핀부터 두고, MIN_GAP_PX 안에 이미 놓인 핀이 있으면 건너뛴다
    const kept: Mark[] = [];
    for (const m of out) {
      if (kept.length >= MAX_MARKS) break;
      if (kept.some((k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_GAP_PX)) continue;
      kept.push(m);
    }
    setMarks(kept);
  }, [coordOf, map, sdk, spots]);

  // 첫 화면 패널 → 핫스팟 카드: 지도를 그 자리(생활권 중심)로 옮기고 카드를 연다(token 이 바뀔 때만)
  useEffect(() => {
    if (!focus) return;
    setSelId(focus.id);
    const s = spotByIdRef.current.get(focus.id);
    const [lat, lng] = s ? coordOf(s) : [focus.lat, focus.lng];
    try {
      if (map.getLevel() > 6) map.setLevel(5); // 500m 안팎 — 생활권과 둘러싼 구역이 함께 보이게
      map.panTo(new sdk.maps.LatLng(lat, lng));
    } catch {
      /* 지도 준비 전이면 idle 에서 다시 자리를 잡는다 */
    }
  }, [focus, map, sdk, coordOf]);

  // 생활권 원이 핀보다 늦게 도착한다 — 도착하면 그때 한 번 더 자리를 잡는다
  useEffect(() => {
    if (!spots) return;
    place();
  }, [areas, spots, place]);

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

  // 카드가 그려진 뒤 실제 높이를 재 둔다 — 위로 붙였을 때 화면 밖으로 넘치는지 판단에 쓴다
  useEffect(() => {
    if (!selId) return;
    const id = requestAnimationFrame(() => {
      const h = cardRef.current?.offsetHeight;
      if (h && Math.abs(h - cardH) > 2) setCardH(h);
    });
    return () => cancelAnimationFrame(id);
  }, [selId, cardH]);

  // 배지를 눌렀든 패널 목록에서 열었든 같은 핫스팟 카드를 연다.
  //   · 배지가 이 화면에 없을 수 있으므로(확대 배율에 따라 솎아 낸다) 스팟은 전체 목록에서 찾는다.
  const selectedMark = marks.find((m) => m.spot.id === selId) ?? null;
  const selectedSpot = selectedMark?.spot ?? (selId ? spotByIdRef.current.get(selId) ?? null : null);
  const anchor = selectedMark ?? (selectedSpot ? centersRef.current.get(selectedSpot.id) ?? null : null);
  const selected = selectedSpot && anchor ? { spot: selectedSpot, x: anchor.x, y: anchor.y } : null;
  const selectedArea = selectedSpot ? areaByIdRef.current.get(selectedSpot.id) ?? null : null;
  const total = spots?.length ?? 0;
  const areaCount = areas?.length ?? 0;
  const circlesShown = marks.some((m) => m.area && (m.radiusPx ?? 0) >= MIN_CIRCLE_PX);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[98]" data-testid="dev-pressure-layer">
      {/* ── 생활권 동심원 — 🔥 개발압력이 켜졌을 때만 여기 마운트된다 ─────────────────
          · 반투명 그라데이션 원 3겹(바깥 테두리 · 가운데 · 안쪽) + 중앙 점수 배지.
          · 대로 회랑(도로 반폭+4m)은 비켜 그렸으므로 원이 대로·교차로를 덮지 않는다.
          · 지도 드래그를 막지 않게 원 자체는 pointer-events:none — 누르는 것은 가운데 배지. */}
      {marks.map((m) => {
        const a = m.area;
        const r = m.radiusPx ?? 0;
        if (!a || r < MIN_CIRCLE_PX) return null;
        const color = DEV_GRADE_COLOR[a.grade];
        const active = a.id === selId;
        return (
          <div
            key={`area-${a.id}`}
            data-testid="dev-area-circle"
            data-area-id={a.id}
            data-radius-m={a.radiusM}
            aria-hidden
            style={{
              position: "absolute",
              left: m.x,
              top: m.y,
              width: Math.round(2 * r),
              height: Math.round(2 * r),
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle at 50% 50%, ${color}${active ? "2e" : "24"} 0%, ${color}${active ? "20" : "19"} 45%, ${color}10 76%, ${color}00 100%)`,
              border: `2px solid ${color}${active ? "e6" : "b3"}`,
              boxShadow: active
                ? `0 0 0 1px #ffffffcc, 0 0 0 5px ${color}33, 0 0 26px -6px ${color}99`
                : `0 0 0 1px #ffffffb3, 0 0 20px -8px ${color}88`,
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            {RINGS.slice(1).map((f) => (
              <span
                key={f}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: `${f * 100}%`,
                  height: `${f * 100}%`,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: `1px ${active ? "solid" : "dashed"} ${color}${active ? "99" : "80"}`,
                }}
              />
            ))}
          </div>
        );
      })}

      {/* 배지 — 「84점」 알약. 생활권이 있으면 원 한가운데 앉는다 */}
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

      {/* 선택한 핫스팟 카드 — 배지 위를 기본으로, 자리가 없으면 아래·옆으로 비켜 붙는다 */}
      {selected && (
        <div
          ref={cardRef}
          style={{
            position: "absolute",
            ...cardSpot(selected, cardH, wrapRef.current),
            pointerEvents: "auto",
            // 범례(z 600)·지도 도구보다 위 — 카드 머리말이 범례에 가리지 않게
            zIndex: 700,
          }}
        >
          <DevPressureCard
            spot={selected.spot}
            area={selectedArea}
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
              <b className="font-bold text-slate-800">{total.toLocaleString()}곳</b> · 배지 숫자 = 100점 만점 압력 점수
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
          {areaCount > 0 && (
            <>
              <br />
              <span className="inline-flex items-center gap-1">
                <svg width="16" height="16" aria-hidden>
                  <circle cx="8" cy="8" r="7" fill="rgba(249,115,22,0.16)" stroke="#f97316" strokeWidth="1.4" />
                  <circle cx="8" cy="8" r="4.4" fill="none" stroke="#fb923c" strokeWidth="0.9" strokeDasharray="2 1.6" />
                  <circle cx="8" cy="8" r="1.6" fill="#ea580c" />
                </svg>
                <b className="font-bold text-orange-600">동심원</b> = 저층 주거지 생활권(추정) {areaCount}곳 · 대로변은 비켜
                {!circlesShown ? " · 확대하면 원이 보입니다" : ""}
              </span>
            </>
          )}
          <br />
          아파트 동·대로: © OpenStreetMap contributors (ODbL) · 구역: 서울시 고시
        </div>
      </div>
    </div>
  );
}
