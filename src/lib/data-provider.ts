// ─────────────────────────────────────────────────────────────────────────────
// data-provider — 데이터 소스 어댑터 계층
//
// 지금은 샘플(mock) 프로바이더가 응답하고, .env로 실데이터 소스로 교체한다.
//
//   NEXT_PUBLIC_DATA_SOURCE=mock            # mock | molit
//   MOLIT_API_KEY=...                       # 국토부 실거래가 공공데이터 API 키 (서버 전용)
//   MOLIT_BASE_URL=https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade
//   EUM_API_KEY=...                         # 정비사업 정보몽땅 (https://www.eum.go.kr) 연동 키
//
// 실제 연동 가이드는 scripts/README-gis.md와 README.md 참고.
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing, Transaction, Zone } from "@/lib/types";
import { LISTINGS, TRANSACTIONS, ZONES } from "@/data/sample";

export interface DataProvider {
  name: string;
  getZones(): Promise<Zone[]>;
  getTransactions(zoneId?: string): Promise<Transaction[]>;
  getListings(zoneId?: string): Promise<Listing[]>;
}

/** 샘플 데이터 프로바이더 — MVP 기본값 */
export const mockProvider: DataProvider = {
  name: "mock",
  async getZones() {
    await delay(120); // 네트워크 체감용
    return ZONES;
  },
  async getTransactions(zoneId) {
    await delay(60);
    return zoneId ? TRANSACTIONS.filter((t) => t.zoneId === zoneId) : TRANSACTIONS;
  },
  async getListings(zoneId) {
    await delay(60);
    return zoneId ? LISTINGS.filter((l) => l.zoneId === zoneId) : LISTINGS;
  },
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 국토부 실거래가 API 어댑터 (골격).
 * 서버 라우트(app/api/transactions/route.ts)에서 호출해 키를 감춘 뒤
 * 이 프로바이더를 교체하면 프론트 수정 없이 실데이터로 전환된다.
 *
 * 예시 요청:
 *   GET {MOLIT_BASE_URL}?serviceKey={MOLIT_API_KEY}&LAWD_CD=11620&DEAL_YMD=202610&pageNo=1&numOfRows=100&_type=json
 *   LAWD_CD: 법정동 코드 앞 5자리 (신림동 11620, 반포동 11650 ...)
 *
 * TODO(실연동):
 *  1. 응답 item → Transaction 매핑 (거래금액 "64,000" → 64000, 전용면적 → areaSqm)
 *  2. 공시지가는 개별공시가격 API(1611000/vpcUpindStdList)로 별도 조회 후 배수 계산
 *  3. 정비구역 매핑: 구역 경계 폴리곤(WFS)으로 클러스터링 후 zoneId 부여
 */
// export const molitProvider: DataProvider = { ... };

export function getProvider(): DataProvider {
  const source = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock";
  if (source === "molit") {
    // 실연동 전까지는 mock으로 폴백 (빌드/데모 안전)
    return mockProvider;
  }
  return mockProvider;
}
