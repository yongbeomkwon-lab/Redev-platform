// 💎 원석 찾기 — 미지정 노후 저층 블록 (public/data/gem-blocks.json, scripts/build-gem-blocks.mjs 산출)
//
//   · 서울 전역을 130m 격자로 훑어 **정비구역으로 지정되지 않은** 노후 저층지 후보를 고른 목록이다.
//     조건: 저층(외곽 250㎡ 이하) 15동 이상 · 30년↑ 비율 60% 이상 · 10년↓ 신축 10% 이하
//           · 기존 정비구역과 20% 이상 겹치면 제외 · 서로 240m 안이면 점수 높은 쪽만
//   · 폴리곤은 저층 건물 위치를 감싼 **추정 경계**다. 고시된 구역계가 아니다 — 화면에서도 그렇게 말한다.
//   · 데이터가 바뀌면 배포 ID로 캐시 키를 새로 만든다(zones.geojson·dev-pressure 와 같은 규칙).

export type GemZoneNear = { id: string; name: string; stage: string; dist: number };
export type GemStation = { name: string; lines: string[]; dist: number };

export type GemBlock = {
  /** gem-<격자x>-<격자y> */
  id: string;
  score: number;
  grade: "S" | "A" | "B";
  gu: string;
  /** 법정동 */
  dong: string | null;
  /** 대표 지번 */
  jibun: string | null;
  /** 지번 주소 전체 — 예: 서울특별시 종로구 창신동 390-9 */
  addr: string | null;
  /** 대표 지점 [위도, 경도] */
  lat: number;
  lng: number;
  /** 경계 폴리곤 — [위도, 경도] */
  polygon: [number, number][];
  areaM2: number;
  pyeong: number;
  /** 저층 건물 동수 */
  bldCount: number;
  /** 칸 안 전체 건물 동수 */
  allCount: number;
  /** 30년 이상(1996 이전 사용승인) 비율 % */
  old30Pct: number;
  /** 20년 이상(2006 이전) 비율 % */
  old20Pct: number;
  /** 최근 10년(2016 이후) 신축 비율 % */
  new10Pct: number;
  /** 건물 중 저층(외곽 250㎡ 이하) 비율 % */
  lowRisePct: number;
  /** 평균 외곽면적(㎡) */
  avgFootprint: number;
  /** 이 칸에서 정비구역이 차지하는 비율 % (20% 미만만 남겼다) */
  zoneOverlapPct: number;
  /** 500m 안 정비구역(가까운 3곳) */
  zonesNear: GemZoneNear[];
  /** 700m 안 가장 가까운 역 */
  station: GemStation | null;
};

export type GemData = {
  generatedAt: string;
  method: Record<string, unknown>;
  summary: { total: number; byGu: Record<string, number> };
  blocks: GemBlock[];
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const GEM_URL = `/data/gem-blocks.json?v=${encodeURIComponent(DATA_VERSION)}`;

/** 등급 색 — S 진한 호박 · A 주황 · B 연한 금색 */
export const GEM_GRADE_COLOR: Record<GemBlock["grade"], string> = {
  S: "#b45309",
  A: "#d97706",
  B: "#ea9a05",
};

let cache: Promise<GemData> | null = null;

/** 원석 블록 — 한 번만 받아 세션 동안 재사용한다 */
export function loadGemBlocks(): Promise<GemData> {
  if (!cache) {
    cache = fetch(GEM_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`gem-blocks ${r.status}`);
        return r.json() as Promise<GemData>;
      })
      .catch((e) => {
        cache = null; // 다음에 다시 시도한다
        return Promise.reject(e);
      });
  }
  return cache;
}

/** 한 줄 요약 — 카드·목록이 함께 쓴다. 예: "노후 92% · 48동 · 1.8만㎡" */
export function gemSummary(b: GemBlock): string {
  const man = (b.areaM2 / 10000).toFixed(1);
  return `노후 ${b.old30Pct}% · ${b.bldCount}동 · ${man}만㎡`;
}

/** 배지에 쓰는 짧은 이름 — 💎 노후 72% */
export function gemBadge(b: GemBlock): string {
  return `💎 노후 ${b.old30Pct}%`;
}
