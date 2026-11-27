// ─────────────────────────────────────────────────────────────────────────────
// 건축물대장 표제부 → 매물 등록 폼 값 (화면·서버 공용 순수 모듈)
//
//  · `/api/building-info` 가 돌려주는 표제부 요약(`LedgerBuildingBrief`)과,
//    그것을 `/register` 폼에 채울 값으로 바꾸는 규칙을 한 곳에 둔다.
//  · 원칙: **대장에 있는 값만** 채운다. 전유면적(동·호가 있어야 나오는 값)이나 대지지분은
//    표제부에 없으므로 비워 둔다 — 그럴듯한 숫자를 지어내면 매물 표시가 거짓이 된다.
//  · leaflet·kakao·process.env 를 쓰지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 표제부 한 동의 요약 — /api/building-info 응답 항목 */
export type LedgerBuildingBrief = {
  /** 관리번호 — 층별개요와 연결할 때 쓴다 */
  pk?: string;
  /** 건물명 (없으면 동명) */
  name?: string;
  dongName?: string;
  /** 주용도 (예: 공동주택, 다세대주택, 제1종근린생활시설) */
  mainPurps?: string;
  etcPurps?: string;
  structure?: string;
  /** 대지면적 ㎡ */
  platArea?: number;
  /** 건축면적 ㎡ */
  archArea?: number;
  /** 연면적 ㎡ */
  totArea?: number;
  /** 지상층수 */
  grndFlrCnt?: number;
  /** 지하층수 */
  ugrFlrCnt?: number;
  /** 사용승인일 YYYY-MM-DD */
  useAprDay?: string;
  /** 세대수 · 가구수(다가구) · 호수 */
  hhldCnt?: number;
  fmlyCnt?: number;
  hoCnt?: number;
  /** 부속건축물 여부 */
  attached: boolean;
};

/** `getBrTitleInfo` 응답의 건축물대장 표제부 한 행 */
export type BuildingInfoResponse = {
  ok: boolean;
  pnu?: string;
  count?: number;
  primary?: LedgerBuildingBrief | null;
  buildings?: LedgerBuildingBrief[];
  note?: string;
  error?: string;
  detail?: string;
};

/** 'YYYYMMDD' → 'YYYY-MM-DD'. 읽을 수 없으면 undefined (날짜를 지어내지 않는다) */
export function formatAprDay(raw: string | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * 매물 종류 선택지 — /register 의 PROPERTY_TYPES 와 같은 값.
 *   · 부동산포스 24종을 리디브에서 쓰는 갈래로 줄였다(2026-11-27 개편).
 *   · `propertyTypeFromPurps` 가 돌려주는 값(다세대/도시형·단독/다가구·아파트·상가주택·오피스텔)은
 *     반드시 이 목록 안에 있어야 한다 — 대장이 채운 값이 select 에서 보이지 않으면 안 된다.
 */
export const PROPERTY_TYPE_OPTIONS = [
  "다세대/도시형",
  "빌라/연립",
  "단독/다가구",
  "아파트",
  "오피스텔",
  "상가주택",
  "상가/점포",
  "건물",
  "토지",
  "기타",
] as const;

/**
 * 표제부 주용도 → 매물 종류.
 *   · 주용도 문자열을 그대로 보여 주고, 매물 종류는 '가까운 칸'으로만 옮긴다.
 *   · 상가주택은 표제부에 그런 이름이 없어 근린생활시설·판매시설을 상가주택으로 본다
 *     (실제로 1층 상가 + 위층 주택인 건물의 표제부 주용도가 이렇게 적힌다).
 */
export function propertyTypeFromPurps(brief: LedgerBuildingBrief | null | undefined): string | undefined {
  const p = `${brief?.mainPurps ?? ""} ${brief?.etcPurps ?? ""}`;
  if (!p.trim()) return undefined;
  if (/아파트/.test(p)) return "아파트";
  if (/오피스텔/.test(p)) return "오피스텔";
  if (/다세대|연립/.test(p)) return "다세대/도시형";
  if (/단독|다가구/.test(p)) return "단독/다가구";
  if (/근린생활|판매시설|상가|업무시설/.test(p)) return "상가주택";
  if (/공동주택/.test(p)) return "아파트";
  return undefined;
}

/**
 * 표제부 → 폼에 채울 값.
 *   · `approvalDate` 사용승인일, `totalFloors` 지상층수, `platAreaSqm` 대지면적,
 *     `buildingName` 건물명, `propertyType` 주용도에서 옮긴 종류.
 *   · 값이 없는 항목은 키 자체를 넣지 않는다 — 화면은 그 칸을 비워 두고 직접 입력을 받는다.
 */
export function formValuesFromLedger(brief: LedgerBuildingBrief | null | undefined): {
  approvalDate?: string;
  totalFloors?: string;
  platAreaSqm?: string;
  buildingName?: string;
  propertyType?: string;
} {
  if (!brief) return {};
  const out: {
    approvalDate?: string;
    totalFloors?: string;
    platAreaSqm?: string;
    buildingName?: string;
    propertyType?: string;
  } = {};
  if (brief.useAprDay) out.approvalDate = brief.useAprDay;
  if (brief.grndFlrCnt && brief.grndFlrCnt > 0) out.totalFloors = String(brief.grndFlrCnt);
  if (brief.platArea && brief.platArea > 0) out.platAreaSqm = String(brief.platArea);
  if (brief.name) out.buildingName = brief.name;
  const propertyType = propertyTypeFromPurps(brief);
  if (propertyType) out.propertyType = propertyType;
  return out;
}

/**
 * 표제부 한 줄 요약 — 폼 위에 "무엇을 채웠는지" 보여 주는 문장.
 *   · 예: `사용승인 1995-08-10 · 지상 5층 · 대지 312.4㎡ · 다세대주택 · 세대 8`
 */
export function ledgerSummaryLine(brief: LedgerBuildingBrief | null | undefined): string {
  if (!brief) return "";
  const parts: string[] = [];
  if (brief.useAprDay) parts.push(`사용승인 ${brief.useAprDay}`);
  if (brief.grndFlrCnt) parts.push(`지상 ${brief.grndFlrCnt}층${brief.ugrFlrCnt ? `/지하 ${brief.ugrFlrCnt}층` : ""}`);
  if (brief.platArea) parts.push(`대지 ${brief.platArea.toLocaleString()}㎡`);
  if (brief.totArea) parts.push(`연면적 ${brief.totArea.toLocaleString()}㎡`);
  if (brief.mainPurps) parts.push(brief.mainPurps);
  if (brief.hhldCnt) parts.push(`세대 ${brief.hhldCnt}`);
  else if (brief.fmlyCnt) parts.push(`가구 ${brief.fmlyCnt}`);
  if (brief.structure) parts.push(brief.structure);
  return parts.join(" · ");
}
