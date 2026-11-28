// ─────────────────────────────────────────────────────────────────────────────
// 경매 물건 **종합의견** — `public/data/auction-opinions.json`
//
//   · `scripts/gen-auction-opinions.mjs` 가 `auctions.json` + `auction-details.json` 을 읽어
//     물건마다 점수·판정(매력/검토/주의)·매력·주의·요약을 미리 만들어 둔 파일이다.
//   · 규칙은 `src/lib/auction-signals.ts` 한 곳에 있고, 배치는 그 파일을 그대로 컴파일해 쓴다
//     — 화면의 뱃지와 종합의견의 근거가 어긋나지 않는다.
//   · 파일이 없으면 화면은 종합의견 카드를 그리지 않는다(값을 추정해 만들지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import type { AuctionBuildingFacts, AuctionVerdict } from "@/lib/auction-signals";

export type { AuctionBuildingFacts, AuctionVerdict };

export type AuctionOpinionRecord = {
  /** 규칙 기반 참고 점수 0~100 */
  score: number;
  verdict: AuctionVerdict;
  headline: string;
  merits: string[];
  risks: string[];
  summary: string;
  building: AuctionBuildingFacts;
};

export type AuctionOpinionsData = {
  meta: {
    source: string;
    generatedAt: string;
    itemCount: number;
    engine?: string;
    note?: string;
  };
  byId: Record<string, AuctionOpinionRecord>;
};

const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const AUCTION_OPINIONS_URL = `/data/auction-opinions.json?v=${encodeURIComponent(DATA_VERSION)}`;

let cache: Promise<AuctionOpinionsData | null> | null = null;

/** 종합의견 — 한 번만 받아 세션 동안 재사용한다. 404·형식 오류면 null */
export function loadAuctionOpinions(): Promise<AuctionOpinionsData | null> {
  if (!cache) {
    cache = fetch(AUCTION_OPINIONS_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<AuctionOpinionsData>;
      })
      .catch(() => null);
  }
  return cache;
}

export function opinionFor(
  data: AuctionOpinionsData | null,
  id: string | null | undefined
): AuctionOpinionRecord | undefined {
  if (!data || !id) return undefined;
  return data.byId[id];
}
