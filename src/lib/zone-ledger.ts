// ─────────────────────────────────────────────────────────────────────────────
// 구역현황 **정밀 분석** — 국토교통부 건축물대장 표제부(getBrTitleInfo) 기반
//
//   1차 추정(`zone-stats.ts`)은 GIS건물통합정보와 연식 색인만 써서 구조를 모른 채
//   '30년·20년'을 함께 세고, 세대수는 아예 몰랐다. 이 파일은 대장 표제부가 주는
//   **주구조(strctCdNm)·사용승인일(useAprDay)·세대수(hhldCnt)·가구수(fmlyCnt)** 로
//   서울시 조례 기준 노후도와 추정 호수밀도를 낸다.
//
//   · 노후도 기준(도시정비법 시행령 제2조·서울시 조례)
//       철근콘크리트·철골철근콘크리트 구조 → 사용승인 후 30년 이상
//       그 밖의 구조(조적·목·블록·철골 등)      → 사용승인 후 20년 이상
//   · 호수 = 공동주택 세대수(hhldCnt) 또는 가구수(fmlyCnt) 중 큰 값.
//       둘 다 0인 **주거용** 건축물은 1가구로 보정한다(단독주택 등 대장 미기재).
//       상가·오피스의 호수(hoCnt)는 주거 호수가 아니라 제외한다.
//   · 부속건축물(창고·화장실 등)은 동수에서 뺀다 — 주건축물만 센다.
//   · **조례 기준 호수밀도**는 서울시 도시 및 주거환경정비 조례 제2조제5호를 따른다.
//       호수밀도 = 정비구역 1ha당 건축물 동수이고, 동수는 다음처럼 센다.
//         ① 공동주택·다가구주택 — 건축물대장 기준 **세대(가구)수가 가장 많은 1개 층**의
//            1세대를 1동으로 보고, 나머지 층 세대수는 계상하지 않는다.
//            층별개요(getBrFlrOulnInfo)의 층 용도 설명에 `다가구주택(2가구)` 처럼
//            가구수가 적혀 있으면 그 최댓값을 쓰고, 없으면 주거용 지상층 수로 나눠
//            `Math.ceil(총 세대·가구 / 주거용 지상층수)` 로 추정한다.
//         ② 단독주택(1가구) — 1동.
//         ③ 비주거용 건축물 — 건축면적(archArea) 90㎡당 1동, 소수점 이하 버림.
//       세대수를 그대로 더하면(예: 4층 다세대 8세대 → 8) 과대계상되므로,
//       화면에는 `추정 호수밀도`(세대·가구/면적)와 별도로 `조례 기준 호수밀도`를 보여 준다.
//   · **추정 평균 대지지분** = 필지별 대지면적 합 ÷ 총 세대·가구수.
//       대장 `platArea`(대지면적)는 한 필지에 동이 여럿이면 같은 값이 여러 번 오므로
//       **필지(PNU) 단위로 한 번만** 더한다(동별 중복 합산 금지).
//       `platArea` 가 0·빈 값인 필지는 연속지적도 필지면적이 있으면 그것으로 보완한다.
//   · **추정 조합원(토지등소유자) 수** — 정비사업 조합원은 토지등소유자다.
//       ① 공동주택(아파트·연립·다세대) — 구분소유이므로 표제부 세대수(hhldCnt)를 그대로
//          합산한다(0이면 1명으로 보정).
//       ② 단독·다가구주택 — 다가구 세입자 가구수(fmlyCnt)는 조합원이 아니므로
//          **필지(PNU) 1곳당 소유자 1명**으로 센다(부속동 제외, 주건축물 기준).
//       ③ 비주거(근생·업무·종교 등) — 오피스텔·상가 같은 집합건물(호수 hoCnt > 0)은
//          호마다 구분소유자가 있으므로 호수를 합산하고, 그 밖은 필지당 1명으로 센다.
//          대장이 없는 나대지·도로 필지는 조합원으로 잡히지 않는다.
//       공유지분·1+1 소유, 나대지·대장 미조회 필지 때문에 실제 조합원 수와 다를 수 있다.
//
//   이 파일은 **순수 계산·타입**만 둔다(node 모듈 없음). 브라우저에서도 안전하다.
//   대장 호출은 `src/app/api/zone-stats/precise/route.ts` 한 곳에서만 한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 구조 분류 — concrete: 철콘군(30년), other: 그 밖(20년) */
export type StructureGroup = "concrete" | "other";

/** 대장 층별개요(getBrFlrOulnInfo) 한 층 */
export type LedgerFloor = {
  /** 관리건축물대장PK(동 식별) — 표제부 동과 짝지을 때 쓴다 */
  pk: string;
  /** 층 번호 — 지하도 양수로 오고 층 구분은 gb 로 나눈다 */
  flrNo: number;
  /** 층 구분 — 지상 / 지하 / 옥탑 */
  gb: string;
  /** 층 주용도명(다가구주택·공동주택·근린생활시설 등) */
  use: string;
  /** 그 밖의 용도 설명 — 다가구주택은 '(2가구)' 처럼 가구수가 적히기도 한다 */
  etc: string;
  /** 층 면적(㎡) */
  area: number;
  /** 주거용 층인지 */
  residential: boolean;
  /** 층 용도 설명에 적힌 세대·가구수 — 없으면 null */
  households: number | null;
};

/** 대장 표제부 한 동에서 뽑은 최소 정보 */
export type LedgerBuilding = {
  /** 19자리 PNU — 어느 필지의 건물인지 */
  pnu: string;
  /** 관리건축물대장PK(동 식별) */
  pk: string;
  /** 주구조 표시명(철근콘크리트구조 등) */
  structure: string;
  /** 구조 분류 — null 이면 대장에 구조가 비어 있음 */
  group: StructureGroup | null;
  /** 주용도(공동주택·단독주택·제2종근린생활시설 등) */
  mainPurps: string;
  /** 주거용인지 — 세대수 최소 보정(1가구) 판단에만 쓴다 */
  residential: boolean;
  /** 사용승인 연도 — 미상이면 null */
  year: number | null;
  /** 사용승인일 원문(YYYYMMDD) */
  useAprDay: string;
  /** 산정 호수(세대 또는 가구) */
  units: number;
  /** hhldCnt·fmlyCnt 가 모두 0이라 1가구로 보정했는지 */
  minAdjusted: boolean;
  /** 부속건축물(창고·화장실 등) — 동수·호수에서 뺀다 */
  attached: boolean;
  /** 연면적(㎡) */
  floorArea: number;
  /** 건축면적(㎡) — 비주거용 건축물의 조례 동수(90㎡당 1동) 기준 */
  archArea: number;
  /** 지상 층수(표제부 grndFlrCnt) — 층별개요가 없을 때 추정에 쓴다 */
  groundFloors: number;
  /** 층별개요(지상·지하·옥탑 전부) — 복수 세대·가구 건물만 채운다 */
  floors: LedgerFloor[];
  /** 대지면적(㎡) — 대장 platArea. 같은 필지의 동마다 같은 값이 오므로 PNU 로 중복 제거한다 */
  platArea: number;
  /** 표제부 세대수(hhldCnt) — 공동주택 구분소유자(조합원) 수의 기본값 */
  hhldCnt: number;
  /** 표제부 가구수(fmlyCnt) — 단독·다가구 세입자 가구. 조합원 수에는 쓰지 않는다 */
  fmlyCnt: number;
  /** 표제부 호수(hoCnt) — 오피스텔·상가 등 집합건물의 구분소유자 수 */
  hoCnt: number;
  /** 주용도 코드(01 단독 / 02 공동 …) — 공동주택 판별에 쓴다 */
  mainPurpsCd: string;
};

export type PreciseChunkStats = {
  /** 이번에 조회한 필지 수 */
  parcels: number;
  /** 건축물대장이 있는 필지 수 */
  ledgerParcels: number;
  /** 대장이 없는 필지 수(무허가·도로·나대지) */
  missingParcels: number;
  /** 주건축물 동수 */
  buildings: number;
  /** 동수에서 뺀 부속건축물 수 */
  attached: number;
  /** 철콘군 동수 */
  concrete: number;
  /** 그 밖의 구조 동수 */
  other: number;
  /** 구조가 비어 있는 동수 */
  unknownStructure: number;
  /** 철콘군 중 30년 이상 */
  over30Concrete: number;
  /** 그 밖의 구조 중 20년 이상 */
  over20Other: number;
  /** 사용승인일이 없어 노후도 모수에서 빠진 동수 */
  unknownYear: number;
  /** 세대·가구 합산 호수 */
  units: number;
  /** 조례 제2조제5호 환산 동수 합계 — 호수밀도 분자 */
  ordinanceDong: number;
  /** 그중 층별개요의 층별 세대·가구수 최댓값으로 센 동수 */
  ordinanceFloor: number;
  /** 그중 층수로 나눠 추정한 동수(층별 가구수 미기재·층별개요 없음) */
  ordinanceEstimated: number;
  /** 그중 1가구 단독주택으로 센 동수 */
  ordinanceSingle: number;
  /** 그중 비주거용 건축면적 90㎡당 1동으로 센 동수 */
  ordinanceNonResidential: number;
  /** 층별개요를 조회한 필지 수 */
  floorParcels: number;
  /** 층별개요 조회가 실패한 필지 수 */
  floorErrors: number;
  /** 복수 세대·가구인데 층별개요 행이 없어 층수로 추정한 동수 */
  floorMissing: number;
  /** 1가구로 보정한 동수 */
  minUnitAdjusted: number;
  /** 1차 추정에서 연식 미상이던 동을 대장 사용승인일로 확인한 수 */
  ageResolved: number;
  /** 대지면적을 확보한 필지 수(대장 platArea + 연속지적도 보완) */
  landParcels: number;
  /** 필지별 유효 대지면적 합(㎡) — 필지(PNU) 단위로 한 번만 더한다 */
  landArea: number;
  /** 대장 platArea 가 0·빈 값이라 연속지적도 필지면적으로 보완한 필지 수 */
  landFallbackParcels: number;
  /** 추정 조합원(토지등소유자) 수 */
  owners: number;
  /** 그중 공동주택 세대수 합(hhldCnt) */
  ownerHouseholds: number;
  /** 그중 단독·다가구 필지 수(필지당 1명) */
  ownerDetached: number;
  /** 그중 비주거 소유자 수(집합건물 호수 + 필지당 1명) */
  ownerNonResidential: number;
  /** 그중 비주거 집합건물(호수>0)로 센 호수 */
  ownerShopUnits: number;
  /** 공동주택인데 hhldCnt 0이라 1명으로 보정한 동수 */
  ownerHhldAdjusted: number;
  /** 업스트림 조회에 실패한 필지 수 */
  errors: number;
  /** 구조 분포(많은 순, 최대 6개) */
  structures: { name: string; count: number }[];
};

export type PreciseSummary = PreciseChunkStats & {
  areaSqm: number;
  areaHa: number;
  /** 노후도 모수 — 주건축물 중 사용승인일이 있는 동수(구조 미상 제외) */
  effectiveBuildings: number;
  /** 서울시 조례 기준 노후도(%) = (철콘 30년↑ + 그 밖 20년↑) / 유효 동수 */
  ordinancePct: number;
  /** 추정 호수밀도(호/ha) — 세대·가구수를 그대로 더한 값(참고용) */
  density: number;
  /** 조례 기준 호수밀도(동/ha) — 서울시 도시 및 주거환경정비 조례 제2조제5호 */
  ordinanceDensity: number;
  /** 호수 1호당 대지면적(㎡) — 대지면적 0 이거나 호수 0 이면 null */
  landShareSqm: number | null;
  /** 추정 평균 대지지분(평) — 대지면적 ÷ 총 호수 ÷ 3.305785 */
  landSharePyeong: number | null;
  /** 추정 조합원 1인당 대지지분(㎡) — 대지면적 ÷ 추정 조합원 수 */
  landShareOwnerSqm: number | null;
  /** 추정 조합원 1인당 대지지분(평) */
  landShareOwnerPyeong: number | null;
};

/** POST /api/zone-stats/precise 응답 */
export type PreciseChunkResponse =
  | { ok: true; chunk: PreciseChunkStats; meta: { asOf: string; requested: number } }
  | { ok: false; error: string; detail?: string };

export const EMPTY_CHUNK: PreciseChunkStats = {
  parcels: 0,
  ledgerParcels: 0,
  missingParcels: 0,
  buildings: 0,
  attached: 0,
  concrete: 0,
  other: 0,
  unknownStructure: 0,
  over30Concrete: 0,
  over20Other: 0,
  unknownYear: 0,
  units: 0,
  ordinanceDong: 0,
  ordinanceFloor: 0,
  ordinanceEstimated: 0,
  ordinanceSingle: 0,
  ordinanceNonResidential: 0,
  floorParcels: 0,
  floorErrors: 0,
  floorMissing: 0,
  minUnitAdjusted: 0,
  ageResolved: 0,
  landParcels: 0,
  landArea: 0,
  landFallbackParcels: 0,
  owners: 0,
  ownerHouseholds: 0,
  ownerDetached: 0,
  ownerNonResidential: 0,
  ownerShopUnits: 0,
  ownerHhldAdjusted: 0,
  errors: 0,
  structures: [],
};

/** 1평 = 3.305785㎡ */
export const PYEONG_SQM = 3.305785;

/** ㎡ → ha */
export function toHa(areaSqm: number): number {
  return areaSqm > 0 ? areaSqm / 10000 : 0;
}

/**
 * 주구조 분류.
 *   · 대장의 `strctCdNm`(주구조 이름)과 `etcStrct`(기타구조 설명)를 함께 본다 —
 *     `strctCdNm` 이 '기타구조'일 때 실제 구조가 etcStrct 에 적히는 경우가 많다.
 *   · '철골철근콘크리트'는 '철근콘크리트'를 포함하므로 한 번에 걸린다.
 *   · 구조가 비어 있으면 null — 노후도 모수에서는 빼되, 화면에는 미상으로 표시한다.
 */
export function classifyStructure(strctCdNm: string, etcStrct: string): StructureGroup | null {
  const s = `${strctCdNm ?? ""} ${etcStrct ?? ""}`.replace(/\s+/g, "");
  if (!s) return null;
  // 철근콘크리트구조 · 철골철근콘크리트구조 · 철골콘크리트구조(S조) → 30년
  if (/철근콘크리트|철골철근콘크리트|철골콘크리트|SRC조|RC조/.test(s)) return "concrete";
  // 조적·벽돌·목·블록·철골·석·흙·기타 → 20년
  return "other";
}

/** 사용승인일(YYYYMMDD) → 연도. 빈 값·이상값은 null */
export function yearFromUseAprDay(raw: string): number | null {
  const s = (raw ?? "").trim();
  const m = /^(\d{4})/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  if (!Number.isFinite(year) || year < 1800 || year > 2100) return null;
  return year;
}

/** 주거용 여부 — 주용도 코드(01 단독 / 02 공동) 또는 이름에 '주택' */
export function isResidential(mainPurpsCd: string, mainPurpsCdNm: string, etcPurps: string): boolean {
  const cd = (mainPurpsCd ?? "").trim();
  if (/^0[12]/.test(cd)) return true;
  return /주택/.test(mainPurpsCdNm ?? "") || /주택/.test(etcPurps ?? "");
}

/**
 * 층 용도 설명에서 세대·가구수 뽑기 — 다가구주택은 `etcPurps` 에
 *   `다가구주택(2가구)` · `다가구주택(3세대)` 처럼 층별 가구수가 적혀 온다.
 *   숫자가 없으면 null(층수로 추정해야 한다).
 */
export function householdsFromText(text: string): number | null {
  const m = /(\d{1,3})\s*(?:가구|세대)/.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 조례 호수밀도에서 비주거용 건축물 1동으로 보는 바닥면적(㎡) */
export const NON_RESIDENTIAL_SQM_PER_DONG = 90;

/** 한 동의 조례 환산 동수를 어떤 근거로 셈했는지 */
export type OrdinanceBasis =
  /** 1가구 단독주택 — 1동 */
  | "single"
  /** 공동·다가구 — 층별개요에 적힌 층별 세대·가구수 최댓값 */
  | "floorHouseholds"
  /** 공동·다가구 — 주거용 지상층 수로 나눈 추정 */
  | "residentialFloors"
  /** 공동·다가구 — 층별개요가 없어 지상 층수로 나눈 추정 */
  | "groundFloors"
  /** 비주거용 — 건축면적 90㎡당 1동 */
  | "nonResidential"
  /** 층 정보가 전혀 없어 1동으로 둠 */
  | "noData";

/**
 * 서울시 도시 및 주거환경정비 조례 제2조제5호 기준 한 동의 동수.
 *   · 공동주택·다가구주택: 세대(가구)수가 **가장 많은 1개 층**을 1동으로 본다.
 *     층별개요에 층별 가구수가 적힌 경우 그 최댓값이 정답에 가깝고,
 *     없으면 주거용 지상층 수로 나눠 올림한 값을 추정치로 쓴다.
 *   · 단독주택(1가구): 1동.
 *   · 비주거용: 건축면적 90㎡당 1동(소수점 이하 버림, 90㎡ 미만은 0동).
 */
export function ordinanceDongOf(b: LedgerBuilding): { dong: number; basis: OrdinanceBasis } {
  if (!b.residential) {
    const dong =
      b.archArea >= NON_RESIDENTIAL_SQM_PER_DONG
        ? Math.floor(b.archArea / NON_RESIDENTIAL_SQM_PER_DONG)
        : 0;
    return { dong, basis: "nonResidential" };
  }
  // 1가구 단독주택 — 동 하나가 1동
  if (b.units <= 1) return { dong: 1, basis: "single" };

  // 주거용 **지상**층만 센다 — 근생·주차장·기계실, 지하·옥탑(계단실)은 제외
  const floors = (b.floors ?? []).filter((f) => f.gb === "지상" && f.residential);
  const direct = floors
    .map((f) => f.households)
    .filter((v): v is number => v != null && v > 0);
  if (direct.length > 0) return { dong: Math.max(...direct), basis: "floorHouseholds" };

  const levels = new Set(floors.map((f) => f.flrNo).filter((n) => n > 0));
  if (levels.size > 0) {
    return { dong: Math.max(1, Math.ceil(b.units / levels.size)), basis: "residentialFloors" };
  }
  if (b.groundFloors > 0) {
    return { dong: Math.max(1, Math.ceil(b.units / b.groundFloors)), basis: "groundFloors" };
  }
  return { dong: 1, basis: "noData" };
}

/**
 * 공동주택(아파트·연립·다세대)인지 — 구분소유라 세대수 = 조합원 수다.
 *   · 표제부 세대수(hhldCnt)가 2 이상이면 그 자체가 구분소유 근거다.
 *   · 주용도 코드 02(공동주택) 또는 용도명에 아파트·연립·다세대·공동주택이 있으면 공동주택.
 *   · 단독·다가구·다중주택은 여기에 걸리지 않는다(가구수 fmlyCnt 는 세입자 가구).
 */
export function isMultiHousehold(b: LedgerBuilding): boolean {
  if (b.hhldCnt >= 2) return true;
  const cd = (b.mainPurpsCd ?? "").trim();
  if (/^02/.test(cd)) return true;
  return /아파트|연립|다세대|공동주택/.test(`${b.mainPurps ?? ""} ${b.floors?.[0]?.use ?? ""}`);
}

/** 한 동이 조합원(토지등소유자) 몇 명인지 셈한 근거 */
export type OwnerBasis =
  /** 공동주택 — 구분소유 세대수(hhldCnt) */
  | "households"
  /** 비주거 집합건물 — 호수(hoCnt)만큼 구분소유자 */
  | "hoCount"
  /** 그 밖 — 필지(PNU) 1곳당 소유자 1명 */
  | "parcel";

/**
 * 한 동의 추정 조합원(토지등소유자) 수.
 *   · 공동주택 → 표제부 세대수(hhldCnt), 0 이면 1명 보정.
 *   · 비주거 집합건물(오피스텔·상가, hoCnt > 0) → 호수.
 *   · 단독·다가구·일반 비주거 → 1명. 필지 단위 중복 제거는 호출부(`summarizePreciseBuildings`)가 한다.
 *   · 다가구 세입자 가구수(fmlyCnt)는 끝까지 조합원으로 세지 않는다.
 */
export function ownerCountOf(b: LedgerBuilding): { owners: number; basis: OwnerBasis } {
  if (b.residential) {
    if (isMultiHousehold(b)) {
      return { owners: b.hhldCnt > 0 ? b.hhldCnt : 1, basis: "households" };
    }
    return { owners: 1, basis: "parcel" };
  }
  if (b.hoCnt > 0) return { owners: b.hoCnt, basis: "hoCount" };
  return { owners: 1, basis: "parcel" };
}

/**
 * 한 청크(필지 묶음)의 대장 동들을 지표로 접는다.
 *   · 노후도 모수(effective)는 주건축물 중 사용승인일이 있는 동수다.
 *   · unknownPnus 는 1차 추정(연식 색인)에서 연식을 몰랐던 건물의 PNU —
 *     그 PNU 의 동이 대장에서 사용승인일을 얻었으면 '연식 보정'으로 센다.
 *   · parcelAreas 는 연속지적도 필지면적(PNU → ㎡). 대장 platArea 가 0·빈 값인
 *     필지를 보완하는 데만 쓴다(대장 값이 있으면 대장이 우선).
 */
export function summarizePreciseBuildings(input: {
  buildings: LedgerBuilding[];
  parcels: number;
  ledgerParcels: number;
  errors?: number;
  /** 층별개요를 조회한 필지 수 */
  floorParcels?: number;
  /** 층별개요 조회가 실패한 필지 수 */
  floorErrors?: number;
  unknownPnus?: Iterable<string>;
  parcelAreas?: Record<string, number> | null;
  nowYear?: number;
}): PreciseChunkStats {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const cutoff30 = nowYear - 30;
  const cutoff20 = nowYear - 20;
  const unknownSet = new Set(input.unknownPnus ?? []);
  /** 필지별 대지면적 — 한 필지의 동이 여럿이면 같은 platArea 가 반복되므로 큰 값 하나만 쓴다 */
  const platByPnu = new Map<string, number>();
  /** 조합원 1명으로 세는 필지 — 같은 필지의 주건축물이 여럿이어도 소유자는 한 명으로 본다 */
  const detachedPnus = new Set<string>();
  const nonResidentialPnus = new Set<string>();
  const structureMap = new Map<string, number>();
  const out: PreciseChunkStats = {
    ...EMPTY_CHUNK,
    structures: [],
    parcels: input.parcels,
    ledgerParcels: input.ledgerParcels,
    missingParcels: Math.max(0, input.parcels - input.ledgerParcels),
    errors: input.errors ?? 0,
    floorParcels: input.floorParcels ?? 0,
    floorErrors: input.floorErrors ?? 0,
  };

  for (const b of input.buildings) {
    // 대지면적이 0인 필지도 키를 남겨야 연속지적도 보완 대상이 된다
    platByPnu.set(b.pnu, Math.max(platByPnu.get(b.pnu) ?? 0, b.platArea));
    if (b.attached) {
      out.attached++;
      continue;
    }
    out.buildings++;
    out.units += b.units;
    if (b.minAdjusted) out.minUnitAdjusted++;

    // 추정 조합원(토지등소유자) — 공동주택은 세대수, 그 밖은 필지당 1명(집합건물은 호수)
    const owner = ownerCountOf(b);
    if (owner.basis === "households") {
      out.owners += owner.owners;
      out.ownerHouseholds += owner.owners;
      if (b.hhldCnt <= 0) out.ownerHhldAdjusted++;
    } else if (owner.basis === "hoCount") {
      out.owners += owner.owners;
      out.ownerNonResidential += owner.owners;
      out.ownerShopUnits += owner.owners;
    } else if (b.residential) {
      if (!detachedPnus.has(b.pnu)) {
        detachedPnus.add(b.pnu);
        out.owners++;
        out.ownerDetached++;
      }
    } else if (!nonResidentialPnus.has(b.pnu)) {
      nonResidentialPnus.add(b.pnu);
      out.owners++;
      out.ownerNonResidential++;
    }

    // 조례 제2조제5호 환산 동수 — 세대수를 그대로 더하지 않는다
    const ordinance = ordinanceDongOf(b);
    out.ordinanceDong += ordinance.dong;
    if (ordinance.basis === "floorHouseholds") out.ordinanceFloor += ordinance.dong;
    else if (ordinance.basis === "nonResidential") out.ordinanceNonResidential += ordinance.dong;
    else if (ordinance.basis === "single") out.ordinanceSingle += ordinance.dong;
    else {
      out.ordinanceEstimated += ordinance.dong;
      if (b.residential && b.units >= 2 && (b.floors ?? []).length === 0) out.floorMissing++;
    }

    const name = b.structure || "구조 미상";
    structureMap.set(name, (structureMap.get(name) ?? 0) + 1);

    if (b.group === "concrete") out.concrete++;
    else if (b.group === "other") out.other++;
    else out.unknownStructure++;

    if (b.year == null) {
      out.unknownYear++;
      continue;
    }
    if (unknownSet.has(b.pnu)) out.ageResolved++;
    // 구조 미상은 판단할 수 없어 노후도 모수에서 뺀다(동수에는 남긴다).
    if (b.group === "concrete" && b.year <= cutoff30) out.over30Concrete++;
    if (b.group === "other" && b.year <= cutoff20) out.over20Other++;
  }

  out.structures = [...structureMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // 필지(PNU) 단위 대지면적 합 — 대장 값 우선, 0·빈 값이면 연속지적도 필지면적으로 보완
  for (const [pnu, plat] of platByPnu) {
    let area = plat;
    if (!(area > 0)) {
      const fallback = Number(input.parcelAreas?.[pnu] ?? 0);
      if (Number.isFinite(fallback) && fallback > 0) {
        area = fallback;
        out.landFallbackParcels++;
      }
    }
    if (area > 0) {
      out.landParcels++;
      out.landArea += area;
    }
  }
  return out;
}

/** 여러 청크를 합쳐 지표를 낸다 — 구역 면적(㎡)은 호수밀도 분모 */
export function sumPrecise(chunks: PreciseChunkStats[], areaSqm: number, nowYear?: number): PreciseSummary {
  const year = nowYear ?? new Date().getFullYear();
  const total: PreciseChunkStats = { ...EMPTY_CHUNK, structures: [] };
  const structureMap = new Map<string, number>();

  for (const c of chunks) {
    for (const key of Object.keys(EMPTY_CHUNK) as (keyof PreciseChunkStats)[]) {
      if (key === "structures") continue;
      (total[key] as number) += (c[key] as number) ?? 0;
    }
    for (const s of c.structures ?? []) structureMap.set(s.name, (structureMap.get(s.name) ?? 0) + s.count);
  }

  total.structures = [...structureMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const effective = Math.max(0, total.buildings - total.unknownYear - total.unknownStructure);
  const ordinancePct = effective > 0 ? Math.round(((total.over30Concrete + total.over20Other) / effective) * 1000) / 10 : 0;
  const areaHa = toHa(areaSqm);
  const density = areaHa > 0 ? Math.round((total.units / areaHa) * 10) / 10 : 0;
  const ordinanceDensity = areaHa > 0 ? Math.round((total.ordinanceDong / areaHa) * 10) / 10 : 0;

  // 추정 평균 대지지분 — 유효 대지면적 합 ÷ 총 호수(1평 = 3.305785㎡)
  const landShareSqm =
    total.units > 0 && total.landArea > 0 ? Math.round((total.landArea / total.units) * 10) / 10 : null;
  const landSharePyeong =
    landShareSqm != null ? Math.round((landShareSqm / PYEONG_SQM) * 10) / 10 : null;

  // 추정 조합원 1인당 대지지분 — 대지면적 합 ÷ 추정 조합원 수(세입자 가구 제외)
  const landShareOwnerSqm =
    total.owners > 0 && total.landArea > 0 ? Math.round((total.landArea / total.owners) * 10) / 10 : null;
  const landShareOwnerPyeong =
    landShareOwnerSqm != null ? Math.round((landShareOwnerSqm / PYEONG_SQM) * 10) / 10 : null;

  return {
    ...total,
    areaSqm: Math.round(areaSqm),
    areaHa: Math.round(areaHa * 100) / 100,
    landArea: Math.round(total.landArea),
    effectiveBuildings: effective,
    ordinancePct,
    density,
    ordinanceDensity,
    landShareSqm,
    landSharePyeong,
    landShareOwnerSqm,
    landShareOwnerPyeong,
  };
}
