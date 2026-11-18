// 사업유형 색상 팔레트 — 지도 폴리곤과 뱃지가 공용.
// leaflet을 임포트하지 않는 순수 모듈이므로 서버 컴포넌트/SSR에서 안전하게 사용 가능.
import type { MapZoneType } from "@/lib/types";

// 서울시 정비구역 전수 지도용 10분류.
//  · 신통기획 purple / 일반재개발·재건축·재정비촉진 emerald / 모아타운 sky
//  · 도공복 amber / 가로주택 teal / 소규모(자율주택·소규모재건축·재개발) slate
//  · 역세권(역세권활성화·청년안심주택) orange / 장기전세(장기전세주택·미리내집) magenta
//    — 정비구역이 아닌 서울시 주택공급 사업이라 기존 6색(녹·보라·하늘·주황·청록·회)과
//      겹치지 않는 두 색으로 따로 묶는다(상세 패널의 ‘사업유형’에 소분류가 그대로 나온다).
//  · 민간도심복합 성장거점형 red-700 / 주거중심형 red-500
//    — 도공복(공공)의 민간판이라 공공(amber)과 구분되는 빨강 계열로 묶고, 같은 사업의 두 유형은
//      한 색상의 진한/연한 값으로 나눈다(범례 한 줄, 배지 텍스트로 유형 구분).
export const TYPE_COLORS: Record<MapZoneType, string> = {
  신통기획: "#7c3aed",
  모아타운: "#0ea5e9",
  도공복: "#f59e0b",
  일반재개발: "#10b981",
  // 공공재개발 = 공공이 사업시행자로 참여하는 재개발(도림1구역 등) — 일반재개발과 구분되는 진한 초록
  공공재개발: "#047857",
  가로주택: "#0d9488",
  소규모: "#64748b",
  역세권: "#f97316",
  장기전세: "#ec4899",
  "민간도심복합(성장거점형)": "#b91c1c",
  "민간도심복합(주거중심형)": "#ef4444",
};

/** 범례 노출 순서 (면적·중요도 순) */
export const TYPE_ORDER: MapZoneType[] = [
  "일반재개발",
  "공공재개발",
  "신통기획",
  "모아타운",
  "도공복",
  "민간도심복합(성장거점형)",
  "민간도심복합(주거중심형)",
  "가로주택",
  "소규모",
  "역세권",
  "장기전세",
];

/**
 * 지도 폴리곤 스타일 — 전수 레이어와 대표 구역이 공유.
 *  · 서울 전경(zoom ≤ 12): 선 1.4 · 채움 0.3 — 1,800곳이 겹쳐도 도시가 살아 보이게
 *  · 확대할수록 선을 굵게(zoom 13~14 ×1.5, 15+ ×2) — 구역 경계가 또렷하게 읽히도록
 *  · completed(준공 완료) = 점선 + 옅은 채움 — ‘끝난 구역’임을 한눈에 구분한다
 */
export function zoneStyle(type: MapZoneType, active = false, featured = false, zoom = 11, completed = false) {
  const color = TYPE_COLORS[type] ?? "#64748b";
  const grow = zoom >= 15 ? 2 : zoom >= 13 ? 1.5 : 1;

  if (completed) {
    return {
      color,
      weight: Math.min((active ? 2.2 : 1.1) * grow, active ? 4 : 3),
      opacity: active ? 1 : 0.75,
      dashArray: "4 3",
      fillColor: color,
      fillOpacity: active ? 0.3 : 0.1,
    };
  }

  if (featured) {
    return {
      color,
      weight: Math.min((active ? 4.2 : 3) * grow, active ? 6 : 4.5),
      opacity: 1,
      fillColor: color,
      fillOpacity: active ? 0.5 : 0.35,
    };
  }
  return {
    color,
    weight: Math.min((active ? 3 : 1.4) * grow, 5),
    opacity: active ? 1 : 0.9,
    fillColor: color,
    fillOpacity: active ? 0.45 : 0.3,
  };
}
