// 경쟁사 이름·링크 전수 제거 (2026-11-27)
// ─────────────────────────────────────────────────────────────────────────────
// 구역 상세 패널의 「상세 데이터」·「확인 출처」에 그대로 나오던 민간 구역정보 서비스 이름과
// 그 사이트 링크를 src/data/seoul-zones.json · src/data/zones-meta.json 에서 걷어낸다.
//
//   · note · boundaryNote · areaNote · nameNote · sourceId · sid → 중립 문구로 바꾼다
//     ("재개발닷컴 표기 17,854㎡" → "민간 구역정보 표기 17,854㎡")
//   · sources · nameSources
//       - 경쟁사가 만든 자료를 가리키는 항목("재개발닷컴 — … 구역 정보")은 지운다.
//       - 고시·공고 같은 공식 문서를 가리키는 항목은 이름만 남기고 링크를 비운다
//         (url="" → 화면은 글자로만 보여 준다. 경쟁사 사이트로 나가는 링크 없음).
//
// 실행: node scripts/remove-competitor-names-20261127.mjs [--dry]
//   → public/data/zones.geojson 은 이 스크립트 뒤에 `npm run geojson` 으로 다시 만든다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes("--dry");

const BRAND_RE = /재개발닷컴|갈타맵|재개발여기|정비닥터|재개발뷰|조아부동산|jaegebal|galta|jbdoctor|joa-realty|jaeview/i;
const COMP_URL_RE = /(^|\.)(jaegebal\.com|galta\.kr|jbdoctor\.com|joa-realty\.co\.kr|jaeview\.com)(\/|$)/i;
/** 경쟁사 도메인인지 — URL 문자열이 아니라 호스트로 판정한다 */
const isCompUrl = (url) => {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return /(^|\.)(jaegebal\.com|galta\.kr|jbdoctor\.com|joa-realty\.co\.kr|jaeview\.com)$/.test(host);
};
const OFFICIAL_LABEL_RE = /고시|공고|보도자료|서울시보/;
const PREFIX_RE = /^(재개발닷컴|갈타맵|재개발뷰|정비닥터|조아부동산(?:중개)?)\s*(?:—|–|-|:)\s*/;

// 문장 단위로 먼저 바꾸고, 남은 이름은 마지막에 일반 표현으로 바꾼다.
const TEXT_RULES = [
  [/재개발닷컴 등 정비업계 표기/g, "정비업계 표기"],
  [/재개발닷컴이 공개 도면에서 작도한 값/g, "공개 도면에서 작도한 값"],
  [/재개발닷컴 구역 정보/g, "민간 구역정보"],
  [/재개발닷컴·정비닥터 구역정보/g, "민간 구역정보"],
  [/— 재개발닷컴·조아부동산 2026-09 기준/g, "— 구역정보 서비스 2026-09 기준"],
  [/— 재개발닷컴·정비닥터 2026-11 기준/g, "— 구역정보 서비스 2026-11 기준"],
  [/재개발닷컴·정비닥터 집계/g, "민간 구역정보 집계"],
  [/\(조아부동산 (18,099|10,195)평\)/g, "(구역정보 서비스 $1평)"],
  [/재개발닷컴 구역면적 50,608㎡, 갈타맵 53,258㎡/g, "민간 구역정보 구역면적 50,608㎡, 다른 서비스 53,258㎡"],
  [/정비닥터 집계/g, "다른 구역정보 집계"],
  [/갈타맵 경계면적/g, "다른 구역정보 경계면적"],
  [/\(공고 추정, 갈타맵 추정 193명\)/g, "(공고 추정, 다른 서비스 추정 193명)"],
  [/갈타맵은 /g, "민간 구역정보에서는 "],
  [/대표님이 보내주신 갈타맵 캡처/g, "대표님이 보내주신 공개 지도 캡처"],
  [/대표님 갈타맵 캡처/g, "대표님이 보내주신 공개 지도 캡처"],
  [/갈타맵이 추진준비 구역으로 공개한 경계/g, "공개된 추진준비 구역 경계"],
  [/갈타맵이 같은 공고 도면을 현행 지적에 정합해 공개한 경계/g, "공개 도면을 현행 지적에 정합한 경계"],
  [/갈타맵이 현행 지적에 정합해 공개한 경계면적/g, "공개 도면을 현행 지적에 정합한 경계면적"],
  [/갈타맵 공개 경계를 옮긴 참고 경계/g, "공개된 참고 경계를 옮긴 경계"],
  [/재개발뷰 지도 캡처/g, "공개 지도 캡처"],
  [/재개발닷컴이 공개한/g, "공개된"],
  [/재개발닷컴 공개 지도/g, "공개 구역현황 지도"],
  [/ · 재개발닷컴 「\(가\)도선동 332」 구역 정보/g, ""],
  [/재개발닷컴·정비닥터/g, "민간 구역정보"],
  [/재개발닷컴·조아부동산/g, "민간 구역정보"],
  [/재개발닷컴·중구 결재문서/g, "중구 결재문서"],
  [/\(재개발닷컴 구역 고시 이력에 이 구역 문서로 연결\)/g, "(서울시보 고시 원문)"],
  [/갈타맵 추진준비 구역 공개/g, "공개 추진준비 구역 자료"],
  [/재개발닷컴 구역정보/g, "민간 구역정보"],
  [/재개발닷컴/g, "민간 구역정보"],
  [/갈타맵/g, "민간 구역정보"],
  [/정비닥터/g, "민간 구역정보"],
  [/조아부동산중개/g, "구역정보 서비스"],
  [/조아부동산/g, "민간 구역정보"],
  [/재개발뷰/g, "공개 지도"],
];

const rewrite = (s) => {
  let out = s;
  for (const [re, to] of TEXT_RULES) out = out.replace(re, to);
  return out;
};

const zones = JSON.parse(readFileSync(join(here, "../src/data/seoul-zones.json"), "utf-8"));
const log = [];

for (const z of zones) {
  for (const key of ["note", "boundaryNote", "areaNote", "nameNote", "sourceId", "sid"]) {
    const v = z[key];
    if (typeof v !== "string" || !BRAND_RE.test(v)) continue;
    const next = rewrite(v);
    if (next !== v) {
      log.push(`[문구] ${z.id}.${key}\n  - ${v.length > 220 ? v.slice(0, 220) + " …" : v}\n  + ${next.length > 220 ? next.slice(0, 220) + " …" : next}`);
      z[key] = next;
    }
  }

  for (const key of ["sources", "nameSources"]) {
    const arr = z[key];
    if (!Array.isArray(arr)) continue;
    const kept = [];
    for (const s of arr) {
      if (!s || typeof s !== "object") {
        kept.push(s);
        continue;
      }
      const label = typeof s.label === "string" ? s.label : "";
      const url = typeof s.url === "string" ? s.url : "";
      const labelBrand = BRAND_RE.test(label);
      const urlComp = isCompUrl(url);
      if (!labelBrand && !urlComp) {
        kept.push(s);
        continue;
      }
      // 1) 경쟁사가 만든 자료 — 지운다. 단, 고시·공고 문서를 가리키는 항목은 이름만 남긴다.
      const prefix = label.match(PREFIX_RE);
      if (prefix) {
        const rest = label.replace(PREFIX_RE, "");
        if (OFFICIAL_LABEL_RE.test(rest)) {
          log.push(`[출처·링크만 제거] ${z.id}.${key}: ${label} (${url})`);
          kept.push({ ...s, label: rest, url: "" });
        } else {
          log.push(`[출처 삭제] ${z.id}.${key}: ${label} (${url})`);
        }
        continue;
      }
      // 2) 이름이 문장 안에 섞인 공식 문서 — 이름만 중립 표현으로
      if (labelBrand) {
        const nextLabel = rewrite(label);
        const nextUrl = urlComp ? "" : url;
        log.push(`[출처 문구] ${z.id}.${key}: ${label} (${url})\n  + ${nextLabel} (${nextUrl || "링크 없음"})`);
        kept.push({ ...s, label: nextLabel, url: nextUrl });
        continue;
      }
      // 3) 공식 문서인데 링크만 경쟁사 사이트 — 링크를 비운다
      log.push(`[출처 링크만 제거] ${z.id}.${key}: ${label} (${url})`);
      kept.push({ ...s, url: "" });
    }
    z[key] = kept;
  }
}

// 남은 이름이 있으면 멈춘다(규칙이 못 잡은 문장)
const leftovers = [];
for (const z of zones) {
  for (const key of ["note", "boundaryNote", "areaNote", "nameNote", "sourceId", "sid"]) {
    if (typeof z[key] === "string" && BRAND_RE.test(z[key])) leftovers.push(`${z.id}.${key}: ${z[key].slice(0, 160)}`);
  }
  for (const key of ["sources", "nameSources"]) {
    for (const s of z[key] ?? []) {
      if (s && typeof s === "object" && (BRAND_RE.test(s.label ?? "") || BRAND_RE.test(s.url ?? ""))) {
        leftovers.push(`${z.id}.${key}: ${s.label} (${s.url})`);
      }
    }
  }
}

console.log(log.join("\n"));
console.log(`\n변경 ${log.length}건 · 남은 이름 ${leftovers.length}건`);
if (leftovers.length) {
  console.log("남은 이름:\n" + leftovers.map((l) => "  " + l).join("\n"));
  process.exitCode = 1;
}

if (!dry && log.length) {
  writeFileSync(join(here, "../src/data/seoul-zones.json"), JSON.stringify(zones));
  console.log("wrote src/data/seoul-zones.json");
}
