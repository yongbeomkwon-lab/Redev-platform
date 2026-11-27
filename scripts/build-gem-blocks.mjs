#!/usr/bin/env node
/**
 * 💎 원석 찾기 — 미지정 노후 저층 블록 스캐너 (데이터 생성)
 *
 *   node scripts/build-gem-blocks.mjs [--top 280] [--no-label]
 *
 * 무엇을 하나
 *   ① 서울 전역 건물 점(중심 좌표·외곽면적·사용승인연도)을 130m 격자(1.69ha)에 집계한다.
 *      · 건물 좌표는 `tmp/gem/tiles/*.json.gz` (scripts/fetch-gem-buildings.py 가
 *        배포 라우트 `/api/building-age` 를 0.005° 타일로 받아 둔 것) 에서 읽는다.
 *      · `public/data/age-index/*.json` 은 **좌표가 없다**(PNU 끝 9자리·연도·연면적뿐) —
 *        그래서 연식은 그 색인을 이미 덮어쓴 라우트 응답을 쓴다(지도 노후도와 같은 값).
 *   ② **원석 조건**에 맞는 칸만 남긴다.
 *      · 저층 건물(외곽 250㎡ 이하) 15동 이상
 *      · 30년 이상(1996년 이전 사용승인) 비율 60% 이상
 *      · 최근 10년(2016년 이후 = 사용승인 10년 이하) 신축 비율 10% 이하 — 신축 쪼개기가 적은 곳
 *      · 큰 건물(외곽 400㎡ 이상) 비중 35% 이하 — 아파트 단지·대형 시설 제외
 *      · 기존 정비구역(`public/data/zones.geojson`)과 20% 이상 겹치면 제외
 *   ③ 점수를 매기고, 서로 240m 안에 겹치는 칸은 점수 높은 쪽만 남겨 상위 150~300곳을 고른다
 *      (구당 상한 18곳 — 한 동네에 몰리지 않게 서울 전체에 흩는다).
 *   ④ 고른 칸마다 **저층 건물 무리를 감싸는 볼록껍질 + 12m 여유**로 폴리곤을 만들고,
 *      대표 지점의 지번·법정동은 배포 라우트 `/api/parcel` 로 채운다(결과는 tmp 에 캐시).
 *
 * 결과: `public/data/gem-blocks.json`
 *   { generatedAt, method, summary:{ total, byGu }, blocks:[ { id, score, grade, gu, dong, jibun,
 *     addr, center:[lat,lng], polygon:[[lat,lng],…], areaM2, pyeong, bldCount, allCount,
 *     old30Pct, old20Pct, new10Pct, lowRisePct, avgFootprint, zonesNear:[…], station } ] }
 *
 *   ★ 이 폴리곤은 **격자·건물 위치로 추정한 참고 경계**다. 고시된 구역계가 아니고,
 *     "미지정 잠재 구역" 후보를 보여 주는 용도다.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "tmp", "gem");
const OUT = path.join(ROOT, "public", "data", "gem-blocks.json");
const ZONES = path.join(ROOT, "public", "data", "zones.geojson");
const SIG = path.join(WORK, "sig_raw.json");
const STATIONS = path.join(ROOT, "public", "data", "subway-stations.json");
const LABEL_CACHE = path.join(WORK, "parcel-labels.json");
const BASE = "https://redev-platform-iota.vercel.app";

const NOW_YEAR = 2026;
const OLD30 = NOW_YEAR - 30; // 1996 이전 사용승인 = 30년 이상
const OLD20 = NOW_YEAR - 20; // 2006 이전 = 20년 이상
const NEW10 = NOW_YEAR - 10; // 2016 이후 = 10년 내 신축
const CELL = 130; // 격자 한 변(m) — 1.69ha
const LOW_AREA = 250; // 저층 주택 외곽면적 상한(㎡)
const BIG_AREA = 400; // 이 이상이면 아파트 동·대형 시설로 본다
const MIN_BLD = 15;
const MIN_OLD30 = 0.6;
const MAX_NEW10 = 0.1;
const MAX_BIG_SHARE = 0.35;
const MAX_ZONE_OVERLAP = 0.2;
const MIN_SEP_M = 240; // 고른 블록 사이 최소 간격
const PER_GU_MAX = 18;
const TOP = 280;
/** 최종 채택 하한 — 라벨·품질 검사를 통과한 것만 세므로 여유 있게 뽑는다 */
const PICK_MARGIN = 80;
const MIN_AVG_FOOTPRINT = 45; // 평균 외곽면적(m²) — 창고·비닐하우스만 모인 칸을 거른다

const LAT0 = 37.55;
const LON0 = 126.9;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110540;
const toXY = (lng, lat) => [(lng - LON0) * KX, (lat - LAT0) * KY];
const toLL = (x, y) => [y / KY + LAT0, x / KX + LON0]; // [lat, lng]

const argOf = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const TOP_N = argOf("--top", TOP);
const NO_LABEL = process.argv.includes("--no-label");

// ── 읽기 ────────────────────────────────────────────────────────────────────
function readTile(file) {
  const buf = fs.readFileSync(file);
  const json = JSON.parse(file.endsWith(".gz") ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8"));
  return json;
}

/** tiles + (잘린 타일은) tiles-fine — [[lng,lat,footprint,year|null], …] */
function loadBuildings() {
  const tileDir = path.join(WORK, "tiles");
  const fineDir = path.join(WORK, "tiles-fine");
  const fineByParent = new Map();
  if (fs.existsSync(fineDir)) {
    for (const f of fs.readdirSync(fineDir)) {
      if (!f.endsWith(".json.gz")) continue;
      const [tx, ty] = f.split("_");
      const k = `${tx}_${ty}`;
      if (!fineByParent.has(k)) fineByParent.set(k, []);
      fineByParent.get(k).push(path.join(fineDir, f));
    }
  }
  const rows = [];
  let truncated = 0;
  for (const f of fs.readdirSync(tileDir)) {
    if (!f.endsWith(".json.gz")) continue;
    const d = readTile(path.join(tileDir, f));
    const k = `${d.tile[0]}_${d.tile[1]}`;
    if (d.truncated) {
      truncated++;
      const fine = fineByParent.get(k);
      if (fine?.length) {
        for (const g of fine) rows.push(...readTile(g).rows);
        continue;
      }
    }
    rows.push(...d.rows);
  }
  // 같은 건물이 타일 경계에서 두 번 들어온다 — 값이 완전히 같으므로 키로 접는다
  const uniq = new Map();
  for (const r of rows) uniq.set(`${r[0]}|${r[1]}|${r[2]}|${r[3] ?? ""}`, r);
  return { rows: [...uniq.values()], truncated };
}

function zoneRings(geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  return polys.map((p) => p.map((ring) => ring.map(([lng, lat]) => [lng, lat])));
}

function loadZones() {
  const data = JSON.parse(fs.readFileSync(ZONES, "utf8"));
  const out = [];
  for (const f of data.features) {
    const p = f.properties ?? {};
    if (!f.geometry) continue;
    const rings = zoneRings(f.geometry);
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
    for (const poly of rings)
      for (const [lng, lat] of poly[0]) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    out.push({
      id: p.id,
      name: p.name ?? "",
      stage: p.stage ?? "",
      type: p.type ?? "",
      rings,
      bbox: [minLng, minLat, maxLng, maxLat],
    });
  }
  return out;
}

function loadSeoulGu() {
  const d = JSON.parse(fs.readFileSync(SIG, "utf8"));
  const out = [];
  for (const f of d.features) {
    const code = f.properties?.code ?? "";
    if (!code.startsWith("11")) continue;
    const name = f.properties.name; // 예: "관악구"
    const geom = f.geometry;
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    const rings = polys.map((p) => p[0].map(([lng, lat]) => [lng, lat]));
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
    for (const ring of rings)
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    out.push({ gu: name, rings, bbox: [minLng, minLat, maxLng, maxLat] });
  }
  return out;
}

// ── 기하 ────────────────────────────────────────────────────────────────────
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 다중 폴리곤(첫 링=외곽, 나머지=구멍) 안인가 */
function inPolys(lng, lat, polys) {
  for (const poly of polys) {
    if (!inRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) if (inRing(lng, lat, poly[i])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

const inBbox = (lng, lat, b) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 점 → 폴리곤(경위도) 거리(m) — 안이면 0 */
function distToPolys(lng, lat, polys) {
  if (inPolys(lng, lat, polys)) return 0;
  let best = Infinity;
  for (const poly of polys)
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j];
        const [bx, by] = ring[i];
        // 경위도 → 미터 근사(서울 위도)
        const d = segDist(lng * KX, lat * KY, ax * KX, ay * KY, bx * KX, by * KY);
        if (d < best) best = d;
      }
    }
  return best;
}

/** 단조 사슬 볼록껍질 — [[x,y], …] (반시계) */
function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 볼록 다각형을 바깥으로 d(m) 만큼 평행 이동 — 이웃한 두 변의 오프셋 직선 교점 */
function offsetConvex(ring, d) {
  const n = ring.length;
  if (n < 3) return ring;
  const area = ring.reduce((s, p, i) => {
    const q = ring[(i + 1) % n];
    return s + (p[0] * q[1] - q[0] * p[1]);
  }, 0);
  const sign = area > 0 ? 1 : -1; // 진행 방향에 따른 법선 부호
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = (sign * dy) / L, ny = (-sign * dx) / L; // 바깥 법선
    lines.push({ px: a[0] + nx * d, py: a[1] + ny * d, dx, dy });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(den) < 1e-9) {
      out.push([l2.px, l2.py]);
      continue;
    }
    // l1: p1 + t·d1 = l2: p2 + s·d2
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
    out.push([l1.px + l1.dx * t, l1.py + l1.dy * t]);
  }
  return out;
}

/** RDP 단순화 */
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1, bestD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(ring[i][0], ring[i][1], ring[s][0], ring[s][1], ring[e][0], ring[e][1]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

/**
 * 저층 건물 무리를 따라가는 경계 — 10m 격자에 건물을 찍고 한 칸 부풀린 뒤 외곽선을 따라간다.
 * 볼록껍질과 달리 골목·빈터를 비켜 가서 실제 블록 모양에 가깝다.
 */
function clusterPolygon(rowsIdx, rows, c) {
  const S = 10; // 격자 한 칸(m)
  const x0 = c.ix * CELL - 30;
  const y0 = c.iy * CELL - 30;
  const W = Math.ceil((CELL + 60) / S);
  const H = W;
  const grid = new Uint8Array(W * H);
  for (const i of rowsIdx) {
    const [x, y] = toXY(rows[i][0], rows[i][1]);
    const gx = Math.floor((x - x0) / S);
    const gy = Math.floor((y - y0) / S);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy * W + gx] = 1;
  }
  // 닫힘(closing) — 3×3 부풀리기 후 다시 깎는다: 골목(10m)은 잇되 바깥으로 넓어지지 않아
  // 경계가 건물 줄을 따라간다(그냥 부풀리면 130m 격자 사각형에 가까워진다).
  const grown = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!grid[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) grown[ny * W + nx] = 1;
        }
    }
  const pad = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!grown[y * W + x]) continue;
      let keep = true;
      for (let dy = -1; dy <= 1 && keep; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && !grown[ny * W + nx]) {
            keep = false;
            break;
          }
        }
      if (keep) pad[y * W + x] = 1;
    }
  // 가장 큰 덩어리(4연결)만 쓴다
  const lab = new Int32Array(W * H).fill(-1);
  let bestLab = -1, bestN = 0, nextLab = 0;
  const stack = [];
  for (let i = 0; i < pad.length; i++) {
    if (!pad[i] || lab[i] >= 0) continue;
    const L = nextLab++;
    let n = 0;
    lab[i] = L;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop();
      n++;
      const x = k % W, y = (k / W) | 0;
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1];
      for (const j of nb) {
        if (j < 0 || lab[j] >= 0 || !pad[j]) continue;
        lab[j] = L;
        stack.push(j);
      }
    }
    if (n > bestN) {
      bestN = n;
      bestLab = L;
    }
  }
  const filled = (x, y) => x >= 0 && x < W && y >= 0 && y < H && lab[y * W + x] === bestLab;
  // 외곽선 걷기 — 칸 가장자리를 반시계 방향(내부가 왼쪽)으로 잇는다
  const edges = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const k = `${ax},${ay}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([bx, by]);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) addEdge(x, y + 1, x, y);
      if (!filled(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
    }
  const rings = [];
  const used = new Set();
  for (const [start] of edges) {
    let cur = start;
    const ring = [];
    let guard = 0;
    while (guard++ < 20000) {
      const list = edges.get(cur);
      if (!list || !list.length) break;
      const next = list.shift();
      ring.push(cur.split(",").map(Number));
      cur = `${next[0]},${next[1]}`;
      if (cur === start) break;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  if (!rings.length) return null;
  rings.sort((a, b) => polygonArea(b) - polygonArea(a));
  const ring = rings[0].map(([gx, gy]) => [x0 + gx * S, y0 + gy * S]);
  return ring;
}

/** Chaikin 모서리 자르기 — 10m 격자 계단을 부드러운 경계로 다듬는다 */
function chaikin(ring, iterations = 2) {
  let cur = ring;
  for (let it = 0; it < iterations; it++) {
    const out = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    cur = out;
  }
  return cur;
}

function polygonArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]);
  return Math.abs(a / 2);
}

// ── 격자 집계 ───────────────────────────────────────────────────────────────
function buildCells(rows) {
  const cells = new Map();
  for (let i = 0; i < rows.length; i++) {
    const [lng, lat, area, yearRaw] = rows[i];
    const year = Number(yearRaw) || 0;
    const ix = Math.floor(((lng - LON0) * KX) / CELL);
    const iy = Math.floor(((lat - LAT0) * KY) / CELL);
    const key = `${ix}:${iy}`;
    let c = cells.get(key);
    if (!c) {
      c = { key, ix, iy, n: 0, nLow: 0, knownLow: 0, o30: 0, o20: 0, n10: 0, nBig: 0, sumLowArea: 0, lowIdx: [], oldLowIdx: [] };
      cells.set(key, c);
    }
    c.n++;
    if (area >= BIG_AREA) c.nBig++;
    if (area <= LOW_AREA) {
      c.nLow++;
      c.sumLowArea += area;
      c.lowIdx.push(i);
      if (year > 0) {
        c.knownLow++;
        if (year <= OLD30) {
          c.o30++;
          c.oldLowIdx.push(i);
        }
        if (year <= OLD20) c.o20++;
        if (year >= NEW10) c.n10++;
      }
    }
  }
  return cells;
}

function cellCenter(c) {
  return toLL((c.ix + 0.5) * CELL, (c.iy + 0.5) * CELL); // [lat,lng]
}

// ── 지번 라벨(배포 라우트) ──────────────────────────────────────────────────
function loadLabelCache() {
  try {
    return JSON.parse(fs.readFileSync(LABEL_CACHE, "utf8"));
  } catch {
    return {};
  }
}

async function fetchLabel(lat, lng) {
  const u = `${BASE}/api/parcel?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`;
  for (let k = 0; k < 3; k++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const d = await res.json();
      if (d.ok && d.parcel?.addr) return d.parcel.addr;
    } catch {
      /* 재시도 */
    }
    await new Promise((r) => setTimeout(r, 400 * (k + 1)));
  }
  return null;
}

async function labelAll(targets, cache) {
  const todo = targets.filter((t) => !cache[t.key]);
  let done = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (todo.length) {
      const t = todo.shift();
      let first = null;
      for (const pt of t.pts) {
        const addr = await fetchLabel(pt.lat, pt.lng);
        if (!addr) continue;
        // 산지 필지("산 93-8")는 대표 지번으로 덜 알맞다 — 다른 건물 자리를 한 번 더 물어본다
        if (!first) first = addr;
        if (!/\s산\s/.test(addr)) {
          first = addr;
          break;
        }
      }
      if (first) cache[t.key] = first;
      if (++done % 40 === 0) console.error(`  · 지번 ${done}/${targets.length}`);
    }
  });
  await Promise.all(workers);
  fs.writeFileSync(LABEL_CACHE, JSON.stringify(cache));
}

// ── 본체 ────────────────────────────────────────────────────────────────────
async function main() {
  const zones = loadZones();
  const gus = loadSeoulGu();
  const stations = JSON.parse(fs.readFileSync(STATIONS, "utf8"));

  const { rows, truncated } = loadBuildings();
  console.error(`건물 ${rows.length.toLocaleString()}동 (잘린 타일 ${truncated}개는 하위 타일로 대체)`);

  const cells = buildCells(rows);
  console.error(`130m 격자 ${cells.size.toLocaleString()}칸`);

  // ① 원석 조건
  const candidates = [];
  for (const c of cells.values()) {
    if (c.nLow < MIN_BLD) continue;
    const o30 = c.knownLow ? c.o30 / c.knownLow : 0;
    const o20 = c.knownLow ? c.o20 / c.knownLow : 0;
    const n10 = c.knownLow ? c.n10 / c.knownLow : 0;
    if (o30 < MIN_OLD30 || n10 > MAX_NEW10) continue;
    if (c.n && c.nBig / c.n > MAX_BIG_SHARE) continue;
    const lowShare = c.nLow / c.n;
    const sizeScore = Math.min(1, c.nLow / 60);
    const score = 100 * (0.42 * o30 + 0.18 * o20 + 0.15 * lowShare + 0.13 * (1 - n10) + 0.12 * sizeScore);
    const [lat, lng] = cellCenter(c);
    candidates.push({ c, lat, lng, o30, o20, n10, lowShare, score });
  }
  console.error(`원석 조건 통과 ${candidates.length.toLocaleString()}칸`);
  candidates.sort((a, b) => b.score - a.score);

  // ② 정비구역 겹침(샘플 36점) → 20% 이상 제외
  // 구역 bbox 를 600m 넓혀 두고, 그 안에 드는 구역만 본다(2390곳 전수 계산을 피한다)
  const padLng = 600 / KX, padLat = 600 / KY;
  const zoneBbox = zones.map((z) => [z.bbox[0] - padLng, z.bbox[1] - padLat, z.bbox[2] + padLng, z.bbox[3] + padLat]);
  const nearZones = (lng, lat) => zones.filter((z, i) => inBbox(lng, lat, zoneBbox[i]));
  let zoneOut = 0;
  const kept = [];
  for (const cand of candidates) {
    const x0 = (cand.c.ix * CELL) / KX + LON0; // 셀 좌하 경도
    const y0 = (cand.c.iy * CELL) / KY + LAT0;
    const dLng = CELL / KX, dLat = CELL / KY;
    const local = nearZones(cand.lng, cand.lat);
    let hit = 0, total = 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const lng = x0 + ((i + 0.5) / 6) * dLng;
        const lat = y0 + ((j + 0.5) / 6) * dLat;
        total++;
        if (local.some((z) => inBbox(lng, lat, z.bbox) && inPolys(lng, lat, z.rings))) hit++;
      }
    }
    const overlap = hit / total;
    if (overlap >= MAX_ZONE_OVERLAP) {
      zoneOut++;
      continue;
    }
    cand.zoneOverlap = overlap;
    cand.local = local;
    kept.push(cand);
  }
  console.error(`정비구역 겹침으로 제외 ${zoneOut.toLocaleString()}칸 → 남은 후보 ${kept.length.toLocaleString()}칸`);

  // ③ 고르기 — 점수 순, 서로 240m 안이면 낮은 쪽 버림, 구당 18곳
  const picked = [];
  const perGu = new Map();
  const grid = new Map(); // 240m 셀 해시
  const sepOf = (lat, lng) => {
    const gx = Math.floor(((lng - LON0) * KX) / MIN_SEP_M);
    const gy = Math.floor(((lat - LAT0) * KY) / MIN_SEP_M);
    return { gx, gy };
  };
  for (const cand of kept) {
    if (picked.length >= TOP_N + PICK_MARGIN) break;
    const { gu } = guOf(gus, cand.lng, cand.lat);
    if ((perGu.get(gu) ?? 0) >= PER_GU_MAX) continue;
    const { gx, gy } = sepOf(cand.lat, cand.lng);
    let clash = false;
    for (let dx = -1; dx <= 1 && !clash; dx++)
      for (let dy = -1; dy <= 1 && !clash; dy++) {
        const list = grid.get(`${gx + dx}:${gy + dy}`);
        if (!list) continue;
        for (const p of list)
          if (Math.hypot((p.lng - cand.lng) * KX, (p.lat - cand.lat) * KY) < MIN_SEP_M) clash = true;
      }
    if (clash) continue;
    const k = `${gx}:${gy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(cand);
    perGu.set(gu, (perGu.get(gu) ?? 0) + 1);
    picked.push({ ...cand, gu });
  }
  console.error(`고른 블록 ${picked.length}곳 (구당 상한 ${PER_GU_MAX})`);

  // ④ 폴리곤 + 요약
  const labelPts = new Map(); // id → 지번을 물어볼 지점(블록 안 오래된 건물 중심, 가까운 순)
  const blocks0 = picked.map((p) => {
    const cell = p.c;
    { // 지번 지점 — 칸 중심에서 가장 가까운 30년↑ 저층 건물 3곳
      const cx = (cell.ix + 0.5) * CELL, cy = (cell.iy + 0.5) * CELL;
      const cand = (cell.oldLowIdx.length ? cell.oldLowIdx : cell.lowIdx)
        .map((i) => {
          const [x, y] = toXY(rows[i][0], rows[i][1]);
          return { i, d: Math.hypot(x - cx, y - cy) };
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map(({ i }) => ({ lat: rows[i][1], lng: rows[i][0] }));
      labelPts.set(`gem-${cell.ix}-${cell.iy}`, cand.length ? cand : [{ lat: p.lat, lng: p.lng }]);
    }
    const c = p.c;
    let ring = clusterPolygon(c.lowIdx, rows, c);
    if (!ring) {
      const pts = c.lowIdx.map((idx) => toXY(rows[idx][0], rows[idx][1]));
      ring = offsetConvex(convexHull(pts), 12);
    }
    ring = simplify([...chaikin(ring, 2), ring[0]], 5);
    while (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    // 닫힌 고리가 3점 미만이면(단순화 과함) 원래 격자 고리를 다시 쓴다
    if (ring.length < 3) {
      const pts = c.lowIdx.map((idx) => toXY(rows[idx][0], rows[idx][1]));
      ring = offsetConvex(convexHull(pts), 12);
    }
    const areaXY = polygonArea(ring);
    const polygon = ring.map(([x, y]) => {
      const [lat, lng] = toLL(x, y);
      return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
    });
    const zNear = p.local
      .map((z) => ({ id: z.id, name: z.name, stage: z.stage, dist: Math.round(distToPolys(p.lng, p.lat, z.rings)) }))
      .filter((z) => z.dist <= 500)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    let st = null;
    for (const s of stations) {
      const d = Math.hypot((s.lng - p.lng) * KX, (s.lat - p.lat) * KY);
      if (!st || d < st.dist) st = { name: s.name, lines: s.lines ?? [], dist: Math.round(d) };
    }
    if (st && st.dist > 700) st = null;
    return {
      id: `gem-${c.ix}-${c.iy}`,
      score: Number(p.score.toFixed(1)),
      grade: "B", // 아래에서 순위 기준으로 다시 매긴다
      gu: p.gu,
      dong: null,
      jibun: null,
      addr: null,
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
      polygon,
      areaM2: Math.round((areaXY < 300 ? CELL * CELL : areaXY)),
      pyeong: Math.round((areaXY < 300 ? CELL * CELL : areaXY) / 3.305785),
      bldCount: c.nLow,
      allCount: c.n,
      old30Pct: Math.round(p.o30 * 100),
      old20Pct: Math.round(p.o20 * 100),
      new10Pct: Math.round(p.n10 * 1000) / 10,
      lowRisePct: Math.round(p.lowShare * 100),
      avgFootprint: Math.round(c.sumLowArea / Math.max(1, c.nLow)),
      zoneOverlapPct: Math.round(p.zoneOverlap * 100),
      zonesNear: zNear,
      station: st,
    };
  });

  // ⑤ 등급 — 점수 순위 (상위 12% S · 상위 40%까지 A · 나머지 B)
  {
    const ranked = [...blocks0].sort((a, b) => b.score - a.score);
    const nS = Math.max(1, Math.round(blocks0.length * 0.12));
    const nA = Math.max(nS + 1, Math.round(blocks0.length * 0.4));
    ranked.forEach((b, i) => {
      b.grade = i < nS ? "S" : i < nA ? "A" : "B";
    });
  }

  // ⑥ 지번·법정동 라벨 — 블록 안 오래된 건물 자리에서 묻고, 안 되면 다음 건물로
  const addressed = [];
  if (!NO_LABEL) {
    const cache = loadLabelCache();
    const targets = blocks0.map((b) => ({ key: b.id, pts: labelPts.get(b.id) ?? [{ lat: b.lat, lng: b.lng }] }));
    await labelAll(targets, cache);
    for (const b of blocks0) {
      const addr = cache[b.id];
      if (!addr) continue;
      const m = /^(\S+시)\s+(\S+구)\s+(\S+)\s+(.+)$/.exec(addr);
      if (m) {
        b.gu = m[2];
        b.dong = m[3];
        b.jibun = m[4];
      }
      b.addr = addr;
      addressed.push(b);
    }
  } else {
    addressed.push(...blocks0);
  }

  // ⑦ 품질 검사 — 서울 밖(경기·인천 경계 타일), 창고만 모인 칸, 너무 작은 경계는 버린다
  const blocks = [];
  {
    const perGu2 = new Map();
    for (const b of addressed) {
      if (blocks.length >= TOP_N) break;
      if (!b.addr?.startsWith("서울특별시 ")) continue; // 경기·인천 경계 타일 건물
      if (b.avgFootprint < MIN_AVG_FOOTPRINT) continue; // 창고·비닐하우스만 모인 칸
      if (b.areaM2 < 4000) continue; // 너무 작은 경계
      if (b.gu && b.addr && !b.addr.startsWith(`서울특별시 ${b.gu} `)) continue; // 라벨과 구가 다른 경계
      const n = perGu2.get(b.gu) ?? 0;
      if (n >= PER_GU_MAX) continue;
      perGu2.set(b.gu, n + 1);
      blocks.push(b);
    }
  }
  console.error(`라벨·품질 검사 통과 ${blocks.length}곳 (후보 ${blocks0.length}곳)`);

  const byGu = {};
  for (const b of blocks) byGu[b.gu] = (byGu[b.gu] ?? 0) + 1;
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    method: {
      source: "브이월드 GIS건물통합정보 + 건축물대장 사용승인일 색인(/api/building-age) + 서울시 고시 정비구역(zones.geojson)",
      gridM: CELL,
      oldYear30: OLD30,
      oldYear20: OLD20,
      newYear10: NEW10,
      lowArea: LOW_AREA,
      minBuildings: MIN_BLD,
      minOld30Pct: MIN_OLD30 * 100,
      maxNew10Pct: MAX_NEW10 * 100,
      maxZoneOverlapPct: MAX_ZONE_OVERLAP * 100,
      minSeparationM: MIN_SEP_M,
      perGuMax: PER_GU_MAX,
      scoreFormula: "0.42×30년↑비율 + 0.18×20년↑비율 + 0.15×저층비율 + 0.13×(1−10년↓비율) + 0.12×규모(60동 만점)",
      note: "정비구역으로 지정되지 않은 노후 저층지 후보를 130m 격자로 훑어 고른 참고 블록입니다. 폴리곤은 저층 건물 위치를 감싼 추정 경계이며 고시된 구역계가 아닙니다.",
    },
    summary: { total: blocks.length, byGu },
    blocks,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.error(
    `저장 ${path.relative(ROOT, OUT)} · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB · ${blocks.length}곳`
  );
  const g = {};
  for (const b of blocks) g[b.grade] = (g[b.grade] ?? 0) + 1;
  console.error(`등급 ${JSON.stringify(g)} · 지번 채움 ${blocks.filter((b) => b.dong).length}/${blocks.length}`);
}

function guOf(gus, lng, lat) {
  for (const g of gus) if (inBbox(lng, lat, g.bbox) && inPolys(lng, lat, [g.rings])) return { gu: g.gu };
  // 경계 밖(하천·경계선) — 가장 가까운 구
  let best = gus[0], bd = Infinity;
  for (const g of gus) {
    const d = distToPolys(lng, lat, [g.rings]);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return { gu: best.gu };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
