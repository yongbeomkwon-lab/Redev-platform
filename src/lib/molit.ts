// ─────────────────────────────────────────────────────────────────────────────
// 국토교통부 실거래가 공개 API — 공용 타입·법정동 코드·법정동 찾기
//
//  · 이 파일은 **클라이언트에서도 안전**하다. API 키(MOLIT_API_KEY)는 여기에 없다.
//    키는 서버 라우트(src/app/api/transactions/route.ts)에서만 읽는다.
//  · 엔드포인트(https://apis.data.go.kr/1613000/)
//      아파트 매매 상세      RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
//      단독·다가구 매매      RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade
//      연립·다세대 매매      RTMSDataSvcRHTrade2/getRTMSDataSvcRHTrade2
//        · 구버전 RTMSDataSvcRHTrade는 이 키로 호출하면 code 30(등록되지 않은 서비스키)이 온다.
//          신버전은 건물명(mhouseNm)·대지권면적(landAr)·전용면적(excluUseAr)·지번(jibun)을 그대로 준다.
//    세 서비스 모두 LAWD_CD(법정동코드 앞 5자리) + DEAL_YMD(YYYYMM)로 조회한다.
//  · 응답은 XML이라 서버 라우트에서 작은 파서로 JSON으로 옮긴다(molit-server.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { SEOUL_LEGAL_DONGS } from "@/lib/seoul-legal-dongs";

/** 서울 25개 자치구 → 법정동코드 앞 5자리(LAWD_CD) */
export const SEOUL_LAWD_CODES: Record<string, string> = {
  종로구: "11110",
  중구: "11140",
  용산구: "11170",
  성동구: "11200",
  광진구: "11215",
  동대문구: "11230",
  중랑구: "11260",
  성북구: "11290",
  강북구: "11305",
  도봉구: "11320",
  노원구: "11350",
  은평구: "11380",
  서대문구: "11410",
  마포구: "11440",
  양천구: "11470",
  강서구: "11500",
  구로구: "11530",
  금천구: "11545",
  영등포구: "11560",
  동작구: "11590",
  관악구: "11620",
  서초구: "11650",
  강남구: "11680",
  송파구: "11710",
  강동구: "11740",
};

export const MOLIT_KINDS = ["아파트", "단독·다가구", "연립·다세대"] as const;
export type MolitTransactionKind = (typeof MOLIT_KINDS)[number];

/** 서비스별 국토부 엔드포인트 — kind → 서비스 이름 */
export const MOLIT_SERVICES: Record<MolitTransactionKind, string> = {
  아파트: "RTMSDataSvcAptTradeDev",
  "단독·다가구": "RTMSDataSvcSHTrade",
  "연립·다세대": "RTMSDataSvcRHTrade2",
};

/** 개별 실거래 1건 */
export type MolitTransaction = {
  id: string;
  kind: MolitTransactionKind;
  /** 아파트 단지명, 연립·다세대는 건물명(mhouseNm), 단독·다가구는 단독/다가구 */
  name: string;
  umdNm: string;
  /** 지번 원문 — 단독·다가구는 `1**`처럼 마스킹되어 오는 경우가 많다 */
  jibun: string;
  /** 전용면적(아파트·연립) 또는 연면적(단독·다가구) ㎡ */
  areaSqm: number | null;
  /** 대지면적(단독·다가구 `plottageAr`) 또는 대지권면적=대지지분(연립·다세대 `landAr`) ㎡ */
  plottageSqm: number | null;
  floor: number | null;
  buildYear: number | null;
  /** 거래금액 (만원) */
  price: number;
  /** 평당가 (만원/평) — 아파트·연립은 전용, 단독·다가구는 대지 기준 */
  pyeongPrice: number | null;
  pyeongBasis: "전용" | "대지";
  /**
   * 지분(대지) 평당가 (만원/평) — 단독·다가구는 대지면적, 연립·다세대는 대지권면적(landAr) 기준.
   *   · 국토부 대지권면적이 없는 거래(아파트 등)는 null.
   *   · 단독·다가구는 `pyeongPrice`(대지 기준)와 같은 값이고, 연립·다세대는 전용 기준 `pyeongPrice`와 별개다.
   */
  landPyeongPrice: number | null;
  /** 계약일 YYYY-MM-DD */
  dealDate: string;
  /** 중개거래 / 직거래 */
  dealingType: string;
  /** 계약 해제된 거래 (cdealType === "O") */
  canceled: boolean;
  canceledDate: string | null;
  /** 구역 대표 지번과 일치하면 "zone", 같은 법정동이면 "dong" */
  scope: "zone" | "dong";
};

/** 유형별 연동 상태 — 미신청(returnReasonCode 30)이어도 나머지는 그대로 보여준다 */
export type MolitCoverage = {
  kind: MolitTransactionKind;
  service: string;
  ok: boolean;
  code?: string;
  message?: string;
};

export type MolitQuery = {
  gu: string;
  lawdCd: string;
  /** 실제 조회한 법정동 (여러 개면 합쳐서) */
  dongs: string[];
  months: number;
  from: string; // YYYYMM
  to: string; // YYYYMM
  /** 구역 대표 지번(있으면 '구역 내' 표시 기준) */
  zoneJibun: string | null;
};

export type MolitSummary = {
  count: number;
  byKind: Record<string, number>;
  inZone: number;
  sameDong: number;
  canceled: number;
  /** 해제 거래를 뺀 평균 평당가 — 아파트·연립(전용면적 기준) 만원/평 */
  avgPyeongPrice: number | null;
  /** 해제 거래를 뺀 평균 지분·대지 평당가 — 단독·다가구(대지면적)·연립·다세대(대지권면적) 만원/평 */
  avgLandPyeongPrice: number | null;
};

export type MolitResponse = {
  ok: boolean;
  /**
   * `upstream_outage` = 국토부 오픈API 연계 자체가 끊긴 상태(게이트웨이 코드 04 등).
   *   · 우리 키·요청 형식 문제가 아니라 **공공데이터포털 ↔ 국토부(RTMS) 연계 장애**다.
   *     화면은 이 경우 '우리 설정을 고치라'고 안내하지 않고, 실거래가 공개시스템 링크를 준다.
   */
  reason?: "gu_not_found" | "key_missing" | "upstream_failed" | "upstream_outage" | "bad_request";
  message?: string;
  query?: MolitQuery;
  coverage?: MolitCoverage[];
  transactions?: MolitTransaction[];
  summary?: MolitSummary;
  notices?: string[];
  /** 서버 캐시에서 바로 준 응답인지 */
  cached?: boolean;
  fetchedAt?: string;
};

// ── 단지·건물 5년 이력(건물 상세) ─────────────────────────────────────────────

/** 5년 이력 조회 대상 — 공동주택(아파트·연립·다세대)만 건물 단위로 볼 수 있다 */
export type BuildingTradeKind = "아파트" | "연립·다세대";

export const BUILDING_TRADE_KINDS: BuildingTradeKind[] = ["아파트", "연립·다세대"];

/** 화면이 지도 핀·목록 행에서 넘기는 단지·건물 식별자 */
export type BuildingTradeTarget = {
  /** 자치구 — LAWD_CD 매핑 */
  gu: string;
  /** 법정동(umdNm) */
  dong: string;
  /** 지번 (예: 209-12) */
  jibun: string;
  kind: BuildingTradeKind;
  /** 단지명(아파트 aptNm) / 건물명(연립 mhouseNm) */
  name: string;
};

export type BuildingHistoryQuery = {
  gu: string;
  lawdCd: string;
  dong: string;
  jibun: string;
  kind: BuildingTradeKind;
  name: string;
  /** 이번 호출에서 조회한 개월 수 */
  months: number;
  /** 최근 몇 개월을 건너뛰었는지 (나눠 부를 때) */
  offset: number;
  from: string; // YYYYMM
  to: string; // YYYYMM
};

export type BuildingHistorySummary = {
  /** 해제 거래를 뺀 건수 */
  count: number;
  canceled: number;
  min: number | null;
  max: number | null;
  /** 가장 최근 거래(해제 제외) */
  latest: { price: number; dealDate: string; areaSqm: number | null; floor: number | null } | null;
  /** 평균 전용 평당가(만원/평) */
  avgPyeongPrice: number | null;
  /** 평균 지분·대지 평당가(만원/평) — 연립·다세대 대지권면적 기준 */
  avgLandPyeongPrice: number | null;
};

export type BuildingHistoryResponse = {
  ok: boolean;
  reason?: "gu_not_found" | "key_missing" | "upstream_failed" | "upstream_outage" | "bad_request";
  message?: string;
  query?: BuildingHistoryQuery;
  coverage?: MolitCoverage;
  transactions?: MolitTransaction[];
  summary?: BuildingHistorySummary;
  /** 요청한 개월 중 일부 달이 실패해 결과가 불완전한지 */
  partial?: boolean;
  /** 받지 못한 달(YYYYMM) — 화면이 그 달만 따로 다시 물어본다 */
  failedMonths?: string[];
  /** 서버 캐시에서 바로 준 응답인지 */
  cached?: boolean;
  fetchedAt?: string;
};

/**
 * 지번 문자열을 비교 가능한 형태로 — `0209-00` · `209` · `209-0` · `440-09` · `440-9번지` 를
 *   모두 `209` / `440-9` 로 만든다.
 *   · 카카오 역지오코딩은 `440-9`, 국토부는 bonbun·bubun 을 따로 줘서 표기가 갈린다.
 *   · `산440-9` 의 산(山)은 국토부 실거래 자료에 구분이 없어 뗀다 — 같은 필지로 본다.
 */
export function normalizeJibun(raw: string): string {
  let s = (raw ?? "").replace(/\s+/g, "");
  if (s.startsWith("산")) s = s.slice(1);
  s = s.replace(/번지$/, "");
  const m = s.match(/^(\d{1,4})(?:[-.](\d{1,4}))?$/);
  if (!m) return s;
  const bonbun = Number(m[1]);
  const bubun = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(bonbun) || bonbun <= 0) return s;
  return bubun > 0 ? `${bonbun}-${bubun}` : String(bonbun);
}

/** 건물명에서 뒤에 붙은 지번 표기만 떼어 낸다 — `한아름맨션(440-9)` → `한아름맨션` */
function stripJibunSuffix(name: string): string {
  const without = name
    .replace(/\(\d{1,4}(?:-\d{1,4})?\)$/, "")
    .replace(/\d{1,4}-\d{1,4}$/, "");
  return without.length ? without : name;
}

/**
 * 단지·건물명 비교 키 — 공백·가운뎃점·괄호·대소문자 무시.
 *   · 국토부 연립·다세대 건물명은 지번이 붙어 오기도 한다(`한아름맨션(440-9)`).
 *     같은 건물이 `한아름맨션` 으로만 오는 달도 있어, 뒤에 붙은 지번 표기를 떼고 비교한다.
 */
export function normalizeBuildingName(raw: string): string {
  return stripJibunSuffix((raw ?? "").replace(/\s+/g, ""))
    .replace(/[·.,()\[\]{}'"`]/g, "")
    .toLowerCase();
}

/**
 * 화면에 보일 단지·건물명 — 뒤에 붙은 지번이 **조회한 지번과 같을 때만** 뗀다.
 *   (`한아름맨션(440-9)` + 지번 `440-9` → `한아름맨션`, 지번이 다르면 원문 그대로)
 */
export function displayBuildingName(raw: string, jibun?: string | null): string {
  const original = (raw ?? "").trim();
  const want = jibun ? normalizeJibun(jibun) : "";
  const paren = original.match(/\((\d{1,4}(?:\s*-\s*\d{1,4})?)\)\s*$/);
  if (paren && (!want || normalizeJibun(paren[1]) === want)) {
    return original.slice(0, paren.index).trim() || original;
  }
  const tail = original.match(/(\d{1,4}\s*-\s*\d{1,4})\s*$/);
  if (tail && (!want || normalizeJibun(tail[1]) === want)) {
    return original.slice(0, tail.index).trim() || original;
  }
  return original;
}

export const PYEONG = 3.305785;

/** 만원 → "19억 3,000만원" (0이면 "3억") */
export function eok(man: number): string {
  const e = Math.floor(man / 10000);
  const m = man % 10000;
  if (e <= 0) return `${m.toLocaleString()}만원`;
  return m === 0 ? `${e}억` : `${e}억 ${m.toLocaleString()}만원`;
}

/** 만원 → 짧은 표기 "19.3억" / "9,500만" */
export function eokShort(man: number): string {
  if (man >= 10000) {
    const v = man / 10000;
    return `${v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100}억`;
  }
  return `${man.toLocaleString()}만`;
}

/** ㎡ → 평 (소수 1자리) */
export function toPyeong(sqm: number): number {
  return Math.round((sqm / PYEONG) * 10) / 10;
}

// ── 법정동 찾기 ─────────────────────────────────────────────────────────────

/** "상도동 209"·"(가칭)신림동 1464번지"처럼 이름 안에 법정동이 적힌 경우 */
const DONG_IN_TEXT = /([가-힣]{1,6}동)(?=\s|\d|번지|일대|일원|,|\)|$)/g;

/**
 * 구역 이름·별칭에 **법정동이 그대로 적혀 있으면** 그 동을 돌려준다 (가장 확실한 근거).
 *   예: "상도동 182-13" → 상도동, "(가칭)신림동 1464번지 일원 가로주택정비사업" → 신림동
 */
export function legalDongInText(gu: string, texts: string[]): string | null {
  const known = SEOUL_LEGAL_DONGS[gu] ?? [];
  for (const t of texts) {
    for (const m of t.matchAll(DONG_IN_TEXT)) {
      const cand = m[1];
      if (!known.length || known.includes(cand)) return cand;
    }
  }
  return null;
}

/**
 * 구역 이름의 접두어로 같은 구의 법정동을 추정한다 (카카오 역지오코딩이 안 될 때의 대비책).
 *   예: "상도23구역" → 상도동 (+ 상도1동), "성수전략2구역" → 성수동1가·성수동2가
 *   · 동 이름에서 "동"과 뒤 숫자·"가"를 뗀 줄기(상도·성수·신림)를 구역명에서 찾는다.
 *   · 후보가 4개를 넘으면 너무 흔한 줄기라 포기한다(엉뚱한 동을 붙이지 않는다).
 */
export function guessLegalDongsByStem(gu: string, texts: string[]): string[] {
  const known = SEOUL_LEGAL_DONGS[gu] ?? [];
  if (!known.length) return [];
  const hay = texts.join(" ").replace(/\s+/g, "");
  const scored: { dong: string; stem: string }[] = [];
  for (const dong of known) {
    const stem = dong.replace(/동$/, "").replace(/\d+가$/, "").replace(/가$/, "");
    if (stem.length < 2) continue;
    if (hay.includes(stem)) scored.push({ dong, stem });
  }
  if (!scored.length) return [];
  // 가장 긴 줄기부터 — "상도"가 "도"보다 정확하다
  scored.sort((a, b) => b.stem.length - a.stem.length || a.dong.localeCompare(b.dong));
  const top = scored[0].stem.length;
  const out = scored.filter((s) => s.stem.length === top).map((s) => s.dong);
  return out.length <= 4 ? out : [];
}

/** 구역 이름·지번에서 구역 대표 지번(본번)을 뽑는다 — '구역 내' 표시 기준 */
export function zoneJibunInText(texts: string[]): { dong: string; bonbun: number; bubun: number | null } | null {
  for (const t of texts) {
    const m = t.match(/([가-힣]{1,6}동)\s*(\d{1,4})(?:-(\d{1,4}))?/);
    if (!m) continue;
    const bonbun = Number(m[2]);
    const bubun = m[3] ? Number(m[3]) : null;
    if (!Number.isFinite(bonbun) || bonbun <= 0) continue;
    return { dong: m[1], bonbun, bubun };
  }
  return null;
}
