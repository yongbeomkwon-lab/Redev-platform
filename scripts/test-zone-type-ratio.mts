// 유형 비율(단독·근생 vs 빌라) 계산 단위 테스트 — node --experimental-strip-types 로 돈다
//   node --experimental-strip-types scripts/test-zone-type-ratio.mts
//
//   · 표제부는 아파트·다세대·연립을 모두 '공동주택'(02000)으로 주고 갈래는 etcPurps 에 적는다.
//     그 갈래를 읽어 빌라 / 단독·다가구 / 근생·비주거 / 아파트로 가르는지 본다.
//   · 부속건축물은 동수·유형에서 빠지는지, 비율·비교(아파트 제외) 분모가 맞는지 본다.
import assert from "node:assert/strict";
import {
  addZoneType,
  classifyZoneType,
  emptyTypeTally,
  summarizePreciseBuildings,
  sumPrecise,
  toTypeBreakdown,
  type LedgerBuilding,
} from "../src/lib/zone-ledger.ts";

function b(over: Partial<LedgerBuilding>): LedgerBuilding {
  return {
    pnu: "1162010200100010001",
    pk: "pk",
    structure: "철근콘크리트구조",
    group: "concrete",
    mainPurps: "공동주택",
    etcPurps: "다세대주택",
    residential: true,
    year: 2005,
    useAprDay: "20050101",
    units: 4,
    minAdjusted: false,
    attached: false,
    floorArea: 300,
    archArea: 90,
    groundFloors: 4,
    floors: [],
    platArea: 200,
    hhldCnt: 4,
    fmlyCnt: 0,
    hoCnt: 0,
    mainPurpsCd: "02000",
    ...over,
  };
}

const cases: [string, Partial<LedgerBuilding>, string][] = [
  ["공동주택(다세대주택)", { etcPurps: "공동주택(다세대주택)" }, "villa"],
  ["다세대주택(8세대)", { etcPurps: "다세대주택(8세대)" }, "villa"],
  ["연립주택", { etcPurps: "연립주택" }, "villa"],
  ["도시형생활주택", { etcPurps: "도시형생활주택" }, "villa"],
  ["공동주택 갈래 미기재", { etcPurps: "" }, "villa"],
  ["아파트", { etcPurps: "아파트" }, "apartment"],
  ["공동주택(아파트)", { etcPurps: "공동주택(아파트)", mainPurps: "아파트" }, "apartment"],
  [
    "단독주택+근생 복합(주용도 단독)",
    { mainPurpsCd: "01000", mainPurps: "단독주택", etcPurps: "근린생활시설,다가구주택", fmlyCnt: 5, hhldCnt: 0 },
    "detached",
  ],
  ["다가구용 단독주택", { mainPurpsCd: "01000", mainPurps: "단독주택", etcPurps: "다가구용단독주택(5가구)" }, "detached"],
  [
    "제2종근린생활시설",
    { mainPurpsCd: "04000", mainPurps: "제2종근린생활시설", etcPurps: "소매점", residential: false, units: 0, hhldCnt: 0 },
    "commercial",
  ],
  [
    "업무시설(오피스텔)",
    { mainPurpsCd: "14000", mainPurps: "업무시설", etcPurps: "오피스텔", residential: false, units: 0, hhldCnt: 0, hoCnt: 20 },
    "commercial",
  ],
  ["숙박시설", { mainPurpsCd: "15000", mainPurps: "숙박시설", etcPurps: "일반숙박시설", residential: false, units: 0 }, "commercial"],
  ["코드 없음·이름 다세대", { mainPurpsCd: "", mainPurps: "공동주택", etcPurps: "다세대주택" }, "villa"],
];

for (const [label, over, expect] of cases) {
  const got = classifyZoneType(b(over));
  assert.equal(got, expect, `${label}: ${got} (기대 ${expect})`);
}
console.log(`✓ 분류 ${cases.length}건`);

// 부속건축물은 유형에서 빠진다
const tally = emptyTypeTally();
const rows = [
  b({ etcPurps: "다세대주택", units: 4, floorArea: 300 }),
  b({ etcPurps: "다세대주택", units: 6, floorArea: 400 }),
  b({ mainPurpsCd: "01000", mainPurps: "단독주택", etcPurps: "단독주택", units: 1, floorArea: 100, hhldCnt: 0, fmlyCnt: 1 }),
  b({ mainPurpsCd: "04000", mainPurps: "제2종근린생활시설", etcPurps: "일반음식점", residential: false, units: 0, floorArea: 150, hhldCnt: 0 }),
  b({ attached: true, etcPurps: "창고", mainPurpsCd: "18000", mainPurps: "창고시설", residential: false, units: 0 }),
];
const chunk = summarizePreciseBuildings({
  buildings: rows,
  parcels: 5,
  ledgerParcels: 5,
});
assert.equal(chunk.buildings, 4, "부속 1동 제외");
assert.equal(chunk.types.villa.dong, 2);
assert.equal(chunk.types.detached.dong, 1);
assert.equal(chunk.types.commercial.dong, 1);
assert.equal(chunk.types.apartment.dong, 0);
assert.equal(chunk.types.villa.units, 10);
assert.equal(chunk.types.villa.floorArea, 700);

const summary = sumPrecise([chunk], 1000);
const t = summary.typeBreakdown;
assert.equal(t.total, 4);
assert.equal(t.villa.pct, 50);
assert.equal(t.detached.pct, 25);
assert.equal(t.commercial.pct, 25);
assert.equal(t.apartment.pct, 0);
assert.equal(t.residential.dong, 3);
assert.equal(t.residential.pct, 75);
assert.equal(t.nonResidential.dong, 1);
// 아파트 0 → 비교 모수는 전체 4동: 단독+근생 2동 50% vs 빌라 2동 50%
assert.equal(t.compare.base, 4);
assert.equal(t.compare.nonVillaDong, 2);
assert.equal(t.compare.nonVillaPct, 50);
assert.equal(t.compare.villaPct, 50);
console.log("✓ 청크 합산·비율 4동 (빌라 50% · 단독 25% · 근생 25%)");

// 아파트가 있으면 비교 모수에서 뺀다 — 빌라 1 + 단독 1 + 아파트 2 → base 2
const withApt = emptyTypeTally();
addZoneType(withApt, b({ etcPurps: "다세대주택" }));
addZoneType(withApt, b({ mainPurpsCd: "01000", mainPurps: "단독주택", etcPurps: "단독주택" }));
addZoneType(withApt, b({ etcPurps: "아파트", hhldCnt: 30 }));
addZoneType(withApt, b({ etcPurps: "아파트", hhldCnt: 30 }));
const t2 = toTypeBreakdown(withApt);
assert.equal(t2.apartment.dong, 2);
assert.equal(t2.apartment.pct, 50);
assert.equal(t2.compare.base, 2, "아파트 제외 모수");
assert.equal(t2.compare.villaPct, 50);
assert.equal(t2.compare.nonVillaPct, 50);
console.log("✓ 아파트 제외 비교 모수 2동");

// 옛 캐시(types 없음) 청크가 섞여도 터지지 않는다
const legacy = { ...chunk } as Record<string, unknown>;
delete legacy.types;
const merged = sumPrecise([legacy as never, chunk], 1000);
assert.equal(merged.typeBreakdown.villa.dong, 2);
console.log("✓ 옛 청크(types 없음) 호환");

console.log("모두 통과");
