// ─────────────────────────────────────────────────────────────────────────────
// 정비구역 폴리곤 사전 계산 — 카카오맵 캔버스 오버레이의 그리기/클릭 판정용 자료구조
//
//   · 1,824구역 · 36,000여 꼭짓점을 매 프레임 GeoJSON 객체로 다루면 느리다.
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
  rings: Ring[];
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  /** 준공·입주 완료 — 점선으로 그린다 */
  completed: boolean;
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
    zones.push({ zone: z, rings, minLat, minLng, maxLat, maxLng, completed: isCompletedZone(z) });
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

/** 화면 좌표(경위도)로 구역 찾기 — 없으면 undefined */
export function hitTestZones(prep: PreparedZones, lat: number, lng: number): SeoulZone | undefined {
  let best: SeoulZone | undefined;
  let bestSpan = Infinity;

  for (const z of prep.zones) {
    if (lat < z.minLat || lat > z.maxLat || lng < z.minLng || lng > z.maxLng) continue;
    let hit = false;
    for (const ring of z.rings) {
      if (lat < ring.minLat || lat > ring.maxLat || lng < ring.minLng || lng > ring.maxLng) continue;
      if (ringContains(ring.pts, lat, lng)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const span = (z.maxLat - z.minLat) * (z.maxLng - z.minLng);
    if (span < bestSpan) {
      bestSpan = span;
      best = z.zone;
    }
  }
  return best;
}
