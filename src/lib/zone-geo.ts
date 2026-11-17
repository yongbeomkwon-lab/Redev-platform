// ─────────────────────────────────────────────────────────────────────────────
// 구역 경계 기하 계산 — 점이 구역 안인지, 구역이 걸치는 위치를 훑을 표본점
//
//  · 국토부 실거래가는 좌표를 주지 않는다. 그래서 거래의 **지번 주소를 카카오로
//    지오코딩**해 좌표를 얻고, 그 점이 구역 폴리곤 안인지 여기서 판정한다.
//  · 링 표기 규칙은 지도 레이어(prepare-zones.ts)와 같다 — [위도, 경도]의 배열,
//    GeoJSON 과 달리 경도가 뒤에 온다. 지도 모듈을 끌어오지 않도록 판정식만 따로 둔다.
//  · 구멍(홀) 링 안은 구역 밖이다(Polygon = 바깥 링 포함 − 홀, MultiPolygon = 조각 중 하나라도 포함).
// ─────────────────────────────────────────────────────────────────────────────

export type ZoneShape = {
  /** 외곽 링 — [위도, 경도] */
  polygon?: [number, number][] | null;
  /** MultiPolygon 의 나머지 조각 */
  parts?: [number, number][][] | null;
  /** 구역 안에 뚫린 구멍 */
  holes?: [number, number][][] | null;
};

/** 외곽 링 목록(본 링 + 조각) — 꼭짓점 3개 미만은 버린다 */
export function outerRings(shape: ZoneShape | null | undefined): [number, number][][] {
  if (!shape) return [];
  const out: [number, number][][] = [];
  if (shape.polygon && shape.polygon.length >= 3) out.push(shape.polygon);
  for (const p of shape.parts ?? []) if (p && p.length >= 3) out.push(p);
  return out;
}

/** 경계 도형이 있는가 — 경계 미고시 후보지는 없다 */
export function hasShape(shape: ZoneShape | null | undefined): boolean {
  return outerRings(shape).length > 0;
}

/** 광선 교차(ray casting) — pts 는 [lat, lng, ...] 순서의 꼭짓점 목록 */
export function pointInRing(pts: [number, number][], lat: number, lng: number): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[i][0];
    const xi = pts[i][1];
    const yj = pts[j][0];
    const xj = pts[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 한 점이 구역 안인가 — 외곽 링 중 하나에 들고, 홀 링 안이면 제외 */
export function pointInZone(shape: ZoneShape | null | undefined, lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  let inside = false;
  for (const ring of outerRings(shape)) {
    if (pointInRing(ring, lat, lng)) {
      inside = true;
      break;
    }
  }
  if (!inside) return false;
  for (const hole of shape?.holes ?? []) {
    if (hole && hole.length >= 3 && pointInRing(hole, lat, lng)) return false;
  }
  return true;
}

export type ZoneBBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export function bboxOf(shape: ZoneShape | null | undefined): ZoneBBox | null {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const ring of outerRings(shape)) {
    for (const [lat, lng] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat > maxLat) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/** 두 좌표 사이 거리(m) — 서울 규모에선 평면 근사로 충분하다 */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const kx = 111_320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * 110_540);
}

function ringCentroid(ring: [number, number][]): [number, number] {
  let lat = 0;
  let lng = 0;
  for (const [a, b] of ring) {
    lat += a;
    lng += b;
  }
  return [lat / ring.length, lng / ring.length];
}

/**
 * 구역이 **걸치는 법정동**을 찾기 위한 표본점 — 구역 안쪽에 고루 퍼진 점 몇 개.
 *   · 바운딩박스 격자점 중 구역 안에 드는 점 + 경계 꼭짓점을 안쪽으로 8m 당긴 점을 후보로 두고,
 *     중심에서 가장 먼 점부터(최대-최소 거리) 골라 퍼지게 한다.
 *   · 길쭉한 구역·여러 조각으로 나뉜 구역도 각 조각에서 점이 잡히도록 조각별로 후보를 넣는다.
 *   · 좌표 1건당 카카오 역지오코딩 1회라 표본은 8~12개로 묶는다.
 */
export function sampleZonePoints(
  shape: ZoneShape | null | undefined,
  max = 10,
  center?: [number, number]
): [number, number][] {
  const rings = outerRings(shape);
  if (!rings.length) return [];
  const bb = bboxOf(shape);
  if (!bb) return [];

  const cands: [number, number][] = [];
  const add = (lat: number, lng: number) => {
    if (!pointInZone(shape, lat, lng)) return;
    for (const [a, b] of cands) if (metersBetween(lat, lng, a, b) < 12) return; // 중복 제거
    cands.push([lat, lng]);
  };

  // ① 격자 — 큰 구역일수록 촘촘히
  const spanM = metersBetween(bb.minLat, bb.minLng, bb.maxLat, bb.maxLng);
  const grid = spanM > 900 ? 11 : spanM > 400 ? 9 : 7;
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      add(bb.minLat + ((bb.maxLat - bb.minLat) * i) / grid, bb.minLng + ((bb.maxLng - bb.minLng) * j) / grid);
    }
  }

  // ② 경계 꼭짓점을 안쪽으로 살짝 당긴 점 — 얇은 구역에서 격자가 비는 것을 메운다
  for (const ring of rings) {
    const c = ringCentroid(ring);
    const step = Math.max(1, Math.floor(ring.length / 10));
    for (let i = 0; i < ring.length; i += step) {
      const [lat, lng] = ring[i];
      const dLat = c[0] - lat;
      const dLng = c[1] - lng;
      const len = Math.hypot(dLat * 110_540, dLng * 88_000);
      if (len <= 0) continue;
      const k = Math.min(0.5, 10 / len);
      add(lat + dLat * k, lng + dLng * k);
    }
  }

  if (!cands.length) return [];

  // ③ 중심에서 시작해 가장 먼 점을 차례로 — 조각마다 점이 하나씩 잡힌다
  const seed: [number, number] =
    center && pointInZone(shape, center[0], center[1]) ? [center[0], center[1]] : cands[0];
  const picked: [number, number][] = [seed];
  while (picked.length < max && picked.length < cands.length) {
    let best: [number, number] | null = null;
    let bestD = -1;
    for (const c of cands) {
      let d = Infinity;
      for (const p of picked) d = Math.min(d, metersBetween(c[0], c[1], p[0], p[1]));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) break;
    picked.push(best);
  }
  return picked;
}
