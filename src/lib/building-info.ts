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
  /** 주차대수 — 자주식+기계식 합계 (표제부 indr/oudr Auto·MechUtcnt) */
  parkingTotal?: number;
  /** 승강기 — 운용·비상용 합계 (표제부 rideUseElvtCnt + emgenUseElvtCnt) */
  elevatorCnt?: number;
  /** 위반건축물 여부 — 표제부 vltnBldYn 이 있을 때만 */
  violation?: string;
  /** 부속건축물 여부 */
  attached: boolean;
};

/**
 * 전유부(호별 면적) 한 줄 — `/api/building-info` 의 `units` 항목.
 *   · `getBrExposPubuseAreaInfo` 는 호마다 **전유 행 + 공용 행**을 따로 주므로
 *     같은 동·호로 묶어 전유면적·공용면적을 합산한 값이다.
 *   · 단독·다가구처럼 전유부가 없는 건물은 목록이 비어 있다(면적을 지어내지 않는다).
 */
export type LedgerUnit = {
  /** 동명 원문 — '101동'·'101'·건물명(단일 동)·'' */
  dong: string;
  /** 화면에 쓸 동 표기 — '101동' (건물명이 동명인 경우 그대로) */
  dongLabel: string;
  /** 호명 — '402' (끝의 '호'는 떼었다) */
  ho: string;
  /** 해당층 표기 — '4층'·'지하1층'·'각층' */
  floor: string;
  /** 해당층 숫자 — 지하는 음수, 알 수 없으면 0 */
  floorNo: number;
  /** 전유면적 합 ㎡ */
  exclusiveArea: number;
  /** 공용면적 합 ㎡ */
  commonArea: number;
  /** 공급면적 = 전유 + 공용 ㎡ */
  supplyArea: number;
  /** 전유부 주용도 (예: 다세대주택) */
  mainPurps?: string;
};

/** `/api/building-info` 응답 — 표제부 + 전유부 호수 목록 */
export type BuildingInfoResponse = {
  ok: boolean;
  pnu?: string;
  count?: number;
  primary?: LedgerBuildingBrief | null;
  buildings?: LedgerBuildingBrief[];
  note?: string;
  /** 동·호수 목록 (전유부). 전유부가 없는 건물은 빈 배열 */
  units?: LedgerUnit[];
  /** 실제로 읽은 전유부 행 수 */
  unitsRows?: number;
  /** 국토부가 알려 준 전유부 전체 행 수 */
  unitsTotalRows?: number;
  /** 전체를 다 읽지 못했는가(대단지 아파트) — 화면이 '일부만' 이라고 알린다 */
  unitsTruncated?: boolean;
  /** 호수 목록을 못 만든 이유(전유부 없음·조회 실패 등) */
  unitsNote?: string;
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
/** 주차대수 → 폼 표기 — 부동산포스 양식("총 15대" / "없음") */
export function parkingText(brief: LedgerBuildingBrief | null | undefined): string | undefined {
  const n = brief?.parkingTotal;
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return n > 0 ? `총 ${n.toLocaleString()}대` : "없음";
}

/** 승강기 대수 → '있음'/'없음'. 대장에 값이 없으면 비운다(지어내지 않는다) */
export function elevatorText(brief: LedgerBuildingBrief | null | undefined): string | undefined {
  const n = brief?.elevatorCnt;
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return n > 0 ? "있음" : "없음";
}

/**
 * 표제부 → 폼에 채울 값.
 *   · `approvalDate` 사용승인일, `totalFloors` 지상층수, `platAreaSqm` 대지면적,
 *     `buildingName` 건물명, `propertyType` 주용도에서 옮긴 종류,
 *     `parking`·`elevator`·`violation` 은 표시·광고 명시사항(부동산포스가 함께 받는 항목).
 *   · 값이 없는 항목은 키 자체를 넣지 않는다 — 화면은 그 칸을 비워 두고 직접 입력을 받는다.
 */
export function formValuesFromLedger(brief: LedgerBuildingBrief | null | undefined): {
  approvalDate?: string;
  totalFloors?: string;
  platAreaSqm?: string;
  buildingName?: string;
  propertyType?: string;
  parking?: string;
  elevator?: string;
  violation?: string;
} {
  if (!brief) return {};
  const out: {
    approvalDate?: string;
    totalFloors?: string;
    platAreaSqm?: string;
    buildingName?: string;
    propertyType?: string;
    parking?: string;
    elevator?: string;
    violation?: string;
  } = {};
  if (brief.useAprDay) out.approvalDate = brief.useAprDay;
  if (brief.grndFlrCnt && brief.grndFlrCnt > 0) out.totalFloors = String(brief.grndFlrCnt);
  if (brief.platArea && brief.platArea > 0) out.platAreaSqm = String(brief.platArea);
  if (brief.name) out.buildingName = brief.name;
  const propertyType = propertyTypeFromPurps(brief);
  if (propertyType) out.propertyType = propertyType;
  const parking = parkingText(brief);
  if (parking) out.parking = parking;
  const elevator = elevatorText(brief);
  if (elevator) out.elevator = elevator;
  if (brief.violation) out.violation = brief.violation;
  return out;
}

/** ㎡ 값 → 폼 입력 문자열 — 소수 둘째 자리까지(부동산포스 표기와 같다) */
export function areaText(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v) || v <= 0) return "";
  return String(Math.round(v * 100) / 100);
}

/** 호명 표기 — '402' → '제402호'. 이미 '호'가 붙어 있거나 숫자가 아니면 그대로 쓴다 */
export function hoLabel(ho: string): string {
  const t = (ho ?? "").trim();
  if (!t) return "";
  if (/호$/.test(t)) return /^\d/.test(t) ? `제${t}` : t;
  return /^\d+(-\d+)?$/.test(t) ? `제${t}호` : t;
}

/** 동 표기 — '101' → '101동', '제이원'처럼 숫자가 아니면 그대로 */
export function dongLabel(dong: string): string {
  const t = (dong ?? "").trim();
  if (!t) return "";
  if (/동$/.test(t)) return t;
  return /^\d+(-\d+)?$/.test(t) ? `${t}동` : t;
}

/**
 * 전유부 한 호 → 폼에 채울 값.
 *   · `exclusiveArea` 전용면적, `supplyArea` 공급면적(전유+공용), `floor` 해당층,
 *     `detailAddress` 부동산포스 표기(건물명 · 동 · 층 · 호).
 *   · 층은 전유부의 `flrNoNm`(예: '4층')을 그대로 쓴다 — 카드에 '4층 / 6층'으로 읽힌다.
 */
export function formValuesFromUnit(
  unit: LedgerUnit | null | undefined,
  brief?: LedgerBuildingBrief | null
): { exclusiveArea?: string; supplyArea?: string; floor?: string; detailAddress?: string } {
  if (!unit) return {};
  const out: { exclusiveArea?: string; supplyArea?: string; floor?: string; detailAddress?: string } = {};
  const ex = areaText(unit.exclusiveArea);
  if (ex) out.exclusiveArea = ex;
  const sp = areaText(unit.supplyArea);
  if (sp) out.supplyArea = sp;
  if (unit.floor && unit.floor !== "각층") out.floor = unit.floor;
  // 상세주소 — 예: '제이원 제4층 제402호' / '제이원 101동 제4층 제402호'
  const name = (brief?.name ?? "").trim();
  const dong = unit.dongLabel && unit.dongLabel !== name ? unit.dongLabel : "";
  const floorPart = unit.floorNo > 0 ? `제${unit.floorNo}층` : unit.floor && unit.floor !== "각층" ? unit.floor : "";
  const detail = [name, dong, floorPart, hoLabel(unit.ho)].filter(Boolean).join(" ");
  if (detail) out.detailAddress = detail;
  return out;
}

/** 동 목록 — 동 선택 드롭다운에 쓸 값(중복 제거, 등장 순서 유지) */
export function unitDongs(units: LedgerUnit[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of units ?? []) {
    const d = (u.dongLabel ?? "").trim();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

/**
 * 호수 검색 — '201'·'201호'·'3층'·'101동 201' 같은 입력을 목록에서 걸러 낸다.
 *   · 숫자만 있으면 호수 우선, '층'이 붙으면 층, 동 이름이 들어가면 동까지 함께 본다.
 */
export function matchUnit(u: LedgerUnit, query: string): boolean {
  const q = query.trim().replace(/\s+/g, "").toLowerCase();
  if (!q) return true;
  const hay = `${u.dongLabel}${u.dong}${u.ho}${hoLabel(u.ho)}${u.floor}`.replace(/\s+/g, "").toLowerCase();
  if (hay.includes(q)) return true;
  // '201호' → '201', '제201호' → '201' 처럼 접두·접미를 떼고 한 번 더
  const bare = q.replace(/^제/, "").replace(/호$/, "");
  return !!bare && hay.includes(bare);
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
