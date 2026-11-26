import { NextResponse } from "next/server";
import {
  classifyStructure,
  householdsFromText,
  isResidential,
  summarizePreciseBuildings,
  yearFromUseAprDay,
  type LedgerBuilding,
  type LedgerFloor,
  type PreciseChunkStats,
} from "@/lib/zone-ledger";

/**
 * 구역현황 **정밀 분석** — POST /api/zone-stats/precise
 *
 *   body: { pnus: string[], unknownPnus?: string[], parcelAreas?: { [pnu]: ㎡ } }
 *
 * · 19자리 PNU 목록(구역 안 필지, 클라이언트가 40~60개씩 나눈다)을 받아
 *   국토교통부 건축HUB 건축물대장 표제부(`BldRgstHubService/getBrTitleInfo`)를 필지별로 조회하고
 *   주구조·사용승인일·세대/가구수를 한 청크 몫으로 접어 돌려준다.
 * · 세대·가구가 2 이상이거나 공동·다가구 용도인 필지는 **층별개요**(`getBrFlrOulnInfo`)를
 *   한 번 더 조회해 층별 세대(가구)수를 확인한다 — 조례 호수밀도(제2조제5호)는
 *   '세대수가 가장 많은 1개 층'을 1동으로 보므로 층 정보가 있어야 과대계상을 피한다.
 *   모든 필지에 호출하지 않아 국토부 일일 호출량과 응답 시간을 아낀다(약 1/2).
 * · 청크로 나누는 이유: 대구역(1,400필지)도 Vercel 함수 시간(60초) 안에 끝내고,
 *   화면이 `분석 중 45% (120/265필지)` 처럼 진행률을 보여 주기 위해서다.
 * · 키(MOLIT_API_KEY)는 이 파일에서만 읽고 응답에 절대 담지 않는다.
 * · 필지 하나가 실패해도 나머지를 계속 모은다 — 전부 실패했을 때만 오류로 돌려준다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
/** 층별개요 — 표제부에서 복수 세대·가구이거나 공동·다가구로 확인된 필지에만 추가 조회 */
const BASE_FLR = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrFlrOulnInfo";
/** 한 요청에 받는 필지 수 상한 — 60개(클라이언트 청크와 같은 값, 방어용) */
const MAX_PNUS = 60;
/** 대장 호출 동시성 — 국토부는 초당 요청 수 제한(약 10/s)이 있어 8~12로 올리면 429로 막힌다 */
const CONCURRENCY = 6;
/** 요청 사이 최소 간격(ms) — 140ms ≈ 초당 7건. 이 이상 붙이면 '초당 요청제한 초과(429)'가 난다 */
const MIN_GAP_MS = 140;
const TIMEOUT_MS = 9000;
const ROWS_PER_PAGE = 100;
const MAX_PAGES = 3;

type RawItem = Record<string, unknown>;
type ParcelResult = { ok: true; items: RawItem[] } | { ok: false; code: string; message: string };

type CacheValue = { at: number; items: RawItem[] };
const cache = new Map<string, CacheValue>();
/** 층별개요 캐시 — 같은 필지를 ↻ 다시 눌러도 국토부를 또 부르지 않는다 */
const flrCache = new Map<string, CacheValue>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 6000;

/** 함수 인스턴스 안에서 국토부 요청 간격을 조절하는 아주 작은 레이트 리미터 */
let nextSlot = 0;
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
async function acquireSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

function fail(error: string, status: number, detail?: string) {
  return NextResponse.json(
    detail ? { ok: false, error, detail } : { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function str(item: RawItem, key: string): string {
  const v = item[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function num(item: RawItem, key: string): number {
  const v = item[key];
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** PNU 19자리 → 대장 조회 파라미터. 11번째 자리 1=대지, 2=산 → platGbCd 0/1 */
function pnuToLedgerParams(pnu: string): { sigunguCd: string; bjdongCd: string; platGbCd: string; bun: string; ji: string } | null {
  if (!/^\d{19}$/.test(pnu)) return null;
  return {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0",
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
  };
}

/** 데이터포털 오류 응답(XML·JSON 모두)에서 코드·메시지 뽑기 */
function parseErrorText(text: string): { code: string; message: string } | null {
  const code =
    /"resultCode"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<resultCode>([^<]+)<\/resultCode>/.exec(text)?.[1] ??
    /<returnReasonCode>([^<]+)<\/returnReasonCode>/.exec(text)?.[1] ??
    "";
  const message =
    /"resultMsg"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<resultMsg>([^<]+)<\/resultMsg>/.exec(text)?.[1] ??
    /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(text)?.[1] ??
    /<errMsg>([^<]+)<\/errMsg>/.exec(text)?.[1] ??
    "";
  if (!code && !message) return null;
  if (code === "00" || code === "000") return null;
  return { code: code || "ERROR", message: message || "국토부 API 오류" };
}

/** 사람이 읽을 오류 문구 — 화면에 그대로 보여 준다 */
function friendly(code: string, message: string): string {
  const c = code.trim();
  const m = `${c} ${message}`;
  if (c === "429" || /LIMITED|한도|quota/i.test(m)) {
    return "국토교통부 API 호출 한도에 걸렸습니다 — 잠시 뒤(또는 내일) 다시 시도해 주세요.";
  }
  if (["30", "22", "31", "32"].includes(c) || /UNREGISTERED|NOT_REGISTERED|SERVICE_KEY/i.test(m)) {
    return "건축물대장 서비스 키가 승인되지 않았거나 인증에 실패했습니다(데이터포털 활용신청 승인 여부 확인).";
  }
  return `건축물대장 조회에 실패했습니다 (${c || "UNKNOWN"}).`;
}

async function fetchPage(base: string, pnu: string, key: string, page: number): Promise<{ status: number; text: string }> {
  const p = pnuToLedgerParams(pnu);
  if (!p) throw new Error("BAD_PNU");
  const qs = new URLSearchParams({
    serviceKey: key,
    sigunguCd: p.sigunguCd,
    bjdongCd: p.bjdongCd,
    platGbCd: p.platGbCd,
    bun: p.bun,
    ji: p.ji,
    numOfRows: String(ROWS_PER_PAGE),
    pageNo: String(page),
    _type: "json",
  });
  const url = `${base}?${qs.toString()}`;
  let res: Response | null = null;
  // 429(초당·일일 한도)·5xx 는 잠깐 쉬었다 다시 — 바로 성공하는 경우가 많다.
  //   그래도 안 되면 마지막 응답을 그대로 돌려주고, 라우트가 '조회 실패'로 센다.
  for (const wait of [0, 900, 1800, 3200]) {
    if (wait) await sleep(wait + Math.floor(Math.random() * 250));
    await acquireSlot();
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "redev-platform/1.0 (+https://redev-platform-iota.vercel.app)" },
    });
    if (res.status !== 429 && res.status < 500) break;
  }
  const text = await (res as Response).text();
  return { status: (res as Response).status, text };
}

function itemsOf(text: string): RawItem[] {
  if (!text.trimStart().startsWith("{")) return [];
  try {
    const parsed = JSON.parse(text) as {
      response?: { body?: { items?: { item?: RawItem | RawItem[] } | "" ; totalCount?: string | number } };
    };
    const body = parsed.response?.body;
    if (!body || !body.items) return [];
    const item = typeof body.items === "object" ? body.items.item : undefined;
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  } catch {
    return [];
  }
}

function totalOf(text: string): number {
  if (!text.trimStart().startsWith("{")) return 0;
  try {
    const parsed = JSON.parse(text) as { response?: { body?: { totalCount?: string | number } } };
    const n = Number(parsed.response?.body?.totalCount ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function fetchParcel(pnu: string, key: string): Promise<ParcelResult> {
  const hit = cache.get(pnu);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, items: hit.items };

  try {
    const first = await fetchPage(BASE, pnu, key, 1);
    if (first.status < 200 || first.status >= 300) {
      return { ok: false, code: String(first.status), message: `HTTP ${first.status}` };
    }
    const err = parseErrorText(first.text);
    if (err) return { ok: false, code: err.code, message: err.message };

    const items = itemsOf(first.text);
    const total = totalOf(first.text);
    if (total > items.length && items.length > 0) {
      const pages = Math.min(MAX_PAGES, Math.ceil(total / ROWS_PER_PAGE));
      for (let page = 2; page <= pages; page++) {
        const next = await fetchPage(BASE, pnu, key, page);
        if (next.status < 200 || next.status >= 300) break;
        items.push(...itemsOf(next.text));
      }
    }

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(pnu, { at: Date.now(), items });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 층별개요 조회 — 복수 세대·가구이거나 공동·다가구 용도인 필지만 부른다.
 *   실패해도 치명적이지 않다: 층 정보가 없으면 주거용 층수로 추정한다.
 */
async function fetchFloors(pnu: string, key: string): Promise<ParcelResult> {
  const hit = flrCache.get(pnu);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, items: hit.items };

  try {
    const first = await fetchPage(BASE_FLR, pnu, key, 1);
    if (first.status < 200 || first.status >= 300) {
      return { ok: false, code: String(first.status), message: `HTTP ${first.status}` };
    }
    const err = parseErrorText(first.text);
    if (err) return { ok: false, code: err.code, message: err.message };

    const items = itemsOf(first.text);
    const total = totalOf(first.text);
    if (total > items.length && items.length > 0) {
      const pages = Math.min(MAX_PAGES, Math.ceil(total / ROWS_PER_PAGE));
      for (let page = 2; page <= pages; page++) {
        const next = await fetchPage(BASE_FLR, pnu, key, page);
        if (next.status < 200 || next.status >= 300) break;
        items.push(...itemsOf(next.text));
      }
    }

    if (flrCache.size >= CACHE_MAX) flrCache.clear();
    flrCache.set(pnu, { at: Date.now(), items });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 이 필지에 층별개요를 물어볼 만한 동이 있는지 — 복수 세대·가구 또는 공동·다가구 용도 */
function needsFloors(items: RawItem[]): boolean {
  for (const item of items) {
    if (/부속/.test(str(item, "mainAtchGbCdNm"))) continue;
    const hhld = num(item, "hhldCnt");
    const fmly = num(item, "fmlyCnt");
    if (hhld + fmly >= 2) return true;
    const purps = `${str(item, "mainPurpsCdNm")} ${str(item, "etcPurps")}`;
    if (/공동주택|다가구|다세대|연립|기숙사/.test(purps)) return true;
  }
  return false;
}

/** 층별개요 한 행 → LedgerFloor */
function toFloor(item: RawItem): LedgerFloor {
  const use = str(item, "mainPurpsCdNm");
  const etc = str(item, "etcPurps");
  return {
    pk: str(item, "mgmBldrgstPk"),
    flrNo: num(item, "flrNo"),
    gb: str(item, "flrGbCdNm"),
    use,
    etc,
    area: num(item, "area"),
    residential: isResidential(str(item, "mainPurpsCd"), use, etc),
    households: householdsFromText(`${etc} ${use}`),
  };
}

function toBuilding(pnu: string, item: RawItem, floors: LedgerFloor[]): LedgerBuilding {
  const strctCdNm = str(item, "strctCdNm");
  const etcStrct = str(item, "etcStrct");
  const mainPurpsCd = str(item, "mainPurpsCd");
  const mainPurpsCdNm = str(item, "mainPurpsCdNm");
  const etcPurps = str(item, "etcPurps");
  const residential = isResidential(mainPurpsCd, mainPurpsCdNm, etcPurps);
  const hhld = num(item, "hhldCnt");
  const fmly = num(item, "fmlyCnt");
  let units = Math.max(hhld, fmly);
  let minAdjusted = false;
  if (units <= 0 && residential) {
    units = 1;
    minAdjusted = true;
  }
  const attached = /부속/.test(str(item, "mainAtchGbCdNm"));
  const useAprDay = str(item, "useAprDay");
  return {
    pnu,
    pk: str(item, "mgmBldrgstPk"),
    structure: strctCdNm === "기타구조" && etcStrct ? etcStrct : strctCdNm || etcStrct,
    group: classifyStructure(strctCdNm, etcStrct),
    mainPurps: mainPurpsCdNm || etcPurps,
    residential,
    year: yearFromUseAprDay(useAprDay),
    useAprDay,
    units,
    minAdjusted,
    attached,
    floorArea: num(item, "totArea"),
    archArea: num(item, "archArea"),
    groundFloors: num(item, "grndFlrCnt"),
    floors,
    platArea: num(item, "platArea"),
  };
}

export async function POST(request: Request) {
  let body: { pnus?: unknown; unknownPnus?: unknown; parcelAreas?: unknown } | null = null;
  try {
    body = (await request.json()) as { pnus?: unknown; unknownPnus?: unknown; parcelAreas?: unknown };
  } catch {
    return fail("BAD_JSON", 400, "pnus 목록을 담은 JSON 본문이 필요합니다.");
  }

  const rawPnus = Array.isArray(body?.pnus) ? body.pnus : [];
  const pnus = [...new Set(rawPnus.filter((v): v is string => typeof v === "string" && /^\d{19}$/.test(v)))];
  if (pnus.length === 0) return fail("NO_PNU", 400, "조회할 필지(PNU 19자리)가 없습니다.");
  if (pnus.length > MAX_PNUS) return fail("TOO_MANY_PNU", 413, `한 번에 최대 ${MAX_PNUS}필지까지 조회할 수 있습니다.`);
  const unknownPnus = Array.isArray(body?.unknownPnus)
    ? body.unknownPnus.filter((v): v is string => typeof v === "string")
    : [];

  // 연속지적도 필지면적(PNU → ㎡) — 대장 platArea 가 0·빈 값인 필지를 보완한다.
  //   외부 입력이므로 숫자·양수만 추리고, 이번 조회 필지로 한정한다.
  const parcelAreas: Record<string, number> = {};
  if (body?.parcelAreas && typeof body.parcelAreas === "object" && !Array.isArray(body.parcelAreas)) {
    const limit = new Set(pnus);
    for (const [pnu, value] of Object.entries(body.parcelAreas as Record<string, unknown>)) {
      if (!limit.has(pnu)) continue;
      const area = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(area) && area > 0 && area < 1_000_000) parcelAreas[pnu] = area;
    }
  }

  const key = (process.env.MOLIT_API_KEY ?? "").trim();
  if (!key) {
    return fail(
      "MOLIT_KEY_NOT_SET",
      503,
      "서버에 국토교통부 API 키(MOLIT_API_KEY)가 없어 정밀 분석을 할 수 없습니다. Vercel 환경변수에 추가하면 바로 동작합니다."
    );
  }

  const buildings: LedgerBuilding[] = [];
  let ledgerParcels = 0;
  let errors = 0;
  let floorParcels = 0;
  let floorErrors = 0;
  const failures: { code: string; message: string }[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < pnus.length) {
      const pnu = pnus[cursor++];
      const res = await fetchParcel(pnu, key);
      if (!res.ok) {
        errors++;
        failures.push({ code: res.code, message: res.message });
        continue;
      }
      if (res.items.length > 0) ledgerParcels++;

      // 표제부에서 복수 세대·가구 또는 공동·다가구로 확인된 필지만 층별개요를 더 부른다
      let floorItems: RawItem[] = [];
      if (needsFloors(res.items)) {
        const flr = await fetchFloors(pnu, key);
        if (flr.ok) {
          floorItems = flr.items;
          floorParcels++;
        } else {
          // 층별개요 실패는 필지 실패로 세지 않는다 — 층수로 추정하고 계속한다
          floorErrors++;
        }
      }

      const floors = floorItems.map(toFloor);
      for (const item of res.items) {
        const pk = str(item, "mgmBldrgstPk");
        const own = pk ? floors.filter((f) => f.pk === pk) : [];
        buildings.push(toBuilding(pnu, item, own));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pnus.length) }, worker));

  // 전부 실패면 화면이 이유를 보여 줄 수 있게 오류로 돌려준다
  if (ledgerParcels === 0 && errors === pnus.length) {
    const first = failures[0] ?? { code: "UNKNOWN", message: "" };
    const status = first.code === "429" ? 429 : first.code === "NETWORK" ? 502 : 502;
    return fail("MOLIT_UPSTREAM_FAILED", status, friendly(first.code, first.message));
  }

  const chunk: PreciseChunkStats = summarizePreciseBuildings({
    buildings,
    parcels: pnus.length,
    ledgerParcels,
    errors,
    floorParcels,
    floorErrors,
    unknownPnus,
    parcelAreas,
  });

  return NextResponse.json(
    {
      ok: true,
      chunk,
      meta: {
        asOf: new Date().toISOString().slice(0, 10),
        requested: pnus.length,
        cached: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
