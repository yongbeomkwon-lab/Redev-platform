// 지도 컴포넌트 공용 props — 카카오맵(KakaoZoneMap)과 폴백(LeafletZoneMap)이 같은 계약을 쓴다.
// (leaflet/kakao 를 임포트하지 않는 순수 모듈이라 어디서든 안전하다)
import type { Zone } from "@/lib/types";
import type { SeoulZone } from "@/lib/seoul-zones";

/** 서울시 경계 (지도 초기 화면) — [[남서 위도, 경도], [북동 위도, 경도]] */
export const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [37.428, 126.764],
  [37.702, 127.184],
];

export type ZoneMapProps = {
  /** 대표 구역 (상세 데이터 보유 — 실거래·매물 포함) */
  zones: Zone[];
  /** 서울시 정비구역 전수 (호출측이 표시 범위만 걸러서 넘긴다 — 준공 숨김 등) */
  seoulZones: SeoulZone[];
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
};

/** 주소 → 구역 판별 결과를 지도에 찍는 핀/말풍선 */
export type AddressPin = {
  lat: number;
  lng: number;
  /** 주소(지번·도로명) */
  label: string;
  /** 판정 종류 — 핀·말풍선 색을 가른다 */
  status: "inside" | "completed" | "near-candidate" | "outside";
  /** 말풍선 한 줄: ✅ 신림1구역 포함 / 정비구역 밖 주소입니다 … */
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
