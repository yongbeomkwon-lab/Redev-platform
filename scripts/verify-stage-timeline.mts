// 전수 검증: public/data/zones.geojson 2,424곳을 stage-timeline 에 넣고
//   · EXACT_STAGE 에 없는 표기(사람이 손으로 매핑하지 않은 표기)가 있는지
//   · 사다리 칸으로 옮기지 못한(unmapped) 구역이 있는지
//   · 칸 순서·현재 단계가 규칙대로인지
// 를 확인하고, 표기별 매핑 표와 유형별 분포를 출력한다.
//
//   실행: node --experimental-strip-types scripts/verify-stage-timeline.mts
import { readFileSync } from "node:fs";
import {
  buildStageTimeline,
  EXACT_STAGE,
  HALTED_STAGE,
  pickFamily,
} from "../src/lib/stage-timeline.ts";

type Props = {
  id: string;
  name: string;
  type: string;
  kind: string;
  stage: string;
  gu: string;
  selectedAt?: string;
  asOf?: string;
};
const data = JSON.parse(readFileSync("public/data/zones.geojson", "utf8")) as {
  features: { properties: Props }[];
};
const zones = data.features.map((f) => f.properties);

let fail = 0;
const failMsg: string[] = [];
function check(cond: boolean, msg: string) {
  if (!cond) {
    fail++;
    failMsg.push(msg);
  }
}

// 1) 표기 전수 — EXACT 미등록(규칙 fallback 사용) 확인
const stages = new Map<string, number>();
for (const z of zones) stages.set(z.stage, (stages.get(z.stage) ?? 0) + 1);

const unknownStages = [...stages.keys()].filter((s) => !(s in EXACT_STAGE) && !(s in HALTED_STAGE));
console.log(`구역 ${zones.length}곳 · 표기 ${stages.size}가지 · EXACT 등록 ${Object.keys(EXACT_STAGE).length}가지`);
console.log(`EXACT 미등록 표기: ${unknownStages.length}가지`);
for (const s of unknownStages) console.log(`   ! ${s}`);

// 2) 구역별 타임라인
const byTypeCurrent = new Map<string, Map<string, number>>();
const byStageRow: { stage: string; n: number; family: string; current: string; state: string }[] = [];
const halted: { name: string; stage: string; reason?: string; last?: string }[] = [];

for (const z of zones) {
  const t = buildStageTimeline(z);

  check(t.steps.length >= 6, `${z.name}: 사다리 칸이 ${t.steps.length}개`);
  check(
    t.steps.filter((s) => s.state === "current").length === 1,
    `${z.name}: 현재 칸이 ${t.steps.filter((s) => s.state === "current").length}개`
  );
  // 지난 칸은 모두 현재보다 앞, 남은 칸은 모두 뒤
  t.steps.forEach((s, i) => {
    if (s.state === "done") check(i < t.currentIndex, `${z.name}: 지난 칸 #${i} > 현재 ${t.currentIndex}`);
    if (s.state === "todo") check(i > t.currentIndex, `${z.name}: 남은 칸 #${i} < 현재 ${t.currentIndex}`);
  });
  check(!t.unmapped, `${z.name}(${z.type}) 표기를 사다리에 올리지 못함: "${z.stage}"`);
  // 날짜는 문자열에 적힌 것만 — 사다리 칸 날짜가 원문에 실제로 있는지
  t.steps.forEach((s) => {
    if (!s.date) return;
    const bare = s.date.replace(/\./g, "-").slice(0, 7);
    const digits = s.date.replace(/\./g, "-");
    check(
      z.stage.includes(digits) || z.stage.includes(digits.replace(/-/g, ".")) || z.stage.includes(bare) ||
        (z.selectedAt ?? "").includes(bare),
      `${z.name}: 원문에 없는 날짜 ${s.date} (stage="${z.stage}", selectedAt=${z.selectedAt})`
    );
  });

  const fam = pickFamily(z.type, z.kind, z.stage);
  if (!byTypeCurrent.has(z.type)) byTypeCurrent.set(z.type, new Map());
  const m = byTypeCurrent.get(z.type)!;
  const key = `${t.currentLabel}${t.status === "halted" ? " [중단]" : ""}`;
  m.set(key, (m.get(key) ?? 0) + 1);

  if (t.status === "halted") halted.push({ name: z.name, stage: z.stage, reason: t.haltedReason, last: t.lastReached });
  void fam;
}

// 3) 표기별 매핑 표 (한 표기 = 한 줄)
for (const [stage, n] of [...stages.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  const sample = zones.find((z) => z.stage === stage)!;
  const t = buildStageTimeline(sample);
  byStageRow.push({
    stage,
    n,
    family: t.family,
    current: t.status === "halted" ? `중단 · ${t.haltedReason}` : `${t.currentLabel}${t.steps[t.currentIndex].inProgress ? " (진행 중)" : ""}`,
    state: t.status,
  });
}
console.log("\n── 표기별 매핑 (사다리 · 현재 칸) ─────────────────────────────────");
for (const r of byStageRow) {
  console.log(`${String(r.n).padStart(5)}  ${r.family.padEnd(7)}  ${r.current.padEnd(26)}  ${r.stage}`);
}

// 4) 유형별 현재 단계 분포
console.log("\n── 사업유형별 현재 단계 분포 ──────────────────────────────────────");
for (const [type, m] of [...byTypeCurrent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`\n[${type}] ${total}곳`);
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
}

// 5) 특정 구역 확인 (brief 가 지정한 예시 + 중단 구역)
console.log("\n── 지정 구역 확인 ────────────────────────────────────────────────");
const named = ["가리봉2", "홍은15", "사당15", "사당17", "방배동 467-19", "사당21", "휘경동 295"];
for (const n of named) {
  const z = zones.find((x) => x.name.includes(n));
  if (!z) {
    console.log(`   ? ${n}: 없음`);
    continue;
  }
  const t = buildStageTimeline(z);
  console.log(
    `   ${z.name} (${z.type}) · "${z.stage}" → ${t.familyLabel} ${t.currentIndex + 1}/${t.total} · ${t.currentLabel}` +
      (t.status === "halted" ? ` [중단: ${t.haltedReason}]` : "") +
      "\n      " +
      t.steps.map((s) => `${s.state === "current" ? "▶" : s.state === "done" ? "✓" : "·"}${s.label}${s.date ? `(${s.date})` : ""}`).join(" → ")
  );
}

console.log(`\n── 중단 구역 ${halted.length}곳 ─────────────────────────────────────`);
for (const h of halted) console.log(`   ${h.name} · "${h.stage}" → ${h.reason} / 마지막 ${h.last}`);

// 6) 결과
console.log("\n════════════════════════════════════════════════════════════════");
if (fail) {
  console.log(`실패 ${fail}건`);
  for (const m of failMsg.slice(0, 40)) console.log("   ✗ " + m);
  process.exit(1);
}
console.log(`통과 — ${zones.length}곳 · 표기 ${stages.size}가지 전부 표준 단계로 매핑 (EXACT 미등록 ${unknownStages.length}가지)`);
