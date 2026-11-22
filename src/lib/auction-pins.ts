// ─────────────────────────────────────────────────────────────────────────────
// ⚖️ 지도 위 경매 물건 핀 — `public/data/auctions.json` 의 물건을 좌표로 묶는다
//
//   · 같은 지번(같은 좌표)에 여러 호실이 있으면 **핀 하나**로 묶는다.
//     예: 쌍문동 507-1일원 한 사건에 109개 호실 → 지도에 109개 핀이 늘어서지 않게.
//   · 핀은 두 줄: `⚖️ 2.0억` / `11.24 · 유찰 1회`. 묶인 핀은 `⚖️ 2.0억~` / `물건 109건`.
//   · 실거래 핀(TxMapPin)과 같은 모양·같은 자리 규칙(아래 끝이 지점)을 쓴다 — 지도에서
//     두 핀이 한눈에 구분되도록 색만 앰버(경매)로 다르다.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuctionItem } from "./auctions";

export type AuctionMapPin = {
  /** 좌표 키 — 같은 좌표의 물건은 이 id 하나로 묶인다 */
  id: string;
  lat: number;
  lng: number;
  /** 핀 첫 줄 — 최저가 (`2.0억` / 여러 건이면 `2.0억~`) */
  priceLabel: string;
  /** 핀 둘째 줄 — `11.24 · 유찰 1회` / `물건 4건 · 11.24` */
  subLabel: string;
  /** 이 좌표에 묶인 물건 — 최저가 낮은 순, 같으면 매각기일 순 */
  items: AuctionItem[];
  /** 대표 물건 — 카드 머리에 사건번호·주소를 보여 준다 */
  lead: AuctionItem;
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

/**
 * 경매 물건 목록 → 지도 핀 목록.
 *   · 좌표가 없는 물건(지오코딩 실패)은 핀을 찍을 수 없으므로 뺀다(패널 목록에는 남아 있다).
 */
export function buildAuctionPins(items: AuctionItem[]): AuctionMapPin[] {
  const groups = new Map<string, AuctionItem[]>();
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
    const key = coordKey(it.lat, it.lng);
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  const pins: AuctionMapPin[] = [];
  for (const [id, list] of groups) {
    const sorted = [...list].sort(
      (a, b) =>
        (a.minimum ?? Infinity) - (b.minimum ?? Infinity) ||
        (a.saleDate || "99999999").localeCompare(b.saleDate || "99999999")
    );
    const lead = sorted[0];
    const mins = sorted.map((i) => i.minimum).filter((v): v is number => !!v && v > 0);
    const min = mins.length ? Math.min(...mins) : null;
    const max = mins.length ? Math.max(...mins) : null;

    const priceLabel = `${shortAuctionWon(min)}${min != null && max != null && max > min ? "~" : ""}`;
    let subLabel: string;
    if (sorted.length > 1) {
      const dates = new Set(sorted.map((i) => i.saleDate).filter(Boolean));
      const day = dates.size === 1 ? shortSaleDate([...dates][0]) : "";
      subLabel = `물건 ${sorted.length}건${day ? ` · ${day}` : ""}`;
    } else {
      const day = shortSaleDate(lead.saleDate);
      const fail = lead.failCount && lead.failCount > 0 ? `유찰 ${lead.failCount}회` : "신건";
      subLabel = day ? `${day} · ${fail}` : fail;
    }

    pins.push({ id, lat: lead.lat, lng: lead.lng, priceLabel, subLabel, items: sorted, lead });
  }

  // 매각기일이 가까운 핀부터 — 겹칠 때 지도가 급한 물건을 남긴다
  return pins.sort(
    (a, b) =>
      (a.lead.saleDate || "99999999").localeCompare(b.lead.saleDate || "99999999") ||
      (a.lead.minimum ?? Infinity) - (b.lead.minimum ?? Infinity)
  );
}
