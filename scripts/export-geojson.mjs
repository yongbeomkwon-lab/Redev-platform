// 구역 폴리곤 → GeoJSON 내보내기 (재내보내기 전용)
// 사용: npm run geojson  →  public/data/zones.geojson 생성
//
// 원천: src/data/seoul-zones.json (서울시 정비구역 전수 1,800여 곳 — [lat,lng] 폴리곤)
//   ← python3 scripts/import-seoul-zones.py <UQ120 shp 디렉터리> <UQ181 shp 디렉터리> 가 만든다.
//   실제 데이터 파이프라인은 그 파이썬 스크립트이고, 이 스크립트는 JSON만 손봤을 때
//   GeoJSON(표준 [lng,lat], MultiPolygon)을 다시 만들어 주는 용도다.
//   · 공식 별칭(alias)·선정일·위치도 링크 등 보강 필드는 그대로 넘긴다.
//   · 구역계 미고시 후보지(polygon 없음)는 geometry: null + properties.center 로 내보낸다
//     (지도는 이 구역을 점으로 그린다 — 없는 경계를 만들지 않는다).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const zones = JSON.parse(readFileSync(join(here, "../src/data/seoul-zones.json"), "utf-8"));
const meta = JSON.parse(readFileSync(join(here, "../src/data/zones-meta.json"), "utf-8"));

const toRing = (ring) => [...ring, ring[0]].map(([lat, lng]) => [lng, lat]);

/** 이름 너머로 함께 넘겨야 하는 보강 필드 (없으면 생략) */
const EXTRA = [
  "alias",
  "selectedAt",
  "centerLabel",
  "locationMap",
  "note",
  "areaNote",
  "boundaryNote",
  "nameNote",
  "nameSources",
  "sources",
];

const features = zones.map((z) => {
  const properties = {
    id: z.id,
    name: z.name,
    type: z.type,
    kind: z.kind,
    stage: z.stage,
    gu: z.gu,
    area: z.area,
    featured: !!z.featured,
    sourceId: z.sid,
    geom: z.geom ?? "UQ120",
  };
  for (const key of EXTRA) if (z[key] !== undefined) properties[key] = z[key];

  if (!z.polygon) {
    // 구역계 미고시 — 경계 없이 대표 지점만
    properties.center = z.center ?? undefined;
    return { type: "Feature", id: z.id, properties, geometry: null };
  }

  const rings = [z.polygon, ...(z.parts ?? [])].map(toRing);
  return {
    type: "Feature",
    id: z.id,
    properties,
    geometry:
      rings.length > 1
        ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) }
        : { type: "Polygon", coordinates: [rings[0]] },
  };
});

meta.count = features.length;

const out = join(here, "../public/data/zones.geojson");
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));
console.log("wrote public/data/zones.geojson (" + features.length + " features)");
