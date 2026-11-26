// ─────────────────────────────────────────────────────────────────────────────
// 구역현황(추정) — 구역 폴리곤 안의 건축물·필지로 노후도·동수밀도를 계산한다
//
//   · 재개발닷컴의 '구역현황'(노후도·과소필지·호수밀도)에 대응하는 **1차 추정치**다.
//     우리가 가진 것은 ① 건축물대장 사용승인일 색인(public/data/age-index) ② 국토부
//     GIS건물통합정보(브이월드 dt_d010) ③ 연속지적도(LP_PA_CBND_BUBUN)뿐이라,
//     건물 구조·층별 세대수·호수는 반영하지 못한다(재개발닷컴과 숫자가 다를 수 있음).
//   · 이 파일은 **순수 계산**만 둔다(node 모듈 없음) — 브이월드 호출은
//     `building-age-server.ts`(서버 전용)가, 화면은 `ZoneVitalStats.tsx` 가 맡는다.
//   · 좌표 규약은 앱 전체와 같다 — 구역 링은 [위도, 경도], 브이월드 건물 링은 [경도, 위도].
// ─────────────────────────────────────────────────────────────────────────────

import { outerRings, pointInZone, type ZoneShape } from "./zone-geo";

export type ZoneShapeInput = {
  /** 외곽 링 — [위도, 경도] */
  polygon?: [number, number][] | null;
  /** MultiPolygon 의 나머지 조각 */
  parts?: [number, number][][] | null;
  /** 구역 안에 뚫린 구멍(성당·공원 등) — 이 안의 건물은 구역 밖으로 본다 */
  holes?: [number, number][][] | null;
};

/** 계산에 쓰는 건물 한 동 — 브이월드 WFS 피처에서 뽑은 최소 정보 */
export type ZoneStatBuilding = {
  /** 사용승인 연도(연식 색인으로 보정). 미상이면 null */
  year: number | null;
  /** 연면적(㎡). 없으면 null */
  areaSqm: number | null;
  /** 외곽 링들 — [경도, 위도] 평면 배열(lng, lat, lng, lat, …) */
  rings: number[][];
  /** 19자리 PNU — 정밀 분석(건축물대장)에서 연식 미상 건물을 대조하는 데 쓴다 */
  pnu?: string | null;
};

/** 필지 하나(연속지적도) — 중심점이 구역 안이면 구역 필지로 센다 */
export type ZoneStatParcel = {
  areaSqm: number;
  /** 필지 중심 [위도, 경도] */
  lat: number;
  lng: number;
  /** 19자리 PNU — 정밀 분석이 이 필지의 건축물대장을 조회한다 */
  pnu?: string | null;
};

export type ZoneStatsPayload = {
  /** 동수밀도 계산에 쓴 구역면적(㎡)과 그 출처 */
  areaSqm: number;
  areaHa: number;
  areaSource: "given" | "shape";
  /** 구역 안으로 판정된 건축물 동수 */
  buildings: number;
  /** 사용승인 연도를 몰라 노후도 비율에서 빠진 동수 */
  unknownYear: number;
  /** 30년 이상(사용승인 1996년 이하) — 모아타운·재개발 요건의 기준선 */
  over30: { count: number; pct: number; cutoffYear: number };
  /** 20년 이상(사용승인 2006년 이하) — 모아타운·비철콘 참고선 */
  over20: { count: number; pct: number; cutoffYear: number };
  /** 연면적 기준 30년 이상 비율 — 연면적 자료가 있는 건물만 모아 계산 */
  floorArea: { total: number; over30: number; over30Pct: number | null };
  /** 단순 동수밀도 — 동수 ÷ 구역면적(ha) */
  density: number;
  /** 필지 수·과소필지(90㎡ 미만)·구역 안 필지의 PNU 목록 — 연속지적도를 못 받았으면 null */
  parcels: { count: number; under90: number; under90Pct: number; pnus?: string[] } | null;
  /** 연식을 몰라 노후도에서 빠진 건물의 PNU — 정밀 분석의 '연식 보정' 대조용 */
  unknownPnu?: string[];
};

export type ZoneStatsResponse =
  | {
      ok: true;
      stats: ZoneStatsPayload;
      meta: {
        /** 계산 기준일(YYYY-MM-DD) */
        asOf: string;
        /** 브이월드에 실제로 보낸 요청 수(건물 타일 + 필지 페이지) */
        requests: number;
        /** 브이월드 상한(1,000동)·요청 상한에 걸려 일부 건물이 빠졌는지 */
        truncated: boolean;
        /** 연식 색인으로 연도를 덮어쓴 건물 수(진단용) */
        patched: number;
      };
    }
  | { ok: false; error: string; detail?: string };

/** ㎡ → ha */
export function toHa(areaSqm: number): number {
  return areaSqm > 0 ? areaSqm / 10000 : 0;
}

/** 링([위도, 경도])의 면적(㎡) — 서울 규모에선 위도 보정 평면 근사로 충분하다 */
export function ringAreaSqm(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let latSum = 0;
  for (const p of ring) latSum += p[0];
  const lat0 = latSum / ring.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1] * kx;
    const yi = ring[i][0] * ky;
    const xj = ring[j][1] * kx;
    const yj = ring[j][0] * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a / 2);
}

/** 구역 도형의 면적(㎡) — 외곽 합계 − 구멍 합계 */
export function shapeAreaSqm(shape: ZoneShapeInput | null | undefined): number {
  if (!shape) return 0;
  let area = 0;
  for (const ring of outerRings(shape as ZoneShape)) area += ringAreaSqm(ring);
  for (const hole of shape.holes ?? []) {
    if (hole && hole.length >= 3) area -= ringAreaSqm(hole);
  }
  return Math.max(0, area);
}

/** 평면 배열([lng,lat,…])의 꼭짓점 평균 — 건물이 구역 안인지 판정하는 중심점 */
function flatRingCenter(flat: number[]): [number, number] | null {
  if (!Array.isArray(flat) || flat.length < 6) return null;
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    lng += x;
    lat += y;
    n++;
  }
  if (n === 0) return null;
  return [lat / n, lng / n];
}

function pct(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * 구역 폴리곤 안의 건물·필지로 구역현황을 계산한다.
 *   · 건물은 **중심점이 폴리곤 안**일 때만 센다(경계에 걸친 건물은 제외).
 *   · 노후도 기준 연도는 오늘 연도에서 30·20년을 뺀 해다(2026년이면 1996·2006년 이하).
 */
export function computeZoneStats(input: {
  shape: ZoneShapeInput;
  areaSqm?: number | null;
  buildings: ZoneStatBuilding[];
  parcels?: ZoneStatParcel[] | null;
  nowYear?: number;
}): ZoneStatsPayload {
  const { shape, buildings, parcels } = input;
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const cutoff30 = nowYear - 30;
  const cutoff20 = nowYear - 20;

  const shapeArea = shapeAreaSqm(shape);
  const givenArea = typeof input.areaSqm === "number" && Number.isFinite(input.areaSqm) ? input.areaSqm : 0;
  const areaSqm = givenArea > 0 ? givenArea : shapeArea;
  const areaSource: "given" | "shape" = givenArea > 0 ? "given" : "shape";
  const areaHa = toHa(areaSqm);

  let count = 0;
  let c30 = 0;
  let c20 = 0;
  let unknown = 0;
  let floorTotal = 0;
  let floor30 = 0;
  const unknownPnu: string[] = [];

  for (const b of buildings) {
    const center = b.rings.length ? flatRingCenter(b.rings[0]) : null;
    if (!center) continue;
    if (!pointInZone(shape as ZoneShape, center[0], center[1])) continue;
    count++;
    if (b.year == null || !Number.isFinite(b.year)) {
      unknown++;
      if (typeof b.pnu === "string" && /^\d{19}$/.test(b.pnu)) unknownPnu.push(b.pnu);
    } else {
      if (b.year <= cutoff30) c30++;
      if (b.year <= cutoff20) c20++;
    }
    if (b.areaSqm != null && Number.isFinite(b.areaSqm) && b.areaSqm > 0) {
      floorTotal += b.areaSqm;
      if (b.year != null && Number.isFinite(b.year) && b.year <= cutoff30) floor30 += b.areaSqm;
    }
  }

  let parcelStats: ZoneStatsPayload["parcels"] = null;
  if (Array.isArray(parcels) && parcels.length > 0) {
    // 연속지적도에는 도로·잡종지 필지도 함께 온다 — 지목을 가려낼 속성이 응답에 없어
    //   **모든 필지를 센다**. 도로 필지는 보통 커서 과소필지율을 낮추는 쪽으로 작용한다(화면에 밝힌다).
    let pc = 0;
    let small = 0;
    const pnus: string[] = [];
    for (const p of parcels) {
      if (!pointInZone(shape as ZoneShape, p.lat, p.lng)) continue;
      pc++;
      if (p.areaSqm > 0 && p.areaSqm < 90) small++;
      if (typeof p.pnu === "string" && /^\d{19}$/.test(p.pnu)) pnus.push(p.pnu);
    }
    if (pc > 0) parcelStats = { count: pc, under90: small, under90Pct: pct(small, pc), pnus };
  }

  return {
    areaSqm: Math.round(areaSqm),
    areaHa: Math.round(areaHa * 100) / 100,
    areaSource,
    buildings: count,
    unknownYear: unknown,
    over30: { count: c30, pct: pct(c30, count), cutoffYear: cutoff30 },
    over20: { count: c20, pct: pct(c20, count), cutoffYear: cutoff20 },
    floorArea: {
      total: Math.round(floorTotal),
      over30: Math.round(floor30),
      over30Pct: floorTotal > 0 ? pct(floor30, floorTotal) : null,
    },
    density: areaHa > 0 ? Math.round((count / areaHa) * 10) / 10 : 0,
    parcels: parcelStats,
    unknownPnu,
  };
}
