"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 서울시 정비구역 전수 데이터 로더
//   public/data/zones.geojson (서울 열린데이터광장 OA-22712 + OA-20957)
//   → 지도(ZoneMap)와 탐색기(ZoneExplorer)가 함께 쓰는 경량 목록으로 변환한다.
//
//   · 원천: 「서울시 도시계획사업 현황(서울플랜+)」 실경계 + 「의제처리구역 위치정보」
//     (두 소스 모두 EPSG:5174 → WGS84 변환·간략화. 자세한 규칙은 scripts/import-seoul-zones.py)
//   · 페이지 번들에 넣지 않고 클라이언트에서 fetch한다(1,800여 구역 ≈ 1.3MB → gzip 300KB대).
// ─────────────────────────────────────────────────────────────────────────────
import type { MapZoneType } from "@/lib/types";

export type SeoulZone = {
  id: string;
  name: string;
  type: MapZoneType;
  kind: string; // 서울시 사업유형 소분류 (예: 재정비촉진구역)
  stage: string; // 서울시 추진단계 (예: 사업시행인가)
  gu: string; // 자치구
  area: number; // 고시 구역면적(㎡)
  featured: boolean; // 대표 구역(상세 데이터 있음)
  sourceId: string; // 서울 열린데이터광장 PRESENT_SN
  geom: "UQ120" | "UQ181"; // 경계 도형 출처
  center: [number, number];
  polygon: [number, number][];
  parts?: [number, number][][];
};

export type SeoulZonesMeta = {
  source: string;
  sourceDetail: string;
  asOf: string;
  asOfDetail: string;
  count: number;
};

type RawFeature = {
  id?: string;
  properties: Omit<SeoulZone, "center" | "polygon" | "parts"> & { id: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

type RawCollection = {
  type: "FeatureCollection";
  metadata: SeoulZonesMeta;
  features: RawFeature[];
};

export type SeoulZonesData = { meta: SeoulZonesMeta; zones: SeoulZone[] };

/** GeoJSON(경도,위도) → Leaflet([위도,경도]) 링 목록 */
function ringsOf(g: RawFeature["geometry"]): [number, number][][] {
  const polys = g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [(g.coordinates as number[][][])];
  return polys
    .map((poly) => poly[0].map(([lng, lat]) => [lat, lng] as [number, number]))
    .filter((ring) => ring.length >= 3);
}

function bboxCenter(ring: [number, number][]): [number, number] {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

let cache: Promise<SeoulZonesData> | null = null;

/** 서울시 정비구역 전수 목록 (실패 시 빈 목록 — 지도는 대표 구역만 그린다) */
export function loadSeoulZones(): Promise<SeoulZonesData> {
  if (cache) return cache;
  cache = fetch("/data/zones.geojson")
    .then((r) => (r.ok ? (r.json() as Promise<RawCollection>) : Promise.reject(new Error(String(r.status)))))
    .then((fc) => {
      const zones: SeoulZone[] = [];
      for (const f of fc.features) {
        const rings = ringsOf(f.geometry);
        if (!rings.length) continue;
        const { id, ...props } = f.properties;
        zones.push({
          ...props,
          id: id ?? f.id ?? "",
          center: bboxCenter(rings[0]),
          polygon: rings[0],
          ...(rings.length > 1 ? { parts: rings.slice(1) } : {}),
        });
      }
      return { meta: fc.metadata, zones };
    })
    .catch((e) => {
      console.warn("[zones] 서울시 정비구역 데이터를 불러오지 못했습니다", e);
      cache = null;
      return {
        meta: { source: "", sourceDetail: "", asOf: "", asOfDetail: "", count: 0 },
        zones: [],
      } as SeoulZonesData;
    });
  return cache;
}
