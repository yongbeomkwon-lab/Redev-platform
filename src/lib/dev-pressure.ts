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
 * 🔥 개발압력 **가상 구역경계** — `public/data/dev-pressure-blocks.json`
 *   (scripts/build-dev-pressure-blocks.py 산출)
 *
 *   · 핫스팟 둘레 30년↑ 저층 건물이 골목으로 이어진 덩어리의 외곽을 딴 **추정** 경계다.
 *     고시된 구역계가 아니므로 지도에서는 주황 점선 + 반투명 채움으로만 그린다.
 *   · 기존 정비구역·아파트 단지 안은 빼고 그렸다(실제 추진 구역과 겹치지 않게).
 *   · `polygon` 은 앱의 구역(SeoulZone.polygon)과 같은 `[위도, 경도]` 순서다.
 */
export type DevBlock = {
  /** 핫스팟 id (DevHotspot.id) — 카드·핀이 이 키로 블록을 찾는다 */
  id: string;
  score: number;
  grade: DevHotspot["grade"];
  gu: string;
  dong: string;
  hjd?: string | null;
  areaM2: number;
  pyeong: number;
  /** 30년 이상 비율(%) — 이 블록 안 저층 건물 중 연도를 아는 것 기준 */
  oldPct: number;
  /** 블록 안 저층 건물 동수 */
  bldCount: number;
  /** 반경 500m 아파트 동수(개발압력 산출값) */
  aptCount: number;
  apts: string[];
  zones: DevPressureZone[];
  station?: DevPressureStation | null;
  /** [위도, 경도] */
  center: [number, number];
  /** 외곽 링 — [위도, 경도] */
  polygon: [number, number][];
  /** 큰 내부 구멍(학교·단지) — [위도, 경도] */
  holes?: [number, number][][];
};

export type DevBlockData = {
  generatedAt: string;
  method: Record<string, unknown>;
  blocks: DevBlock[];
};

const BLOCK_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const DEV_BLOCKS_URL = `/data/dev-pressure-blocks.json?v=${encodeURIComponent(BLOCK_VERSION)}`;

let blockCache: Promise<DevBlockData> | null = null;

/** 가상 구역경계 데이터 — 개발압력 핀과 같은 시점에 한 번만 받는다 */
export function loadDevBlocks(): Promise<DevBlockData> {
  if (!blockCache) {
    blockCache = fetch(DEV_BLOCKS_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`dev-pressure-blocks ${r.status}`);
        return r.json() as Promise<DevBlockData>;
      })
      .catch((e) => {
        blockCache = null;
        throw e;
      });
  }
  return blockCache;
}

/** 면적 표기 — 1만㎡ 이상은 「2.4만㎡」, 그 아래는 「8,200㎡」 */
export function formatBlockArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(1)}만㎡`;
  return `${Math.round(m2).toLocaleString()}㎡`;
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
