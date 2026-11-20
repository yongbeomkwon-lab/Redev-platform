/**
 * 건물 연식(노후도) 오버레이 — 공용 상수·타입·분류 규칙
 *
 * 데이터: 국토교통부 GIS건물통합정보(WFS, 국가중점 API)
 *   · 엔드포인트 `https://api.vworld.kr/ned/wfs/getBldgisSpceWFS`, 레이어 `dt_d010`
 *   · 건물 폴리곤 + 건축물대장 속성(사용승인일 `use_confm_de`, 지상층수 `ground_floor_co`, 연면적 `totar`)
 *   · 브이월드(vworld.kr) 인증키의 **국가중점 API · WMS/WFS API** 가 켜져 있어야 한다.
 *     (켜져 있지 않으면 `INCORRECT_KEY` 를 돌려준다 — 2026-11 확인)
 *
 * 색은 "오래될수록 진하게" — 재개발 상담에서 보는 순서가 **30년 이상 → 그 아래**라서
 *   진한 빨강(30년↑) → 주황 → 노랑 → 초록(10년 미만) 순으로 둔다.
 */

/** 지도에 칠하는 연식 구간 — 순서를 바꾸면 범례·색인도 함께 바뀐다 */
export const AGE_CLASSES = [
  { key: "over30", label: "30년 이상", minYear: 30, color: "#b91c1c" },
  { key: "20s", label: "20~30년", minYear: 20, color: "#ea580c" },
  { key: "10s", label: "10~20년", minYear: 10, color: "#eab308" },
  { key: "under10", label: "10년 미만", minYear: 0, color: "#16a34a" },
  { key: "unknown", label: "연식 미상", minYear: -1, color: "#94a3b8" },
] as const;

export type AgeClassKey = (typeof AGE_CLASSES)[number]["key"];

/** 연식 미상 칸의 인덱스(= 마지막) */
export const AGE_UNKNOWN_INDEX = AGE_CLASSES.length - 1;

/** 사용승인 연도 → 색 구간 인덱스. 사용승인일이 없으면 '연식 미상' */
export function ageClassIndex(approveYear: number | null | undefined, nowYear: number): number {
  if (approveYear == null || !Number.isFinite(approveYear) || approveYear <= 0) return AGE_UNKNOWN_INDEX;
  const age = nowYear - approveYear;
  if (age < 0) return 0; // 사용승인일이 미래로 적힌 오류값 — 가장 최근으로 본다
  if (age >= 30) return 0;
  if (age >= 20) return 1;
  if (age >= 10) return 2;
  return 3;
}

/** 한 타일(= 한 번의 WFS 요청) 크기. 0.005° ≈ 440m × 550m — 서울 도심에서 600동 남짓이라 1,000동 상한에 걸리지 않는다 */
export const AGE_TILE_DEG = 0.005;

/** 이 배율(카카오 레벨, 숫자가 작을수록 확대)보다 멀리 보면 건물을 그리지 않는다 — 타일 수·요청량 폭증 방지 */
export const AGE_MAX_LEVEL = 4;

/** 한 화면에서 한 번에 받을 타일 수 상한(안전장치) */
export const AGE_MAX_TILES = 40;

/** WFS 가 한 번에 돌려주는 최대 피처 수(브이월드 상한 — 1,000 초과는 INVALID_RANGE) */
export const AGE_WFS_MAX_FEATURES = 1000;

/** 한 동(건물) — 서버가 좁혀서 내려주는 모양(클라이언트 페이로드를 줄이려고 키를 짧게) */
export type AgeBuilding = {
  /** 사용승인 연도(YYYY). 연식 미상이면 null */
  y: number | null;
  /** 건물 이름(아파트·상가 등). 없으면 null */
  n?: string | null;
  /** 지상 층수 */
  f?: number;
  /** 연면적(㎡) */
  a?: number;
  /** 외곽 링들 — [lng, lat, lng, lat, …] 평면 배열. 구멍(hole)은 버리고 외곽만 쓴다 */
  r: number[][];
};

export type BuildingAgeResponse =
  | {
      ok: true;
      /** 요청한 타일의 격자 키 `tx,ty` */
      tile: string;
      /** 이 응답에 실린 건물 수 */
      total: number;
      /** MAXFEATURES 상한에 걸려 잘렸는지 */
      truncated: boolean;
      buildings: AgeBuilding[];
    }
  | { ok: false; error: string; detail?: string };

/** WFS(GeoJSON) 피처 — 우리가 쓰는 부분만 */
export type VWorldBuildingFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

/** GeoJSON Polygon·MultiPolygon → 외곽 링 평면 배열([lng,lat,…]). 구멍(hole)은 버리고 외곽만 */
function ringsOf(compressed: { type?: string; coordinates?: unknown } | null | undefined): number[][] {
  if (!compressed || !compressed.coordinates) return [];
  const polygons: unknown[] =
    compressed.type === "Polygon"
      ? [compressed.coordinates]
      : compressed.type === "MultiPolygon"
        ? (compressed.coordinates as unknown[])
        : [];
  const out: number[][] = [];
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    const ring = poly[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const flat: number[] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      // 소수점 5자리 ≈ 1m — 서버→브라우저 전송량을 크게 줄인다
      flat.push(Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5);
    }
    if (flat.length >= 6) out.push(flat);
  }
  return out;
}

/** `use_confm_de`("1996-08-09") → 사용승인 연도. 없거나 이상한 값이면 null */
export function approveYear(value: unknown): number | null {
  if (typeof value !== "string" || value.length < 4) return null;
  const y = Number(value.slice(0, 4));
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return y;
}

function finiteNum(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** WFS 피처 목록 → 지도에 칠할 건물 목록(도형이 없는 피처는 버린다) */
export function buildingsFromFeatures(features: unknown): AgeBuilding[] {
  if (!Array.isArray(features)) return [];
  const out: AgeBuilding[] = [];
  for (const raw of features) {
    const feature = raw as VWorldBuildingFeature;
    const rings = ringsOf(feature.geometry);
    if (rings.length === 0) continue;
    const props = feature.properties ?? {};
    const rawName = props.buld_nm;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
    out.push({
      y: approveYear(props.use_confm_de),
      n: name,
      f: finiteNum(props.ground_floor_co),
      a: finiteNum(props.totar),
      r: rings,
    });
  }
  return out;
}
