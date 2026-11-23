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
import {
  AGE_CLASSES,
  AGE_MAX_LEVEL,
  AGE_MAX_TILES,
  AGE_TILE_DEG,
  ageClassIndex,
  type AgeBuilding,
  type BuildingAgeResponse,
} from "@/lib/building-age";
import { TYPE_COLORS, badgeColor, shortStage, shortZoneType, zoneStyle } from "./colors";
import Icon from "@/components/Icon";
import { addressPinHtml, parcelBubbleHtml, stationPinHtml, PIN_LAYER_STYLE } from "./address-pin";import { clipZoneToBox, hitTestZones, prepareZones, type PreparedZones } from "./prepare-zones";
import { SEOUL_BOUNDS, txPinKey, type AdminMapConfig, type DistrictStat, type JibunPin, type KakaoZoneMapProps, type MyListingPin, type TxMapPin } from "./props";
import type { AuctionMapPin } from "@/lib/auction-pins";
import JibunPinCard from "./JibunPinCard";
import DevPressureLayer from "./DevPressureLayer";
import { formatArea, ringAreaSqm, ringBounds, ringCentroid, ringContainsLatLng } from "@/lib/custom-zones";
import type {
  KakaoLatLng,
  KakaoMap,
  KakaoMouseEvent,
  KakaoPolygon,
  KakaoSDK,
} from "./kakao-loader";

/**
 * 매물 배지 레이어 — 지도 컨테이너 위 전체 크기 레이어(z-index 100).
 *  · 폴리곤은 캔버스(z-index 2)에 있으므로 그보다 위, 화면 UI(600~700)보다는 아래에 둔다.
 *  · 레이어 자체는 `transform` 을 쓰지 않는다(자식 배지마다 draw 가 좌표를 맞춘다).
 */
const BADGE_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 100,
  pointerEvents: "none" as const,
};

/**
 * 실거래 가격 핀 레이어 — 폴리곤 캔버스(2) 위, 매물 배지·이름표(100) 아래(z-index 95).
 *   · 핀이 배지·이름표를 가리지 않고, 구역 색에는 묻히지 않는 층을 고른다.
 *   · 레이어는 클릭을 통과시키고, 핀 버튼만 pointerEvents: auto 로 받는다.
 */
const TX_PIN_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 95,
  pointerEvents: "none" as const,
};

/**
 * 내 매물 핀 레이어 — 폴리곤 캔버스(2)·실거래 핀(95)·매물 배지(100) 위(z-index 102).
 *   · 「내 매물만 보기」일 때만 채워지고, 상담의 중심이라 배지·이름표보다 위에 둔다
 *     (핀을 눌러 펼친 카드가 다른 배지에 가리지 않게).
 */
const MY_PIN_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 102,
  pointerEvents: "none" as const,
};

/**
 * ⚖️ 경매 물건 핀 레이어 — 실거래 핀(95) 위, 매물 배지·이름표(100) 아래(z-index 96).
 *   · 실거래 핀과 같은 자리 규칙을 쓰지만 색을 앰버로 달리해 한눈에 구분된다.
 */
const AUCTION_PIN_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 96,
  pointerEvents: "none" as const,
};

/** 경매 핀 색 — 경매(⚖️)를 뜻하는 앰버 계열. 실거래 핀의 블루·보라와 갈린다 */
const AUCTION_PIN_ACCENT = "#b45309";

/** 실거래 핀 색 — 유형 구분(아파트=브랜드 블루, 연립·다세대=보라) */
const TX_PIN_COLORS: Record<string, string> = {
  아파트: "#0054A6",
  "연립·다세대": "#7c3aed",
};

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
  /** 테두리 색 */
  color: string;
  /** 채움 색 — 테두리보다 원색에 가깝다(사업유형 9색 팔레트) */
  fillColor: string;
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
/** 메르카토르 y 1단위당 각도 비 — 360/(2π) (= 180/π) */
const MERC_PER_DEG = 360 / (2 * Math.PI);

/**
 * 노후도 건물 Path2D 의 원점(서울 중심 부근).
 *  · Path2D 좌표를 (경도, 메르카토르y[라디안]) 그대로 넣으면 x축 1도와 y축 1라디안의 화면 배율이
 *    180/π 배 달라 선 굵기가 세로로 57배(~34px) 늘어난다. → y에 MERC_PER_DEG 를 곱해
 *    **두 축을 같은 단위(도)** 로 맞추고, setTransform 도 같은 비로 나눠 1:1 등방으로 그린다.
 *  · 동시에 원점을 빼 두면 Float32 좌표 정밀도 손실(수 m)도 사라져 외곽선이 정확해진다.
 */
const AGE_ORIGIN_LNG = 127;
const AGE_ORIGIN_M = mercator(37.55);

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

/**
 * 기본 구역 이름표 레이어 — 지도 위에 **늘** 떠 있는 `구역명 + 사업유형` 뱃지.
 *   · 폴리곤 캔버스(2)보다 위, 실거래 핀(95)·매물 배지(100)·선택 이름표(101)보다 아래(90).
 *   · 레이어는 클릭을 통과시키고, 이름표 버튼만 pointerEvents: auto 로 받는다.
 */
const ZONE_TAG_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 90,
  pointerEvents: "none" as const,
};

/**
 * 자치구 총 개수 뱃지 레이어 — 광역 화면(레벨 7 이상)의 유일한 지도 표시(z-index 92).
 *   · 이름표(90)보다 위에 두어 겹쳐도 카드가 가려지지 않게 한다(구역 이름표는 이 화면에서 숨긴다).
 *   · 레이어는 클릭을 통과시키고, 뱃지 버튼만 pointerEvents: auto 로 받는다.
 */
const DISTRICT_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 92,
  pointerEvents: "none" as const,
};

/** 이름표를 띄우는 구역의 최소 화면 크기(px) — 이보다 작은 구역은 확대하면 자연히 나타난다 */
const TAG_MIN_W = 6;
const TAG_MIN_H = 5;
/**
 * 한 화면에 띄우는 이름표 최대 개수 — 겹침 회피로 이미 줄지만 상한을 둬 이동 중 비용을 묶는다.
 *   · 카드형이 기본이 된 뒤로는 카드가 칩보다 세로로 4배 가까이 크므로 상한을 낮춰 지도가
 *     카드로 덮이지 않게 한다(넓은 화면 32개 · 폰 16개 — 실제로는 겹침 회피가 먼저 줄인다).
 */
const TAG_MAX_DESKTOP = 32;
const TAG_MAX_MOBILE = 16;
// ── 자치구 총 구역 수 뱃지 (2026-11-22 사용자 요청 — IMG_0737 재개발닷컴 참고) ────────
//   초기 화면(서울 전체, 카카오 레벨 8)에서는 구역 폴리곤·개별 구역 뱃지·⚖️ 경매 핀이
//   지도를 덮는다. 사용자는 이 화면에서 **구 단위로 어디에 몇 곳이 있는지**를 먼저 본다.
//   → 광역(레벨 7 이상)에서는 그것들을 모두 걷어 내고 `구 이름 + 총 개수` 2단 카드만 깐다.
//   · 7 이상: 구 뱃지 화면 · 6 이하: 기존처럼 구역 경계·이름표·경매 핀
//   · 노후도·개발압력 오버레이, 「내 매물만 보기」 는 구역 하나하나가 주인공인 화면이라
//     구 뱃지 화면을 켜지 않는다(기존 동작 그대로).
//   · 검색·클릭으로 구역을 골랐으면 그 구역 경계와 이름표는 그대로 보인다(선택은 늘 우선).
const DISTRICT_LEVEL_MIN = 7;
/** 구 뱃지 카드 크기(px) — 흰 윗칸(구 이름) + 오레오 블루 아랫칸(개수) */
const DISTRICT_W = 62;
const DISTRICT_H = 46;
/**
 * 배율별 구 뱃지 크기 비율 — 레벨 9 이상으로 더 물러나면 서울이 화면에서 작아져
 * 25개 카드가 서로 겹친다. 글자는 카드 안에서 함께 줄어들되(transform scale),
 * 레벨 8(기본 화면)에서는 원래 크기 그대로다.
 */
function districtScale(level: number): number {
  if (level <= 8) return 1;
  if (level === 9) return 0.8;
  if (level === 10) return 0.65;
  return 0.55;
}

/** 작은 글씨용 UI 고딕 스택 — globals.css 의 --font-ui 와 같은 순서로 맞춘다(측정 폭 = 화면 폭) */
const UI_FONT_STACK =
  "'Pretendard', 'Apple SD Gothic Neo', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', system-ui, sans-serif";
const G_FONT_STACK = `'Gmarket Sans', ${UI_FONT_STACK}`;
const TAG_FONT = `700 11px ${G_FONT_STACK}`;
const TAG_CHIP_FONT = `600 9px ${UI_FONT_STACK}`;
/** 이름표 높이(px) — 11px 글자 + 위아래 여백 2px + 테두리 */
const TAG_H = 17;

// ── 2단 오버랩 카드형 뱃지 (2026-11-21 사용자 스케치) ────────────────────────
//   흰 카드 **왼쪽 위 테두리에** 사업유형 캡슐(알약)이 살짝 걸쳐 앉고, 카드 안에는
//   구역명(굵게)과 진행단계(작은 회색)가 두 줄로 들어간다. 사업유형 색은 지도 폴리곤과
//   같은 TYPE_COLORS 원색을 캡슐 바탕으로 그대로 쓴다.
//   · 2026-11-21 사용자 피드백: 구·서울 단위(레벨 6~7)의 넓은 화면에서 1줄 칩만 나와 “계속 1단으로만
//     나온다” → 처음에는 동네 단위(레벨 4 이하)에서만 카드로 바꿨는데, 사용자가 주로 보는 화면이
//     그보다 넓어 카드를 한 번도 못 봤다. 그래서 **사실상 모든 배율에서 카드형을 기본**으로 띄운다.
//   · 지도가 카드로 덮이지 않게 하는 일은 ① 배율별 카드 최소 크기(cardMinSize — 물러날수록 완화),
//     ② `tag-layer` 겹침 회피 ③ 화면 크기별 개수 상한(TAG_MAX_*)이 맡는다. 면적이 큰 대표 구역부터
//     자리를 잡으므로 넓은 화면에서도 읽을 만한 구역 이름만 카드로 남는다.
const CARD_LEVEL_MAX = 14;
/** 캡슐 높이 · 흰 카드 높이 · 캡슐이 카드 위로 걸치는 높이(px) */
const CARD_PILL_H = 20;
const CARD_BODY_H = 50;
/** 캡슐이 흰 카드 위로 걸치는 높이 — "살짝"만(6px) 걸쳐 구역명을 가리지 않게 한다 */
const CARD_OVERLAP = 6;
/** 흰 카드가 시작하는 높이(카드 꼭대기 기준) = 캡슐 높이 − 걸침 */
const CARD_BODY_TOP = CARD_PILL_H - CARD_OVERLAP;
/** 카드 전체 높이 — 캡슐이 걸쳐 올라간 만큼까지 포함한다 */
const CARD_H = CARD_BODY_TOP + CARD_BODY_H;
/** 카드 좌우 여백 · 캡슐이 카드 왼쪽에서 들어오는 거리(px) */
const CARD_PAD_X = 10;
const CARD_PILL_LEFT = 10;
/** 카드를 앉히는 데 필요한 구역의 최소 화면 크기(px) — 동네 단위(레벨 4 이하) 기준.
 *  골목 안 작은 구역은 1줄 칩으로 남긴다. */
const CARD_MIN_W = 26;
const CARD_MIN_H = 16;

/**
 * 배율별 카드 최소 크기.
 *   · 광역으로 물러나면 구역이 화면에서 몇 px 되지 않는다 — 서울 전체(레벨 7~8)에서 1만㎡ 구역은
 *     3×3px 남짓이다. 여기서도 26×16 을 요구하면 모든 구역이 1줄 칩으로 떨어져, 넓은 화면에는
 *     카드가 하나도 안 나왔다(사용자 피드백의 원인).
 *   · 그래서 동네 단위(레벨 4)의 26×16 을 기준으로, 한 단계 물러날 때마다 0.62씩 낮춰 레벨 7
 *     이상에서는 이름표를 띄우는 최소치(6×5)까지 푼다. 무엇이 카드로 남는지는 면적이 큰 구역부터
 *     놓는 겹침 회피가 정한다 → 넓은 화면에서도 대표 구역만 카드로 남고 지도는 숨통이 트인다.
 */
function cardMinSize(level: number): { w: number; h: number } {
  const k = Math.min(1, Math.pow(0.62, Math.max(0, level - 4)));
  return { w: Math.max(TAG_MIN_W, CARD_MIN_W * k), h: Math.max(TAG_MIN_H, CARD_MIN_H * k) };
}
/** 카드 안 글자 크기 — 칩(11px)보다 한 단계 크게, 스케치의 비중을 따른다 */
const CARD_NAME_FONT = `700 15px ${G_FONT_STACK}`;
const CARD_STAGE_FONT = `500 10px ${UI_FONT_STACK}`;
const CARD_PILL_FONT = `600 10px ${UI_FONT_STACK}`;

/**
 * 사업유형 칩 문구 — 좁은 이름표에 들어가도록 짧게.
 *   · 색은 폴리곤과 같은 TYPE_COLORS 를 쓰므로 지도 아래 범례와 그대로 맞는다.
 */
const TAG_TYPE_TEXT: Record<string, string> = {
  재건축: "재건축",
  신통기획: "신통기획",
  모아타운: "모아타운",
  도공복: "도공복",
  일반재개발: "재개발",
  공공재개발: "공공재개발",
  가로주택: "가로주택",
  소규모: "소규모",
  역세권: "역세권",
  장기전세: "장기전세",
  "민간도심복합(성장거점형)": "민간복합",
  "민간도심복합(주거중심형)": "민간복합",
};

function tagTypeText(type?: string | null): string {
  if (!type) return "";
  return TAG_TYPE_TEXT[type] ?? (type.length > 5 ? type.slice(0, 5) : type);
}

/** 이름표에 넣을 구역명 — 긴 공식 명칭은 줄이고, 전문은 aria-label(스크린리더)로만 남긴다 */
function tagName(name: string): string {
  const s = name.trim();
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

/** 카드형 뱃지의 구역명 — 1줄 칩보다 조금 더 쓸 수 있지만, 카드가 지도를 덮지 않게 12자에서 자른다 */
function cardName(name: string): string {
  const s = name.trim();
  return s.length > 12 ? `${s.slice(0, 11)}…` : s;
}

/**
 * 카드형 뱃지 둘째 줄 — 진행단계를 사람이 읽는 말로 다듬는다.
 *   · 서울시 원자료는 `후보지선정`·`대상지선정(추진중)`처럼 붙여 쓴다 → ‘후보지 선정’처럼 띄어 쓴다
 *   · 괄호(추진중·일부 등)는 떼고, 긴 단계명은 12자에서 자른다(카드 폭이 지도를 덮지 않게)
 */
function cardStage(stage?: string | null): string {
  const raw = (stage ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (!raw) return "";
  const fixed = raw
    .replace(/^사업시행자\s*지정\s*철회.*$/, "시행자 지정 철회")
    .replace(/^후보지선정$/, "후보지 선정")
    .replace(/^대상지선정$/, "대상지 선정")
    .replace(/^관리처분계획인가$/, "관리처분 인가")
    .replace(/^기획완료$/, "기획 완료")
    .replace(/^조합설립인가\s*추진중$/, "조합설립 추진중")
    .replace(/^조합설립추진중$/, "조합설립 추진중");
  return fixed.length > 12 ? `${fixed.slice(0, 11)}…` : fixed;
}

/** 툴팁 한 줄: 신림1구역 · 재정비촉진구역 · 사업시행인가 · 22.3만㎡ (관악구) */
function labelLine(z: { name: string; kind: string; stage: string; area: number; gu?: string }) {
  const area = z.area >= 10000 ? `${(z.area / 10000).toFixed(1)}만㎡` : `${z.area.toLocaleString()}㎡`;
  return `${z.name} · ${z.kind} · ${z.stage} · ${area}${z.gu ? ` (${z.gu})` : ""}`;
}

/** 노후도 범례가 보여 주는 상태 */
type AgeStats = {
  /** 지금 지도에 칠해진 건물 수 */
  buildings: number;
  /** 연식 구간별 건물 수 (AGE_CLASSES 순서) */
  counts: number[];
  /** 지도가 너무 멀리 보여 건물을 그리지 않는 상태(더 확대하라는 안내) */
  tooFar: boolean;
  /** 응답을 기다리는 타일 수 */
  loading: number;
};

export default function KakaoZoneMap({
  zones,
  seoulZones,
  districtStats,
  selectedZoneId,
  onSelectZone,
  showCompleted = false,
  onToggleCompleted,
  completedCount = 0,
  addressPin,
  parcel,
  stationPin,
  zoneFitRequest,
  listingCounts,
  txPins = [],
  txPinsOn = true,
  onToggleTxPins,
  onSelectTxPin,
  activeTxPin,
  auctionPins = [],
  auctionPinsOn = false,
  onToggleAuctionPins,
  onSelectAuctionPin,
  activeAuctionPinId,
  jibunPickOn = false,
  onToggleJibunPick,
  onPickJibun,
  jibunPin,
  onCloseJibunPin,
  onOpenJibunHistory,
  onOpenJibunZone,
  jibunHistoryLoading = false,
  myPins = [],
  myPinsOn = false,
  onToggleMyPins,
  fitSeoulRequest,
  myFocusId,
  devPressureOn = false,
  onToggleDevPressure,
  devPressureFocus,
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
  /** 필지 '보는중' 말풍선 레이어 — 필지가 바뀔 때만 다시 그린다 */
  const parcelLabelRef = useRef<HTMLDivElement | null>(null);
  /** 이번 프레임에 말풍선을 앉힐 자리(필지 경계 상자 가운데) — ref 라 draw 가 다시 그려지지 않는다 */
  const parcelAtRef = useRef<{ lat: number; lng: number } | null>(null);
  /** 화면에서 필지가 차지하는 크기(px) — 아주 작으면 말풍선이 필지를 덮으므로 숨긴다 */
  const parcelPxRef = useRef<{ w: number; h: number } | null>(null);
  /** draw 가 읽는 필지 도형 — props 를 매 프레임 의존성으로 끌고 다니지 않는다 */
  const parcelRef = useRef<typeof parcel>(null);
  parcelRef.current = parcel ?? null;
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  /**
   * 선택 구역 이름표의 실제 크기(px) — 퍼센트(-50%) 가운데 정렬이 소수점 픽셀에 걸리지 않도록
   * 폭·높이 반을 정수 좌표에 되돌려 놓는 데 쓴다. 내용(labelHtml·모드)이 바뀌면 dirty 로 다시 잰다.
   */
  const labelSizeRef = useRef<{ w: number; h: number; dirty: boolean }>({ w: 0, h: 0, dirty: true });
  /**
   * 기본 구역 이름표(구역명 + 사업유형 뱃지) 레이어
   *   · 요소는 React 가 아니라 draw 가 직접 만들고 풀에서 재사용한다 — 지도를 옮길 때마다
   *     수십 개 버튼을 리렌더하면 이동이 끓긴다(이 파일의 다른 레이어도 같은 이유로 DOM 을 직접 만진다).
   */
  const tagLayerRef = useRef<HTMLDivElement | null>(null);
  /** 지금 화면에 떠 있는 이름표 요소(구역 id → 버튼) */
  const tagElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  /** 화면에서 사라진 이름표 요소 재사용 풀 */
  const tagPoolRef = useRef<HTMLButtonElement[]>([]);
  /** 이름표 글자 폭 측정 캐시(이름|유형 → px) — 매 프레임 measureText 를 줄인다 */
  const tagWRef = useRef<Map<string, number>>(new Map());
  /** 이름표 실제 DOM 크기(모드|이름|유형|단계 → w,h) — 가운데 정렬을 정수 픽셀에 맞추는 데 쓴다 */
  const tagSizeRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  /** 진단용 — 마지막 프레임의 이름표 배치 소요(ms). `?diag=1` 에서만 읽는다 */
  const tagMsRef = useRef(0);
  /** 이번 프레임에 놓인 이름표의 사각형(구역 id → 높이) — 매물 배지가 위로 비켜 놓는다 */
  const tagBoxRef = useRef<Map<string, { h: number }>>(new Map());
  /**
   * 자치구 총 개수 뱃지 — 광역(레벨 7 이상)에서만 깔린다.
   *   · stats 는 ZoneExplorer 가 필터·준공 토글을 반영해 넘긴다(합계 = 범례 총계).
   *   · 요소는 React 가 그리지만(카드 25개, onClick 이 필요), 위치와 표시 여부는 draw 가 정한다.
   */
  const districtLayerRef = useRef<HTMLDivElement | null>(null);
  const districtElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const districtStatsRef = useRef<DistrictStat[]>([]);
  /** 이번 프레임이 구 뱃지 화면인가 — 지도 클릭·호버 핸들러도 이 값을 본다 */
  const districtModeRef = useRef(false);
  /** draw 가 읽는 최신 prop 값(그리기는 ref 로만 본다 — draw 는 클로저를 만들지 않는다) */
  const devPressureRef = useRef(false);
  devPressureRef.current = !!devPressureOn;
  const myPinsOnRef = useRef(false);
  myPinsOnRef.current = !!myPinsOn;
  /** 매물 배지 레이어 + 배지 요소(구역 id → 버튼) — draw 가 매 프레임 좌표를 맞춘다 */
  const badgeLayerRef = useRef<HTMLDivElement | null>(null);
  const badgeElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const badgeAtRef = useRef<{ id: string; name: string; count: number; lat: number; lng: number }[]>([]);
  /** 실거래 가격 핀 레이어 + 핀 요소(거래 id → 래퍼) — draw 가 매 프레임 좌표를 맞춘다 */
  const txLayerRef = useRef<HTMLDivElement | null>(null);
  const txElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const txAtRef = useRef<TxMapPin[]>([]);
  /** 5년 이력 창에서 보고 있는 단지·지번 키 — 그 핀을 강조하고 겹침에서도 살린다 */
  const activeTxKeyRef = useRef<string>("");
  const activeTxKey = activeTxPin ? txPinKey(activeTxPin.umdNm, activeTxPin.jibun) : "";
  activeTxKeyRef.current = activeTxKey;
  /** ⚖️ 경매 물건 핀 레이어 + 핀 요소(좌표 키 → 래퍼) — draw 가 매 프레임 좌표를 맞춘다 */
  const auctionLayerRef = useRef<HTMLDivElement | null>(null);
  const auctionElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const auctionAtRef = useRef<AuctionMapPin[]>([]);
  /** draw 가 이번 프레임에 놓은 경매 핀 자리 — 실거래 핀이 그 위에 겹치지 않게 비킨다 */
  const auctionPlacedRef = useRef<{ x: number; y: number }[]>([]);
  /** 왼쪽 창에서 보고 있는 핀 — draw 가 이 핀을 맨 앞·강조로 놓는다 */
  const activeAuctionPinRef = useRef<string | null>(null);
  /** 「지번 찍기」로 꽂은 핀 레이어·요소 — draw 가 매 프레임 좌표를 맞춘다 */
  const jibunLayerRef = useRef<HTMLDivElement | null>(null);
  const jibunElRef = useRef<HTMLDivElement | null>(null);
  const jibunPinRef = useRef<JibunPin | null>(null);
  jibunPinRef.current = jibunPin ?? null;
  /** 지도 클릭·우클릭이 읽는 지번 찍기 상태 — draw 클로저보다 최신 값이 필요하다 */
  const pickRef = useRef<{ on: boolean; pick: ((lat: number, lng: number) => void) | null }>({
    on: false,
    pick: null,
  });
  pickRef.current = { on: jibunPickOn, pick: onPickJibun ?? null };
  /** 지금 펼쳐 둔 핀 상세 카드(거래 id) — 하나만 열린다 */
  const [openPinId, setOpenPinId] = useState<string | null>(null);
  /** draw() 가 읽는 ‘펼쳐 둔 핀’ — 클로저 대신 ref 로 넘긴다 */
  const openPinRef = useRef<string | null>(null);
  /** 내 매물 핀 레이어 + 핀 요소(매물 id → 래퍼) — draw 가 매 프레임 좌표를 맞춘다 */
  const myLayerRef = useRef<HTMLDivElement | null>(null);
  const myElsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** 지금 레이어에 놓을 내 매물 핀 — 토글이 꺼지면 빈 배열 */
  const myAtRef = useRef<MyListingPin[]>([]);
  /** 내 매물 핀에서 펼쳐 둔 상세 카드(매물 id) */
  const [openMyId, setOpenMyId] = useState<string | null>(null);
  const openMyRef = useRef<string | null>(null);
  /** 마지막으로 처리한 서울 전체 보기 요청 토큰 */
  const lastSeoulFitRef = useRef(0);
  /** 마지막으로 펼친 내 매물 핀 요청 */
  const lastMyFocusRef = useRef<string | null>(null);
  /** 지금 레이어에 놓인 핀·이름표의 좌표 (draw 에서 읽는다) */
  const pinAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
  /** 지금 역 핀 레이어에 놓인 좌표 */
  const stationAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
  /** 마지막으로 처리한 ‘구역 전체 보기’ 요청 토큰 */
  const lastFitReqRef = useRef(0);
  /**
   * 지도 위에서 구역을 **직접 눌러** 고른 순간 — 이때는 화면(줌·위치)을 그대로 둔다.
   *   (검색·목록·딥링크로 이동할 때만 화면을 맞춘다. 예전에는 클릭만 해도 fitBounds 가 돌아
   *    지도가 한두 단계씩 축소됐다 — “구역을 클릭하면 지도가 작아진다”의 원인)
   */
  const mapClickZoneRef = useRef<{ id: string; t: number } | null>(null);
  /** 이름표·화면 맞춤을 마지막으로 적용한 구역 — 핀만 바뀐 경우(핀 지우기) 화면을 흔들지 않으려고 */
  const lastLabelZoneRef = useRef<string | undefined>(undefined);
  const labelAtRef = useRef<{ lat: number; lng: number }>({ lat: NaN, lng: NaN });
  const bufRef = useRef<Float32Array>(new Float32Array(4096));
  const viewRef = useRef<View | null>(null);
  const hoverRef = useRef<string | null>(null);
  /** 스카이뷰(항공사진) 중인지 — 위성 위에서는 구역 채움을 옅게 해 실제 모습이 보이게 한다 */
  const skyviewRef = useRef(false);
  /** 노후도 오버레이가 켜져 있는지 — draw 가 매 프레임 읽는다 */
  const agingRef = useRef(false);
  /** 노후도 타일 캐시 — 타일 키 `tx,ty` → 그 타일에서 받은 건물들(세션 동안 유지) */
  const ageTilesRef = useRef<Map<string, { buildings: AgeBuilding[]; visible: boolean }>>(new Map());
  /** 응답을 기다리는 타일 키 — 같은 타일을 두 번 부르지 않는다 */
  const agePendingRef = useRef<Set<string>>(new Set());
  /** 타일별 실패 횟수 — 두 번 실패한 타일은 이번 방문에서 다시 부르지 않는다(장애 때 요청 폭주 방지) */
  const ageTriesRef = useRef<Map<string, number>>(new Map());
  /** 아직 받지 않은 타일 대기열(화면 중심부터) */
  const ageQueueRef = useRef<string[]>([]);
  /** 타일 받기 루프가 도는 중인지 — 동시에 두 개가 돌지 않게 */
  const ageRunningRef = useRef(false);
  /** 받은 타일을 합쳐 만든 연식 구간별 Path2D (월드좌표: 경도, 메르카토르 y) */
  const agePathsRef = useRef<{ paths: Path2D[]; counts: number[] } | null>(null);
  /** 새 타일이 도착했는지 — 다음 차례에 Path2D 를 다시 합친다 */
  const ageDirtyRef = useRef(false);
  /** 지도 effect(idle)에서 노후도 타일을 다시 계산하도록 넘겨주는 함수 */
  const ensureAgeTilesRef = useRef<(() => void) | null>(null);
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
  /** 노후도(건물 연식) 오버레이 — 지도 아래 툴바의 `노후도` 토글 */
  const [aging, setAging] = useState(false);
  /** 카카오 지도 인스턴스가 준비됐는지 — 개발압력 레이어가 지도 객체를 받아야 한다 */
  const [mapReady, setMapReady] = useState(false);
  /** 노후도 범례에 보여 줄 상태(받은 건물 수·구간별 수·확대 안내·불러오는 타일 수) */
  const [ageStats, setAgeStats] = useState<AgeStats>({ buildings: 0, counts: [], tooFar: false, loading: 0 });
  const [ready, setReady] = useState(false);
  /**
   * 2단 카드형 뱃지 모드(동네 단위 확대) — 선택 구역 이름표도 같은 카드로 그린다.
   *   draw 가 매 프레임 지도 레벨을 읽어 모드가 **바뀔 때만** setState 한다(리렌더 폭주 방지).
   */
  const [cardZoom, setCardZoom] = useState(false);
  const cardZoomRef = useRef(false);

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

    const mapLevel = map.getLevel();
    const wideOut = mapLevel >= 7;
    /**
     * 구 뱃지 화면인가 — 초기 서울 전체(레벨 8)에서 구역 대신 `구 이름 + 총 개수` 카드만 깐다.
     *   · 노후도·개발압력 오버레이, 「내 매물만 보기」 는 구역 하나하나를 보는 화면이라 기존 그대로 둔다.
     *   · 관리자 모드(경계 그리기·수정)도 기존 그림이 필요하다 — 켜 두지 않는다.
     */
    const districtMode =
      mapLevel >= DISTRICT_LEVEL_MIN &&
      !agingRef.current &&
      !devPressureRef.current &&
      !myPinsOnRef.current &&
      !adminRef.current;
    districtModeRef.current = districtMode;

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
    //   · 좌표는 반드시 **정수 픽셀**로 스냅한다 — 소수점 자리에 놓인 글자는 서브픽셀에서 다시 그려져
    //     흐려진다(예전엔 0.1px 단위로 반올림해 두어 이름표가 지도에 따라 번졌다).
    //   · translate3d 대신 2D translate — 불필요한 GPU 레이어 승격을 막아 글자가 선명하게 남는다.
    const placeOnMap = (node: HTMLElement | null, lat: number, lng: number) => {
      if (!node) return;
      const x = p0x + (lng - lng0) * pxPerLng;
      const y = p0y + (mercator(lat) - m0) * pxPerMerc;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const far = x < -260 || x > cw + 260 || y < -260 || y > ch + 260;
      node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      node.style.visibility = far ? "hidden" : "visible";
    };
    /**
     * 선택 구역 이름표 — 자식이 스스로 `translate(-50%, 50%)` 로 가운데를 잡으므로,
     * 레이어는 폭·높이 반의 소수 부분을 미리 더한 자리에 놓는다 → 최종 글자 상자가 정수 픽셀에 떨어진다.
     * 크기는 내용이 바뀔 때만 잰다(매 프레임 측정은 지도 이동 중 레이아웃을 다시 돌린다).
     */
    const placeLabel = () => {
      const node = labelLayerRef.current;
      if (!node) return;
      const { lat, lng } = labelAtRef.current;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        node.style.visibility = "hidden";
        return;
      }
      const x = p0x + (lng - lng0) * pxPerLng;
      const y = p0y + (mercator(lat) - m0) * pxPerMerc;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        node.style.visibility = "hidden";
        return;
      }
      if (labelSizeRef.current.dirty) {
        const el = node.firstElementChild as HTMLElement | null;
        if (el && el.offsetWidth > 0) {
          labelSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight, dirty: false };
        }
      }
      const { w, h } = labelSizeRef.current;
      // 카드형은 덩어리 중심이 본문보다 7px 위 — 그만큼 내려 본문을 구역 중심에 맞춘다
      const dy = cardZoomRef.current ? 7 : 0;
      const tx = Math.round(x - w / 2) + w / 2;
      const ty = Math.round(y - h / 2 - dy) + h / 2 + dy;
      node.style.transform = `translate(${tx}px,${ty}px)`;
      const far = x < -260 || x > cw + 260 || y < -260 || y > ch + 260;
      node.style.visibility = far ? "hidden" : "visible";
    };
    placeLabel();
    placeOnMap(pinLayerRef.current, pinAtRef.current.lat, pinAtRef.current.lng);
    placeOnMap(stationLayerRef.current, stationAtRef.current.lat, stationAtRef.current.lng);

    // 필지 '보는중' 말풍선 — 필지 가운데에 앉히되, 화면에서 필지가 손톱만 하면 숨긴다
    const parcelLayer = parcelLabelRef.current;
    if (parcelLayer) {
      const at = parcelAtRef.current;
      const px = parcelPxRef.current;
      const tooSmall = !px || Math.max(px.w, px.h) < 18;
      if (!at || tooSmall) parcelLayer.style.visibility = "hidden";
      else placeOnMap(parcelLayer, at.lat, at.lng);
    }

    // ── 기본 구역 이름표 — `구역명 + 사업유형` 을 **처음 화면부터** 띄운다 ──────────
    //   · 예전에는 마우스를 올려야(툴팁) 구역명이 보였다(사용자 요청으로 기본 표시).
    //   · 2,400곳을 다 찍으면 서울 전경이 글자로 새까맣게 되므로:
    //       ① 화면에 들어온 구역 중 화면 크기가 최소치(6×5px) 이상인 곳만,
    //       ② 면적이 큰 구역부터,
    //       ③ 놓인 이름표 사각형과 겹치는 곳은 건너뛴다 → 서로 가리지 않는 것만 남는다.
    //     줌인하면 작은 가로주택·모아타운도 ①을 넘어 자연스럽게 새로 나타난다.
    //   · 선택된 구역은 큰 이름표(유형·단계·지번)가 따로 떠 있어 기본 이름표를 걷어 중복을 막는다.
    //     (호버는 그대로 둔다 — 이름표 위에 커서가 오면 그 이름표가 사라져 깜빡였음)
    if (tagLayerRef.current) {
      const tagT0 = performance.now();
      const tagLayer = tagLayerRef.current;
      const selTag = selectedRef.current;
      // 카드형 뱃지를 쓰는 배율인지 — 이제 사실상 모든 배율에서 카드가 기본이다
      const level = mapLevel;
      const cardMode = level <= CARD_LEVEL_MAX;
      // 이번 배율에서 카드를 앉힐 수 있는 구역의 최소 화면 크기 — 물러날수록 기준이 낮아진다
      const cardMin = cardMinSize(level);
      if (cardZoomRef.current !== cardMode) {
        cardZoomRef.current = cardMode;
        setCardZoom(cardMode);
      }
      const tLng0 = lng0 + (0 - p0x) / pxPerLng;
      const tLng1 = lng0 + (cw - p0x) / pxPerLng;
      const tLat0 = unmercator((0 - p0y) / pxPerMerc + m0);
      const tLat1 = unmercator((ch - p0y) / pxPerMerc + m0);
      const tMinLat = Math.min(tLat0, tLat1) - 0.0006;
      const tMaxLat = Math.max(tLat0, tLat1) + 0.0006;
      const tMinLng = Math.min(tLng0, tLng1) - 0.0006;
      const tMaxLng = Math.max(tLng0, tLng1) + 0.0006;

      /** 1줄 칩의 폭(px) — 유형 칩 + 이름 + 여백. 같은 글자는 캐시한다. */
      const widthOf = (name: string, typeText: string) => {
        const key = `${name}|${typeText}`;
        const cached = tagWRef.current.get(key);
        if (cached) return cached;
        ctx.save();
        ctx.font = TAG_FONT;
        const nw = ctx.measureText(name).width;
        ctx.font = TAG_CHIP_FONT;
        const tw = typeText ? ctx.measureText(typeText).width + 8 + 4 : 0;
        ctx.restore();
        // 좌우 여백(4+6) + 테두리 2 + 안전 여유 2
        const w = Math.ceil(nw + tw + 14);
        if (tagWRef.current.size > 5000) tagWRef.current.clear();
        tagWRef.current.set(key, w);
        return w;
      };

      /**
       * 2단 카드형 뱃지의 크기(px) — 캡슐 폭과 흰 카드 폭 중 넓은 쪽이 카드 폭이 된다.
       *   · 흰 카드 = 구역명(15px 굵게) 또는 단계(10px) 중 넓은 줄 + 좌우 여백
       *   · 캡슐 = 사업유형(10px) + 좌우 여백 + 카드 왼쪽에서 들어오는 거리
       *   · 측정 글꼴은 화면과 같은 Gmarket Sans 로 맞춘다(아니면 카드 폭이 어긋나 겹친다)
       */
      const cardSizeOf = (name: string, typeText: string, stageText: string) => {
        const key = `card|${name}|${typeText}|${stageText}`;
        const cached = tagWRef.current.get(key);
        if (cached) {
          return { w: cached, h: CARD_H };
        }
        ctx.save();
        ctx.font = CARD_NAME_FONT;
        const nw = ctx.measureText(name).width;
        ctx.font = CARD_STAGE_FONT;
        const sw2 = stageText ? ctx.measureText(stageText).width : 0;
        ctx.font = CARD_PILL_FONT;
        const pw = typeText ? ctx.measureText(typeText).width + 18 : 0;
        ctx.restore();
        // 테두리 2 + 안전 여유 4 — 글꼴이 늦게 실려도 글자가 카드 밖으로 넘치지 않게 한다
        const bodyW = Math.ceil(Math.max(nw, sw2) + CARD_PAD_X * 2 + 6);
        const pillW = typeText ? Math.ceil(pw + CARD_PILL_LEFT) : 0;
        const w = Math.max(bodyW, pillW, 54);
        if (tagWRef.current.size > 5000) tagWRef.current.clear();
        tagWRef.current.set(key, w);
        return { w, h: CARD_H };
      };

      type TagCand = {
        id: string;
        x: number;
        y: number;
        w: number;
        /** 이름표 높이 — 카드형은 캡슐까지 포함한 전체 높이 */
        h: number;
        area: number;
        name: string;
        typeText: string;
        /** 카드형 둘째 줄(진행단계) — 1줄 칩에서는 빈 문자열 */
        stageText: string;
        /** 2단 카드형으로 그릴지 */
        card: boolean;
        color: string;
        full: string;
      };
      const cands: TagCand[] = [];
      /**
       * 후보 하나 — 1줄 칩으로 둘지 2단 카드로 그릴지 판단하는 곳은 여기 한 군데뿐이다
       * (폴리곤 구역과 점으로 그리는 미고시 후보지가 같은 규칙으로 그려진다).
       */
      const pushCand = (z: SeoulZone, x: number, y: number, sw: number, sh: number, keepInside = false) => {
        // 카드는 구역이 화면에서 카드만큼 자리를 가질 때만 띄운다 — 골목 안 작은 구역에
        // 100px짜리 카드를 얹으면 지도가 카드로 덮인다. 그 구역은 더 확대하면 카드로 나타난다.
        //   · 기준은 배율에 따라 낮아진다(cardMin) — 광역 화면에서 구역이 몇 px 이어도 대표
        //     구역은 카드로 보이게. 넓은 화면에서 전부 칩으로 떨어지던 원인이 이 고정 기준이었다.
        const card = cardMode && sw >= cardMin.w && sh >= cardMin.h;
        const name = card ? cardName(z.name) : tagName(z.name);
        // 카드 캡슐은 사용자가 쓰는 온전한 사업유형명(신속통합기획·일반재개발·민간도심복합)을 쓴다
        //   · 사업 방식이 아직 정해지지 않은 구역은 레코드의 badgeType(예: '신통모아미정')을 그대로 띄운다
        const typeText = z.badgeType
          ? z.badgeType
          : card
            ? shortZoneType(z.type)
            : tagTypeText(z.type);
        const stageText = card ? cardStage(z.stage) : "";
        const size = card ? cardSizeOf(name, typeText, stageText) : { w: widthOf(name, typeText), h: TAG_H };
        // 캡슐이 카드 위로 걸쳐 있어 덩어리 중심이 카드 본문보다 7px 위다 — 본문이 구역 중심에 오게 올린다
        const dy = card ? CARD_BODY_TOP / 2 : 0;
        // 화면 밖으로 밀려 있던 이름표를 교집합 중심으로 끌어온 경우에는,
        //   이름표가 화면 가장자리에서 잘리지 않도록 안쪽으로 붙여 둔다(글자 반쪽만 남는 꼴 방지).
        let px = x;
        let py = y - dy;
        if (keepInside) {
          const halfW = size.w / 2 + 3;
          const halfH = size.h / 2 + 3;
          px = Math.min(Math.max(px, halfW), Math.max(halfW, cw - halfW));
          py = Math.min(Math.max(py, halfH), Math.max(halfH, ch - halfH));
        }
        cands.push({
          id: z.id,
          x: px,
          y: py,
          w: size.w,
          h: size.h,
          area: z.area || 0,
          name,
          typeText,
          stageText,
          card,
          color: badgeColor(z.badgeType, z.type),
          full: labelLine(z),
        });
      };
      // 화면과 폴리곤의 교집합을 구할 때 쓰는 보이는 사각형(여백 없이)
      const visBox = {
        minLat: Math.min(tLat0, tLat1),
        maxLat: Math.max(tLat0, tLat1),
        minLng: Math.min(tLng0, tLng1),
        maxLng: Math.max(tLng0, tLng1),
      };
      for (const pz of districtMode ? [] : prepRef.current.zones) {
        if (pz.maxLat < tMinLat || pz.minLat > tMaxLat || pz.maxLng < tMinLng || pz.minLng > tMaxLng) continue;
        const z = pz.zone;
        // 선택 구역은 큰 이름표(유형·단계·지번)가 따로 떠 있다 — 기본 이름표를 겹치지 않게 걷어낸다.
        //   (호버는 그대로 둔다: 이름표 위에 커서가 오면 그 이름표가 사라져 깜빡였음)
        if (z.id === selTag) continue;
        // 화면 크기 — 위도는 메르카토르로 단조라 경계 상자 네 모서리로 정확히 구해진다
        const sw = (pz.maxLng - pz.minLng) * pxPerLng;
        const sh = (mercator(pz.minLat) - mercator(pz.maxLat)) * pxPerMerc;
        if (sw < TAG_MIN_W || sh < TAG_MIN_H) continue;
        const cLat0 = z.center && Number.isFinite(z.center[0]) ? z.center[0] : (pz.minLat + pz.maxLat) / 2;
        const cLng0 = z.center && Number.isFinite(z.center[1]) ? z.center[1] : (pz.minLng + pz.maxLng) / 2;
        let x = p0x + (cLng0 - lng0) * pxPerLng;
        let y = p0y + (mercator(cLat0) - m0) * pxPerMerc;
        let pulledIn = false;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -60 || x > cw + 60 || y < -30 || y > ch + 30) {
          // ── 구역 중심이 화면 밖 — 폴리곤이 화면에 걸쳐 있으면 교집합의 중심으로 이름표를 끌어온다 ──
          //   · 예전에는 여기서 그냥 건너뛰어, 큰 구역의 끝부분만 화면에 걸릴 때 경계는 보이는데
          //     이름표가 통째로 사라졌다(사용자 지적: (가칭)제기동 137-2 가로주택 구역).
          const piece = clipZoneToBox(pz, visBox);
          if (!piece) continue;
          const vw = (piece.maxLng - piece.minLng) * pxPerLng;
          const vh = (mercator(piece.minLat) - mercator(piece.maxLat)) * pxPerMerc;
          // 화면에 걸친 부분이 손톱만 하면 이름표를 얹지 않는다(가장자리에 글자만 붙는 꼴)
          if (vw < 28 || vh < 18) continue;
          x = p0x + (piece.lng - lng0) * pxPerLng;
          y = p0y + (mercator(piece.lat) - m0) * pxPerMerc;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          pulledIn = true;
        }
        pushCand(z, x, y, sw, sh, pulledIn);
      }
      // 경계 미고시 후보지(사당21 등) — 점으로 그려지는 구역도 이름은 늘 보이게
      //   (구 뱃지 화면에서는 개별 이름표를 깔지 않는다 — 구 카드가 그 자리를 대신한다)
      for (const z of districtMode ? [] : prepRef.current.points) {
        if (!z.center) continue;
        if (z.center[0] < tMinLat || z.center[0] > tMaxLat || z.center[1] < tMinLng || z.center[1] > tMaxLng) continue;
        if (z.id === selTag) continue;
        const x = p0x + (z.center[1] - lng0) * pxPerLng;
        const y = p0y + (mercator(z.center[0]) - m0) * pxPerMerc;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -60 || x > cw + 60 || y < -30 || y > ch + 30) continue;
        // 경계가 없어 화면 크기를 잴 수 없다 — 점으로 찍는 후보지도 확대했으면 카드로 이름을 보인다
        pushCand(z, x, y, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      }

      // 큰 구역부터 자리를 잡는다 — 멀리서 볼수록 주요 구역 이름이 먼저 남는다
      cands.sort((a, b) => b.area - a.area);

      const placedTag: { x0: number; y0: number; x1: number; y1: number }[] = [];
      // 선택 구역의 큰 이름표 자리도 비워 둔다(기본 이름표가 그 위에 겹치지 않게)
      //   · 이름표는 이제 기본 이름표와 같은 흰 칩을 앵커(구역 중심)에 **가운데** 놓는다 — 그 자리만 비운다.
      const lbl = labelAtRef.current;
      if (Number.isFinite(lbl.lat) && Number.isFinite(lbl.lng)) {
        const lx = p0x + (lbl.lng - lng0) * pxPerLng;
        const ly = p0y + (mercator(lbl.lat) - m0) * pxPerMerc;
        // 카드형 이름표는 카드 폭(최대 150px)·캡슐까지 걸치므로 그만큼 넓게 비운다
        const rw = cardMode ? 96 : 110;
        const rh = cardMode ? CARD_H / 2 + 6 : 12;
        placedTag.push({ x0: lx - rw, y0: ly - rh, x1: lx + rw, y1: ly + rh });
      }
      const chosen: TagCand[] = [];
      // 좁은 화면(폰)에서는 개수를 줄인다 — 지도가 작아 이름표가 화면을 다 덮었다
      const tagMax = cw < 560 ? TAG_MAX_MOBILE : TAG_MAX_DESKTOP;
      for (const c of cands) {
        // 카드는 그림자와 위로 걸친 캡슐까지 있어 칩보다 여유를 더 둔다 — 바짝 붙으면
        // 두 카드가 한 덩어리로 보인다(겹침 패딩을 카드 크기에 맞춘다).
        const pad = c.card ? 5 : 3;
        const hw = c.w / 2 + pad;
        const hh = c.h / 2 + pad;
        const x0 = c.x - hw;
        const x1 = c.x + hw;
        const y0 = c.y - hh;
        const y1 = c.y + hh;
        // 화면에 반쯤 걸친 이름표는 잘려 보인다 — 통째로 들어오는 자리만 쓴다(모바일에서 특히 지저분했음)
        if (x0 < 2 || x1 > cw - 2 || y0 < 2 || y1 > ch - 2) continue;
        let clash = false;
        for (const b of placedTag) {
          if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        placedTag.push({ x0, y0, x1, y1 });
        chosen.push(c);
        if (chosen.length >= tagMax) break;
      }

      // DOM 반영 — 이번에 안 보이는 요소는 숨겨 풀에 돌리고, 새 id 만 만들어 붙인다
      /**
       * 이름표를 **정수 픽셀** 자리에 앉힌다.
       *   · 예전: `translate3d(소수점px) … translate(-50%,-50%)` — 폭이 홀수인 이름표는 가운데
       *     정렬이 .5px 에 걸려, 브라우저가 글자를 서브픽셀 위치에서 다시 그리며 뭉개졌다.
       *     IMG_0732 에서 같은 화면의 왼쪽 뱃지는 또렷하고 ‘한남하이츠’만 흔들린 이유다.
       *   · 이름표의 실제 DOM 폭·높이를 한 번 재어(내용이 바뀔 때만) 반 픽셀을 잘라낸 좌표를 쓴다.
       */
      const placeTag = (node: HTMLButtonElement, c: TagCand) => {
        const sizeKey = node.dataset.key ?? `${c.w}|${c.h}`;
        let sz = tagSizeRef.current.get(sizeKey);
        if (!sz) {
          const mw = node.offsetWidth;
          const mh = node.offsetHeight;
          sz = mw > 0 && mh > 0 ? { w: mw, h: mh } : { w: c.w, h: c.h };
          if (tagSizeRef.current.size > 800) tagSizeRef.current.clear();
          tagSizeRef.current.set(sizeKey, sz);
        }
        node.style.transform = `translate(${Math.round(c.x - sz.w / 2)}px,${Math.round(c.y - sz.h / 2)}px)`;
      };
      const keep = new Set(chosen.map((c) => c.id));
      for (const [id, node] of tagElsRef.current) {
        if (keep.has(id)) continue;
        node.style.visibility = "hidden";
        tagElsRef.current.delete(id);
        tagPoolRef.current.push(node);
        if (tagPoolRef.current.length > 90) tagPoolRef.current.shift()?.remove();
      }
      tagBoxRef.current.clear();
      for (const c of chosen) {
        let node = tagElsRef.current.get(c.id) ?? null;
        if (!node) {
          node = tagPoolRef.current.pop() ?? null;
          if (!node) {
            node = document.createElement("button");
            node.type = "button";
            node.className = "zone-tag";
            node.dataset.testid = "zone-tag";
            node.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const id = node?.dataset.zoneId;
              if (!id) return;
              // 지도 위 뱃지도 ‘지도에서 직접 누른 선택’이다 — 보던 줌·위치를 그대로 두고 그린다.
              //   (검색·목록으로 고를 때만 화면을 맞춘다. 이 표시가 없으면 클릭 뒤 fitBounds 가 돌아
              //    뱃지가 화면에서 몇 px 튀었다 — 바탕색뿐 아니라 자리도 그대로여야 한다.)
              mapClickZoneRef.current = { id, t: Date.now() };
              onSelectRef.current(id);
            });
            node.addEventListener("mouseenter", () => {
              const id = node?.dataset.zoneId;
              if (!id || hoverRef.current === id) return;
              hoverRef.current = id;
              draw();
            });
            node.addEventListener("mouseleave", () => {
              const id = node?.dataset.zoneId;
              if (!id || hoverRef.current !== id) return;
              hoverRef.current = null;
              draw();
            });
          }
          node.dataset.zoneId = c.id;
          // 1줄 칩 ↔ 2단 카드 — 모드가 바뀌면 클래스·마크업·크기를 함께 갈아 준다
          const mode = c.card ? "card" : "chip";
          const key = `${mode}|${c.name}|${c.typeText}|${c.stageText}`;
          if (node.dataset.mode !== mode || node.dataset.key !== key) {
            node.dataset.mode = mode;
            node.dataset.key = key;
            node.className = c.card ? "zone-tag is-card" : "zone-tag";
            node.style.width = c.card ? `${c.w}px` : "";
            node.style.height = c.card ? `${c.h}px` : "";
            node.innerHTML = c.card
              ? (c.typeText
                  ? `<span class="zone-tag-chip" style="background:${c.color}">${escapeHtml(c.typeText)}</span>`
                  : "") +
                `<span class="zone-tag-body"><b>${escapeHtml(c.name)}</b>${
                  c.stageText ? `<span class="zone-tag-stage">${escapeHtml(c.stageText)}</span>` : ""
                }</span>`
              : (c.typeText
                  ? `<span class="zone-tag-chip" style="background:${c.color}">${escapeHtml(c.typeText)}</span>`
                  : "") + `<b>${escapeHtml(c.name)}</b>`;
          }
          // 호버 툴팁(브라우저 기본 title 박스)도 띄우지 않는다 — 같은 전문은 눌러서 여는 상세 패널에 있다.
          //   긴 이름이 잘려도 스크린리더에는 전문이 전달되도록 aria-label 로만 남긴다.
          node.setAttribute("aria-label", c.full);
          node.style.visibility = "visible";
          tagLayer.appendChild(node);
          tagElsRef.current.set(c.id, node);
          placeTag(node, c);
        } else {
          placeTag(node, c);
          node.style.visibility = "visible";
        }
        tagBoxRef.current.set(c.id, { h: c.h });
      }
      // 선택 구역의 큰 이름표도 같은 자리를 차지한다 — 매물 배지가 이름표 위로 비켜 놓게
      const lblAt = labelAtRef.current;
      if (selTag && Number.isFinite(lblAt.lat) && Number.isFinite(lblAt.lng) && !tagBoxRef.current.has(selTag)) {
        tagBoxRef.current.set(selTag, { h: cardMode ? CARD_H : TAG_H });
      }
      tagMsRef.current = performance.now() - tagT0;
    }

    // ── 자치구 총 개수 뱃지 — 광역(레벨 7 이상) 화면의 주인공 ─────────────────────
    //   · 흰 위 칸에 구 이름, 오레오 블루 아래 칸에 지금 필터의 구역 수(IMG_0737 참고).
    //   · 자리: 구역들이 몰려 있는 곳의 가운데(ZoneExplorer 가 넘긴 lat·lng). 지도와 같은
    //     변환으로 매 프레임 옮기고, 서로 겹치면 위·아래·좌·우로 한 칸씩 비켜 앉힌다.
    //   · 레벨 9 이상으로 더 물러나면 서울이 작아져 카드가 겹친다 → 배율만큼 줄여 그린다.
    if (districtLayerRef.current) {
      const layer = districtLayerRef.current;
      const stats = districtStatsRef.current;
      if (!districtMode || stats.length === 0) {
        layer.style.display = "none";
      } else {
        layer.style.display = "";
        const s = districtScale(mapLevel);
        const bw = DISTRICT_W * s;
        const bh = DISTRICT_H * s;
        const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
        // 구역이 많은 구부터 앉힌다 — 자리가 모자랄 때 큰 카드가 먼저 제자리를 잡는다
        const ordered = [...stats].sort((a, b) => b.count - a.count);
        for (const d of ordered) {
          const node = districtElsRef.current.get(d.gu);
          if (!node) continue;
          const x = p0x + (d.lng - lng0) * pxPerLng;
          const y = p0y + (mercator(d.lat) - m0) * pxPerMerc;
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < -80 || x > cw + 80 || y < -60 || y > ch + 60) {
            node.style.visibility = "hidden";
            continue;
          }
          const cands: [number, number][] = [[0, 0]];
          for (let k = 1; k <= 4; k += 1) {
            cands.push([0, -(bh + 4) * k], [0, (bh + 4) * k], [-(bw + 4) * k, 0], [(bw + 4) * k, 0]);
          }
          let spot: { x: number; y: number } | null = null;
          for (const [dx, dy] of cands) {
            const x0 = x + dx - bw / 2;
            const y0 = y + dy - bh / 2;
            const x1 = x0 + bw;
            const y1 = y0 + bh;
            // 화면에 반쯤 걸친 카드는 잘려 보인다 — 통째로 들어오는 자리만 쓴다
            if (x0 < 2 || x1 > cw - 2 || y0 < 2 || y1 > ch - 2) continue;
            if (placed.some((b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0)) continue;
            spot = { x: x0, y: y0 };
            break;
          }
          if (!spot) {
            node.style.visibility = "hidden";
            continue;
          }
          placed.push({ x0: spot.x, y0: spot.y, x1: spot.x + bw, y1: spot.y + bh });
          node.style.transform = `translate(${Math.round(spot.x)}px,${Math.round(spot.y)}px) scale(${s})`;
          node.style.visibility = "visible";
        }
      }
    }

    // 매물 배지 — 구역 중심에 `🏠 매물 N`. 지도와 같은 변환으로 매 프레임 좌표를 맞추고,
    // 가까이서 겹치는 배지는 숨긴다(도시 전체 보기에서 글자가 뭉개지지 않게).
    //   · **선택한 구역 배지를 가장 먼저** 놓는다 — 옆 구역 배지에 밀려 사라지지 않게.
    if (badgeLayerRef.current) {
      const placedBadges: { x: number; y: number }[] = [];
      const sel = selectedRef.current;
      const allBadges = badgeAtRef.current;
      const orderedBadges = sel
        ? [...allBadges.filter((b) => b.id === sel), ...allBadges.filter((b) => b.id !== sel)]
        : allBadges;
      for (const b of orderedBadges) {
        const node = badgeElsRef.current.get(b.id);
        if (!node) continue;
        const x = p0x + (b.lng - lng0) * pxPerLng;
        // 같은 구역에 기본 이름표(구역명)가 떠 있으면 배지를 그 위로 비켜 놓는다
        let y = p0y + (mercator(b.lat) - m0) * pxPerMerc;
        const tagBox = tagBoxRef.current.get(b.id);
        if (tagBox) y -= tagBox.h / 2 + 12;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -140 || x > cw + 140 || y < -50 || y > ch + 50) {
          node.style.visibility = "hidden";
          continue;
        }
        let clash = false;
        for (const p of placedBadges) {
          if (Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 20) {
            clash = true;
            break;
          }
        }
        if (clash) {
          node.style.visibility = "hidden";
          continue;
        }
        placedBadges.push({ x, y });
        node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`;
        node.style.visibility = "visible";
      }
    }

    // ⚖️ 경매 물건 핀 — 실거래 핀보다 **먼저** 자리를 잡는다.
    //   · 그러면 아래 실거래 핀 고리가 이 경매 핀과 겹치면 비켜서고, 경매 핀이 실거래 핀에 가려지지 않는다.
    //   · 아래쪽 끝이 물건 지점에 닿게 translate(-50%,-100%).
    //   · 사용자 요구(2026-11-22): **구역 안 물건은 하나도 빠짐없이 다 보여야 한다.**
    //     그래서 겹친다고 숨기지 않고, 위로 한 칸씩 쌓아(stack) 밀어 올린다 — 왼쪽 창에서 보고 있는 핀은 맨 앞.
    if (auctionLayerRef.current) {
      // 구 뱃지 화면(광역) — ⚖️ 경매 핀·점을 모두 걷는다(지도에는 구 카드만 남긴다)
      auctionLayerRef.current.style.display = districtMode ? "none" : "";
      const placed: { x: number; y: number }[] = [];
      const activeId = activeAuctionPinRef.current;
      // 서울 전체(레벨 8 이상)처럼 멀리서 볼 때는 가격표 대신 작은 앰버 점으로 찍는다
      const compact = mapLevel >= 8;
      auctionLayerRef.current.dataset.compact = compact ? "1" : "0";
      const ordered = districtMode
        ? []
        : [...auctionAtRef.current].sort((a, b) => (a.id === activeId ? 0 : 1) - (b.id === activeId ? 0 : 1));
      const limW = compact ? 18 : 52;
      const limH = compact ? 16 : 26;
      const stepY = compact ? 12 : 24;
      for (const p of ordered) {
        const node = auctionElsRef.current.get(p.id);
        if (!node) continue;
        const x = p0x + (p.lng - lng0) * pxPerLng;
        const baseY = p0y + (mercator(p.lat) - m0) * pxPerMerc;
        if (!Number.isFinite(x) || !Number.isFinite(baseY) || x < -100 || x > cw + 100 || baseY < -80 || baseY > ch + 80) {
          node.style.visibility = "hidden";
          continue;
        }
        // 겹치면 위로 한 칸씩 올려 모든 핀이 화면에 남게 한다(최대 6칸, 그 뒤로는 그 자리에 그대로)
        let y = baseY;
        for (let k = 0; k < 6; k += 1) {
          if (!placed.some((q) => Math.abs(q.x - x) < limW && Math.abs(q.y - y) < limH)) break;
          y = baseY - stepY * (k + 1);
        }
        placed.push({ x, y });
        node.dataset.stacked = y !== baseY ? "1" : "0";
        node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
        node.style.visibility = "visible";
      }
      auctionPlacedRef.current = placed;
    }

    // 실거래 가격 핀 — 같은 변환으로 좌표를 맞춘다.
    //   · 핀은 아래쪽 끝이 거래 지점에 닿게 translate(-50%,-100%).
    //   · 겹치면 뒤에 오는 핀을 숨긴다(펼쳐 둔 핀 상세는 항상 우선).
    if (txLayerRef.current) {
      // 경매 핀이 이미 잡은 자리는 피해 놓는다(두 레이어가 서로 덮지 않게)
      const placedPins: { x: number; y: number }[] = [...auctionPlacedRef.current];
      const openId = openPinRef.current;
      const activeKey = activeTxKeyRef.current;
      const isActivePin = (p: TxMapPin) => !!activeKey && txPinKey(p.umdNm, p.jibun) === activeKey;
      // 5년 이력 창에서 보고 있는 핀은 언제나 맨 앞에서 자리를 잡는다(겹침으로 숨지 않게)
      const ordered = [...txAtRef.current].sort((a, b) => {
        const rank = (p: TxMapPin) => (isActivePin(p) ? 0 : p.id === openId ? 1 : 2);
        return rank(a) - rank(b);
      });
      for (const p of ordered) {
        const node = txElsRef.current.get(p.id);
        if (!node) continue;
        const x = p0x + (p.lng - lng0) * pxPerLng;
        const y = p0y + (mercator(p.lat) - m0) * pxPerMerc;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -90 || x > cw + 90 || y < -70 || y > ch + 70) {
          node.style.visibility = "hidden";
          continue;
        }
        let clash = false;
        for (const q of placedPins) {
          if (Math.abs(q.x - x) < 42 && Math.abs(q.y - y) < 24) {
            clash = true;
            break;
          }
        }
        if (clash && p.id !== openId && !isActivePin(p)) {
          node.style.visibility = "hidden";
          continue;
        }
        placedPins.push({ x, y });
        node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
        node.style.visibility = "visible";
      }
    }

    // 지번 핀 — 찍은 자리에 오레오 블루 펄스 핀(카드 포함). 지도 밖이면 숨긴다.
    if (jibunLayerRef.current) {
      const jp = jibunPinRef.current;
      const node = jibunElRef.current;
      if (!jp || !node) {
        if (node) node.style.visibility = "hidden";
      } else {
        const x = p0x + (jp.lng - lng0) * pxPerLng;
        const y = p0y + (mercator(jp.lat) - m0) * pxPerMerc;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -150 || x > cw + 150 || y < -150 || y > ch + 150) {
          node.style.visibility = "hidden";
        } else {
          node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`;
          node.style.visibility = "visible";
        }
      }
    }

    // ── 내 매물 핀 ──────────────────────────────────────────────────────────
    //   · 아래쪽 끝이 매물 지점에 닿게 translate(-50%,-100%).
    //   · 같은 건물·같은 동에 여러 건이 몰려 있어 그대로 두면 핀이 겹친다 → 작은 오프셋을
    //     차례로 시도해 겹치지 않는 자리를 찾는다. 다 찾아도 겹치면(아주 멀리 축소한 경우)
    //     숨기지 않고 제자리에 둔다 — 「내 매물 63건」이 한 장에 다 보여야 하기 때문.
    if (myLayerRef.current) {
      const placedMy: { x: number; y: number }[] = [];
      const openId = openMyRef.current;
      // 서울 전체(레벨 8 이상)처럼 멀리서 볼 때는 두 번째 줄(유형·면적)을 CSS 로 감춰 핀이 서로 덜 가리게 한다
      const compact = map.getLevel() >= 8;
      myLayerRef.current.dataset.compact = compact ? "1" : "0";
      myLayerRef.current.dataset.level = String(map.getLevel());
      const ordered = openId
        ? [...myAtRef.current.filter((p) => p.id === openId), ...myAtRef.current.filter((p) => p.id !== openId)]
        : myAtRef.current;
      const OFFSETS: [number, number][] = [
        [0, 0],
        [14, -9],
        [-14, -9],
        [14, 9],
        [-14, 9],
        [28, -18],
        [-28, -18],
        [28, 18],
        [-28, 18],
        [42, 0],
        [-42, 0],
      ];
      for (const p of ordered) {
        const node = myElsRef.current.get(p.id);
        if (!node) continue;
        const x = p0x + (p.lng - lng0) * pxPerLng;
        const y = p0y + (mercator(p.lat) - m0) * pxPerMerc;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -120 || x > cw + 120 || y < -90 || y > ch + 90) {
          node.style.visibility = "hidden";
          continue;
        }
        let ox = 0;
        let oy = 0;
        let placed = false;
        for (const [dx, dy] of OFFSETS) {
          const clash = placedMy.some((q) => Math.abs(q.x - (x + dx)) < 58 && Math.abs(q.y - (y + dy)) < 19);
          if (!clash) {
            ox = dx;
            oy = dy;
            placed = true;
            break;
          }
        }
        const pinEl = node.firstElementChild as HTMLElement | null;
        // 서울 전체 보기에서 자리가 없는 핀은 가격표 대신 작은 점으로 — 63건 위치가 모두 남는다
        if (!placed && compact) {
          if (pinEl) pinEl.dataset.dot = "1";
          node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`;
          node.style.visibility = "visible";
          node.style.zIndex = "1";
          continue;
        }
        if (pinEl) pinEl.dataset.dot = "0";
        placedMy.push({ x: x + ox, y: y + oy });
        node.style.transform = `translate(${Math.round(x + ox)}px,${Math.round(y + oy)}px) translate(-50%,-100%)`;
        node.style.visibility = "visible";
        node.style.zIndex = p.id === openId ? "3" : "1";
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // ── 노후도(건물 연식) — 구역 채움보다 **아래**에 깐다(구역 경계선이 위로 올라오게) ────────
    //   타일에서 받은 건물들을 연식 구간별 Path2D 하나로 미리 합쳐 두었으므로,
    //   여기서는 지도의 아핀 변환을 ctx.setTransform 으로 **그대로** 걸고 구간마다 한 번만 fill 한다.
    //   Path2D 좌표는 (경도-원점, (메르카토르y-원점)×MERC_PER_DEG) 이므로, y 배율을 같은 비로
    //   나눠야 두 축의 화면 배율이 1:1 로 맞는다(그러지 않으면 선 굵기가 세로로 57배 늘어난다).
    //    건물이 1만 동이어도 프레임당 fill 은 5번 — 이동·확대 중에도 끊기지 않는다.)
    if (agingRef.current) {
      const ap = agePathsRef.current;
      if (ap) {
        ctx.save();
        ctx.setTransform(
          dpr * pxPerLng,
          0,
          0,
          dpr * (pxPerMerc / MERC_PER_DEG),
          dpr * (p0x + (AGE_ORIGIN_LNG - lng0) * pxPerLng),
          dpr * (p0y + (AGE_ORIGIN_M - m0) * pxPerMerc)
        );
        // 두 축 배율의 크기가 같으므로(등방) 선 굵기 하나로 x·y 가 같은 두께가 된다
        const lineW = 0.6 / Math.max(1e-9, Math.abs(pxPerLng));
        for (let i = 0; i < ap.paths.length; i++) {
          const path = ap.paths[i];
          const cls = AGE_CLASSES[i];
          if (!path || !cls) continue;
          // 연식 미상은 옅게 — 범례 칩과 같은 회색이되 알파를 낮춰 노후도로 읽히지 않게
          ctx.fillStyle = rgba(cls.color, cls.fill);
          ctx.fill(path);
          ctx.strokeStyle = rgba(cls.color, cls.stroke);
          ctx.lineWidth = lineW;
          ctx.stroke(path);
        }
        ctx.restore();
      }
    }

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
    const activePaths: {
      path: Path2D;
      color: string;
      fillColor: string;
      weight: number;
      fillOpacity: number;
      dash: number[] | null;
    }[] = [];

    let buf = bufRef.current;

    for (const pz of data.zones) {
      if (pz.maxLat < vMinLat || pz.minLat > vMaxLat || pz.maxLng < vMinLng || pz.minLng > vMaxLng) continue;

      const z = pz.zone;
      const isSel = z.id === selId;
      const isHover = !isSel && z.id === hoverId;

      // 구 뱃지 화면(광역) — 구역 경계는 걷어 낸다. 다만 **검색·클릭으로 고른 구역**의 경계는
      //   그대로 그린다(선택한 곳이 어디인지 보여야 한다).
      if (districtMode && !isSel) continue;

      // 위치 참고용 근사원(DDP 1·2·3구역 등) — 정점이 원형인 점선 원이다.
      //   · 광역 줌아웃(레벨 7 이상): 실제 구역계가 아니므로 **아예 그리지 않는다**(점도 안 찍음).
      //     초기 화면에는 실제 구역계 다각형만 남아 지도가 깔끔해진다(2026-11-22 사용자 지시).
      //   · 동네 확대(레벨 6 이하)·선택·호버: 기존처럼 점선 원으로 — 근사 경계임을 드러낸다.
      //   ⚠️ 신수13구역·성내동 431·방배 467-19 처럼 공고·고시 도면에서 딴 실제 다각형은
      //      boundaryApprox 여도 여기서 걸러지지 않는다(isApproxCircleZone 이 정점 형태로 판정).
      if (pz.approxCircle && wideOut && !isSel && !isHover) continue;

      const st = zoneStyle(z.type, isSel || isHover, z.featured, zoomProxy, pz.completed, pz.approx);
      // 스카이뷰에서는 항공사진이 보이도록 채움을 옅게 (테두리는 그대로)
      if (skyviewRef.current) st.fillOpacity = Math.min(st.fillOpacity, isSel || isHover ? 0.3 : 0.16);
      // 노후도가 켜져 있으면 구역 채움을 거의 걷어낸다 — 건물 연식 색이 묻히지 않게(경계선은 그대로)
      if (agingRef.current) st.fillOpacity = Math.min(st.fillOpacity, isSel || isHover ? 0.2 : 0.05);
      const dash = pz.completed ? [4, 3] : pz.approx ? [7, 5] : null;

      let target: Path2D;
      let activePath: Path2D | null = null;
      if (isSel || isHover) {
        activePath = new Path2D();
        target = activePath;
      } else {
        const key = `${st.color}|${st.fillColor}|${st.weight}|${st.opacity}|${st.fillOpacity}|${dash ? "d" : "-"}`;
        let batch = batches.get(key);
        if (!batch) {
          batch = {
            color: st.color,
            fillColor: st.fillColor,
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
        activePaths.push({
          path: activePath,
          color: st.color,
          fillColor: st.fillColor,
          weight: st.weight,
          fillOpacity: st.fillOpacity,
          dash,
        });
      }
    }

    // 1) 일반 구역 — 스타일별로 한 번에 채우고 긋는다
    for (const b of batches.values()) {
      ctx.fillStyle = rgba(b.fillColor, b.fillOpacity);
      ctx.fill(b.path);
      ctx.setLineDash(b.dash ?? []);
      ctx.strokeStyle = rgba(b.color, b.strokeOpacity);
      ctx.lineWidth = b.weight;
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);

    // 2) 호버·선택 구역은 위에 한 번 더 — 눈에 띄게
    for (const a of activePaths) {
      ctx.setLineDash(a.dash ?? []);
      ctx.fillStyle = rgba(a.fillColor, a.fillOpacity);
      ctx.fill(a.path);
      ctx.strokeStyle = rgba(a.color, 1);
      ctx.lineWidth = a.weight;
      ctx.stroke(a.path);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, a.weight - 2);
      ctx.stroke(a.path);
    }
    ctx.setLineDash([]);

    // 2-2) 주소로 고른 **필지** — 지적 경계를 파란 반투명 + 진한 파란 선으로 칠한다(2026-11-23 요청)
    //   · 구역 폴리곤 위에 얹어야 "이 필지를 보고 있다"가 읽힌다(구역 채움 20%에 묻히지 않게).
    //   · 이름표는 캔버스가 아니라 DOM(아래 '보는중' 말풍선)이 그린다 — 글자가 선명해야 한다.
    const parcelShape = parcelRef.current;
    if (parcelShape && parcelShape.rings.length) {
      const toXY = (lat: number, lng: number): [number, number] => [
        p0x + (lng - lng0) * pxPerLng,
        p0y + (mercator(lat) - m0) * pxPerMerc,
      ];
      let visible = false;
      for (const ring of parcelShape.rings) {
        if (!ring || ring.length < 3) continue;
        let rMinX = Infinity;
        let rMaxX = -Infinity;
        let rMinY = Infinity;
        let rMaxY = -Infinity;
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = toXY(ring[i][0], ring[i][1]);
          if (x < rMinX) rMinX = x;
          if (x > rMaxX) rMaxX = x;
          if (y < rMinY) rMinY = y;
          if (y > rMaxY) rMaxY = y;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        if (rMaxX < -40 || rMinX > cw + 40 || rMaxY < -40 || rMinY > ch + 40) continue;
        visible = true;
        ctx.fillStyle = "rgba(59,130,246,0.30)";
        ctx.fill();
        // 흰 헤일로 한 겹 → 파란 외곽선: 건물·지번 글자가 많은 기본지도에서도 경계가 또렷하다
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = "#1d4ed8";
        ctx.stroke();
      }
      // 말풍선 자리 — 필지 상자 가운데(작게 보일 때는 말풍선을 숨긴다: 캔버스 안 루프에서 판단)
      const b = parcelShape.bounds;
      const [bx0, by0] = toXY(b.minLat, b.minLng);
      const [bx1, by1] = toXY(b.maxLat, b.maxLng);
      // 말풍선은 **남쪽 변 아래**에 붙인다 — 필지 가운데에 얹으면 작은 필지의 파란 채움을 다 덮는다
      parcelAtRef.current = visible ? { lat: b.minLat, lng: (b.minLng + b.maxLng) / 2 } : null;
      parcelPxRef.current = visible ? { w: Math.abs(bx1 - bx0), h: Math.abs(by1 - by0) } : null;
    } else {
      parcelAtRef.current = null;
      parcelPxRef.current = null;
    }
    ctx.setLineDash([]);

    // 3) 구역계 미고시 후보지(예: 사당21구역) — 줌 레벨에 따라 표현을 바꾼다
    //    · 광역 줌아웃(레벨 7 이상): 선택·호버만 강조하고, 나머지는 **아예 그리지 않는다**.
    //      초기 광역 화면에는 실제 구역계 다각형만 남긴다(작은 위치 점조차 안 찍어 지도를 가리지 않게 —
    //      2026-11-22 사용자 지시).
    //    · 동네 확대(레벨 6 이하): 기존처럼 점선 원(반지름 8~9px) + 흰 점 — 경계 미고시임을 한눈에.
    const pointsFarOut = wideOut;
    for (const z of data.points) {
      const x = p0x + (z.center[1] - lng0) * pxPerLng;
      const y = p0y + (mercator(z.center[0]) - m0) * pxPerMerc;
      if (x < -40 || y < -40 || x > cw + 40 || y > ch + 40) continue;
      const isSel = z.id === selId;
      const isHover = !isSel && z.id === hoverId;
      const color = TYPE_COLORS[z.type] ?? "#7c3aed";
      if (pointsFarOut && !isSel && !isHover) continue;
      // 구 뱃지 화면에서는 선택한 후보지만 점으로 보여 준다(나머지는 지도를 깨끗하게)
      if (districtMode && !isSel) continue;
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
          node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
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
    setMapReady(true);
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
        tagMs: () => tagMsRef.current,
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
      // 노후도가 켜져 있으면 지금 화면에 필요한 건물 타일을 확인한다(없으면 받아 온다)
      if (agingRef.current) ensureAgeTilesRef.current?.();
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

    /**
     * 구역 호버 툴팁은 두지 않는다(2026-11-22 사용자 요청 — “검은 바탕 박스가 2단 뱃지를 가리고,
     *   같은 정보가 오른쪽 상세 패널에 이미 있다”). 커서만 되돌리고, 폴리곤 하이라이트(hoverRef)는 남긴다.
     */
    const clearHoverCursor = () => {
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
        // 구 뱃지 화면(광역)에서는 구역 하이라이트도 두지 않는다 — 보이지 않는 경계가
        //   마우스를 따라다니면 지도가 어수선해진다.
        if (districtModeRef.current) {
          if (hoverRef.current !== null) {
            hoverRef.current = null;
            draw();
          }
          clearHoverCursor();
          return;
        }
        // 점으로 표시한 후보지 — 화면 반경 13px 안이면 잡는다
        //   (광역 줌아웃에서는 점이 3.5px 로 작아지지만, 클릭 반경은 13px 그대로 두어
        //    작은 점을 정확히 겨냥하지 않아도 선택된다 — 폴리곤 판정이 먼저라 정상 구역 클릭은 방해하지 않는다)
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

        if (!hit) {
          if (hoverRef.current !== null) {
            hoverRef.current = null;
            draw();
          }
          clearHoverCursor();
          if (adminRef.current?.adding) el.style.cursor = "crosshair";
          return;
        }

        if (hoverRef.current !== hit.id) {
          hoverRef.current = hit.id;
          draw();
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
            clearHoverCursor();
            adm.onFinishByFirstPoint();
            return;
          }
        }
        clearHoverCursor();
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
          clearHoverCursor();
          adm.onSelectZone(hitCustom);
          return;
        }
      }
      const data = prepRef.current;
      // ── 지번 찍기 모드: 구역 선택 대신 클릭한 자리에 지번 핀을 꽂는다 ──
      const pick = pickRef.current;
      if (pick.on && pick.pick) {
        clearHoverCursor();
        pick.pick(lat, lng);
        return;
      }
      // ── 구 뱃지 화면(광역): 지도 클릭으로 구역을 고르지 않는다 ──────────────
      //   경계를 걷어 낸 화면이라 ‘보이지 않는 구역’이 골라지면 엉뚱한 상세 창이 열린다.
      //   구 단위로 보려면 지도 위 구 뱃지를 누르면 된다(그 뱃지는 길 6으로 확대된다).
      if (districtModeRef.current) {
        clearHoverCursor();
        return;
      }
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
        clearHoverCursor();
        // 지도에서 직접 누른 선택 — 선택 효과에서 줌·이동을 하지 않도록 표시해 둔다.
        mapClickZoneRef.current = { id: hit.id, t: Date.now() };
        onSelectRef.current(hit.id);
        return;
      }
      // 구역 밖을 눌렀다 — 기본 모드에서도 그 자리의 지번을 찍어 준다(편의)
      if (pick.pick) {
        clearHoverCursor();
        pick.pick(lat, lng);
      }
    };

    passthroughRef.current = { click: onMapClick, move: onMousemove };
    k.maps.event.addListener(map, "mousemove", onMousemove);
    k.maps.event.addListener(map, "click", onMapClick);
    k.maps.event.addListener(map, "dragstart", clearHoverCursor);

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
      if (drawingNow()) {
        // 꼭짓점 핸들 위 우클릭은 ‘점 삭제’가 맡는다(핸들이 직접 처리)
        const t0 = ev.target as HTMLElement | null;
        if (t0?.closest?.("[data-vx],[data-mid]")) return;
        ev.preventDefault();
        ev.stopPropagation();
        finishInPlaceSoon();
        return;
      }
      // 그리는 중이 아니면 우클릭 = 지번 찍기(브라우저 기본 메뉴는 막는다)
      const pick = pickRef.current;
      if (!pick.pick) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.("[data-testid='jibun-pin-card'],[data-testid='tx-pin-card']")) return;
      ev.preventDefault();
      ev.stopPropagation();
      // 마지막 마우스 위치 → 없으면(터치 롱프레스) 이벤트 좌표를 컨테이너 기준으로 변환
      let at = adminCursorRef.current;
      if (!at) {
        try {
          const map0 = mapRef.current;
          const rect = el.getBoundingClientRect();
          if (map0) {
            const ll = map0
              .getProjection()
              .coordsFromContainerPoint(new k.maps.Point(ev.clientX - rect.left, ev.clientY - rect.top));
            if (ll) at = [ll.getLat(), ll.getLng()];
          }
        } catch {
          /* 좌표를 못 구하면 이번 우클릭은 건너뛴다 */
        }
      }
      if (!at) return;
      pick.pick(at[0], at[1]);
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

  // ── 자치구 뱃지 통계·특수 오버레이 변경 → 다시 그리기 ────────────────────────
  //   · 필터나 ‘준공 포함’ 이 바뀌면 구별 개수가 즉시 바뀌어야 한다(범례 합계와 일치).
  //   · 노후도·개발압력·내 매물만 보기가 켜지면 구 뱃지 화면을 끄고 기존 화면으로 돌아간다.
  useEffect(() => {
    districtStatsRef.current = districtStats ?? [];
    draw();
  }, [districtStats, draw]);

  useEffect(() => {
    devPressureRef.current = !!devPressureOn;
    myPinsOnRef.current = !!myPinsOn;
    draw();
  }, [devPressureOn, myPinsOn, draw]);

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

  // ── 매물 배지 — 매물이 있는 구역의 중심 목록 ────────────────────────
  //   · 좌표는 구역 중심(고시 구역 → 대표 구역 순). 경계 미고시 후보지도 중심이 있으면 찍는다.
  //   · 개수는 호출측(ZoneExplorer)이 필터를 반영해 넘긴다.
  const badgeZones = useMemo(() => {
    const counts = listingCounts ?? {};
    const out: { id: string; name: string; count: number; lat: number; lng: number }[] = [];
    const seen = new Set<string>();
    for (const z of seoulZones) {
      const count = counts[z.id];
      if (!count || !z.center || !Number.isFinite(z.center[0]) || !Number.isFinite(z.center[1])) continue;
      seen.add(z.id);
      out.push({ id: z.id, name: z.name, count, lat: z.center[0], lng: z.center[1] });
    }
    // 전수 목록에 없는 대표 구역(직접 만든 데이터)도 배지를 잃지 않게
    for (const z of zones) {
      const count = counts[z.id];
      if (!count || seen.has(z.id) || !z.center) continue;
      out.push({ id: z.id, name: z.name, count, lat: z.center[0], lng: z.center[1] });
    }
    return out;
  }, [listingCounts, seoulZones, zones]);
  badgeAtRef.current = badgeZones;

  // ── 실거래 가격 핀 ────────────────────────────────────────────────────────
  //   · 호출측(ZoneExplorer)이 구역 상세에서 계산한 ‘구역 안 거래’ 좌표를 넘긴다.
  //   · 토글이 OFF 면 목록을 비워 핀·상세 카드를 함께 감춘다(토글 자체는 남는다).
  const visibleTxPins = useMemo(() => (txPinsOn ? txPins : []), [txPins, txPinsOn]);
  txAtRef.current = visibleTxPins;
  openPinRef.current = openPinId;

  // ── ⚖️ 경매 물건 핀 ──────────────────────────────────────────────────
  //   · ZoneExplorer 가 고른 구역의 물건(광역이면 매칭된 전체)을 좌표로 묶어 넘긴다.
  //   · 토글이 OFF 면 목록을 비워 핀·카드를 함께 감추고, 토글 자체는 남긴다.
  const visibleAuctionPins = useMemo(
    () => (auctionPinsOn ? auctionPins : []),
    [auctionPins, auctionPinsOn]
  );
  auctionAtRef.current = visibleAuctionPins;
  /** 왼쪽 창에서 보고 있는 핀 — 강조 + 맨 앞 배치 */
  const activeAuctionId = activeAuctionPinId ?? null;
  activeAuctionPinRef.current = activeAuctionId;
  useEffect(() => {
    if (!auctionLayerRef.current) return;
    draw();
  }, [visibleAuctionPins, activeAuctionId, draw]);

  // 핀 목록이 바뀌면(구역 이동·토글) 자리를 다시 그린다 — 펼친 카드는 닫는다
  useEffect(() => {
    setOpenPinId(null);
  }, [visibleTxPins]);
  useEffect(() => {
    if (!txLayerRef.current) return;
    draw();
  }, [visibleTxPins, openPinId, draw]);

  // 5년 이력 창에서 단지를 고르면 그 실거래 핀으로 지도를 부드럽게 옮긴다(강조는 draw 가 한다)
  useEffect(() => {
    if (!activeTxKey) return;
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    const pin = visibleTxPins.find((p) => txPinKey(p.umdNm, p.jibun) === activeTxKey);
    if (!pin) return;
    try {
      map.panTo(new k.maps.LatLng(pin.lat, pin.lng));
    } catch {
      /* 지도가 아직 준비 전이면 다음 렌더에서 다시 시도한다 */
    }
  }, [activeTxKey, visibleTxPins]);

  // 지번 핀을 찍거나 지우면 자리를 다시 그린다
  useEffect(() => {
    if (!jibunLayerRef.current) return;
    draw();
  }, [jibunPin, draw]);

  // 매물이 늘거나 줄면 배지 자리를 다시 그린다(등록 직후 새로고침 없이 반영)
  useEffect(() => {
    if (!badgeLayerRef.current) return;
    draw();
  }, [badgeZones, draw]);

  // ── 내 매물 핀 ────────────────────────────────────────────────────────────
  //   · ZoneExplorer 가 `my-listings.json`(63건)을 넘긴다. 토글이 OFF 면 목록을 비워 핀·카드를 감춘다.
  //   · 핀은 우리 DOM 레이어(z-index 96)에 두고 draw 가 매 프레임 지도 좌표로 옮긴다.
  const visibleMyPins = useMemo(() => (myPinsOn ? myPins : []), [myPins, myPinsOn]);
  myAtRef.current = visibleMyPins;
  openMyRef.current = openMyId;

  // 목록이 바뀌면(토글·필터) 펼친 카드를 닫는다 — 다른 매물의 카드가 남지 않게
  useEffect(() => {
    setOpenMyId(null);
  }, [visibleMyPins]);
  useEffect(() => {
    if (!myLayerRef.current) return;
    draw();
  }, [visibleMyPins, openMyId, draw]);

  // ── 선택 구역 이름표 + 부드러운 이동 ────────────────────────────────────
  //   이름표도 우리 DOM 레이어(z-index 100)에 둔다 — 카카오 오버레이에 두면 폴리곤 캔버스가
  //   위에 깔려 구역 안쪽에 있을 때 이름표가 구역 색에 반투명하게 덮였다.
  //   · 앞에 **사업유형 뱃지**를 붙인다(신통기획→‘신속통합기획’ 표기) — 이름만 보고는
  //     이 구역이 모아타운인지 신통기획인지 알 수 없어 상세를 열어야 했다.
  // 이름표·화면 맞추기가 보는 선택 id — 관리자 모드에서 직접 그린 구역을 고르면 selectedZoneId 가
  // 비어 있어(선택은 selectedCustomId 로만 관리된다) 이름표가 안 떴다. 관리자 선택을 함께 본다.
  const labelZoneId = selectedZoneId ?? admin?.selectedId;

  const labelHtml = useMemo(() => {
    if (!labelZoneId) return "";
    const seoul = seoulZones.find((z) => z.id === labelZoneId);
    const featured = zones.find((z) => z.id === labelZoneId);
    // 관리자 모드에서 직접 그려 저장한 구역도 이름표를 보여준다 — 예전에는 서울시 데이터·대표 구역만
    // 찾아서 관리자 구역을 고르면 뱃지가 아예 안 떴다(2026-11-18 제보).
    const custom = admin?.zones?.find((z) => z.id === labelZoneId);
    const name = seoul?.name ?? featured?.name ?? custom?.name;
    if (!name) return "";
    const type = seoul?.type ?? featured?.type ?? custom?.type;
    const stage = seoul?.stage ?? featured?.stage ?? custom?.stage;
    const parcel = (seoul?.alias ?? []).find((a) => /\d+-\d+/.test(a));
    // 사업유형 칩은 **기본 이름표와 같은 문구·색**(tagTypeText + TYPE_COLORS)을 쓴다.
    //   · 예전에는 ‘유형 · 단계’를 한 칩에 넣고 이름표 전체를 진한 남색 판으로 그렸고,
    //     그 탓에 이름표를 누르면 뱃지 바탕색이 바뀐 것처럼 보였다(사용자 요청으로 흰 칩 유지).
    //   · 단계·지번은 칩 대신 이름 뒤 회색 글씨로 붙인다 — 뱃지는 그대로, 정보만 늘어난다.
    // 사업 방식이 아직 정해지지 않은 구역은 레코드의 badgeType 을 그대로 띄운다(예: 방배 467-19 '신통모아미정')
    const badgeType =
      seoul?.badgeType ?? (featured as { badgeType?: string } | undefined)?.badgeType;
    const typeText = badgeType ?? (cardZoom ? shortZoneType(type) : tagTypeText(type));
    // 카드형(동네 단위 확대)에서는 둘째 줄이 진행단계 문구가 된다 — 기본 카드 뱃지와 같은 말·같은 모양
    const stageLabel = cardZoom ? cardStage(stage) : shortStage(stage);
    const typeColor = badgeColor(badgeType, type);
    const badge = typeText
      ? `<span class="zone-type-badge" style="background:${typeColor}">${escapeHtml(typeText)}</span>`
      : "";
    const sub = [stageLabel, parcel && !name.includes(parcel) ? parcel : null].filter(Boolean).join(" · ");
    // 선택된 구역도 **같은 2단 카드**(흰 카드 + 사업유형 캡슐)로 보인다 — 바탕색은 바뀌지 않는다
    if (cardZoom) {
      return `${badge}<span class="zone-name-label-body"><b>${escapeHtml(name)}</b>${
        sub ? `<span class="zone-name-sub">${escapeHtml(sub)}</span>` : ""
      }</span>`;
    }
    return `${badge}<b>${escapeHtml(name)}</b>${
      sub ? `<span class="zone-name-sub"> · ${escapeHtml(sub)}</span>` : ""
    }`;
  }, [labelZoneId, seoulZones, zones, admin?.zones, cardZoom]);

  // 이름표 내용이 바뀌면 다음 draw 에서 크기를 다시 재게 한다 — 가운데 정렬을 정수 픽셀에 맞추는 근거
  useEffect(() => {
    labelSizeRef.current.dirty = true;
  }, [labelHtml, cardZoom]);

  // 웹 폰트가 늦게 실리면 글자 폭이 달라진다 — 실린 뒤 한 번 다시 재고 그린다
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      labelSizeRef.current.dirty = true;
      // 글자 폭 측정치도 대체 폰트로 잰 값이므로 버린다 — 지마켓 산스는 자폭이 넓어
      // 늦게 실린 폰트로 잰 폭을 그대로 쓰면 카드 오른쪽 글자가 테두리에 붙는다
      tagWRef.current.clear();
      tagSizeRef.current.clear();
      draw();
    });
    return () => {
      alive = false;
    };
  }, [draw]);

  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !labelZoneId) {
      labelAtRef.current = { lat: NaN, lng: NaN };
      if (labelLayerRef.current) labelLayerRef.current.style.visibility = "hidden";
      return;
    }
    const seoul = seoulZones.find((z) => z.id === labelZoneId);
    const featured = zones.find((z) => z.id === labelZoneId);
    // 관리자 구역은 서울시 데이터에 없으므로 링 중심(평균)을 이름표 위치로 쓴다
    const custom = admin?.zones?.find((z) => z.id === labelZoneId);
    const zoneChanged = lastLabelZoneRef.current !== labelZoneId;
    lastLabelZoneRef.current = labelZoneId;
    const customCenter =
      custom && custom.ring.length >= 3
        ? [
            custom.ring.reduce((s, p) => s + p[0], 0) / custom.ring.length,
            custom.ring.reduce((s, p) => s + p[1], 0) / custom.ring.length,
          ]
        : undefined;
    const lat = seoul ? seoul.center[0] : featured?.polygon?.[0]?.[0] ?? customCenter?.[0];
    const lng = seoul ? seoul.center[1] : featured?.polygon?.[0]?.[1] ?? customCenter?.[1];
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    labelAtRef.current = { lat, lng };

    // 관리자 모드에서 직접 그린 구역만 고른 경우 — 화면 이동은 관리자 ‘맞추기’(admin.fit)가 맡는다.
    // 여기서는 이름표 위치만 잡고 그린다(이중으로 화면이 튀지 않게).
    if (!selectedZoneId && custom) {
      draw();
      return;
    }

    // 지도에서 직접 눌러 고른 구역 — 보고 있던 줌·위치를 그대로 유지한다(그리기만).
    const clickedOnMap = mapClickZoneRef.current;
    if (clickedOnMap && clickedOnMap.id === selectedZoneId && Date.now() - clickedOnMap.t < 3000) {
      mapClickZoneRef.current = null;
      draw();
      settleView();
      return;
    }

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
    } else if (custom && custom.ring.length >= 3) {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const [la, ln] of custom.ring) {
        if (la < minLat) minLat = la;
        if (la > maxLat) maxLat = la;
        if (ln < minLng) minLng = ln;
        if (ln > maxLng) maxLng = ln;
      }
      fitLatLngSpan(k, map, minLat, minLng, maxLat, maxLng, mapElRef.current);
    } else if (seoul) {
      map.jump(new k.maps.LatLng(seoul.center[0], seoul.center[1]), 5, { animate: { duration: 350 } });
    }
    draw();
    settleView();
  }, [selectedZoneId, labelZoneId, seoulZones, zones, addressPin, draw, settleView, admin?.zones]);

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
    const custom = admin?.zones?.find((z) => z.id === selectedZoneId);
    const ring = seoul?.polygon ?? featured?.polygon ?? custom?.ring;
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
  }, [zoneFitRequest, selectedZoneId, seoulZones, zones, settleView, admin?.zones]);

  // ── ‘서울 전체 보기’ 요청 ─────────────────────────────────────────────────────
  //   「내 매물만 보기」를 켜면 서울 전체 매물 핀이 한 화면에 들어오도록 넓힌다.
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !ready || !fitSeoulRequest) return;
    if (lastSeoulFitRef.current === fitSeoulRequest) return;
    lastSeoulFitRef.current = fitSeoulRequest;
    fitLatLngSpan(k, map, SEOUL_BOUNDS[0][0], SEOUL_BOUNDS[0][1], SEOUL_BOUNDS[1][0], SEOUL_BOUNDS[1][1], mapElRef.current, true);
    settleView();
  }, [fitSeoulRequest, settleView, ready]);

  // ── 내 매물 핀 하나로 이동 + 카드 펼치기 (`/?my=<id>`, 매물 목록의 [지도에서 보기]) ──
  useEffect(() => {
    const k = sdkRef.current;
    const map = mapRef.current;
    if (!k || !map || !ready || !myFocusId) return;
    if (lastMyFocusRef.current === myFocusId) return;
    lastMyFocusRef.current = myFocusId;
    const pin = myPins.find((p) => p.id === myFocusId);
    if (!pin) return;
    setOpenMyId(pin.id);
    map.jump(new k.maps.LatLng(pin.lat, pin.lng), 4, { animate: { duration: 350 } });
    settleView();
  }, [myFocusId, myPins, settleView, ready]);

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

  // ── 필지가 바뀌면 즉시 다시 그린다 ──────────────────────────────────────────────
  //   캔버스는 지도 이벤트(idle·drag·zoom)와 지도 레이어 갱신에만 다시 그려진다. prop 만
  //   바뀌면(핀 지우기로 null) 지운 필지가 다음 지도 이동까지 캔버스에 남는다(2026-11-23 실측).
  useEffect(() => {
    draw();
  }, [parcel, draw]);

  // ── 필지(지적) 경계 — 파란 강조가 너무 작게 보이면 필지가 화면에 차도록 한 번만 확대 ────
  //   · 주소 핀이 먼저 level 3~4 로 착지한 뒤 필지 도형이 300ms쯤 늦게 온다(서버 조회).
  //     그래서 **핀 이동 애니메이션이 끝난 뒤**(0.7s)에 재고 움직인다 — 먼저 재면 이동 중인
  //     배율을 읽어 엉뚱한 level 로 튄다(2026-11-23 실측: 필지가 30px 인데 level 3 에 머묾).
  //   · 이미 충분히 크면(작은 변의 26% 이상) 손대지 않는다 — 사용자가 맞춰 둔 화면을 흔들지 않는다.
  //   · 확대만 한다(축소는 하지 않는다). 필지가 아주 작으면 level 1(건물 하나가 화면에 크게)까지 간다.
  useEffect(() => {
    if (!parcel) return;
    const timer = window.setTimeout(() => {
      const k = sdkRef.current;
      const map = mapRef.current;
      const el = mapElRef.current;
      if (!k || !map || !el) return;
      const b = parcel.bounds;
      const proj = map.getProjection();
      const a = proj.containerPointFromCoords(new k.maps.LatLng(b.minLat, b.minLng));
      const c = proj.containerPointFromCoords(new k.maps.LatLng(b.maxLat, b.maxLng));
      const px = Math.max(Math.abs(c.x - a.x), Math.abs(c.y - a.y));
      const target = Math.min(el.clientWidth, el.clientHeight) * 0.26;
      if (!Number.isFinite(px) || px <= 0 || px >= target) return;
      const steps = Math.round(Math.log2(target / px));
      if (steps <= 0) return;
      const level = Math.max(1, map.getLevel() - Math.min(steps, 6));
      if (level >= map.getLevel()) return;
      map.jump(new k.maps.LatLng(parcel.center[0], parcel.center[1]), level, {
        animate: { duration: 320 },
      });
      settleView();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [parcel, settleView]);

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

  // ── 노후도(건물 연식) 오버레이 ────────────────────────────────────────────────
  //   VWorld 국가중점 WFS(GIS건물통합정보 `dt_d010`)를 우리 서버 라우트(`/api/building-age`)로 받아
  //   **건물별 사용승인 연도**로 색을 칠한다(인증키는 서버에만 있다).
  //   · 화면을 0.005° 격자 타일로 나눠 필요한 타일만 부른다 — 한 타일이 600동 남짓이라
  //     WFS 의 1,000동 상한에 걸리지 않고, 같은 타일은 세션·CDN 캐시로 다시 부르지 않는다.
  //   · 받은 타일은 연식 구간(5)별 Path2D 로 합쳐 두고, draw 는 그 Path2D 만 채운다.
  const patchAgeStats = useCallback((patch: Partial<AgeStats>) => {
    setAgeStats((prev) => {
      const next = { ...prev, ...patch };
      const same =
        prev.buildings === next.buildings &&
        prev.tooFar === next.tooFar &&
        prev.loading === next.loading &&
        prev.counts.length === next.counts.length &&
        prev.counts.every((v, i) => v === next.counts[i]);
      return same ? prev : next;
    });
  }, []);

  /** 받은 타일 전부 → 연식 구간별 Path2D (원점 상대 좌표, 두 축 모두 도 단위) */
  const rebuildAgePaths = useCallback(() => {
    const paths: Path2D[] = AGE_CLASSES.map(() => new Path2D());
    const counts: number[] = AGE_CLASSES.map(() => 0);
    const nowYear = new Date().getFullYear();
    for (const tile of ageTilesRef.current.values()) {
      // 화면 밖(캐시 여유분)은 그리지 않는다 — 다시 그리는 비용을 ‘보이는 건물’로 묶어 둔다
      if (!tile.visible) continue;
      for (const b of tile.buildings) {
        const ci = ageClassIndex(b.y, nowYear);
        const path = paths[ci];
        if (!path) continue;
        let used = false;
        for (const ring of b.r) {
          if (!ring || ring.length < 6) continue;
          // 좌표 = (경도 - 원점경도, (메르카토르y - 원점y) × MERC_PER_DEG) — 두 축 모두 '도' 단위
          path.moveTo(
            ring[0] - AGE_ORIGIN_LNG,
            (mercator(ring[1]) - AGE_ORIGIN_M) * MERC_PER_DEG
          );
          for (let i = 2; i < ring.length; i += 2)
            path.lineTo(
              ring[i] - AGE_ORIGIN_LNG,
              (mercator(ring[i + 1]) - AGE_ORIGIN_M) * MERC_PER_DEG
            );
          path.closePath();
          used = true;
        }
        if (used) counts[ci] += 1;
      }
    }
    agePathsRef.current = { paths, counts };
    ageDirtyRef.current = false;
    patchAgeStats({ buildings: counts.reduce((a, b) => a + b, 0), counts });
    draw();
  }, [draw, patchAgeStats]);

  /** 타일 대기열을 4개씩 받아 온다(받는 대로 화면에 붙인다) */
  const drainAgeQueue = useCallback(async () => {
    if (ageRunningRef.current) return;
    ageRunningRef.current = true;
    try {
      while (agingRef.current && ageQueueRef.current.length > 0) {
        const batch = ageQueueRef.current
          .splice(0, 4)
          .filter((key) => !ageTilesRef.current.has(key) && !agePendingRef.current.has(key));
        if (batch.length === 0) break;
        for (const key of batch) agePendingRef.current.add(key);
        patchAgeStats({ loading: agePendingRef.current.size });
        await Promise.all(
          batch.map(async (key) => {
            const [tx, ty] = key.split(",").map(Number);
            const bbox = [
              tx * AGE_TILE_DEG,
              ty * AGE_TILE_DEG,
              (tx + 1) * AGE_TILE_DEG,
              (ty + 1) * AGE_TILE_DEG,
            ]
              .map((v) => v.toFixed(6))
              .join(",");
            try {
              const res = await fetch(
                `/api/building-age?bbox=${bbox}&tile=${encodeURIComponent(key)}`
              );
              const data = (await res.json()) as BuildingAgeResponse;
              if (data.ok) {
                ageTilesRef.current.set(key, { buildings: data.buildings, visible: true });
                ageDirtyRef.current = true;
                // 캐시 상한 — 오래된 타일부터 버린다(장시간 둘러봐도 메모리가 계속 늘지 않게)
                if (ageTilesRef.current.size > 120) {
                  for (const old of ageTilesRef.current.keys()) {
                    if (ageTilesRef.current.size <= 120) break;
                    ageTilesRef.current.delete(old);
                  }
                }
              }
            } catch {
              // 한 타일이 실패해도 나머지는 그린다 — 다음 idle 에서 한 번 더 시도한다
            } finally {
              if (!ageTilesRef.current.has(key)) {
                ageTriesRef.current.set(key, (ageTriesRef.current.get(key) ?? 0) + 1);
              }
              agePendingRef.current.delete(key);
            }
          })
        );
        patchAgeStats({ loading: agePendingRef.current.size });
        if (ageDirtyRef.current) rebuildAgePaths();
      }
    } finally {
      ageRunningRef.current = false;
    }
  }, [patchAgeStats, rebuildAgePaths]);

  /** 지금 화면이 걸치는 타일 중 아직 없는 것만 대기열에 넣는다(중심에서 가까운 타일부터) */
  const ensureAgeTiles = useCallback(() => {
    const map = mapRef.current;
    if (!map || !agingRef.current) return;
    if (map.getLevel() > AGE_MAX_LEVEL) {
      patchAgeStats({ tooFar: true });
      return;
    }
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const tx0 = Math.floor(sw.getLng() / AGE_TILE_DEG);
    const tx1 = Math.floor(ne.getLng() / AGE_TILE_DEG);
    const ty0 = Math.floor(sw.getLat() / AGE_TILE_DEG);
    const ty1 = Math.floor(ne.getLat() / AGE_TILE_DEG);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > AGE_MAX_TILES) {
      patchAgeStats({ tooFar: true });
      return;
    }
    const cx = (tx0 + tx1) / 2;
    const cy = (ty0 + ty1) / 2;
    // 화면 안 타일만 Path2D 에 넣는다(다시 그리는 비용 = 화면에 보이는 건물만).
    //   여유 2타일은 캐시에 남겨 팬으로 조금 돌아오면 다시 부르지 않고, 그보다 멀면 버린다(메모리 상한).
    let changed = false;
    for (const [key, tile] of ageTilesRef.current) {
      const [ptx, pty] = key.split(",").map(Number);
      const inView = ptx >= tx0 && ptx <= tx1 && pty >= ty0 && pty <= ty1;
      if (tile.visible !== inView) {
        tile.visible = inView;
        changed = true;
      }
      if (ptx < tx0 - 2 || ptx > tx1 + 2 || pty < ty0 - 2 || pty > ty1 + 2) {
        ageTilesRef.current.delete(key);
        changed = true;
      }
    }
    if (changed) {
      ageDirtyRef.current = true;
      rebuildAgePaths();
    }
    const wanted: { key: string; d: number }[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${tx},${ty}`;
        if (
          ageTilesRef.current.has(key) ||
          agePendingRef.current.has(key) ||
          ageQueueRef.current.includes(key) ||
          (ageTriesRef.current.get(key) ?? 0) >= 2
        ) {
          continue;
        }
        wanted.push({ key, d: Math.abs(tx - cx) + Math.abs(ty - cy) });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) ageQueueRef.current.push(w.key);
    patchAgeStats({ tooFar: false });
    void drainAgeQueue();
  }, [drainAgeQueue, patchAgeStats, rebuildAgePaths]);

  // 지도 effect(idle)가 부를 수 있게 함수를 ref 로 넘긴다
  useEffect(() => {
    ensureAgeTilesRef.current = ensureAgeTiles;
  }, [ensureAgeTiles]);

  const toggleAging = useCallback(() => {
    const next = !aging;
    agingRef.current = next;
    setAging(next);
    if (next) ensureAgeTiles();
    else patchAgeStats({ tooFar: false });
    draw();
  }, [aging, draw, ensureAgeTiles, patchAgeStats]);

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

  /**
   * 자치구 뱃지를 눌렀을 때 — 그 구의 구역들이 화면을 채우도록 부드럽게 확대한다.
   *   · 화면을 구역 경계 상자에 맞춰 레벨을 정하되 **5~6** 으로 묶는다. 6 이면 구 하나가
   *     화면에 꽉 차고, 그 아래(7 이상)는 구 뱃지 화면으로 돌아가 버리기 때문이다.
   *   · 확대·이동은 jump(animate) — 휠 줌처럼 경계·이름표가 같은 프레임에 따라온다.
   */
  const focusDistrict = useCallback(
    (d: DistrictStat) => {
      const k = sdkRef.current;
      const map = mapRef.current;
      if (!k || !map) return;
      let minLat = 90;
      let maxLat = -90;
      let minLng = 180;
      let maxLng = -180;
      for (const pz of prepRef.current.zones) {
        if (pz.zone.gu !== d.gu) continue;
        if (pz.minLat < minLat) minLat = pz.minLat;
        if (pz.maxLat > maxLat) maxLat = pz.maxLat;
        if (pz.minLng < minLng) minLng = pz.minLng;
        if (pz.maxLng > maxLng) maxLng = pz.maxLng;
      }
      for (const z of prepRef.current.points) {
        if (z.gu !== d.gu || !z.center) continue;
        if (z.center[0] < minLat) minLat = z.center[0];
        if (z.center[0] > maxLat) maxLat = z.center[0];
        if (z.center[1] < minLng) minLng = z.center[1];
        if (z.center[1] > maxLng) maxLng = z.center[1];
      }
      if (!Number.isFinite(minLat) || minLat > maxLat) return;
      // 구역 상자가 화면의 78% 를 차지하는 배율 → 레벨. 경계 계산은 카카오 투영에 맡긴다
      const proj = map.getProjection();
      const sw = proj.containerPointFromCoords(new k.maps.LatLng(minLat, minLng));
      const ne = proj.containerPointFromCoords(new k.maps.LatLng(maxLat, maxLng));
      const cw = mapElRef.current?.clientWidth ?? 1200;
      const ch = mapElRef.current?.clientHeight ?? 800;
      const wPx = Math.max(1, Math.abs(ne.x - sw.x));
      const hPx = Math.max(1, Math.abs(ne.y - sw.y));
      const fit = Math.min((cw * 0.78) / wPx, (ch * 0.78) / hPx);
      const level = Math.max(5, Math.min(6, map.getLevel() - Math.round(Math.log2(Math.max(fit, 0.05)))));
      map.jump(
        new k.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2),
        level,
        { animate: { duration: 380 } }
      );
      settleView();
    },
    [settleView]
  );

  return (
    <div
      ref={wrapRef}
      className="kakao-map-wrap relative h-full w-full overflow-hidden rounded-xl"
      data-jibun-pick={jibunPickOn ? "1" : undefined}
    >
      <div ref={mapElRef} className="h-full w-full" />

      {/* ── 선택 구역 이름표 — z-index 101: 매물 배지(100)보다 위에 둔다 ── */}
      <div ref={labelLayerRef} style={{ ...PIN_LAYER_STYLE, zIndex: 101 }} aria-hidden>
        {labelHtml && (
          <div
            className={cardZoom ? "zone-name-label is-card" : "zone-name-label"}
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              // 0×0 레이어 안의 절대배치 박스는 폭이 0 으로 잡혀 글자가 잘린다 → 내용 폭을 명시한다
              width: "max-content",
              // 기본 이름표(.zone-tag)와 같은 자리(앵커 가운데)에 놓는다 — 누를 때 뱃지가 튀지 않게
              //   카드형은 덩어리 중심이 카드 본문보다 5px 위라 그만큼 내려 본문을 가운데에 맞춘다
              //   · 이 구역 경매 핀이 떠 있으면 이름표를 핀 위로 34px 올린다 — 작은 구역(예: 쌍문동
              //     507-1일원 3,110㎡)은 핀이 구역 중심에 찍혀 이름표 글자를 덮어 버린다.
              transform: cardZoom
                ? `translate(-50%, calc(50% - ${7 + (visibleAuctionPins.length ? 34 : 0)}px))`
                : `translate(-50%, calc(50% - ${visibleAuctionPins.length ? 34 : 0}px))`,
            }}
            dangerouslySetInnerHTML={{ __html: labelHtml }}
          />
        )}
      </div>

      {/* ── 기본 구역 이름표 — `구역명 + 사업유형` (z-index 90, 매물 배지 아래) ──
             요소는 draw 가 직접 만들어 붙인다(이동할 때마다 리렌더하지 않게). */}
      <div ref={tagLayerRef} style={ZONE_TAG_LAYER_STYLE} data-testid="zone-tag-layer" />

      {/* ── 자치구 총 개수 뱃지 — 광역(레벨 7 이상) 화면의 유일한 지도 표시 (z-index 92) ──
             ・ 흰 위 칸에 구 이름, 오레오 블루 아래 칸에 지금 필터의 구역 수(IMG_0737 참고).
             ・ 요소는 React 가 그리지만(눌러서 확대), 자리와 표시 여부는 draw 가 매 프레임 정한다. */}
      <div
        ref={districtLayerRef}
        style={{ ...DISTRICT_LAYER_STYLE, display: "none" }}
        data-testid="district-badge-layer"
      >
        {(districtStats ?? []).map((d) => (
          <button
            key={d.gu}
            type="button"
            ref={(el) => {
              if (el) districtElsRef.current.set(d.gu, el);
              else districtElsRef.current.delete(d.gu);
            }}
            className="district-badge"
            data-testid="district-badge"
            data-gu={d.gu}
            data-count={d.count}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              focusDistrict(d);
            }}
            title={`${d.gu} · 정비구역 ${d.count.toLocaleString()}곳 — 누르면 ${d.gu}로 확대합니다`}
            aria-label={`${d.gu} 정비구역 ${d.count}곳 — 누르면 ${d.gu}로 확대`}
            style={{ width: `${DISTRICT_W}px`, height: `${DISTRICT_H}px`, visibility: "hidden" }}
          >
            <span className="district-badge-name">{d.gu}</span>
            <span className="district-badge-count">{d.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {/* ── 매물 배지 — `🏠 매물 N` (z-index 100 우리 레이어, 폴리곤 위) ── */}
      <div ref={badgeLayerRef} style={BADGE_LAYER_STYLE}>
        {badgeZones.map((b) => (
          <button
            key={b.id}
            type="button"
            ref={(el) => {
              if (el) badgeElsRef.current.set(b.id, el);
              else badgeElsRef.current.delete(b.id);
            }}
            data-testid="zone-listing-badge"
            data-zone-id={b.id}
            data-zone-name={b.name}
            onClick={(e) => {
              e.stopPropagation();
              onSelectZone(b.id);
            }}
            title={`${b.name} — 매물 ${b.count}건 (누르면 이 구역 상세가 열립니다)`}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "max-content",
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              borderRadius: "999px",
              border: "2px solid #b45309",
              background: "#fffbeb",
              color: "#7c2d12",
              fontSize: "11px",
              fontWeight: 700,
              lineHeight: 1,
              padding: "3px 7px",
              whiteSpace: "nowrap",
              cursor: "pointer",
              pointerEvents: "auto",
              visibility: "hidden",
              boxShadow: "0 3px 10px rgba(15,23,42,.35), 0 1px 3px rgba(15,23,42,.3)",
            }}
          >
            <Icon name="home" size={11} />
            <span>매물 {b.count}</span>
          </button>
        ))}
      </div>

      {/* ── ⚖️ 경매 물건 핀 — `⚖️ 2.0억 / 11.24 · 유찰 1회`
          (z-index 96: 실거래 핀 위·배지 아래 · **구역을 골랐을 때는 101** — 그 구역 이름표가
           좁은 구역(예: 쌍문동 507-1일원 3,110㎡)의 핀을 덮어 ‘경매 물건이 안 보이는’ 일을 막는다) ── */}
      <div
        ref={auctionLayerRef}
        className="auction-pin-layer"
        style={{ ...AUCTION_PIN_LAYER_STYLE, zIndex: selectedZoneId ? 101 : AUCTION_PIN_LAYER_STYLE.zIndex }}
        data-testid="auction-pin-layer"
      >
        {visibleAuctionPins.map((p) => {
          const open = activeAuctionId === p.id;
          const lead = p.lead;
          const many = p.items.length > 1;
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) auctionElsRef.current.set(p.id, el);
                else auctionElsRef.current.delete(p.id);
              }}
              style={{ position: "absolute", left: 0, top: 0, width: "max-content", visibility: "hidden" }}
            >
              <button
                type="button"
                className="auction-pin-btn"
                data-testid="auction-pin"
                data-auction-id={p.id}
                data-auction-zone={lead.zoneId}
                data-active={open ? "1" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  // 지도 말풍선 대신 **왼쪽 대시보드 창**에 이 핀의 물건들을 띄운다
                  onSelectAuctionPin?.(p);
                }}
                title={
                  p.bulk
                    ? `${lead.zoneName} · ${lead.caseNoPrint} — 일괄매각 목적물 ${p.parcels}개를 한꺼번에 매각. 누르면 왼쪽 창에 상세가 열립니다`
                    : many
                      ? `${lead.zoneName} · 경매 물건 ${p.items.length}건 — 누르면 왼쪽 창에 상세가 열립니다`
                      : `${lead.caseNoPrint} · ${lead.address} — 누르면 왼쪽 창에 상세가 열립니다`
                }
                style={{
                  display: "block",
                  pointerEvents: "auto",
                  border: `1px solid ${open ? AUCTION_PIN_ACCENT : "#f3c98b"}`,
                  borderLeft: `3px solid ${AUCTION_PIN_ACCENT}`,
                  background: open ? "#fff7ed" : "#fffbeb",
                  borderRadius: "5px",
                  padding: "2px 5px",
                  boxShadow: open
                    ? "0 0 0 2px rgba(180,83,9,.22), 0 8px 18px -8px rgba(120,53,15,.55)"
                    : "0 1px 2px rgba(16,24,40,.10), 0 6px 14px -8px rgba(16,24,40,.35)",
                  cursor: "pointer",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  // 두 줄(11px·9px)을 정수 높이 한 줄로 잡는다 — 높이가 소수면 -100% 이동이 반 픽셀에 걸려 흐려진다
                  lineHeight: "13px",
                }}
              >
                <span className="auction-pin-label">
                  <span
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#7c2d12",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    ⚖️ {p.priceLabel}
                  </span>
                  <span style={{ display: "block", fontSize: "9px", fontWeight: 500, color: "#92400e" }}>
                    {p.subLabel}
                  </span>
                </span>
                {/* 서울 전체(레벨 8 이상)처럼 멀리서 볼 때는 작은 점으로만 찍는다 — 레이어 CSS 가 바꾼다 */}
                <span className="auction-pin-dot" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── 실거래 가격 핀 — `7.8억 / 전용 59㎡` (z-index 95: 폴리곤 위·매물 배지 아래) ── */}
      <div ref={txLayerRef} style={TX_PIN_LAYER_STYLE} data-testid="tx-pin-layer">
        {visibleTxPins.map((p) => {
          const accent = TX_PIN_COLORS[p.kind] ?? "#334155";
          const open = openPinId === p.id;
          // 5년 이력 창에서 보고 있는 단지·지번 — 오레오 블루로 강조하고 바깥으로 펄스를 퍼뜨린다
          const active = !!activeTxKey && txPinKey(p.umdNm, p.jibun) === activeTxKey;
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) txElsRef.current.set(p.id, el);
                else txElsRef.current.delete(p.id);
              }}
              style={{ position: "absolute", left: 0, top: 0, width: "max-content", visibility: "hidden" }}
            >
              <button
                type="button"
                data-testid="tx-price-pin"
                data-tx-id={p.id}
                data-tx-name={p.name}
                data-active={active ? "1" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  // 5년 이력 창을 여는 쪽이 있으면 그걸로 — 핀을 누르면 그 단지의 5년 흐름이 바로 열린다
                  if (onSelectTxPin) {
                    setOpenPinId(null);
                    onSelectTxPin(p);
                    return;
                  }
                  setOpenPinId((v) => (v === p.id ? null : p.id));
                }}
                title={
                  active
                    ? `${p.name} · 최근 5년 실거래 이력 보기`
                    : `${p.name} · ${p.dealDate} · ${p.areaLabel} · ${p.priceLabel}`
                }
                className={active ? "tx-price-pin is-active" : "tx-price-pin"}
                style={{
                  display: "block",
                  pointerEvents: "auto",
                  border: active ? "1px solid #0054a6" : `1px solid ${accent}33`,
                  borderLeft: `3px solid ${active ? "#0054a6" : accent}`,
                  background: active ? "#f1f7fb" : open ? "#F7F9FB" : "#ffffff",
                  borderRadius: "5px",
                  padding: "2px 5px",
                  boxShadow: active
                    ? "0 0 0 2px rgba(0,84,166,.18), 0 6px 14px -8px rgba(0,84,166,.55)"
                    : "0 1px 2px rgba(16,24,40,.10), 0 6px 14px -8px rgba(16,24,40,.35)",
                  cursor: "pointer",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  // 두 줄(11px·9px)을 정수 높이 한 줄로 잡는다 — 높이가 소수면 -100% 이동이 반 픽셀에 걸려 흐려진다
                  lineHeight: "13px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: active ? "12px" : "11px",
                    fontWeight: 700,
                    color: active ? "#0054a6" : "#1A1A1A",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {p.priceLabel}
                </span>
                <span style={{ display: "block", fontSize: "9px", fontWeight: 500, color: active ? "#2b6b9e" : "#5B6472", letterSpacing: "-0.01em" }}>
                  {active ? `${p.name}` : p.areaLabel || p.kind}
                </span>
              </button>

              {open && (
                <div
                  data-testid="tx-pin-card"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: "calc(100% + 6px)",
                    transform: "translateX(-50%)",
                    width: "max-content",
                    maxWidth: "200px",
                    pointerEvents: "auto",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    boxShadow: "0 10px 24px rgba(15,23,42,.28)",
                    padding: "6px 8px",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{ fontSize: "9px", fontWeight: 600, color: "#fff", background: accent, borderRadius: "3px", padding: "1px 4px" }}
                    >
                      {p.kind}
                    </span>
                    <b style={{ fontSize: "11px", color: "#0f172a" }}>{p.name}</b>
                    <button
                      type="button"
                      aria-label="닫기"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPinId(null);
                      }}
                      style={{ marginLeft: "auto", pointerEvents: "auto", border: 0, background: "transparent", color: "#94a3b8", fontSize: "11px", cursor: "pointer", lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ marginTop: "2px", fontSize: "10px", color: "#475569" }}>
                    {p.dealDate} · {p.areaLabel || "면적 미상"}
                  </div>
                  <div style={{ marginTop: "1px", fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
                    {p.priceLabel}
                    <span style={{ fontSize: "9px", fontWeight: 500, color: "#64748b" }}>
                      {" "}({p.price.toLocaleString()}만원)
                    </span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569" }}>
                    {p.pyeongPrice ? `${p.kind === "연립·다세대" ? "전용" : "평당"} ${p.pyeongPrice.toLocaleString()}만 · ` : ""}
                    {p.landPyeongPrice ? `지분 ${p.landPyeongPrice.toLocaleString()}만 · ` : ""}
                    {p.umdNm} {p.jibun}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 지번 핀 — 「📍 지번 찍기」/우클릭/구역 밖 클릭으로 찍은 자리 (z-index 97) ── */}
      {jibunPin && (
        <div ref={jibunLayerRef} style={{ ...TX_PIN_LAYER_STYLE, zIndex: 97 }} data-testid="jibun-pin-layer">
          <div
            ref={jibunElRef}
            style={{ position: "absolute", left: 0, top: 0, width: "max-content", visibility: "hidden" }}
          >
            {/* 오레오 블루 물결 핀 — 카드가 위로 붙는다 */}
            <div className="jibun-drop-pin" aria-hidden>
              <span className="jibun-drop-pin-dot" />
              <span className="jibun-drop-pin-ripple" />
              <span className="jibun-drop-pin-ripple jibun-drop-pin-ripple-late" />
            </div>
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "calc(100% + 10px)",
                transform: "translateX(-50%)",
                pointerEvents: "auto",
              }}
            >
              <JibunPinCard
                pin={jibunPin}
                onClose={onCloseJibunPin}
                onOpenHistory={onOpenJibunHistory}
                onOpenZone={onOpenJibunZone}
                historyLoading={jibunHistoryLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 내 매물 핀 — `매 7.3억 / 다세대 · 전 52.88㎡` (z-index 96) ── */}
      <div ref={myLayerRef} style={MY_PIN_LAYER_STYLE} data-testid="my-pin-layer">
        {visibleMyPins.map((p) => {
          const open = openMyId === p.id;
          const accent = p.dealType === "매매" ? "#b45309" : p.dealType === "전세" ? "#0369a1" : "#7c3aed";
          const areaShort = (p.areaLabel || "").split("·")[0];
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) myElsRef.current.set(p.id, el);
                else myElsRef.current.delete(p.id);
              }}
              style={{ position: "absolute", left: 0, top: 0, width: "max-content", visibility: "hidden" }}
            >
              <button
                type="button"
                className="my-pin-btn"
                data-testid="my-listing-pin"
                data-listing-id={p.id}
                data-rfine-no={p.rfineNo}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMyId((v) => (v === p.id ? null : p.id));
                }}
                title={`${p.priceText} · ${p.propertyType} ${p.areaLabel} · ${p.jibunAddress || p.address}`}
                style={{
                  display: "block",
                  pointerEvents: "auto",
                  border: `1.5px solid ${accent}`,
                  borderLeft: `4px solid ${accent}`,
                  background: open ? "#fffbeb" : "#ffffff",
                  borderRadius: "6px",
                  padding: "2px 5px",
                  boxShadow: "0 2px 8px rgba(15,23,42,.32)",
                  cursor: "pointer",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  // 두 줄(11px·9px)을 정수 높이 한 줄로 잡는다 — 높이가 소수면 -100% 이동이 반 픽셀에 걸려 흐려진다
                  lineHeight: "13px",
                }}
              >
                <span className="my-pin-label">
                  <span style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
                    {p.priceLabel}
                  </span>
                  <span
                    className="my-pin-sub"
                    style={{ display: "block", fontSize: "9px", fontWeight: 500, color: "#475569" }}
                  >
                    {p.propertyType}
                    {areaShort ? ` · ${areaShort}` : ""}
                  </span>
                </span>
                {/* 자리가 없을 때(서울 전체 보기)는 가격표 대신 점으로만 찍어 63건이 다 보이게 한다 */}
                <span className="my-pin-dot" aria-hidden />
              </button>

              {open && (
                <div
                  data-testid="my-pin-card"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: "calc(100% + 6px)",
                    transform: "translateX(-50%)",
                    width: "264px",
                    pointerEvents: "auto",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    boxShadow: "0 12px 28px rgba(15,23,42,.3)",
                    padding: "9px 10px",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        color: "#fff",
                        background: accent,
                        borderRadius: "3px",
                        padding: "1px 4px",
                      }}
                    >
                      내 매물
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#334155" }}>
                      {p.propertyType} · {p.dealType}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: "9px", color: "#94a3b8" }}>
                      포스 {p.rfineNo}
                    </span>
                    <button
                      type="button"
                      aria-label="닫기"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMyId(null);
                      }}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "#94a3b8",
                        fontSize: "11px",
                        cursor: "pointer",
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ marginTop: "3px", fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                    {p.priceText}
                  </div>

                  <div style={{ marginTop: "2px", fontSize: "10px", lineHeight: 1.35, color: "#475569" }}>
                    {p.address || p.jibunAddress}
                  </div>

                  <div style={{ marginTop: "2px", fontSize: "10px", color: "#475569" }}>
                    {p.areaLabel}
                    {p.floor ? ` · ${p.floor}층` : ""}
                    {p.zoneName ? ` · ${p.zoneName}` : ""}
                  </div>

                  {p.feature && (
                    <div style={{ marginTop: "4px", fontSize: "10px", lineHeight: 1.4, color: "#334155" }}>
                      {p.feature}
                    </div>
                  )}

                  <div style={{ marginTop: "4px", fontSize: "9.5px", color: "#64748b" }}>
                    부동산포스 {p.rfineNo} · {"010-2758-5292"}
                    {p.expiresAt ? ` · ${p.expiresAt}까지` : ""}
                  </div>

                  <div style={{ marginTop: "6px", display: "flex", gap: "4px" }}>
                    {p.zoneId && p.zoneName && (
                      <button
                        type="button"
                        data-testid="my-pin-zone-open"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.zoneId) onSelectZone(p.zoneId);
                        }}
                        style={{
                          flex: 1,
                          border: `1px solid ${accent}`,
                          background: "#fffbeb",
                          color: accent,
                          borderRadius: "6px",
                          padding: "3px 4px",
                          fontSize: "10px",
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.zoneName} 열기
                      </button>
                    )}
                    {p.detailUrl && (
                      <a
                        href={p.detailUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          flex: 1,
                          textAlign: "center",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#334155",
                          borderRadius: "6px",
                          padding: "3px 4px",
                          fontSize: "10px",
                          fontWeight: 700,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        부동산포스 상세 ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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

      {/* ── 필지 '보는중' 말풍선 — 주소로 고른 지번의 지적 경계 위(핀 카드보다 한 층 아래) ── */}
      <div ref={parcelLabelRef} style={{ ...PIN_LAYER_STYLE, zIndex: 99 }} data-testid="parcel-viewing-layer">
        {parcel && (
          <div
            data-testid="parcel-viewing"
            style={{ position: "absolute", left: 0, top: 0, width: "max-content" }}
            dangerouslySetInnerHTML={{ __html: parcelBubbleHtml() }}
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

      {/* ── 관리자 그리기 안내 — 도구 막대가 숨는 좁은 화면(xl 미만)에서도 조작법을 보여준다 ── */}
      {admin?.adding && adminDraft && adminDraft.length > 0 && (
        <div
          data-testid="admin-draw-hint"
          className="pointer-events-none absolute left-1/2 top-2 z-[620] -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-300 bg-white/95 px-3 py-1 text-[11px] font-semibold text-sky-900 shadow-md xl:hidden"
        >
          지도 탭: 점 추가 · 더블클릭/우클릭/Enter: 완료 · Esc: 취소
        </div>
      )}

      {/* ── 🔥 개발압력 레이어 — 주변이 정비구역·아파트로 둘러싸인 노후 저층지(z 98) ── */}
      {devPressureOn && mapReady && sdkRef.current && mapRef.current && (
        <DevPressureLayer
          sdk={sdkRef.current}
          map={mapRef.current}
          focus={devPressureFocus ?? null}
          onOpenZone={onSelectZone}
          onPickJibun={onPickJibun}
          onCloseLayer={onToggleDevPressure}
        />
      )}

      {/* 지도 위 토글 — 확대/축소 · 스카이뷰 · 지적편집도 · 준공 포함 */}
      {/* 지도 위 도구 — 데스크톱은 왼쪽 아래(범례 위), 모바일은 오른쪽 가운데(검색·시트를 피해서) */}
      <div className="absolute right-2 top-1/2 z-[600] flex -translate-y-1/2 flex-col items-end gap-1.5 md:bottom-2 md:left-2 md:right-auto md:top-auto md:translate-y-0 md:flex-row md:items-center">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)]">
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
        {onToggleMyPins && myPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleMyPins}
            aria-pressed={myPinsOn}
            data-testid="my-listings-toggle"
            title={`내가 올린 매물 ${myPins.length}건만 지도에 표시 — 끄면 서울 전체 재개발 지도로 돌아갑니다`}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              myPinsOn
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="home" size={13} />
            <span className="hidden md:inline">내 매물만 보기</span>
            <span className="md:hidden">내 매물</span>
            <span className={`font-bold ${myPinsOn ? "text-white/90" : "text-brand"}`}>
              ({myPins.length})
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={toggleSkyview}
          aria-pressed={skyview}
          title="스카이뷰 — 위성 항공사진 + 도로·지명 라벨"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
            skyview
              ? "border-brand/35 bg-brand-tint text-brand"
              : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <Icon name="image" size={13} />
          <span className="hidden md:inline">스카이뷰</span>
        </button>
        <button
          type="button"
          onClick={toggleDistrict}
          aria-pressed={district}
          title="지적편집도 — 필지 경계·지번을 겹쳐 보기 (참고용)"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
            district
              ? "border-brand/35 bg-brand-tint text-brand"
              : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <Icon name="grid" size={13} />
          <span className="hidden md:inline">지적편집도</span>
        </button>
        <button
          type="button"
          onClick={toggleAging}
          aria-pressed={aging}
          data-testid="aging-toggle"
          title="노후도 — 건물별 사용승인 연도로 색칠 (30년 이상 / 20~30년 / 10~20년 / 10년 미만). 확대해서 보세요"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
            aging
              ? "border-brand/35 bg-brand-tint text-brand"
              : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <Icon name="building" size={13} />
          <span className="hidden md:inline">노후도</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleDevPressure?.()}
          aria-pressed={!!devPressureOn}
          data-testid="dev-pressure-toggle"
          title="개발압력 — 주변이 정비구역·아파트로 둘러싸인 노후 저층지. 켜면 지도에 🔥 핫스팟이 뜹니다"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
            devPressureOn
              ? "border-brand bg-brand text-white"
              : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <span aria-hidden className="text-[12px] leading-none">🔥</span>
          <span className="hidden md:inline">개발압력</span>
        </button>
        {onToggleJibunPick && (
          <button
            type="button"
            onClick={onToggleJibunPick}
            aria-pressed={jibunPickOn}
            data-testid="jibun-pick-toggle"
            title="지번 찍기 — 지도를 누르면 그 자리의 지번·구역·실거래를 보여 줍니다 (아이패드·터치용)"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              jibunPickOn
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <span aria-hidden className="text-[12px] leading-none">◉</span>
            <span className="hidden md:inline">지번 찍기</span>
          </button>
        )}
        {onToggleTxPins && txPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleTxPins}
            aria-pressed={txPinsOn}
            data-testid="tx-pins-toggle"
            title="구역 안 실거래 가격 핀 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              txPinsOn
                ? "border-brand/35 bg-brand-tint text-brand"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="tag" size={13} />
            <span className="hidden md:inline">실거래 핀</span>
            <span className="font-normal text-slate-400">{txPins.length}</span>
          </button>
        )}
        {onToggleAuctionPins && auctionPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleAuctionPins}
            aria-pressed={auctionPinsOn}
            data-testid="auction-pins-toggle"
            title="구역 안 법원경매 물건을 ⚖️ 핀으로 표시 — 끄면 감춥니다"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              auctionPinsOn
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <span aria-hidden className="text-[12px] leading-none">⚖️</span>
            <span className="hidden md:inline">경매 핀</span>
            <span className="font-normal text-amber-700/70">{auctionPins.length}</span>
          </button>
        )}
        {onToggleCompleted && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={showCompleted}
            title="준공·입주까지 끝난 구역도 지도에 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              showCompleted
                ? "border-brand/35 bg-brand-tint text-brand"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="check" size={13} />
            <span className="hidden md:inline">준공 포함</span>
            {completedCount > 0 && <span className="font-normal text-slate-400">{completedCount}</span>}
          </button>
        )}
      </div>

      {/* ── 노후도 범례 — 켜져 있을 때만. 건물 연식 구간과 지금 칠해진 동수 ── */}
      {aging && (
        <div
          data-testid="aging-legend"
          className="pointer-events-none absolute bottom-2 left-1/2 z-[600] w-max max-w-[min(94vw,520px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
            <b className="text-slate-800">노후도</b>
            {AGE_CLASSES.map((cls, i) => (
              <span key={cls.key} className="inline-flex items-center gap-1">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: cls.color }} />
                {cls.label}
                {ageStats.counts.length > 0 && (
                  <b className="font-semibold text-slate-800">
                    {(ageStats.counts[i] ?? 0).toLocaleString()}
                  </b>
                )}
              </span>
            ))}
          </div>
          <p className="mt-0.5 text-center text-[10px] leading-tight text-slate-500">
            {ageStats.tooFar
              ? "지도를 더 확대하면 건물별 연식이 칠해집니다 (건물 동수가 많은 배율)"
              : ageStats.loading > 0
                ? `건물 연식 불러오는 중… (${ageStats.loading}타일 남음)`
                : `건물 ${ageStats.buildings.toLocaleString()}동 · 국토부 건축물대장·GIS건물통합정보(사용승인일) 기준`}
          </p>
          <p className="mt-0.5 text-center text-[10px] leading-tight text-slate-400">
            연식 미상은 옅은 회색 — 대장에 사용승인일이 없거나 건물대장과 이어지지 않은 건물
          </p>
        </div>
      )}

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
  container: HTMLElement | null,
  /** true 면 화면을 가능한 꽉 채우도록 레벨을 반올림해 맞춘다(내 매물 서울 전체 보기) */
  fill = false
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
  // 기본은 2배 단위(floor) — 구역 경계가 잘리지 않게. fill 이면 반올림해 화면을 꽉 채운다.
  //   · step > 0 = 확대(작은 구역), step < 0 = 축소(큰 구역).
  //   · **축소는 한 번에 1단계까지만** — 예전에는 화면 밖 큰 구역을 고르면 한 번에 2~3단계씩
  //     멀어져 “화면이 갑자기 작아진다”는 느낌을 줬다. 확대는 제한하지 않는다.
  const rawStep = fill ? Math.round(Math.log2(Math.max(fit, 0.01))) : Math.floor(Math.log2(Math.max(fit, 0.01)));
  const step = fill ? rawStep : Math.max(rawStep, -1);
  const level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, map.getLevel() - step));
  map.jump(new k.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2), level, {
    animate: { duration: 350 },
  });
}
