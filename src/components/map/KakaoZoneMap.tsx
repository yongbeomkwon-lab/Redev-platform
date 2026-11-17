"use client";
// ─────────────────────────────────────────────────────────────────────────────
// KakaoZoneMap — 카카오맵 JavaScript SDK 위에 서울시 정비구역 **전수** 경계를 그리는 지도
//
// ▶ 왜 카카오맵인가 (사용자 요청)
//    · 지하철 **출구 번호**·역명·건물명·지번이 카카오 기본지도에 원래 나온다(우리가 그리지 않아도 된다)
//    · **스카이뷰(위성+라벨, HYBRID)** 로 구역의 실제 모습을 바로 볼 수 있다
//    · **지적편집도(USE_DISTRICT)** 오버레이 — 필지 경계·지번이 재개발 상담의 기본 자료다
//
// ▶ 2,179구역을 어떻게 부드럽게 그리나
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
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS, zoneStyle } from "./colors";
import { addressPinHtml, stationPinHtml, PIN_LAYER_STYLE } from "./address-pin";
import { hitTestZones, prepareZones, type PreparedZones } from "./prepare-zones";
import { SEOUL_BOUNDS, type AdminMapConfig, type KakaoZoneMapProps } from "./props";
import { formatArea, ringAreaSqm, ringBounds, ringCentroid, ringContainsLatLng } from "@/lib/custom-zones";
import type {
  KakaoLatLng,
  KakaoMap,
  KakaoMouseEvent,
  KakaoPolygon,
  KakaoSDK,
} from "./kakao-loader";

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
/** 메르카토르 y → 위도 (경계 계산용 역변환) */
const unmercator = (m: number) => ((2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180) / Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// 지도 변환을 "읽는" 기준점(anchor)
//
// 카카오는 벡터 오버레이(Polygon·라벨)를 자기 SVG 레이어에 그리고, 이동할 때는 그 SVG의
// left/top 을, 확대 애니메이션 중에는 SVG 의 CSS width/height(배율)를 매 프레임 바꾼다.
// 즉 "지도가 지금 무엇을 어디에 그렸는가"는 우리가 추정할 값이 아니라 **DOM 에 이미 있는 값**이다.
//
// 그래서 우리 캔버스와 같은 레이어에 아주 작은 사각형 두 개를 몰래 그려 두고(투명도 0.02 —
// 화면에서는 보이지 않는다), 매 프레임 그 두 점의 실제 화면 좌표를 읽어 지도 변환을 그대로
// 재구성한다. 배율을 추정하지 않고, 줌 중심이 어디였는지도 가정하지 않는다 → 휠 줌·버튼 줌·
// 드래그 어느 경우에도 경계가 지도와 같은 프레임에 같은 자리에 놓인다.
const ANCHOR_COLORS = ["rgb(255, 0, 170)", "rgb(0, 170, 255)"] as const;
/** 기준점 사각형을 화면에서 몇 px 로 그릴지(반폭) — bbox 중심이 곧 좌표다 */
const ANCHOR_PX = 2.5;
/** 메르카토르 y 1단위당 각도 비 — 360/(2π) */
const MERC_PER_DEG = 360 / (2 * Math.PI);

type MapAnchor = {
  poly: KakaoPolygon | null;
  el: SVGPathElement | null;
  lat: number;
  lng: number;
  /** 사각형 반경(도) — 화면 배율에 맞춰 매번 다시 정한다 */
  half: number;
  color: string;
};

/** 기준점 SVG path 를 찾는다(고유한 stroke 색으로 식별 — 캐시가 끊겼을 때만 다시 부른다) */
function findAnchorEl(container: HTMLElement, color: string): SVGPathElement | null {
  const paths = container.querySelectorAll("svg path");
  for (const p of paths) {
    if (p instanceof SVGPathElement && getComputedStyle(p).stroke === color) return p;
  }
  return null;
}

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

/** 캔버스 둥근 사각형(면적 배지) — roundRect 미지원 브라우저 대비 */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
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
  addressPin,
  stationPin,
  zoneFitRequest,
  admin,
  onFail,
}: KakaoZoneMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  /** 지도 + 우리 레이어(꼭짓점 핸들·토글)를 감싸는 래퍼 — 더블클릭·우클릭은 여기서 받는다 */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const sdkRef = useRef<KakaoSDK | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * 화면 좌표에 붙는 DOM 레이어 — 카카오 CustomOverlay 대신 우리가 직접 얹는다.
   *  · 카카오 오버레이는 z-index 1 레이어에 들어가고 우리 폴리곤 캔버스가 z-index 2 라,
   *    구역 안에 찍힌 주소 핀·이름표가 폴리곤 색에 반투명하게 덮였다(사용자 스크린샷).
   *  · 그래서 핀·이름표는 지도 컨테이너 밖(같은 wrapper)의 z-index 100 레이어에 두고,
   *    draw() 가 매 프레임 좌표를 계산해 transform 으로 옮긴다(지도와 '같은 프레임'에 따라온다).
   */
  const pinLayerRef = useRef<HTMLDivElement | null>(null);
  /** 지하철역 핀 레이어 — 주소 핀과 동시에 떠 있을 수 있어 따로 둔다 */
  const stationLayerRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  /** 지금 레이어에 놓인 핀·이름표의 좌표 (draw 에서 읽는다) */
  const pinAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
  /** 지금 역 핀 레이어에 놓인 좌표 */
  const stationAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
  /** 마지막으로 처리한 ‘구역 전체 보기’ 요청 토큰 */
  const lastFitReqRef = useRef(0);
  /** 이름표·화면 맞춤을 마지막으로 적용한 구역 — 핀만 바뀐 경우(핀 지우기) 화면을 흔들지 않으려고 */
  const lastLabelZoneRef = useRef<string | undefined>(undefined);
  const labelAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
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
  /** 지도 변환 기준점(카카오가 직접 그리는 보이지 않는 사각형 2개) */
  const anchorsRef = useRef<{ a: MapAnchor; b: MapAnchor } | null>(null);
  /** 진단용 — 기준점으로 변환을 읽고 있는지 */
  const anchorModeRef = useRef<"anchor" | "projection">("projection");
  /** 진단용 — draw 횟수 */
  const drawCountRef = useRef(0);
  /** 진단용 — 기준점 재배치 횟수 */
  const placeCountRef = useRef(0);
  /** 기준점 재배치 함수(지도 effect 안에서 채운다) — draw 가 '기준점을 못 읽었다'고 판단할 때 스스로 부른다 */
  const replaceAnchorsRef = useRef<(() => void) | null>(null);
  /** 기준점 자가 복구 시도 상태 (무한 재시도 방지) */
  const healRef = useRef({ at: 0, tries: 0 });
  /** 기준점 사각형 위에서도 지도 클릭·호버가 그대로 동작하도록 넘겨줄 핸들러 */
  const passthroughRef = useRef<{
    click: ((e: KakaoMouseEvent) => void) | null;
    move: ((e: KakaoMouseEvent) => void) | null;
  }>({ click: null, move: null });
  const onSelectRef = useRef(onSelectZone);
  onSelectRef.current = onSelectZone;
  // ── 관리자 모드(그리기·경계 수정) ──────────────────────────────────────────
  //   일반 방문자에게는 admin 이 없으므로 이 블록은 통째로 건너뛰다(기존 화면 그대로).
  const adminRef = useRef<AdminMapConfig | undefined>(admin);
  adminRef.current = admin;
  /** 꼭짓점 핸들·변 + 핸들을 담는 DOM 레이어(위치는 draw 가 매 프레임 맞춘다) */
  const adminLayerRef = useRef<HTMLDivElement | null>(null);
  /** 그리는 중 마우스 커서(또는 마지막 터치) 위치 — 마지막 점에서 고무줄 선을 긋는다 */
  const adminCursorRef = useRef<[number, number] | null>(null);
  /** 꼭짓점 드래그 상태 */
  const adminDragRef = useRef<{ index: number; pointerId: number; raf: number; latest: [number, number] | null } | null>(
    null
  );
  /**
   * 그리기 중 마지막으로 점을 찍은 화면 좌표 — 더블클릭의 **두 번째 클릭**이 점을 또 찍지 않게 한다.
   * (더블클릭 = ‘그 자리에서 완료’. 그냥 두면 꼭짓점 두 개가 겹쳐 찍힌 뒤 완료된다)
   */
  const lastAddRef = useRef<{ t: number; x: number; y: number } | null>(null);
  /** 마지막으로 처리한 관리자 구역 화면 맞춤 토큰 */
  const lastAdminFitRef = useRef(0);

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
    drawCountRef.current += 1;

    // 카카오가 컨테이너 내부를 다시 그려 캔버스가 문서에서 떨어지면 스스로 다시 얹는다
    if (!canvas.isConnected) el.appendChild(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(cw * dpr);
    const bh = Math.round(ch * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    const center = map.getCenter();
    const cLat = center.getLat();
    const cLng = center.getLng();
    const now = performance.now();

    // ── 지도 변환 읽기 ① 기준점(anchor) — 카카오가 방금 그린 실제 화면 좌표 ──────────
    //   p0x/p0y + (경도·메르카토르y)×배율 만 알면 되므로, 서로 먼 두 점의 화면 위치에서
    //   배율과 기준점을 동시에 얻는다(축별로 따로 — 메르카토르는 등각이라 두 값이 거의 같다).
    let p0x = 0;
    let p0y = 0;
    let pxPerLng = 0;
    let pxPerMerc = 0;
    let m0 = 0;
    // p0x 가 "어느 경도"의 화면 x 인지 — 기준점 경로는 0, 예비 경로는 지도 중심
    let lng0 = cLng;
    let anchored = false;
    const pair = anchorsRef.current;
    if (pair && pair.a && pair.b) {
      const box = el.getBoundingClientRect();
      const read = (a: MapAnchor) => {
        if (!a.el || !a.el.isConnected) a.el = findAnchorEl(el, a.color);
        if (!a.el) return null;
        const r = a.el.getBoundingClientRect();
        if (!(r.width || r.height)) return null;
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      };
      const pa = read(pair.a);
      const pb = read(pair.b);
      if (pa && pb) {
        const dLng = pair.b.lng - pair.a.lng;
        const dM = mercator(pair.b.lat) - mercator(pair.a.lat);
        const sx = (pb.x - pa.x) / dLng;
        const sy = (pb.y - pa.y) / dM;
        // 배율이 정상 범위이고, 축 배율의 비가 메르카토르 기하(경도 1도 = 2π/360 메르카토르)와
        // 맞으면 신뢰한다 — 엉뚱한 요소(예: 색이 같은 다른 path)를 읽었을 때 걸러내는 안전장치.
        if (
          Number.isFinite(sx) &&
          Number.isFinite(sy) &&
          sx > 0 &&
          sy < 0 &&
          Math.abs(Math.abs(sy / sx) / MERC_PER_DEG - 1) < 0.05
        ) {
          p0x = pa.x - pair.a.lng * sx;
          p0y = pa.y;
          pxPerLng = sx;
          pxPerMerc = sy;
          m0 = mercator(pair.a.lat);
          lng0 = 0;
          anchored = true;
        }
      }
      anchorModeRef.current = anchored ? "anchor" : "projection";
    }

    // ── 기준점 자가 복구 ───────────────────────────────────────────────────────
    //   카카오는 지도가 크게 이동하면 기준점 사각형의 화면 좌표를 새로 잡아야 하는데,
    //   뒷 레이어를 통째로 다시 그리지 않는 경우(예: 주소 검색으로 jump)에는 SVG path 가
    //   0×0 으로 남아 기준점을 읽을 수 없었다. → idle 만 믿지 않고 draw 가 스스로 재배치를 요청한다.
    //   (줌 애니메이션 중에는 타일 배율 보정 경로를 쓰므로 건드리지 않는다. 재시도는 제한한다.)
    if (anchored) {
      healRef.current.tries = 0;
    } else if (now > zoomAnimUntilRef.current) {
      const heal = healRef.current;
      if (heal.tries < 12 && now - heal.at > 220) {
        heal.at = now;
        heal.tries += 1;
        window.setTimeout(() => replaceAnchorsRef.current?.(), 0);
      }
    }

    // ── 지도 변환 읽기 ② 예비 경로 — 기준점이 없을 때(초기 1~2프레임·이상 상태) ─────
    if (!anchored) {
      const proj = map.getProjection();
      const p0 = proj.containerPointFromCoords(center);
      // 투영 상수 2회 호출로 배율을 보정한 뒤, 나머지 점은 산술로만 변환한다
      const probe = 0.002;
      const pLat = proj.containerPointFromCoords(new k.maps.LatLng(cLat + probe, cLng));
      const pLng = proj.containerPointFromCoords(new k.maps.LatLng(cLat, cLng + probe));
      m0 = mercator(cLat);
      const pxPerMercRaw = (pLat.y - p0.y) / (mercator(cLat + probe) - m0);
      const pxPerLngRaw = (pLng.x - p0.x) / probe;
      // 줌 애니메이션 중이면 지도 타일이 지금 몇 배로 그려져 있는지 읽어 같은 배율을 쓴다
      let kScale = 1;
      if (zoomAnimUntilRef.current > now) {
        kScale = measureImageryScale(el, map.getLevel());
        if (kScale !== 1 && now < zoomDeadlineRef.current) {
          zoomAnimUntilRef.current = now + 140;
          loopUntilRef.current = Math.max(loopUntilRef.current, now + 160);
        }
      }
      const ccx = cw / 2;
      const ccy = ch / 2;
      p0x = kScale === 1 ? p0.x : ccx + (p0.x - ccx) * kScale;
      p0y = kScale === 1 ? p0.y : ccy + (p0.y - ccy) * kScale;
      pxPerMerc = pxPerMercRaw * kScale;
      pxPerLng = pxPerLngRaw * kScale;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 화면 좌표에 붙어 있는 DOM(구역 이름표·주소 핀)도 같은 변환으로 옮긴다 —
    //   카카오 오버레이(z-index 1)에 두면 우리 캔버스(z-index 2)가 위에 깔려 폴리곤 색에 덮인다.
    const placeOnMap = (node: HTMLElement | null, lat: number, lng: number) => {
      if (!node) return;
      const x = p0x + (lng - lng0) * pxPerLng;
      const y = p0y + (mercator(lat) - m0) * pxPerMerc;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const far = x < -260 || x > cw + 260 || y < -260 || y > ch + 260;
      node.style.transform = `translate3d(${Math.round(x * 10) / 10}px,${Math.round(y * 10) / 10}px,0)`;
      node.style.visibility = far ? "hidden" : "visible";
    };
    placeOnMap(labelLayerRef.current, labelAtRef.current.lat, labelAtRef.current.lng);
    placeOnMap(pinLayerRef.current, pinAtRef.current.lat, pinAtRef.current.lng);
    placeOnMap(stationLayerRef.current, stationAtRef.current.lat, stationAtRef.current.lng);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const zoomProxy = ZOOM_BASE - map.getLevel();
    viewRef.current = { p0x, p0y, cLat, cLng: lng0, pxPerMerc, pxPerLng, m0, W: cw, H: ch };

    // 화면에 보이는 지리 범위 — 밖의 구역은 그리지 않는다(변환의 역함수로 바로 구한다)
    //  ⚠️ 예비 경로(projection)에서는 p0x 가 **지도 중심(경도 lng0)의 화면 x** 이므로,
    //     경도를 되돌릴 때 lng0 를 반드시 더해야 한다. 이 항이 빠져 있으면 화면 밖 범위가
    //     경도 -0.02~0.02 로 계산돼 서울 구역이 전부 컬링됐다(주소 검색 직후 폴리곤이 사라진 원인).
    const vLng0 = lng0 + (0 - p0x) / pxPerLng;
    const vLng1 = lng0 + (cw - p0x) / pxPerLng;
    const vLat0 = unmercator((0 - p0y) / pxPerMerc + m0);
    const vLat1 = unmercator((ch - p0y) / pxPerMerc + m0);
    const vMinLat = Math.min(vLat0, vLat1) - 0.0003;
    const vMaxLat = Math.max(vLat0, vLat1) + 0.0003;
    const vMinLng = Math.min(vLng0, vLng1) - 0.0003;
    const vMaxLng = Math.max(vLng0, vLng1) + 0.0003;

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
          const x = p0x + (lng - lng0) * pxPerLng;
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
      const x = p0x + (z.center[1] - lng0) * pxPerLng;
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

    // 4) 관리자 모드 — 내가 그린 구역과 지금 그리는 초안(꼭짓점·변·면적)
    const adm = adminRef.current;
    if (adm) {
      const projectXY = (lat: number, lng: number): [number, number] => [
        p0x + (lng - lng0) * pxPerLng,
        p0y + (mercator(lat) - m0) * pxPerMerc,
      ];

      // 4-1) 저장된 구역 — 사업유형 색으로 채우고 흰 테두리를 한 번 더 그어 지도 위에서 읽히게
      for (const z of adm.zones) {
        if (!z.ring || z.ring.length < 3) continue;
        const sel = z.id === adm.selectedId;
        ctx.beginPath();
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = 0; i < z.ring.length; i++) {
          const [x, y] = projectXY(z.ring[i][0], z.ring[i][1]);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(z.color, sel ? 0.42 : 0.26);
        ctx.fill();
        if (z.replaces) ctx.setLineDash([7, 4]);
        ctx.lineWidth = sel ? 4.5 : 3;
        ctx.strokeStyle = rgba(z.color, 1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.stroke();

        // 이름표 — 화면에서 글자가 들어갈 만큼 큰 구역만(작은 구역은 목록에서 확인)
        const c = ringCentroid(z.ring);
        const [lx, ly] = projectXY(c[0], c[1]);
        if (lx > -80 && lx < cw + 80 && ly > -40 && ly < ch + 40) {
          ctx.font = "700 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tw = ctx.measureText(z.name).width;
          if (maxX - minX > tw + 14) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.strokeText(z.name, lx, ly);
            ctx.fillStyle = "rgba(15,23,42,0.95)";
            ctx.fillText(z.name, lx, ly);
          }
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
      }

      // 4-2) 지금 그리는 초안 — 꼭짓점·연결선·닫는 변·면적
      const draft = adm.draft;
      if (draft && draft.length > 0) {
        const pts = draft.map(([la, ln]) => projectXY(la, ln));

        if (pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.fillStyle = "rgba(2,132,199,0.20)";
          ctx.fill();
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(2,132,199,0.95)";
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // 열린 선(그리는 중 마지막 점 → 커서) — 흰 테두리 위에 파란 선
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        const cur = adminCursorRef.current;
        if (adm.adding && cur) {
          const [ex, ey] = projectXY(cur[0], cur[1]);
          ctx.lineTo(ex, ey);
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#0369a1";
        ctx.stroke();

        // 꼭짓점 점(핸들과 같은 자리 — 캔버스에도 그려 두면 핸들 렌더 전에도 점이 보인다)
        for (const [x, y] of pts) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#0369a1";
          ctx.stroke();
        }

        // 면적 배지 — 다각형 무게중심 위
        if (pts.length >= 3) {
          const cc = ringCentroid(draft);
          const [bx, by] = projectXY(cc[0], cc[1]);
          const text = formatArea(ringAreaSqm(draft));
          ctx.font = "700 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
          const tw = ctx.measureText(text).width;
          const w = tw + 16;
          const h = 24;
          roundRectPath(ctx, bx - w / 2, by - h / 2, w, h, 12);
          ctx.fillStyle = "rgba(15,23,42,0.9)";
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, bx, by + 0.5);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
      }

      // 4-3) 꼭짓점·변 + 핸들 위치 맞추기(카카오 지도와 같은 프레임에 붙어 움직이게)
      const layer = adminLayerRef.current;
      if (layer) {
        for (const node of Array.from(layer.children) as HTMLElement[]) {
          const vx = node.dataset.vx;
          const mid = node.dataset.mid;
          let x = NaN;
          let y = NaN;
          if (vx !== undefined) {
            const p = draft?.[Number(vx)];
            if (p) [x, y] = projectXY(p[0], p[1]);
          } else if (mid !== undefined && draft && draft.length >= 2) {
            const i0 = Number(mid) % draft.length;
            const a = draft[i0];
            const b = draft[(i0 + 1) % draft.length];
            const [x1, y1] = projectXY(a[0], a[1]);
            const [x2, y2] = projectXY(b[0], b[1]);
            // 변이 화면에서 짧으면 + 핸들을 감춘다 — 공식 경계처럼 점이 수백 개인 구역에서
            //  '+' 가 서로 겁치며 점을 가리는 것을 막는다(점 추가는 긴 변에서만).
            if (Math.hypot(x2 - x1, y2 - y1) < 26) {
              node.style.visibility = "hidden";
              continue;
            }
            x = (x1 + x2) / 2;
            y = (y1 + y2) / 2;
          }
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            node.style.visibility = "hidden";
            continue;
          }
          node.style.visibility = "visible";
          node.style.transform = `translate3d(${Math.round(x * 10) / 10}px,${Math.round(y * 10) / 10}px,0)`;
        }
      }
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

    // 개발용 진단 훅 — 검증 스크립트가 지도 인스턴스/투영 상태를 읽는다.
    //   배포본에서는 `?diag=1` 로 열 때만 노출한다(경계 동기화를 배포 URL 에서도 측정하기 위해).
    const diagOn =
      process.env.NODE_ENV !== "production" ||
      (typeof window !== "undefined" && /[?&]diag=1\b/.test(window.location.search));
    if (diagOn) {
      (window as unknown as Record<string, unknown>).__redevDiag = {
        map: () => mapRef.current,
        view: () => viewRef.current,
        draw: () => draw(),
        anchor: () => anchorModeRef.current,
        draws: () => drawCountRef.current,
        places: () => placeCountRef.current,
        anchorInfo: () => {
          const pair = anchorsRef.current;
          const el = mapElRef.current;
          if (!pair || !el) return null;
          const box = el.getBoundingClientRect();
          const one = (a: MapAnchor) => {
            const connected = !!a.el && a.el.isConnected;
            const r = a.el ? a.el.getBoundingClientRect() : null;
            return { connected, lat: a.lat, lng: a.lng, half: a.half, r: r ? { x: Math.round(r.x - box.left), y: Math.round(r.y - box.top), w: Math.round(r.width), h: Math.round(r.height) } : null };
          };
          return { a: one(pair.a), b: one(pair.b), box: { w: Math.round(box.width), h: Math.round(box.height) } };
        },
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

    // ── 지도 변환 기준점 ────────────────────────────────────
    //   보이지 않는 작은 사각형 두 개. 카카오가 자기 벡터 레이어에 직접 그리므로, 그 화면 위치를
    //   읽으면 이동·확대 애니메이션 중의 지도 변환을 그대로 알 수 있다(위 ANCHOR_COLORS 주석).
    // 사각형은 화면에서 5px 남짓 — 너무 크면 화면 밖으로 잘려 bbox 중심이 어긋나고,
    // 너무 작으면 렌더링에서 빠진다. 배율은 마지막 draw 의 view(px/도)에서 읽는다.
    const halfFor = () => {
      // 배율은 지도의 현재 투영에서 직접 읽는다(정지 상태에서는 정확하다).
      //  viewRef 는 직전 프레임 값이라 레벨을 크게 건너뛰면 엉뚱한 크기가 된다.
      let scale = 0;
      try {
        const proj = map.getProjection();
        const c = map.getCenter();
        const p0 = proj.containerPointFromCoords(c);
        const p1 = proj.containerPointFromCoords(new k.maps.LatLng(c.getLat(), c.getLng() + 0.002));
        scale = Math.abs((p1.x - p0.x) / 0.002);
      } catch {
        scale = 0;
      }
      if (!(scale > 0)) scale = viewRef.current && viewRef.current.pxPerLng > 0 ? viewRef.current.pxPerLng : 3000;
      return Math.min(0.02, Math.max(2e-7, ANCHOR_PX / scale));
    };
    const makeAnchor = (lat: number, lng: number, color: string, half: number): MapAnchor => {
      const poly = new k.maps.Polygon({
        path: [
          new k.maps.LatLng(lat - half, lng - half),
          new k.maps.LatLng(lat - half, lng + half),
          new k.maps.LatLng(lat + half, lng + half),
          new k.maps.LatLng(lat + half, lng - half),
        ],
        strokeWeight: 1,
        strokeColor: color,
        strokeOpacity: 0.02,
        fillColor: color,
        fillOpacity: 0.02,
        zIndex: 0,
      });
      poly.setMap(map);
      // 5px 짜리 투명 사각형이라도 그 위에서 클릭·호버가 "죽은 자리"가 되면 안 된다 — 지도로 넘긴다
      k.maps.event.addListener(poly, "click", (e: KakaoMouseEvent) => passthroughRef.current.click?.(e));
      k.maps.event.addListener(poly, "mousemove", (e: KakaoMouseEvent) => passthroughRef.current.move?.(e));
      return { poly, el: null, lat, lng, half, color };
    };
    const anchors = {
      a: makeAnchor(37.72, 126.78, ANCHOR_COLORS[0], halfFor()),
      b: makeAnchor(37.30, 127.24, ANCHOR_COLORS[1], halfFor()),
    };
    anchorsRef.current = anchors;

    // 기준점을 지금 화면 안(가운데에서 ±25%)으로 옮긴다 — 화면 밖으로 나가면 SVG 에서 빠질 수 있다
    const placeAnchors = () => {
      placeCountRef.current += 1;
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const dLat = (ne.getLat() - sw.getLat()) * 0.24;
      const dLng = (ne.getLng() - sw.getLng()) * 0.24;
      const half = halfFor();
      const put = (a: MapAnchor, lat: number, lng: number) => {
        if (Math.abs(a.lat - lat) < 1e-9 && Math.abs(a.lng - lng) < 1e-9 && Math.abs(a.half - half) < 1e-12) return;
        a.lat = lat;
        a.lng = lng;
        a.half = half;
        a.poly?.setPath([
          new k.maps.LatLng(lat - half, lng - half),
          new k.maps.LatLng(lat - half, lng + half),
          new k.maps.LatLng(lat + half, lng + half),
          new k.maps.LatLng(lat + half, lng - half),
        ]);
      };
      put(anchors.a, sw.getLat() + dLat * 2, sw.getLng() + dLng * 2);
      put(anchors.b, sw.getLat() + dLat, sw.getLng() + dLng);
      // setPath 는 같은 태스크에서 바로 DOM 에 반영된다(확인함) — 옮긴 즉시 다시 그리면 된다.
      draw();
    };
    placeAnchors();
    replaceAnchorsRef.current = placeAnchors;
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
      // 기준점을 다시 놓아야 하는 경우:
      //  · 화면 밖으로 밀렸거나 읽히지 않을 때
      //  · 두 기준점이 화면에서 너무 가까울 때 — 확대/축소로 간격이 줄면 배율 정밀도가 떨어진다
      const box = el.getBoundingClientRect();
      const centerOf = (a: MapAnchor) => {
        if (!a.el || !a.el.isConnected) a.el = findAnchorEl(el, a.color);
        if (!a.el) return null;
        const r = a.el.getBoundingClientRect();
        if (!(r.width || r.height)) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const pair = anchorsRef.current;
      const ca = pair ? centerOf(pair.a) : null;
      const cb = pair ? centerOf(pair.b) : null;
      if (!ca || !cb) {
        placeAnchors();
      } else {
        const inside = (p: { x: number; y: number }) =>
          p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
        const spread = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        if (!inside(ca) || !inside(cb) || spread < 160) placeAnchors();
      }
      scheduleDraw();
    };
    // 줌 이벤트 — 카카오 타일 애니메이션이 도는 동안 배율을 읽어 두려고 시간 창을 열어 둔다
    const openZoomWindow = () => {
      const now = performance.now();
      zoomAnimUntilRef.current = now + 600;
      zoomDeadlineRef.current = now + 2200;
    };
    // ── 카카오 벡터 레이어 갱신에 맞춰 그리기 ────────────────────────────────
    //   카카오는 벡터 레이어(SVG)의 left/top/width/height 를 **매 프레임 JS 로** 바꾼다.
    //   그 style 변경은 마이크로태스크에서 관찰되므로, 그 자리에서 바로 다시 그리면 같은 프레임의
    //   페인트에 지도·경계가 함께 실린다 → rAF 순서에 따른 1프레임 지연이 사라진다.
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver((records) => {
        for (const r of records) {
          const t = r.target as Element | undefined;
          if (t && t.tagName && t.tagName.toLowerCase() === "svg") {
            draw();
            return;
          }
        }
      });
      mo.observe(el, { attributes: true, attributeFilter: ["style"], subtree: true });
    }

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
        // 관리자 그리기 중 — 마지막 꼭짓점에서 커서까지 고무줄 선을 긋는다
        const admNow = adminRef.current;
        if (admNow?.adding && admNow.draft && admNow.draft.length > 0) {
          adminCursorRef.current = [lat, lng];
          draw();
        }
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
          if (adminRef.current?.adding) el.style.cursor = "crosshair";
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
        el.style.cursor = adminRef.current?.adding ? "crosshair" : "pointer";
      });
    };

    const onMapClick = (e: KakaoMouseEvent) => {
      const lat = e.latLng.getLat();
      const lng = e.latLng.getLng();
      const adm = adminRef.current;
      // ── 관리자 모드: 탭 = 꼭짓점 추가, 첫 점을 다시 탭하면 완료 ──────────────
      if (adm?.adding && adm.draft) {
        const view0 = viewRef.current;
        const pt0 = e.point;
        const first = adm.draft[0];
        if (first && adm.draft.length >= 3 && view0 && pt0) {
          const fx = view0.p0x + (first[1] - view0.cLng) * view0.pxPerLng;
          const fy = view0.p0y + (mercator(first[0]) - view0.m0) * view0.pxPerMerc;
          if (Math.hypot(pt0.x - fx, pt0.y - fy) <= 18) {
            hideTip();
            adm.onFinishByFirstPoint();
            return;
          }
        }
        hideTip();
        // 더블클릭의 두 번째 클릭 — 같은 자리에서 곧바로 또 찍힌 점은 버린다.
        //   (첫 클릭이 마지막 꼭짓점이 되고, 이어지는 dblclick 이 완료를 부른다)
        const px = e.point;
        const lastAdd = lastAddRef.current;
        const nowMs = performance.now();
        if (px && lastAdd && nowMs - lastAdd.t < 400 && Math.hypot(px.x - lastAdd.x, px.y - lastAdd.y) <= 6) {
          return;
        }
        lastAddRef.current = px ? { t: nowMs, x: px.x, y: px.y } : null;
        adm.onAddPoint(lat, lng);
        return;
      }
      // ── 관리자 모드: 저장된 관리자 구역을 누르면 선택(수정할 구역 고르기) ──────
      if (adm) {
        let hitCustom: string | undefined;
        for (const z of adm.zones) {
          if (z.ring.length >= 3 && ringContainsLatLng(z.ring, lat, lng)) hitCustom = z.id;
        }
        if (hitCustom) {
          hideTip();
          adm.onSelectZone(hitCustom);
          return;
        }
      }
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

    passthroughRef.current = { click: onMapClick, move: onMousemove };
    k.maps.event.addListener(map, "mousemove", onMousemove);
    k.maps.event.addListener(map, "click", onMapClick);
    k.maps.event.addListener(map, "dragstart", hideTip);

    // ── 관리자 그리기: ‘그 자리에서 완료’(더블클릭·우클릭) + 고무줄 선 정리 ─────────
    //   카카오 SDK 이벤트에는 dblclick·contextmenu 가 없어 지도 컨테이너 DOM 에 직접 건다.
    //   그리는 중이 아니면(일반 방문자·일반 관람) 아무 동작도 가로채지 않는다.
    const drawingNow = (): AdminMapConfig | null => {
      const a = adminRef.current;
      return a?.adding && a.draft && a.draft.length > 0 ? a : null;
    };
    /** 그 자리에서 완료 — 패널·도구 막대의 ‘완료’와 같은 동작(꼭짓점 3개 이상일 때만) */
    const finishInPlace = () => {
      const a = drawingNow();
      if (!a?.draft || a.draft.length < 3) return;
      adminCursorRef.current = null;
      a.onFinishByFirstPoint();
    };
    /** 다음 틱에 완료 — 방금 클릭이 만든 꼭짓점이 상태에 반영된 뒤에 센다 */
    const finishInPlaceSoon = () => {
      window.setTimeout(finishInPlace, 0);
    };
    /** 따라다니던 고무줄 선(마지막 점 → 커서)을 지운다 */
    const dropRubberBand = () => {
      if (!adminCursorRef.current) return;
      adminCursorRef.current = null;
      draw();
    };
    const onMapDblClick = (ev: MouseEvent) => {
      if (!drawingNow()) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishInPlaceSoon();
    };
    const onMapContextMenu = (ev: MouseEvent) => {
      if (!drawingNow()) return;
      // 꼭짓점 핸들 위 우클릭은 ‘점 삭제’가 맡는다(핸들이 직접 처리)
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.("[data-vx],[data-mid]")) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishInPlaceSoon();
    };
    // 더블클릭·우클릭은 **래퍼**에서 받는다:
    //   첫 클릭이 찍은 꼭짓점 핸들(지도 위에 얹힌 다른 DOM)이 두 번째 클릭을 받아도,
    //   dblclick 은 두 번의 클릭 대상의 공통 조상(래퍼)으로 올라오기 때문이다.
    const wrap = wrapRef.current ?? el;
    wrap.addEventListener("dblclick", onMapDblClick);
    wrap.addEventListener("contextmenu", onMapContextMenu);
    // 마우스가 지도 밖(도구 막대·왼쪽/오른쪽 패널)으로 나가면 커서 위치를 버려 점선이 남지 않게 한다
    el.addEventListener("mouseleave", dropRubberBand);
    el.addEventListener("pointerleave", dropRubberBand);

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
      labelAtRef.current = { lat: NaN, lng: NaN };
      pinAtRef.current = { lat: NaN, lng: NaN };
      stationAtRef.current = { lat: NaN, lng: NaN };
      passthroughRef.current = { click: null, move: null };
      wrap.removeEventListener("dblclick", onMapDblClick);
      wrap.removeEventListener("contextmenu", onMapContextMenu);
      el.removeEventListener("mouseleave", dropRubberBand);
      el.removeEventListener("pointerleave", dropRubberBand);
      adminCursorRef.current = null;
      anchors.a.poly?.setMap(null);
      anchors.b.poly?.setMap(null);
      mo?.disconnect();
      anchorsRef.current = null;
      replaceAnchorsRef.current = null;
      canvas.remove();
      canvasRef.current = null;
      mapRef.current = null;
    };
  }, [draw, onFail]);

  // ── 관리자 그리기 단축키: Enter = 그 자리에서 완료, Escape = 취소 ────────────────
  //   · 그리는 중일 때만 동작한다(일반 관람·검색 입력 중에는 아무 키도 가로채지 않는다).
  //   · 초안을 지우는 일은 패널(ZoneExplorer)만 할 수 있어, Escape 는 같은 화면의 ‘취소’ 버튼을
  //     누른 것과 같게 처리한다(새 상태를 이 컴포넌트가 만들지 않는다).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const a = adminRef.current;
      if (!a?.adding || !a.draft) return;
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Enter") {
        if (a.draft.length < 3) return;
        e.preventDefault();
        adminCursorRef.current = null;
        a.onFinishByFirstPoint();
      } else if (e.key === "Escape") {
        e.preventDefault();
        adminCursorRef.current = null;
        document.querySelector<HTMLButtonElement>('[data-testid="admin-cancel"]')?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── 그리는 동안 카카오 지도 기본 ‘더블클릭 확대’를 끈다 -> 더블클릭은 ‘완료’로 쓴다 ──
  useEffect(() => {
    const map = mapRef.current as unknown as { setOptions?: (o: Record<string, unknown>) => void } | null;
    if (!map?.setOptions) return;
    const drawing = !!(admin?.adding && admin?.draft && admin.draft.length > 0);
    try {
      map.setOptions({ disableDoubleClickZoom: drawing });
    } catch {
      // 옵션을 모르는 SDK 버전이면 그냥 둔다(더블클릭 완료는 DOM 리스너가 그대로 처리한다)
    }
  }, [admin?.adding, admin?.draft]);

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

  /**
   * 프로그램으로 지도를 옮긴 뒤(점프 애니메이션 ~350ms) 기준점을 새 화면에 다시 놓는다.
   *   카카오는 큰 이동 뒤 벡터 레이어를 다시 그리지 않을 때가 있어(기준점 path 가 0×0 으로 남음)
   *   idle 이벤트만 믿으면 기준점이 옛 화면에 남아 경계가 엉뚱한 배율로 그려질 수 있다.
   */
  const settleView = useCallback(() => {
    window.setTimeout(() => {
      replaceAnchorsRef.current?.();
      draw();
    }, 430);
  }, [draw]);

  // ── 관리자 모드: 초안·저장 구역·선택이 바뀌면 즉시 다시 그리기 ─────────────
  useEffect(() => {
    draw();
  }, [admin?.draft, admin?.zones, admin?.selectedId, admin?.adding, draw]);

  // ── 관리자 구역으로 화면 맞추기(목록에서 골랐을 때) ────────────────────────
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    const req = admin?.fit;
    const list = admin?.zones;
    if (!k || !map || !req || !list) return;
    if (lastAdminFitRef.current === req.token) return;
    lastAdminFitRef.current = req.token;
    const z = list.find((v) => v.id === req.id);
    if (!z || z.ring.length < 3) return;
    const [[minLat, minLng], [maxLat, maxLng]] = ringBounds(z.ring);
    fitLatLngSpan(k, map, minLat, minLng, maxLat, maxLng, mapElRef.current);
    settleView();
  }, [admin?.fit, admin?.zones, settleView]);

  /** 화면 좌표 → 위도·경도 — draw 가 쓰는 변환과 같은 식(핸들 드래그용) */
  const clientToLatLng = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const view = viewRef.current;
    const el = mapElRef.current;
    if (!view || !el) return null;
    const box = el.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    if (view.pxPerLng > 0 && view.pxPerMerc < 0) {
      const lng = view.cLng + (x - view.p0x) / view.pxPerLng;
      const lat = unmercator((y - view.p0y) / view.pxPerMerc + view.m0);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    const k = sdkRef.current;
    const map = mapRef.current;
    if (k && map) {
      const ll = map.getProjection().coordsFromContainerPoint(new k.maps.Point(x, y));
      return [ll.getLat(), ll.getLng()];
    }
    return null;
  }, []);

  // ── 꼭짓점 드래그 — iPad 터치에서도 지도가 끌리지 않도록 포인터를 붙잡고 처리한다.
  //    래퍼(`touch-action:none`) + setPointerCapture 라 손가락이 핸들 밖으로 나가도 계속 따라온다.
  const onVertexDown = (e: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 미지원 시에도 move 이벤트는 온다 */
    }
    adminDragRef.current = { index, pointerId: e.pointerId, raf: 0, latest: null };
  };

  const onVertexMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = adminDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const ll = clientToLatLng(e.clientX, e.clientY);
    if (!ll) return;
    d.latest = ll;
    if (d.raf) return;
    d.raf = window.requestAnimationFrame(() => {
      const cur = adminDragRef.current;
      if (!cur) return;
      cur.raf = 0;
      if (cur.latest) adminRef.current?.onMovePoint(cur.index, cur.latest[0], cur.latest[1]);
    });
  };

  const onVertexUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = adminDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (d.raf) window.cancelAnimationFrame(d.raf);
    const last = d.latest ?? clientToLatLng(e.clientX, e.clientY);
    adminDragRef.current = null;
    if (last) adminRef.current?.onMovePoint(d.index, last[0], last[1]);
    adminCursorRef.current = null;
  };

  // ── 선택 구역 이름표 + 부드러운 이동 ────────────────────────────────────────
  //   이름표도 우리 DOM 레이어(z-index 100)에 둔다 — 카카오 오버레이에 두면 폴리곤 캔버스가
  //   위에 깔려 구역 안쪽에 있을 때 이름표가 구역 색에 반투명하게 덮였다.
  const labelHtml = useMemo(() => {
    if (!selectedZoneId) return "";
    const seoul = seoulZones.find((z) => z.id === selectedZoneId);
    const featured = zones.find((z) => z.id === selectedZoneId);
    const name = seoul?.name ?? featured?.name;
    if (!name) return "";
    const parcel = (seoul?.alias ?? []).find((a) => /\d+-\d+/.test(a));
    return `<b>${escapeHtml(name)}</b>${
      parcel ? `<span class="zone-name-sub"> · ${escapeHtml(parcel)}</span>` : ""
    }`;
  }, [selectedZoneId, seoulZones, zones]);

  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !selectedZoneId) {
      labelAtRef.current = { lat: NaN, lng: NaN };
      if (labelLayerRef.current) labelLayerRef.current.style.visibility = "hidden";
      return;
    }
    const seoul = seoulZones.find((z) => z.id === selectedZoneId);
    const featured = zones.find((z) => z.id === selectedZoneId);
    const zoneChanged = lastLabelZoneRef.current !== selectedZoneId;
    lastLabelZoneRef.current = selectedZoneId;
    const lat = seoul ? seoul.center[0] : featured?.polygon?.[0]?.[0];
    const lng = seoul ? seoul.center[1] : featured?.polygon?.[0]?.[1];
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    labelAtRef.current = { lat, lng };

    // 주소 핀으로 들어온 구역이면 화면은 핀(골목·건물명)에 맞춰 둔다 — 구역 전체는 ‘구역 전체 보기’ 버튼
    const pinned = addressPin && addressPin.zoneId === selectedZoneId;
    if (pinned) {
      draw();
      return;
    }
    // 핀만 지운 경우(같은 구역)에는 화면을 그대로 둔다 — 핀 지우기가 지도를 튕기게 하지 않는다
    if (!zoneChanged) {
      draw();
      return;
    }

    // 경계가 있으면 경계에 맞춰, 후보지는 점으로 이동
    if (seoul?.polygon && seoul.polygon.length >= 3) {
      fitBounds(k, map, seoul, mapElRef.current);
    } else if (seoul) {
      map.jump(new k.maps.LatLng(seoul.center[0], seoul.center[1]), 5, { animate: { duration: 350 } });
    }
    draw();
    settleView();
  }, [selectedZoneId, seoulZones, zones, addressPin, draw, settleView]);

  // ── ‘구역 전체 보기’ 요청 — 주소 핀 화면에서 구역 경계 전체로 넓힌다 ─────────
  //   요청 토큰이 **바뀐 순간에만** 움직인다(다른 구역을 골랐을 때 다시 맞추지 않도록).
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !selectedZoneId || !zoneFitRequest) return;
    if (lastFitReqRef.current === zoneFitRequest) return;
    lastFitReqRef.current = zoneFitRequest;
    const seoul = seoulZones.find((z) => z.id === selectedZoneId);
    const featured = zones.find((z) => z.id === selectedZoneId);
    const ring = seoul?.polygon ?? featured?.polygon;
    if (ring && ring.length >= 3) {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const r of [ring, ...(seoul?.parts ?? featured?.parts ?? [])]) {
        for (const [lat, lng] of r) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
      fitLatLngSpan(k, map, minLat, minLng, maxLat, maxLng, mapElRef.current);
      settleView();
    }
  }, [zoneFitRequest, selectedZoneId, seoulZones, zones, settleView]);

  // ── 주소 검색 핀 + 말풍선 ──────────────────────────────────────────────
  //   핀은 카카오 CustomOverlay 가 아니라 wrapper 안의 z-index 100 레이어에 둔다(z-index 전쟁 종결).
  //   화면 맞춤은 **핀 지점 중심으로 확대**(카카오 level 3) — 예전에는 구역 경계 전체를 담으려다
  //   지도가 너무 멀어져 사용자가 찾은 집·골목이 보이지 않았다. 구역 전체는 ‘구역 전체 보기’ 버튼.
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    if (!addressPin) {
      pinAtRef.current = { lat: NaN, lng: NaN };
      if (pinLayerRef.current) pinLayerRef.current.style.visibility = "hidden";
      return;
    }
    pinAtRef.current = { lat: addressPin.lat, lng: addressPin.lng };
    // 좌표를 먼저 잡고 한 번 그려 두면 말풍선이 지도보다 한 프레임 늦게 따라오지 않는다
    draw();
    map.jump(new k.maps.LatLng(addressPin.lat, addressPin.lng), addressPin.zoneId ? 3 : 4, {
      animate: { duration: 350 },
    });
    settleView();
  }, [addressPin, draw, settleView]);

  // ── 지하철역 핀 — 역 중심으로 확대(level 3~4) ───────────────────────────────
  //   역은 '구역 판정'이 아니라 기준점이다. 주변 정비구역을 한눈에 보도록 level 4(약 1km 폭)로
  //   맞추고, 역 자체는 핀으로 찍는다. 같은 역을 다시 골라도 화면이 흐트러지지 않게
  //   좌표가 같으면 이동하지 않는다.
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    if (!stationPin) {
      stationAtRef.current = { lat: NaN, lng: NaN };
      if (stationLayerRef.current) stationLayerRef.current.style.visibility = "hidden";
      draw();
      return;
    }
    const same =
      stationAtRef.current.lat === stationPin.lat && stationAtRef.current.lng === stationPin.lng;
    stationAtRef.current = { lat: stationPin.lat, lng: stationPin.lng };
    if (!same) {
      map.jump(new k.maps.LatLng(stationPin.lat, stationPin.lng), 4, { animate: { duration: 350 } });
    }
    draw();
    settleView();
  }, [stationPin, draw, settleView]);

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

  /** 관리자 초안 — JSX 에서 좁힌 타입으로 쓰기 위해 변수로 꺼내 둔다 */
  const adminDraft = admin?.draft ?? null;

  return (
    <div ref={wrapRef} className="kakao-map-wrap relative h-full w-full overflow-hidden rounded-xl">
      <div ref={mapElRef} className="h-full w-full" />

      {/* ── 선택 구역 이름표 — z-index 100 우리 레이어(폴리곤 캔버스 위) ── */}
      <div ref={labelLayerRef} style={PIN_LAYER_STYLE} aria-hidden>
        {labelHtml && (
          <div
            className="zone-name-label"
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              // 0×0 레이어 안의 절대배치 박스는 폭이 0 으로 잡혀 글자가 잘린다 → 내용 폭을 명시한다
              width: "max-content",
              transform: "translate(-50%,-6px)",
            }}
            dangerouslySetInnerHTML={{ __html: labelHtml }}
          />
        )}
      </div>

      {/* ── 주소 검색 핀 — 항상 최상단(불투명 흰 카드 + 드롭핀) ── */}
      <div ref={pinLayerRef} style={PIN_LAYER_STYLE}>
        {addressPin && (
          <div
            data-testid="address-pin"
            style={{ position: "absolute", left: 0, top: 0, width: "max-content" }}
            dangerouslySetInnerHTML={{ __html: addressPinHtml(addressPin) }}
          />
        )}
      </div>

      {/* ── 지하철역 핀 — 역 검색으로 고른 역(지도는 역 중심 level 3~4) ── */}
      <div ref={stationLayerRef} style={PIN_LAYER_STYLE}>
        {stationPin && (
          <div
            data-testid="station-pin"
            style={{ position: "absolute", left: 0, top: 0, width: "max-content" }}
            dangerouslySetInnerHTML={{ __html: stationPinHtml(stationPin) }}
          />
        )}
      </div>

      {/* 호버 툴팁 */}
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-[700] hidden max-w-[300px] rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
        style={{ display: "none" }}
      />

      {/* ── 관리자 그리기 안내 — 도구 막대가 숨는 좁은 화면(xl 미만)에서도 조작법을 보여준다 ── */}
      {admin?.adding && adminDraft && adminDraft.length > 0 && (
        <div
          data-testid="admin-draw-hint"
          className="pointer-events-none absolute left-1/2 top-2 z-[620] -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-300 bg-white/95 px-3 py-1 text-[11px] font-semibold text-sky-900 shadow-md xl:hidden"
        >
          지도 탭: 점 추가 · 더블클릭/우클릭/Enter: 완료 · Esc: 취소
        </div>
      )}

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

      {/* ── 관리자 모드: 꼭짓점 핸들 + 변 가운데 + 핸들(Ipad 터치 44px) ── */}
      {adminDraft && adminDraft.length > 0 && (
        <div
          ref={adminLayerRef}
          className="pointer-events-none absolute inset-0 z-[500]"
          style={{ touchAction: "none" }}
        >
          {adminDraft.map((_, i) => (
            <div
              key={`v${i}`}
              data-vx={i}
              className="absolute left-0 top-0"
              style={{ visibility: "hidden", willChange: "transform" }}
            >
              <button
                type="button"
                data-testid={`admin-vertex-${i}`}
                aria-label={`꼭짓점 ${i + 1} — 끌어서 옮기기`}
                title={`꼭짓점 ${i + 1} — 끌어서 옮기기 · 우클릭으로 삭제`}
                onPointerDown={(e) => onVertexDown(e, i)}
                onPointerMove={onVertexMove}
                onPointerUp={onVertexUp}
                onPointerCancel={onVertexUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  admin?.onRemovePoint(i);
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 44,
                  height: 44,
                  transform: "translate(-50%,-50%)",
                  touchAction: "none",
                  cursor: "grab",
                }}
                className="pointer-events-auto flex items-center justify-center rounded-full outline-none"
              >
                <span className="block h-4 w-4 rounded-full border-2 border-white bg-sky-700 shadow-[0_1px_4px_rgba(0,0,0,0.5)]" />
              </button>
              {adminDraft.length > 3 && (
                <button
                  type="button"
                  data-testid={`admin-vertex-del-${i}`}
                  aria-label={`꼭짓점 ${i + 1} 삭제`}
                  title="이 꼭짓점 삭제"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    admin?.onRemovePoint(i);
                  }}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 30,
                    height: 30,
                    transform: "translate(4px,-34px)",
                    touchAction: "none",
                  }}
                  className="pointer-events-auto flex items-center justify-center rounded-full border border-rose-300 bg-white text-[12px] font-bold text-rose-600 shadow"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {adminDraft.map((_, i) => (
            <div
              key={`m${i}`}
              data-mid={i}
              className="absolute left-0 top-0"
              style={{ visibility: "hidden", willChange: "transform" }}
            >
              <button
                type="button"
                data-testid={`admin-mid-${i}`}
                aria-label={`${i + 1}번째 변 가운데에 점 추가`}
                title="이 변 가운데에 점을 추가"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const a = adminDraft[i];
                  const b = adminDraft[(i + 1) % adminDraft.length];
                  if (!a || !b) return;
                  admin?.onInsertPoint(i + 1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 34,
                  height: 34,
                  transform: "translate(-50%,-50%)",
                  touchAction: "none",
                }}
                className="pointer-events-auto flex items-center justify-center rounded-full border border-sky-400 bg-white/95 pb-0.5 text-[15px] font-bold leading-none text-sky-700 shadow"
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

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
  fitLatLngSpan(k, map, minLat, minLng, maxLat, maxLng, container);
}

/** 경위도 사각형이 화면에 꽉 차도록 레벨을 정해 이동한다(주소 핀 + 구역 경계 공용) */
function fitLatLngSpan(
  k: KakaoSDK,
  map: KakaoMap,
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
  container: HTMLElement | null
) {
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
