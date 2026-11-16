"use client";
// ─────────────────────────────────────────────────────────────────────────────
// KakaoZoneMap — 카카오맵 JavaScript SDK 위에 서울시 정비구역 **전수** 경계를 그리는 지도
//
// ▶ 왜 카카오맵인가 (사용자 요청)
//    · 지하철 **출구 번호**·역명·건물명·지번이 카카오 기본지도에 원래 나온다(우리가 그리지 않아도 된다)
//    · **스카이뷰(위성+라벨, HYBRID)** 로 구역의 실제 모습을 바로 볼 수 있다
//    · **지적편집도(USE_DISTRICT)** 오버레이 — 필지 경계·지번이 재개발 상담의 기본 자료다
//
// ▶ 1,824구역을 어떻게 부드럽게 그리나
//    · 카카오 Polygon 객체 1,800개는 SVG라 이동할 때마다 무너진다 → **HTML5 canvas 한 장**.
//      canvas 는 지도 컨테이너 위에 절대배치로 얹고 pointer-events:none (지도 조작·클릭 그대로).
//    · 좌표 변환은 Web Mercator 로 직접 계산한다. 카카오 projection 호출은 기준점 2~3회만 하고
//      나머지는 Float64Array 산술이라 1,800구역 재투영이 수 ms 에 끝난다.
//      → 이동·확대 중에는 매 프레임 다시 그린다(투영이 실시간으로 갱신되는 것을 확인).
//    · 스타일이 같은 구역은 Path2D 한 겹으로 모아 fill/stroke (색·투명도별 배치).
//    · 화면 밖 구역은 바운딩박스만 보고 건너뛴다(줌인 시 체감 속도↑).
//
// ▶ 상호작용
//    · 호버: 경위도 → 바운딩박스 → 광선교차 판정으로 즉시 툴팁(구역명·유형·단계·면적)
//    · 클릭: 같은 판정으로 구역 선택(겹치면 안쪽의 작은 구역)
//    · 선택: 이름표 CustomOverlay + 경계에 맞춰 부드럽게 이동(jump + animate)
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS, zoneStyle } from "./colors";
import { hitTestZones, prepareZones, type PreparedZones } from "./prepare-zones";
import { SEOUL_BOUNDS, type KakaoZoneMapProps } from "./props";
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

// ─────────────────────────────────────────────────────────────────────────────
// 줌 애니메이션 배율 측정
//
// 카카오맵은 레벨이 바뀌면 **이전 레벨 타일을 약 250ms 동안 CSS width/height 로 확대·축소**해
// 그린 다음(예: 256 → 512), 새 레벨 타일이 도착하면 256 으로 되돌린다. 카카오 자신의
// Polygon·라벨도 같은 애니메이션을 따라 움직이지만, 우리 canvas 는 getProjection() 값으로
// 다시 그리기 때문에 레벨이 바뀌는 순간 최종 배율로 먼저 튀어 버린다 → 휠 줌 중 경계가
// 지도에서 분리돼 보였다.
//
// 그래서 지도 한가운데에 실제로 그려진 타일의 **현재 배율**을 읽어,
//   k = (타일 표시 폭 / 타일 원본 폭) × 2^(현재 레벨 - 타일 레벨)
// 를 구해 투영 전체를 지도 중심 기준으로 k 배 해 그린다. 타일과 같은 배율로 움직이므로
// 애니메이션 중에도 경계가 지도에 붙어 있고, 새 타일이 도착해 k=1 이 되면 최종 위치에 안착한다.
const TILE_LEVEL_RE = /latest\/(\d{1,2})\/\d+\/\d+\.(?:png|jpe?g|webp)/i;
/** 스카이뷰(항공사진) 타일 — .../map_skyview/L6/245/109.jpg */
const SKY_TILE_LEVEL_RE = /\/map_skyview\/L(\d{1,2})\/\d+\/\d+\.(?:png|jpe?g|webp)/i;

function measureImageryScale(el: HTMLElement, level: number): number {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return 1;
  const box = el.getBoundingClientRect();
  if (box.width < 8 || box.height < 8) return 1;
  // 지도 중앙에 실제로 칠해진 요소 중 맨 위 타일이 지금 화면의 배율을 말해준다
  const stack = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  for (const node of stack) {
    if (!(node instanceof HTMLImageElement)) continue;
    const m = TILE_LEVEL_RE.exec(node.src || "") ?? SKY_TILE_LEVEL_RE.exec(node.src || "");
    if (!m) continue;
    const tileLevel = Number(m[1]);
    const shown = node.getBoundingClientRect().width;
    const natural = node.naturalWidth || 256;
    if (!(shown > 1) || !(natural > 1) || Math.abs(tileLevel - level) > 3) continue;
    const k = (shown / natural) * Math.pow(2, level - tileLevel);
    if (!Number.isFinite(k) || k < 0.2 || k > 5) return 1;
    return Math.abs(k - 1) < 0.004 ? 1 : k;
  }
  return 1;
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
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const sdkRef = useRef<KakaoSDK | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelRef = useRef<KakaoCustomOverlay | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const bufRef = useRef<Float32Array>(new Float32Array(4096));
  const viewRef = useRef<View | null>(null);
  const hoverRef = useRef<string | null>(null);
  /** 스카이뷰(항공사진) 중인지 — 위성 위에서는 구역 채움을 옅게 해 실제 모습이 보이게 한다 */
  const skyviewRef = useRef(false);
  const selectedRef = useRef<string | undefined>(selectedZoneId);
  const moveRafRef = useRef(0);
  const drawRafRef = useRef(0);
  const loopUntilRef = useRef(0);
  /** 줌 애니메이션 배율을 읽을 시간 창 (ms) — zoom_start/zoom_changed 에서 열고, k≠1 인 동안 연장 */
  const zoomAnimUntilRef = useRef(0);
  /** 창을 무한히 연장하지 않기 위한 상한 */
  const zoomDeadlineRef = useRef(0);
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
    const el = mapElRef.current;
    if (!k || !map || !canvas || !el) return;

    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw < 20 || ch < 20) return;

    // 카카오가 컨테이너 내부를 다시 그려 캔버스가 문서에서 떨어지면 스스로 다시 얹는다
    if (!canvas.isConnected) el.appendChild(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(cw * dpr);
    const bh = Math.round(ch * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    const proj = map.getProjection();
    const center = map.getCenter();
    const cLat = center.getLat();
    const cLng = center.getLng();
    const p0 = proj.containerPointFromCoords(center);
    // 투영 상수 2회 호출로 배율을 보정한 뒤, 나머지 점은 산술로만 변환한다
    const probe = 0.002;
    const pLat = proj.containerPointFromCoords(new k.maps.LatLng(cLat + probe, cLng));
    const pLng = proj.containerPointFromCoords(new k.maps.LatLng(cLat, cLng + probe));
    const m0 = mercator(cLat);
    const pxPerMercRaw = (pLat.y - p0.y) / (mercator(cLat + probe) - m0);
    const pxPerLngRaw = (pLng.x - p0.x) / probe;

    // 줌 애니메이션 중이면 지도 타일이 지금 몇 배로 그려져 있는지 읽어 같은 배율을 쓴다 (위 주석 참조)
    const now = performance.now();
    let kScale = 1;
    if (zoomAnimUntilRef.current > now) {
      kScale = measureImageryScale(el, map.getLevel());
      if (kScale !== 1 && now < zoomDeadlineRef.current) {
        zoomAnimUntilRef.current = now + 140;
        loopUntilRef.current = Math.max(loopUntilRef.current, now + 160);
      }
    }

    // 화면 좌상단(0,0)과 우하단이 "투영 좌표"에서 어디인지 — k배 축소·확대된 만큼 되돌려 놓고 경계를 구한다
    const ccx = cw / 2;
    const ccy = ch / 2;
    const p0x = kScale === 1 ? p0.x : ccx + (p0.x - ccx) * kScale;
    const p0y = kScale === 1 ? p0.y : ccy + (p0.y - ccy) * kScale;
    const pxPerMerc = pxPerMercRaw * kScale;
    const pxPerLng = pxPerLngRaw * kScale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const zoomProxy = ZOOM_BASE - map.getLevel();
    viewRef.current = { p0x, p0y, cLat, cLng, pxPerMerc, pxPerLng, m0, W: cw, H: ch };

    // 화면에 보이는 지리 범위 — 밖의 구역은 그리지 않는다
    const inv = (px: number, py: number) =>
      kScale === 1 ? { x: px, y: py } : { x: ccx + (px - ccx) / kScale, y: ccy + (py - ccy) / kScale };
    const invTL = inv(0, 0);
    const invBR = inv(cw, ch);
    const tl = proj.coordsFromContainerPoint(new k.maps.Point(invTL.x, invTL.y));
    const br = proj.coordsFromContainerPoint(new k.maps.Point(invBR.x, invBR.y));
    const vMinLat = Math.min(tl.getLat(), br.getLat()) - 0.0003;
    const vMaxLat = Math.max(tl.getLat(), br.getLat()) + 0.0003;
    const vMinLng = Math.min(tl.getLng(), br.getLng()) - 0.0003;
    const vMaxLng = Math.max(tl.getLng(), br.getLng()) + 0.0003;

    const data = prepRef.current;
    const selId = selectedRef.current;
    const hoverId = hoverRef.current;

    const batches = new Map<string, Batch>();
    const activePaths: { path: Path2D; color: string; weight: number; fillOpacity: number }[] = [];

    let buf = bufRef.current;

    for (const pz of data.zones) {
      if (pz.maxLat < vMinLat || pz.minLat > vMaxLat || pz.maxLng < vMinLng || pz.minLng > vMaxLng) continue;

      const z = pz.zone;
      const isSel = z.id === selId;
      const isHover = !isSel && z.id === hoverId;
      const st = zoneStyle(z.type, isSel || isHover, z.featured, zoomProxy, pz.completed);
      // 스카이뷰에서는 항공사진이 보이도록 채움을 옅게 (테두리는 그대로)
      if (skyviewRef.current) st.fillOpacity = Math.min(st.fillOpacity, isSel || isHover ? 0.3 : 0.16);
      const dash = pz.completed ? [4, 3] : null;

      let target: Path2D;
      let activePath: Path2D | null = null;
      if (isSel || isHover) {
        activePath = new Path2D();
        target = activePath;
      } else {
        const key = `${st.color}|${st.weight}|${st.opacity}|${st.fillOpacity}|${dash ? "d" : "-"}`;
        let batch = batches.get(key);
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
        target = batch.path;
      }

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
          const x = p0x + (lng - cLng) * pxPerLng;
          const y = p0y + (mercator(lat) - m0) * pxPerMerc;
          buf[i * 2] = x;
          buf[i * 2 + 1] = y;
          if (x < sMinX) sMinX = x;
          if (x > sMaxX) sMaxX = x;
          if (y < sMinY) sMinY = y;
          if (y > sMaxY) sMaxY = y;
        }
        if (sMaxX < -8 || sMinX > cw + 8 || sMaxY < -8 || sMinY > ch + 8) continue;
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
      const x = p0x + (z.center[1] - cLng) * pxPerLng;
      const y = p0y + (mercator(z.center[0]) - m0) * pxPerMerc;
      if (x < -40 || y < -40 || x > cw + 40 || y > ch + 40) continue;
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
        center: new k.maps.LatLng(
          (SEOUL_BOUNDS[0][0] + SEOUL_BOUNDS[1][0]) / 2,
          (SEOUL_BOUNDS[0][1] + SEOUL_BOUNDS[1][1]) / 2
        ),
        level: 9,
        scrollwheel: true,
        keyboardShortcuts: true,
      });
    } catch (e) {
      onFail?.("init-error", e instanceof Error ? e.message : String(e));
      return;
    }
    mapRef.current = map;
    map.setMinLevel(1);
    map.setMaxLevel(MAX_LEVEL);

    // 개발용 진단 훅 — 줌 애니메이션 검증 스크립트가 지도 인스턴스/투영 상태를 읽는다
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__redevDiag = {
        map: () => mapRef.current,
        view: () => viewRef.current,
        draw: () => draw(),
      };
    }

    // 폴리곤 캔버스 — 지도 컨테이너 위에 절대배치. 클릭·드래그는 지도로 통과시킨다.
    const canvas = document.createElement("canvas");
    canvas.className = "kakao-zone-canvas";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "2";
    el.appendChild(canvas);
    canvasRef.current = canvas;

    // 초기 화면: 서울시 전체
    const seoulBounds = new k.maps.LatLngBounds(
      new k.maps.LatLng(SEOUL_BOUNDS[0][0], SEOUL_BOUNDS[0][1]),
      new k.maps.LatLng(SEOUL_BOUNDS[1][0], SEOUL_BOUNDS[1][1])
    );
    map.setBounds(seoulBounds, 8);
    // 화면이 커지면 setBounds 가 너무 멀리 물러난다 — 서울이 화면을 채우도록 레벨을 한 번 조인다
    if (map.getLevel() > 8) map.setLevel(8);
    // 첫 화면 맞춤도 줌 애니메이션이다 — 그동안도 타일 배율을 읽어 경계를 붙여 둔다
    {
      const t0 = performance.now();
      zoomAnimUntilRef.current = t0 + 900;
      zoomDeadlineRef.current = t0 + 2600;
      loopUntilRef.current = t0 + 900;
    }

    // ── 다시 그리기 스케줄러 ────────────────────────────────────────────────
    //  · 한 프레임에 한 번만 그린다(rAF 병합). 이동·확대 중에는 투영이 실시간으로
    //    갱신되므로 매 프레임 그려도 폴리곤이 타일과 정확히 붙어 있다.
    //  · 줌 애니메이션(k≠1)이 끝나지 않았으면 draw() 가 loopUntilRef 를 늘려 계속 그린다.
    let rafId = 0;
    const scheduleDraw = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        draw();
        const t = performance.now();
        // 줌 애니메이션 창이 열려 있는 동안에만 상한(deadline)을 적용한다 — 이동·드래그 중에는
        // 지난 줌의 deadline 이 남아 루프를 막으면 안 된다.
        const zooming = zoomAnimUntilRef.current > t;
        if (t < loopUntilRef.current && (!zooming || t < zoomDeadlineRef.current + 250)) scheduleDraw();
      });
    };
    const pump = (ms: number) => {
      loopUntilRef.current = Math.max(loopUntilRef.current, performance.now() + ms);
      scheduleDraw();
    };

    const onIdle = () => {
      // 타일이 아직 도착 전이면(k≠1) 한동안 더 그려 제자리를 찾게 한다
      loopUntilRef.current = Math.max(loopUntilRef.current, performance.now() + 60);
      scheduleDraw();
    };
    // 줌 이벤트 — 카카오 타일 애니메이션이 도는 동안 배율을 읽어 두려고 시간 창을 열어 둔다
    const openZoomWindow = () => {
      const now = performance.now();
      zoomAnimUntilRef.current = now + 600;
      zoomDeadlineRef.current = now + 2200;
    };
    k.maps.event.addListener(map, "idle", onIdle);
    k.maps.event.addListener(map, "drag", () => pump(120));
    k.maps.event.addListener(map, "center_changed", () => pump(120));
    k.maps.event.addListener(map, "zoom_start", () => {
      openZoomWindow();
      pump(600);
    });
    k.maps.event.addListener(map, "zoom_changed", () => {
      openZoomWindow();
      pump(450);
    });

    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.display = "none";
      el.style.cursor = "";
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
            const x = view.p0x + (z.center[1] - view.cLng) * view.pxPerLng;
            const y = view.p0y + (mercator(z.center[0]) - view.m0) * view.pxPerMerc;
            const d = (point.x - x) * (point.x - x) + (point.y - y) * (point.y - y);
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
          const tw = tip.offsetWidth || 240;
          tip.style.left = `${Math.max(6, Math.min(x + 14, rect.width - tw - 8))}px`;
          tip.style.top = `${Math.max(6, y - 34)}px`;
        }
        el.style.cursor = "pointer";
      });
    };

    const onMapClick = (e: KakaoMouseEvent) => {
      const lat = e.latLng.getLat();
      const lng = e.latLng.getLng();
      const data = prepRef.current;
      let hit: SeoulZone | undefined = hitTestZones(data, lat, lng);
      const view = viewRef.current;
      const pt = e.point;
      if (!hit && view && pt) {
        let bestD = 13 * 13;
        for (const z of data.points) {
          const x = view.p0x + (z.center[1] - view.cLng) * view.pxPerLng;
          const y = view.p0y + (mercator(z.center[0]) - view.m0) * view.pxPerMerc;
          const d = (pt.x - x) * (pt.x - x) + (pt.y - y) * (pt.y - y);
          if (d < bestD) {
            bestD = d;
            hit = z;
          }
        }
      }
      if (hit) {
        hideTip();
        onSelectRef.current(hit.id);
      }
    };

    k.maps.event.addListener(map, "mousemove", onMousemove);
    k.maps.event.addListener(map, "click", onMapClick);
    k.maps.event.addListener(map, "dragstart", hideTip);

    // 크기 변경 대응 — 관찰 시작 직후에도 한 번 불리므로 실제 크기 변화만 처리한다
    let ro: ResizeObserver | null = null;
    let lastW = el.clientWidth;
    let lastH = el.clientHeight;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        if (w < 20 || h < 20) return;
        map.relayout();
        if (!canvas.isConnected) el.appendChild(canvas);
        draw();
      });
      ro.observe(el);
    }

    scheduleDraw();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (moveRafRef.current) window.cancelAnimationFrame(moveRafRef.current);
      ro?.disconnect();
      k.maps.event.removeListener(map, "idle", onIdle);
      labelRef.current?.setMap(null);
      labelRef.current = null;
      canvas.remove();
      canvasRef.current = null;
      mapRef.current = null;
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

    const parcel = (seoul?.alias ?? []).find((a) => /\d+-\d+/.test(a));
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
    // HYBRID = 스카이뷰(위성) + 도로·지명·건물 라벨
    map.setMapTypeId(next ? k.maps.MapTypeId.HYBRID : k.maps.MapTypeId.ROADMAP);
    skyviewRef.current = next;
    setSkyview(next);
    draw();
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
    <div className="kakao-map-wrap relative h-full w-full overflow-hidden rounded-xl">
      <div ref={mapElRef} className="h-full w-full" />

      {/* 호버 툴팁 */}
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-[700] hidden max-w-[300px] rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
        style={{ display: "none" }}
      />

      {/* 지도 위 토글 — 확대/축소 · 스카이뷰 · 지적편집도 · 준공 포함 */}
      {/* 지도 위 도구 — 데스크톱은 왼쪽 아래(범례 위), 모바일은 오른쪽 가운데(검색·시트를 피해서) */}
      <div className="absolute right-2 top-1/2 z-[600] flex -translate-y-1/2 flex-col items-end gap-1.5 md:bottom-2 md:left-2 md:right-auto md:top-auto md:translate-y-0 md:flex-row md:items-center">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white/95 p-0.5 shadow-md">
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            title="확대"
            aria-label="확대"
            className="h-7 w-7 rounded text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            title="축소"
            aria-label="축소"
            className="h-7 w-7 rounded text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            −
          </button>
        </div>
        <button
          type="button"
          onClick={toggleSkyview}
          aria-pressed={skyview}
          title="스카이뷰 — 위성 항공사진 + 도로·지명 라벨"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
            skyview
              ? "border-sky-400 bg-sky-50 text-sky-900"
              : "border-slate-300 bg-white text-slate-700 hover:text-slate-900"
          }`}
        >
          <span aria-hidden>🛰</span>
          <span className="hidden md:inline">스카이뷰</span>
        </button>
        <button
          type="button"
          onClick={toggleDistrict}
          aria-pressed={district}
          title="지적편집도 — 필지 경계·지번을 겹쳐 보기 (참고용)"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
            district
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "border-slate-300 bg-white text-slate-700 hover:text-slate-900"
          }`}
        >
          <span aria-hidden>📐</span>
          <span className="hidden md:inline">지적편집도</span>
        </button>
        {onToggleCompleted && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={showCompleted}
            title="준공·입주까지 끝난 구역도 지도에 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
              showCompleted
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-slate-300 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            <span aria-hidden>{showCompleted ? "👁" : "🏁"}</span>
            <span className="hidden md:inline">준공 포함</span>
            {completedCount > 0 && <span className="font-normal text-slate-400">{completedCount}</span>}
          </button>
        )}
      </div>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
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
  for (const ring of [zone.polygon, ...(zone.parts ?? [])]) {
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
