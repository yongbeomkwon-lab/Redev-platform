// 구역 폴리곤 → GeoJSON 내보내기
// 사용: npm run geojson  →  public/data/zones.geojson 생성
//
// 원천: src/data/seoul-zones.json (서울시 도시계획사업 실경계 150여 곳)
//   ← python3 scripts/import-seoul-zones.py <shp 디렉터리> 로 생성된다.
// 이 스크립트는 그 JSON을 지도용 GeoJSON(표준 [lng,lat], MultiPolygon 지원)으로 내보낸다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const zones = JSON.parse(readFileSync(join(here, "../src/data/seoul-zones.json"), "utf-8"));

const features = zones.map((z) => {
  // GeoJSON 표준은 [lng, lat] 순서 — Leaflet([lat,lng])과 반대이므로 변환
  const rings = [z.polygon, ...(z.parts ?? [])].map((ring) => [
    ...ring.map(([lat, lng]) => [lng, lat]),
    [ring[0][1], ring[0][0]],
  ]);
  return {
    type: "Feature",
    id: z.id,
    properties: {
      id: z.id,
      name: z.name,
      type: z.type,
      gu: z.gu,
      stage: z.stage,
      kind: z.kind,
      area: z.area,
      featured: z.featured,
    },
    geometry:
      rings.length > 1
        ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) }
        : { type: "Polygon", coordinates: rings[0] },
  };
});

const out = join(here, "../public/data/zones.geojson");
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
console.log("wrote public/data/zones.geojson (" + features.length + " features)");
