#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// public/data/zone-index.json — 커뮤니티 구역 고르기용 **가벼운 색인**
//
//   zones.geojson(2.2MB, 경계 좌표 포함)은 게시판에서 쓰기엔 너무 무겁다.
//   여기서는 id·이름·구·사업유형·별칭만 뽑아 100KB 안팎의 JSON 으로 만든다.
//   (지도 구역 패널의 zoneId 와 같은 id 를 쓴다 — 글이 지도의 구역과 그대로 이어진다)
//
//   실행: node scripts/build-zone-index.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const geo = JSON.parse(readFileSync(resolve(root, "public/data/zones.geojson"), "utf8"));

const rows = [];
const seen = new Set();
for (const f of geo.features ?? []) {
  const p = f?.properties ?? {};
  const id = typeof p.id === "string" ? p.id.trim() : "";
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!id || !name || seen.has(id)) continue;
  seen.add(id);
  const aliases = Array.isArray(p.alias) ? p.alias.filter((a) => typeof a === "string" && a.trim()) : [];
  rows.push({
    id,
    name,
    gu: typeof p.gu === "string" ? p.gu : "",
    type: typeof p.type === "string" ? p.type : "",
    ...(aliases.length ? { alias: aliases } : {}),
  });
}

rows.sort((a, b) => (a.gu + a.name).localeCompare(b.gu + b.name, "ko"));

const out = { count: rows.length, builtFrom: "public/data/zones.geojson", zones: rows };
writeFileSync(resolve(root, "public/data/zone-index.json"), JSON.stringify(out));
console.log(`zone-index.json — ${rows.length}개 구역`);
