// ─────────────────────────────────────────────────────────────────────────────
// 도메인 타입 — 재개발 플랫폼 MVP
// 가격·금액 단위는 모두 "만원". 면적 단위는 ㎡.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 사업 유형 (정비사업 유형 분류)
 *   · 재건축 = 서울플랜+ 소분류 재건축(단독·공동). 아파트 단지 재건축은 재개발과 사업 절차·권리가
 *     달라 지도·뱃지·필터에서 따로 보여야 한다(2026-11-23 분리).
 */
export type ZoneType = "재건축" | "신통기획" | "모아타운" | "도공복" | "일반재개발" | "공공재개발" | "지주택";

/**
 * 지주택 — 지역주택조합이 지구단위계획구역으로 지정받아 추진하는 공동주택 사업.
 *   · 정비구역(정비사업)이 아니라 지구단위계획구역이라 서울시 정비사업 데이터에는 잡히지 않는다.
 *   · 추진 순서도 달라서(조합원 모집 → 지구단위계획 결정 → 조합설립인가 → 사업계획승인) 정비사업과
 *     같은 유형으로 묶으면 사다리·단계가 어긋난다. 그래서 따로 둔다(예: 광진구 자양동 548).
 */

/**
 * 민간도심복합개발사업 — 도심복합개발(도공복의 민간판)로, 사업 방식에 따라 두 유형으로 나뉜다.
 *   · 성장거점형: 역세권·중심지 등 성장거점에 업무·상업·주거를 복합으로 얹는 유형
 *   · 주거중심형: 주거 공급이 목적인 유형
 * 지도에서는 두 유형을 한 사업(빨강 계열)의 진한/연한 색으로 나눠 보여준다.
 */
export type PrivateComplexType = "민간도심복합(성장거점형)" | "민간도심복합(주거중심형)";

/**
 * 모아타운통합기획 — 서울시가 2026년 도입한 모아타운의 통합기획 방식.
 *   · 모아타운에 공공 계획지원을 결합한 갈래로, 착공까지 약 6년 걸리던 모아타운을 4년 6개월로 줄이는 것이 목표다.
 *   · 서울시 소분류는 '모아타운(모아통합기획)' 이고, 1호는 서초 양재동 397-1 일대(2026-11-19 연번부여)다.
 *   · 서울시 고시 데이터에는 아직 모아타운으로 들어오므로, 이 유형은 관리자 그리기에서 모아타운과
 *     따로 고를 수 있게 둔 것이다(색은 모아타운과 같은 계열을 쓴다).
 */
export type MoaIntegrationType = "모아타운통합기획";

/** 지도 색상 분류 — 재건축 + 대표 구역 4분류 + 서울시 전수 지도용 가로주택·소규모·역세권·장기전세 + 민간도심복합 2유형 + 모아타운통합기획 */
export type MapZoneType =
  | ZoneType
  | "가로주택"
  | "소규모"
  | "역세권"
  | "장기전세"
  | PrivateComplexType
  | MoaIntegrationType;

/**
 * 구역 안을 둘로 나누는 점선 — 모아통합기획의 '사업예정구역 1·2' 처럼 도면에 보라 점선으로 그어진 선.
 *   · 구역은 하나로 두고(클릭·검색·매물 연결은 그대로) 지도 위에 점선만 얹어 도면 표기를 살린다.
 *   · coords 는 [위도, 경도] 꼭짓점 — 보통 구역 경계에서 경계까지 두 점.
 *   · labels 는 점선이 나누는 하위 구역 이름표 자리(없으면 선만 긋는다).
 */
export type ZoneDivider = {
  coords: [number, number][];
  labels?: { text: string; at: [number, number] }[];
};

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
  /** 실거주·토허제 뱃지 */
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
  /** 구역 안에서 빼낸 시설(성당·공원 등) — GeoJSON inner ring, 이 안은 구역 밖 */
  holes?: [number, number][][];
  /** 구역 안을 나누는 점선(사업예정구역 1·2 등) — 지도에 보라 점선으로 긋는다 */
  dividers?: ZoneDivider[];
  /** 서울시 고시 데이터 매칭 정보 */
  official?: ZoneOfficial;
  /** 요약 지표 (listing/transaction에서 파생 계산도 가능하지만 캐시용으로 보관) */
  lowestPrice?: number; // 최저 매매가 (만원)
  lowestInitialInvestment?: number; // 최저 초기투자금 (만원)
  /** 토지등소유자 동의율(%) — 없으면 상세 패널이 '미공개'로 보여 준다(0%와 다른 상태) */
  consentRate?: number | null;
  /** 동의율 기준일 — "YYYY-MM-DD" 또는 "YYYY-MM" */
  consentDate?: string;
  /** 동의율 비고(진행 경과·출처) */
  consentNote?: string;
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

/**
 * 거래형태 — 공인중개사법 중개대상물 표시·광고 명시사항 ①
 *   · 매매: salePrice = 매매가, deposit = 기보증금(초기투자금 계산에 쓰인다)
 *   · 전세: salePrice = 전세보증금 (deposit 은 쓰지 않는다)
 *   · 월세: salePrice = 보증금, monthlyRent = 월세
 *   · 값이 없는 예전 매물은 매매로 본다(`listingTradeType`).
 */
export type ListingTradeType = "매매" | "전세" | "월세";

/**
 * 중개사 매물 (검증 매물 · 등록 매물)
 *
 * ▶ 재개발 실무 필드
 *    · 매매가 = 조합원 지위(입주권) 매매가. 여기서 **기보증금**을 빼면 매수자가 실제로 내는 돈이 된다.
 *    · `deposit`(기보증금)과 옛 필드 `expectedJeonse`(예상 전세 보증금 회수액)는 같은 자리의 값이다
 *      — 기존 샘플 매물이 쓰던 이름을 지우지 않고, 새 매물은 `deposit`으로 적는다.
 *    · `leaseOperatorOnly`(임대사업자 승계 필수) · `landPermitRequired`(토지거래허가구역/실거주 의무)는
 *      지방 투자자가 가장 먼저 거르는 조건이라 매물에 붙여 둔다.
 *
 * ▶ 호환성
 *    · 예전 `Listing`은 감정평가액·불하금·추가분담금이 필수였다. 검증 매물 JSON처럼 그 값이 없는
 *      매물도 담을 수 있도록 **선택 필드**로 바꿨다(값이 없으면 계산·표시에서 0/미입력으로 다룬다).
 */
export type Listing = {
  id: string;
  zoneId: string;
  /** 구역명 — zones.geojson 의 이름. zoneId 가 맞지 않는 저장분·직접 입력 매물은 이름으로 찾는다 */
  zoneName?: string;
  /** 자치구 (예: 동작구) */
  gu?: string;
  /** 매물 종류 — 다세대/도시형, 단독/다가구, 아파트, 상가주택, 오피스텔 */
  propertyType?: string;
  brokerName: string; // 중개사명
  brokerAgency: string; // 중개사무소
  brokerPhone: string; // 직통 (검증 열람권 구매 시 공개)
  brokerLicense?: string; // 개설등록번호
  unitType: string; // 희망 타입 예: "84D", "59A", "전용 29.18㎡ (404호)"
  salePrice: number; // 매매가 (만원)
  appraisedValue?: number; // 감정평가액 (만원)
  premium?: number; // 프리미엄 (만원) — 매매가 중 감정가 초과분
  transferFeeIncluded?: boolean; // 불하금 포함 여부
  transferFee?: number; // 불하금 (만원)
  /** 기보증금 (만원) — 초기투자금 = 매매가 − 기보증금 */
  deposit?: number;
  expectedJeonse?: number; // 예상 전세/보증금 회수액 (만원) — 기존 샘플 필드(deposit 과 같은 자리)
  expectedAdditionalCost?: number; // 예상 추가분담금 (만원, 추정)
  /** 전용면적 (㎡) */
  exclusiveAreaSqm?: number;
  /** 대지지분 (㎡) */
  landShareSqm?: number;
  /** 임대사업자 승계 필수 여부 — 임대사업자만 승계해 매수할 수 있는 물건 */
  leaseOperatorOnly?: boolean;
  /** 토지거래허가구역(실거주 의무) 해당 여부 — false 면 실거주·토허제에서 자유롭다 */
  landPermitRequired?: boolean;
  note?: string; // 매물 핵심 특징
  verified: boolean; // 검증 매물 여부
  createdAt?: string;

  // ── 중개대상물 표시·광고 명시사항 (공인중개사법 시행규칙 제25조) ──────────────
  //   · 모두 선택 필드다 — 예전에 등록된 매물·부동산포스에서 옮긴 매물은 이 값이 없고,
  //     화면은 없는 항목을 '-'(미입력)으로 둔다(값을 지어내지 않는다).
  //   · DB(public.listings)에는 이 컬럼들이 없다 → lib/listing-extra.ts 가 note 끝의
  //     표식 한 줄(⟦매물정보⟧{...})로 함께 저장하고, 읽을 때 다시 풀어놓는다.
  /** 소재지 — 지번 주소 전체 (예: 서울특별시 동작구 상도동 209-12) */
  address?: string;
  /** 도로명 주소 (예: 서울특별시 동작구 장승배기로 1) */
  addressRoad?: string;
  /** 소재지 비공개 — 켜면 카드에 '○○동 (번지 비공개)'로 보인다 */
  addressHidden?: boolean;
  /** 필지고유번호 19자리 — 건축물대장 조회 근거 */
  pnu?: string;
  /** 매물 위치 좌표 [위도, 경도] — 주소 검색으로 고른 필지의 중심 */
  lat?: number;
  lng?: number;
  /** 거래형태 (기본 매매) */
  tradeType?: ListingTradeType;
  /** 월세 (만원) — tradeType 이 '월세'일 때 */
  monthlyRent?: number;
  /** 해당층 — '3'·'3층'·'반지하'·'옥탑' */
  floor?: string;
  /** 총층수 — '5'·'5층' */
  totalFloors?: string;
  /** 방 수 */
  rooms?: number;
  /** 욕실 수 */
  baths?: number;
  /** 방향 — 주실(거실·안방) 기준. '남향'·'남동향' 등 */
  direction?: string;
  /** 입주가능일 — '즉시입주' | '협의' | 'YYYY-MM-DD' */
  moveIn?: string;
  /** 주차 — '세대당 1대'·'가능(2대)'·'불가' */
  parking?: string;
  /** 사용승인일 — 'YYYY-MM-DD' (건축물대장 표제부) */
  approvalDate?: string;
  /** 관리비 — '5만원 (수도·전기 별도)'·'없음' */
  maintenanceFee?: string;
  /** 대지면적 (㎡) — 건축물대장 표제부. 대지지분(landShareSqm)과 다른 값이다 */
  platAreaSqm?: number;
  /** 건물명 — 건축물대장 표제부 (예: 다원씨앤아이) */
  buildingName?: string;
  /** 중개사무소 소재지 */
  brokerAddress?: string;
  /** 중개사무소 대표자 */
  brokerCeo?: string;

  // ── 부동산포스(rfine.kr) 매물등록 양식의 건물·거래 항목 ────────────────────────
  //   · 부동산포스 등록 폼이 받는 항목을 그대로 옮겼다(2026-11-27 개편).
  //   · 모두 선택 필드다 — 값이 없으면 화면이 그 줄을 그리지 않는다(값을 지어내지 않는다).
  /** 공급면적 (㎡) — 계약면적·분양면적 */
  supplyAreaSqm?: number;
  /**
   * 융자금 (만원)
   *   · undefined = 표시 안 함(부동산포스 '표시안함')
   *   · 0 = 융자금 없음('융자금없음')
   *   · 1 이상 = 융자금 금액
   *   매수자가 승계하는 채무라 초기투자금(매매가−기보증금)과는 별도로 보여 준다.
   */
  mortgage?: number;
  /** 기월세 (만원) — 매매 시 함께 승계하는 임차인의 월세(기보증금과 짝) */
  tenantMonthlyRent?: number;
  /** 이주비 (만원) — 재개발 조합이 지급하는 이주비. 초기투자금 계산에는 넣지 않는다(지급 시점이 따로다) */
  relocationCost?: number;
  /** 이주비가 무이자인가 — false 면 유이자(이자 부담은 임차인·조합원 몫) */
  relocationCostFree?: boolean;
  /** 현관구조 — '계단식'·'복도식'·'복합식'·'기타' */
  entranceType?: string;
  /** 난방방식 — '개별난방'·'중앙난방'·'지역난방' */
  heating?: string;
  /** 엘리베이터 — '있음'·'없음' */
  elevator?: string;
  /** 위반건축물 — '해당 없음'·'위반건축물 있음'·'확인 필요' (건축물대장 확인 결과) */
  violation?: string;
  /** 상세 설명 — note(핵심 특징 한 줄)와 달리 길게 쓰는 매물 설명 */
  description?: string;
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

/** 매물의 거래형태 — 값이 없는 예전 매물은 매매 */
export function listingTradeType(l: Listing): ListingTradeType {
  return l.tradeType ?? "매매";
}

/**
 * 매수자가 처음에 들고 가야 하는 돈.
 *   · 매매: 초기투자금 = 매매가 − 기보증금 (+ 불하금 포함 시)
 *   · 전세: 전세보증금, 월세: 보증금 — 매매가−기보증금 공식이 성립하지 않으므로 금액을 그대로 쓴다.
 */
export function listingUpfrontCash(l: Listing): number {
  const t = listingTradeType(l);
  if (t === "매매") return calcInitialInvestment(l);
  return Math.max(0, Math.round(l.salePrice));
}

/** 매물의 기보증금 — 새 필드 `deposit`, 없으면 옛 필드 `expectedJeonse` */
export function listingDeposit(l: Listing): number {
  return l.deposit ?? l.expectedJeonse ?? 0;
}

/**
 * 초기투자금 = 매매가 − 기보증금(또는 예상 전세) + (불하금 포함 시) 불하금
 *   · 재개발 입주권 매매에서 매수자가 실제로 준비하는 현금이다.
 *     매매가 7.8억 · 기보증금 2.77억 → 5.03억 (상도23구역 다원씨앤아이 404호).
 *   · 취득세·법무·중개보수는 별도다(`EST_OTHER_COST_RATE`) — 초기투자금에 섞으면 실무 계산과 어긋난다.
 */
export function calcInitialInvestment(l: Listing): number {
  const transfer = l.transferFeeIncluded ? (l.transferFee ?? 0) : 0;
  return Math.max(0, Math.round(l.salePrice - listingDeposit(l) + transfer));
}

/** 추정 권리가액 = 매매가 − 감정평가액 (감정가 대비 프리미엄). 감정가가 없으면 0 */
export function calcImpliedRights(l: Listing): number {
  return l.appraisedValue ? l.salePrice - l.appraisedValue : 0;
}

/** 총 소요자금 = 초기투자금 + 취득 부대비용(2%) + 예상 추가분담금 */
export function calcTotalRequired(l: Listing): number {
  return Math.round(
    calcInitialInvestment(l) + l.salePrice * EST_OTHER_COST_RATE + (l.expectedAdditionalCost ?? 0)
  );
}

/** 공시지가 배수 = 거래금액 ÷ 대지지분 기준 공시지가 */
export function calcMultiple(t: Transaction): number {
  if (!t.landShareSqm || !t.officialLandValue) return 0;
  return Number((t.price / t.officialLandValue).toFixed(1));
}
