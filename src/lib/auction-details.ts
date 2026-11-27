// ─────────────────────────────────────────────────────────────────────────────
// 경매 물건 **상세** — `public/data/auction-details.json`
//
//   · 목록 데이터(`auctions.json`)는 대법원 법원경매정보의 **물건검색 결과 한 줄**에서 오므로
//     사건번호·감정가·최저가·기일·유찰·비고까지만 담는다.
//   · 그보다 깊은 정보(회차별 기일과 결과, 물건상태, 청구금액·배당요구종기, 목록내역,
//     감정평가요항표, 사건 사진)는 대법원의 **사건 조회**에서만 나온다.
//   · `scripts/fetch-auction-details.py` 가 사건 조회(POST /pgj/pgj15A/selectAuctnCsSrchRslt.on)를
//     **사건 하나당 한 번** 호출해 이 파일을 만든다. 한 사건의 물건·목적물이 여러 줄이어도
//     `byCase` 한 레코드를 함께 쓴다(일괄매각 24필지 → 1회 조회).
//   · 파일이 없거나 그 사건이 아직 수집되지 않았으면 화면은 **없는 값을 만들지 않고**
//     "대법원 원문에서 확인" 안내와 사건번호 복사·원문 열기를 보여 준다.
// ─────────────────────────────────────────────────────────────────────────────

/** 회차별 기일 한 줄 — 사건 조회의 `dlt_rletCsGdsDtsDxdyInf` */
export type AuctionScheduleRow = {
  /** 기일 YYYYMMDD */
  date: string;
  /** 기일종류 — 매각기일 · 매각결정기일 등(법원 코드표 AUCTN_DXDY_KND_CD) */
  kind?: string;
  /** 기일장소 */
  place?: string;
  /** 그 회차의 최저매각가격(원) — 사건 조회에는 없고 사건상세에만 있다 */
  minimum?: number | null;
  /** 기일결과 — 유찰 · 매각 등(법원 코드표 AUCTN_DXDY_RSLT_CD) */
  result?: string;
  /** 기일시각 HHMM */
  time?: string;
};

/** 목록내역 한 줄 — 토지·건물·집합건물 (사건 조회의 `dlt_rletCsDspslObjctLst`) */
export type AuctionListRow = {
  /** 목록번호(목적물 순번) */
  seq?: number | string;
  /** 목록구분 — 토지 · 건물 · 집합건물 등 */
  kind: string;
  /** 소재지(법원 원문) */
  address: string;
  /** 종국내역 — 미종국 등 */
  closing?: string;
};

/** 면적·대지권 한 줄 — 사건상세의 목적물 목록(수집된 경우에만) */
export type AuctionAreaRow = {
  kind: string;
  detail: string;
  areaSqm?: number | null;
};

export type AuctionDetail = {
  /** 사건기본정보 */
  caseNo?: string;
  caseName?: string;
  court?: string;
  courtDept?: string;
  /** 법원 경매계 전화 */
  courtTel?: string;
  /** 집행관사무소 전화 (입찰 문의) */
  execTel?: string;
  /** 법원이 표시하는 진행상태 코드명 */
  status?: string;
  /** 사건접수일 YYYYMMDD */
  receiptDate?: string;
  /** 경매개시일 YYYYMMDD */
  commenceDate?: string;
  /** 청구금액(원) */
  claimAmount?: number | null;
  /** 배당요구종기일 YYYYMMDD */
  dividendDeadline?: string;
  /** 물건종류(법원 표기) */
  objectKind?: string;
  /** 매각장소 */
  salePlace?: string;
  /** 입찰기간 — 예: 2026.11.24 10:00 ~ 2026.11.26 17:00 */
  bidPeriod?: string;
  /** 법원이 고시한 매수신청보증금률(%) — 없으면 화면은 10%로 계산해 '계산' 표시 */
  depositRate?: number | null;
  /** 회차별 기일내역 — 물건번호(매각물건순번)별 */
  schedules?: Record<string, AuctionScheduleRow[]>;
  /** 물건번호별 법원 물건상태 — 매각공고 · 유찰 · 매각 등 */
  itemStatus?: Record<string, string>;
  /** 물건번호별 매각물건명세서 문서 ID — 문서 자체는 대법원에서 열람 */
  specSheetIds?: Record<string, string>;
  /** 목록내역(구분·소재지·종국) */
  lists?: AuctionListRow[];
  /** 면적·대지권(사건상세에서만) */
  areas?: AuctionAreaRow[];
  /** 감정평가요항표 요약(사건상세에서만) */
  appraisalNote?: string;
  /** 물건비고(법원 원문) */
  note?: string;
  /** 사건 사진 — base64 또는 저장 경로(사건상세에서만) */
  photos?: string[];
  /** 수집 시점 ISO */
  collectedAt?: string;
};

export type AuctionDetailsData = {
  meta: {
    source: string;
    collectedAt?: string;
    /** 수집한 사건 수 */
    caseCount?: number;
    /** 수집한 물건(목록 줄) 수 — auctions.json 과 맞춰 본다 */
    itemCount?: number;
    /** 왜 비어 있는지·어떻게 채우는지 */
    note?: string;
    /** 수집이 막힌 사유(있으면) */
    blocked?: string | null;
  };
  /** `courtCode|caseNo` → 사건 공통 상세 (물건·목적물 여러 줄이 함께 쓴다) */
  byCase: Record<string, AuctionDetail>;
  /** 물건 id → 물건별 상세(면적·사진 등 사건상세에서만 오는 값) */
  byId: Record<string, AuctionDetail>;
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const AUCTION_DETAILS_URL = `/data/auction-details.json?v=${encodeURIComponent(DATA_VERSION)}`;

let cache: Promise<AuctionDetailsData | null> | null = null;

/**
 * 상세 데이터 — 한 번만 받아 세션 동안 재사용한다.
 *   · 파일이 없거나(404) 형식이 깨졌으면 null. 화면은 그때 "대법원 원문에서 확인" 안내만 남긴다.
 */
export function loadAuctionDetails(): Promise<AuctionDetailsData | null> {
  if (!cache) {
    cache = fetch(AUCTION_DETAILS_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<AuctionDetailsData>;
      })
      .catch(() => null);
  }
  return cache;
}

/** 물건 하나의 상세 — 물건별 상세가 있으면 그것, 없으면 사건 공통 상세 */
export function detailForItem(
  data: AuctionDetailsData | null,
  item: { id: string; courtCode: string; caseNo: string } | null | undefined
): AuctionDetail | undefined {
  if (!data || !item) return undefined;
  return data.byId?.[item.id] ?? data.byCase?.[`${item.courtCode}|${item.caseNo}`];
}
