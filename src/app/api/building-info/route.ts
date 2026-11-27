import { NextResponse } from "next/server";
import { formatAprDay, type LedgerBuildingBrief } from "@/lib/building-info";

/**
 * 건축물대장 표제부 **한 필지** 조회 — 매물 등록 화면의 자동 채움용
 *
 *   GET /api/building-info?pnu=1168010100102090000
 *   GET /api/building-info?pnu=...&fresh=1        (캐시 무시)
 *
 * · `/register` 에서 주소를 고르면, 그 필지의 표제부를 한 번 불러
 *   **사용승인일·총층수·주용도·대지면적·건물명·세대(가구)수**를 폼에 채운다.
 *   (값을 지어내지 않는다 — 대장에 있는 값만 그대로 넘기고, 전유면적처럼 동·호가 있어야 하는 값은 넘기지 않는다.)
 * · 국토교통부 건축HUB `BldRgstHubService/getBrTitleInfo` 를 쓴다.
 *   `zone-stats/precise` 와 같은 서비스·같은 키(MOLIT_API_KEY)지만, 그쪽은 구역 통계용 요약이라
 *   한 필지의 원문 필드가 필요해 이 라우트를 따로 둔다.
 * · 키는 **이 파일에서만** 읽고 응답에 절대 담지 않는다.
 * · 국토부 호출 한도(429·일일 쿼터)에 걸리면 그 사실을 분명히 알린다 — 화면은 '직접 입력'으로 넘어간다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
/** 요청 하나가 매달리지 않게 8초에서 끊는다(폼이 기다리는 자리라 짧게) */
const TIMEOUT_MS = 8000;
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

async function fetchPage(p: NonNullable<ReturnType<typeof pnuToParams>>, key: string, page: number) {
  const qs = new URLSearchParams({
    serviceKey: key,
    sigunguCd: p.sigunguCd,
    bjdongCd: p.bjdongCd,
    platGbCd: p.platGbCd,
    bun: p.bun,
    ji: p.ji,
    numOfRows: "50",
    pageNo: String(page),
    _type: "json",
  });
  const url = `${BASE}?${qs.toString()}`;
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
  | { ok: true; pnu: string; count: number; primary: LedgerBuildingBrief | null; buildings: LedgerBuildingBrief[]; note?: string }
  | { ok: false; error: string; detail?: string };

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
  try {
    first = await fetchPage(params, key, 1);
  } catch (e) {
    return fail("MOLIT_UNREACHABLE", 502, e instanceof Error ? e.message : String(e));
  }
  if (first.status < 200 || first.status >= 300) {
    return fail("MOLIT_HTTP_ERROR", 502, `HTTP ${first.status} ${first.text.slice(0, 200)}`);
  }
  const err = parseErrorText(first.text);
  if (err) {
    const status = err.code === "429" ? 429 : 502;
    return fail(err.code === "429" ? "MOLIT_QUOTA_EXCEEDED" : "MOLIT_UPSTREAM_FAILED", status, friendly(err.code, err.message));
  }

  const items = itemsOf(first.text);
  const total = totalOf(first.text);
  // ① 데이터포털이 HTTP 200 으로 오류 봉투(OpenAPI_ServiceResponse 등)를 주는 경우
  // ② 정상 봉투가 아닌 응답(프록시 오류 페이지 등) — 이 둘을 '대장 없는 필지'로 오해해 캐시하지 않는다
  if (!hasBodyEnvelope(first.text)) {
    return fail(
      "MOLIT_BAD_RESPONSE",
      502,
      "국토교통부 건축물대장 응답을 읽지 못했습니다 — 잠시 뒤 다시 시도하거나 아래에 직접 입력하세요."
    );
  }
  if (items.length === 0 && total > 0) {
    return fail("MOLIT_EMPTY_ITEMS", 502, "건축물대장 응답에 항목이 비어 있습니다 — 잠시 뒤 다시 시도하세요.");
  }
  if (total > items.length && items.length > 0) {
    // 한 필지에 표제부가 여러 동(예: 주건축물 + 부속건축물)일 때만 2페이지를 더 본다
    const next = await fetchPage(params, key, 2).catch(() => null);
    if (next && next.status >= 200 && next.status < 300) items.push(...itemsOf(next.text));
  }

  const buildings = items.map(toBrief);
  const value: LedgerResponse = {
    ok: true,
    pnu,
    count: buildings.length,
    primary: pickPrimary(buildings),
    buildings,
    ...(buildings.length === 0
      ? { note: "이 필지에는 건축물대장 표제부가 없습니다(나지·미등록 건물) — 직접 입력하세요." }
      : {}),
  };

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(pnu, { at: Date.now(), value });

  return NextResponse.json(value, {
    headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" },
  });
}
