// 지도 컴포넌트 공용 props — 카카오맵(KakaoZoneMap)과 폴백(LeafletZoneMap)이 같은 계약을 쓴다.
// (leaflet/kakao 를 임포트하지 않는 순수 모듈이라 어디서든 안전하다)
import type { Zone } from "@/lib/types";
import type { SeoulZone } from "@/lib/seoul-zones";
import type { AuctionMapPin } from "@/lib/auction-pins";
import type { Parcel } from "@/lib/parcel";

/** 서울시 경계 (지도 초기 화면) — [[남서 위도, 경도], [북동 위도, 경도]] */
export const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [37.428, 126.764],
  [37.702, 127.184],
];

/**
 * 매물 배지 — 구역 id → 매물 건수.
 *   지도는 매물이 1건 이상인 구역의 중심에 `🏠 매물 N` 배지를 얹는다(우리 DOM 레이어 z-index 100).
 *   · 지금은 호출측(ZoneExplorer)이 넘기지 않는다 — 사용자 요청(2026-11-21)으로 초기 화면에서는
 *     매물 배지를 숨기고, 마이페이지에서 다시 쓸 때 `src/lib/zone-listing-badges.ts` 의
 *     `SHOW_MAP_LISTING_BADGES` 를 켜서 되살린다.
 */
export type ZoneListingCounts = Record<string, number>;

/**
 * 자치구(구) 단위 총 구역 수 — 광역 화면(초기 서울 전체)에서 개별 구역 뱃지 대신 깔리는
 * `구 이름 + 총 개수` 2단 카드.
 *   · count 는 **지금 지도에 깔린 목록**에서 센 값이라, 사업유형 필터·‘준공 포함’ 토글·
 *     ‘매물 있는 구역’ 필터가 바뀌면 함께 바뀌고 좌측 범례의 총계와 합이 정확히 맞는다.
 *   · lat·lng 는 그 구역들이 몰려 있는 곳의 가운데(구 전체 구역의 경계 상자 중심) —
 *     뱃지를 앉히는 자리이자, 눌렀을 때 확대해 보여 줄 중심이다.
 */
export type DistrictStat = {
  /** 자치구 이름 (예: 서초구) */
  gu: string;
  /** 지금 필터에 걸린 구역 수 */
  count: number;
  lat: number;
  lng: number;
};

export type ZoneMapProps = {
  /** 자치구별 총 구역 수 — 광역 화면에서 개별 구역 뱃지 자리에 깔린다 */
  districtStats?: DistrictStat[];
  /** 대표 구역 (상세 데이터 보유 — 실거래·매물 포함) */
  zones: Zone[];
  /** 서울시 정비구역 전수 (호출측이 표시 범위만 걸러서 넘긴다 — 준공 숨김 등) */
  seoulZones: SeoulZone[];
  /** 구역별 매물 건수 — 넘기면 지도가 🏠 매물 N 배지를 그린다(지금은 초기 화면에서 숨김) */
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
  /**
   * 주소로 고른 지점의 **필지(지적) 경계** — 파란 반투명 + 진한 파란 선으로 칠하고
   * 가운데에 `보는중` 말풍선을 띄운다. null 이면 지운다(핀 지우기와 함께 사라진다).
   */
  parcel?: Parcel | null;
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
   * 지도 전체 실거래 가격표 — 국토부 신고 최근 3개월을 건물(법정동+지번) 단위로 묶은 목록.
   *   · 구역을 고르지 않아도 지도 어디에나 가격표를 깔아 "어떤 곳은 나오고 어떤 곳은 안 나오는"
   *     문제를 없앤다(기본 ON, 지도 위 「실거래」 토글로 끈다).
   *   · 표시만 하는 라벨이다(pointer-events 없음) — 구역 클릭·그리기를 가로막지 않는다.
   */
  recentTxPins?: TxMapPin[];
  /** 지도 전체 실거래 가격표를 받는 중인지(토글에 … 표시) */
  recentTxLoading?: boolean;
  /**
   * 실거래 핀을 눌렀을 때 — 그 단지·건물의 최근 5년 이력 창(BuildingTradeHistory)을 연다.
   * 넘기지 않으면 핀은 예전처럼 작은 상세 카드만 펼친다.
   */
  onSelectTxPin?: (pin: TxMapPin) => void;
  /**
   * 지금 5년 이력 창에서 보고 있는 단지·건물 — 그 지번의 핀을 강조(브랜드 색·펄스·확대)하고
   * 화면을 그 핀으로 부드럽게 옮긴다. 창을 닫으면 null 로 돌아온다.
   */
  activeTxPin?: { umdNm: string; jibun: string } | null;
  /**
   * ⚖️ 경매 물건 핀 — 구역을 골랐으면 그 구역 안 물건, 광역이면 매칭된 전체 물건.
   *   `buildAuctionPins` 가 **매각단위**(사건+물건번호)로 묶어 넘긴다 — 일괄매각 목적물 24필지는 1핀,
   *   좌표가 같은 호실(쌍문동 507-1 132건)도 1핀.
   */
  auctionPins?: AuctionMapPin[];
  /** 경매 핀 표시 ON/OFF — 상태는 ZoneExplorer 가 갖는다(첫 화면부터 기본 ON) */
  auctionPinsOn?: boolean;
  /** 지도 위 「⚖️ 경매 핀」 토글 */
  onToggleAuctionPins?: () => void;
  /**
   * ⚖️ 경매 핀을 눌렀을 때 — 그 핀에 묶인 물건들을 **왼쪽 대시보드 창**에 띄우고
   * 그 구역을 고른다(예전의 지도 말풍선 카드를 대신한다).
   */
  onSelectAuctionPin?: (pin: AuctionMapPin) => void;
  /** 왼쪽 창에서 보고 있는 핀 — 지도에서 그 핀을 강조(테두리·그림자)한다 */
  activeAuctionPinId?: string | null;
  /**
   * 「📍 지번 찍기」 모드 — 켜면 지도 클릭이 구역 선택 대신 **그 자리의 지번 핀**을 꽂는다.
   *   · 아이패드(터치)에서는 이 토글이 있어야 구역 안을 찍을 수 있다.
   *   · 기본 모드에서도 우클릭·구역 밖 클릭은 지번 핀으로 간다(편의).
   */
  jibunPickOn?: boolean;
  onToggleJibunPick?: () => void;
  /** 지도에서 찍은 좌표 — 호출성(ZoneExplorer)이 역지오코딩해 jibunPin 을 만든다 */
  onPickJibun?: (lat: number, lng: number) => void;
  /** 찍은 지번 핀(주소·소속 구역·실거래 열기 버튼) */
  jibunPin?: JibunPin | null;
  onCloseJibunPin?: () => void;
  /** 지번 카드의 「이 지번 실거래 5년 보기」 */
  onOpenJibunHistory?: (pin: JibunPin) => void;
  /** 그 지번이 속한 구역을 연다 */
  onOpenJibunZone?: (zoneId: string) => void;
  /** 지번 카드의 실거래 조회가 도는 중인지 */
  jibunHistoryLoading?: boolean;
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
  /** 🔥 개발압력 오버레이 ON/OFF — 상태는 ZoneExplorer 가 갖는다(첫 화면 패널에서도 켠다) */
  devPressureOn?: boolean;
  onToggleDevPressure?: () => void;
  /** 핫스팟으로 지도를 옮기고 그 카드를 열라는 요청 — token 이 바뀔 때마다 처리한다 */
  devPressureFocus?: { id: string; lat: number; lng: number; token: number } | null;
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

/**
 * 지도에 찍은 지번 핀 — 「📍 지번 찍기」/우클릭/구역 밖 클릭으로 꽂힌다.
 *   좌표를 역지오코딩해 법정동·지번과 소속 정비구역을 채운다.
 */
export type JibunPin = {
  lat: number;
  lng: number;
  /** 자치구 (예: 동작구) */
  gu: string;
  /** 법정동 (예: 상도동) */
  dong: string;
  /** 지번 (예: 209-12) — 없으면 빈 문자열 */
  jibun: string;
  /** 지번 주소 전체 */
  jibunAddress: string;
  /** 도로명 주소(있으면) */
  roadAddress?: string | null;
  /** 건물명(있으면) */
  buildingName?: string | null;
  /** 이 지점이 속한 정비구역 — 경계 안(inside)을 먼저 */
  zones: { id: string; name: string; stage?: string; type?: string; completed?: boolean }[];
  /** 주소 확인 상태 */
  state: "loading" | "ready" | "error";
  /** 안내 문구(실거래 없음·주소 확인 실패 등) */
  note?: string | null;
};

/** 실거래 핀을 단지·지번으로 알아보는 키 — 지번 표기(`209`/`209-0`) 차이를 무시한다 */
export function txPinKey(umdNm: string, jibun: string): string {
  const s = (jibun ?? "").trim();
  const m = s.match(/^(\d{1,4})(?:\s*-\s*(\d{1,4}))?$/);
  const norm = m ? (Number(m[2] || 0) > 0 ? `${Number(m[1])}-${Number(m[2])}` : String(Number(m[1]))) : s;
  return `${umdNm}|${norm}`;
}

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
  /**
   * 이 보정본이 덮어쓰는 서울시 구역 id — 있으면 그 구역은 **정식 구역 목록(zone-overrides 병합)에
   * 이미 같은 경계로 그려져 있다.** 지도가 관리자 레이어로 한 겹 더 칠하면 두 겹이 겹쳐
   * 늘 진한 색으로 보인다(2026-11-25 제보: 송파동 117 4구역만 유독 진함).
   */
  replacesZoneId?: string;
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
