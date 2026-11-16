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
import type { AddressPin } from "./props";

type Tone = {
  /** 테두리·핀·꼬리 색 */
  color: string;
  /** 판정 문구 색 (흰 배경에서 읽히도록 조금 진하게) */
  text: string;
};

const TONES: Record<AddressPin["status"], Tone> = {
  inside: { color: "#059669", text: "#065f46" }, // 신림1구역 포함
  completed: { color: "#d97706", text: "#92400e" }, // 준공 완료 구역
  "near-candidate": { color: "#7c3aed", text: "#5b21b6" }, // 경계 미고시 후보지 인근
  outside: { color: "#e11d48", text: "#9f1239" }, // 정비구역 밖
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/**
 * 주소 핀 한 벌 — [흰 카드][꼬리][드롭핀].
 *  · 카드 배경은 `#ffffff`(불투명) + 2px 테두리 + 진한 그림자 — 폴리곤 채움 위에서도 또렷하다.
 *  · 핀은 흰 테두리 3px 드롭핀(24×32) — 지도 배경(항공사진·지적편도)에서도 눈에 띈다.
 *  · 바깥 div 는 `transform: translate(-50%,-100%)` 로 **핀 끝이 좌표에 닿게** 놓는다.
 */
export function addressPinHtml(pin: AddressPin): string {
  const tone = TONES[pin.status] ?? TONES.outside;
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
