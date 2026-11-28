// ─────────────────────────────────────────────────────────────────────────────
// ⚖️ 지도 위 경매 물건 핀 — `public/data/auctions.json` 의 물건을 **매각단위**로 묶는다
//
//   · 법원경매의 매각단위는 **사건 + 물건번호**다(`auctionSaleKey`).
//     - 일괄매각은 한 물건번호 아래 필지·호실이 여러 줄(목적물)로 실린다 → 지도에도 **핀 1개**.
//       예: 대선제분일대1구역1지구 24줄(2024타경134077, 물건 1)
//           → `⚖️ 406.3억 · 일괄` / `목적물 24개 · 11.24`
//     - 목적물이 여러 필지에 흩어진 일괄매각은 **중심점**에 핀 하나를 찍는다(필지마다 24개 핀 금지).
//     - 반대로 호실마다 사건이 따로면(쌍문동 507-1일원 132사건) 매각단위가 132개지만 **좌표가 같아**
//       한 자리에 모인다 → `⚖️ 1.6억~` / `물건 132건 · 11.24`
//   · 핀은 두 줄: `⚖️ 2.0억` / `11.24 · 유찰 1회`. 묶인 핀은 `⚖️ 1.6억~` / `물건 109건`.
//   · 실거래 핀(TxMapPin)과 같은 모양·같은 자리 규칙(아래 끝이 지점)을 쓴다 — 지도에서
//     두 핀이 한눈에 구분되도록 색만 앰버(경매)로 다르다.
// ─────────────────────────────────────────────────────────────────────────────
import { auctionSaleKey, type AuctionItem } from "./auctions";

export type AuctionMapPin = {
  /** 핀 id — 같은 자리에 모인 단위는 좌표 키, 흩어진 일괄매각은 매각단위 키 */
  id: string;
  lat: number;
  lng: number;
  /** 핀 첫 줄 — 최저가 (`2.0억` / 여러 건이면 `2.0억~` / 일괄매각이면 `406.3억 · 일괄`) */
  priceLabel: string;
  /** 핀 둘째 줄 — `11.24 · 유찰 1회` / `물건 4건 · 11.24` / `목적물 24개 · 11.24` */
  subLabel: string;
  /** 이 핀에 모인 물건(목적물 줄) — 최저가 낮은 순, 같으면 매각기일 순 */
  items: AuctionItem[];
  /** 대표 물건 — 카드 머리에 사건번호·주소를 보여 준다 */
  lead: AuctionItem;
  /** 이 핀에 접힌 매각단위(법원+사건+물건번호) 수 */
  saleUnits: number;
  /** 접힌 목적물(필지·호실) 줄 수 — `saleUnits` 보다 크면 일괄매각이 섞여 있다 */
  parcels: number;
  /** 핀 하나가 일괄매각 1건(목적물 여러 개를 한꺼번에 매각)인가 */
  bulk: boolean;
  /**
   * 매각 채널 — 없으면 법원 경매(⚖️). `onbid` 면 온비드 공매(🏛️) 핀이다.
   *   같은 레이어·같은 배치 규칙을 쓰되 색·아이콘·클릭 처리를 채널로 가른다(lib/gongmae.ts).
   */
  channel?: "court" | "onbid";
};

/** 원 → 핀에 들어가는 짧은 금액 (`2.0억` · `8,500만`) */
export function shortAuctionWon(v: number | null | undefined): string {
  if (!v || v <= 0) return "-";
  if (v >= 100000000) {
    const eok = v / 100000000;
    return `${Number.isInteger(Math.round(eok * 10) / 10) ? Math.round(eok) : eok.toFixed(1)}억`;
  }
  return `${Math.round(v / 10000).toLocaleString()}만`;
}

/** YYYYMMDD → `11.24` (핀 둘째 줄은 좁아 요일을 뺀다) */
export function shortSaleDate(ymd: string): string {
  if (!ymd || ymd.length !== 8) return "";
  return `${Number(ymd.slice(4, 6))}.${Number(ymd.slice(6, 8))}`;
}

const coordKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** 두 좌표 사이 거리(m) — 좁은 근사(서울 규모에서 오차 < 1m) */
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dy = (aLat - bLat) * 111320;
  const dx = (aLng - bLng) * 111320 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * 목적물이 이만큼 넘게 흩어져 있으면 중심점을 쓰지 않는다 — 한 필지 블록(대선제분 24필지 31m)은
 * 중심점이 곧 그 블록이지만, 1km 떨어진 다른 동네 건물까지 섞인 일괄매각은 중심점이 아무 데도 아닌
 * 자리에 찍힌다. 그럴 때는 대표 목적물 자리에 핀을 찍고 나머지는 카드 목록에서 보여 준다.
 */
const SPREAD_LIMIT_M = 300;

const byMinThenDate = (a: AuctionItem, b: AuctionItem) =>
  (a.minimum ?? Infinity) - (b.minimum ?? Infinity) ||
  (a.saleDate || "99999999").localeCompare(b.saleDate || "99999999");

/** 가장 많은 물건이 속한 구역 — 일괄매각이 구역 경계에 걸쳐도 대표 구역이 흔들리지 않게 */
function modalZoneId(items: AuctionItem[]): string {
  const count = new Map<string, number>();
  for (const it of items) count.set(it.zoneId, (count.get(it.zoneId) ?? 0) + 1);
  let best = items[0]?.zoneId ?? "";
  let bestN = -1;
  for (const [zoneId, n] of count) {
    if (n > bestN || (n === bestN && zoneId.localeCompare(best) < 0)) {
      best = zoneId;
      bestN = n;
    }
  }
  return best;
}

/** 매각단위(사건+물건번호) 하나 — 목적물 여러 줄이면 좌표는 중심점, 가격은 법원의 최저매각가격 */
type SaleUnit = {
  key: string;
  items: AuctionItem[];
  lat: number;
  lng: number;
  minimum: number | null;
  saleDate: string;
};

/**
 * 경매 물건 목록 → 지도 핀 목록.
 *   · 좌표가 없는 물건(지오코딩 실패)은 핀을 찍을 수 없으므로 뺀다(패널 목록에는 남아 있다).
 *   · 일괄매각은 목적물 줄 수와 무관하게 **1핀**이다 — 대선제분 24줄 → 핀 1개.
 */
export function buildAuctionPins(items: AuctionItem[]): AuctionMapPin[] {
  // ① 매각단위(법원+사건+물건번호)로 묶는다 — 일괄매각의 목적물 여러 줄은 1건이다
  const unitMap = new Map<string, AuctionItem[]>();
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
    const key = auctionSaleKey(it);
    const arr = unitMap.get(key);
    if (arr) arr.push(it);
    else unitMap.set(key, [it]);
  }

  // ② 단위마다 대표 좌표 — 목적물이 한 블록에 흩어져 있으면 그 중심점, 멀리 떨어져 있으면 대표 목적물 자리
  const units: SaleUnit[] = [];
  for (const [key, list] of unitMap) {
    const sorted = [...list].sort(byMinThenDate);
    const spread = new Set(sorted.map((i) => coordKey(i.lat, i.lng))).size > 1;
    const cLat = sorted.reduce((s, i) => s + i.lat, 0) / sorted.length;
    const cLng = sorted.reduce((s, i) => s + i.lng, 0) / sorted.length;
    const tooFar = spread && sorted.some((i) => metersBetween(i.lat, i.lng, cLat, cLng) > SPREAD_LIMIT_M);
    const mins = sorted.map((i) => i.minimum).filter((v): v is number => !!v && v > 0);
    const dates = sorted.map((i) => i.saleDate).filter(Boolean).sort();
    units.push({
      key,
      items: sorted,
      lat: spread && !tooFar ? cLat : sorted[0].lat,
      lng: spread && !tooFar ? cLng : sorted[0].lng,
      // 일괄매각은 목적물마다 같은 최저매각가격이 실린다 — 더하지 않고 그 값을 쓴다(406.3억)
      minimum: mins.length ? Math.min(...mins) : null,
      saleDate: dates[0] ?? "",
    });
  }

  // ③ 대표 좌표가 같은 단위는 한 자리에 모인다(쌍문동 507-1일원 호실 132사건 → 핀 1개)
  const bySpot = new Map<string, SaleUnit[]>();
  for (const u of units) {
    const key = coordKey(u.lat, u.lng);
    const arr = bySpot.get(key);
    if (arr) arr.push(u);
    else bySpot.set(key, [u]);
  }

  const pins: AuctionMapPin[] = [];
  for (const spotUnits of bySpot.values()) {
    const all = spotUnits.flatMap((u) => u.items).sort(byMinThenDate);
    const zoneId = modalZoneId(all);
    const lead = all.find((i) => i.zoneId === zoneId) ?? all[0];
    const mins = spotUnits.map((u) => u.minimum).filter((v): v is number => !!v && v > 0);
    const min = mins.length ? Math.min(...mins) : null;
    const max = mins.length ? Math.max(...mins) : null;

    const saleUnits = spotUnits.length;
    const parcels = all.length;
    /** 핀 하나 = 일괄매각 1건 (목적물 여러 개를 한꺼번에 매각) */
    const bulk = saleUnits === 1 && parcels > 1;
    /** 이 자리에 일괄매각이 섞여 있는가 */
    const hasBulk = spotUnits.some((u) => u.items.length > 1);

    const dates = new Set(spotUnits.map((u) => u.saleDate).filter(Boolean));
    const day = dates.size === 1 ? shortSaleDate([...dates][0]) : "";
    const fail = lead.failCount && lead.failCount > 0 ? `유찰 ${lead.failCount}회` : "신건";
    const range = min != null && max != null && max > min ? "~" : "";

    let priceLabel: string;
    let subLabel: string;
    if (bulk) {
      // 일괄매각 — 목적물이 몇 개든 매각은 1건. 금액은 법원이 고시한 일괄 전체 최저가다
      priceLabel = `${shortAuctionWon(min)} · 일괄`;
      subLabel = `목적물 ${parcels}개${day ? ` · ${day}` : ""}`;
    } else if (saleUnits > 1) {
      // 한 자리에 사건·물건번호가 여럿(호실별 개별 매각) — 기존처럼 건수로 보여 준다
      priceLabel = `${shortAuctionWon(min)}${range}${hasBulk ? " · 일괄" : ""}`;
      subLabel = `물건 ${saleUnits}건${hasBulk ? ` · 목적물 ${parcels}개` : ""}${day ? ` · ${day}` : ""}`;
    } else {
      priceLabel = shortAuctionWon(min);
      subLabel = day ? `${day} · ${fail}` : fail;
    }

    // id — 한 좌표에 모인 핀은 예전과 같은 좌표 키, 흩어진 일괄매각은 매각단위 키
    const oneSpot = new Set(all.map((i) => coordKey(i.lat, i.lng))).size === 1;
    const id = oneSpot
      ? coordKey(lead.lat, lead.lng)
      : `sale:${spotUnits.map((u) => u.key).sort().join("|")}`;

    pins.push({
      id,
      lat: spotUnits[0].lat,
      lng: spotUnits[0].lng,
      priceLabel,
      subLabel,
      items: all,
      lead,
      saleUnits,
      parcels,
      bulk,
    });
  }

  // 매각기일이 가까운 핀부터 — 겹칠 때 지도가 급한 물건을 남긴다
  return pins.sort(
    (a, b) =>
      (a.lead.saleDate || "99999999").localeCompare(b.lead.saleDate || "99999999") ||
      (a.lead.minimum ?? Infinity) - (b.lead.minimum ?? Infinity)
  );
}
