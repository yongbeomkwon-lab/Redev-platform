// ─────────────────────────────────────────────────────────────────────────────
// 정비구역 폴리곤 사전 계산 — 카카오맵 캔버스 오버레이의 그리기/클릭 판정용 자료구조
//
//   · 2,179구역 · 40,000여 꼭짓점을 매 프레임 GeoJSON 객체로 다루면 느리다.
//     → 구역마다 Float64Array(lat,lng 교차 저장) + 바운딩박스로 미리 펴 둔다.
//   · 그리기: 화면 밖 구역은 바운딩박스만 보고 건너뛴다(줌인 시 체감 속도가 크게 좋아진다).
//   · 클릭/호버: 바운딩박스 → 광선 교차(ray casting) 순서로 좁혀 들어간다.
//     겹친 구역은 **가장 작은(안쪽) 구역**을 고른다 — 큰 구역 안에 작은 구역이 있는 경우
//     사용자가 노린 것은 안쪽이기 때문.
//   · leaflet/kakao 를 임포트하지 않는 순수 모듈.
// ─────────────────────────────────────────────────────────────────────────────
import { isCompletedZone, type SeoulZone } from "@/lib/seoul-zones";

export type Ring = {
  /** [lat0, lng0, lat1, lng1, ...] */
  pts: Float64Array;
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type PreparedZone = {
  zone: SeoulZone;
  /** 외곽 링들 (Polygon 1개 · MultiPolygon 은 조각마다 1개) */
  rings: Ring[];
  /** 구멍(홀) 링 — 이 안은 구역 밖이다 */
  holes: Ring[];
  /** 구역 안을 나누는 점선(사업예정구역 1·2 등) — 없으면 빈 배열 */
  dividers: PreparedDivider[];
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  /** 준공·입주 완료 — 점선으로 그린다 */
  completed: boolean;
  /** 위치 참고용 근사원(실제 구역계 아님) — 점선으로 옅게 그린다 */
  approx: boolean;
  /** 정점이 **원형**인 근사원(geom="근사원") — 광역 화면에서는 큰 점선 원 대신 작은 위치 점 */
  approxCircle: boolean;
};

/**
 * 위치 참고용 '근사원'인가 — 실제 구역계 다각형과 반드시 구분한다.
 *   · geom === "근사원": 대표 지번 중심에 면적을 원으로 환산한 97정점 원
 *   · geom 표기가 없어도 boundaryApprox 이고 정점이 원형(중심에서의 반지름 편차 8% 이내)이면 근사원으로 본다
 *   ⚠️ 신수13구역·성내동 431·방배 467-19 처럼 boundaryApprox: true 여도 공고·고시 도면에서 딴
 *      실제 다각형(반지름 편차 49~164%)은 근사원으로 보지 않는다 — 지도에 그대로 경계로 그린다.
 */
export function isApproxCircleZone(z: {
  geom?: string;
  boundaryApprox?: boolean;
  polygon?: [number, number][];
}): boolean {
  if (z.geom === "근사원") return true;
  const ring = z.polygon;
  if (!z.boundaryApprox || !ring || ring.length < 20) return false;
  let latSum = 0;
  let lngSum = 0;
  for (const [lat, lng] of ring) {
    latSum += lat;
    lngSum += lng;
  }
  const cLat = latSum / ring.length;
  const cLng = lngSum / ring.length;
  const kx = 111_320 * Math.cos((cLat * Math.PI) / 180);
  let sum = 0;
  const radii: number[] = [];
  for (const [lat, lng] of ring) {
    const r = Math.hypot((lng - cLng) * kx, (lat - cLat) * 110_540);
    radii.push(r);
    sum += r;
  }
  const mean = sum / radii.length;
  if (!(mean > 0)) return false;
  let maxDev = 0;
  for (const r of radii) maxDev = Math.max(maxDev, Math.abs(r - mean));
  return maxDev / mean <= 0.08;
}

/** 구역 안 구분선(점선) — 도면 표기를 그대로 옮긴 선 + 하위 구역 이름표 */
export type PreparedDivider = {
  /** [lat0, lng0, lat1, lng1, ...] */
  pts: Float64Array;
  labels: { text: string; lat: number; lng: number }[];
};

export type PreparedZones = {
  zones: PreparedZone[];
  /** 구역계 미고시 후보지(예: 사당21구역) — 폴리곤 없이 점으로 그린다 */
  points: SeoulZone[];
};

export function prepareZones(list: SeoulZone[]): PreparedZones {
  const zones: PreparedZone[] = [];
  const points: SeoulZone[] = [];

  for (const z of list) {
    if (!z.polygon || z.polygon.length < 3) {
      points.push(z);
      continue;
    }
    const rings: Ring[] = [];
    const holes: Ring[] = [];
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    for (const src of [z.polygon, ...(z.parts ?? [])]) {
      if (!src || src.length < 3) continue;
      const pts = new Float64Array(src.length * 2);
      let rMinLat = 90;
      let rMaxLat = -90;
      let rMinLng = 180;
      let rMaxLng = -180;
      for (let i = 0; i < src.length; i++) {
        const lat = src[i][0];
        const lng = src[i][1];
        pts[i * 2] = lat;
        pts[i * 2 + 1] = lng;
        if (lat < rMinLat) rMinLat = lat;
        if (lat > rMaxLat) rMaxLat = lat;
        if (lng < rMinLng) rMinLng = lng;
        if (lng > rMaxLng) rMaxLng = lng;
      }
      if (rMinLat < minLat) minLat = rMinLat;
      if (rMaxLat > maxLat) maxLat = rMaxLat;
      if (rMinLng < minLng) minLng = rMinLng;
      if (rMaxLng > maxLng) maxLng = rMaxLng;
      rings.push({ pts, minLat: rMinLat, minLng: rMinLng, maxLat: rMaxLat, maxLng: rMaxLng });
    }

    if (!rings.length) {
      points.push(z);
      continue;
    }
    for (const src of z.holes ?? []) {
      if (!src || src.length < 3) continue;
      const pts = new Float64Array(src.length * 2);
      let rMinLat = 90;
      let rMaxLat = -90;
      let rMinLng = 180;
      let rMaxLng = -180;
      for (let i = 0; i < src.length; i++) {
        const lat = src[i][0];
        const lng = src[i][1];
        pts[i * 2] = lat;
        pts[i * 2 + 1] = lng;
        if (lat < rMinLat) rMinLat = lat;
        if (lat > rMaxLat) rMaxLat = lat;
        if (lng < rMinLng) rMinLng = lng;
        if (lng > rMaxLng) rMaxLng = lng;
      }
      holes.push({ pts, minLat: rMinLat, minLng: rMinLng, maxLat: rMaxLat, maxLng: rMaxLng });
    }
    zones.push({
      zone: z,
      rings,
      holes,
      dividers: (z.dividers ?? [])
        .filter((d) => d && Array.isArray(d.coords) && d.coords.length >= 2)
        .map((d) => ({
          pts: Float64Array.from(d.coords.flatMap(([lat, lng]) => [lat, lng])),
          labels: (d.labels ?? [])
            .filter((l) => l && Array.isArray(l.at) && l.at.length === 2 && l.text)
            .map((l) => ({ text: l.text, lat: l.at[0], lng: l.at[1] })),
        })),
      minLat,
      minLng,
      maxLat,
      maxLng,
      completed: isCompletedZone(z),
      approx: !!z.boundaryApprox,
      approxCircle: isApproxCircleZone(z),
    });
  }

  return { zones, points };
}

/** 화면 사각형(경위도) — 지금 보이는 지도 영역 */
export type ClipBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export type ClippedZone = {
  /** 화면과 겹친 조각의 면적중심(경위도) — 이름표를 여기에 앉힌다 */
  lat: number;
  lng: number;
  /** 겹친 조각의 경위도 경계 — 화면에서 얼마나 크게 걸쳤는지 재는 데 쓴다 */
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** 겹친 조각의 면적(deg²) — 링(조각)끼리 넓이를 비교할 때만 쓴다 */
  area: number;
};

/** 다각형을 반평면(경도 또는 위도 한쪽)으로 자른다 — Sutherland–Hodgman */
function clipHalf(poly: number[], axis: 0 | 1, bound: number, keepGreater: boolean): number[] {
  const n = poly.length / 2;
  if (n < 3) return [];
  const out: number[] = [];
  const val = (i: number) => poly[(i % n) * 2 + axis];
  const inside = (v: number) => (keepGreater ? v >= bound : v <= bound);
  for (let i = 0; i < n; i += 1) {
    const j = (i + n - 1) % n;
    const vi = val(i);
    const vj = val(j);
    const inI = inside(vi);
    const inJ = inside(vj);
    if (inI !== inJ && vi !== vj) {
      // 경계와 만나는 점 — 다른 축 값은 선형보간
      const t = (bound - vj) / (vi - vj);
      const other = 1 - axis;
      const oi = poly[(i % n) * 2 + other];
      const oj = poly[(j % n) * 2 + other];
      const p = [0, 0];
      p[axis] = bound;
      p[other] = oj + (oi - oj) * t;
      out.push(p[0], p[1]);
    }
    if (inI) out.push(poly[(i % n) * 2], poly[(i % n) * 2 + 1]);
  }
  return out;
}

/** 다각형(평면 [lat,lng,...])의 면적과 면적중심 */
function polyAreaCentroid(poly: number[]): { area: number; lat: number; lng: number } {
  const n = poly.length / 2;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const y1 = poly[i * 2];
    const x1 = poly[i * 2 + 1];
    const y2 = poly[j * 2];
    const x2 = poly[j * 2 + 1];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a *= 0.5;
  if (!Number.isFinite(a) || a === 0) return { area: 0, lat: 0, lng: 0 };
  return { area: Math.abs(a), lat: cy / (6 * a), lng: cx / (6 * a) };
}

/**
 * 구역 폴리곤과 지금 화면의 **교집합** 조각 — 가장 넓은 조각의 면적중심을 돌려준다.
 *
 *   · 왜 필요한가: 이름표는 구역 중심(center)에 앉는데, 구역이 커서 중심이 화면 밖에 있으면
 *     화면에 경계만 보이고 이름표는 사라진다(사용자 지적: 제기동 137-2 아래쪽).
 *   · 여러 조각(MultiPolygon)이면 화면에 가장 넓게 걸친 조각을 고른다.
 *   · 화면과 전혀 겹치지 않으면 null — 부르는 쪽이 그 구역을 건너뛴다.
 */
export function clipZoneToBox(z: PreparedZone, box: ClipBox): ClippedZone | null {
  let best: ClippedZone | null = null;
  for (const ring of z.rings) {
    if (ring.maxLat < box.minLat || ring.minLat > box.maxLat) continue;
    if (ring.maxLng < box.minLng || ring.minLng > box.maxLng) continue;
    let poly: number[] = Array.from(ring.pts);
    poly = clipHalf(poly, 0, box.minLat, true);
    poly = clipHalf(poly, 0, box.maxLat, false);
    poly = clipHalf(poly, 1, box.minLng, true);
    poly = clipHalf(poly, 1, box.maxLng, false);
    if (poly.length < 6) continue;
    const c = polyAreaCentroid(poly);
    if (!(c.area > 0)) continue;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    for (let i = 0; i < poly.length; i += 2) {
      const lat = poly[i];
      const lng = poly[i + 1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    if (!best || c.area > best.area) {
      best = { lat: c.lat, lng: c.lng, minLat, maxLat, minLng, maxLng, area: c.area };
    }
  }
  return best;
}

/** 광선 교차 판정 — pts 는 [lat, lng, ...] */
function ringContains(pts: Float64Array, lat: number, lng: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[i * 2];
    const xi = pts[i * 2 + 1];
    const yj = pts[j * 2];
    const xj = pts[j * 2 + 1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 한 점이 구역 안인가 — 광선교차(외곽 링 하나라도 포함) 그리고 구멍(홀) 링 안이면 제외.
 *   GeoJSON 규칙대로:
 *     Polygon      = 바깥 링 포함, 홀 링 제외
 *     MultiPolygon = 조각 중 하나라도 포함(홀은 그 구역 기준으로 제외)
 */
export function zoneContains(z: PreparedZone, lat: number, lng: number): boolean {
  if (lat < z.minLat || lat > z.maxLat || lng < z.minLng || lng > z.maxLng) return false;
  let inside = false;
  for (const ring of z.rings) {
    if (lat < ring.minLat || lat > ring.maxLat || lng < ring.minLng || lng > ring.maxLng) continue;
    if (ringContains(ring.pts, lat, lng)) {
      inside = true;
      break;
    }
  }
  if (!inside) return false;
  for (const hole of z.holes) {
    if (lat < hole.minLat || lat > hole.maxLat || lng < hole.minLng || lng > hole.maxLng) continue;
    if (ringContains(hole.pts, lat, lng)) return false;
  }
  return true;
}

/** 두 좌표 사이 거리(m) — 서울 규모에선 평면 근사로 충분하다 */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const kx = 111_320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dx = (lng2 - lng1) * kx;
  const dy = (lat2 - lat1) * 110_540;
  return Math.hypot(dx, dy);
}

/** 선분 위의 가장 가까운 점까지 거리(m) */
function pointToSegmentM(
  lat: number,
  lng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ax = (aLng - lng) * kx;
  const ay = (aLat - lat) * 110_540;
  const bx = (bLng - lng) * kx;
  const by = (bLat - lat) * 110_540;
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2));
  return Math.hypot(ax + t * vx, ay + t * vy);
}

/** 구역 경계까지의 최단거리(m) — 경계 안이면 0 */
export function distanceToZoneM(z: PreparedZone, lat: number, lng: number): number {
  if (zoneContains(z, lat, lng)) return 0;
  let best = Infinity;
  for (const ring of [...z.rings, ...z.holes]) {
    const n = ring.pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const d = pointToSegmentM(
        lat,
        lng,
        ring.pts[j * 2],
        ring.pts[j * 2 + 1],
        ring.pts[i * 2],
        ring.pts[i * 2 + 1]
      );
      if (d < best) best = d;
    }
  }
  return best;
}

/** 한 점을 포함하는 **모든** 구역 (겹친 구역 안내용) — 작은(안쪽) 구역부터 */
export function zonesContaining(prep: PreparedZones, lat: number, lng: number): PreparedZone[] {
  const hits: PreparedZone[] = [];
  for (const z of prep.zones) {
    if (zoneContains(z, lat, lng)) hits.push(z);
  }
  return hits.sort((a, b) => a.zone.area - b.zone.area);
}

/** 가장 가까운 구역 n곳(경계까지 직선거리) — 경계 미고시 후보지는 대표 지점까지 */
export function nearestZones(
  prep: PreparedZones,
  lat: number,
  lng: number,
  limit = 3
): { zone: SeoulZone; distance: number; completed: boolean; prepared?: PreparedZone }[] {
  const rows: { zone: SeoulZone; distance: number; completed: boolean; prepared?: PreparedZone }[] = [];
  for (const z of prep.zones) {
    rows.push({ zone: z.zone, distance: distanceToZoneM(z, lat, lng), completed: z.completed, prepared: z });
  }
  for (const p of prep.points) {
    rows.push({
      zone: p,
      distance: distanceM(lat, lng, p.center[0], p.center[1]),
      completed: isCompletedZone(p),
    });
  }
  rows.sort((a, b) => a.distance - b.distance);
  return rows.slice(0, limit);
}

/** 화면 좌표(경위도)로 구역 찾기 — 없으면 undefined */
export function hitTestZones(prep: PreparedZones, lat: number, lng: number): SeoulZone | undefined {
  let best: SeoulZone | undefined;
  let bestSpan = Infinity;

  for (const z of prep.zones) {
    if (!zoneContains(z, lat, lng)) continue;
    const span = (z.maxLat - z.minLat) * (z.maxLng - z.minLng);
    if (span < bestSpan) {
      bestSpan = span;
      best = z.zone;
    }
  }
  return best;
}
