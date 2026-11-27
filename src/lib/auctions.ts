// ─────────────────────────────────────────────────────────────────────────────
// 구역 내 법원경매 물건 — `public/data/auctions.json`
//
//   · 출처: 대법원 법원경매정보(courtauction.go.kr) 부동산 물건검색
//     (scripts/fetch-court-auctions.py → 지번 좌표 scripts/geocode-auctions.py
//      → 구역 경계 매칭 scripts/build-auction-zones.py)
//   · 서울 5개 지방법원(중앙·동부·남부·북부·서부)의 **진행 중 물건**을 담는다.
//     검색조건 두 가지(0004601 부동산 일반 · 0004602 부동산 전체)를 합쳐
//     매각기일 범위가 약 2달(2026-11-23 ~ 2027-01-28)까지 넓어졌다 — 서부지법도 포함.
//     그래서 meta.saleDateFrom ~ saleDateTo 를 화면에 함께 적는다 — '진행 중'의 범위를 숨기지 않는다.
//   · 한 물건이 여러 구역에 걸치면 면적이 가장 작은 구역을 대표로 두고 zoneIds 에 전부 남긴다
//     (구역 상세는 byZone[zoneId] 만 보면 된다).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 매각 구분 — 법원 **경매**와 공공기관 **공매**(온비드)를 한 패널의 탭으로 나눈 값.
 *   · 1단계(지금)는 `court` 뿐이다. 2단계에서 온비드 부동산 물건을 붙일 때
 *     `onbid` 항목을 같은 목록 컴포넌트에 맞춰 주는 어댑터만 추가하면 된다(패널 구조는 그대로).
 */
export type SaleChannel = "court" | "onbid";

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
  /** 매각장소 — 예: 제4별관제211호법정(2층) */
  salePlace?: string;
  /** 매각결정기일 YYYYMMDD */
  decisionDate?: string;
  /** 경매계 — 예: 경매4계 */
  courtDept?: string;
  /** 법원 경매계 전화 */
  courtTel?: string;
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
  /** 법원별 물건 수 */
  courtsItems?: Record<string, { name: string; count: number }>;
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

/**
 * 매각 단위 키 — 법원경매의 실제 매각단위는 **사건 + 물건번호**다.
 *   · 일괄매각은 한 물건번호 아래 필지·호실이 여러 줄(목적물)로 실린다 → 같은 키로 묶여 1건.
 *     예: 대선제분일대1구역1지구 24줄(2024타경134077, 물건 1) → 1건
 *         쌍문동 모아타운 2-4구역 17줄(2025타경10119, 물건 1) → 1건
 *   · 반대로 호실마다 사건이 따로면 사건 수만큼 센다
 *     예: 쌍문동 507-1일원 호실 132개(2025타경4725 등 132사건) → 132건
 *   · 같은 사건이라도 물건번호가 다르면 따로 매각되는 물건이다(소리마을 10개 호실 → 10건).
 */
export function auctionSaleKey(it: AuctionItem): string {
  return `${it.courtCode}|${it.caseNo}|${it.itemNo || it.objectNo || it.id}`;
}

/** 구역 경매 목록의 실제 매각 건수 — 같은 물건의 목적물 줄(일괄매각 필지·호실)을 1건으로 접는다 */
export function countAuctionSales(items: AuctionItem[]): number {
  const keys = new Set<string>();
  for (const it of items) keys.add(auctionSaleKey(it));
  return keys.size;
}

/** 사건 수(법원+사건번호) — 화면에 ‘사건 N개’로 병기한다 */
export function countAuctionCases(items: AuctionItem[]): number {
  const keys = new Set<string>();
  for (const it of items) keys.add(`${it.courtCode}|${it.caseNo}`);
  return keys.size;
}

/**
 * 매수신청보증금(입찰보증금) — **최저매각가격의 10%**.
 *   · 민사집행법상 부동산 매수신청보증금은 최저매각가격의 10%가 원칙이고(법원이 따로 정한 경우 예외),
 *     대법원 사건상세의 `prchDposRate` 도 보통 10 이다. 상세 데이터에 법원 고시 요율이 있으면
 *     그 값을(`AuctionDetail.depositRate`) 쓰고, 없으면 10%로 계산해 **계산값임을 화면에 밝힌다**.
 *   · 원 단위 그대로 돌려준다(표시는 formatWon 이 만원 단위로 줄인다).
 */
export function minimumDeposit(
  minimum: number | null | undefined,
  ratePct: number | null | undefined = 10
): number | null {
  if (!minimum || minimum <= 0) return null;
  const rate = typeof ratePct === "number" && ratePct > 0 ? ratePct : 10;
  return Math.round((minimum * rate) / 100);
}

/** 사건번호 짧은 표기 — `서울중앙지방법원 2023타경104875` → `2023타경104875` */
export function shortCaseNo(it: Pick<AuctionItem, "caseYear" | "casePart" | "caseSerial" | "caseNoPrint" | "court" | "caseNo">): string {
  if (it.caseYear && it.casePart && it.caseSerial) {
    return `${it.caseYear}${it.casePart}${it.caseSerial}`;
  }
  const stripped = (it.caseNoPrint || "").replace(it.court, "").trim();
  return stripped || it.caseNo;
}

/**
 * 비고(법원 원문)에서 **입찰 판단을 가르는 특수권리·조건**만 뽑는다.
 *   · 원문 문자열을 그대로 보여 주는 것이 원칙이고, 이 함수는 그 위에 눈에 띄는 딱지만 붙인다.
 *   · 없는 것을 만들어 내지 않는다 — 키워드가 원문에 있을 때만 돌려준다.
 */
export type AuctionNoteFlag = { key: string; label: string; tone: "rose" | "amber" | "slate" };

const NOTE_FLAGS: { key: string; label: string; tone: AuctionNoteFlag["tone"]; test: RegExp }[] = [
  { key: "bulk", label: "일괄매각", tone: "amber", test: /일괄\s*매각|일괄매수/ },
  { key: "share", label: "지분매각", tone: "rose", test: /지분\s*매각|지분에\s*관한/ },
  { key: "resale", label: "재매각", tone: "amber", test: /재매각/ },
  { key: "lease", label: "선순위 임차인", tone: "rose", test: /선순위\s*(임차|전세|보증금)|임차인\s*있음|대항력/ },
  { key: "lien", label: "유치권", tone: "rose", test: /유치권/ },
  { key: "legal", label: "법정지상권", tone: "rose", test: /법정지상권/ },
  { key: "appeal", label: "항고·소송", tone: "amber", test: /항고|소송|이의/ },
  { key: "farmland", label: "농지취득자격", tone: "slate", test: /농지취득|농지\s*매매/ },
  { key: "ground", label: "토지별도등기", tone: "amber", test: /토지별도등기|별도등기/ },
  { key: "demolish", label: "제시외 건물", tone: "amber", test: /제시외/ },
  { key: "permit", label: "관청 허가", tone: "slate", test: /허가\s*필요|인가\s*필요/ },
];

export function auctionNoteFlags(note: string | null | undefined): AuctionNoteFlag[] {
  const text = note || "";
  if (!text.trim()) return [];
  return NOTE_FLAGS.filter((f) => f.test.test(text)).map(({ key, label, tone }) => ({ key, label, tone }));
}

/**
 * 매각기일 기준 진행 상태 — 데이터에 진행상태 코드가 없을 때 **날짜로만** 말할 수 있는 것.
 *   · `공고중`·`진행중` 같은 법원 상태 코드를 추정하지 않는다. 지난 기일이면 `기일 경과`.
 *   · 오늘과 같은 날이면 `오늘 매각기일`.
 */
export function auctionDateStatus(saleDate: string): "오늘 매각기일" | "매각기일 전" | "기일 경과" | "" {
  const d = daysUntilSale(saleDate);
  if (d == null) return "";
  if (d === 0) return "오늘 매각기일";
  return d > 0 ? "매각기일 전" : "기일 경과";
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
