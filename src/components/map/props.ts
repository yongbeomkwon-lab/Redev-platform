// 지도 컴포넌트 공용 props — 카카오맵(KakaoZoneMap)과 폴백(LeafletZoneMap)이 같은 계약을 쓴다.
// (leaflet/kakao 를 임포트하지 않는 순수 모듈이라 어디서든 안전하다)
import type { Zone } from "@/lib/types";
import type { SeoulZone } from "@/lib/seoul-zones";

/** 서울시 경계 (지도 초기 화면) — [[남서 위도, 경도], [북동 위도, 경도]] */
export const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [37.428, 126.764],
  [37.702, 127.184],
];

/**
 * 매물 배지 — 구역 id → 매물 건수.
 *   지도는 매물이 1건 이상인 구역의 중심에 `🏠 매물 N` 배지를 얹는다(우리 DOM 레이어 z-index 100).
 */
export type ZoneListingCounts = Record<string, number>;

export type ZoneMapProps = {
  /** 대표 구역 (상세 데이터 보유 — 실거래·매물 포함) */
  zones: Zone[];
  /** 서울시 정비구역 전수 (호출측이 표시 범위만 걸러서 넘긴다 — 준공 숨김 등) */
  seoulZones: SeoulZone[];
  /** 구역별 매물 건수 — 있으면 지도에 🏠 매물 N 배지를 그린다 */
  listingCounts?: ZoneListingCounts;
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
  /** 준공·입주 완료 구역까지 표시 중인지 (지도 위 토글 표시용) */
  showCompleted?: boolean;
  /** 지도 위 ‘준공 포함’ 토글 — 상태는 ZoneExplorer가 갖는다 */
  onToggleCompleted?: () => void;
  /** 준공 완료 구역 수 (토글에 병기) */
  completedCount?: number;
  /** 주소 검색으로 찾은 위치 핀 — null 이면 지운다 */
  addressPin?: AddressPin | null;
  /** 지하철역 검색으로 고른 역 — null 이면 지운다(지도를 그 역으로 확대한다) */
  stationPin?: StationPin | null;
  /**
   * ‘구역 전체 보기’ 요청 토큰 — 값이 바뀔 때마다 선택 구역 경계에 화면을 맞춘다.
   * 주소 핀은 핀 지점을 확대해 보여주므로(골목·건물명), 구역 경계 전체는 이 버튼으로 본다.
   */
  zoneFitRequest?: number;
  /**
   * 관리자 모드(?admin=1)에서만 넘긴다 — 지도 위에서 구역 경계를 직접 그리고 고친다.
   * 없으면(일반 방문자) 지도는 기존과 완전히 같다.
   */
  admin?: AdminMapConfig;
  /**
   * 지도에 얹는 실거래 가격 핀 — 구역 상세(ZoneTransactions)가 지번을 좌표로 바꿔
   * 구역 경계 안 거래만 추려 넘긴다. 비어 있으면 핀·토글을 그리지 않는다.
   */
  txPins?: TxMapPin[];
  /** 실거래 핀 표시 ON/OFF — 상태는 ZoneExplorer가 갖는다 */
  txPinsOn?: boolean;
  /** 지도 위 「실거래 핀」 토글 */
  onToggleTxPins?: () => void;
  /**
   * 내 매물 핀 — 부동산포스에 올린 권용범 대표 매물(정비구역 안 + 밖 모두).
   * 「내 매물만 보기」를 켜면 이 핀들이 지도에 찍힌다(상태는 ZoneExplorer가 갖는다).
   */
  myPins?: MyListingPin[];
  /** 내 매물 핀 표시 ON/OFF — 「내 매물만 보기」 토글 상태 */
  myPinsOn?: boolean;
  /** 지도 위 「내 매물만 보기」 토글 — 일반 방문자에게도 보인다 */
  onToggleMyPins?: () => void;
  /** 지도에 처음 화면을 서울 전체로 맞추라는 요청 토큰(내 매물 토글을 켤 때) */
  fitSeoulRequest?: number;
  /** 이 매물 핀을 펼쳐 보라는 요청(/?my=<id> 로 들어왔을 때) */
  myFocusId?: string | null;
};

/**
 * 지도에 찍는 내 매물 핀 1건 — `src/data/my-listings.json`(scripts/build-my-listings.py)의 항목.
 *   · 가격 라벨은 `매 7.3억` / `전 4.9억` 처럼 거래유형을 한 글자로 줄인다.
 *   · 정비구역 밖 매물은 zoneId 가 없다 — 지도에는 그대로 찍히고 구역 열기 버튼만 빠진다.
 */
export type MyListingPin = {
  id: string;
  /** 부동산포스 매물번호 */
  rfineNo: string;
  zoneId: string | null;
  zoneName: string | null;
  gu: string;
  dong: string;
  jibun: string;
  address: string;
  jibunAddress: string;
  buildingName: string;
  propertyType: string;
  dealType: string;
  /** 핀 1줄 — 예: `매 7.3억`, `전 4.9억`, `월 1억/600` */
  priceLabel: string;
  /** 카드 본문 — 예: `매매가 7억 3,000만원` */
  priceText: string;
  /** 카드 면적 — 예: `전 52.88㎡·16평` */
  areaLabel: string;
  floor: string;
  feature: string;
  detailUrl: string;
  expiresAt: string;
  /** 좌표 정밀도 — `지번` | `건물` | `동`(주소에 지번이 없어 법정동 중심) */
  geoPrecision: string;
  /** 이미 검증 매물로 있어 DB에 중복 등록하지 않은 건 */
  duplicateOf: string | null;
  lat: number;
  lng: number;
};

/**
 * 지도 위 실거래 가격 핀 1건 — 지번 좌표가 확인된 아파트·연립다세대 거래.
 *   같은 지번에 여러 거래가 있으면 최신 1건만 핀으로 찍는다(핀이 겹치지 않게).
 */
export type TxMapPin = {
  id: string;
  /** 단지명(연립·다세대는 건물명) */
  name: string;
  /** 아파트 | 연립·다세대 */
  kind: string;
  lat: number;
  lng: number;
  /** 거래금액(만원) */
  price: number;
  /** 핀에 쓰는 짧은 가격 — 예: 7.8억 */
  priceLabel: string;
  /** 핀에 쓰는 면적 — 예: 전용 59㎡ */
  areaLabel: string;
  /** 계약일 YYYY-MM-DD */
  dealDate: string;
  jibun: string;
  umdNm: string;
  /** 평당가(만원/평) — 전용 기준, 없으면 null */
  pyeongPrice: number | null;
  /** 지분(대지) 평당가(만원/평) — 연립·다세대는 대지권면적, 없으면 null */
  landPyeongPrice?: number | null;
};

/** 관리자 모드가 지도에 넘기는 값 — 저장된 구역(그리기) + 지금 그리는 초안 */
export type AdminMapConfig = {
  /** 저장된 관리자 구역 — 관리자 모드에서만 지도에 그린다 */
  zones: AdminZoneShape[];
  /** 지금 그리는/고치는 링([위도, 경도]) — 없으면 초안 없음 */
  draft: [number, number][] | null;
  /** 지도 탭으로 꼭짓점을 추가하는 중인지(경계 수정 중에는 핸들만 움직인다) */
  adding: boolean;
  /** 목록·지도에서 고른 관리자 구역 */
  selectedId?: string;
  /** ‘이 구역으로 지도 맞추기’ 요청 토큰 */
  fit?: { id: string; token: number } | null;
  /** 지도 탭 → 꼭짓점 추가 */
  onAddPoint: (lat: number, lng: number) => void;
  /** 첫 점을 다시 탭했을 때(꼭짓점 3개 이상) — 그리기 완료 */
  onFinishByFirstPoint: () => void;
  /** 꼭짓점 드래그 */
  onMovePoint: (index: number, lat: number, lng: number) => void;
  /** 변 중간 + 핸들 → 꼭짓점 삽입 */
  onInsertPoint: (index: number, lat: number, lng: number) => void;
  /** 꼭짓점 삭제(✕ 배지·우클릭) */
  onRemovePoint: (index: number) => void;
  /** 지도에서 관리자 구역 클릭 */
  onSelectZone: (id: string) => void;
};

/** 지도에 그리는 관리자 구역(가벼운 형태) */
export type AdminZoneShape = {
  id: string;
  name: string;
  type: string;
  /** 추진단계 — 지도 이름표에 [유형 · 단계] 뱃지로 쓴다(관리자 구역은 서울시 데이터에 없다) */
  stage?: string;
  /** 자치구 — 툴팁·이름표 보조 표기 */
  gu?: string;
  color: string;
  ring: [number, number][];
  /** 공식 구역 도형을 대체하는 경계 보정인지(점선으로 구분) */
  replaces?: boolean;
};

/** 주소 → 구역 판별 결과를 지도에 찍는 핀/말풍선 */
export type AddressPin = {
  lat: number;
  lng: number;
  /** 주소(지번·도로명) */
  label: string;
  /** 판정 종류 — 핀·말풍선 색을 가른다 */
  status: "inside" | "completed" | "near-candidate" | "outside";
  /** 말풍선 한 줄: ✅ 신림1구역 포함 / ⚠️ 경계 미고시 후보지 인근 … (구역 밖은 빈 문자열 — 주소만 찍는다) */
  message: string;
  /** 이 주소가 속한 구역 — 있으면 선택 구역과 핀이 같은 곳이다(핀 화면을 유지한다) */
  zoneId?: string;
};

/** 지하철역 검색 결과를 지도에 찍는 역 핀 — 주소 핀과 달리 '기준점'이라 판정 색이 없다 */
export type StationPin = {
  /** 역 이름(데이터에는 '역'이 없다) */
  name: string;
  lat: number;
  lng: number;
  /** 노선 id 목록 — 배지 색을 그린다 */
  lines: string[];
  /** 카드에 쓰는 노선 이름 "2호선·7호선" */
  lineLabel: string;
};

/** 카카오맵이 뜨지 않을 때(키 종류·도메인 문제 등) 폴백으로 넘기기 위한 신호 */
export type MapFailReason = "key-missing" | "timeout" | "sdk-error" | "script-error" | "init-error";

export type KakaoZoneMapProps = ZoneMapProps & {
  /** 지도 생성이 실패하면 폴백(OSM)으로 내려가도록 알린다 */
  onFail?: (reason: MapFailReason, detail?: string) => void;
};

export type LeafletZoneMapProps = ZoneMapProps & {
  /** 카카오맵을 쓸 수 없어 OSM으로 표시 중인 이유 (작은 안내 배지용) */
  fallbackReason?: MapFailReason;
};
