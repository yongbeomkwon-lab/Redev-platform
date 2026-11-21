"use client";
// 🔥 개발압력 레이어 — 지도 위에 「주변이 정비구역·아파트로 둘러싸인 노후 저층지」 핫스팟을 얹는다.
//
//   · 데이터: public/data/dev-pressure.json (scripts/build-dev-pressure.py)
//   · 좌표는 카카오 `map.getProjection().containerPointFromCoords()` 로 매 이동·확대마다 다시 잡는다.
//     (구역 폴리곤은 캔버스가 직접 그리지만, 점 핀은 DOM 이 눌러야 해서 이 레이어가 맡는다)
//   · 멀리 보면 점수 높은 곳만 남긴다 — 서울 전체에서 553개 핀이 지도를 덮지 않게.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KakaoMap, KakaoSDK } from "./kakao-loader";
import { DEV_GRADE_COLOR, loadDevPressure, minScoreForLevel, type DevHotspot } from "@/lib/dev-pressure";
import DevPressureCard from "./DevPressureCard";

type Mark = { spot: DevHotspot; x: number; y: number };

/** 한 화면에 그릴 핀 상한 — DOM 수를 묶어 이동할 때 끊기지 않게 */
const MAX_MARKS = 140;

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
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(map.getLevel());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  useEffect(() => {
    let alive = true;
    loadDevPressure()
      .then((d) => {
        if (alive) setSpots(d.hotspots);
      })
      .catch(() => {
        if (alive) setFailed(true);
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
      out.push({ spot: s, x: p.x, y: p.y });
    }
    out.sort((a, b2) => b2.spot.score - a.spot.score);
    setMarks(out.slice(0, MAX_MARKS));
  }, [map, sdk, spots]);

  // 첫 화면 패널 → 핫스팟 카드: 지도를 그 자리로 옮기고 카드를 연다(token 이 바뀔 때만)
  useEffect(() => {
    if (!focus) return;
    setSelId(focus.id);
    try {
      if (map.getLevel() > 5) map.setLevel(4);
      map.panTo(new sdk.maps.LatLng(focus.lat, focus.lng));
    } catch {
      /* 지도 준비 전이면 idle 에서 다시 자리를 잡는다 */
    }
  }, [focus, map, sdk]);

  useEffect(() => {
    if (!spots) return;
    place();
    const handler = () => place();
    sdk.maps.event.addListener(map, "idle", handler);
    sdk.maps.event.addListener(map, "zoom_changed", handler);
    sdk.maps.event.addListener(map, "center_changed", handler);
    window.addEventListener("resize", handler);
    return () => {
      sdk.maps.event.removeListener(map, "idle", handler);
      sdk.maps.event.removeListener(map, "zoom_changed", handler);
      sdk.maps.event.removeListener(map, "center_changed", handler);
      window.removeEventListener("resize", handler);
    };
  }, [map, place, sdk, spots]);

  const selected = marks.find((m) => m.spot.id === selId) ?? null;
  const total = spots?.length ?? 0;

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[98]" data-testid="dev-pressure-layer">
      {/* 핀 — 동그란 글로우 + 점수 */}
      {marks.map((m) => {
        const s = m.spot;
        const color = DEV_GRADE_COLOR[s.grade];
        const active = s.id === selId;
        const size = s.grade === "최상" ? 34 : s.grade === "높음" ? 30 : 26;
        return (
          <button
            key={s.id}
            type="button"
            data-testid="dev-pressure-pin"
            data-hotspot-id={s.id}
            data-score={s.score}
            title={`${s.gu} ${s.dong} · 개발압력 ${Math.round(s.score)} (${s.grade}) — 누르면 근거를 봅니다`}
            onClick={(e) => {
              e.stopPropagation();
              setSelId((v) => (v === s.id ? null : s.id));
            }}
            className="dev-pressure-pin"
            style={{
              position: "absolute",
              left: m.x,
              top: m.y,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              border: `2px solid ${active ? "#111827" : "#fff"}`,
              background: color,
              color: "#fff",
              fontSize: s.grade === "최상" ? 11.5 : 10.5,
              fontWeight: 800,
              lineHeight: 1,
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
            {Math.round(s.score)}
          </button>
        );
      })}

      {/* 선택한 핫스팟 카드 — 핀 위쪽에 붙는다 */}
      {selected && (
        <div
          style={{
            position: "absolute",
            left: Math.max(140, Math.min(selected.x, (wrapRef.current?.clientWidth ?? 600) - 140)),
            top: selected.y - 22,
            transform: "translate(-50%, -100%)",
            pointerEvents: "auto",
            zIndex: 5,
          }}
        >
          <DevPressureCard
            spot={selected.spot}
            onClose={() => setSelId(null)}
            onOpenZone={onOpenZone}
            onPickJibun={onPickJibun}
          />
        </div>
      )}

      {/* 범례 */}
      <div
        data-testid="dev-pressure-legend"
        className="pointer-events-auto absolute left-2 top-2 z-[600] w-max max-w-[min(92vw,300px)] rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
      >
        <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <b className="text-slate-900">🔥 개발압력</b>
          {spots ? (
            <span className="text-slate-500">{total.toLocaleString()}곳 · 굵은 핀일수록 높음</span>
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
          주변이 정비구역·아파트로 둘러싸인 노후 저층지 — 점수 = 포위 45 · 노후 25 · 아파트 20 · 역세권 10
          {level >= 8 ? " · 확대하면 더 많이 보입니다" : ""}
        </div>
      </div>
    </div>
  );
}
