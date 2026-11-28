#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// 경매 물건 **종합의견** 사전 생성 — `public/data/auction-opinions.json`
//
//   입력 : public/data/auctions.json (법원경매 목록)
//          public/data/auction-details.json (물건상세·현황조사서·매각물건명세서)
//          public/data/zones.geojson (구역 추진단계 — 점수·주의 문장에 쓴다)
//   규칙 : src/lib/auction-signals.ts **한 곳** — 이 스크립트가 그 파일을 tsc 로 컴파일해 그대로 쓴다.
//          (화면이 같은 파일을 import 하므로 뱃지와 종합의견의 근거가 어긋나지 않는다)
//
//   · 사람 이름은 쓰지 않는다 — 문장에는 숫자·날짜·구역명만 들어간다.
//     임차인은 명수·전입일·보증금만 다룬다(원문 문장을 옮겨 적지 않는다).
//   · 없는 값은 만들지 않는다. 자료가 없으면 "확인 필요"로 남긴다.
//
//   실행: node scripts/gen-auction-opinions.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

/* ① 규칙 파일을 컴파일해 불러온다 — 타입 전용 import 만 있어 이 파일 하나로 끝난다 */
const buildDir = mkdtempSync(join(tmpdir(), "redev-opinions-"));
const tsc = join(root, "node_modules", ".bin", "tsc");
if (!existsSync(tsc)) {
  console.error("tsc 를 찾을 수 없습니다 — npm install 후 다시 실행하세요.");
  process.exit(1);
}
execFileSync(
  tsc,
  [
    join(root, "src/lib/auction-signals.ts"),
    "--outDir", buildDir,
    "--module", "commonjs",
    "--target", "es2022",
    "--moduleResolution", "node",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);
const require = createRequire(import.meta.url);
const signals = require(join(buildDir, "auction-signals.js"));

/* ② 데이터 */
const auctions = readJson("public/data/auctions.json");
const details = readJson("public/data/auction-details.json");
const zones = readJson("public/data/zones.geojson");

const zoneInfo = new Map(
  zones.features.map((f) => [f.properties.id, { stage: f.properties.stage, type: f.properties.type }])
);

const items = Object.values(auctions.byZone).flat();

/** 사건 공통(byCase) + 물건별(byId) 상세 — 화면의 mergeDetails 와 같은 규칙 */
function mergeDetail(caseD, itemD) {
  if (!caseD) return itemD;
  if (!itemD) return caseD;
  const pick = (a, b) => (a && a.length ? a : b && b.length ? b : a ?? b);
  return {
    ...caseD,
    ...itemD,
    photos: pick(itemD.photos, caseD.photos),
    tenants: pick(itemD.tenants, caseD.tenants),
    appraisalSummary: pick(itemD.appraisalSummary, caseD.appraisalSummary),
    lists: pick(itemD.lists, caseD.lists),
    areas: pick(itemD.areas, caseD.areas),
    schedules: { ...(caseD.schedules || {}), ...(itemD.schedules || {}) },
    itemStatus: { ...(caseD.itemStatus || {}), ...(itemD.itemStatus || {}) },
    specSheetIds: { ...(caseD.specSheetIds || {}), ...(itemD.specSheetIds || {}) },
    specification: itemD.specification ?? caseD.specification,
    occupancy: itemD.occupancy ?? caseD.occupancy,
    area: itemD.area ?? caseD.area,
  };
}

const generatedAt = new Date().toISOString();
const byId = {};
const verdictCount = { 매력: 0, 검토: 0, 주의: 0 };
const badgeCount = {};
let withDetails = 0;
let withTenants = 0;
let withSenior = 0;

for (const item of items.sort((a, b) => a.id.localeCompare(b.id))) {
  const detail = mergeDetail(details.byCase[`${item.courtCode}|${item.caseNo}`], details.byId[item.id]);
  const zone = zoneInfo.get(item.zoneId);
  const ctx = { zoneStage: zone?.stage, zoneType: zone?.type };
  const opinion = signals.buildOpinion(item, detail, ctx);
  const badges = signals.auctionBadges(item, detail, ctx);

  byId[item.id] = opinion;
  verdictCount[opinion.verdict] += 1;
  for (const b of badges) badgeCount[b.key] = (badgeCount[b.key] || 0) + 1;
  if (detail) withDetails += 1;
  if ((detail?.tenants ?? []).length > 0) withTenants += 1;
  if (signals.tenantPriority(detail).state === "senior") withSenior += 1;
}

const out = {
  meta: {
    source: "리디브 자동 분석 — auctions.json + auction-details.json + zones.geojson",
    engine: "src/lib/auction-signals.ts (규칙 기반 · 참고용)",
    generatedAt,
    itemCount: Object.keys(byId).length,
    detailCount: withDetails,
    tenantItems: withTenants,
    seniorTenantItems: withSenior,
    note:
      "감정가·최저가·구역 단계·말소기준권리·임차인 전입일 등 **수집된 값만** 근거로 만든 참고 의견입니다. " +
      "사람 이름은 쓰지 않았고, 말소기준권리 일자가 없으면 대항력을 단정하지 않습니다. " +
      "투자 판단은 매각물건명세서·현황조사서 원문으로 확인하세요.",
  },
  byId,
};

const target = join(root, "public/data/auction-opinions.json");
writeFileSync(target, JSON.stringify(out) + "\n", "utf8");
rmSync(buildDir, { recursive: true, force: true });

const size = (readFileSync(target).length / 1024).toFixed(0);
console.log(`저장: public/data/auction-opinions.json (${Object.keys(byId).length}건, ${size}KB)`);
console.log(`상세 있음 ${withDetails} · 임차인 기재 ${withTenants} · 선순위 임차인 판정 ${withSenior}`);
console.log("판정:", verdictCount);
console.log(
  "뱃지:",
  Object.entries(badgeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ")
);
