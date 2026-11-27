// ─────────────────────────────────────────────────────────────────────────────
// 경매 물건 **상세** — `public/data/auction-details.json`
//
//   · 목록 데이터(`auctions.json`)는 대법원 법원경매정보의 **물건검색 결과 한 줄**에서 오므로
//     사건번호·감정가·최저가·기일·유찰·비고까지만 담는다.
//   · 그보다 깊은 정보는 두 곳에서만 나온다.
//       ① **물건상세조회** (`PGJ15BM01` → POST /pgj/pgj15B/selectAuctnCsSrchRslt.on)
//          매각물건 기준 기일이력·물건상태·목적물 면적·대지권·건물표제부·감정평가요항표·사건 사진
//       ② **현황조사서** (`PGJ15BP01` → POST /pgj/pgj15B/selectCurstExmndc.on)
//          임차인현황(보증금·차임·전입일·확정일자)·점유관계·조사일시
//   · 매각물건명세서는 PDF 문서(법원 문서뷰어)라 본문을 긁지 않는다. 문서 ID(`specSheetIds`)와
//     문서뷰어 주소(`specification.viewerUrl`, 수집된 경우)만 담고, 화면은 **원문에서 확인**을
//     안내한다. 명세서 본문 값(최선순위·소멸되지 않는 권리)이 수집돼 있으면 그것만 보여 준다.
//   · `scripts/fetch-auction-details.py` 가 사건·물건 하나당 요청 한 번으로 모아 이 파일을 만든다.
//     파일이 없거나 그 물건이 아직 수집되지 않았으면 화면은 **없는 값을 만들지 않고**
//     "대법원 원문에서 확인" 안내와 사건번호 복사·원문 열기를 보여 준다.
// ─────────────────────────────────────────────────────────────────────────────

/** 회차별 기일 한 줄 — 물건상세의 `gdsDspslDxdyLst` / 사건검색의 `dlt_rletCsGdsDtsDxdyInf` */
export type AuctionScheduleRow = {
  /** 기일 YYYYMMDD */
  date: string;
  /** 기일종류 — 매각기일 · 매각결정기일 등(법원 코드표 AUCTN_DXDY_KND_CD) */
  kind?: string;
  /** 기일장소 */
  place?: string;
  /** 그 회차의 최저매각가격(원) — 물건상세에만 있다 */
  minimum?: number | null;
  /** 기일결과 — 유찰 · 매각 등(법원 코드표 AUCTN_DXDY_RSLT_CD) */
  result?: string;
  /** 기일시각 HHMM */
  time?: string;
};

/** 목록내역 한 줄 — 토지·건물·집합건물 (사건검색의 `dlt_rletCsDspslObjctLst`) */
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

/** 현장 사진 한 장 — 물건상세의 `csPicLst`(base64)를 파일로 저장하고 경로만 담는다 */
export type AuctionPhoto = {
  /** 저장 경로 또는 원본 URL — 예: /data/auction-photos/B000210-2024타경1072-1-01.jpg */
  url: string;
  /** 법원이 붙인 사진 구분명(전경·내부 등) — 있으면 캡션으로 쓴다 */
  caption?: string;
  /** 법원 사진구분 코드 (CORT_AUCTN_PIC_DVS_CD) */
  kind?: string;
};

/**
 * 매각물건명세서 — **본문은 PDF 문서**라 자동 수집하지 않는다.
 *   · 문서 ID와 뷰어 주소만 담고, 본문 값(최선순위·소멸되지 않는 권리·지상권)은
 *     수집된 경우에만 채운다. 없는 값을 추정해 채우지 않는다.
 */
export type AuctionSpecification = {
  /** 작성일 YYYYMMDD (수집된 경우) */
  writtenDate?: string;
  /** 최선순위 설정 원문 — 예: `2021.03.10. 압류` */
  earliestRight?: string;
  /** 매각으로 소멸되지 않는 권리 원문 — 인수 권리 판단의 근거가 되는 문장 그대로 */
  nonExtinguishedRights?: string;
  /** 지상권 여부 — true/false(명세서에 적힌 경우) · null(모름) */
  hasSuperficies?: boolean | null;
  /** 그 밖의 명세서 기재(원문) */
  extra?: string;
  /** 법원 문서뷰어 주소(encParam 포함) — 수집된 경우 바로 열 수 있다 */
  viewerUrl?: string;
  /** 수집 시점 ISO */
  collectedAt?: string;
};

/**
 * 임차인현황 한 줄 — 현황조사서의 `dlt_ordTsLserLtn`
 *   · 이름은 법원이 마스킹한 표기를 그대로 쓴다(가공하지 않는다).
 */
export type AuctionTenant = {
  /** 이해관계인명(법원 표기) */
  name?: string;
  /** 이해관계인 구분 — 임차인·소유자 등 */
  type?: string;
  /** 점유부분(임차부분) */
  part?: string;
  /** 임차용도 */
  usage?: string;
  /** 점유기간 */
  period?: string;
  /** 보증금 내역 원문 — 예: `20,000,000원` */
  deposit?: string;
  /** 차임 내역 원문 — 예: `월 500,000원` */
  rent?: string;
  /** 전입상세(전입일 등) 원문 */
  movedIn?: string;
  /** 확정일자 원문 */
  fixedDate?: string;
  /** 점유 내용 원문 */
  possession?: string;
  /** 임차내역 비고 */
  note?: string;
  /** 소재지(법원 표기) */
  address?: string;
};

/** 점유관계(현황조사서) — 목적물별 조사 결과 */
export type AuctionOccupancy = {
  /** 조사일시 원문 — 예: `2026.10.14 10:30` */
  examinedAt?: string;
  /** 점유관계 구분 — 예: `임차인 점유` (코드표 AUCTN_POSS_RLTN_CD) */
  relation?: string;
  /** 점유 내역 원문(\n 으로 구분) */
  detail?: string;
  /** 부동산의 현황 원문 */
  property?: string;
  /** 현황조사서 기타(임차내역) 원문 */
  etc?: string;
};

/** 감정평가요항표 한 줄 — `aeeWevlMnpntLst` (표제 1~10, 각 표제의 항목) */
export type AuctionAppraisalItem = {
  /** 표제 코드 — AEE_WEVL_MNPNT_TBLT_DVS_CD */
  table?: string;
  /** 표제명 — 코드표에서 확인된 이름(없으면 비운다) */
  tableName?: string;
  /** 항목 코드 — AEE_WEVL_MNPNT_ITM_CD */
  item?: string;
  /** 항목명 */
  itemName?: string;
  /** 항목 내용 원문 */
  text: string;
};

/** 면적 — 목적물 원문에서 뽑아낸 전용·대지권(㎡)과 평 환산 */
export type AuctionArea = {
  /** 전유부분 면적(㎡) */
  exclusiveSqm?: number | null;
  /** 대지권의 목적인 토지 면적(㎡) */
  landSqm?: number | null;
  /** 전용 평 */
  exclusivePy?: number | null;
  /** 대지권 평 */
  landPy?: number | null;
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
  /** 면적·대지권(물건상세에서만) */
  areas?: AuctionAreaRow[];
  /** 면적 요약(전용·대지권 ㎡/평) */
  area?: AuctionArea;
  /** 감정평가요항표 요약(물건상세에서만) */
  appraisalNote?: string;
  /** 감정평가요항표 — 표제·항목별 원문 */
  appraisalSummary?: AuctionAppraisalItem[];
  /** 물건비고(법원 원문) */
  note?: string;
  /** 사건 사진 — 저장 경로 + 캡션 */
  photos?: AuctionPhoto[];
  /** 매각물건명세서 — 문서 ID·뷰어 주소·수집된 본문 값 */
  specification?: AuctionSpecification;
  /** 임차인현황(현황조사서) */
  tenants?: AuctionTenant[];
  /** 점유관계(현황조사서) */
  occupancy?: AuctionOccupancy;
  /** 수집 시점 ISO */
  collectedAt?: string;
};

/** 사건 공통 상세(byCase 레코드) — 목적물 여러 줄이 함께 쓴다 */
export type AuctionCaseDetail = AuctionDetail;
/** 물건별 상세(byId 레코드) */
export type AuctionItemDetail = AuctionDetail;

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
  /** 물건 id → 물건별 상세(면적·사진 등 물건상세에서만 오는 값) */
  byId: Record<string, AuctionDetail>;
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const AUCTION_DETAILS_URL = `/data/auction-details.json?v=${encodeURIComponent(DATA_VERSION)}`;

/** 1평 = 3.305785㎡ (법정 환산계수) */
export const SQM_PER_PY = 3.305785;

/** ㎡ → 평(소수 1자리) */
export function sqmToPy(sqm: number | null | undefined): number | null {
  if (sqm == null || !Number.isFinite(sqm) || sqm <= 0) return null;
  return Math.round((sqm / SQM_PER_PY) * 10) / 10;
}

/**
 * **최저가 기준 대지 평단가** — 재개발·상가 투자에서 가장 먼저 보는 숫자.
 *   · 최저매각가격 ÷ 대지권 평수. 대지권 면적을 모르면 null(추정해서 만들지 않는다).
 *   · 일괄매각은 금액이 전체 기준이므로 그 물건의 대지권 합계로 나눈 값이 된다.
 */
export function landPricePerPy(
  minimum: number | null | undefined,
  landSqm: number | null | undefined
): number | null {
  const py = sqmToPy(landSqm);
  if (!minimum || minimum <= 0 || !py) return null;
  return Math.round(minimum / py);
}

/**
 * 권리 안전도 — **수집된 값만으로** 말할 수 있는 범위에서 다섯 단계로 나눈다.
 *   · risk   : 매각물건명세서에 '매각으로 소멸되지 않는 권리'가 적혀 있다 → 인수 위험
 *   · safe   : 명세서를 확인했고 그런 권리가 없다 → 인수 권리 없음
 *   · check  : 명세서 본문은 없지만 현황조사서에 임차인이 있다 → 인수 여부 확인 필요
 *   · survey : 현황조사서는 확인됐고 임차인이 없다 → 명세서로 최선순위만 확인하면 된다
 *   · none   : 아직 이 물건의 권리 자료가 없다 → 원문 확인
 *   화면은 이 판단을 단정하지 않고 근거(문서명)를 함께 적는다.
 */
export type RightsStatus = {
  level: "risk" | "safe" | "check" | "survey" | "none";
  title: string;
  note: string;
};

/** 점유관계 코드명에 '임차인·제3자 점유'가 들어 있는지 — '미상'은 점유자가 있다는 뜻이 아니다 */
function occupancySuggestsTenant(relation: string | undefined): boolean {
  const r = (relation || "").trim();
  if (!r || r.includes("미상")) return false;
  return r.includes("임차인") || r.includes("제 3 자") || r.includes("제3자");
}

export function rightsStatus(detail: AuctionDetail | undefined | null): RightsStatus {
  const spec = detail?.specification;
  const rights = (spec?.nonExtinguishedRights || "").trim();
  const tenants = detail?.tenants ?? [];
  const occupancy = detail?.occupancy;
  const occRelation = (occupancy?.relation || "").trim();
  const hasSurvey = !!(occupancy?.examinedAt || occRelation || occupancy?.detail);

  if (rights) {
    return {
      level: "risk",
      title: "매수인 인수 권리 있음",
      note: "매각물건명세서에 매각으로 소멸되지 않는 권리가 적혀 있습니다. 대항력 임차인·지상권 등 인수 범위를 확인하세요.",
    };
  }
  if (spec && (spec.earliestRight || spec.writtenDate || spec.hasSuperficies != null)) {
    return {
      level: "safe",
      title: "인수 권리 없음",
      note: "매각물건명세서에 매각으로 소멸되지 않는 권리가 없습니다.",
    };
  }
  if (tenants.length > 0) {
    return {
      level: "check",
      title: `임차인 ${tenants.length}명 — 인수 여부 확인 필요`,
      note: "현황조사서에 임차인 기재가 있습니다. 매각물건명세서의 대항력 여부를 확인하세요.",
    };
  }
  if (hasSurvey) {
    const occ = occRelation || (occupancySuggestsTenant(occRelation) ? "점유자 있음" : "점유관계 미상");
    return {
      level: "survey",
      title: "현황조사서 확인 · 임차인 없음",
      note: `현황조사서에 임차인 기재가 없습니다(점유관계 ${occ}). 명세서로 소멸되지 않는 권리만 확인하면 됩니다.`,
    };
  }
  return {
    level: "none",
    title: "권리분석 자료 없음",
    note: "매각물건명세서·현황조사서가 아직 수집되지 않았습니다. 입찰 전 원문을 확인하세요.",
  };
}

/** 사진 배열 정규화 — 예전 형식(문자열 URL)도 받아 준다 */
export function normalizePhotos(photos: (AuctionPhoto | string)[] | undefined | null): AuctionPhoto[] {
  if (!photos?.length) return [];
  return photos
    .map((p) => (typeof p === "string" ? { url: p } : p))
    .filter((p): p is AuctionPhoto => !!p && !!p.url);
}

/**
 * 사건 공통 상세 + 물건별 상세를 **한 레코드로 합친다**.
 *   · 물건별 값이 있으면 그것을, 없으면 사건 공통 값을 쓴다(빈 배열·빈 문자열은 없는 것으로 본다).
 *   · 화면은 이 결과 하나만 보면 된다.
 */
export function mergeDetails(
  caseDetail: AuctionDetail | undefined,
  itemDetail: AuctionDetail | undefined
): AuctionDetail | undefined {
  if (!caseDetail && !itemDetail) return undefined;
  if (!caseDetail) return itemDetail;
  if (!itemDetail) return caseDetail;
  const merged: AuctionDetail = { ...caseDetail, ...itemDetail };
  const pick = <T,>(a: T[] | undefined, b: T[] | undefined) =>
    (a?.length ? a : b?.length ? b : a ?? b);
  merged.photos = pick(itemDetail.photos, caseDetail.photos);
  merged.tenants = pick(itemDetail.tenants, caseDetail.tenants);
  merged.appraisalSummary = pick(itemDetail.appraisalSummary, caseDetail.appraisalSummary);
  merged.lists = pick(itemDetail.lists, caseDetail.lists);
  merged.areas = pick(itemDetail.areas, caseDetail.areas);
  merged.schedules = { ...(caseDetail.schedules || {}), ...(itemDetail.schedules || {}) };
  merged.itemStatus = { ...(caseDetail.itemStatus || {}), ...(itemDetail.itemStatus || {}) };
  merged.specSheetIds = { ...(caseDetail.specSheetIds || {}), ...(itemDetail.specSheetIds || {}) };
  merged.specification = itemDetail.specification ?? caseDetail.specification;
  merged.occupancy = itemDetail.occupancy ?? caseDetail.occupancy;
  merged.area = itemDetail.area ?? caseDetail.area;
  return merged;
}

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

/** 물건 하나의 상세 — 사건 공통 + 물건별을 합쳐서 돌려준다 */
export function detailForItem(
  data: AuctionDetailsData | null,
  item: { id: string; courtCode: string; caseNo: string } | null | undefined
): AuctionDetail | undefined {
  if (!data || !item) return undefined;
  return mergeDetails(data.byCase?.[`${item.courtCode}|${item.caseNo}`], data.byId?.[item.id]);
}
