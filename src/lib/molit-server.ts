// ─────────────────────────────────────────────────────────────────────────────
// 국토교통부 실거래가 API 호출·XML 파싱·캐시 (서버 전용)
//
//  · 이 파일은 서버 라우트(src/app/api/transactions/route.ts)에서만 import 한다.
//    MOLIT_API_KEY 를 읽는 곳도 라우트 한 곳뿐이며, 브라우저로는 절대 내보내지 않는다.
//  · 캐시 단위는 **(자치구, 거래월, 유형)** — 법정동과 무관하게 구 전체를 한 번 받아 둔다.
//    그래야 같은 구의 다른 구역을 눌러도 국토부를 다시 부르지 않는다(1시간 TTL).
//    · 메모리 캐시(서버 인스턴스가 살아 있는 동안) + Next fetch 캐시(revalidate 3600초) 이중.
//  · 응답 XML 은 <item> 블록에서 필요한 태그만 꺼내는 작은 파서로 읽는다
//    (xml2js 같은 의존성을 늘리지 않는다 — 태그 구조가 단순하고 고정돼 있다).
// ─────────────────────────────────────────────────────────────────────────────
import {
  MOLIT_SERVICES,
  PYEONG,
  normalizeBuildingName,
  normalizeJibun,
  type MolitCoverage,
  type MolitTransaction,
  type MolitTransactionKind,
} from "@/lib/molit";

const BASE = "https://apis.data.go.kr/1613000";
const TTL_MS = 60 * 60 * 1000; // 1시간
const MAX_PAGES = 5; // 한 달·한 유형 최대 5,000건까지
const NUM_OF_ROWS = 1000;
const CONCURRENCY = 6;
/**
 * 단지·건물 1곳의 5년 조회는 한 유형만 부른다. 동시 호출은 8로 묶는다 —
 *   12로 올렸을 때 국토부가 429(호출 한도)로 막아 몇 달이 비어 보였다. 8도 60개월이면 8바퀴라 빠르다.
 */
const BUILDING_CONCURRENCY = 8;

type RawItem = Record<string, string>;

type ServiceResult =
  | { ok: true; items: RawItem[]; total: number }
  | { ok: false; code?: string; message: string };

type CacheValue = { at: number; value: ServiceResult };
const cache = new Map<string, CacheValue>();
/**
 * 단지·건물 5년(60개월) 조회는 **한 유형만** 부른다 — 3종을 다 부르면 180콜이 되어 타임아웃·호출 한도에 걸린다.
 *   · 달 단위 결과는 위 캐시(lawdCd:ym:kind, 1시간)를 그대로 공유한다 — 같은 구의 다른 단지를
 *     눌러도 국토부를 다시 부르지 않고, 구역 상세를 먼저 열어 둔 경우엔 대부분 캐시 히트다.
 */

function pruneCache() {
  if (cache.size <= 400) return;
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
  // 그래도 넘치면 오래된 것부터
  while (cache.size > 400) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function tagOf(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]).trim() : "";
}

function parseItems(xml: string): RawItem[] {
  const out: RawItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const item: RawItem = {};
    const tagRe = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(block))) item[t[1]] = decodeXml(t[2]).trim();
    out.push(item);
  }
  return out;
}

/** 데이터포털 공통 오류 응답 — 미신청 키(returnReasonCode 30) 등 */
function parseServiceError(xml: string): { code?: string; message: string } | null {
  const code = tagOf(xml, "returnReasonCode") || tagOf(xml, "resultCode");
  const msg = tagOf(xml, "returnAuthMsg") || tagOf(xml, "errMsg") || tagOf(xml, "resultMsg");
  if (!code && !msg) return null;
  if (code === "000" || code === "00" || code === "INFO-0") return null;
  return { code: code || undefined, message: msg || "국토부 API 오류" };
}

function buildUrl(service: string, lawdCd: string, ym: string, page: number, key: string): string {
  const qs = new URLSearchParams({
    serviceKey: key,
    LAWD_CD: lawdCd,
    DEAL_YMD: ym,
    pageNo: String(page),
    numOfRows: String(NUM_OF_ROWS),
  });
  return `${BASE}/${service}/get${service}?${qs.toString()}`;
}

async function fetchPage(
  service: string,
  lawdCd: string,
  ym: string,
  page: number,
  key: string
): Promise<{ xml: string; status: number }> {
  const url = buildUrl(service, lawdCd, ym, page, key);
  // 국토부 자료는 하루에도 몇 번 갱신된다 — 같은 달을 여러 사용자가 열어도 1시간은 재사용
  const init: RequestInit = {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(9000),
    headers: { "user-agent": "redev-platform/1.0 (+https://redev-platform-iota.vercel.app)" },
  };
  let res = await fetch(url, init);
  // 429(호출 한도)는 잠깐 쉬었다 다시 부른다 — 60개월을 병렬로 부를 때 한도에 걸리기 쉽다.
  //   한 번 쉬고 성공하는 경우가 많아, 재시도가 없으면 그 달이 통째로 빈 것처럼 보인다.
  for (const wait of [350, 900]) {
    if (res.status !== 429 && res.status !== 503) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url, init);
  }
  return { xml: await res.text(), status: res.status };
}

/** 한 유형 × 한 달 (구 전체) — 캐시 포함 */
async function fetchServiceMonth(
  kind: MolitTransactionKind,
  lawdCd: string,
  ym: string,
  key: string
): Promise<{ result: ServiceResult; cached: boolean }> {
  const ck = `${lawdCd}:${ym}:${kind}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return { result: hit.value, cached: true };

  const service = MOLIT_SERVICES[kind];
  let result: ServiceResult;
  try {
    const first = await fetchPage(service, lawdCd, ym, 1, key);
    const err = parseServiceError(first.xml);
    // 200 이 아닌 응답(429 호출 한도·5xx)은 **데이터 없음으로 보면 안 된다** —
    //   그 달이 통째로 빈 것처럼 보여 5년 이력이 조용히 끊긴다.
    if (first.status < 200 || first.status >= 300) {
      result = {
        ok: false,
        code: String(first.status),
        message:
          first.status === 429
            ? "국토부 API 호출 한도(429) — 잠시 뒤 다시 시도해 주세요"
            : `국토부 API HTTP ${first.status}`,
      };
    } else if (err) {
      result = { ok: false, code: err.code, message: err.message };
    } else {
      const items = parseItems(first.xml);
      const total = Number(tagOf(first.xml, "totalCount") || items.length) || items.length;
      if (total > items.length && items.length > 0) {
        const pages = Math.min(MAX_PAGES, Math.ceil(total / NUM_OF_ROWS));
        for (let p = 2; p <= pages; p++) {
          const next = await fetchPage(service, lawdCd, ym, p, key);
          items.push(...parseItems(next.xml));
        }
      }
      result = { ok: true, items, total };
    }
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : "네트워크 오류" };
  }

  // 오류는 짧게(5분)만 캐시해 일시 장애가 1시간 굳지 않게 한다.
  //   429(호출 한도)는 아예 캐시하지 않는다 — 화면의 재시도가 바로 다시 물어볼 수 있어야 한다.
  const rateLimited = !result.ok && result.code === "429";
  if (!rateLimited) {
    cache.set(ck, {
      at: result.ok ? Date.now() : Date.now() - TTL_MS + 5 * 60 * 1000,
      value: result,
    });
  }
  pruneCache();
  return { result, cached: false };
}

// ── 레코드 → MolitTransaction ───────────────────────────────────────────────

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function money(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dateOf(it: RawItem): string {
  const y = it.dealYear ?? "";
  const m = (it.dealMonth ?? "").padStart(2, "0");
  const d = (it.dealDay ?? "").padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function jibunOf(it: RawItem): string {
  const b = (it.bonbun ?? "").trim();
  const s = (it.bubun ?? "").trim();
  if (b) {
    const bb = Number(b);
    const ss = Number(s || "0");
    if (Number.isFinite(bb) && ss > 0) return `${bb}-${ss}`;
    return `${bb}`;
  }
  return (it.jibun ?? "").trim();
}

function areaPyeongPrice(price: number, sqm: number | null): number | null {
  if (!price || !sqm || sqm <= 0) return null;
  const pyeong = sqm / PYEONG;
  if (pyeong <= 0) return null;
  return Math.round(price / pyeong);
}

function toTransaction(kind: MolitTransactionKind, it: RawItem): MolitTransaction | null {
  const price = money(it.dealAmount);
  if (!price) return null;
  const umdNm = (it.umdNm ?? "").trim();
  if (!umdNm) return null;

  const dealDate = dateOf(it);
  const canceled = (it.cdealType ?? "").trim().toUpperCase() === "O";
  const cDay = (it.cdealDay ?? "").trim();

  let areaSqm: number | null = null;
  let plottageSqm: number | null = null;
  /** 지분(대지) 평당가 기준 면적 — 단독·다가구 대지면적, 연립·다세대 대지권면적 */
  let landBasisSqm: number | null = null;
  let name = "";
  let pyeongBasis: "전용" | "대지" = "전용";

  if (kind === "아파트") {
    areaSqm = num(it.excluUseAr);
    name = (it.aptNm ?? "").trim() || "아파트";
  } else if (kind === "단독·다가구") {
    plottageSqm = num(it.plottageAr);
    areaSqm = num(it.totalFloorAr);
    name = (it.houseType ?? "").trim() || "단독·다가구";
    pyeongBasis = "대지";
    landBasisSqm = plottageSqm;
  } else {
    // 연립·다세대(RHTrade2) — 전용면적(excluUseAr)으로 전용 평당가를 내고, 건물명(mhouseNm)을 이름으로 쓴다.
    //   대지권면적(landAr)은 전용면적과 별개 값이라 **항상 따로** 읽어 지분(대지) 평당가를 낸다.
    //   (예전엔 전용면적이 비었을 때만 landAr 을 읽어, 지분 정보가 화면에서 사라졌다.)
    areaSqm = num(it.excluUseAr);
    plottageSqm = num(it.landAr);
    name = (it.mhouseNm ?? "").trim() || (it.houseType ?? "").trim() || "연립·다세대";
    landBasisSqm = plottageSqm;
  }

  const baseArea = pyeongBasis === "대지" ? plottageSqm ?? areaSqm : areaSqm;

  return {
    id: `${kind}|${umdNm}|${jibunOf(it)}|${dealDate}|${price}|${areaSqm ?? 0}|${it.floor ?? ""}|${name}`,
    kind,
    name,
    umdNm,
    jibun: jibunOf(it),
    areaSqm,
    plottageSqm,
    floor: num(it.floor),
    buildYear: num(it.buildYear),
    price,
    pyeongPrice: areaPyeongPrice(price, baseArea),
    pyeongBasis,
    landPyeongPrice: areaPyeongPrice(price, landBasisSqm),
    dealDate,
    dealingType: (it.dealingGbn ?? "").trim(),
    canceled,
    canceledDate: canceled ? cDay || null : null,
    scope: "dong",
  };
}

// ── 바깥에서 쓰는 진입점 ────────────────────────────────────────────────────

/** 최근 N개월(YYYYMM) — 이번 달 포함, 오래된 순 */
export function recentMonths(count: number, now = new Date()): string[] {
  const kst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const [y, m] = kst.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * 단지·건물 하나의 최근 N개월 실거래 — 지정한 유형 1종만 조회해 그 단지·건물 거래만 남긴다.
 *   · 같은 법정동에서 (지번 일치) 또는 (아파트 단지명 일치) 인 거래만.
 *     - 아파트: 단지가 여러 지번에 걸칠 수 있어 이름 일치도 같은 단지로 본다.
 *     - 연립·다세대: 건물명이 흔해(‘삼성빌라’ 등) 지번을 알 때는 지번 일치만 인정한다.
 *   · 유형 1종을 이미 알고 있으므로 나머지 2종은 부르지 않는다(3배 빠르다).
 */
export async function loadBuildingTransactions(params: {
  lawdCd: string;
  kind: MolitTransactionKind;
  months: string[];
  key: string;
  dong: string;
  jibun?: string | null;
  name?: string | null;
}): Promise<{
  coverage: MolitCoverage;
  transactions: MolitTransaction[];
  monthsOk: number;
  monthsTotal: number;
  cached: boolean;
}> {
  const { lawdCd, kind, months, key, dong } = params;
  const wantJibun = params.jibun ? normalizeJibun(params.jibun) : "";
  const wantName = params.name ? normalizeBuildingName(params.name) : "";

  const results: { ym: string; res: ServiceResult; cached: boolean }[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < months.length) {
      const ym = months[cursor++];
      const { result, cached } = await fetchServiceMonth(kind, lawdCd, ym, key);
      results.push({ ym, res: result, cached });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BUILDING_CONCURRENCY, months.length) }, worker)
  );

  const failed = results.find((r) => !r.res.ok);
  const coverage: MolitCoverage = failed && !failed.res.ok
    ? {
        kind,
        service: MOLIT_SERVICES[kind],
        ok: false,
        code: failed.res.code,
        message: failed.res.message,
      }
    : { kind, service: MOLIT_SERVICES[kind], ok: true };

  const matches = (tx: MolitTransaction): boolean => {
    if (tx.umdNm !== dong) return false;
    const sameJibun = wantJibun ? normalizeJibun(tx.jibun) === wantJibun : false;
    if (sameJibun) return true;
    if (!wantName) return false;
    if (normalizeBuildingName(tx.name) !== wantName) return false;
    // 아파트는 이름 일치를 인정하고, 연립·다세대는 지번을 모를 때만 이름으로 찾는다
    return kind === "아파트" || !wantJibun;
  };

  const transactions: MolitTransaction[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.res.ok) continue;
    for (const raw of r.res.items) {
      const tx = toTransaction(kind, raw);
      if (!tx || seen.has(tx.id) || !matches(tx)) continue;
      seen.add(tx.id);
      transactions.push({ ...tx, scope: "zone" });
    }
  }
  transactions.sort(
    (a, b) => b.dealDate.localeCompare(a.dealDate) || b.price - a.price
  );

  return {
    coverage,
    transactions,
    monthsOk: results.filter((r) => r.res.ok).length,
    monthsTotal: months.length,
    cached: results.length > 0 && results.every((r) => r.cached),
  };
}

export type GuMonthData = {
  coverage: MolitCoverage[];
  transactions: MolitTransaction[];
  anyOk: boolean;
  cached: boolean;
};

/**
 * 구 하나의 최근 N개월 × 3유형을 모아 법정동과 무관한 전체 거래를 돌려준다.
 * (캐시가 있으면 국토부를 다시 부르지 않는다)
 */
export async function loadGuTransactions(params: {
  lawdCd: string;
  months: string[];
  key: string;
}): Promise<GuMonthData> {
  const { lawdCd, months, key } = params;
  const kinds = Object.keys(MOLIT_SERVICES) as MolitTransactionKind[];
  const jobs: { kind: MolitTransactionKind; ym: string }[] = [];
  for (const kind of kinds) for (const ym of months) jobs.push({ kind, ym });

  const results: { kind: MolitTransactionKind; service: string; res: ServiceResult; cached: boolean }[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const { result, cached } = await fetchServiceMonth(job.kind, lawdCd, job.ym, key);
      results.push({ kind: job.kind, service: MOLIT_SERVICES[job.kind], res: result, cached });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  const coverage: MolitCoverage[] = kinds.map((kind) => {
    const rows = results.filter((r) => r.kind === kind);
    const failed = rows.find((r) => !r.res.ok);
    const first = rows[0];
    if (failed && !failed.res.ok) {
      return {
        kind,
        service: MOLIT_SERVICES[kind],
        ok: false,
        code: failed.res.code,
        message: failed.res.message,
      };
    }
    return { kind, service: first?.service ?? MOLIT_SERVICES[kind], ok: true };
  });

  const transactions: MolitTransaction[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.res.ok) continue;
    for (const raw of r.res.items) {
      const tx = toTransaction(r.kind, raw);
      if (!tx || seen.has(tx.id)) continue;
      seen.add(tx.id);
      transactions.push(tx);
    }
  }

  return {
    coverage,
    transactions,
    anyOk: coverage.some((c) => c.ok),
    cached: results.length > 0 && results.every((r) => r.cached),
  };
}
