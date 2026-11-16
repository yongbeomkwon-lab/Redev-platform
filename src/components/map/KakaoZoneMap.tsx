"use client";
// ─────────────────────────────────────────────────────────────────────────────
// KakaoZoneMap — 카카오맵 JavaScript SDK 위에 서울시 정비구역 **전수** 경계를 그리는 지도
//
// ▶ 왜 카카오맵인가 (사용자 요청)
//    · 지하철 **출구 번호**·건물명·지번이 카카오 기본지도에 원래 나온다(우리가 그리지 않아도 된다)
//    · **스카이뷰(위성+라벨, HYBRID)** 로 구역의 실제 모습을 바로 볼 수 있다
//    · **지적편집도(USE_DISTRICT)** 오버레이 — 필지 경계·지번이 재개발 상담의 기본 자료다
//
// ▶ 1,824구역을 어떻게 60fps로 그리나
//    · 카카오 Polygon 객체 1,800개는 SVG라서 이동할 때마다 무너진다 → **HTML5 canvas 한 장**.
//    · 그 canvas 를 `kakao.maps.CustomOverlay` 로 지도에 매단다. CustomOverlay 는 마커처럼
//      지도와 함께 움직이므로, 드래그하는 동안 다시 그리지 않아도 폴리곤이 타일과 정확히 붙어 있다.
//      (매 프레임 36,000여 점을 다시 투영하면 그때서야 끊긴다 — 그래서 'idle'에서만 다시 그린다)
//    · 좌표 변환은 Web Mercator 로 직접 계산한다. 카카오 projection 호출은 기준점 2~3회만 하고,
//      나머지는 Float64Array 를 훑는 산술이라 1,800구역 재투영이 수 ms 에 끝난다.
//    · 스타일이 같은 구역은 Path2D 한 겹으로 모아 fill/stroke 한다(색·투명도별 배치).
//
// ▶ 상호작용
//    · 호버: 경위도 → 바운딩박스 → 광선교차 판정으로 즉시 툴팁(구역명·유형·단계·면적)
//    · 클릭: 같은 판정으로 구역 선택(겹치면 안쪽의 작은 구역)
//    · 선택: 이름표 CustomOverlay + panTo(경계에 맞춰 부드럽게 이동)
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS, zoneStyle } from "./colors";
import { hitTestZones, prepareZones, type PreparedZones } from "./prepare-zones";
import { SEOUL_BOUNDS, type KakaoZoneMapProps, type MapFailReason } from "./props";
import type { KakaoCustomOverlay, KakaoLatLng, KakaoMap, KakaoMouseEvent, KakaoSDK } from "./kakao-loader";

/** 카카오 레벨(1=최대 확대, 14=최대 축소)을 Leaflet 줌(클수록 확대)처럼 다루기 위한 기준값 */
const ZOOM_BASE = 20;
const MIN_LEVEL = 4;
const MAX_LEVEL = 13;

type View = {
  p0x: number;
  p0y: number;
  cLat: number;
  cLng: number;
  pxPerMerc: number;
  pxPerLng: number;
  m0: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
};

type Batch = {
  color: string;
  weight: number;
  strokeOpacity: number;
  fillOpacity: number;
  dash: number[] | null;
  path: Path2D;
};

const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * (Math.PI / 180)) / 2));

/** #rrggbb + 알파 → rgba() 문자열 (캔버스 fillStyle/strokeStyle) */
const rgbaCache = new Map<string, string>();
function rgba(hex: string, alpha: number): string {
  const key = `${hex}|${alpha}`;
  const cached = rgbaCache.get(key);
  if (cached) return cached;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  let out = hex;
  if (m) {
    const n = parseInt(m[1], 16);
    out = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  rgbaCache.set(key, out);
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** 툴팁 한 줄: 신림1구역 · 재정비촉진구역 · 사업시행인가 · 22.3만㎡ (관악구) */
function labelLine(z: { name: string; kind: string; stage: string; area: number; gu?: string }) {
  const area = z.area >= 10000 ? `${(z.area / 10000).toFixed(1)}만㎡` : `${z.area.toLocaleString()}㎡`;
  return `${z.name} · ${z.kind} · ${z.stage} · ${area}${z.gu ? ` (${z.gu})` : ""}`;
}

export default function KakaoZoneMap({
  zones,
  seoulZones,
  selectedZoneId,
  onSelectZone,
  showCompleted = false,
  onToggleCompleted,
  completedCount = 0,
  onFail,
}: KakaoZoneMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const sdkRef = useRef<KakaoSDK | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<KakaoCustomOverlay | null>(null);
  const labelRef = useRef<KakaoCustomOverlay | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const bufRef = useRef<Float32Array>(new Float32Array(4096));
  const viewRef = useRef<View | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | undefined>(selectedZoneId);
  const moveRafRef = useRef(0);
  const onSelectRef = useRef(onSelectZone);
  onSelectRef.current = onSelectZone;

  const prep = useMemo<PreparedZones>(() => prepareZones(seoulZones), [seoulZones]);
  const prepRef = useRef<PreparedZones>(prep);

  const [skyview, setSkyview] = useState(false);
  const [district, setDistrict] = useState(false);
  const [ready, setReady] = useState(false);

  // ── 그리기 ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const el = mapElRef.current;
    if (!k || !map || !canvas || !overlay || !el) return;

    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw < 20 || ch < 20) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 화면의 2배 크기로 그려 두면 드래그 중 화면 절반까지는 다시 그리지 않아도 덮인다
    const W = Math.round(cw * 2);
    const H = Math.round(ch * 2);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const proj = map.getProjection();
    const center = map.getCenter();
    const cLat = center.getLat();
    const cLng = center.getLng();
    const p0 = proj.containerPointFromCoords(center);
    const probe = 0.002;
    const pLat = proj.containerPointFromCoords(new k.maps.LatLng(cLat + probe, cLng));
    const pLng = proj.containerPointFromCoords(new k.maps.LatLng(cLat, cLng + probe));
    const m0 = mercator(cLat);
    const pxPerMerc = (pLat.y - p0.y) / (mercator(cLat + probe) - m0);
    const pxPerLng = (pLng.x - p0.x) / probe;

    const ox = cw / 2 - W / 2;
    const oy = ch / 2 - H / 2;
    // 캔버스 왼쪽 위를 경위도에 매단다 → 지도를 끄는 동안 캔버스가 타일과 함께 움직인다
    overlay.setPosition(proj.coordsFromContainerPoint(new k.maps.Point(ox, oy)));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const zoomProxy = ZOOM_BASE - map.getLevel();
    viewRef.current = { p0x: p0.x, p0y: p0.y, cLat, cLng, pxPerMerc, pxPerLng, m0, ox, oy, W, H };

    // 캔버스가 덮는 지리 범위 — 밖의 구역은 그리지 않는다
    const tl = proj.coordsFromContainerPoint(new k.maps.Point(ox, oy));
    const br = proj.coordsFromContainerPoint(new k.maps.Point(ox + W, oy + H));
    const vMinLat = Math.min(tl.getLat(), br.getLat()) - 0.0005;
    const vMaxLat = Math.max(tl.getLat(), br.getLat()) + 0.0005;
    const vMinLng = Math.min(tl.getLng(), br.getLng()) - 0.0005;
    const vMaxLng = Math.max(tl.getLng(), br.getLng()) + 0.0005;

    const data = prepRef.current;
    const selId = selectedRef.current;
    const hoverId = hoverRef.current;

    const batches = new Map<string, Batch>();
    const activePaths: { path: Path2D; color: string; weight: number; fillOpacity: number }[] = [];

    let buf = bufRef.current;

    const project = (lat: number, lng: number): [number, number] => [
      p0.x + (lng - cLng) * pxPerLng - ox,
      p0.y + (mercator(lat) - m0) * pxPerMerc - oy,
    ];

    for (const pz of data.zones) {
      if (pz.maxLat < vMinLat || pz.minLat > vMaxLat || pz.maxLng < vMinLng || pz.minLng > vMaxLng) continue;

      const z = pz.zone;
      const isSel = z.id === selId;
      const isHover = !isSel && z.id === hoverId;
      const st = zoneStyle(z.type, isSel || isHover, z.featured, zoomProxy, pz.completed);
      const dash = pz.completed ? [4, 3] : null;

      let batch: Batch | undefined;
      let activePath: Path2D | null = null;
      if (isSel || isHover) {
        activePath = new Path2D();
      } else {
        const key = `${st.color}|${st.fillColor}|${st.weight}|${st.opacity}|${st.fillOpacity}|${dash ? "d" : "-"}`;
        batch = batches.get(key);
        if (!batch) {
          batch = {
            color: st.color,
            weight: st.weight,
            strokeOpacity: st.opacity,
            fillOpacity: st.fillOpacity,
            dash,
            path: new Path2D(),
          };
          batches.set(key, batch);
        }
      }
      const target = activePath ?? batch!.path;

      for (const ring of pz.rings) {
        const n = ring.pts.length / 2;
        if (n < 3) continue;
        if (buf.length < ring.pts.length) {
          buf = new Float32Array(ring.pts.length);
          bufRef.current = buf;
        }
        let sMinX = Infinity;
        let sMaxX = -Infinity;
        let sMinY = Infinity;
        let sMaxY = -Infinity;
        for (let i = 0; i < n; i++) {
          const lat = ring.pts[i * 2];
          const lng = ring.pts[i * 2 + 1];
          const x = p0.x + (lng - cLng) * pxPerLng - ox;
          const y = p0.y + (mercator(lat) - m0) * pxPerMerc - oy;
          buf[i * 2] = x;
          buf[i * 2 + 1] = y;
          if (x < sMinX) sMinX = x;
          if (x > sMaxX) sMaxX = x;
          if (y < sMinY) sMinY = y;
          if (y > sMaxY) sMaxY = y;
        }
        if (sMaxX < -8 || sMinX > W + 8 || sMaxY < -8 || sMinY > H + 8) continue;
        target.moveTo(buf[0], buf[1]);
        for (let i = 1; i < n; i++) target.lineTo(buf[i * 2], buf[i * 2 + 1]);
        target.closePath();
      }

      if (activePath) {
        activePaths.push({ path: activePath, color: st.color, weight: st.weight, fillOpacity: st.fillOpacity });
      }
    }

    // 1) 일반 구역 — 스타일별로 한 번에 채우고 긋는다
    for (const b of batches.values()) {
      ctx.fillStyle = rgba(b.color, b.fillOpacity);
      ctx.fill(b.path);
      ctx.setLineDash(b.dash ?? []);
      ctx.strokeStyle = rgba(b.color, b.strokeOpacity);
      ctx.lineWidth = b.weight;
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);

    // 2) 호버·선택 구역은 위에 한 번 더 — 눈에 띄게
    for (const a of activePaths) {
      ctx.fillStyle = rgba(a.color, a.fillOpacity);
      ctx.fill(a.path);
      ctx.strokeStyle = rgba(a.color, 1);
      ctx.lineWidth = a.weight;
      ctx.stroke(a.path);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, a.weight - 2);
      ctx.stroke(a.path);
    }

    // 3) 구역계 미고시 후보지(예: 사당21구역) — 점선 원 + 흰 점
    for (const z of data.points) {
      const [x, y] = project(z.center[0], z.center[1]);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const isSel = z.id === selId;
      const isHover = !isSel && z.id === hoverId;
      const color = TYPE_COLORS[z.type] ?? "#7c3aed";
      ctx.beginPath();
      ctx.arc(x, y, isSel ? 13 : isHover ? 11 : 9, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]);
      ctx.fillStyle = rgba(color, isSel ? 0.5 : 0.28);
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    setReady(true);
  }, []);

  // ── 지도 생성 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapElRef.current;
    const k = (window as unknown as { kakao?: KakaoSDK }).kakao;
    if (!el || !k?.maps?.Map) {
      onFail?.("init-error");
      return;
    }
    sdkRef.current = k;

    let map: KakaoMap;
    try {
      map = new k.maps.Map(el, {
        center: new k.maps.LatLng((SEOUL_BOUNDS[0][0] + SEOUL_BOUNDS[1][0]) / 2, (SEOUL_BOUNDS[0][1] + SEOUL_BOUNDS[1][1]) / 2),
        level: 9,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        keyboardShortcuts: true,
      });
    } catch (e) {
      onFail?.("init-error", e instanceof Error ? e.message : String(e));
      return;
    }
    mapRef.current = map;
    map.setMinLevel(1);
    map.setMaxLevel(MAX_LEVEL);

    // 캔버스 오버레이 — 지도와 함께 움직이는 폴리곤 판
    const canvas = document.createElement("canvas");
    canvas.className = "kakao-zone-canvas";
    canvas.style.pointerEvents = "none";
    canvas.style.display = "block";
    canvasRef.current = canvas;
    const overlay = new k.maps.CustomOverlay({
      content: canvas,
      position: new k.maps.LatLng(37.5665, 126.978),
      xAnchor: 0,
      yAnchor: 0,
      zIndex: 20,
      clickable: false,
    });
    overlay.setMap(map);
    overlayRef.current = overlay;
    // CustomOverlay 래퍼가 클릭을 가로채지 않도록
    const wrapEl = canvas.parentElement;
    if (wrapEl) wrapEl.style.pointerEvents = "none";

    // 초기 화면: 서울시 전체
    const seoulBounds = new k.maps.LatLngBounds(
      new k.maps.LatLng(SEOUL_BOUNDS[0][0], SEOUL_BOUNDS[0][1]),
      new k.maps.LatLng(SEOUL_BOUNDS[1][0], SEOUL_BOUNDS[1][1])
    );
    map.setBounds(seoulBounds, 8);

    // ── 이벤트 ────────────────────────────────────────────────────────────────
    const onIdle = () => draw();
    k.maps.event.addListener(map, "idle", onIdle);
    k.maps.event.addListener(map, "zoom_changed", onIdle);

    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.display = "none";
      if (el) el.style.cursor = "";
    };

    const onMousemove = (e: KakaoMouseEvent) => {
      if (moveRafRef.current) return;
      const lat = e.latLng.getLat();
      const lng = e.latLng.getLng();
      const point = e.point;
      moveRafRef.current = window.requestAnimationFrame(() => {
        moveRafRef.current = 0;
        const view = viewRef.current;
        const data = prepRef.current;
        let hit: SeoulZone | undefined = hitTestZones(data, lat, lng);
        // 점으로 표시한 후보지 — 화면 반경 13px 안이면 잡는다
        if (!hit && view && point) {
          let bestD = 13 * 13;
          for (const z of data.points) {
            const x = view.p0x + (z.center[1] - view.cLng) * view.pxPerLng - view.ox;
            const y = view.p0y + (mercator(z.center[0]) - view.m0) * view.pxPerMerc - view.oy;
            const px = point.x - x;
            const py = point.y - y;
            const d = px * px + py * py;
            if (d < bestD) {
              bestD = d;
              hit = z;
            }
          }
        }

        const tip = tipRef.current;
        if (!hit) {
          if (hoverRef.current !== null) {
            hoverRef.current = null;
            draw();
          }
          hideTip();
          return;
        }

        if (hoverRef.current !== hit.id) {
          hoverRef.current = hit.id;
          draw();
        }
        if (tip) {
          tip.innerHTML = escapeHtml(labelLine(hit));
          tip.style.display = "block";
          const rect = el.getBoundingClientRect();
          const x = point ? point.x : 0;
          const y = point ? point.y : 0;
          const tw = tip.offsetWidth || 220;
          const left = Math.max(6, Math.min(x + 14, rect.width - tw - 8));
          tip.style.left = `${left}px`;
          tip.style.top = `${Math.max(6, y - 34)}px`;
        }
        el.style.cursor = "pointer";
      });
    };

    const onClick = (e: KakaoMouseEvent) => {
      const lat = e.latLng.getLat();
      const lng = e.latLng.getLng();
      const data = prepRef.current;
      let hit: SeoulZone | undefined = hitTestZones(data, lat, lng);
      if (!hit && viewRef.current) {
        const view = viewRef.current;
        const pt = e.point;
        if (pt) {
          let bestD = 13 * 13;
          for (const z of data.points) {
            const x = view.p0x + (z.center[1] - view.cLng) * view.pxPerLng - view.ox;
            const y = view.p0y + (mercator(z.center[0]) - view.m0) * view.pxPerMerc - view.oy;
            const d = (pt.x - x) * (pt.x - x) + (pt.y - y) * (pt.y - y);
            if (d < bestD) {
              bestD = d;
              hit = z;
            }
          }
        }
      }
      if (hit) {
        hideTip();
        onSelectRef.current(hit.id);
      }
    };

    const onDragStart = () => hideTip();

    k.maps.event.addListener(map, "mousemove", onMousemove);
    k.maps.event.addListener(map, "click", onClick);
    k.maps.event.addListener(map, "dragstart", onDragStart);

    // 크기 변경(레이아웃) 대응
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        map.relayout();
        draw();
      });
      ro.observe(el);
    }

    const raf = window.requestAnimationFrame(() => draw());

    return () => {
      window.cancelAnimationFrame(raf);
      if (moveRafRef.current) window.cancelAnimationFrame(moveRafRef.current);
      ro?.disconnect();
      k.maps.event.removeListener(map, "idle", onIdle);
      k.maps.event.removeListener(map, "zoom_changed", onIdle);
      k.maps.event.removeListener(map, "mousemove", onMousemove);
      k.maps.event.removeListener(map, "click", onClick);
      k.maps.event.removeListener(map, "dragstart", onDragStart);
      labelRef.current?.setMap(null);
      labelRef.current = null;
      overlay.setMap(null);
      overlayRef.current = null;
      mapRef.current = null;
      canvasRef.current = null;
    };
  }, [draw, onFail]);

  // ── 데이터·선택 변경 → 다시 그리기 ──────────────────────────────────────────
  useEffect(() => {
    prepRef.current = prep;
    draw();
  }, [prep, draw]);

  useEffect(() => {
    selectedRef.current = selectedZoneId;
    if (hoverRef.current && hoverRef.current === selectedZoneId) hoverRef.current = null;
    draw();
  }, [selectedZoneId, draw]);

  // ── 선택 구역 이름표 + 부드러운 이동 ────────────────────────────────────────
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !selectedZoneId) {
      labelRef.current?.setMap(null);
      labelRef.current = null;
      return;
    }
    const seoul = seoulZones.find((z) => z.id === selectedZoneId);
    const featured = zones.find((z) => z.id === selectedZoneId);
    const name = seoul?.name ?? featured?.name;
    if (!name) return;
    const alias = seoul?.alias ?? [];
    const parcel = alias.find((a) => /\d+-\d+/.test(a));
    const lat = seoul ? seoul.center[0] : featured?.polygon?.[0]?.[0] ?? 37.5665;
    const lng = seoul ? seoul.center[1] : featured?.polygon?.[0]?.[1] ?? 126.978;

    labelRef.current?.setMap(null);
    const labelEl = document.createElement("div");
    labelEl.className = "zone-name-label";
    labelEl.innerHTML = `<b>${escapeHtml(name)}</b>${
      parcel ? `<span class="zone-name-sub"> · ${escapeHtml(parcel)}</span>` : ""
    }`;
    const label = new k.maps.CustomOverlay({
      content: labelEl,
      position: new k.maps.LatLng(lat, lng),
      xAnchor: 0.5,
      yAnchor: 1.4,
      zIndex: 30,
      clickable: false,
    });
    label.setMap(map);
    if (labelEl.parentElement) labelEl.parentElement.style.pointerEvents = "none";
    labelRef.current = label;

    // 경계가 있으면 경계에 맞춰, 후보지는 점으로 이동
    if (seoul?.polygon && seoul.polygon.length >= 3) {
      fitBounds(k, map, seoul, mapElRef.current);
    } else if (seoul) {
      map.jump(new k.maps.LatLng(seoul.center[0], seoul.center[1]), 5, { animate: { duration: 350 } });
    }
  }, [selectedZoneId, seoulZones, zones]);

  // ── 지도 타입 토글 ──────────────────────────────────────────────────────────
  const toggleSkyview = useCallback(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    const next = !skyview;
    // HYBRID = 스카이뷰 + 도로·지명 라벨 (지번·건물명이 함께 보인다)
    map.setMapTypeId(next ? k.maps.MapTypeId.HYBRID : k.maps.MapTypeId.ROADMAP);
    setSkyview(next);
  }, [skyview]);

  const toggleDistrict = useCallback(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    const next = !district;
    if (next) map.addOverlayMapTypeId(k.maps.MapTypeId.USE_DISTRICT);
    else map.removeOverlayMapTypeId(k.maps.MapTypeId.USE_DISTRICT);
    setDistrict(next);
  }, [district]);

  const zoomBy = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const level = Math.max(1, Math.min(MAX_LEVEL, map.getLevel() + delta));
    map.setLevel(level, { animate: { duration: 250 } });
  }, []);

  return (
    <div ref={wrapRef} className="kakao-map-wrap relative h-full w-full">
      <div ref={mapElRef} className="h-full w-full" style={{ borderRadius: "0.75rem" }} />

      {/* 호버 툴팁 */}
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-[700] hidden max-w-[280px] rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
        style={{ display: "none" }}
      />

      {/* 지도 위 토글 — 확대/축소 · 스카이뷰 · 지적편집도 · 준공 포함 */}
      <div className="absolute right-3 top-3 z-[600] flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white/95 p-0.5 shadow-md">
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            title="확대"
            className="h-7 w-7 rounded text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            title="축소"
            className="h-7 w-7 rounded text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            −
          </button>
        </div>
        <button
          type="button"
          onClick={toggleSkyview}
          aria-pressed={skyview}
          title="스카이뷰(위성 항공사진 + 도로·지명 라벨)로 보기"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
            skyview ? "border-sky-400 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-700 hover:text-slate-900"
          }`}
        >
          <span aria-hidden>🛰</span>
          스카이뷰
        </button>
        <button
          type="button"
          onClick={toggleDistrict}
          aria-pressed={district}
          title="지적편집도 — 필지 경계·지번을 겹쳐 보기 (참고용)"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
            district ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-700 hover:text-slate-900"
          }`}
        >
          <span aria-hidden>📐</span>
          지적편집도
        </button>
        {onToggleCompleted && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={showCompleted}
            title="준공·입주까지 끝난 구역도 지도에 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
              showCompleted ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            <span aria-hidden>{showCompleted ? "👁" : "🏁"}</span>
            준공 포함
            {completedCount > 0 && <span className="font-normal text-slate-400">{completedCount}</span>}
          </button>
        )}
      </div>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
          지도를 불러오는 중…
        </div>
      )}
    </div>
  );
}

/**
 * 선택 구역의 경계에 맞춰 부드럽게 이동한다.
 *  · 카카오 panTo(bounds) 는 아주 작은 구역에서 과도하게 확대되므로, 화면 대비 배율을 직접 계산해
 *    레벨을 정하고 jump(center, level, animate) 로 움직인다.
 */
function fitBounds(k: KakaoSDK, map: KakaoMap, zone: SeoulZone, container: HTMLElement | null) {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  const rings = [zone.polygon, ...(zone.parts ?? [])];
  for (const ring of rings) {
    if (!ring) continue;
    for (const [lat, lng] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (!Number.isFinite(minLat) || minLat > maxLat) return;

  const proj = map.getProjection();
  const sw = proj.containerPointFromCoords(new k.maps.LatLng(minLat, minLng));
  const ne = proj.containerPointFromCoords(new k.maps.LatLng(maxLat, maxLng));
  const cw = container?.clientWidth ?? 520;
  const ch = container?.clientHeight ?? 480;
  const pad = Math.min(cw, ch) * 0.12 + 20;
  const wPx = Math.max(Math.abs(ne.x - sw.x), 0.5);
  const hPx = Math.max(Math.abs(ne.y - sw.y), 0.5);
  const fit = Math.min((cw - pad * 2) / wPx, (ch - pad * 2) / hPx);
  const step = Math.floor(Math.log2(Math.max(fit, 0.01)));
  const level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, map.getLevel() - step));
  map.jump(new k.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2), level, {
    animate: { duration: 350 },
  });
}
