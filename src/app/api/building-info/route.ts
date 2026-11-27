import { NextResponse } from "next/server";
import { dongLabel, formatAprDay, type LedgerBuildingBrief, type LedgerUnit } from "@/lib/building-info";

/**
 * 건축물대장 표제부 **한 필지** 조회 — 매물 등록 화면의 자동 채움용
 *
 *   GET /api/building-info?pnu=1168010100102090000
 *   GET /api/building-info?pnu=...&fresh=1        (캐시 무시)
 *
 * · `/register` 에서 주소를 고르면, 그 필지의 표제부를 한 번 불러
 *   **사용승인일·총층수·주용도·대지면적·건물명·세대(가구)수·주차·승강기·위반건축물**을 폼에 채운다.
 *   (값을 지어내지 않는다 — 대장에 있는 값만 그대로 넘긴다.)
 * · 같은 필지의 **전유부**(`getBrExposPubuseAreaInfo`)를 함께 읽어 동·호수 목록(`units`)을 만든다 —
 *   호를 고르면 전용면적·공급면적(전유+공용)·해당층·동·호가 폼에 채워진다.
 *   · 전유부 행은 호마다 '전유'와 '공용'이 따로 오므로 동·호로 묶어 합산한다.
 *   · 대단지(은마아파트는 전유부 24,000여 행)는 100행씩만 내려오므로 페이지를 병렬로 읽되
 *     행 수(2,000)와 시간(9초)에 상한을 둔다 — 넘치면 `unitsTruncated` 로 알린다.
 * · 국토교통부 건축HUB `BldRgstHubService/getBrTitleInfo` 를 쓴다.
 *   `zone-stats/precise` 와 같은 서비스·같은 키(MOLIT_API_KEY)지만, 그쪽은 구역 통계용 요약이라
 *   한 필지의 원문 필드가 필요해 이 라우트를 따로 둔다.
 * · 키는 **이 파일에서만** 읽고 응답에 절대 담지 않는다.
 * · 국토부 호출 한도(429·일일 쿼터)에 걸리면 그 사실을 분명히 알린다 — 화면은 '직접 입력'으로 넘어간다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
/** 전유공용면적 — 호별 전유·공용면적(동·호수 목록의 근거) */
const AREA_BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo";
/** 요청 하나가 매달리지 않게 8초에서 끊는다(폼이 기다리는 자리라 짧게) */
const TIMEOUT_MS = 8000;
/** 전유부는 100행씩만 내려온다(data.go.kr 상한) — 그래서 페이지를 나눠 읽는다 */
const UNIT_PAGE_SIZE = 100;
/** 한 필지에서 읽을 전유부 행 상한 — 대단지에서도 폼이 오래 기다리지 않게 */
const UNIT_ROWS_MAX = 2000;
/** 동시에 부를 페이지 수 — 5개씩이면 국토부가 429를 주지 않는다(2026-11-27 확인) */
const UNIT_CONCURRENCY = 5;
/** 전유부 수집 전체 시간 상한 */
const UNIT_BUDGET_MS = 9000;
/** 응답에 담을 호수 목록 상한(그 이상이면 잘라 내고 unitsTruncated) */
const UNIT_LIST_MAX = 1000;
/** 같은 필지를 다시 눌러도 국토부를 또 부르지 않게 — 12시간 캐시(표제부는 거의 안 바뀐다) */
const TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 500;

type RawItem = Record<string, unknown>;

const cache = new Map<string, { at: number; value: LedgerResponse }>();

function fail(error: string, status: number, detail?: string) {
  return NextResponse.json(
    detail ? { ok: false, error, detail } : { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

const strOf = (item: RawItem, key: string): string => {
  const v = item[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
};

const numOf = (item: RawItem, key: string): number => {
  const v = item[key];
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 'YYYYMMDD' → 'YYYY-MM-DD' — 형식 변환은 lib/building-info 의 것을 그대로 쓴다 */

/** PNU 19자리 → 대장 조회 파라미터. 11번째 자리 1=대지, 2=산 → platGbCd 0/1 */
function pnuToParams(pnu: string): { sigunguCd: string; bjdongCd: string; platGbCd: string; bun: string; ji: string } | null {
  if (!/^\d{19}$/.test(pnu)) return null;
  return {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0",
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
  };
}

/**
 * 데이터포털 오류 응답(XML·JSON)에서 코드·메시지.
 *   · 성공 응답은 `resultCode: "00"` 이라 오류가 아니다.
 *   · 장에 시 데이터포털은 `OpenAPI_ServiceResponse.cmmMsgHeader`(errMsg·returnReasonCode)로
 *     답하는 경우가 있다 — 이 모양을 놓치면 "대장 없는 필지"로 잘못 읽고 12시간 캐시된다.
 */
function parseErrorText(text: string): { code: string; message: string } | null {
  const code =
    /"resultCode"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<resultCode>([^<]+)<\/resultCode>/.exec(text)?.[1] ??
    /"returnReasonCode"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<returnReasonCode>([^<]+)<\/returnReasonCode>/.exec(text)?.[1] ??
    "";
  const message =
    /"resultMsg"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<resultMsg>([^<]+)<\/resultMsg>/.exec(text)?.[1] ??
    /"errMsg"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /"returnAuthMsg"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(text)?.[1] ??
    /<errMsg>([^<]+)<\/errMsg>/.exec(text)?.[1] ??
    "";
  if (!code && !message) return null;
  if (code === "00" || code === "000") return null;
  return { code: code || "ERROR", message: message || "국토부 API 오류" };
}

function friendly(code: string, message: string): string {
  const m = `${code} ${message}`;
  if (code === "429" || /LIMITED|한도|quota/i.test(m)) {
    return "국토교통부 API 호출 한도에 걸렸습니다 — 잠시 뒤 다시 시도하거나 아래에 직접 입력하세요.";
  }
  if (/TIMEOUT|SERVICETIMEOUT|서비스 연결실패/i.test(m)) {
    return "국토교통부 건축물대장 서버가 응답하지 않습니다(일시 장애) — 잠시 뒤 다시 누르거나 아래에 직접 입력하세요.";
  }
  if (["30", "22", "31", "32"].includes(code) || /UNREGISTERED|NOT_REGISTERED|SERVICE_KEY/i.test(m)) {
    return "건축물대장 서비스 키가 승인되지 않았습니다(데이터포털 활용신청 승인 확인) — 직접 입력하세요.";
  }
  return `건축물대장 조회에 실패했습니다 (${code || "UNKNOWN"}) — 직접 입력하세요.`;
}

/** 데이터포털 정상 응답 모양(`{"response":{"body":...}}`)인가 — 빈 응답을 '대장 없음'으로 오해하지 않게 */
function hasBodyEnvelope(text: string): boolean {
  if (!text.trimStart().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(text) as { response?: { body?: unknown } };
    return !!parsed.response && parsed.response.body !== undefined;
  } catch {
    return false;
  }
}

function itemsOf(text: string): RawItem[] {
  if (!text.trimStart().startsWith("{")) return [];
  try {
    const parsed = JSON.parse(text) as {
      response?: { body?: { items?: { item?: RawItem | RawItem[] } | "" } };
    };
    const items = parsed.response?.body?.items;
    if (!items || typeof items !== "object") return [];
    const item = items.item;
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

async function fetchApi(
  base: string,
  p: NonNullable<ReturnType<typeof pnuToParams>>,
  key: string,
  page: number,
  numOfRows: number
) {
  const qs = new URLSearchParams({
    serviceKey: key,
    sigunguCd: p.sigunguCd,
    bjdongCd: p.bjdongCd,
    platGbCd: p.platGbCd,
    bun: p.bun,
    ji: p.ji,
    numOfRows: String(numOfRows),
    pageNo: String(page),
    _type: "json",
  });
  const url = `${base}?${qs.toString()}`;
  let last: Response | null = null;
  // 429(초당·일일 한도)·5xx 는 짧게 쉬었다 다시 — 그래도 막히면 마지막 응답을 그대로 쓴다
  for (const wait of [0, 700, 1500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "redev-platform/1.0 (+https://redev-platform-iota.vercel.app)" },
    });
    if (last.status !== 429 && last.status < 500) break;
  }
  const res = last as Response;
  return { status: res.status, text: await res.text() };
}

function fetchPage(p: NonNullable<ReturnType<typeof pnuToParams>>, key: string, page: number) {
  return fetchApi(BASE, p, key, page, 50);
}

// ── 전유부 → 동·호수 목록 ────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 호명 정리 — '402호' · ' 제402호 ' → '402' */
function hoOf(item: RawItem): string {
  return strOf(item, "hoNm").replace(/\s+/g, "").replace(/^제/, "").replace(/호$/, "");
}

/** 층 — '4층'/'지하1층'과 숫자. 지하는 음수로 둔다(정렬용) */
type FloorInfo = { floor: string; floorNo: number };
function floorOf(item: RawItem): FloorInfo {
  const nm = strOf(item, "flrNoNm").replace(/\s+/g, "");
  const raw = numOf(item, "flrNo");
  // 국토부는 지하를 '지하1층'과 '지1층' 두 가지로 적는다 — 둘 다 음수로 통일한다
  const underground = /^지하/.test(nm) || /^지\d/.test(nm);
  let no = raw;
  if (underground && no > 0) no = -no;
  return { floor: nm || (no > 0 ? `${no}층` : no < 0 ? `지하${-no}층` : ""), floorNo: no };
}

/** 숫자·문자 섞인 이름의 자연 정렬 — '2동' < '11동', '402' < '1001' */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });
}

/**
 * 전유부 행들 → 호별 목록.
 *   · 같은 동·호의 '전유' 행은 전용면적, '공용' 행은 주거공용면적으로 합산한다.
 *   · 전유 행이 없는 호(공용만 있는 경우)는 면적을 알 수 없으므로 목록에서 뺀다.
 *   · 층은 전유 행의 `flrNoNm` 을 쓴다(공용 행은 '각층'·'지하1층'이 섞여 있다).
 */
function aggregateUnits(items: RawItem[]): LedgerUnit[] {
  type Agg = { dong: string; ho: string; floor: string; floorNo: number; ex: number; co: number; purps?: string };
  const map = new Map<string, Agg>();
  for (const item of items) {
    const ho = hoOf(item);
    if (!ho) continue;
    const dong = strOf(item, "dongNm").trim();
    const key = `${dong}|${ho}`;
    let agg = map.get(key);
    if (!agg) {
      agg = { dong, ho, floor: "", floorNo: 0, ex: 0, co: 0 };
      map.set(key, agg);
    }
    const area = numOf(item, "area");
    const gb = strOf(item, "exposPubuseGbCd") || strOf(item, "exposPubuseGbCdNm");
    const isExclusive = gb === "1" || gb === "전유";
    if (isExclusive) {
      agg.ex += area;
      const f = floorOf(item);
      if (f.floor && f.floor !== "각층") {
        agg.floor = f.floor;
        agg.floorNo = f.floorNo;
      }
      const purps = strOf(item, "mainPurpsCdNm").trim();
      if (purps) agg.purps = purps;
    } else {
      agg.co += area;
    }
  }
  const units: LedgerUnit[] = [];
  for (const agg of map.values()) {
    if (agg.ex <= 0) continue;
    units.push({
      dong: agg.dong,
      dongLabel: dongLabel(agg.dong),
      ho: agg.ho,
      floor: agg.floor || (agg.floorNo > 0 ? `${agg.floorNo}층` : ""),
      floorNo: agg.floorNo,
      exclusiveArea: round2(agg.ex),
      commonArea: round2(agg.co),
      supplyArea: round2(agg.ex + agg.co),
      ...(agg.purps ? { mainPurps: agg.purps } : {}),
    });
  }
  units.sort(
    (a, b) =>
      naturalCompare(a.dongLabel, b.dongLabel) ||
      a.floorNo - b.floorNo ||
      naturalCompare(a.ho, b.ho)
  );
  return units;
}

/**
 * 전유부 조회 — 동·호수 목록.
 *   · 1페이지에서 전체 행 수를 받아 나머지 페이지를 5개씩 병렬로 읽는다.
 *   · 행 상한(2,000)을 넘거나 시간 상한을 넘기면 거기서 멈추고 `truncated` 로 알린다.
 *   · 전유부가 없는 건물(단독·다가구·나지)은 빈 목록 + 이유를 돌려준다 — 오류가 아니다.
 */
async function fetchUnits(p: NonNullable<ReturnType<typeof pnuToParams>>, key: string): Promise<UnitFetch> {
  const started = Date.now();
  const first = await fetchApi(AREA_BASE, p, key, 1, UNIT_PAGE_SIZE);
  if (first.status < 200 || first.status >= 300) {
    return { units: [], rows: 0, totalRows: 0, truncated: false, note: `전유부 조회에 실패했습니다(HTTP ${first.status}) — 동·호·면적을 직접 입력하세요.` };
  }
  const err = parseErrorText(first.text);
  if (err) {
    return { units: [], rows: 0, totalRows: 0, truncated: false, note: `전유부 조회에 실패했습니다(${err.code}) — 동·호·면적을 직접 입력하세요.` };
  }
  if (!hasBodyEnvelope(first.text)) {
    return { units: [], rows: 0, totalRows: 0, truncated: false, note: "전유부 응답을 읽지 못했습니다 — 동·호·면적을 직접 입력하세요." };
  }

  const totalRows = totalOf(first.text);
  const items: RawItem[] = [...itemsOf(first.text)];
  if (totalRows === 0 || items.length === 0) {
    return {
      units: [],
      rows: 0,
      totalRows,
      truncated: false,
      note: "이 필지의 건축물대장에 전유부가 없습니다(단독·다가구·상가 전체임대 등) — 동·호와 면적을 직접 입력하세요.",
    };
  }

  const lastPage = Math.min(Math.ceil(totalRows / UNIT_PAGE_SIZE), Math.ceil(UNIT_ROWS_MAX / UNIT_PAGE_SIZE));
  const pages: number[] = [];
  for (let page = 2; page <= lastPage; page++) pages.push(page);

  for (let i = 0; i < pages.length; i += UNIT_CONCURRENCY) {
    if (Date.now() - started > UNIT_BUDGET_MS) break;
    const batch = pages.slice(i, i + UNIT_CONCURRENCY);
    const got = await Promise.all(
      batch.map((page) =>
        fetchApi(AREA_BASE, p, key, page, UNIT_PAGE_SIZE).catch(() => null)
      )
    );
    for (const res of got) {
      if (!res) continue;
      if (res.status < 200 || res.status >= 300) continue;
      items.push(...itemsOf(res.text));
    }
  }

  const all = aggregateUnits(items);
  const truncated = items.length < totalRows || all.length > UNIT_LIST_MAX;
  const units = all.slice(0, UNIT_LIST_MAX);
  return {
    units,
    rows: items.length,
    totalRows,
    truncated,
    ...(truncated
      ? {
          note: `대장 전유부 ${totalRows.toLocaleString()}행 가운데 ${items.length.toLocaleString()}행만 읽었습니다 — 목록에 없는 동·호는 직접 입력하세요.`,
        }
      : {}),
  };
}

function toBrief(item: RawItem): LedgerBuildingBrief {
  const attached = /부속/.test(strOf(item, "mainAtchGbCdNm"));
  const dongName = strOf(item, "dongNm");
  const bldNm = strOf(item, "bldNm");
  const brief: LedgerBuildingBrief = { attached };
  const pk = strOf(item, "mgmBldrgstPk");
  if (pk) brief.pk = pk;
  if (bldNm || dongName) brief.name = bldNm || dongName;
  if (dongName) brief.dongName = dongName;
  const mainPurps = strOf(item, "mainPurpsCdNm");
  if (mainPurps) brief.mainPurps = mainPurps;
  const etcPurps = strOf(item, "etcPurps");
  if (etcPurps) brief.etcPurps = etcPurps;
  const structure = strOf(item, "strctCdNm") || strOf(item, "etcStrct");
  if (structure) brief.structure = structure;
  for (const [key, field] of [
    ["platArea", "platArea"],
    ["archArea", "archArea"],
    ["totArea", "totArea"],
    ["grndFlrCnt", "grndFlrCnt"],
    ["ugrFlrCnt", "ugrFlrCnt"],
    ["hhldCnt", "hhldCnt"],
    ["fmlyCnt", "fmlyCnt"],
    ["hoCnt", "hoCnt"],
  ] as const) {
    const n = numOf(item, key);
    if (n > 0) brief[field] = n;
  }
  const useAprDay = formatAprDay(strOf(item, "useAprDay"));
  if (useAprDay) brief.useAprDay = useAprDay;

  /**
   * 주차 — 표제부에는 합계(totPkngCnt)가 있는 해도 있고, 자주식·기계식 4칸으로 나뒤 있는 해가 많다.
   *   4칸(실내·실외 × 자주식·기계식)을 더해 합계로 쓴다.
   */
  const totPkng = numOf(item, "totPkngCnt");
  const mech = numOf(item, "indrMechUtcnt") + numOf(item, "oudrMechUtcnt");
  const auto = numOf(item, "indrAutoUtcnt") + numOf(item, "oudrAutoUtcnt");
  if (totPkng > 0) brief.parkingTotal = totPkng;
  else if (mech + auto > 0) brief.parkingTotal = mech + auto;
  else if ("indrAutoUtcnt" in item || "oudrAutoUtcnt" in item) brief.parkingTotal = 0;

  /** 승강기도 대장에 값이 있을 때만 쓴다(없으면 폼을 비려 둔다) */
  if ("rideUseElvtCnt" in item || "emgenUseElvtCnt" in item) {
    brief.elevatorCnt = numOf(item, "rideUseElvtCnt") + numOf(item, "emgenUseElvtCnt");
  }

  /** 위반건축물 — vltnBldYn 은 응답에서 빠지는 해가 있어(값 없음) 있을 때만 적는다 */
  const vltn = strOf(item, "vltnBldYn");
  if (vltn === "1" || /^y/i.test(vltn)) brief.violation = "위반건축물 있음";
  else if (vltn === "0" || /^n/i.test(vltn)) brief.violation = "해당 없음";

  return brief;
}

/** 주건축물 우선, 그다음 연면적이 가장 큰 동 — 사용자가 사는 건물을 고른다 */
function pickPrimary(buildings: LedgerBuildingBrief[]): LedgerBuildingBrief | null {
  if (buildings.length === 0) return null;
  const mains = buildings.filter((b) => !b.attached);
  const pool = mains.length > 0 ? mains : buildings;
  return pool.reduce((a, b) => ((b.totArea ?? 0) > (a.totArea ?? 0) ? b : a));
}

type LedgerResponse =
  | {
      ok: true;
      pnu: string;
      count: number;
      primary: LedgerBuildingBrief | null;
      buildings: LedgerBuildingBrief[];
      units: LedgerUnit[];
      unitsRows: number;
      unitsTotalRows: number;
      unitsTruncated: boolean;
      unitsNote?: string;
      note?: string;
    }
  | { ok: false; error: string; detail?: string };

type UnitFetch = { units: LedgerUnit[]; rows: number; totalRows: number; truncated: boolean; note?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pnu = (url.searchParams.get("pnu") ?? "").trim();
  const params = pnuToParams(pnu);
  if (!params) {
    return fail("BAD_PNU", 400, "pnu 는 숫자 19자리(필지고유번호)여야 합니다.");
  }

  const key = (process.env.MOLIT_API_KEY ?? "").trim();
  if (!key) {
    return fail(
      "MOLIT_KEY_NOT_SET",
      503,
      "서버에 국토교통부 API 키(MOLIT_API_KEY)가 없어 건축물대장을 불러오지 못합니다 — 직접 입력하세요."
    );
  }

  const fresh = url.searchParams.get("fresh") === "1";
  const hit = cache.get(pnu);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    const cacheHeaders = { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" };
    return NextResponse.json(hit.value, { headers: cacheHeaders });
  }

  let first: { status: number; text: string };
  // 전유부는 표제부와 별개 서비스라 병렬로 부른다 — 폼이 기다리는 시간을 늘리지 않으려고
  const unitsPromise = fetchUnits(params, key).catch(
    (e): UnitFetch => ({
      units: [],
      rows: 0,
      totalRows: 0,
      truncated: false,
      note: `전유부를 불러오지 못했습니다${e instanceof Error ? `(${e.message.slice(0, 60)})` : ""} — 동·호·면적을 직접 입력하세요.`,
    })
  );
  try {
    first = await fetchPage(params, key, 1);
  } catch (e) {
    await unitsPromise;
    return fail("MOLIT_UNREACHABLE", 502, e instanceof Error ? e.message : String(e));
  }
  if (first.status < 200 || first.status >= 300) {
    await unitsPromise;
    return fail("MOLIT_HTTP_ERROR", 502, `HTTP ${first.status} ${first.text.slice(0, 200)}`);
  }
  const err = parseErrorText(first.text);
  if (err) {
    await unitsPromise;
    const status = err.code === "429" ? 429 : 502;
    return fail(err.code === "429" ? "MOLIT_QUOTA_EXCEEDED" : "MOLIT_UPSTREAM_FAILED", status, friendly(err.code, err.message));
  }

  const items = itemsOf(first.text);
  const total = totalOf(first.text);
  // ① 데이터포털이 HTTP 200 으로 오류 봉투(OpenAPI_ServiceResponse 등)를 주는 경우
  // ② 정상 봉투가 아닌 응답(프록시 오류 페이지 등) — 이 둘을 '대장 없는 필지'로 오해해 캐시하지 않는다
  if (!hasBodyEnvelope(first.text)) {
    await unitsPromise;
    return fail(
      "MOLIT_BAD_RESPONSE",
      502,
      "국토교통부 건축물대장 응답을 읽지 못했습니다 — 잠시 뒤 다시 시도하거나 아래에 직접 입력하세요."
    );
  }
  if (items.length === 0 && total > 0) {
    await unitsPromise;
    return fail("MOLIT_EMPTY_ITEMS", 502, "건축물대장 응답에 항목이 비어 있습니다 — 잠시 뒤 다시 시도하세요.");
  }
  if (total > items.length && items.length > 0) {
    // 한 필지에 표제부가 여러 동(예: 주건축물 + 부속건축물)일 때만 2페이지를 더 본다
    const next = await fetchPage(params, key, 2).catch(() => null);
    if (next && next.status >= 200 && next.status < 300) items.push(...itemsOf(next.text));
  }

  const buildings = items.map(toBrief);
  const unitResult = await unitsPromise;
  const value: LedgerResponse = {
    ok: true,
    pnu,
    count: buildings.length,
    primary: pickPrimary(buildings),
    buildings,
    units: unitResult.units,
    unitsRows: unitResult.rows,
    unitsTotalRows: unitResult.totalRows,
    unitsTruncated: unitResult.truncated,
    ...(unitResult.note ? { unitsNote: unitResult.note } : {}),
    ...(buildings.length === 0
      ? { note: "이 필지에는 건축물대장 표제부가 없습니다(나지·미등록 건물) — 직접 입력하세요." }
      : {}),
  };

  if (cache.size >= CACHE_MAX) cache.clear();
  // 대장이 없다는 응답은 캐시하지 않는다 — 국토부 쪽 일시 장애가 '대장 없음'으로 보이는 경우가 있어
  //   (2026-11-27 확인) 짧게 기억해 두면 그 사이 등록한 매물이 빈 값으로 남는다. 다시 누르면 다시 묻도록 둔다.
  const cacheable = buildings.length > 0;
  if (cacheable) cache.set(pnu, { at: Date.now(), value });

  return NextResponse.json(value, {
    headers: cacheable
      ? { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" }
      : { "Cache-Control": "no-store" },
  });
}
