// 구역 폴리곤 → GeoJSON 내보내기 (재내보내기 전용)
// 사용: npm run geojson  →  public/data/zones.geojson 생성
//       npm run geojson -- --force   → 검사에 걸려도 강제로 쓴다(의도적으로 구역·필드를 지울 때)
//
// 원천: src/data/seoul-zones.json (서울시 정비구역 전수 1,800여 곳 — [lat,lng] 폴리곤)
//   ← python3 scripts/import-seoul-zones.py <UQ120 shp 디렉터리> <UQ181 shp 디렉터리> 가 만든다.
//   실제 데이터 파이프라인은 그 파이썬 스크립트이고, 이 스크립트는 JSON만 손봤을 때
//   GeoJSON(표준 [lng,lat], MultiPolygon)을 다시 만들어 주는 용도다.
//   · 공식 별칭(alias)·선정일·위치도 링크 등 보강 필드는 그대로 넘긴다.
//   · 구역계 미고시 후보지(polygon 없음)는 geometry: null + properties.center 로 내보낸다
//     (지도는 이 구역을 점으로 그린다 — 없는 경계를 만들지 않는다).
//
// ⚠️ 2026-11-23 사고: 이 스크립트가 seoul-zones.json 만 보고 다시 그리면서,
//    geojson 에만 얹혀 있던 구역 15곳(사당22·신수13·장안동 118-16·DDP 1·2·3 등)과
//    경계·설명·단계·badgeType 이 조용히 사라졌다. 그래서 지금은 **지워지는 것이 있으면
//    쓰지 않고 멈춘다**(--force 로만 통과). 구역을 정말 지우려면 seoul-zones.json 에서 지운 뒤
//    --force 로 한 번 돌리면 된다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const zones = JSON.parse(readFileSync(join(here, "../src/data/seoul-zones.json"), "utf-8"));
const meta = JSON.parse(readFileSync(join(here, "../src/data/zones-meta.json"), "utf-8"));
const force = process.argv.includes("--force");

// 폐합점은 한 번만 — 원천 폴리곤에 이미 폐합점이 있는 경우가 있다(중복 정점 방지)
const toRing = (ring) => {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]];
  return pts.map(([lat, lng]) => [lng, lat]);
};

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
  "hiddenByDefault",
  // 화면이 실제로 읽는 필드 — 빠지면 경계가 실선으로 그려지거나 배지 문구가 달라진다
  "boundaryApprox", // 근사 경계(점선) 표시
  "badgeType", // 사업유형 대신 띄울 말 (예: 신통모아미정)
  "asOf", // 자료 기준일
  "areaShape", // 도형 계측 면적
  "dividers", // 구역 안을 나누는 점선(사업예정구역 1·2 등) + 이름표 자리
  "households", // 세대수(보도 기준)
  "rightsDate", // 권리산정기준일
  "drawing", // 구역계 도면 파일 경로(작업 참고)
  // 동의율 — 모든 구역 상세에 한 줄로 붙는 핵심 수치(2026-11-26)
  "consentRate",
  "consentDate",
  "consentNote",
  // 사업 개요 수치(공개 자료)
  "owners",
  "householdsNow",
  "householdsPlan",
  "deterioration",
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
  // 구역 안에서 빼낸 시설(성당·공원 등) — GeoJSON inner ring(구멍)으로 내보낸다.
  //   Polygon 이면 외곽 링 뒤에 그대로 붙이고, MultiPolygon 이면 그 구멍을 품은 조각에 붙인다.
  const holes = (z.holes ?? [])
    .filter((h) => Array.isArray(h) && h.length >= 3)
    .map(toRing);
  let geometry;
  if (holes.length === 0) {
    geometry =
      rings.length > 1
        ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) }
        : { type: "Polygon", coordinates: [rings[0]] };
  } else if (rings.length === 1) {
    geometry = { type: "Polygon", coordinates: [rings[0], ...holes] };
  } else {
    const polys = rings.map((r) => [r]);
    for (const hole of holes) {
      const [x, y] = hole[0];
      let target = 0;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        let inside = false;
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [xi, yi] = ring[a];
          const [xj, yj] = ring[b];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) {
          target = i;
          break;
        }
      }
      polys[target].push(hole);
    }
    geometry = { type: "MultiPolygon", coordinates: polys };
  }
  return { type: "Feature", id: z.id, properties, geometry };
});

// ── 지워지는 것이 없는지 검사 ────────────────────────────────────────────────
const out = join(here, "../public/data/zones.geojson");
const isEmpty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

if (!force) {
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(out, "utf-8"));
  } catch {
    prev = null;
  }
  if (prev && Array.isArray(prev.features)) {
    const next = new Map(features.map((f) => [f.properties.id, f]));
    const dropped = prev.features.map((f) => f.properties.id).filter((id) => !next.has(id));
    const lost = [];
    for (const p of prev.features) {
      const f = next.get(p.properties.id);
      if (!f) continue;
      for (const [k, v] of Object.entries(p.properties)) {
        if (k === "polygon" || k === "sid") continue; // 예전 내보내기에서 남은 찌꺼기 필드
        // 경계가 있는 구역의 center 는 화면이 도형에서 다시 계산한다(bbox 중심) — 빠져도 무방
        if (k === "center" && (p.geometry || f.geometry)) continue;
        if (!isEmpty(v) && isEmpty(f.properties[k])) lost.push(`${p.properties.id}.${k}`);
      }
      if (p.geometry && !f.geometry) lost.push(`${p.properties.id}.geometry`);
    }
    if (dropped.length || lost.length) {
      console.error(
        `[중단] 이 내보내기로 사라지는 구역 ${dropped.length}곳 · 필드 ${lost.length}개가 있습니다. ` +
          `seoul-zones.json 이 오래된 상태일 수 있습니다.`
      );
      if (dropped.length) console.error("  사라질 구역: " + dropped.slice(0, 20).join(", ") + (dropped.length > 20 ? " …" : ""));
      if (lost.length) console.error("  사라질 필드: " + lost.slice(0, 20).join(", ") + (lost.length > 20 ? " …" : ""));
      console.error("  정말 지우려면 `npm run geojson -- --force` 로 다시 실행하세요. (파일은 쓰지 않았습니다)");
      process.exit(1);
    }
  }
}

meta.count = features.length;

writeFileSync(out, JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));
console.log("wrote public/data/zones.geojson (" + features.length + " features)");
