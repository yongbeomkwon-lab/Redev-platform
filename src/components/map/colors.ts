// 사업유형 색상 팔레트 — 지도 폴리곤과 뱃지가 공용.
// leaflet을 임포트하지 않는 순수 모듈이므로 서버 컴포넌트/SSR에서 안전하게 사용 가능.
import type { ZoneType } from "@/lib/types";

export const TYPE_COLORS: Record<ZoneType, string> = {
  신통기획: "#7c3aed",
  모아타운: "#0ea5e9",
  도공복: "#f59e0b",
  일반재개발: "#10b981",
};
