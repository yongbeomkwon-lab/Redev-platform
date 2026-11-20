#!/usr/bin/env node
/**
 * 노후도(연식) 분포 조사 — 구역 폴리곤 안 건물들의 사용승인 연도 히스토그램
 *
 *   node scripts/age-distribution.mjs <zoneId>[,<zoneId>...] [baseUrl]
 *
 * · zones.geojson 의 폴리곤을 감싸는 0.005° 타일을 `/api/building-age` 로 받아,
 *   건물 중심점이 폴리곤 안에 드는 것만 센다(클라이언트가 칠하는 범위와 같은 기준).
 * · 기본 baseUrl 은 운영 도메인 — 이 작업 환경은 api.vworld.kr 를 못 부른다(해외 IP 502).
 */
import fs from "node:fs";
import path from "node:path";

const zoneArg = process.argv[2] ?? "dj-heukseok-12";
const base = (process.argv[3] ?? "https://redev-platform-iota.vercel.app").replace(/\/$/, "");
const TILE = 0.005;

const zones = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/data/zones.geojson"), "utf8")
).features;

function ringsOf(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((poly) => poly[0]);
}

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

async function main() {
  for (const id of zoneArg.split(",").map((s) => s.trim())) {
    const f = zones.find((z) => z.properties?.id === id);
    if (!f) {
      console.log(`\n### ${id} — zones.geojson 에 없음`);
      continue;
    }
    const rings = ringsOf(f.geometry).map((ring) => ring.flatMap(([x, y]) => [x, y]));
    const flat = rings.flat();
    const lngs = flat.filter((_, i) => i % 2 === 0);
    const lats = flat.filter((_, i) => i % 2 === 1);
    const tx0 = Math.floor(Math.min(...lngs) / TILE), tx1 = Math.floor(Math.max(...lngs) / TILE);
    const ty0 = Math.floor(Math.min(...lats) / TILE), ty1 = Math.floor(Math.max(...lats) / TILE);

    let inZone = 0;
    const byYear = new Map();
    let nulls = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const bbox = [tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE]
          .map((v) => v.toFixed(6))
          .join(",");
        const res = await fetch(`${base}/api/building-age?bbox=${bbox}&tile=${tx},${ty}`);
        const data = await res.json();
        if (!data.ok) {
          console.log(`  ! tile ${tx},${ty} — ${data.error} ${data.detail ?? ""}`);
          continue;
        }
        for (const b of data.buildings) {
          let sx = 0, sy = 0, n = 0;
          for (const ring of b.r) {
            for (let i = 0; i < ring.length; i += 2) {
              sx += ring[i];
              sy += ring[i + 1];
              n++;
            }
          }
          if (n < 3) continue;
          const c = [sx / n, sy / n];
          if (!rings.some((ring) => inside(c, ring))) continue;
          inZone++;
          if (b.y == null) nulls++;
          else byYear.set(b.y, (byYear.get(b.y) ?? 0) + 1);
        }
      }
    }
    const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
    const now = new Date().getFullYear();
    const buckets = { under10: 0, teens: 0, twenties: 0, over30: 0 };
    for (const [y, c] of years) {
      const age = now - y;
      if (age < 10) buckets.under10 += c;
      else if (age < 20) buckets.teens += c;
      else if (age < 30) buckets.twenties += c;
      else buckets.over30 += c;
    }
    console.log(`\n### ${id} (${f.properties?.name ?? ""}) — 구역 안 건물 ${inZone}동`);
    console.log(`  연식 미상 ${nulls}동 (${((nulls / Math.max(1, inZone)) * 100).toFixed(1)}%)`);
    console.log(
      `  10년 미만 ${buckets.under10} · 10~20년 ${buckets.teens} · 20~30년 ${buckets.twenties} · 30년 이상 ${buckets.over30}`
    );
    const recent = years.filter(([y]) => y >= 2018).map(([y, c]) => `${y}:${c}`);
    console.log(`  2018년 이후 사용승인: ${recent.length ? recent.join(" ") : "없음"}`);
    console.log(
      `  상위 연도: ${years.slice(0, 8).map(([y, c]) => `${y}(${c})`).join(" ")}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
