"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ListingCompare — 구역 내 매물 비교 (갈타맵 스타일 컬럼 비교 + 재개발뷰 뱃지)
//   · 매매가·기보증금·**초기투자금**은 목록·매물 카드와 같이 무료 공개한다 — 초기투자금으로
//     걸러 보는 것이 지방 투자자의 첫 동작이라, 같은 화면에서 어떤 매물은 잠겨 있으면 안 된다.
//   · 유료(열람권)는 **추정 권리가액·투자 시뮬레이션·중개사 직통 연락처**만.
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing, Zone } from "@/lib/types";
import { calcImpliedRights, calcInitialInvestment, UNLOCK_PRICE } from "@/lib/types";
import { formatMan } from "@/lib/format";
import { Badge } from "./Badges";

export function ListingCompare({
  listings,
  zones,
  unlockedIds,
  onUnlockRequest,
}: {
  listings: Listing[];
  zones: Zone[];
  unlockedIds: Set<string>;
  onUnlockRequest: (l: Listing) => void;
}) {
  if (listings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        이 구역에 등록된 매물이 없습니다.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2 pr-2 font-medium">매물</th>
            <th className="py-2 pr-2 font-medium">타입</th>
            <th className="py-2 pr-2 text-right font-medium">매매가</th>
            <th className="py-2 pr-2 text-right font-medium">초기투자금</th>
            <th className="py-2 pr-2 text-right font-medium">추정 권리가액</th>
            <th className="py-2 pr-2 font-medium">불하금</th>
            <th className="py-2 font-medium">구역 내 참고순위*</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const zone = zones.find((z) => z.id === l.zoneId);
            const unlocked = unlockedIds.has(l.id);
            const ranked = [...listings]
              .sort((a, b) => a.salePrice - b.salePrice)
              .findIndex((x) => x.id === l.id);
            return (
              <tr key={l.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold">{l.brokerAgency}</span>
                    {l.verified && <Badge tone="green">검증</Badge>}
                  </div>
                  {zone && (
                    <div className="text-xs text-slate-500">
                      {zone.name} · {l.brokerName}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2">{l.unitType}</td>
                <td className="py-2 pr-2 text-right">{formatMan(l.salePrice)}</td>
                <td className="py-2 pr-2 text-right">
                  <span className="font-semibold text-blue-700">{formatMan(calcInitialInvestment(l))}</span>
                </td>
                <td className="py-2 pr-2 text-right">
                  {unlocked ? (
                    formatMan(calcImpliedRights(l))
                  ) : (
                    <button
                      onClick={() => onUnlockRequest(l)}
                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      🔒 열람권 {formatMan(UNLOCK_PRICE)}에 열기
                    </button>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {l.transferFeeIncluded ? (
                    <Badge tone="amber">{formatMan(l.transferFee ?? 0)}</Badge>
                  ) : (
                    <Badge tone="slate">없음</Badge>
                  )}
                </td>
                <td className="py-2 text-xs text-slate-500">매매가 {ranked + 1} / {listings.length}순위</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        * 참고순위는 같은 구역 등록 매물 기준 매매가 낮은 순. 추정 권리가액·투자 시뮬레이션·중개사 직통 연락처는
        열람권 구매 후 확인. 초기투자금은 매매가 − 기보증금으로 계산한 값입니다(부대비용 별도).
      </p>
    </div>
  );
}
