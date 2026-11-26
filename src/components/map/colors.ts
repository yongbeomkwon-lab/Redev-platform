// 사업유형 색상 팔레트 — 지도 폴리곤과 뱃지가 공용.
// leaflet을 임포트하지 않는 순수 모듈이므로 서버 컴포넌트/SSR에서 안전하게 사용 가능.
import type { MapZoneType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// 사업유형 10색 팔레트 (2026-11-21 리디자인 확정본 + 2026-11-23 재건축 분리)
//
//  · 10색 = 재건축 · 일반재개발 · 공공재개발 · 신통기획 · 모아타운 · 도공복 · 민간도심복합 ·
//           가로주택·소규모 · 역세권 · 장기전세
//  · 같은 사업의 소분류는 한 색으로 묶는다 — 민간도심복합(성장거점형·주거중심형) 한 색,
//    가로주택·소규모 한 색, 모아타운·모아타운통합기획 한 색. 색은 지도 폴리곤·지도 칩·범례·상세 뱃지가 모두 공유한다.
//  · 재건축(인디고)은 재개발(초록)과 사업 성격이 달라 따로 둔다 — 서울플랜+ 소분류
//    재건축(단독 BZ104·공동 BZ105)이 옛 6색 분류로 '일반재개발'에 섞여 '재개발'로 보이던 것을 고쳤다.
//  · 신통기획만 테두리를 진한 자주(#4B286D)로 따로 둔다 — 채움(#C05CC9)이 밝아
//    베이스맵 위에서 경계가 풀리지 않게(시안 확정본과 같은 처리).
//  · TYPE_LINE = 폴리곤 테두리(같은 색을 22% 어둡게), TYPE_INK·TYPE_TINT = 흰 배경 위
//    뱃지 글자·바탕(읽히도록 색을 눌러 쓴다 — 지도 위 칩은 원색을 그대로 쓴다).
// ─────────────────────────────────────────────────────────────────────────────

/** 9색 원색 — 지도 채움·지도 위 칩·범례 점 */
export const TYPE_COLORS: Record<MapZoneType, string> = {
  재건축: "#4155C4",
  일반재개발: "#5B8C3A",
  공공재개발: "#1697A6",
  신통기획: "#C05CC9",
  모아타운: "#3E92CC",
  // 모아타운통합기획 = 모아타운의 갈래(공공 계획지원을 결합한 방식) — 같은 청록·청색 계열을 그대로 쓴다
  //   민간도심복합 성장거점형·주거중심형이 한 색인 것과 같은 방식이다.
  모아타운통합기획: "#3E92CC",
  도공복: "#F4511E",
  "민간도심복합(성장거점형)": "#D8315B",
  "민간도심복합(주거중심형)": "#D8315B",
  가로주택: "#50757B",
  소규모: "#50757B",
  역세권: "#F47068",
  장기전세: "#C8A25A",
};

/** 폴리곤 테두리 — 채움색을 22% 어둡게(신통기획은 시안 확정값 #4B286D) */
export const TYPE_LINE: Record<string, string> = {
  재건축: "#2F3F94",
  일반재개발: "#476D2D",
  공공재개발: "#117681",
  신통기획: "#4B286D",
  모아타운: "#30729F",
  모아타운통합기획: "#30729F",
  도공복: "#BE3F17",
  "민간도심복합(성장거점형)": "#A82647",
  "민간도심복합(주거중심형)": "#A82647",
  가로주택: "#3E5B60",
  소규모: "#3E5B60",
  역세권: "#BE5751",
  장기전세: "#9C7E46",
};

/** 흰 배경 위 뱃지 글자색 — 원색을 42% 눌러 본문 크기에서도 읽히게 */
export const TYPE_INK: Record<string, string> = {
  재건축: "#2B3880",
  일반재개발: "#355122",
  공공재개발: "#0D5860",
  신통기획: "#6F3575",
  모아타운: "#245576",
  모아타운통합기획: "#245576",
  도공복: "#8E2F11",
  "민간도심복합(성장거점형)": "#7D1C35",
  "민간도심복합(주거중심형)": "#7D1C35",
  가로주택: "#2E4447",
  소규모: "#2E4447",
  역세권: "#8E413C",
  장기전세: "#745E34",
};

/** 흰 배경 위 뱃지 바탕 — 원색을 90% 흰색으로 희석 */
export const TYPE_TINT: Record<string, string> = {
  재건축: "#EDEFFB",
  일반재개발: "#EFF4EB",
  공공재개발: "#E8F5F6",
  신통기획: "#F9EFFA",
  모아타운: "#ECF4FA",
  모아타운통합기획: "#ECF4FA",
  도공복: "#FEEEE8",
  "민간도심복합(성장거점형)": "#FBEAEF",
  "민간도심복합(주거중심형)": "#FBEAEF",
  가로주택: "#EEF1F2",
  소규모: "#EEF1F2",
  역세권: "#FEF1F0",
  장기전세: "#FAF6EE",
};

/** 알 수 없는 유형(관리자 직접 그린 구역 등)의 중립 회색 */
const NEUTRAL = "#64748B";
const NEUTRAL_LINE = "#4B5563";

// ─────────────────────────────────────────────────────────────────────────────
// 사업유형 대신 띄우는 말 (badgeType)
//
//   · 사업 방식이 확정되기 전인 구역은 사업유형을 단정해 뱃지에 쓰면 사실과 달라진다.
//     예: 방배동 467-19는 신속통합기획과 모아타운을 함께 검토 중이라 '신통모아미정'으로 둔다.
//   · 색은 9색 팔레트(원색)에서 빼 둔 **중립 슬레이트** — 다른 구역 색과 헷갈리지 않고,
//     지도에서 눈에 튀지도 않는다. 폴리곤은 type 색 그대로라 범례·필터 체계는 바뀌지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
export const BADGE_COLORS: Record<string, string> = {
  신통모아미정: "#475569",
  // 지구단위계획구역 — 정비구역이 아니라 '지구단위계획'으로 지정된 구역이라 사업유형(재개발) 대신
  //   계획 이름을 띄운다(중구 황학 지구단위계획구역, 2026-11-25 도건위 수정 가결).
  지구단위계획: "#475569",
};

/** 뱃지 알약 바탕 — badgeType 이 있으면 중립색, 없으면 사업유형 원색 */
export function badgeColor(badgeType?: string | null, type?: string | null): string {
  if (badgeType && BADGE_COLORS[badgeType]) return BADGE_COLORS[badgeType];
  return typeColor(type);
}

export function typeColor(type?: string | null): string {
  return (type && TYPE_COLORS[type as MapZoneType]) || NEUTRAL;
}
export function typeLine(type?: string | null): string {
  return (type && TYPE_LINE[type]) || NEUTRAL_LINE;
}

/** 범례 노출 순서 — 10색(같은 색으로 묶인 소분류는 대표 이름 하나) */
export const TYPE_ORDER: MapZoneType[] = [
  "재건축",
  "일반재개발",
  "공공재개발",
  "신통기획",
  "모아타운",
  "도공복",
  "민간도심복합(성장거점형)",
  "가로주택",
  "역세권",
  "장기전세",
];

/**
 * 지도 폴리곤 스타일 — 전수 레이어와 대표 구역이 공유.
 *  · 기본: 채움 20% · 테두리 1.2~1.8px — 2,400곳이 겹쳐도 9색이 서로 섞이지 않게
 *  · 확대할수록 선을 굵게(zoom 13~14 ×1.5, 15+ ×2) — 구역 경계가 또렷하게 읽히도록
 *  · 선택·호버: 채움 50% + 굵은 테두리(카카오맵은 흰 헤일로를 한 겹 더 긋는다)
 *  · completed(준공 완료) = 점선 + 옅은 채움 — ‘끝난 구역’임을 한눈에 구분한다
 */
export function zoneStyle(
  type: MapZoneType,
  active = false,
  featured = false,
  zoom = 11,
  completed = false,
  approx = false
) {
  const fillColor = typeColor(type);
  const color = typeLine(type);
  const grow = zoom >= 15 ? 2 : zoom >= 13 ? 1.5 : 1;

  if (completed) {
    return {
      color,
      fillColor,
      weight: Math.min((active ? 1.8 : 0.9) * grow, active ? 3.4 : 2.6),
      opacity: active ? 1 : 0.65,
      dashArray: "4 3",
      fillOpacity: active ? 0.28 : 0.08,
    };
  }

  if (approx) {
    // 위치 참고용 근사원(대표 지번 중심·면적 환산) — 실제 구역계가 아니므로 점선으로 옅게
    return {
      color,
      fillColor,
      weight: Math.min((active ? 2.2 : 1.3) * grow, active ? 4 : 3),
      opacity: active ? 1 : 0.8,
      dashArray: "7 5",
      fillOpacity: active ? 0.3 : 0.14,
    };
  }

  if (featured) {
    return {
      color,
      fillColor,
      weight: Math.min((active ? 3.2 : 2) * grow, active ? 5.4 : 4),
      opacity: 1,
      fillOpacity: active ? 0.5 : 0.28,
    };
  }
  return {
    color,
    fillColor,
    weight: Math.min((active ? 2.8 : 1.2) * grow, 4.6),
    opacity: active ? 1 : 0.85,
    fillOpacity: active ? 0.5 : 0.2,
  };
}

// ─── 지도 이름표 뱃지용 짧은 이름 ────────────────────────────────────────────

/**
 * 사업유형 짧은 이름 — 선택 구역 이름표 뱃지.
 *   · 신통기획 → ‘신속통합기획’ (사용자가 쓰는 말)
 *   · 민간도심복합(성장거점형/주거중심형) → ‘민간도심복합’
 */
export function shortZoneType(type?: string | null): string {
  if (!type) return "";
  if (type === "신통기획") return "신속통합기획";
  if (type.startsWith("민간도심복합")) return "민간도심복합";
  return type;
}

/**
 * 추진단계 짧은 이름 — 선택 구역 이름표 뱃지.
 *   · ‘연번부여(2026-11-03)’ 같은 긴 단계는 사람이 쓰는 말로 줄인다(연번부여 → 연번동의)
 *   · ‘사업시행자지정’(지정개발자를 사업시행자로 지정)은 ‘사업시행인가’와 다른 단계라 따로 둔다
 *   · 괄호·날짜는 떼고, 모르는 단계는 8자까지만 남겨 이름표가 길어지지 않게 한다
 */
export function shortStage(stage?: string | null): string {
  const s = (stage ?? "").trim();
  if (!s) return "";
  if (s.includes("연번")) return "연번동의";
  if (s.includes("관리처분")) return "관리처분";
  // 사업시행자 '지정 철회'는 진행 단계가 아니라 되돌아간 사건이라 따로 줄인다(예: 대선제분1구역1지구)
  if (/사업시행자\s*지정\s*(철회|취소)/.test(s)) return "시행자철회";
  if (s.includes("조합설립")) return "조합설립";
  if (s.includes("추진위")) return "추진위";
  if (s.includes("주민합의체")) return "주민합의체";
  if (s.includes("사업시행자")) return "사업시행자지정";
  if (s.includes("사업시행")) return "사업시행인가";
  if (s.includes("구역지정")) return "구역지정";
  if (s.includes("후보지")) return "후보지";
  const base = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return base.length > 8 ? base.slice(0, 8) : base;
}
