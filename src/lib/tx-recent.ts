"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 지도 전체 실거래 가격표 — 국토교통부 신고 거래(최근 3개월)를 건물 단위로 묶은 정적 데이터
//
//   · `public/data/tx-recent.json` — scripts/build-tx-recent-data.md 참고.
//     실거래 API(구·법정동 단위)를 서울 25개 구 전체로 받아, 같은 건물(법정동+지번)은
//     **최신 거래 1건 + 거래 건수**로 묶고 카카오 주소검색으로 지번 좌표를 붙였다.
//   · 구역을 고르지 않아도 지도 어디에나 가격표가 뜨게 하는 것이 목적이다.
//     (예전에는 구역 상세가 연 거래만 핀이 되어, "어떤 곳은 나오고 어떤 곳은 안 나오는" 것처럼 보였다)
//   · 좌표가 확인되지 않은 건물(주소검색 실패)은 데이터에 없다 — 없는 좌표를 지어내지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { TxMapPin } from "@/components/map/props";

/** 서버 정적 파일 — 배포본이 바뀌면 ?v= 로 캐시를 비운다 */
export const RECENT_TX_URL = "/data/tx-recent.json";

export type RecentTxKind = "아파트" | "연립·다세대" | "단독·다가구";
const KIND_BY_CODE: Record<number, RecentTxKind> = {
  0: "아파트",
  1: "연립·다세대",
  2: "단독·다가구",
};

export type RecentTxMeta = {
  source: string;
  asOf: string;
  months: number;
  buildings: number;
  note: string;
};

/** 지도에 찍는 건물 1곳 — TxMapPin 과 같은 모양이라 기존 그리기·이력 창을 그대로 쓴다 */
export type RecentTxBuilding = TxMapPin & {
  /** 같은 건물의 3개월 거래 건수(최신 1건 + 나머지) */
  count: number;
};

type RawPayload = {
  meta?: RecentTxMeta;
  buildings?: unknown[][];
};

/** 가격(만원) → 지도 라벨 "7.85억" / "4,500만" */
export function txPriceLabel(man: number): string {
  if (!Number.isFinite(man) || man <= 0) return "—";
  if (man >= 10000) {
    const eok = Math.round(man / 100) / 100;
    return `${eok}억`;
  }
  return `${Math.round(man).toLocaleString()}만`;
}

/** 전용면적 → 지도 라벨 "전용 54㎡" */
export function txAreaLabel(sqm: number): string {
  if (!Number.isFinite(sqm) || sqm <= 0) return "";
  return `전용 ${Math.round(sqm)}㎡`;
}

/** 평당가(만원/평, 전용 기준) — 없으면 null */
function pyeongPrice(price: number, sqm: number): number | null {
  if (!(price > 0) || !(sqm > 0)) return null;
  const pyeong = sqm / 3.305785;
  if (!(pyeong > 0)) return null;
  return Math.round(price / pyeong);
}

function toBuilding(row: unknown[]): RecentTxBuilding | null {
  const lat = Number(row[0]);
  const lng = Number(row[1]);
  const kind = KIND_BY_CODE[Number(row[2])];
  const name = String(row[3] ?? "");
  const dong = String(row[4] ?? "");
  const jibun = String(row[5] ?? "");
  const price = Number(row[6]);
  const area = Number(row[7]);
  const dealDate = String(row[9] ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !kind || !dong || !jibun) return null;
  if (!(price > 0)) return null;
  const count = Math.max(1, Number(row[10]) || 1);
  return {
    id: `txg-${dong}-${jibun}`,
    name,
    kind,
    lat,
    lng,
    price,
    priceLabel: count > 1 ? `${txPriceLabel(price)} ${count}건` : txPriceLabel(price),
    areaLabel: txAreaLabel(area),
    dealDate,
    jibun,
    umdNm: dong,
    pyeongPrice: pyeongPrice(price, area),
    count,
  };
}

let cache: Promise<{ meta: RecentTxMeta | null; pins: RecentTxBuilding[] }> | null = null;

/**
 * 지도 전체 실거래 가격표를 읽는다 — 한 번만 받아 모듈 캐시에 둔다.
 *   · 실패해도 화면은 살아 있게 빈 목록을 돌려준다(지도는 구역만 그린다).
 */
export function loadRecentTx(): Promise<{ meta: RecentTxMeta | null; pins: RecentTxBuilding[] }> {
  if (cache) return cache;
  cache = fetch(RECENT_TX_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<RawPayload>) : Promise.reject(new Error(String(r.status)))))
    .then((d) => {
      const pins = (d.buildings ?? [])
        .map(toBuilding)
        .filter((b): b is RecentTxBuilding => !!b)
        // 최신 거래부터 — 지도에 다 못 앉히는 좁은 화면에서는 최근 것이 먼저 보인다
        .sort((a, b) => b.dealDate.localeCompare(a.dealDate));
      return { meta: d.meta ?? null, pins };
    })
    .catch((e) => {
      console.warn("[tx] 지도 실거래 가격표를 불러오지 못했습니다", e);
      cache = null;
      return { meta: null, pins: [] as RecentTxBuilding[] };
    });
  return cache;
}
