"use client";
// ─────────────────────────────────────────────────────────────────────────────
// SubwayLayer — 수도권 지하철 노선·역명 레이어 (지도 위 캔버스 한 겹)
//
// ▶ 데이터 (public/data/ — `python3 scripts/build-subway-dataset.py` 로 생성)
//    · subway-lines.geojson : 노선별 폴리라인 (공식 노선색)
//    · subway-stations.json : 역 좌표·역명·소속 노선
//    원천: OpenStreetMap route 관계(ODbL) — 출처는 지도 하단에 표기한다.
//
// ▶ 왜 Leaflet 마커/폴리라인이 아니라 캔버스인가
//    · 역 590여 곳에 DOM 마커+툴팁을 붙이면 이동할 때 프레임이 떨어진다.
//    · 별도 pane(pointerEvents:none)에 캔버스 한 장을 그리면 구역 클릭을
//      절대 가로채지 않으면서(중요!) 줌·이동에도 매끄럽다.
//    · 역명 라벨은 겹침 회피(사각형 충돌 검사)를 직접 처리해 읽기 좋게 배치한다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

type LineData = {
  id: string;
  name: string;
  badge: string;
  color: string;
  /** [[lat, lng], ...] 구간들 */
  segs: [number, number][][];
  bbox: [number, number, number, number]; // minLat, minLng, maxLat, maxLng
};

type Station = {
  name: string;
  lat: number;
  lng: number;
  lines: string[];
  transfer: boolean;
};

type SubwayData = { lines: LineData[]; stations: Station[]; colors: Record<string, string> };

let cache: Promise<SubwayData> | null = null;

/** 노선·역 데이터는 한 번만 받아 모듈 캐시에 둔다(지도 재마운트 시 재요청 없음). */
function loadSubwayData(): Promise<SubwayData> {
  if (cache) return cache;
  cache = (async () => {
    const [lineRes, stationRes] = await Promise.all([
      fetch("/data/subway-lines.geojson"),
      fetch("/data/subway-stations.json"),
    ]);
    if (!lineRes.ok || !stationRes.ok) throw new Error("지하철 데이터를 불러오지 못했습니다");
    const geojson = await lineRes.json();
    const stations: Station[] = await stationRes.json();

    const colors: Record<string, string> = {};
    const lines: LineData[] = (geojson.features ?? []).map(
      (f: { properties: { id: string; name: string; badge: string; color: string }; geometry: { coordinates: number[][][] } }) => {
        const segs: [number, number][][] = f.geometry.coordinates.map((seg) => seg.map(([lng, lat]) => [lat, lng] as [number, number]));
        let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
        for (const seg of segs)
          for (const [lat, lng] of seg) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
        colors[f.properties.id] = f.properties.color;
        return { ...f.properties, segs, bbox: [minLat, minLng, maxLat, maxLng] as [number, number, number, number] };
      }
    );
    return { lines, stations, colors };
  })();
  return cache;
}

const FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

function stationLabel(name: string) {
  return name.endsWith("역") ? name : `${name}역`;
}

/** 밝은 노선색(9호선·우이신설 등)은 흰 글자가 안 읽혀서 글자색을 뒤집는다 */
function readableOn(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? "#1f2937" : "#ffffff";
}

/** 흰 테두리를 두른 글자 — 어떤 지도 타일 위에서도 읽힌다 */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontPx: number, weight = 700) {
  ctx.font = `${weight} ${fontPx}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(3, fontPx * 0.42);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#0f172a";
  ctx.fillText(text, x, y);
}

/** 환승역 노선 배지(1·2·신분당…) — 노선명이 아니라 역명 옆에 붙는 작은 칩 */
function drawChips(
  ctx: CanvasRenderingContext2D,
  chips: { label: string; color: string }[],
  x: number,
  cy: number,
  fontPx: number
) {
  const chipFont = Math.max(8, fontPx - 2.5);
  const h = fontPx + 1;
  const r = 3;
  let cx = x;
  ctx.font = `800 ${chipFont}px ${FONT}`;
  ctx.textBaseline = "middle";
  for (const chip of chips) {
    const w = Math.max(h, ctx.measureText(chip.label).width + 6);
    ctx.beginPath();
    ctx.moveTo(cx + r, cy - h / 2);
    ctx.arcTo(cx + w, cy - h / 2, cx + w, cy + h / 2, r);
    ctx.arcTo(cx + w, cy + h / 2, cx, cy + h / 2, r);
    ctx.arcTo(cx, cy + h / 2, cx, cy - h / 2, r);
    ctx.arcTo(cx, cy - h / 2, cx + w, cy - h / 2, r);
    ctx.closePath();
    ctx.fillStyle = chip.color;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();
    ctx.fillStyle = readableOn(chip.color);
    ctx.fillText(chip.label, cx + (w - ctx.measureText(chip.label).width) / 2, cy + 0.5);
    cx += w + 2.5;
  }
  return cx - x; // 전체 폭
}

export default function SubwayLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const dataRef = useRef<SubwayData | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;
    let pane: HTMLElement | null = null;
    let frame = 0;

    const draw = () => {
      const data = dataRef.current;
      if (!canvas || !data || !map.getContainer()) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const size = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      if (canvas.width !== Math.round(size.x * dpr) || canvas.height !== Math.round(size.y * dpr)) {
        canvas.width = Math.round(size.x * dpr);
        canvas.height = Math.round(size.y * dpr);
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = map.getZoom();
      const view = map.getBounds().pad(0.15);
      const originX = topLeft.x;
      const originY = topLeft.y;
      const toXY = (lat: number, lng: number) => {
        const p = map.latLngToLayerPoint(L.latLng(lat, lng));
        return [p.x - originX, p.y - originY] as [number, number];
      };

      // ── 1) 노선 (흰 테두리 → 색선) ─────────────────────────────
      const weight = zoom >= 15 ? 5.5 : zoom >= 13 ? 4 : zoom >= 11 ? 2.8 : 2.2;
      const casingWidth = weight + (zoom >= 13 ? 3 : 2.2);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (const casing of [true, false]) {
        for (const line of data.lines) {
          const [minLat, minLng, maxLat, maxLng] = line.bbox;
          if (view.getNorth() < minLat || view.getSouth() > maxLat || view.getEast() < minLng || view.getWest() > maxLng) continue;
          ctx.beginPath();
          for (const seg of line.segs) {
            let started = false;
            for (const [lat, lng] of seg) {
              if (lat < view.getSouth() - 0.02 || lat > view.getNorth() + 0.02 || lng < view.getWest() - 0.02 || lng > view.getEast() + 0.02) {
                started = false;
                continue;
              }
              const [x, y] = toXY(lat, lng);
              if (!started) {
                ctx.moveTo(x, y);
                started = true;
              } else {
                ctx.lineTo(x, y);
              }
            }
          }
          if (casing) {
            ctx.strokeStyle = "rgba(255,255,255,0.92)";
            ctx.lineWidth = casingWidth;
          } else {
            ctx.strokeStyle = line.color;
            ctx.lineWidth = weight;
          }
          ctx.stroke();
        }
      }

      // ── 2) 역 마커 + 역명 ──────────────────────────────────────
      if (zoom < 12) return;

      const showAllLabels = zoom >= 13.5;
      const radius = zoom >= 15 ? 5 : zoom >= 13.5 ? 4.2 : 3.4;
      const fontPx = zoom >= 15 ? 12.5 : zoom >= 13.5 ? 11.5 : 11;
      const visible = data.stations.filter(
        (s) =>
          s.lat >= view.getSouth() && s.lat <= view.getNorth() && s.lng >= view.getWest() && s.lng <= view.getEast()
      );
      // 환승역·노선 많은 역부터 배치(라벨 충돌 시 우선권)
      visible.sort((a, b) => Number(b.transfer) - Number(a.transfer) || b.lines.length - a.lines.length);

      type Rect = { x: number; y: number; w: number; h: number };
      const placed: Rect[] = [];
      const hits = (r: Rect) =>
        placed.some((p) => !(r.x + r.w < p.x || r.x > p.x + p.w || r.y + r.h < p.y || r.y > p.y + p.h));

      // 마커 먼저(라벨은 위에)
      const pts = visible.map((s) => {
        const [x, y] = toXY(s.lat, s.lng);
        return { s, x, y };
      });
      for (const { s, x, y } of pts) {
        const r = s.transfer ? radius + 1.2 : radius;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = s.transfer ? 2 : 1.8;
        ctx.strokeStyle = s.transfer ? "#111827" : data.colors[s.lines[0]] ?? "#334155";
        ctx.stroke();
      }

      for (const { s, x, y } of pts) {
        if (!showAllLabels && !s.transfer) continue;
        const text = stationLabel(s.name);
        ctx.font = `700 ${fontPx}px ${FONT}`;
        const textW = ctx.measureText(text).width;
        // 환승역은 노선 배지(1·2·신분당…)를 역명 옆에 붙인다 — 최대 3개
        const chips = s.transfer
          ? s.lines
              .slice(0, 3)
              .map((id) => ({ label: data.lines.find((l) => l.id === id)?.badge ?? id, color: data.colors[id] ?? "#64748b" }))
          : [];
        const chipFont = Math.max(8, fontPx - 2.5);
        ctx.font = `800 ${chipFont}px ${FONT}`;
        const chipsW = chips.length
          ? chips.reduce((acc, c) => acc + Math.max(fontPx + 1, ctx.measureText(c.label).width + 6) + 2.5, 0) + 3
          : 0;
        const totalW = textW + chipsW;
        const h = fontPx + 3;
        const gap = radius + 3;
        const candidates: Array<[number, number]> = [
          [x + gap, y - h / 2], // 오른쪽
          [x - gap - totalW, y - h / 2], // 왼쪽
          [x - totalW / 2, y - gap - h], // 위
          [x - totalW / 2, y + gap], // 아래
        ];
        const spot = candidates.find(([lx, ly]) => !hits({ x: lx - 1, y: ly - 1, w: totalW + 2, h: h + 2 }));
        if (!spot) continue;
        placed.push({ x: spot[0] - 1, y: spot[1] - 1, w: totalW + 2, h: h + 2 });
        drawLabel(ctx, text, spot[0], spot[1] + h / 2, fontPx, s.transfer ? 800 : 600);
        if (chips.length) drawChips(ctx, chips, spot[0] + textW + 3, spot[1] + h / 2, fontPx);
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };

    (async () => {
      try {
        const data = await loadSubwayData();
        if (cancelled) return;
        dataRef.current = data;

        pane = map.getPane("subwayPane") ?? map.createPane("subwayPane");
        pane.style.zIndex = "425"; // 구역 캔버스(overlayPane 400) 위, 마커(600) 아래
        pane.style.pointerEvents = "none"; // ← 구역 클릭을 절대 가로채지 않는다
        pane.style.display = ""; // 토글 OFF 로 숨겼던 pane 재사용
        canvas = L.DomUtil.create("canvas", "leaflet-subway-canvas", pane) as HTMLCanvasElement;
        canvas.style.position = "absolute";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.pointerEvents = "none";

        map.on("move zoom resize moveend zoomend viewreset", schedule);
        draw();
      } catch {
        /* 데이터를 못 받으면 레이어만 조용히 생략 — 지도 본 기능은 그대로 동작 */
      }
    })();

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      map.off("move zoom resize moveend zoomend viewreset", schedule);
      canvas?.remove();
      canvas = null;
      // pane은 남겨 둔다 — Leaflet map._panes 가 이 요소를 계속 들고 있어서,
      // remove() 하면 다시 켤 때 getPane()이 떨어져 나간 노드를 돌려준다.
      if (pane) pane.style.display = "none";
    };
  }, [map, enabled]);

  return null;
}
