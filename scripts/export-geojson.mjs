// 구역 폴리곤 → GeoJSON 내보내기
// 사용: npm run geojson  →  public/data/zones.geojson 생성
// 실데이터 교체 시: src/data/zones-geo.json을 WFS 응답으로 갱신하면
// sample.ts(앱 표시)와 이 스크립트(GeoJSON 내보내기)가 함께 갱신된다.
// (scripts/README-gis.md 참고)
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const zonesGeo = JSON.parse(readFileSync(join(here, "../src/data/zones-geo.json"), "utf-8"));

const features = zonesGeo.map((z) => ({
  type: "Feature",
  id: z.id,
  properties: { id: z.id },
  geometry: {
    type: "Polygon",
    // GeoJSON 표준은 [lng, lat] 순서 — Leaflet([lat,lng])과 반대이므로 변환
    coordinates: [[...z.polygon.map(([lat, lng]) => [lng, lat]), [z.polygon[0][1], z.polygon[0][0]]]],
  },
}));

const out = join(here, "../public/data/zones.geojson");
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
console.log("wrote public/data/zones.geojson (" + features.length + " features)");
