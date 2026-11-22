"use client";
// ─────────────────────────────────────────────────────────────────────────────
// AuctionPinCard — 지도 ⚖️ 경매 핀을 눌렀을 때 뜨는 요약 카드
//
//   · 실무에서 먼저 보는 순서: 사건번호·용도 → 감정가 → 최저가(감정가 대비 %) →
//     유찰횟수 → 매각기일 → (묶인 물건이면 주소) → 대법원 원문.
//   · 같은 좌표에 여러 호실이 묶였으면 물건 2건까지 펼치고 나머지는 `외 N건`으로 줄인다
//     (쌍문동 507-1일원 109건이 카드 하나에 109줄로 늘어서지 않게).
//   · 카드는 핀 위에 뜨고, 지도에는 별도 레이어(z-index 103)로 얹어 구역 이름표(100)에 가리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { daysUntilSale, formatSaleDate, formatWon } from "@/lib/auctions";
import type { AuctionMapPin } from "@/lib/auction-pins";

/** 경매 핀·카드의 앰버 색 — 지도 핀과 같은 값 */
export const AUCTION_ACCENT = "#b45309";

export default function AuctionPinCard({
  pin,
  onClose,
  onOpenZone,
}: {
  pin: AuctionMapPin;
  onClose?: () => void;
  onOpenZone?: (zoneId: string) => void;
}) {
  const lead = pin.lead;
  const many = pin.items.length > 1;
  const shortCase = lead.caseNoPrint.replace(lead.court, "").trim() || lead.caseNo;

  return (
    <div
      data-testid="auction-pin-card"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "266px",
        pointerEvents: "auto",
        background: "#ffffff",
        border: "1px solid #fcd34d",
        borderRadius: "10px",
        boxShadow: "0 12px 28px rgba(15,23,42,.3)",
        padding: "8px 9px",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <span
          style={{
            fontSize: "9px",
            fontWeight: 800,
            color: "#fff",
            background: AUCTION_ACCENT,
            borderRadius: "3px",
            padding: "1px 4px",
          }}
        >
          ⚖️ 경매
        </span>
        <b style={{ fontSize: "12px", color: "#0f172a" }}>
          {many ? `물건 ${pin.items.length}건` : shortCase}
        </b>
        <button
          type="button"
          aria-label="닫기"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          style={{ marginLeft: "auto", pointerEvents: "auto", border: 0, background: "transparent", color: "#94a3b8", fontSize: "11px", cursor: "pointer", lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <p style={{ marginTop: "2px", fontSize: "11px", color: "#64748b" }}>
        {lead.zoneName} · {lead.jibun}
      </p>

      {pin.items.slice(0, 2).map((it) => {
        const d = daysUntilSale(it.saleDate);
        return (
          <div key={it.id} style={{ marginTop: "4px", borderTop: "1px solid #f1f5f9", paddingTop: "3px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>
              {it.caseNoPrint.replace(it.court, "").trim() || it.caseNo}
              {it.usage ? <span style={{ marginLeft: "4px", fontWeight: 500, color: "#64748b" }}>· {it.usage}</span> : null}
            </div>
            <div style={{ fontSize: "11px", color: "#475569" }}>
              감정 {formatWon(it.appraised)} → 최저{" "}
              <b style={{ color: "#b91c1c" }}>{formatWon(it.minimum)}</b>
              {it.minimumRate != null && <span style={{ color: "#b91c1c" }}> ({it.minimumRate}%)</span>}
            </div>
            <div style={{ fontSize: "11px", color: "#475569" }}>
              유찰 {it.failCount ?? 0}회 · 매각 {formatSaleDate(it.saleDate)} {it.saleTime}
              {d != null && d >= 0 && d <= 7 && (
                <b style={{ marginLeft: "3px", color: "#b91c1c" }}>{d === 0 ? "오늘" : `${d}일 뒤`}</b>
              )}
            </div>
            {many && (
              <div style={{ marginTop: "1px", fontSize: "10.5px", color: "#64748b", lineHeight: 1.3 }}>
                {it.address}
              </div>
            )}
          </div>
        );
      })}
      {pin.items.length > 2 && (
        <p style={{ marginTop: "3px", fontSize: "10px", color: "#94a3b8" }}>
          외 {pin.items.length - 2}건 — 구역 상세의 경매 목록에서 전체를 봅니다
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
        <a
          href={lead.detailUrl}
          target="_blank"
          rel="noreferrer"
          title={`${lead.court} ${lead.caseYear}${lead.casePart}${lead.caseSerial} — 대법원 사건검색 화면이 열립니다`}
          style={{
            pointerEvents: "auto",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            background: "#fff",
            padding: "2px 6px",
            fontSize: "10px",
            fontWeight: 600,
            color: "#334155",
            textDecoration: "none",
          }}
        >
          대법원에서 사건 조회 ↗
        </a>
        {onOpenZone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenZone(lead.zoneId);
            }}
            style={{
              pointerEvents: "auto",
              border: "1px solid #cbd5e1",
              borderRadius: "5px",
              background: "#fff",
              padding: "2px 6px",
              fontSize: "10px",
              fontWeight: 600,
              color: "#334155",
              cursor: "pointer",
            }}
          >
            구역 상세 열기
          </button>
        )}
      </div>
    </div>
  );
}
