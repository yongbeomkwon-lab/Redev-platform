// ─────────────────────────────────────────────────────────────────────────────
// 구역 내 법원경매 물건 — `public/data/auctions.json`
//
//   · 출처: 대법원 법원경매정보(courtauction.go.kr) 부동산 물건검색
//     (scripts/fetch-court-auctions.py → 지번 좌표 scripts/geocode-auctions.py
//      → 구역 경계 매칭 scripts/build-auction-zones.py)
//   · 사이트 검색이 기본으로 돌려주는 **공고중 물건**(매각기일이 앞으로 약 2주)만 담는다.
//     그래서 meta.saleDateFrom ~ saleDateTo 를 화면에 함께 적는다 — '진행 중'의 범위를 숨기지 않는다.
//   · 한 물건이 여러 구역에 걸치면 면적이 가장 작은 구역을 대표로 두고 zoneIds 에 전부 남긴다
//     (구역 상세는 byZone[zoneId] 만 보면 된다).
// ─────────────────────────────────────────────────────────────────────────────

export type AuctionItem = {
  id: string;
  court: string;
  courtCode: string;
  /** 사건번호(숫자) — 예: 20230130104875 */
  caseNo: string;
  /** 사람이 읽는 사건번호 — 예: 서울중앙지방법원 2023타경104875 */
  caseNoPrint: string;
  /** 물건번호(매각물건일련) */
  itemNo: string;
  objectNo: string;
  /** 매각용도 — 아파트 · 다세대 · 근린시설 · 대지 … */
  usage: string;
  /** 소재지(법원 원문 표기) */
  address: string;
  /** 구·동·번지 요약 */
  jibun: string;
  building: string;
  /** 감정평가액(원) */
  appraised: number | null;
  /** 최저매각가격(원) */
  minimum: number | null;
  /** 최저매각가율(%) — 감정가 대비 */
  minimumRate: number | null;
  /** 유찰횟수 */
  failCount: number | null;
  /** 매각기일 YYYYMMDD */
  saleDate: string;
  /** 매각시각 HH:MM */
  saleTime: string;
  area: string;
  landCategory: string;
  /** 비고 — 지분매각·일괄매각 등 법원 원문 */
  note: string;
  lat: number;
  lng: number;
  zoneId: string;
  zoneName: string;
  zoneIds: string[];
  /** 사건번호 분해 — 대법원 사건검색에 그대로 넣을 수 있게 */
  caseYear: string;
  casePart: string;
  caseSerial: string;
  /** 대법원 사건검색 화면 — 사건상세는 URL 딥링크를 지원하지 않는다 */
  detailUrl: string;
};

export type AuctionsMeta = {
  source: string;
  collectedAt: string;
  saleDateFrom: string;
  saleDateTo: string;
  courts?: Record<string, { name: string; pages: number }>;
  seoulItems?: number;
  geocoded?: number;
  matched?: number;
  zonesWithAuctions?: number;
  note?: string;
};

export type AuctionsData = {
  meta: AuctionsMeta;
  byZone: Record<string, AuctionItem[]>;
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const AUCTIONS_URL = `/data/auctions.json?v=${encodeURIComponent(DATA_VERSION)}`;

let cache: Promise<AuctionsData | null> | null = null;

/** 구역 경매 데이터 — 한 번만 받아 세션 동안 재사용한다. 실패하면 null(섹션을 그리지 않는다) */
export function loadAuctions(): Promise<AuctionsData | null> {
  if (!cache) {
    cache = fetch(AUCTIONS_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`auctions ${r.status}`);
        return r.json() as Promise<AuctionsData>;
      })
      .catch((e) => {
        console.warn("[auctions] 구역 경매 데이터를 불러오지 못했습니다", e);
        cache = null;
        return null;
      });
  }
  return cache;
}

/** YYYYMMDD → 11.24(월) */
export function formatSaleDate(ymd: string): string {
  if (!ymd || ymd.length !== 8) return ymd || "-";
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}.${d}(${weekday})`;
}

/** 원 → "7억 8,336만" (경매는 원 단위로 오므로 만원으로 줄여 쓴다) */
export function formatWon(v: number | null | undefined): string {
  if (!v) return "-";
  const man = Math.round(v / 10000);
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  if (eok <= 0) return `${rest.toLocaleString()}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString()}만`;
}

/** 매각기일까지 남은 일수 — 오늘(로컬) 기준 */
export function daysUntilSale(ymd: string): number | null {
  if (!ymd || ymd.length !== 8) return null;
  const target = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
