// 사업유형 색상 팔레트 — 지도 폴리곤과 뱃지가 공용.
// leaflet을 임포트하지 않는 순수 모듈이므로 서버 컴포넌트/SSR에서 안전하게 사용 가능.
import type { MapZoneType } from "@/lib/types";

// 서울시 정비구역 전수 지도용 6분류.
//  · 신통기획 purple / 일반재개발·재건축·재정비촉진 emerald / 모아타운 sky
//  · 도공복 amber / 가로주택 teal / 소규모(자율주택·소규모재건축·재개발) slate
export const TYPE_COLORS: Record<MapZoneType, string> = {
  신통기획: "#7c3aed",
  모아타운: "#0ea5e9",
  도공복: "#f59e0b",
  일반재개발: "#10b981",
  가로주택: "#0d9488",
  소규모: "#64748b",
};

/** 범례 노출 순서 (면적·중요도 순) */
export const TYPE_ORDER: MapZoneType[] = [
  "일반재개발",
  "신통기획",
  "모아타운",
  "도공복",
  "가로주택",
  "소규모",
];

/**
 * 지도 폴리곤 스타일 — 전수 레이어와 대표 구역이 공유.
 *  · 서울 전경(zoom ≤ 12): 선 1.4 · 채움 0.3 — 1,800곳이 겹쳐도 도시가 살아 보이게
 *  · 확대할수록 선을 굵게(zoom 13~14 ×1.5, 15+ ×2) — 구역 경계가 또렷하게 읽히도록
 */
export function zoneStyle(type: MapZoneType, active = false, featured = false, zoom = 11) {
  const color = TYPE_COLORS[type] ?? "#64748b";
  const grow = zoom >= 15 ? 2 : zoom >= 13 ? 1.5 : 1;

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
