// 주소 검색 핀 — 말풍선 + 드롭핀 마커의 **공용 생김새**
//
//  ▶ 왜 별도 모듈인가
//    · 카카오맵은 핀을 지도 컨테이너 밖 우리 DOM 레이어에 얹고, OSM 폴백(Leaflet)은 divIcon 으로 얹는다.
//      같은 카드·핀 모양이 두 지도에서 똑같이 보여야 해서 HTML 한 곳에서 만든다.
//    · 카카오맵의 CustomOverlay 는 오버레이 레이어(z-index 1) 안에 들어가는데, 우리 구역 폴리곤
//      캔버스가 그 레이어보다 위(z-index 2)에 있어 **초록 폴리곤에 핀이 반투명하게 덮였다**.
//      → 핀은 카카오 오버레이가 아니라 우리가 직접 만든 최상위 DOM 레이어(z-index 100)에 얹는다.
//      그래서 배경은 어떤 폴리곤 위에서도 완전 불투명(#fff)이어야 하고, 스타일은 인라인으로 고정한다
//      (Tailwind 클래스 스캔에 기대지 않는다 — 지도 위에서 깨지면 원인을 찾기 어렵다).
import type { AddressPin, StationPin } from "./props";
import { SUBWAY_LINES } from "@/lib/subway-stations";

type Tone = {
  /** 테두리·핀·꼬리 색 */
  color: string;
  /** 판정 문구 색 (흰 배경에서 읽히도록 조금 진하게) */
  text: string;
};

const TONES: Record<AddressPin["status"], Tone> = {
  // 구역 안 = 확인된 주소 → 브랜드 블루(오레오 블루)
  inside: { color: "#0054a6", text: "#00417f" }, // 신림1구역 포함
  // 준공 완료 = 지나간 구역 → 헤이즐넛 골드
  completed: { color: "#c8a25a", text: "#745e34" }, // 준공 완료 구역
  "near-candidate": { color: "#7c3aed", text: "#5b21b6" }, // 경계 미고시 후보지 인근
  // 정비구역 밖 = 경고가 아니라 ‘찾은 지점’이다 → 붉은색 대신 무채색 슬레이트
  outside: { color: "#334155", text: "#1a1a1a" },
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/**
 * 주소 핀 한 벌 — [흰 카드][꼬리][드롭핀].
 *  · 카드 배경은 `#ffffff`(불투명) + 2px 테두리 + 진한 그림자 — 폴리곤 채움 위에서도 또렷하다.
 *  · 핀은 흰 테두리 3px 드롭핀(24×32) — 지도 배경(항공사진·지적편도)에서도 눈에 띈다.
 *  · 바깥 div 는 `transform: translate(-50%,-100%)` 로 **핀 끝이 좌표에 닿게** 놓는다.
 *  · 구역 밖(outside)은 판정 문구를 싣지 않는 한 줄짜리 조용한 핀이다 — 아래 분기 참고.
 */
export function addressPinHtml(pin: AddressPin): string {
  const tone = TONES[pin.status] ?? TONES.outside;

  // 구역 밖 주소 — 판정 문구 없이 **지점 + 주소 한 줄**만. ‘정비구역 밖 주소입니다’ 같은
  // 경고 카드는 사용자가 찾은 위치를 부정하는 것처럼 보여, 그 자리는 조용한 슬레이트 핀으로 둔다.
  if (pin.status === "outside") {
    return `
  <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
    <div style="max-width:250px;border-radius:12px;border:1.5px solid #e2e8f0;background:#ffffff;padding:6px 11px;text-align:center;box-shadow:0 8px 22px rgba(15,23,42,.30),0 1px 3px rgba(15,23,42,.22);">
      <div style="font-size:12px;font-weight:700;line-height:1.2;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:226px;">${esc(
        pin.label
      )}</div>
    </div>
    <div style="width:0;height:0;margin-top:-1px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${tone.color};"></div>
    <svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true" style="display:block;margin-top:-1px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.45));">
      <path d="M12 31C12 31 1 18.6 1 11.2A11 11 0 0 1 23 11.2C23 18.6 12 31 12 31Z" fill="${tone.color}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="12" cy="11" r="3.8" fill="#ffffff"/>
    </svg>
  </div>`;
  }

  return `
  <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
    <div style="max-width:250px;border-radius:12px;border:2px solid ${tone.color};background:#ffffff;padding:5px 10px 6px;text-align:center;box-shadow:0 8px 22px rgba(15,23,42,.38),0 1px 3px rgba(15,23,42,.28);">
      <div style="font-size:10px;font-weight:600;line-height:1.15;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:226px;">${esc(
        pin.label
      )}</div>
      <div style="margin-top:2px;font-size:11.5px;font-weight:800;line-height:1.2;color:${tone.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:226px;">${esc(
        pin.message
      )}</div>
    </div>
    <div style="width:0;height:0;margin-top:-1px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${tone.color};"></div>
    <svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true" style="display:block;margin-top:-1px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.45));">
      <path d="M12 31C12 31 1 18.6 1 11.2A11 11 0 0 1 23 11.2C23 18.6 12 31 12 31Z" fill="${tone.color}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="12" cy="11" r="3.8" fill="#ffffff"/>
    </svg>
  </div>`;
}

/**
 * 필지 '보는중' 말풍선 — 주소로 고른 지번의 지적 경계에 붙여 띄운다(2026-11-23 요청).
 *   · 레퍼런스(타 앱 캡처)처럼 **짙은 회색 반투명 알약 + 흰 글씨**로, 파란 필지 채움 위에서도 읽힌다.
 *   · 자리는 **필지 남쪽 변 아래** — 필지가 작게(30~60px) 보이는 일이 많아 가운데에 얹으면
 *     파란 채움을 다 덮는다. 위를 가리키는 꼬리로 어느 필지인지 이어 준다.
 *   · 한 줄로 짧게 — 어느 필지인지는 바로 위 주소 핀 카드가 이미 말해 준다.
 */
export function parcelBubbleHtml(): string {
  return `
  <div style="transform:translate(-50%,7px);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:6px solid rgba(17,24,39,.92);"></div>
    <div style="border-radius:8px;background:rgba(17,24,39,.92);padding:2px 8px 3px;box-shadow:0 4px 14px rgba(15,23,42,.38);white-space:nowrap;">
      <span style="display:inline-block;width:4px;height:4px;border-radius:999px;background:#fbbf24;vertical-align:middle;margin-right:4px;"></span>
      <span style="font-size:10.5px;font-weight:800;line-height:1.3;color:#ffffff;letter-spacing:-0.2px;vertical-align:middle;">보는중</span>
    </div>
  </div>`;
}

/**
 * 지하철역 핀 한 벌/**
 * 지하철역 핀 한 벌/**
 * 지하철역 핀 한 벌 — [흰 카드: 역명 + 노선 배지][꼬리][파란 드롭핀].
 *  · 주소 핀과 같은 생김새를 쓰되 색은 지하철 파랑(#0054a6) — 두 핀이 겹쳐도 구분된다.
 *  · 카드는 역명과 노선을 **한 줄**로 유지한다(nowrap) — 좁은 지도에서 글자가 세로로 쪼개지지 않게.
 */
export function stationPinHtml(pin: StationPin): string {
  const badges = pin.lines
    .map((id) => {
      const meta = SUBWAY_LINES[id];
      const color = meta?.color ?? "#0054a6";
      return `<span style="display:inline-block;border-radius:999px;background:${color};color:#fff;font-size:9.5px;font-weight:800;line-height:1;padding:2px 5px;">${esc(
        meta?.badge ?? id
      )}</span>`;
    })
    .join("");
  return `
  <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none;">
    <div style="max-width:250px;border-radius:12px;border:2px solid #0054a6;background:#ffffff;padding:5px 10px 6px;text-align:center;box-shadow:0 8px 22px rgba(15,23,42,.38),0 1px 3px rgba(15,23,42,.28);">
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;max-width:226px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0054a6" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.2" y="3.6" width="11.6" height="12.9" rx="3"/><path d="M6.2 10.4h11.6"/><path d="m8.7 20 2-3.5M15.3 20l-2-3.5"/></svg>
        <span style="font-size:12px;font-weight:800;line-height:1.2;color:#1a1a1a;">${esc(pin.name)}역</span>
        <span style="display:inline-flex;gap:2px;align-items:center;">${badges}</span>
      </div>
      <div style="margin-top:2px;font-size:10px;font-weight:600;line-height:1.2;color:#0054a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:226px;">주변 정비구역 보기</div>
    </div>
    <div style="width:0;height:0;margin-top:-1px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #0054a6;"></div>
    <svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true" style="display:block;margin-top:-1px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.45));">
      <path d="M12 31C12 31 1 18.6 1 11.2A11 11 0 0 1 23 11.2C23 18.6 12 31 12 31Z" fill="#0054a6" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="12" cy="11" r="3.8" fill="#ffffff"/>
    </svg>
  </div>`;
}

/** 화면 좌표에 붙여 두는 핀 레이어의 공통 스타일 (카카오맵에서 매 프레임 위치를 직접 옮긴다) */
export const PIN_LAYER_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  // 카카오 지도·오버레이·우리 폴리곤 캔버스(2)보다 위, 화면 UI(600~700)보다는 아래
  zIndex: 100,
  pointerEvents: "none" as const,
  willChange: "transform",
  transform: "translate3d(-9999px,-9999px,0)",
};
