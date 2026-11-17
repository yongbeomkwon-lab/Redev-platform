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
  type MolitCoverage,
  type MolitTransaction,
  type MolitTransactionKind,
} from "@/lib/molit";

const BASE = "https://apis.data.go.kr/1613000";
const TTL_MS = 60 * 60 * 1000; // 1시간
const MAX_PAGES = 5; // 한 달·한 유형 최대 5,000건까지
const NUM_OF_ROWS = 1000;
const CONCURRENCY = 6;

type RawItem = Record<string, string>;

type ServiceResult =
  | { ok: true; items: RawItem[]; total: number }
  | { ok: false; code?: string; message: string };

type CacheValue = { at: number; value: ServiceResult };
const cache = new Map<string, CacheValue>();

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
  const res = await fetch(buildUrl(service, lawdCd, ym, page, key), {
    // 국토부 자료는 하루에도 몇 번 갱신된다 — 같은 달을 여러 사용자가 열어도 1시간은 재사용
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(9000),
    headers: { "user-agent": "redev-platform/1.0 (+https://redev-platform-iota.vercel.app)" },
  });
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
    if (err) {
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

  // 오류는 짧게(5분)만 캐시해 일시 장애가 1시간 굳지 않게 한다
  cache.set(ck, { at: result.ok ? Date.now() : Date.now() - TTL_MS + 5 * 60 * 1000, value: result });
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
  } else {
    // 연립·다세대(RHTrade2) — 전용면적(excluUseAr)으로 평당가를 내고, 건물명(mhouseNm)을 이름으로 쓴다.
    // 대지권면적(landAr)은 전용면적이 비어 있을 때만 대체 기준으로 쓴다(대지면적과는 다른 값이라 표시명은 그대로 둔다).
    areaSqm = num(it.excluUseAr);
    if (!areaSqm) plottageSqm = num(it.landAr);
    name = (it.mhouseNm ?? "").trim() || (it.houseType ?? "").trim() || "연립·다세대";
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
