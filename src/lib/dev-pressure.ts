// 개발압력(🔥) 데이터 — `public/data/dev-pressure.json` (scripts/build-dev-pressure.py 산출)
//
//   · 격자 150m 단위로 계산한 0~100 점 중 상위 핫스팟만 담는다(구별 최대 24곳).
//   · 점수 = 0.45×포위도(사방이 정비구역·아파트로 막힌 정도) + 0.25×노후도
//            + 0.20×아파트 밀집도 + 0.10×역세권   (기존 정비구역 내부는 ×0.95)
//   · 노후·저층(③)은 **아파트 동·단지를 뺀 저층 건물**만 센다 — 핀도 그 저층 건물 무리 위에
//     세운다(격자 중심에 찍으면 사당우성2단지 같은 대단지 위에 핀이 꽂히던 문제, 2026-11-22).
//   · reason 은 산출 스크립트가 만든 근거 문구다 — 지도 카드가 그대로 보여 준다.
//
// 데이터가 바뀌면 배포 ID로 캐시 키를 새로 만든다(zones.geojson 과 같은 규칙).

export type DevPressureZone = {
  /** 정비구역 id — 카드에서 그 구역을 바로 연다 */
  id: string;
  name: string;
  stage: string;
  /** 이 핫스팟 중심에서 구역 경계까지 거리(m) */
  dist: number;
};

export type DevPressureStation = {
  name: string;
  lines: string[];
  dist: number;
};

export type DevHotspot = {
  id: string;
  lat: number;
  lng: number;
  gu: string;
  /** 법정동 */
  dong: string;
  /** 행정동 — 법정동과 다를 때만 채워진다(예: 법정동 신길동 / 행정동 신길7동) */
  hjd?: string | null;
  score: number;
  grade: "최상" | "높음" | "보통";
  types: string[];
  oldPct: number;
  lowPct: number;
  aptCount: number;
  apts: string[];
  zones: DevPressureZone[];
  station?: DevPressureStation | null;
  /** 이 핫스팟이 이미 정비구역 안이면 그 이름(모아타운 관리지역 등) */
  inZone?: string | null;
  /** 같은 점수의 이웃 칸 수 — 덩어리 크기(원 반경에 쓴다) */
  density: number;
  reason: string;
};

export type DevPressureData = {
  generatedAt: string;
  method: {
    grid?: number;
    oldYear?: number;
    lowArea?: number;
    weights?: Record<string, number>;
    note?: string;
  };
  hotspots: DevHotspot[];
};

/**
 * 🔥 개발압력 **생활권(동심원)** — `public/data/dev-pressure-areas.json`
 *   (scripts/build-dev-pressure-areas.py 산출)
 *
 *   · 30년↑ 저층 건물이 골목으로 이어진 덩어리(`dev-pressure-blocks.json`) **안쪽**에 놓은
 *     참고용 원이다. 지도에는 점선 폴리곤 대신 은은한 동심원 + 중앙 점수 배지로 그린다.
 *   · 중심은 **대로 회랑(도로 반폭 + 4m)과 블록 경계 중 가까운 쪽에서 가장 먼 자리** —
 *     대로변 상가·주유소·교차로를 비켜 저층 주거지 안쪽으로 옮겼다.
 *   · 반경은 그 자리에서 원이 들어가는 최대 반경(24~110m). 대로에 붙은 얇은 띠는 아예 빼 둔다.
 *   · 고시된 구역계가 아니다 — 카드에서도 그렇게 안내한다.
 *   · `center` 는 앱의 다른 좌표와 같은 **`[위도, 경도]`** 순서다.
 */
export type DevArea = {
  /** 핫스팟 id (DevHotspot.id) — 카드·배지가 이 키로 생활권을 찾는다 */
  id: string;
  score: number;
  grade: DevHotspot["grade"];
  gu: string;
  dong: string;
  hjd?: string | null;
  /** 생활권 중심 — [위도, 경도] */
  center: [number, number];
  /** 생활권 반경(m) */
  radiusM: number;
  /** 원 면적(㎡) = πr² */
  areaM2: number;
  pyeong: number;
  /** 일대 저층 건물 중 30년 이상 비율(%) */
  oldPct: number;
  /** 일대 저층 건물 동수 */
  bldCount: number;
  /** 반경 500m 아파트 동수(개발압력 산출값) */
  aptCount: number;
  apts: string[];
  zones: DevPressureZone[];
  station?: DevPressureStation | null;
  /** 가장 가까운 간선도로 — clearM = 원 가장자리에서 그 도로 끝까지 여유(m) */
  road?: { name: string; cls: string; dist: number; clearM: number } | null;
};

export type DevAreaData = {
  generatedAt: string;
  method: Record<string, unknown>;
  areas: DevArea[];
  /** 대로에 붙은 얇은 띠라 생활권 원을 그리지 않은 핫스팟 */
  excluded?: { id: string; gu: string; dong: string; reason: string }[];
};

const AREA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const DEV_AREAS_URL = `/data/dev-pressure-areas.json?v=${encodeURIComponent(AREA_VERSION)}`;

let areaCache: Promise<DevAreaData> | null = null;

/** 생활권(동심원) 데이터 — 개발압력 핀과 같은 시점에 한 번만 받는다 */
export function loadDevAreas(): Promise<DevAreaData> {
  if (!areaCache) {
    areaCache = fetch(DEV_AREAS_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`dev-pressure-areas ${r.status}`);
        return r.json() as Promise<DevAreaData>;
      })
      .catch((e) => {
        areaCache = null;
        throw e;
      });
  }
  return areaCache;
}

/** 간선도로 등급 한글 — 카드·범례에서 쓴다 */
export function roadClassLabel(cls: string): string {
  switch (cls) {
    case "motorway":
      return "고속화도로";
    case "trunk":
      return "주간선도로";
    case "primary":
      return "대로";
    case "secondary":
      return "대로";
    default:
      return "도로";
  }
}

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const DEV_PRESSURE_URL = `/data/dev-pressure.json?v=${encodeURIComponent(DATA_VERSION)}`;

let cache: Promise<DevPressureData> | null = null;

/** 개발압력 데이터 — 한 번만 받아 세션 동안 재사용한다 */
export function loadDevPressure(): Promise<DevPressureData> {
  if (!cache) {
    cache = fetch(DEV_PRESSURE_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`dev-pressure ${r.status}`);
        return r.json() as Promise<DevPressureData>;
      })
      .catch((e) => {
        cache = null; // 다음에 다시 시도한다
        throw e;
      });
  }
  return cache;
}

/** ⚡ 최근 변동 구역 — public/data/recent-zones.json (scripts/build-recent-zones.py) */
export type RecentZone = {
  id: string;
  name: string;
  gu: string | null;
  type: string | null;
  stage: string | null;
  /** 최근 반영일(YYYY-MM-DD) */
  asOf: string;
  /** 한 줄 단계 표기 — 예: 정비구역지정(공람) */
  label: string | null;
  note: string;
  /** [위도, 경도] */
  center: [number, number] | null;
};

/** 등급별 색 — 핀·카드 배지가 함께 쓴다 */
export const DEV_GRADE_COLOR: Record<DevHotspot["grade"], string> = {
  최상: "#dc2626",
  높음: "#ea580c",
  보통: "#d97706",
};

/** 이 배율(카카오 레벨)보다 멀리 보면 점수 높은 곳만 남긴다 — 서울 전체에서 핀이 뒤덮지 않게 */
export function minScoreForLevel(level: number): number {
  if (level <= 5) return 0; // 구역 단위로 확대 — 전부
  if (level === 6) return 80; // 500m 안팎
  if (level === 7) return 84; // 1km
  return 88; // 서울 전체 — 최상위만
}
