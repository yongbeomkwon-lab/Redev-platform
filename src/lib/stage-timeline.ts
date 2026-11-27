// ─────────────────────────────────────────────────────────────────────────────
// stage-timeline — 구역의 '사업 진행단계'를 표준 절차 위에 올려 놓는다.
//
//   서울시 고시 데이터의 `stage` 문자열은 구청·정보몽땅·서울시 표기가 섞여 있다.
//   2,424곳에 193가지 표기가 있고, 그중 60여 곳은 "정비구역 지정(2025-12-26)·추진위원회
//   승인(2026-04-24)"처럼 **한 문자열에 여러 사건**이 들어 있다. 그래서 규칙만으로
//   자르면 '정비구역 지정(안) 공람'이 '지정 완료'로, '1·2구역'이 두 사건으로 갈라진다.
//
//   → 현재 데이터의 표기 193가지는 **EXACT 표에 한 줄씩 손으로 매핑**해 두고(전수 검증
//     스크립트가 2,424곳을 돌려 EXACT 미등록 0을 확인), 앞으로 들어올 새 표기는
//     FALLBACK_RULES 정규식으로 받는다. 날짜는 문자열에 적힌 것만 옮긴다(지어내지 않음).
//
//   사업유형별 사다리(FAMILY)는 법정 절차 순서를 따른다.
//     redev   일반재개발·신통기획·공공재개발   추진준비 → 후보지 → 기획·정비계획 →
//             지정 공람 → 지정 고시 → 추진위 → 조합설립 → 시공사 → 사업시행 →
//             관리처분 → 이주·철거 → 착공 → 준공
//     rebuild 재건축(공동·단독)               추진준비 → 안전진단 → 지정 공람 → 지정 고시 →
//             추진위 → 조합설립 → 시공사 → 사업시행 → 관리처분 → 이주·철거 → 착공 → 준공
//     small   가로주택·소규모재건축·자율주택  추진준비 → 조합설립 → 시공사 → 사업시행 →
//             건축심의 → 착공 → 준공
//     moa     모아타운                        추진준비 → 대상지 선정 → 관리계획 수립·공람 →
//             관리계획 승인·고시 → 조합설립 → 사업시행 → 착공 → 준공
//     doum    도심공공주택복합·민간도심복합   추진준비 → 후보지 → 예정지구·지구지정 →
//             사업계획승인 → 착공 → 준공
//     station 역세권활성화·장기전세·청년안심  사전검토 → 대상지 선정·입안 → 공람·열람 →
//             구역지정 → 사업계획승인 → 건축심의·허가 → 착공 → 입주자 모집 → 준공·입주
//
//   ※ 역세권·장기전세는 법정 절차가 '사업계획승인'이라 사업시행인가 대신 그 이름을 쓴다.
//   ※ kind에 '도시정비형 재개발'이 붙은 역세권·장기전세는 재개발 절차(redev)를 따른다.
//   ※ 후보지 취소·추천 제외처럼 **멈춘 구역**은 사다리 대신 중단 사유만 보여준다.
// ─────────────────────────────────────────────────────────────────────────────
import type { MapZoneType } from "@/lib/types";

export type StageKey =
  | "prep" // 추진준비·연번/동의서 번호부여·주민제안·자문신청
  | "safety" // 안전진단·재건축진단
  | "candidate" // 후보지·대상지 선정, 입안
  | "plan" // 신통기획·정비계획·관리계획 수립
  | "notice" // 지정 공람·열람공고
  | "district" // 구역지정·지구지정·관리지역고시
  | "committee" // 추진위 구성·승인
  | "union" // 조합설립인가
  | "builder" // 시공사 선정
  | "implement" // 사업시행인가·사업계획승인·사업시행자 지정
  | "design" // 건축심의·건축허가
  | "disposition" // 관리처분계획인가
  | "demolish" // 이주·철거
  | "construct" // 착공
  | "recruit" // 입주자 모집공고
  | "complete" // 준공·입주·사용승인
  | "restrict"; // 행위제한(건축허가 제한) — 사다리에 대응 칸이 없으면 무시한다

export type StageFamily = "redev" | "rebuild" | "small" | "moa" | "doum" | "station" | "jiju";

type Step = { keys: StageKey[]; label: string };
export type StageEvent = { k: StageKey; d?: string; ip?: boolean; note?: string };

const REDEV: Step[] = [
  { keys: ["prep", "safety", "restrict"], label: "추진준비·연번부여" },
  { keys: ["candidate"], label: "후보지 선정" },
  { keys: ["plan"], label: "신통기획·정비계획 수립" },
  { keys: ["notice"], label: "정비구역 지정 공람" },
  { keys: ["district"], label: "정비구역 지정 고시" },
  { keys: ["committee"], label: "추진위 승인" },
  { keys: ["union"], label: "조합설립인가" },
  { keys: ["builder"], label: "시공사 선정" },
  { keys: ["implement", "design"], label: "사업시행인가" },
  { keys: ["disposition"], label: "관리처분인가" },
  { keys: ["demolish"], label: "이주·철거" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공·입주" },
];

const REBUILD: Step[] = [
  { keys: ["prep", "restrict"], label: "추진준비" },
  { keys: ["safety"], label: "안전진단" },
  { keys: ["notice"], label: "정비구역 지정 공람" },
  { keys: ["district", "plan"], label: "정비구역 지정 고시" },
  { keys: ["committee"], label: "추진위 승인" },
  { keys: ["union"], label: "조합설립인가" },
  { keys: ["builder"], label: "시공사 선정" },
  { keys: ["implement", "design"], label: "사업시행인가" },
  { keys: ["disposition"], label: "관리처분인가" },
  { keys: ["demolish"], label: "이주·철거" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공·입주" },
];

const SMALL: Step[] = [
  { keys: ["prep", "restrict"], label: "추진준비·연번부여" },
  { keys: ["union"], label: "조합설립인가" },
  { keys: ["builder"], label: "시공사 선정" },
  { keys: ["implement"], label: "사업시행인가" },
  { keys: ["design"], label: "건축심의·허가" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공" },
];

const MOA: Step[] = [
  { keys: ["prep"], label: "추진준비·연번부여" },
  { keys: ["candidate", "restrict"], label: "대상지·후보지 선정" },
  { keys: ["plan", "notice"], label: "관리계획 수립·공람" },
  { keys: ["district"], label: "관리계획 승인·고시" },
  { keys: ["union"], label: "조합설립인가" },
  { keys: ["implement"], label: "사업시행인가" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공" },
];

const DOUM: Step[] = [
  { keys: ["prep", "restrict"], label: "추진준비" },
  { keys: ["candidate"], label: "후보지 선정" },
  { keys: ["district"], label: "예정지구·지구지정" },
  { keys: ["implement"], label: "사업계획승인" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공" },
];

const STATION: Step[] = [
  { keys: ["prep"], label: "사전검토·추진준비" },
  { keys: ["candidate"], label: "대상지 선정·입안" },
  { keys: ["notice", "restrict"], label: "공람·열람공고" },
  { keys: ["district"], label: "구역지정" },
  { keys: ["implement"], label: "사업계획승인" },
  { keys: ["design"], label: "건축심의·허가" },
  { keys: ["construct"], label: "착공" },
  { keys: ["recruit"], label: "입주자 모집" },
  { keys: ["complete"], label: "준공·입주" },
];

/** 지주택(지역주택조합·지구단위계획구역) — 정비구역이 아니라 지구단위계획으로 지정받아 추진한다.
 *    조합원 모집 → 지구단위계획구역 지정 열람 → 결정·고시 → 조합설립인가 → 사업계획승인 → 착공 → 준공 */
const JIJU: Step[] = [
  { keys: ["prep", "restrict"], label: "추진준비·조합원 모집" },
  { keys: ["notice", "plan"], label: "지구단위계획구역 지정 열람" },
  { keys: ["district"], label: "지구단위계획 결정·구역 지정" },
  { keys: ["union"], label: "조합설립인가" },
  { keys: ["implement", "design"], label: "사업계획승인" },
  { keys: ["construct"], label: "착공" },
  { keys: ["complete"], label: "준공·입주" },
];

const FAMILY_STEPS: Record<StageFamily, Step[]> = {
  redev: REDEV,
  rebuild: REBUILD,
  small: SMALL,
  moa: MOA,
  doum: DOUM,
  station: STATION,
  jiju: JIJU,
};

export const FAMILY_LABEL: Record<StageFamily, string> = {
  redev: "재개발 표준 절차",
  rebuild: "재건축 표준 절차",
  small: "가로주택·소규모 정비 절차",
  moa: "모아타운 절차",
  doum: "도심복합개발 절차",
  station: "역세권·장기전세 절차",
  jiju: "지역주택조합(지주택) 절차",
};

/** 사업유형·소분류·단계 표기로 어느 사다리를 쓸지 정한다. */
export function pickFamily(type: MapZoneType | string, kind: string | undefined, stage: string): StageFamily {
  const k = kind ?? "";
  const s = stage ?? "";
  if (type === "모아타운" || type === "모아타운통합기획") return "moa";
  if (type === "가로주택" || type === "소규모") {
    // 가로주택 부지가 모아타운 관리계획에 묶여 고시된 경우(예: 중화1동 3구역)는 모아타운 절차로 본다
    return s.includes("모아타운") ? "moa" : "small";
  }
  if (type === "일반재개발") return k.includes("재건축") ? "rebuild" : "redev";
  // 재건축은 따로 분류된 뒤에도 소분류(kind)를 함께 본다 — 소분류 없이 들어온 재건축 레코드는 재건축 사다리로
  if (type === "재건축") return "rebuild";
  if (type === "신통기획" || type === "공공재개발") return "redev";
  if (type === "도공복" || (type ?? "").startsWith("민간도심복합")) return "doum";
  // 지주택 = 지역주택조합이 지구단위계획구역으로 추진하는 공동주택 —
  //   정비구역 지정이 아니라 지구단위계획 결정이라 사다리도 따로 쓴다
  if (type === "지주택") return "jiju";
  if (type === "역세권" || type === "장기전세") {
    // 역세권·장기전세라도 '도시정비형 재개발'은 정비사업 절차(추진위·조합)를 따른다.
    //   소분류가 일반(장기전세주택·역세권활성화)이어도 단계가 정비구역·추진위·조합설립이면
    //   실제로는 정비사업으로 진행 중인 구역이라 같은 절차로 본다(예: 염창동 272-23).
    if (k.includes("도시정비")) return "redev";
    if (/추진위|조합설립|정비계획\s*수립|정비구역/.test(s)) return "redev";
    return "station";
  }
  return "redev";
}

const E = (k: StageKey, d?: string, ip?: boolean, note?: string): StageEvent => ({ k, d, ip, note });

// ─────────────────────────────────────────────────────────────────────────────
// 1) 현재 데이터(서울시 고시 2,424곳)의 단계 표기 193가지 — 손으로 매핑
//    · 한 문자열에 여러 사건이 있으면 시간 순으로 적는다.
//    · 날짜는 문자열에 적힌 것만 옮긴다.
// ─────────────────────────────────────────────────────────────────────────────
export const EXACT_STAGE: Record<string, StageEvent[]> = {
  // ── 단일 단계 ──────────────────────────────────────────────────────────────
  "추진준비": [E("prep")],
  "사전검토": [E("prep", undefined, true)],
  "서울시 사전검토회의": [E("prep", undefined, true)],
  "통심위 사전자문": [E("prep", undefined, true)],
  "주민합의체 구성": [E("prep")],
  "추진준비(공모 준비)": [E("prep", undefined, true)],
  "추진준비(공모 참가 신청)": [E("prep", undefined, true)],
  "추진준비(설명회)": [E("prep", undefined, true)],
  "추진준비(신탁 MOU)": [E("prep", undefined, true)],
  "추진준비(신탁사 입찰)": [E("prep", undefined, true)],
  "추진준비(주민제안)": [E("prep", undefined, true)],
  "추진준비(신통기획 자문 신청 2026-11)": [E("prep", "2026-11", true)],
  "진행 중(강남구 정비사업 현황 등재)": [E("prep", undefined, true)],
  "재건축진단 완료(안전진단)": [E("safety")],
  "재건축진단 통과(2024-06, E등급)": [E("safety", "2024-06")],
  "재건축진단 완료(2024-01, E등급)·사업방식 미정": [E("safety", "2024-01", false, "사업방식 미정")],
  "후보지선정": [E("candidate")],
  "선정구역": [E("candidate")],
  "대상지선정": [E("candidate")],
  "대상지 선정": [E("candidate")],
  "구역지정": [E("district")],
  "지구지정": [E("district")],
  "예정지구지정": [E("district")],
  "관리지역고시": [E("district")],
  "관리계획고시": [E("district")],
  "추진위구성": [E("committee")],
  "추진위원회 승인": [E("committee")],
  "조합설립추진중": [E("union", undefined, true)],
  "조합설립인가": [E("union")],
  "조합설립인가 추진중": [E("union", undefined, true)],
  "사업시행인가": [E("implement")],
  "사업시행계획인가": [E("implement")],
  "사업계획승인": [E("implement")],
  "사업시행자지정": [E("implement")],
  // 사업시행(계획)인가 '공람' — 인가 전이라 진행 중으로 둔다(상도15, 2026-11-26 공람공고)
  "사업시행계획인가(공람)": [E("implement", undefined, true, "공람")],
  "사업시행인가 공람": [E("implement", undefined, true, "공람")],
  "건축심의": [E("design", undefined, true)],
  "건축심의/통합심의": [E("design", undefined, true)],
  "건축허가": [E("design")],
  "관리처분계획인가": [E("disposition")],
  "착공": [E("construct")],
  "입주자 모집공고 완료": [E("recruit")],
  "입주": [E("complete")],
  "사용승인": [E("complete")],
  "준공": [E("complete")],
  "준공(일부)": [E("complete", undefined, false, "일부 준공")],
  "이주·철거": [E("demolish")],

  // ── 후보지·대상지 선정 ─────────────────────────────────────────────────────
  "대상지선정(추진중)": [E("candidate", undefined, true)],
  "대상지선정(2026-02-03)": [E("candidate", "2026-02-03")],
  "대상지선정(2026-11-13)": [E("candidate", "2026-11-13")],
  "대상지 선정(2026-05-14)": [E("candidate", "2026-05-14")],
  "후보지 선정(2021-03-31)": [E("candidate", "2021-03-31")],
  "후보지 선정(2026-05-06)": [E("candidate", "2026-05-06")],
  "후보지 선정(2026-05-07)": [E("candidate", "2026-05-07")],
  "후보지선정(2026-10-30)": [E("candidate", "2026-10-30")],
  "후보지선정(2026-05-06 조건부)": [E("candidate", "2026-05-06", false, "조건부 선정")],
  "후보지 최종 선정(2026-08-04)": [E("candidate", "2026-08-04")],
  "모아타운 후보지 선정(2026-07-30)": [E("candidate", "2026-07-30")],
  "SH 참여 모아타운 선정(2026-02-25)": [E("candidate", "2026-02-25")],
  "SH 참여 모아타운 선정(2026-02-26)·관리계획 수립 중(2026-06-10)": [
    E("candidate", "2026-02-26"),
    E("plan", "2026-06-10", true),
  ],
  "대상지 선정(2024-11-15)·관리계획 수립 중(1·2구역 용역 2026-06-29 입찰)": [
    E("candidate", "2024-11-15"),
    E("plan", "2026-06-29", true, "용역 입찰"),
  ],
  "대상지선정(2025-12-23)·관리계획 수립": [E("candidate", "2025-12-23"), E("plan", undefined, true)],
  "대상지 선정·행위제한(안) 열람공고(2026-10-29, 동작구 공고 제2026-1754호)": [
    E("candidate"),
    E("restrict", "2026-10-29", true, "행위제한(안) 열람공고"),
  ],
  "신통기획 후보지 상정(2026-10-22 서울시 공고)": [E("candidate", "2026-10-22", true, "후보지 상정")],
  "입안제안": [E("candidate", undefined, true, "입안 제안")],

  // ── 신통기획·정비계획·관리계획 수립 ────────────────────────────────────────
  "기획완료": [E("plan")],
  "정비계획 수립": [E("plan")],
  "정비계획수립": [E("plan")],
  "촉진계획수립(변경)": [E("plan")],
  "관리계획수립": [E("plan")],
  "관리계획 수립중": [E("plan", undefined, true)],
  "관리계획수립(심의통과)": [E("plan", undefined, true, "통합심의 통과")],
  "사전자문": [E("plan", undefined, true)],
  "수립범위 자문": [E("plan", undefined, true)],
  "위원회심의": [E("district", undefined, true)], // 모아타운은 관리계획 심의 — 아래 EXACT_BY_TYPE에서 덮는다
  "신속통합기획 자문(1차 완료)": [E("plan", undefined, true, "1차 자문 완료")],
  "신통기획 확정·공람공고(공청회 완료)": [E("plan", undefined, false, "공청회 완료")],
  "권리산정기준일고시(2026-08-27)": [E("plan", "2026-08-27")],
  "정비계획 수립(정보몽땅 등록)": [E("plan")],
  "연번부여(2023-07-04)·후보지 선정 심사": [E("prep", "2023-07-04"), E("candidate", undefined, true, "후보지 선정 심사")],
  "주민제안·관리계획 수립 중(권리산정기준일 고시 2026-08-27)": [
    E("plan", "2026-08-27", true, "주민제안 · 관리계획 수립 중"),
  ],
  "번호부여(2024, 제10호)·정비계획 수립 용역": [E("prep", undefined, false, "2024 · 제10호"), E("plan", undefined, true, "용역")],

  // ── 지정 공람·행위제한 ─────────────────────────────────────────────────────
  "정비구역지정(공람)": [E("notice", undefined, true)],
  "열람공고": [E("notice", undefined, true)],
  "행위제한": [E("restrict")],
  "건축허가등 제한(2025-12-26)": [E("restrict", "2025-12-26")],
  "행위제한(2026-10-08 고시)": [E("restrict", "2026-10-08")],
  "행위제한(기간연장 2026-10-23)": [E("restrict", "2026-10-23", false, "기간연장")],
  "행위제한(열람공고 2026-11-12~11-27)": [E("restrict", "11.12~11.27", true, "열람공고")],
  "행위제한(정비계획 공람 2026-10-28)": [E("restrict", "2026-10-28", true, "정비계획 공람")],
  "행위제한 심의 통과(2026-11-12)·신통기획 자문": [
    E("restrict", "2026-11-12", true, "심의 통과"),
    E("plan", undefined, true, "신통기획 자문"),
  ],
  "정비계획 공람(2025-11-05)": [E("notice", "2025-11-05", true)],
  "정비계획 공람(2025-12-18)": [E("notice", "2025-12-18", true)],
  "정비계획 공람(2026-03-18)": [E("notice", "2026-03-18", true)],
  "정비계획 공람(2026-07-16)": [E("notice", "2026-07-16", true)],
  "정비계획 공람(2026-05-28)·도계위 수정가결(2026-10-21)": [
    E("notice", "2026-05-28", true),
    E("district", "2026-10-21", true, "도계위 수정가결"),
  ],
  "정비구역 지정 공람(2026-10-29)": [E("notice", "2026-10-29", true)],
  // 지주택(지역주택조합·지구단위계획구역)의 열람공고 — '구역 지정'이 들어가도 지정 완료가 아니라 열람 단계다
  "지구단위계획구역 지정 열람공고(2026-11-05)": [E("notice", "2026-11-05", true)],
  "정비구역 지정(안) 공람(2026-04-02)": [E("notice", "2026-04-02", true)],
  "정비구역 지정(안) 공람(2026-07-02~08-03)": [E("notice", "2026-07-02~08-03", true)],
  "정비구역 지정(안) 공람(11.19~12.21)": [E("notice", "11.19~12.21", true)],
  "정비구역 지정(안) 재공람(2026-11-18~12-18)": [E("notice", "2026-11-18~12-18", true, "재공람")],
  "정비구역 지정(안) 재공람·고시 대기(2026-08-07)": [E("notice", "2026-08-07", true, "재공람 · 고시 대기")],

  // ── 지정·고시 · 추진위 · 조합 ──────────────────────────────────────────────
  "정비구역지정(2026-05-28)": [E("district", "2026-05-28")],
  "정비구역 지정·고시(2026-10-22)": [E("district", "2026-10-22")],
  "정비구역 지정(2025-12-26)·추진위원회 승인(2026-04-24)": [
    E("district", "2025-12-26"),
    E("committee", "2026-04-24"),
  ],
  "정비구역 지정(2025-12-26)·통합심의 통과(2026-08-20)": [
    E("district", "2025-12-26"),
    E("design", "2026-08-20", true, "통합심의 통과"),
  ],
  "정비구역 지정(2026-09-10)·조합설립 준비": [E("district", "2026-09-10"), E("union", undefined, true, "조합설립 준비")],
  "정비구역 지정(2026-10-01)·조합설립 추진": [E("district", "2026-10-01"), E("union", undefined, true, "조합설립 추진")],
  "구역계 변경·재추진(2026-05-14 후보지 미선정)": [E("prep", "2026-05-14", true, "구역계 변경 · 재추진")],
  "특별계획구역2 지정·세부개발계획 결정(도건위 수정가결 2026-05-13)": [E("district", "2026-05-13", false, "도건위 수정가결")],
  "지구단위계획구역 지정·지형도면 고시(2026-11-05)": [E("district", "2026-11-05")],
  // 황학 지구단위계획구역(중구 황학동 730 일대) — 2026-11-25 제20차 도건위 수정 가결.
  //   구역 지정은 위원회를 통과했지만 서울시보 결정 고시·지형도면 고시 전이라 '고시 전'으로 표시한다.
  "지구단위계획구역 지정·계획 결정(도건위 수정가결 2026-11-25)": [
    E("district", "2026-11-25", true, "도건위 수정가결 · 결정 고시 전"),
  ],
  "지구변경": [E("district")],
  "모아타운 관리계획 승인(2023-08-10)": [E("district", "2023-08-10")],
  "조합설립추진위원회 승인(2026-11-11 정정 고시)": [E("committee", "2026-11-11", false, "정정 고시")],
  "후보지 선정(2025-08-27) → 준비위원회 구성 승인(2026-01-28)": [
    E("candidate", "2025-08-27"),
    E("committee", "2026-01-28", false, "준비위원회 구성 승인"),
  ],
  "조합설립인가(2026-06-05)": [E("union", "2026-06-05")],
  // 사당17구역(동작구 사당동 63-1) — 2026-01-22 정비구역 지정 고시(서울시 고시 제2026-47호),
  //   2026-08-21 동작구 조합설립인가. 후보지 선정일(2024-10-21)은 selectedAt으로 따로 들어간다.
  "정비구역 지정(2026-01-22)·조합설립인가(2026-08-21)": [
    E("district", "2026-01-22"),
    E("union", "2026-08-21"),
  ],
  "사업시행자 지정(2026-05-21, SH)": [E("implement", "2026-05-21", false, "SH")],
  // 사업시행자 지정이 철회되면 그 뒤 절차(사업시행인가 등)는 다시 밟아야 한다 — 구역은 살아 있고
  //   (영등포구 고시 제2026-119호는 구역 지정이 아니라 사업시행자 지정만 철회) 추진위 구성부터 재시작한다.
  //   사다리는 뒤로 가지 않으므로 지금 위치를 '추진위 구성(진행 중)'으로 두고, 지나온 사업시행인가는
  //   원문(서울시 표기)과 구역 메모에 남긴다(2026-11-23 대선제분1구역1지구).
  "사업시행자 지정 철회(2026-07-23)·추진위원회 구성 추진": [
    E("district", "2020-11-26"),
    E("committee", undefined, true, "추진위원회 구성 절차 진행(2026-08-11)"),
  ],
  "기본계획 수립·연번부여(2023-02-24)": [E("prep", "2023-02-24", false, "기본계획 수립")],
  "연번부여(2025-07-08)·추진위": [E("prep", "2025-07-08"), E("committee")],

  // ── 연번부여·동의서 번호부여(추진준비) ─────────────────────────────────────
  "연번부여(2024-02)": [E("prep", "2024-02")],
  "연번부여(2024-07-04)·동의서 징구": [E("prep", "2024-07-04", false, "동의서 징구")],
  "연번부여(2024-07-12)·후보지 선정 심사": [E("prep", "2024-07-12"), E("candidate", undefined, true, "후보지 선정 심사")],
  "연번부여(2024-08-08)": [E("prep", "2024-08-08")],
  "연번부여(2025-01-10)·후보지 신청 전": [E("prep", "2025-01-10", false, "후보지 신청 전")],
  "연번부여(2025-02-17)·후보지 선정 심사": [E("prep", "2025-02-17"), E("candidate", undefined, true, "후보지 선정 심사")],
  "연번부여(2025-04-09)": [E("prep", "2025-04-09")],
  "연번부여(2025-05-02)": [E("prep", "2025-05-02")],
  "연번부여(2025-05-13)": [E("prep", "2025-05-13")],
  "연번부여(2025-07-10)·추진위원회 준비": [E("prep", "2025-07-10"), E("committee", undefined, true, "추진위 준비")],
  "연번부여(2025-08-28, 제12호)": [E("prep", "2025-08-28")],
  "연번부여(2025-09-09)": [E("prep", "2025-09-09")],
  "연번부여(2025-09-16 제9호→2026-07-01 제14호)": [E("prep", "2026-07-01", false, "제14호(이전 제9호)")],
  "연번부여(2025-09-26, 제10호)": [E("prep", "2025-09-26")],
  "연번부여(2025-10-31)·구역계 변경(2026-08-26)": [E("prep", "2025-10-31", false, "구역계 변경 2026-08-26")],
  "연번부여(2025-11-04 수정, 최초 2025-03-24)": [E("prep", "2025-11-04", false, "최초 2025.03.24")],
  "연번부여(2025-11-19)": [E("prep", "2025-11-19")],
  "연번부여(2025-12-03)·후보지 신청 전": [E("prep", "2025-12-03", false, "후보지 신청 전")],
  "연번부여(2025-12-10, 제14호)": [E("prep", "2025-12-10")],
  "연번부여(2025-12-19)": [E("prep", "2025-12-19")],
  "연번부여(2026-01-23)·후보지 심사 상정(2026-10)": [E("prep", "2026-01-23"), E("candidate", "2026-10", true, "후보지 심사 상정")],
  "연번부여(2026-02-10)·후보지 선정 심사": [E("prep", "2026-02-10"), E("candidate", undefined, true, "후보지 선정 심사")],
  "연번부여(2026-02-19)·후보지 선정 심사": [E("prep", "2026-02-19"), E("candidate", undefined, true, "후보지 선정 심사")],
  "연번부여(2026-02-20)·후보지 신청 전": [E("prep", "2026-02-20", false, "후보지 신청 전")],
  "연번부여(2026-02-25)": [E("prep", "2026-02-25")],
  "연번부여(2026-03-05)·후보지 신청 전": [E("prep", "2026-03-05", false, "후보지 신청 전")],
  "연번부여(2026-03-05, 제13호)·후보지 신청 서류 보완(2026-10)": [
    E("prep", "2026-03-05"),
    E("candidate", "2026-10", true, "후보지 신청 서류 보완"),
  ],
  "연번부여(2026-03-10)": [E("prep", "2026-03-10")],
  "연번부여(2026-03-18) → 신통기획 후보지 상정(2026-10-22 서울시 공고)": [
    E("prep", "2026-03-18"),
    E("candidate", "2026-10-22", true, "후보지 상정"),
  ],
  "연번부여(2026-03-20)·후보지 상정": [E("prep", "2026-03-20"), E("candidate", undefined, true, "후보지 상정")],
  "연번부여(2026-03-30, 제12호→변경 제15호)": [E("prep", "2026-03-30", false, "제15호(이전 제12호)")],
  "연번부여(2026-04-07, 제14호)·입안 요청 접수(2026-10)": [E("prep", "2026-04-07"), E("candidate", "2026-10", true, "입안 요청")],
  "연번부여(2026-04-16)·후보지 상정": [E("prep", "2026-04-16"), E("candidate", undefined, true, "후보지 상정")],
  "연번부여(2026-04-22)·후보지 신청 전": [E("prep", "2026-04-22", false, "후보지 신청 전")],
  "연번부여(2026-05-06)": [E("prep", "2026-05-06")],
  "연번부여(2026-05-13)": [E("prep", "2026-05-13")],
  "연번부여(2026-05-15)": [E("prep", "2026-05-15")],
  "연번부여(2026-05-22)": [E("prep", "2026-05-22")],
  "연번부여(2026-05-27)": [E("prep", "2026-05-27")],
  "연번부여(2026-06-02)": [E("prep", "2026-06-02")],
  "연번부여(2026-07-24)": [E("prep", "2026-07-24")],
  "연번부여(2026-07-30)": [E("prep", "2026-07-30")],
  "연번부여(2026-08-11)": [E("prep", "2026-08-11")],
  "연번부여(2026-08-11)·후보지 사전검증(동의서 징구 중단)": [
    E("prep", "2026-08-11"),
    E("candidate", undefined, true, "후보지 사전검증"),
  ],
  "연번부여(2026-08-12)": [E("prep", "2026-08-12")],
  "연번부여(2026-09-01)": [E("prep", "2026-09-01")],
  "연번부여(2026-09-04, 제16호)·후보지 신청 접수(2026-10-15~23)": [
    E("prep", "2026-09-04"),
    E("candidate", "2026-10-15~23", true, "후보지 신청 접수"),
  ],
  "연번부여(2026-09-09, 제16호)": [E("prep", "2026-09-09")],
  "연번부여(2026-09-10)": [E("prep", "2026-09-10")],
  "연번부여(2026-09-14, 제16호)": [E("prep", "2026-09-14")],
  "연번부여(2026-09-18)": [E("prep", "2026-09-18")],
  "연번부여(2026-10-16)": [E("prep", "2026-10-16")],
  "연번부여(2026-10-26)": [E("prep", "2026-10-26")],
  "연번부여(2026-10-28)·후보지 신청 전": [E("prep", "2026-10-28", false, "후보지 신청 전")],
  "연번부여(2026-11-03)": [E("prep", "2026-11-03")],
  "연번부여(2026-11-16)": [E("prep", "2026-11-16")],
  "연번부여(2026-11-19, 모아통합기획 제1호)": [E("prep", "2026-11-19", false, "모아통합기획 제1호")],
  "연번부여(추정 2026-09-18)": [E("prep", "2026-09-18", false, "추정")],
  "연번부여(추정 2026-10-13)": [E("prep", "2026-10-13", false, "추정")],
  "연번부여·구역계 변경(2026-04-10)": [E("prep", "2026-04-10", false, "구역계 변경")],
  "연번부여 취소(2026-10-26)": [E("prep", "2026-10-26", false, "연번부여 취소")],
  "번호부여(2023-06-09)": [E("prep", "2023-06-09")],
  "번호부여(2025-06-20)": [E("prep", "2025-06-20")],
  "번호부여(2025-10-27)": [E("prep", "2025-10-27")],
  "동의서 번호부여(2025-09-24, 사당1동 제1호)": [E("prep", "2025-09-24", false, "사당1동 제1호")],
  "동의서 번호부여(2025-12-31)": [E("prep", "2025-12-31")],
  "동의서 번호부여(2026-03-24, 상도3동 제1호)": [E("prep", "2026-03-24", false, "상도3동 제1호")],
  "동의서 번호부여(2026-03-31)": [E("prep", "2026-03-31")],
  "동의서 번호부여(2026-09-04)": [E("prep", "2026-09-04")],
  "동의서 번호부여(2차 추가)": [E("prep", undefined, false, "2차 추가")],
  "동의서 번호부여 요청 구역 공개(동작구)": [E("prep", undefined, true, "요청 구역 공개")],
  "동의서 번호부여 요청 구역 공개(서초구)": [E("prep", undefined, true, "요청 구역 공개")],
  "동의서 번호부여 + 신통기획 후보지 상정(2026-10-22)": [
    E("prep"),
    E("candidate", "2026-10-22", true, "후보지 상정"),
  ],
  "동의서 징구(2026-07-08 연번부여, 후보지 신청 전)": [E("prep", "2026-07-08", false, "동의서 징구")],
  "신속통합기획 자문신청(2025-07-11 접수)": [E("prep", "2025-07-11", true, "자문 신청")],
  "신속통합기획 자문신청(2026-03-27)": [E("prep", "2026-03-27", true, "자문 신청")],
  "신속통합기획 자문(2026-07-22)·입안제안 동의서 징구": [
    E("plan", "2026-07-22", true, "자문"),
    E("candidate", undefined, true, "입안제안 동의서 징구"),
  ],

  // ── 2026-11-27 성동·광진 9곳 반영에서 새로 생긴 표기 ─────────────────────
  //    · 금호동4가 1458(지주택) — 2026-01-27 건축심의(변경) 통과
  "건축심의통과(2026-01-27)": [E("design", "2026-01-27")],
  //    · 금호21구역 — 2026-02-07 시공사 선정 총회에서 롯데건설 선정
  "시공사선정(2026-02-07)": [E("builder", "2026-02-07")],
  //    · 금남시장(시장정비사업) — 추진계획 승인과 함께 금남시장정비구역 신설(고시 제2025-252호)
  "추진계획승인(2025-05-01)": [E("district", "2025-05-01", false, "시장정비구역 신설·추진계획 승인")],
  //    · 응봉동 재건축 2곳 — 정밀안전진단 통과
  "안전진단통과(2026-01-30)": [E("safety", "2026-01-30")],
  "안전진단통과(2023-10-09)·리모델링 조합 해산(2026-04-30)": [E("safety", "2023-10-09")],
  //    · (가)용답1 — 후보지 미선정(2026-04-29) 뒤 동의서 재사용으로 재신청(2026-10-20)
  "연번부여(2025-12-03)·후보지 미선정 후 재신청(2026-10-20)": [
    E("prep", "2025-12-03"),
    E("candidate", "2026-10-20", true, "후보지 미선정 후 재신청"),
  ],

  // ── 멈춘 구역(중단 사유는 HALTED_STAGE) ─────────────────────────────────
  "후보지 미선정(2026-05-14)": [E("prep", "2026-05-14", true, "후보지 미선정")],
  "후보지취소": [],
  "후보지 신청(2026-03-11) 후 마포구 미추천(2026-08-08 게시)": [E("candidate", "2026-03-11", true, "후보지 신청")],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2) 멈춘 구역 — 사다리를 그리지 않고 사유만 보여준다.
// ─────────────────────────────────────────────────────────────────────────────
export const HALTED_STAGE: Record<string, string> = {
  "후보지 미선정(2026-05-14)": "신통기획 후보지 미선정(보류) · 2026-05-14 고시",
  "후보지취소": "후보지 선정 취소",
  "연번부여(2024-08-22)·후보지 추천 제외(2025-06-30)": "자치구 후보지 추천 제외",
  "후보지 신청(2026-03-11) 후 마포구 미추천(2026-08-08 게시)": "마포구 후보지 미추천",
};

/** 유형별 예외 — 같은 표기라도 사업유형에 따라 다른 칸으로 간다. */
export const EXACT_BY_TYPE: Partial<Record<string, Record<string, StageEvent[]>>> = {
  // 모아타운의 '위원회심의'는 관리계획(수립·공람) 심의라 구역지정이 아니다
  "모아타운": { "위원회심의": [E("plan", undefined, true)] },
  // 모아타운통합기획도 같은 모아타운 절차를 따른다(통합기획 단계가 앞에 붙을 뿐 관리계획 심의 자리는 같다)
  "모아타운통합기획": { "위원회심의": [E("plan", undefined, true)] },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3) 새 표기용 규칙 — EXACT에 없는 문자열만 쓴다(현재 데이터 0건).
// ─────────────────────────────────────────────────────────────────────────────
type Rule = { re: RegExp; k: StageKey; ip?: boolean; note?: string };

const FALLBACK_RULES: Rule[] = [
  { re: /후보지\s*취소|사업\s*취소|지정\s*해제|반려/, k: "prep", ip: false },
  { re: /준공|사용승인|입주\s*완료|사업완료/, k: "complete" },
  { re: /이주\s*[·,]?\s*철거/, k: "demolish" },
  { re: /관리처분/, k: "disposition" },
  { re: /착공/, k: "construct" },
  { re: /입주자\s*모집/, k: "recruit" },
  { re: /조합설립인가/, k: "union" },
  { re: /조합설립\s*(추진|준비)/, k: "union", ip: true },
  { re: /시공사\s*선정/, k: "builder" },
  { re: /사업시행인가|사업시행계획인가|사업계획승인|사업시행자\s*지정/, k: "implement" },
  { re: /건축심의|건축허가|통합심의|도계위|도건위/, k: "design", ip: true },
  { re: /추진위|준비위원회/, k: "committee" },
  { re: /관리지역\s*고시|관리계획\s*승인|정비구역\s*지정(?!.*공람)|구역지정|구역\s*지정|지구지정|예정지구/, k: "district" },
  { re: /정비구역\s*지정[^(){]{0,6}공람|재?공람|열람공고/, k: "notice", ip: true },
  { re: /행위제한|건축허가등\s*제한/, k: "restrict" },
  { re: /관리계획\s*수립|정비계획\s*수립|신통기획|기획\s*(완료|확정)|촉진계획|권리산정기준일|심의|자문/, k: "plan", ip: true },
  { re: /후보지.*(선정|상정|심사)|대상지.*(선정|입안)|입안제안/, k: "candidate", ip: true },
  { re: /안전진단|재건축진단/, k: "safety" },
  { re: /연번부여|번호부여|동의서|추진준비|사전검토|주민합의체|주민제안|설명회|공모/, k: "prep" },
];

/** EXACT에 없는 표기를 규칙으로 푼다. 문자열에 적힌 첫 날짜만 붙인다. */
function fallbackEvents(stage: string): StageEvent[] {
  const out: StageEvent[] = [];
  const date = stage.match(/(20\d{2})[-./](\d{1,2})(?:[-./](\d{1,2}))?/);
  const d = date ? (date[3] ? `${date[1]}-${date[2]}-${date[3]}` : `${date[1]}-${date[2]}`) : undefined;
  for (const r of FALLBACK_RULES) {
    if (r.re.test(stage)) {
      out.push({ k: r.k, d, ip: r.ip, note: r.note });
      break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 타임라인 만들기
// ─────────────────────────────────────────────────────────────────────────────
export type StageStepView = {
  label: string;
  state: "done" | "current" | "todo";
  /** 데이터에 적힌 날짜만(지어내지 않음) — "2026.10.22" 형태 */
  date?: string;
  /** 현재 단계의 부가 표기(진행 중·심의 중 등) */
  note?: string;
  inProgress?: boolean;
};

export type StageTimeline = {
  family: StageFamily;
  familyLabel: string;
  steps: StageStepView[];
  /** 현재(가장 멀리 간) 단계의 0-based 위치 */
  currentIndex: number;
  /** 현재 단계 라벨 */
  currentLabel: string;
  /** 서울시 표기 원문 그대로 — 화면에 이 값을 함께 보여준다 */
  rawStage: string;
  /** 지난 단계 수 / 전체 단계 수 */
  doneCount: number;
  total: number;
  status: "active" | "completed" | "halted";
  haltedReason?: string;
  /** 중단 구역에서 마지막으로 도달한 단계 */
  lastReached?: string;
  lastReachedDate?: string;
  /** 표준 단계로 분류하지 못한 표기인지(사다리 위치는 0단계로 둔다) */
  unmapped: boolean;
  /** 구역 단계 정보 기준일(데이터에 있을 때만) */
  asOf?: string;
  /** 단계별 날짜를 서울시 통계·정보몽땅에서 채웠는지(화면 하단 출처 문구용) */
  hasStatsDates?: boolean;
  /** 단계 날짜 기준일 */
  datesAsOf?: string;
  /** 권리산정기준일 — 분양받을 권리의 산정 기준일(데이터에 있을 때만) */
  rightsDate?: string;
};

/** "2026-10-22" → "2026.10.22", "2026-10" → "2026.10", "11.19~12.21" → 그대로 */
export function formatStageDate(d?: string): string | undefined {
  if (!d) return undefined;
  return d.replace(/-/g, ".");
}

export function buildStageTimeline(zone: {
  type: MapZoneType | string;
  kind?: string;
  stage: string;
  selectedAt?: string;
  asOf?: string;
  stageDates?: Partial<Record<string, string>>;
  rightsDate?: string;
  datesAsOf?: string;
}): StageTimeline {
  const family = pickFamily(zone.type, zone.kind, zone.stage);
  const steps = FAMILY_STEPS[family];
  const rawStage = zone.stage ?? "";

  const haltedReason = HALTED_STAGE[rawStage];
  const byType = EXACT_BY_TYPE[zone.type as string];
  let events: StageEvent[] = (byType && byType[rawStage]) ?? EXACT_STAGE[rawStage] ?? fallbackEvents(rawStage);

  // 후보지 선정 취소처럼 '선정된 뒤 멈춘' 구역은, 선정일(selectedAt)을 중단 전 마지막 단계로 보여준다.
  if (haltedReason && haltedReason.includes("취소") && zone.selectedAt && events.length === 0) {
    events = [{ k: "candidate", d: zone.selectedAt }];
  }

  // 각 사건을 사다리 칸으로 옮긴다(사다리에 없는 단계는 무시 — 엉뚱한 칸에 넣지 않는다)
  const resolved = events
    .map((e) => {
      const i = steps.findIndex((s) => s.keys.includes(e.k));
      return { e, i };
    })
    .filter((r) => r.i >= 0);

  const unmapped = resolved.length === 0;
  const currentIndex = unmapped ? 0 : Math.max(...resolved.map((r) => r.i));

  // 칸별 날짜·메모 — 같은 칸에 사건이 여럿이면 마지막(가장 나중) 사건의 것을 쓴다
  const byStep = new Map<number, StageEvent>();
  for (const r of resolved) byStep.set(r.i, { ...byStep.get(r.i), ...r.e });

  // selectedAt은 신통기획·모아타운·도공복의 '후보지·대상지 선정일' — 선정 칸의 날짜로만 쓴다.
  //   · 칸 위치를 밀어 올리지 않고(위치는 stage만 본다), 선정이 진행 중인 구역에는 붙이지 않는다.
  //   · 장기전세처럼 selectedAt이 구역 지정일인 유형에는 붙이지 않는다.
  const selectedAtIsCandidate =
    !!zone.selectedAt &&
    (zone.type === "신통기획" ||
      zone.type === "모아타운" ||
      zone.type === "모아타운통합기획" ||
      zone.type === "도공복" ||
      (zone.type ?? "").toString().startsWith("민간도심복합") ||
      zone.type === "공공재개발");
  const candidateIndex = steps.findIndex((s) => s.keys.includes("candidate"));
  if (selectedAtIsCandidate && candidateIndex >= 0 && candidateIndex <= currentIndex) {
    const ev = byStep.get(candidateIndex);
    const stillSelecting = candidateIndex === currentIndex && !!ev?.ip;
    if (!ev?.d && !stillSelecting) byStep.set(candidateIndex, { ...(ev ?? { k: "candidate" }), d: zone.selectedAt });
  }

  // ── 서울시 통계·정보몽땅에서 모은 단계별 공식 날짜(2026-11-27) ────────────────
  //   · 사다리 위치는 stage 문자열이 정한다(공식 현재 단계가 우선) — 날짜가 칸을 밀지 않는다.
  //   · 현재 단계보다 뒤 칸의 날짜는 붙이지 않는다(단계 순서가 뒤집힌 구역은 날짜를 참고로만 남긴다).
  //   · 이미 표기 문자열에 날짜가 있는 칸은 그 값을 그대로 둔다.
  let hasStatsDates = false;
  const stageDates = zone.stageDates ?? {};
  // 한 칸에 여러 키가 들어가는 칸(사업시행인가 = implement·design)은 **칸의 첫 키를 우선**한다
  //   — 건축심의(design) 날짜가 사업시행인가 날짜를 덮어쓰지 않도록.
  const statsByStep = new Map<number, { rank: number; k: string; d: string }>();
  for (const [k, d] of Object.entries(stageDates)) {
    if (!d) continue;
    const i = steps.findIndex((s) => s.keys.includes(k as StageKey));
    if (i < 0 || i > currentIndex) continue; // stage 문자열의 현재 단계를 우선 존중
    const rank = steps[i].keys.indexOf(k as StageKey);
    const prev = statsByStep.get(i);
    if (!prev || rank < prev.rank) statsByStep.set(i, { rank, k, d });
  }
  for (const [i, { k, d }] of [...statsByStep.entries()].sort((a, b) => a[0] - b[0])) {
    const ev = byStep.get(i);
    if (ev?.d) continue; // 표기 문자열에 이미 날짜가 있으면 그 값을 둔다
    byStep.set(i, { ...(ev ?? { k: k as StageKey }), d });
    hasStatsDates = true;
  }

  const finished = currentIndex === steps.length - 1 && resolved.some((r) => r.i === steps.length - 1 && !r.e.ip);

  const views: StageStepView[] = steps.map((s, i) => {
    const ev = byStep.get(i);
    const state: StageStepView["state"] = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
    return {
      label: s.label,
      state,
      date: formatStageDate(ev?.d),
      note: state === "current" ? ev?.note : undefined,
      inProgress: state === "current" ? !!ev?.ip : undefined,
    };
  });

  return {
    family,
    familyLabel: FAMILY_LABEL[family],
    steps: views,
    currentIndex,
    currentLabel: unmapped ? rawStage : steps[currentIndex].label,
    rawStage,
    doneCount: currentIndex,
    total: steps.length,
    status: haltedReason ? "halted" : finished ? "completed" : "active",
    haltedReason,
    // 중단 구역은 '어디까지 갔다가 멈췄는지'를 사건 메모(없으면 칸 이름)로 보여준다
    lastReached: haltedReason && !unmapped ? byStep.get(currentIndex)?.note ?? steps[currentIndex].label : undefined,
    lastReachedDate: haltedReason && !unmapped ? formatStageDate(byStep.get(currentIndex)?.d) : undefined,
    unmapped,
    asOf: zone.asOf,
    hasStatsDates,
    datesAsOf: zone.datesAsOf,
    rightsDate: formatStageDate(zone.rightsDate),
  };
}
