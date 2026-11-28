// ─────────────────────────────────────────────────────────────────────────────
// 구역 내 온비드 공매 물건 — `public/data/gongmae.json`
//
//   · 출처: 공공데이터포털 「한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스」(15157207)
//     (scripts/fetch-onbid-gongmae.py → 지번 좌표 scripts/geocode-onbid.py
//      → 구역 경계 매칭 scripts/build-gongmae-zones.py)
//   · 서울특별시 소재·입찰이 끝나지 않은(입찰 예정·진행 중) 부동산 공매 물건만 담는다.
//   · 법원경매(auctions.json)와 **같은 구역 경계**로 매칭하지만 데이터는 따로 둔다 —
//     경매 데이터·경계는 이 작업에서 건드리지 않는다.
//   · 화면에서는 경매와 같은 지도 핀·패널을 쓰되 채널(`channel: "onbid"`)로 갈라 그린다.
//     핀·목록 컴포넌트가 요구하는 모양은 `gongmaeAsAuction()` 이 경매 물건 모양으로 맞춰 준다.
// ─────────────────────────────────────────────────────────────────────────────
import { buildAuctionPins, shortAuctionWon, shortSaleDate, type AuctionMapPin } from "./auction-pins";
import type { AuctionItem } from "./auctions";

export type GongmaeItem = {
  /** `onbid:{물건관리번호}:{공매조건번호}` */
  id: string;
  /** 물건관리번호 — 온비드 화면에서 이 번호로 찾는다 */
  cltrMngNo: string;
  pbctCdtnNo: number;
  onbidCltrno: number;
  onbidPbancNo: number | null;
  /** 물건명(온비드 원문) */
  name: string;
  /** 용도 소분류·중분류 — 예: 판매시설 / 상가용및업무용건물 */
  usage: string;
  usageMid: string;
  /** 재산유형 — 압류재산 · 공유재산 · 국유재산 … */
  prptDivNm: string;
  /** 공고기관·의뢰기관 — 예: 서울특별시 */
  rqstOrgNm: string;
  address: string;
  jibun: string;
  gu: string;
  dong: string;
  /** 감정평가액(원) */
  appraised: number | null;
  /** 최저입찰가격(원) */
  minimum: number | null;
  /** 최저입찰가격 원문(숫자가 아닐 수 있다) */
  minimumText: string;
  /** 감정가 대비 최저입찰가(%) */
  minimumRate: number | null;
  /** 유찰횟수 */
  failCount: number | null;
  /** 입찰기간 YYYYMMDDHHmm */
  bidStart: string;
  bidEnd: string;
  bidEndDate: string;
  bidEndTime: string;
  statusCd: string;
  /** 입찰준비중 · 입찰진행중 · 수의계약가능 … */
  status: string;
  pvctTrgtYn: string;
  batcBidYn: string;
  alcYn: string;
  landSqms: number;
  bldSqms: number;
  area: string;
  dtbtRqrEdtmCont: string;
  evcRsbyTrgtCont: string;
  img: string;
  lat: number;
  lng: number;
  zoneId: string;
  zoneName: string;
  zoneIds: string[];
  detailUrl: string;
};

export type GongmaeMeta = {
  source: string;
  collectedAt: string;
  basisDate: string;
  seoulItems: number;
  activeItems: number;
  geocoded: number;
  matched: number;
  zonesWithGongmae: number;
  byStatus?: Record<string, number>;
  byGu?: Record<string, number>;
  note?: string;
};

export type GongmaeData = {
  meta: GongmaeMeta;
  byZone: Record<string, GongmaeItem[]>;
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const GONGMAE_URL = `/data/gongmae.json?v=${encodeURIComponent(DATA_VERSION)}`;
/** 온비드 물건검색(조건검색) — 물건 상세는 딥링크가 없어 여기서 물건관리번호로 찾는다 */
export const ONBID_SEARCH_URL =
  "https://www.onbid.co.kr/op/cltrpbancinf/cltr/cltrcdtnsrch/CltrCdtnSrchController/mvmnCltrCdtnSrchClg.do";

let cache: Promise<GongmaeData | null> | null = null;

/** 구역 공매 데이터 — 한 번만 받아 세션 동안 재사용한다. 실패하면 null(공매 탭을 그리지 않는다) */
export function loadGongmae(): Promise<GongmaeData | null> {
  if (!cache) {
    cache = fetch(GONGMAE_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`gongmae ${r.status}`);
        return r.json() as Promise<GongmaeData>;
      })
      .catch((e) => {
        console.warn("[gongmae] 구역 공매 데이터를 불러오지 못했습니다", e);
        cache = null;
        return null;
      });
  }
  return cache;
}

/** 경매 물건 모양 + 원본 공매 항목 — 패널·핀 컴포넌트가 경매와 같은 코드로 그린다 */
export type GongmaeAuctionItem = AuctionItem & { gongmae: GongmaeItem };

export function isGongmaeItem(it: AuctionItem): it is GongmaeAuctionItem {
  return !!(it as GongmaeAuctionItem).gongmae;
}

/**
 * 공매 항목 → 경매 물건 모양.
 *   · 사건·법원 자리에 온비드 값(물건관리번호·공매조건번호)을 넣는다 — 화면 라벨은 채널로 갈라 쓴다.
 *   · 없는 값은 만들지 않는다(예: 지목·법원계·매각장소는 빈 문자열).
 */
export function gongmaeAsAuction(g: GongmaeItem): GongmaeAuctionItem {
  return {
    id: g.id,
    court: "온비드",
    courtCode: "ONBID",
    caseNo: g.cltrMngNo,
    caseNoPrint: `온비드 ${g.cltrMngNo}`,
    itemNo: String(g.pbctCdtnNo),
    objectNo: String(g.onbidCltrno),
    usage: g.usage || g.usageMid,
    address: g.address || g.name,
    jibun: g.jibun,
    building: "",
    appraised: g.appraised,
    minimum: g.minimum,
    minimumRate: g.minimumRate,
    failCount: g.failCount,
    saleDate: g.bidEndDate,
    saleTime: g.bidEndTime,
    area: g.area,
    landCategory: "",
    note: [g.status, g.prptDivNm].filter(Boolean).join(" · "),
    lat: g.lat,
    lng: g.lng,
    zoneId: g.zoneId,
    zoneName: g.zoneName,
    zoneIds: g.zoneIds,
    caseYear: "",
    casePart: "",
    caseSerial: "",
    detailUrl: g.detailUrl || ONBID_SEARCH_URL,
    gongmae: g,
  };
}

/** 공매 건수 — 한 줄이 물건·공매조건 1건이라 줄 수가 곧 건수다 */
export function countGongmae(items: AuctionItem[]): number {
  return items.length;
}

/**
 * 공매 지도 핀 — 경매와 같은 배치 규칙(같은 좌표는 한 핀, 흩어진 일괄입찰은 대표 자리)을 쓰고,
 * 둘째 줄만 공매 문법(`11.30 마감`)으로 바꾼다.
 */
export function buildGongmaePins(items: GongmaeAuctionItem[]): AuctionMapPin[] {
  const pins = buildAuctionPins(items);
  return pins.map((p) => {
    const g = (p.lead as GongmaeAuctionItem).gongmae;
    const day = shortSaleDate(g.bidEndDate);
    const fail = g.failCount && g.failCount > 0 ? ` · 유찰 ${g.failCount}회` : "";
    const min = p.items.reduce<number | null>(
      (acc, it) => (it.minimum && (!acc || it.minimum < acc) ? it.minimum : acc),
      null
    );
    const multi = p.saleUnits > 1;
    return {
      ...p,
      channel: "onbid" as const,
      priceLabel: multi ? `${shortAuctionWon(min)}~` : shortAuctionWon(min),
      subLabel: multi ? `공매 ${p.saleUnits}건${day ? ` · ${day}` : ""}` : `${day} 마감${fail}`,
    };
  });
}

/** YYYYMMDDHHmm → `11.30(일) 17:00` */
export function formatBidPeriod(start: string, end: string): string {
  const f = (v: string) => {
    if (!v || v.length < 12) return v || "-";
    const y = Number(v.slice(0, 4)), mo = Number(v.slice(4, 6)), d = Number(v.slice(6, 8));
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
    return `${mo}.${d}(${wd}) ${v.slice(8, 10)}:${v.slice(10, 12)}`;
  };
  return `${f(start)} ~ ${f(end)}`;
}

/** 입찰 마감까지 남은 일수 — 오늘(로컬) 기준 */
export function daysUntilBidEnd(ymd: string): number | null {
  if (!ymd || ymd.length !== 8) return null;
  const target = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
