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
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  /** 준공·입주 완료 — 점선으로 그린다 */
  completed: boolean;
  /** 위치 참고용 근사원(실제 구역계 아님) — 점선으로 옅게 그린다 */
  approx: boolean;
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
      minLat,
      minLng,
      maxLat,
      maxLng,
      completed: isCompletedZone(z),
      approx: !!z.boundaryApprox,
    });
  }

  return { zones, points };
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
