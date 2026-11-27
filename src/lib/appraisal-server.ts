// ─────────────────────────────────────────────────────────────────────────────
// 추정 감평 순위 — 브이월드 NED 속성 API 수집(서버 전용)
//
//   국토부 공시가격 3종을 **필지(PNU) 하나씩** 조회해 감평 순위의 원자료를 만든다.
//     ① 공동주택가격  /ned/data/getApartHousingPriceAttr   → 아파트 **호별** 공시가격(pblntfPc)
//     ② 개별주택가격  /ned/data/getIndvdHousingPriceAttr   → 단독·다가구 주택가격(housePc)
//     ③ 개별공시지가  /ned/data/getIndvdLandPriceAttr      → 나대지·상가 토지(공시지가 × 면적)
//
//   · 세 API 모두 `pnu`(+`stdrYear`)로만 조회된다 — 구역(bbox) 단위 일괄 조회가 없어서
//     필지 수만큼 왕복한다. 그래서 **값이 싼 순서로 물어보고 첫 결과에서 멈춘다**:
//        아파트(1회) → 단독·다가구(2회) → 나대지·상가(3회)
//     (호별 공시가격이 있으면 그 필지는 아파트라 주택가격·공시지가를 더 볼 필요가 없다.)
//   · 인증키는 서버 환경변수(VWORLD_API_KEY)로만 읽고 브라우저에 내려보내지 않는다.
//     브이월드는 undici(fetch)의 HTTP/2 스트림을 거절하므로 node:https 로 부른다
//     (building-age-server.ts 의 vworldGetText 재사용 — /api/zone-stats 와 같은 이유).
//   · 필지 단위 결과는 함수 인스턴스 안에서 24시간 캐시한다 — 같은 구역을 다시 열거나
//     구역이 겹칠 때 브이월드를 다시 부르지 않는다(일일 쿼터 보호).
//   · 응답 봉투 이름이 API 마다 달라서(apartHousingPrices / indvdHousingPrices / indvdLandPrices)
//     **`field` 배열을 품은 첫 객체**를 찾아 읽는다. 필드 이름도 방어적으로 여럿을 본다.
// ─────────────────────────────────────────────────────────────────────────────

import { vworldGetText, fetchParcelFeatures, type Bbox } from "./building-age-server";
import { bboxOf, pointInZone, type ZoneShape } from "./zone-geo";
import type { AppraisalItem } from "./appraisal-rank";
import type { ZoneShapeInput } from "./zone-stats";

const NED_BASE = "https://api.vworld.kr/ned/data/";
/** 브이월드 응답 대기 상한(ms) — 라우트가 매달리지 않게 */
const TIMEOUT_MS = 9000;
/** 한 응답에서 받는 행 수 상한(NED 속성 API 최대 1000) */
const PAGE_ROWS = 1000;
/** 공동주택 한 필지에서 넘기는 페이지 상한 — 3,000호까지(그 이상은 truncated) */
const MAX_APART_PAGES = 3;

type NedRow = Record<string, unknown>;

type NedEnv = { key: string; domain: string };

export function nedEnv(): NedEnv | null {
  const key = process.env.VWORLD_API_KEY;
  if (!key) return null;
  return { key, domain: process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app" };
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

/** 응답 어디에 있든 `field` 배열(또는 단일 행)을 찾는다 */
function collectRows(node: unknown, depth = 0): NedRow[] {
  if (depth > 4 || node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.filter((r): r is NedRow => !!r && typeof r === "object") as NedRow[];
  }
  const obj = node as Record<string, unknown>;
  for (const key of ["field", "fields", "items", "row"]) {
    const v = obj[key];
    if (Array.isArray(v)) return v.filter((r): r is NedRow => !!r && typeof r === "object") as NedRow[];
    if (v && typeof v === "object") return [v as NedRow];
  }
  for (const v of Object.values(obj)) {
    const got = collectRows(v, depth + 1);
    if (got.length) return got;
  }
  return [];
}

/** 응답에서 totalCount 를 찾는다(문자열로 오는 경우가 많다) */
function collectTotal(node: unknown, depth = 0): number {
  if (depth > 4 || node == null || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  const direct = num(obj.totalCount ?? obj.totalcount);
  if (direct > 0) return direct;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const got = collectTotal(v, depth + 1);
      if (got > 0) return got;
    }
  }
  return 0;
}

/** 오류 객체(코드·메시지)를 찾는다 — NED 는 {error:{code,message}} · {response:{status:ERROR,…}} 둘 다 쓴다 */
function findError(node: unknown, depth = 0): string | null {
  if (depth > 4 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return null;
  const obj = node as Record<string, unknown>;
  const err = obj.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const code = str(e.code) ?? str(e.errorCode);
    const message = str(e.message) ?? str(e.text) ?? str(e.errorMessage);
    if (code || message) return [code, message].filter(Boolean).join(": ").slice(0, 220);
  }
  const status = str(obj.status);
  if (status && status !== "OK" && (obj.error || obj.message)) {
    return [status, str(obj.message)].filter(Boolean).join(": ").slice(0, 220);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const got = findError(v, depth + 1);
      if (got) return got;
    }
  }
  return null;
}

type NedAnswer = { rows: NedRow[]; total: number } | { error: string; forbidden: boolean };

/**
 * NED 속성 API 응답 본문을 행 목록으로 바꿄다 — 순수 함수(검사용으로 내보낸다).
 *   · 응답 봉투 이름이 API 마다 달라서(`apartHousingPrices` 등) `field` 배열을 품은 첫 객체를 찾는다.
 *   · 오류는 `{error:{code,message}}` · `{response:{status:ERROR,…}}` · XML 세 가지로 온다.
 */
export function parseNedPayload(text: string): NedAnswer {
  if (!text.trimStart().startsWith("{")) {
    // XML·HTML 오류 — 코드만 뽑아 낸다
    const code = /code="?([A-Za-z0-9_]+)"?/.exec(text)?.[1] ?? "VWORLD_ERROR";
    const message = /<message>([\s\S]*?)<\/message>/.exec(text)?.[1]?.trim() ?? text.slice(0, 160);
    const joined = `${code}: ${message}`.slice(0, 220);
    return { error: joined, forbidden: looksForbidden(joined) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "VWORLD_BAD_JSON", forbidden: false };
  }
  const apiError = findError(parsed);
  const rows = collectRows(parsed);
  if (apiError && rows.length === 0) return { error: apiError, forbidden: looksForbidden(apiError) };
  return { rows, total: collectTotal(parsed) };
}

/** 인증키·활용신청 문제로 보이는 오류인지 — 화면에 원인을 정확히 알려 주려고 구분한다 */
function looksForbidden(message: string): boolean {
  return /INCORRECT_KEY|INVALID_KEY|UNAVAILABLE_KEY|FORBIDDEN|NOT_REGISTERED|UNAUTHORIZED|권한|등록되지|인증키/i.test(
    message
  );
}

/** NED 속성 API 한 번 호출 */
async function nedCall(
  service: string,
  env: NedEnv,
  params: Record<string, string | number>
): Promise<NedAnswer> {
  const query = new URLSearchParams({
    key: env.key,
    domain: env.domain,
    format: "json",
    numOfRows: String(params.numOfRows ?? 10),
    pageNo: String(params.pageNo ?? 1),
  });
  for (const [k, v] of Object.entries(params)) {
    if (k === "numOfRows" || k === "pageNo") continue;
    if (v !== "" && v != null) query.set(k, String(v));
  }
  let answer: { status: number; body: string };
  try {
    answer = await vworldGetText(`${NED_BASE}${service}?${query.toString()}`, TIMEOUT_MS, `https://${env.domain}/`);
  } catch (e) {
    return { error: `VWORLD_UNREACHABLE ${String((e as Error)?.message ?? e).slice(0, 160)}`, forbidden: false };
  }
  const text = answer.body ?? "";
  if (answer.status === 404) {
    return { error: `HTTP 404 (${service})`, forbidden: false };
  }
  if (answer.status < 200 || answer.status >= 300) {
    return { error: `HTTP ${answer.status} ${text.slice(0, 160)}`, forbidden: looksForbidden(text) };
  }
  return parseNedPayload(text);
}

/** 공동주택가격 엔드포인트 이름 — 배포판마다 표기가 갈려 한 번만 확인해 둔다 */
const APART_SERVICES = ["getApartHousingPriceAttr", "getApartHousePriceAttr"];
let apartServiceHint: string | null = null;

/* ── 캐시 ──────────────────────────────────────────────────────────────── */
const ITEM_TTL_MS = 24 * 60 * 60 * 1000;
const ITEM_CACHE_MAX = 4000;
const itemCache = new Map<string, { at: number; items: AppraisalItem[] }>();

/** 기준연도 — 공시가격이 아직 없는 해면 한 해씩 내려 확인하고 12시간 기억한다 */
let yearCache: { year: number; at: number } | null = null;
const YEAR_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 구역의 공시가격 기준연도를 정한다 — 공시지가가 나오는 가장 최근 연도.
 *   · 공시지가는 매년 6월 말 고시라 연말이면 올해 값이 있다. 실패하면 작년·재작년으로 내린다.
 */
export async function resolveAppraisalYear(env: NedEnv, probePnus: string[]): Promise<number> {
  if (yearCache && Date.now() - yearCache.at < YEAR_TTL_MS) return yearCache.year;
  const thisYear = new Date().getFullYear();
  const probes = probePnus.filter((p) => /^\d{19}$/.test(p)).slice(0, 3);
  for (let year = thisYear; year >= thisYear - 2; year--) {
    for (const pnu of probes) {
      const answer = await nedCall("getIndvdLandPriceAttr", env, { pnu, stdrYear: year, numOfRows: 1 });
      if (!("error" in answer) && answer.rows.length > 0) {
        yearCache = { year, at: Date.now() };
        return year;
      }
    }
    if (probes.length === 0) break;
  }
  yearCache = { year: thisYear - 1, at: Date.now() };
  return yearCache.year;
}

/** 공동주택 — 아파트 호별 공시가격(여러 페이지면 이어 받는다) */
async function apartItems(
  env: NedEnv,
  pnu: string,
  year: number,
  base: { jibun: string; addr: string | null }
): Promise<{ items: AppraisalItem[]; error: string | null; forbidden: boolean; truncated: boolean; requests: number }> {
  const services = apartServiceHint ? [apartServiceHint, ...APART_SERVICES.filter((s) => s !== apartServiceHint)] : APART_SERVICES;
  let service = services[0];
  let first: NedAnswer | null = null;
  let requests = 0;
  for (const candidate of services) {
    requests++;
    const answer = await nedCall(candidate, env, { pnu, stdrYear: year, numOfRows: PAGE_ROWS, pageNo: 1 });
    if ("error" in answer && /HTTP 404/.test(answer.error)) continue; // 이름이 다른 배포판
    service = candidate;
    first = answer;
    break;
  }
  if (!first) return { items: [], error: null, forbidden: false, truncated: false, requests };
  if ("error" in first) return { items: [], error: first.error, forbidden: first.forbidden, truncated: false, requests };

  apartServiceHint = service;
  const rows: NedRow[] = [...first.rows];
  let truncated = false;
  const total = first.total;
  if (total > rows.length) {
    for (let page = 2; page <= MAX_APART_PAGES && rows.length < total; page++) {
      requests++;
      const next = await nedCall(service, env, { pnu, stdrYear: year, numOfRows: PAGE_ROWS, pageNo: page });
      if ("error" in next) break;
      if (next.rows.length === 0) break;
      rows.push(...next.rows);
    }
    if (rows.length < total) truncated = true;
  }

  const items: AppraisalItem[] = [];
  for (const row of rows) {
    const rowYear = num(row.stdrYear);
    if (rowYear && rowYear !== year) continue;
    const price = num(row.pblntfPc ?? row.pblntfPcHosu ?? row.housePc);
    if (!(price > 0)) continue;
    const dongNm = str(row.dongNm);
    const hoNm = str(row.hoNm);
    const complexNm = str(row.aphusNm);
    const area = num(row.prvuseAr) || num(row.buldCalcTotAr) || null;
    items.push({
      pnu,
      kind: "apart",
      jibun: base.jibun,
      addr: base.addr,
      complexNm,
      dongNm,
      hoNm,
      price,
      year,
      areaSqm: area && area > 0 ? Math.round(area * 100) / 100 : null,
      landPricePerSqm: null,
    });
  }
  return { items, error: null, forbidden: false, truncated, requests };
}

/** 개별주택 — 단독·다가구 주택가격 */
async function houseItems(
  env: NedEnv,
  pnu: string,
  year: number,
  base: { jibun: string; addr: string | null }
): Promise<{ items: AppraisalItem[]; error: string | null; forbidden: boolean; requests: number }> {
  const answer = await nedCall("getIndvdHousingPriceAttr", env, { pnu, stdrYear: year, numOfRows: 10, pageNo: 1 });
  if ("error" in answer) return { items: [], error: answer.error, forbidden: answer.forbidden, requests: 1 };
  const items: AppraisalItem[] = [];
  for (const row of answer.rows) {
    const rowYear = num(row.stdrYear);
    if (rowYear && rowYear !== year) continue;
    const price = num(row.housePc ?? row.pblntfPc);
    if (!(price > 0)) continue;
    const area = num(row.calcPlotAr) || num(row.ladRegstrAr) || null;
    items.push({
      pnu,
      kind: "house",
      jibun: base.jibun,
      addr: base.addr,
      complexNm: null,
      dongNm: null,
      hoNm: null,
      price,
      year,
      areaSqm: area && area > 0 ? Math.round(area * 100) / 100 : null,
      landPricePerSqm: null,
    });
  }
  return { items, error: null, forbidden: false, requests: 1 };
}

/** 토지 — 개별공시지가(원/㎡) × 토지면적(㎡) */
async function landItems(
  env: NedEnv,
  pnu: string,
  year: number,
  base: { jibun: string; addr: string | null; areaSqm: number | null }
): Promise<{ items: AppraisalItem[]; error: string | null; forbidden: boolean; requests: number }> {
  const answer = await nedCall("getIndvdLandPriceAttr", env, { pnu, stdrYear: year, numOfRows: 10, pageNo: 1 });
  if ("error" in answer) return { items: [], error: answer.error, forbidden: answer.forbidden, requests: 1 };
  const items: AppraisalItem[] = [];
  for (const row of answer.rows) {
    const rowYear = num(row.stdrYear);
    if (rowYear && rowYear !== year) continue;
    const perSqm = num(row.pblntfPclnd ?? row.pblntfPc);
    if (!(perSqm > 0)) continue;
    const area = num(row.lndpclAr) || base.areaSqm || 0;
    if (!(area > 0)) continue;
    items.push({
      pnu,
      kind: "land",
      jibun: base.jibun,
      addr: base.addr,
      complexNm: null,
      dongNm: null,
      hoNm: null,
      price: Math.round(perSqm * area),
      year,
      areaSqm: Math.round(area * 100) / 100,
      landPricePerSqm: perSqm,
    });
  }
  return { items, error: null, forbidden: false, requests: 1 };
}

export type ParcelInput = {
  pnu: string;
  jibun: string | null;
  addr: string | null;
  areaSqm: number | null;
};

/**
 * 공공 지목 — 개별 물권이 아니라 감정 대상이 아닌 토지.
 *   · 연속지적도의 `jibun` 속성에는 지목이 붙어 온다(예: '798-12도' = 도로).
 *   · 도로·구거·하천 필지는 면적이 커서 그대로 두면 순위 1·2위를 차지해
 *     “구역에서 제일 비싼 물건”을 도로로 보여 주게 된다 — 목록에서 뺀다.
 */
const PUBLIC_JIMOK = "도구천제유공철방수학광";

/** '798-12도' → { jibun: '798-12', jimok: '도' } */
export function splitJibun(raw: string): { jibun: string; jimok: string | null } {
  const text = raw.trim();
  const m = /^(.*\d)\s*([가-힣])$/.exec(text);
  if (m && PUBLIC_JIMOK.includes(m[2])) return { jibun: m[1].trim(), jimok: m[2] };
  return { jibun: text, jimok: null };
}

/** 같은 필지가 같은 응답에 두 번 오는 경우가 있다(연도·지목 중복 행) — 값이 같으면 하나만 */
function dedupeItems(items: AppraisalItem[]): AppraisalItem[] {
  const seen = new Set<string>();
  const out: AppraisalItem[] = [];
  for (const it of items) {
    const key = [it.pnu, it.kind, it.dongNm ?? "", it.hoNm ?? "", it.price, it.year].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export type ParcelAppraisal = {
  pnu: string;
  items: AppraisalItem[];
  /** 조회는 됐지만 공시가격이 없는 필지(도로·제방·미등록 등) */
  missing: boolean;
  error: string | null;
  forbidden: boolean;
  requests: number;
  truncated: boolean;
};

/**
 * 필지 하나의 공시가격 항목을 모은다 — 아파트(호별) → 단독·다가구 → 토지 순으로,
 * 앞 단계에서 값이 나오면 거기서 멈춘다(쿼터 보호).
 */
export async function fetchParcelAppraisal(
  parcel: ParcelInput,
  env: NedEnv,
  year: number
): Promise<ParcelAppraisal> {
  const cacheKey = `${parcel.pnu}|${year}`;
  const cached = itemCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ITEM_TTL_MS) {
    return {
      pnu: parcel.pnu,
      items: cached.items,
      missing: cached.items.length === 0,
      error: null,
      forbidden: false,
      requests: 0,
      truncated: false,
    };
  }
  const jibun = parcel.jibun ?? parcel.pnu.slice(-8).replace(/^0+(?=\d)/, "");
  const base = { jibun, addr: parcel.addr };

  let requests = 0;
  const apart = await apartItems(env, parcel.pnu, year, base);
  requests += apart.requests;
  if (apart.error) {
    return {
      pnu: parcel.pnu,
      items: [],
      missing: false,
      error: apart.error,
      forbidden: apart.forbidden,
      requests,
      truncated: false,
    };
  }
  if (apart.items.length > 0) {
    const items = dedupeItems(apart.items);
    store(cacheKey, items);
    return {
      pnu: parcel.pnu,
      items,
      missing: false,
      error: null,
      forbidden: false,
      requests,
      truncated: apart.truncated,
    };
  }

  const house = await houseItems(env, parcel.pnu, year, base);
  requests += house.requests;
  if (house.error) {
    return {
      pnu: parcel.pnu,
      items: [],
      missing: false,
      error: house.error,
      forbidden: house.forbidden,
      requests,
      truncated: false,
    };
  }
  if (house.items.length > 0) {
    const items = dedupeItems(house.items);
    store(cacheKey, items);
    return {
      pnu: parcel.pnu,
      items,
      missing: false,
      error: null,
      forbidden: false,
      requests,
      truncated: false,
    };
  }

  const land = await landItems(env, parcel.pnu, year, { ...base, areaSqm: parcel.areaSqm });
  requests += land.requests;
  if (land.error) {
    return {
      pnu: parcel.pnu,
      items: [],
      missing: false,
      error: land.error,
      forbidden: land.forbidden,
      requests,
      truncated: false,
    };
  }
  const landRowItems = dedupeItems(land.items);
  if (landRowItems.length > 0) store(cacheKey, landRowItems);
  return {
    pnu: parcel.pnu,
    items: landRowItems,
    missing: landRowItems.length === 0,
    error: null,
    forbidden: false,
    requests,
    truncated: false,
  };
}

function store(key: string, items: AppraisalItem[]) {
  if (itemCache.size >= ITEM_CACHE_MAX) itemCache.clear();
  itemCache.set(key, { at: Date.now(), items });
}

/* ── 구역 필지 목록(계획) ────────────────────────────────────────────────── */

export type PlanParcel = {
  pnu: string;
  /** 지번 (예: 467-19) */
  jibun: string;
  /** 지번 주소 (예: 서울특별시 서초구 방배동 467-19) */
  addr: string | null;
  /** 화면에 쓰는 짧은 이름 (예: 방배동 467-19) */
  label: string;
  /** 연속지적도 필지면적(㎡) */
  areaSqm: number | null;
};

export type PlanResult = {
  parcels: PlanParcel[];
  requests: number;
  truncated: boolean;
  /** 공공 지목(도로·구거·하천 등)이라 순위에서 뺀 필지 수 */
  excluded: number;
};

/** 링([lng,lat,…] 평면 배열)의 면적(㎡) — zone-stats 와 같은 근사식 */
function flatRingArea(flat: number[]): number {
  if (!Array.isArray(flat) || flat.length < 6) return 0;
  let latSum = 0;
  let n = 0;
  for (let i = 1; i < flat.length; i += 2) {
    latSum += flat[i];
    n++;
  }
  const lat0 = n > 0 ? latSum / n : 37.5;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  let a = 0;
  const pts = Math.floor(flat.length / 2);
  for (let i = 0, j = pts - 1; i < pts; j = i++) {
    const xi = flat[i * 2] * kx;
    const yi = flat[i * 2 + 1] * ky;
    const xj = flat[j * 2] * kx;
    const yj = flat[j * 2 + 1] * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a / 2);
}

function outerFlatRings(geometry: { type?: string; coordinates?: unknown } | null | undefined): number[][] {
  if (!geometry?.coordinates) return [];
  const c = geometry.coordinates as unknown;
  const polygons: unknown[] = geometry.type === "Polygon" ? [c] : geometry.type === "MultiPolygon" ? (c as unknown[]) : [];
  const out: number[][] = [];
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    const ring = poly[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const flat: number[] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      flat.push(lng, lat);
    }
    if (flat.length >= 6) out.push(flat);
  }
  return out;
}

/** PNU → 지번 문자열 (본번 4자리 + 부번 4자리) */
function jibunOf(pnu: string): string {
  if (!/^\d{19}$/.test(pnu)) return pnu;
  const bonbun = Number(pnu.slice(11, 15));
  const bubun = Number(pnu.slice(15, 19));
  return bubun > 0 ? `${bonbun}-${bubun}` : String(bonbun);
}

/**
 * 구역 폴리곤 안의 필지 목록 — 19자리 PNU·지번·면적.
 *   · 연속지적도(LP_PA_CBND_BUBUN)를 bbox 로 받아 **중심점이 폴리곤 안**인 필지만 남긴다.
 *   · 주소(addr)에서 '서울특별시 ' 를 떼어 화면용 짧은 이름을 만든다.
 */
export async function planZoneParcels(shape: ZoneShapeInput): Promise<PlanResult | { error: string; detail?: string }> {
  const bb = bboxOf(shape as ZoneShape);
  if (!bb) return { error: "BAD_SHAPE", detail: "경계 상자를 계산할 수 없습니다." };
  const bbox: Bbox = { minLng: bb.minLng, minLat: bb.minLat, maxLng: bb.maxLng, maxLat: bb.maxLat };
  let fetched: { features: unknown[]; requests: number; truncated: boolean };
  try {
    fetched = await fetchParcelFeatures(bbox);
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    if (message.includes("VWORLD_API_KEY_NOT_SET")) return { error: "VWORLD_API_KEY_NOT_SET", detail: message };
    return { error: "VWORLD_UNREACHABLE", detail: message.slice(0, 300) };
  }

  const seen = new Set<string>();
  const parcels: PlanParcel[] = [];
  let excluded = 0;
  for (const raw of fetched.features) {
    const f = raw as { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null };
    const props = f.properties ?? {};
    const pnu = typeof props.pnu === "string" ? props.pnu : "";
    if (!/^\d{19}$/.test(pnu)) continue;
    if (seen.has(pnu)) continue;
    const ring = outerFlatRings(f.geometry)[0];
    if (!ring) continue;
    let lng = 0;
    let lat = 0;
    let count = 0;
    for (let i = 0; i + 1 < ring.length; i += 2) {
      lng += ring[i];
      lat += ring[i + 1];
      count++;
    }
    if (count === 0) continue;
    const center: [number, number] = [lat / count, lng / count];
    if (!pointInZone(shape as ZoneShape, center[0], center[1])) continue;
    seen.add(pnu);
    const bonbun = String(props.bonbun ?? "").trim();
    const bubun = String(props.bubun ?? "").trim();
    const rawJibun = String(props.jibun ?? "").trim();
    const base = bonbun
      ? bubun && bubun !== "0"
        ? `${bonbun}-${bubun}`
        : bonbun
      : rawJibun || jibunOf(pnu);
    // 연속지적도 jibun 속성에 붙은 지목(도로·구거 등)은 떼고, 공공 지목 필지는 순위에서 뺀다
    const { jibun, jimok } = splitJibun(base);
    if (jimok) {
      excluded++;
      continue;
    }
    const addr = String(props.addr ?? "").trim() || null;
    const label = (addr ?? jibun).replace(/^서울특별시\s+/, "").replace(/^서울\s+/, "") || jibun;
    const area = flatRingArea(ring);
    parcels.push({
      pnu,
      jibun,
      addr,
      label,
      areaSqm: area > 0 ? Math.round(area * 10) / 10 : null,
    });
  }
  parcels.sort((a, b) => a.jibun.localeCompare(b.jibun, "ko", { numeric: true }));
  return { parcels, requests: fetched.requests, truncated: fetched.truncated, excluded };
}
