"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 매수자 열람권 (유료) — 검증 매물 상세 + 총투자금 시뮬레이션
// 모의 결제 플로우: 실제 결제 연동 시 TossPayments/PayApp 등으로 교체 (README 참고)
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import type { Listing, Zone } from "@/lib/types";
import {
  calcInitialInvestment,
  calcImpliedRights,
  calcTotalRequired,
  EST_OTHER_COST_RATE,
  UNLOCK_PRICE,
} from "@/lib/types";
import { formatMan } from "@/lib/format";
import { Badge, TypeBadge } from "./Badges";

export function UnlockModal({
  listing,
  zone,
  onClose,
  onUnlocked,
}: {
  listing: Listing;
  zone?: Zone;
  onClose: () => void;
  onUnlocked: (id: string) => void;
}) {
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  const rows = [
    { label: "매매가", value: listing.salePrice, hint: "권리금 포함 매도 희망가" },
    ...(listing.transferFeeIncluded && listing.transferFee
      ? [{ label: "불하금", value: listing.transferFee, hint: "조합원 지위 이전 비용" }]
      : []),
    {
      label: "부대비용 (약 " + Math.round(EST_OTHER_COST_RATE * 100) + "%)",
      value: Math.round(listing.salePrice * EST_OTHER_COST_RATE),
      hint: "취득세·등기·중개보수 등 추정",
    },
  ];
  const initial = calcInitialInvestment(listing);
  const total = calcTotalRequired(listing);

  function pay() {
    setPaying(true);
    // 모의 결제: 실제 연동 시 결제위젯 SDK로 교체
    setTimeout(() => {
      setPaying(false);
      setDone(true);
      onUnlocked(listing.id);
    }, 700);
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        {!done ? (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">검증 매물 열람권</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="닫기">
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              매물 1건 상세(중개사 직통 연락처·투자 시뮬레이션)를 <b>열람권 {formatMan(UNLOCK_PRICE)}</b>에
              확인합니다.
            </p>
            <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <TypeBadge type={zone?.type ?? "일반재개발"} />
                <span className="font-semibold">{zone?.name}</span>
                <Badge tone={listing.verified ? "green" : "slate"}>
                  {listing.verified ? "검증 매물" : "미검증"}
                </Badge>
              </div>
              <div className="text-slate-600">
                {listing.unitType} · 매매가 {formatMan(listing.salePrice)} · {listing.brokerAgency}
              </div>
            </div>
            <button
              onClick={pay}
              disabled={paying}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {paying ? "결제 처리 중…" : "열람권 구매 — " + formatMan(UNLOCK_PRICE) + " (모의 결제)"}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">
              ※ MVP 모의 결제. 실서비스 시 결제대행(PG) 연동 필요
            </p>
          </>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">총투자금 시뮬레이션</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="닫기">
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              추정치이며 실제 분담금은 관리처분계획 확정액에 따릅니다.
            </p>
            <table className="mb-4 w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-600">
                      {r.label}
                      <span className="ml-1 text-xs text-slate-400">{r.hint}</span>
                    </td>
                    <td className="py-1.5 text-right font-medium">{formatMan(r.value)}</td>
                  </tr>
                ))}
                <tr className="border-b-2 border-slate-300 bg-slate-50">
                  <td className="py-1.5 font-semibold">초기투자금</td>
                  <td className="py-1.5 text-right font-bold">{formatMan(initial)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600">예상 전세 보증금 회수</td>
                  <td className="py-1.5 text-right text-emerald-600">-{formatMan(listing.expectedJeonse)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600">예상 추가분담금</td>
                  <td className="py-1.5 text-right">{formatMan(listing.expectedAdditionalCost)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600">추정 권리가액 (감정가 대비)</td>
                  <td className="py-1.5 text-right">{formatMan(calcImpliedRights(listing))}</td>
                </tr>
                <tr className="border-b-2 border-slate-300 bg-blue-50">
                  <td className="py-2 font-semibold">총 소요자금 (입주 시점까지)</td>
                  <td className="py-2 text-right text-base font-bold text-blue-700">{formatMan(total)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">중개사 직통 연락처</p>
              <p className="text-slate-700">
                {listing.brokerName} ({listing.brokerAgency}) · <b className="text-blue-700">{listing.brokerPhone}</b>
              </p>
              <p className="text-xs text-slate-500">개설등록번호 {listing.brokerLicense}</p>
            </div>
            <button onClick={onClose} className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">
              확인
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
