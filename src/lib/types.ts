// ─────────────────────────────────────────────────────────────────────────────
// 도메인 타입 — 재개발 플랫폼 MVP
// 가격·금액 단위는 모두 "만원". 면적 단위는 ㎡.
// ─────────────────────────────────────────────────────────────────────────────

/** 사업 유형 (재개발닷컴/갈타맵 유사 분류) */
export type ZoneType = "신통기획" | "모아타운" | "도공복" | "일반재개발";

/** 지도 색상 분류 — 대표 구역 4분류 + 서울시 전수 지도용 가로주택·소규모 */
export type MapZoneType = ZoneType | "가로주택" | "소규모";

/** 서울시 도시계획사업(서울플랜+) 공식 레코드 — 구역 경계·면적·추진단계의 근거 */
export type ZoneOfficial = {
  sourceId: string; // 서울 열린데이터광장 PRESENT_SN
  name: string; // 고시 명칭
  kind: string; // 사업유형 소분류 (예: 재정비촉진구역)
  stage: string; // 추진단계 (예: 사업시행인가)
  area: number; // 구역면적 고시값 (㎡)
  asOf: string; // 데이터 기준일
  /** 경계 도형 출처 — UQ181(의제처리구역)이면 필지 경계형 정밀 도형 */
  geomSource?: string;
  geomSourceName?: string;
  geomAsOf?: string;
};

/** 추진 단계 (순서대로 진행). stageOrder가 클수록 뒤 단계 */
export type ZoneStage =
  | "추진위원회"
  | "사업계획승인"
  | "관리처분"
  | "이주·철거"
  | "착공"
  | "준공";

export const STAGE_ORDER: Record<ZoneStage, number> = {
  추진위원회: 1,
  사업계획승인: 2,
  관리처분: 3,
  "이주·철거": 4,
  착공: 5,
  준공: 6,
};

/** 구역(정비구역) */
export type Zone = {
  id: string;
  name: string;
  district: string; // 자치구 (예: 관악구)
  type: ZoneType;
  stage: ZoneStage;
  /** 사업개요 */
  households: number; // 총 세대수
  ratioEstimate: number; // 추정 비례율 (%)
  constructor: string; // 시공사 (미정이면 "미정")
  /** 재개발뷰 스타일 뱃지 */
  residenceRequired: boolean; // 실거주 의무
  toehoApplied: boolean; // 토허제 적용
  moveInEstimate: string; // 예상 입주 구간 (예: "2031~2033")
  /** 추진 경과 타임라인 — 고시/공고 근거 링크 자리 */
  timeline: { date: string; label: string; sourceUrl?: string }[];
  /** 지도 폴리곤 (위도, 경도) — 서울시 도시계획사업 실경계(EPSG:5174→WGS84) */
  polygon: [number, number][];
  center: [number, number];
  /** 폴리곤 보조 링(여러 필지로 나뉜 구역) */
  parts?: [number, number][][];
  /** 서울시 고시 데이터 매칭 정보 */
  official?: ZoneOfficial;
  /** 요약 지표 (listing/transaction에서 파생 계산도 가능하지만 캐시용으로 보관) */
  lowestPrice?: number; // 최저 매매가 (만원)
  lowestInitialInvestment?: number; // 최저 초기투자금 (만원)
  summary: string;
};

/** 구역 내 실거래가 */
export type Transaction = {
  id: string;
  zoneId: string;
  date: string; // YYYY-MM
  kind: "아파트" | "오피스텔" | "다세대";
  dong: string; // 동/호 정보
  areaSqm: number; // 전용 ㎡
  floor: number;
  price: number; // 거래금액 (만원)
  landShareSqm: number; // 대지권면적 ㎡ (대지지분)
  officialLandValue: number; // 거래시점 공시지가 기준 토지가 (만원) — 배수 계산용
};

/** 중개사 매물 (유료 등록) */
export type Listing = {
  id: string;
  zoneId: string;
  brokerName: string; // 중개사명
  brokerAgency: string; // 중개사무소
  brokerPhone: string; // 직통 (검증 열람권 구매 시 공개)
  brokerLicense: string; // 개설등록번호
  unitType: string; // 희망 타입 예: "84D", "59A", "일반매물"
  salePrice: number; // 매매가 (만원)
  appraisedValue: number; // 감정평가액 (만원)
  premium?: number; // 프리미엄 (만원) — 매매가 중 감정가 초과분
  transferFeeIncluded: boolean; // 불하금 포함 여부
  transferFee?: number; // 불하금 (만원)
  expectedJeonse: number; // 예상 전세/보증금 회수액 (만원)
  expectedAdditionalCost: number; // 예상 추가분담금 (만원, 추정)
  note?: string;
  verified: boolean; // 검증 매물 여부
  createdAt: string;
};

/** 브로커 요금제 */
export type BrokerPlan = {
  id: "single" | "monthly";
  name: string;
  price: number; // 만원
  description: string;
  features: string[];
};

export const BROKER_PLANS: BrokerPlan[] = [
  {
    id: "single",
    name: "단건 등록권",
    price: 9,
    description: "매물 1건 등록 (30일 게시)",
    features: ["매물 1건 등록", "30일 게시", "구역 페이지 상단 노출 기회"],
  },
  {
    id: "monthly",
    name: "월 무제한 구좌",
    price: 29,
    description: "한 달간 매물 무제한 등록 + 검증 뱃지",
    features: [
      "매물 무제한 등록",
      "검증 매물 뱃지",
      "매수자 열람 리포트 제공",
      "전화 연결 우선 노출",
    ],
  },
];

/** 매수자 열람권 */
export const UNLOCK_PRICE = 3; // 만원 / 매물 1건

// ─── 파생 계산 (실무 계산 근거를 코드로 명시) ────────────────────────────────

/** 취득세·등기·중개보수 등 부대비용 추정: 매매가의 2% */
export const EST_OTHER_COST_RATE = 0.02;

/** 초기투자금 = 매매가 + (불하금 포함 시) 불하금 + 부대비용(2%) */
export function calcInitialInvestment(l: Listing): number {
  const transfer = l.transferFeeIncluded ? (l.transferFee ?? 0) : 0;
  return Math.round(l.salePrice + transfer + l.salePrice * EST_OTHER_COST_RATE);
}

/** 추정 권리가액 = 매매가 − 감정평가액 (감정가 대비 프리미엄) */
export function calcImpliedRights(l: Listing): number {
  return l.salePrice - l.appraisedValue;
}

/** 총 소요자금 = 초기투자금 + 예상 추가분담금 − 전세 보증금 회수액 */
export function calcTotalRequired(l: Listing): number {
  return calcInitialInvestment(l) + l.expectedAdditionalCost - l.expectedJeonse;
}

/** 공시지가 배수 = 거래금액 ÷ 대지지분 기준 공시지가 */
export function calcMultiple(t: Transaction): number {
  if (!t.landShareSqm || !t.officialLandValue) return 0;
  return Number((t.price / t.officialLandValue).toFixed(1));
}
