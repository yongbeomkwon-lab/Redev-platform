/**
 * 건축물대장 사용승인일 색인 — **서버 전용**(node:fs 를 쓴다. 클라이언트에서 import 금지)
 *
 * 왜 있나
 *   브이월드 `dt_d010`(GIS건물통합정보)이 주는 `use_confm_de`(사용승인일)는 지역에 따라
 *   세움터 속성 조인이 오래돼 있다 — 2026-11-20 실측으로 신림동은 2003년, 흑석동은 2019년
 *   이후에 지은 건물의 연도가 비어 있었다. 그래서 `scripts/build-age-index.mjs` 가
 *   **건축물대장 표제부 원본**에서 받아 둔 법정동별 색인(`public/data/age-index/*.json`)을
 *   PNU 로 이어 붙여 연도를 덮어쓴다.
 *
 * 색인 모양 (법정동 1개 = 파일 1개, 20~350KB)
 *   { cd: "1162010200", rows: [[tail, year, totArea], …] }
 *   tail = PNU 끝 9자리(대지구분1+본번4+부번4) — 앞 10자리는 파일명(법정동코드)과 같아 뺐다.
 *
 * 읽는 법
 *   · 타일 요청마다 필요한 법정동 파일만 읽고 모듈 캐시에 담아 둔다(함수 인스턴스가 살아 있는 동안).
 *   · 파일이 없으면(아직 색인을 만들지 않은 동) 그냥 null — 브이월드 값 그대로 쓴다.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

type IndexRow = { year: number; area: number };
/** 법정동코드 → (PNU 끝 9자리 → 대장 행들) */
type DongIndex = Map<number, IndexRow[]>;

const cache = new Map<string, DongIndex | null>();
/** 캐시 상한 — 한 함수 인스턴스가 오래 살아도 메모리가 계속 늘지 않게 */
const CACHE_MAX = 60;

function fileOf(cd: string): string {
  return path.join(process.cwd(), "public", "data", "age-index", `${cd}.json`);
}

async function loadDong(cd: string): Promise<DongIndex | null> {
  if (!/^\d{10}$/.test(cd)) return null;
  if (cache.has(cd)) return cache.get(cd) ?? null;
  let index: DongIndex | null = null;
  try {
    const raw = await readFile(fileOf(cd), "utf8");
    const parsed = JSON.parse(raw) as { rows?: [number, number, number][] };
    const map: DongIndex = new Map();
    for (const row of parsed.rows ?? []) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const tail = Number(row[0]);
      const year = Number(row[1]);
      const area = Number(row[2] ?? 0) || 0;
      if (!Number.isFinite(tail) || !(year > 1800 && year <= 2100)) continue;
      const list = map.get(tail);
      if (list) list.push({ year, area });
      else map.set(tail, [{ year, area }]);
    }
    index = map.size ? map : null;
  } catch {
    index = null; // 파일 없음·깨짐 → 보강 없이 진행
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(cd, index);
  return index;
}

/**
 * 한 필지에 대장 행이 여럿일 때(집합건물·부속건축물) 브이월드 연면적과 가장 가까운 행을 고른다.
 *   · 연면적이 없으면 가장 최근 연도(신축이 먼저 보이게)
 *   · 브이월드 연면적과 2배 넘게 차이 나는 행만 있으면 원래 값(덮어쓰지 않음)을 지킨다
 */
function pickYear(rows: IndexRow[], area: number, base: number | null): number | null {
  if (rows.length === 0) return base;
  if (rows.length === 1) return rows[0].year;
  if (area > 0) {
    let best = rows[0];
    let bestDiff = Math.abs(rows[0].area - area);
    for (const row of rows) {
      const diff = Math.abs(row.area - area);
      if (diff < bestDiff) {
        best = row;
        bestDiff = diff;
      }
    }
    const ratio = best.area > 0 ? Math.max(best.area / area, area / best.area) : Infinity;
    if (base != null && ratio > 2) return base;
    return best.year;
  }
  return rows.reduce((a, b) => (b.year > a.year ? b : a)).year;
}

export type YearResolver = (pnu: unknown, area: unknown, base: number | null) => number | null;

/**
 * WFS 피처들에서 법정동을 모아 색인을 읽고, 건물별 연도를 돌려주는 함수를 만든다.
 * 색인이 없는 동은 `base`(브이월드 값)를 그대로 돌려준다.
 */
export async function yearResolverFor(features: unknown): Promise<YearResolver> {
  const codes = new Set<string>();
  if (Array.isArray(features)) {
    for (const raw of features) {
      const props = (raw as { properties?: Record<string, unknown> | null })?.properties ?? {};
      const pnu = typeof props.pnu === "string" ? props.pnu.trim() : "";
      if (pnu.length >= 10) codes.add(pnu.slice(0, 10));
    }
  }
  if (codes.size === 0) return (_pnu, _area, base) => base;

  const indexes = new Map<string, DongIndex | null>();
  await Promise.all(
    [...codes].slice(0, 12).map(async (cd) => {
      indexes.set(cd, await loadDong(cd));
    })
  );

  return (pnu, area, base) => {
    if (typeof pnu !== "string") return base;
    const key = pnu.trim();
    if (key.length < 19) return base;
    const index = indexes.get(key.slice(0, 10));
    if (!index) return base;
    const tail = Number(key.slice(10));
    if (!Number.isFinite(tail)) return base;
    const rows = index.get(tail);
    if (!rows || rows.length === 0) return base;
    const a = typeof area === "number" && Number.isFinite(area) ? area : Number(area) || 0;
    return pickYear(rows, a, base);
  };
}
