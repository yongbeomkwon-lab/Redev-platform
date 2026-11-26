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
//
//   이 파일은 **순수 계산·타입**만 둔다(node 모듈 없음). 브라우저에서도 안전하다.
//   대장 호출은 `src/app/api/zone-stats/precise/route.ts` 한 곳에서만 한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 구조 분류 — concrete: 철콘군(30년), other: 그 밖(20년) */
export type StructureGroup = "concrete" | "other";

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
  /** 1가구로 보정한 동수 */
  minUnitAdjusted: number;
  /** 1차 추정에서 연식 미상이던 동을 대장 사용승인일로 확인한 수 */
  ageResolved: number;
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
  /** 추정 호수밀도(호/ha) */
  density: number;
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
  minUnitAdjusted: 0,
  ageResolved: 0,
  errors: 0,
  structures: [],
};

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
 * 한 청크(필지 묶음)의 대장 동들을 지표로 접는다.
 *   · 노후도 모수(effective)는 주건축물 중 사용승인일이 있는 동수다.
 *   · unknownPnus 는 1차 추정(연식 색인)에서 연식을 몰랐던 건물의 PNU —
 *     그 PNU 의 동이 대장에서 사용승인일을 얻었으면 '연식 보정'으로 센다.
 */
export function summarizePreciseBuildings(input: {
  buildings: LedgerBuilding[];
  parcels: number;
  ledgerParcels: number;
  errors?: number;
  unknownPnus?: Iterable<string>;
  nowYear?: number;
}): PreciseChunkStats {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const cutoff30 = nowYear - 30;
  const cutoff20 = nowYear - 20;
  const unknownSet = new Set(input.unknownPnus ?? []);
  const structureMap = new Map<string, number>();
  const out: PreciseChunkStats = {
    ...EMPTY_CHUNK,
    structures: [],
    parcels: input.parcels,
    ledgerParcels: input.ledgerParcels,
    missingParcels: Math.max(0, input.parcels - input.ledgerParcels),
    errors: input.errors ?? 0,
  };

  for (const b of input.buildings) {
    if (b.attached) {
      out.attached++;
      continue;
    }
    out.buildings++;
    out.units += b.units;
    if (b.minAdjusted) out.minUnitAdjusted++;

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

  return {
    ...total,
    areaSqm: Math.round(areaSqm),
    areaHa: Math.round(areaHa * 100) / 100,
    effectiveBuildings: effective,
    ordinancePct,
    density,
  };
}
