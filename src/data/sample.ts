// ─────────────────────────────────────────────────────────────────────────────
// 샘플 데이터 — 서울 주요 정비구역
//
// · 구역 경계(polygon/center)는 서울시 공식 실경계를 EPSG:5174 → WGS84로 변환한 값이다.  → src/data/zones-geo.json
//   - 사업유형·추진단계·고시면적: 「서울시 도시계획사업 현황(서울플랜+)」 OA-22712 (기준 2026-09)
//   - 경계 도형: 같은 구역이 「서울시 의제처리구역 위치정보」 OA-20957(UQ181, 기준 2026-09)에
//     더 정밀한 필지 경계형 도형으로 있으면 그 도형을 쓴다(예: 성수전략2구역 10점→125점).
// · 세대수·비례율·시공사·입주시기·거래·매물은 서비스 구조 검증용 샘플이다.
//   (각 구역의 공식 명칭·사업유형·추진단계·면적은 zone.official에 원본 그대로 보관)
// ─────────────────────────────────────────────────────────────────────────────
import type { Transaction, Zone, Listing } from "@/lib/types";
import zoneGeo from "@/data/zones-geo.json";

type ZoneGeo = {
  id: string;
  sourceId: string;
  name: string;
  area: number; // 고시 구역면적(㎡)
  stage: string; // 서울시 추진단계
  kind: string; // 서울시 사업유형(소분류)
  asOf?: string;
  center: [number, number];
  polygon: [number, number][];
  parts?: [number, number][][];
  geomSource?: string;
  geomSourceName?: string;
  geomAsOf?: string;
};

/** 폴리곤·중심좌표 단일 출처: src/data/zones-geo.json (서울시 실경계 + 고시 메타) */
function geo(id: string) {
  const g = (zoneGeo as unknown as ZoneGeo[]).find((z) => z.id === id)!;
  return {
    polygon: g.polygon,
    center: g.center,
    ...(g.parts ? { parts: g.parts } : {}),
    official: {
      sourceId: g.sourceId,
      name: g.name,
      kind: g.kind,
      stage: g.stage,
      area: g.area,
      asOf: g.asOf ?? "",
      ...(g.geomSource ? { geomSource: g.geomSource } : {}),
      ...(g.geomSourceName ? { geomSourceName: g.geomSourceName } : {}),
      ...(g.geomAsOf ? { geomAsOf: g.geomAsOf } : {}),
    },
  };
}

export const ZONES: Zone[] = [
  {
    id: "sillim-1",
    name: "신림1구역",
    district: "관악구",
    type: "신통기획",
    stage: "관리처분",
    households: 4185,
    ratioEstimate: 57.8,
    constructor: "GS·현대·DL 컨소시엄",
    residenceRequired: true,
    toehoApplied: false,
    moveInEstimate: "2031~2033",
    timeline: [
      { date: "2020-06", label: "신속통합기획(신통기획) 1호 사업지 선정", sourceUrl: "https://news.seoul.go.kr/citybuild/archives/540452" },
      { date: "2022-08", label: "정비계획 변경 결정·고시", sourceUrl: "https://mediahub.seoul.go.kr/archives/2005021" },
      { date: "2025-03", label: "사업시행계획 인가 (4,185가구)", sourceUrl: "https://www.housingherald.co.kr/news/articleView.html?idxno=49804" },
    ],
    ...geo("sillim-1"),
    lowestPrice: 58000,
    lowestInitialInvestment: 59900,
    summary: "신림선 서울대벤처타운역 역세권, 22.3만㎡ 규모. 신통기획 1호 사업지.",
  },
  {
    id: "banpo-1",
    name: "반포주공1단지 3주구",
    district: "서초구",
    type: "일반재개발",
    stage: "착공",
    households: 3060,
    ratioEstimate: 44.9,
    constructor: "미정",
    residenceRequired: false,
    toehoApplied: false,
    moveInEstimate: "2029~2031",
    timeline: [
      { date: "2026-09", label: "서울시 도시계획사업 데이터 기준 (착공 단계·11.7만㎡)", sourceUrl: "https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do" },
    ],
    ...geo("banpo-1"),
    lowestPrice: 128000,
    lowestInitialInvestment: 130560,
    summary: "한강변 반포주공1단지 재건축 3주구. 대단지 고가권 대표 구역.",
  },
  {
    id: "noryangjin",
    name: "노량진 제1구역",
    district: "동작구",
    type: "일반재개발",
    stage: "관리처분",
    households: 2140,
    ratioEstimate: 55.0,
    constructor: "대우건설(예정)",
    residenceRequired: false,
    toehoApplied: false,
    moveInEstimate: "2032~2034",
    timeline: [
      { date: "2026-09", label: "서울시 도시계획사업 데이터 기준 (재정비촉진구역·관리처분계획인가·132,187㎡)", sourceUrl: "https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do" },
    ],
    ...geo("noryangjin"),
    lowestPrice: 74000,
    lowestInitialInvestment: 75480,
    summary: "노량진역 인근 13.2만㎡ 재정비촉진구역. 관리처분계획인가 완료 단계.",
  },
  {
    id: "hannam",
    name: "한남뉴타운",
    district: "용산구",
    type: "일반재개발",
    stage: "이주·철거",
    households: 1630,
    ratioEstimate: 62.5,
    constructor: "현대건설",
    residenceRequired: true,
    toehoApplied: false,
    moveInEstimate: "2030~2031",
    timeline: [
      { date: "2022-11", label: "통합정비구역 지정 고시", sourceUrl: "#" },
      { date: "2024-05", label: "사업시행계획 인가", sourceUrl: "#" },
      { date: "2025-03", label: "관리처분계획 인가", sourceUrl: "#" },
      { date: "2026-04", label: "이주·철거 착수", sourceUrl: "#" },
    ],
    ...geo("hannam"),
    lowestPrice: 165000,
    lowestInitialInvestment: 168300,
    summary: "용산 국제업무지구 배후 주거지. 한남동 고가 구역.",
  },
  {
    id: "seongsu",
    name: "성수전략2구역",
    district: "성동구",
    type: "일반재개발",
    stage: "착공",
    households: 2980,
    ratioEstimate: 60.2,
    constructor: "포스코이앤씨",
    residenceRequired: false,
    toehoApplied: true,
    moveInEstimate: "2029~2030",
    timeline: [
      { date: "2021-08", label: "정비구역 지정 고시", sourceUrl: "#" },
      { date: "2023-09", label: "사업시행계획 인가", sourceUrl: "#" },
      { date: "2025-01", label: "관리처분계획 인가", sourceUrl: "#" },
      { date: "2026-06", label: "착공", sourceUrl: "#" },
    ],
    ...geo("seongsu"),
    lowestPrice: 96000,
    lowestInitialInvestment: 97920,
    summary: "성수역 이남 주택정비형 재개발 정비구역. 경계는 서울시 의제처리구역(UQ181) 실경계 — 필지선을 따라간다.",
  },
  {
    id: "bukahyeon",
    name: "북아현 주공1차",
    district: "서대문구",
    type: "모아타운",
    stage: "추진위원회",
    households: 1560,
    ratioEstimate: 53.5,
    constructor: "미정",
    residenceRequired: true,
    toehoApplied: false,
    moveInEstimate: "2034~2036",
    timeline: [
      { date: "2024-11", label: "모아타운 후보지 검토 대상", sourceUrl: "#" },
      { date: "2026-02", label: "추진위원회 구성 승인", sourceUrl: "#" },
    ],
    ...geo("bukahyeon"),
    lowestPrice: 47000,
    lowestInitialInvestment: 47940,
    summary: "홍제역 인근 주공1차 재건축. 모아타운 추진 검토 구역.",
  },
];

export const TRANSACTIONS: Transaction[] = [
  // 신림1구역 — 84D 중심
  { id: "t1", zoneId: "sillim-1", date: "2026-10", kind: "아파트", dong: "101동 8층", areaSqm: 84.9, floor: 8, price: 64000, landShareSqm: 32.1, officialLandValue: 8900 },
  { id: "t2", zoneId: "sillim-1", date: "2026-10", kind: "아파트", dong: "102동 3층", areaSqm: 59.3, floor: 3, price: 47000, landShareSqm: 22.4, officialLandValue: 6300 },
  { id: "t3", zoneId: "sillim-1", date: "2026-09", kind: "아파트", dong: "103동 12층", areaSqm: 84.9, floor: 12, price: 66500, landShareSqm: 32.1, officialLandValue: 8900 },
  { id: "t4", zoneId: "sillim-1", date: "2026-09", kind: "아파트", dong: "101동 2층", areaSqm: 84.9, floor: 2, price: 58000, landShareSqm: 32.1, officialLandValue: 8900 },
  { id: "t5", zoneId: "sillim-1", date: "2026-08", kind: "오피스텔", dong: "B동 5층", areaSqm: 39.6, floor: 5, price: 32000, landShareSqm: 0, officialLandValue: 0 },
  // 반포주공1단지 3주구
  { id: "t6", zoneId: "banpo-1", date: "2026-10", kind: "아파트", dong: "201동 5층", areaSqm: 114.2, floor: 5, price: 172000, landShareSqm: 46.8, officialLandValue: 31500 },
  { id: "t7", zoneId: "banpo-1", date: "2026-09", kind: "아파트", dong: "202동 11층", areaSqm: 84.9, floor: 11, price: 139000, landShareSqm: 34.7, officialLandValue: 23400 },
  { id: "t8", zoneId: "banpo-1", date: "2026-08", kind: "아파트", dong: "203동 3층", areaSqm: 59.4, floor: 3, price: 128000, landShareSqm: 29.1, officialLandValue: 19800 },
  // 노량진
  { id: "t9", zoneId: "noryangjin", date: "2026-10", kind: "아파트", dong: "301동 7층", areaSqm: 84.6, floor: 7, price: 82000, landShareSqm: 30.4, officialLandValue: 14200 },
  { id: "t10", zoneId: "noryangjin", date: "2026-09", kind: "아파트", dong: "302동 2층", areaSqm: 74.3, floor: 2, price: 74000, landShareSqm: 26.8, officialLandValue: 12600 },
  { id: "t11", zoneId: "noryangjin", date: "2026-08", kind: "다세대", dong: "사동 4층", areaSqm: 49.5, floor: 4, price: 52000, landShareSqm: 0, officialLandValue: 0 },
  // 한남
  { id: "t12", zoneId: "hannam", date: "2026-10", kind: "아파트", dong: "401동 6층", areaSqm: 114.8, floor: 6, price: 228000, landShareSqm: 52.1, officialLandValue: 46800 },
  { id: "t13", zoneId: "hannam", date: "2026-09", kind: "아파트", dong: "402동 14층", areaSqm: 134.5, floor: 14, price: 265000, landShareSqm: 61.2, officialLandValue: 46800 },
  { id: "t14", zoneId: "hannam", date: "2026-08", kind: "아파트", dong: "403동 3층", areaSqm: 84.7, floor: 3, price: 165000, landShareSqm: 38.5, officialLandValue: 33400 },
  // 성수
  { id: "t15", zoneId: "seongsu", date: "2026-10", kind: "아파트", dong: "501동 10층", areaSqm: 101.8, floor: 10, price: 118000, landShareSqm: 38.2, officialLandValue: 21300 },
  { id: "t16", zoneId: "seongsu", date: "2026-09", kind: "아파트", dong: "502동 4층", areaSqm: 84.8, floor: 4, price: 96000, landShareSqm: 31.7, officialLandValue: 17600 },
  { id: "t17", zoneId: "seongsu", date: "2026-07", kind: "아파트", dong: "503동 7층", areaSqm: 84.8, floor: 7, price: 103500, landShareSqm: 31.7, officialLandValue: 17600 },
  // 북아현
  { id: "t18", zoneId: "bukahyeon", date: "2026-10", kind: "아파트", dong: "601동 5층", areaSqm: 84.5, floor: 5, price: 54000, landShareSqm: 28.3, officialLandValue: 9800 },
  { id: "t19", zoneId: "bukahyeon", date: "2026-09", kind: "아파트", dong: "602동 1층", areaSqm: 59.2, floor: 1, price: 47000, landShareSqm: 19.8, officialLandValue: 6900 },
  { id: "t20", zoneId: "bukahyeon", date: "2026-08", kind: "아파트", dong: "603동 9층", areaSqm: 84.5, floor: 9, price: 58500, landShareSqm: 28.3, officialLandValue: 9800 },
];

export const LISTINGS: Listing[] = [
  {
    id: "l1",
    zoneId: "sillim-1",
    brokerName: "김중개",
    brokerAgency: "신림공인중개사사무소",
    brokerPhone: "010-1234-5678",
    brokerLicense: "서울관악-00123",
    unitType: "84D",
    salePrice: 63500,
    appraisedValue: 58000,
    premium: 5500,
    transferFeeIncluded: true,
    transferFee: 3000,
    expectedJeonse: 30000,
    expectedAdditionalCost: 8500,
    note: "관리처분 인가 직후 물건. 조합원 지위 불하 포함.",
    verified: true,
    createdAt: "2026-11-10",
  },
  {
    id: "l2",
    zoneId: "sillim-1",
    brokerName: "박중개",
    brokerAgency: "낙성대부동산중개법인",
    brokerPhone: "010-2345-6789",
    brokerLicense: "서울관악-00088",
    unitType: "59A",
    salePrice: 58000,
    appraisedValue: 54000,
    transferFeeIncluded: false,
    expectedJeonse: 27000,
    expectedAdditionalCost: 8200,
    verified: false,
    createdAt: "2026-11-08",
  },
  {
    id: "l3",
    zoneId: "banpo-1",
    brokerName: "이중개",
    brokerAgency: "반포종합중개사무소",
    brokerPhone: "010-3456-7890",
    brokerLicense: "서울서초-00241",
    unitType: "84D",
    salePrice: 132000,
    appraisedValue: 118000,
    premium: 14000,
    transferFeeIncluded: true,
    transferFee: 8500,
    expectedJeonse: 55000,
    expectedAdditionalCost: 22000,
    note: "반포주공1단지 3주구. 지분율 우수 조합원 지위.",
    verified: true,
    createdAt: "2026-11-12",
  },
  {
    id: "l4",
    zoneId: "hannam",
    brokerName: "최중개",
    brokerAgency: "한남리얼에스테이트",
    brokerPhone: "010-4567-8901",
    brokerLicense: "서울용산-00076",
    unitType: "114D",
    salePrice: 198000,
    appraisedValue: 182000,
    premium: 16000,
    transferFeeIncluded: false,
    expectedJeonse: 80000,
    expectedAdditionalCost: 18000,
    verified: true,
    createdAt: "2026-11-05",
  },
  {
    id: "l5",
    zoneId: "seongsu",
    brokerName: "정중개",
    brokerAgency: "성수부동산중개법인",
    brokerPhone: "010-5678-9012",
    brokerLicense: "서울성동-00102",
    unitType: "84A",
    salePrice: 99000,
    appraisedValue: 92000,
    transferFeeIncluded: true,
    transferFee: 5000,
    expectedJeonse: 45000,
    expectedAdditionalCost: 9500,
    note: "착공 단계, 잔금 직전 일몰 매물.",
    verified: true,
    createdAt: "2026-11-14",
  },
  {
    id: "l6",
    zoneId: "noryangjin",
    brokerName: "강중개",
    brokerAgency: "노량진중개사사무소",
    brokerPhone: "010-6789-0123",
    brokerLicense: "서울동작-00157",
    unitType: "74D",
    salePrice: 78000,
    appraisedValue: 71000,
    premium: 7000,
    transferFeeIncluded: false,
    expectedJeonse: 33000,
    expectedAdditionalCost: 11200,
    verified: false,
    createdAt: "2026-11-09",
  },
  {
    id: "l7",
    zoneId: "bukahyeon",
    brokerName: "윤중개",
    brokerAgency: "북아현공인중개사사무소",
    brokerPhone: "010-7890-1234",
    brokerLicense: "서울서대문-00039",
    unitType: "84D",
    salePrice: 52000,
    appraisedValue: 48000,
    transferFeeIncluded: false,
    expectedJeonse: 24000,
    expectedAdditionalCost: 7600,
    verified: false,
    createdAt: "2026-11-06",
  },
];
