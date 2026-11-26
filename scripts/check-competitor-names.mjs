// 경쟁사 이름·링크가 사용자 화면·데이터에 남아 있는지 검사 (2026-11-27)
//   실행: node scripts/check-competitor-names.mjs
//   대상: src/ (화면·문구·주석) 과 public/data/ (라이브로 내려가는 데이터)
//   하나라도 남아 있으면 exit 1.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// 경쟁사 이름(표기 변형 포함)과 그 사이트 도메인
const NAMES = ["재개발닷컴", "갈타맵", "재개발여기", "정비닥터", "재개발뷰", "조아부동산", "jaegebal", "galta", "jbdoctor", "joa-realty", "jaeview"];
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|json|md|txt|css|html|geojson)$/;

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(entry)) out.push(full);
  }
  return out;
};

const hits = [];
for (const dir of ["src", "public/data"]) {
  for (const file of walk(join(root, dir))) {
    const text = readFileSync(file, "utf-8");
    for (const name of NAMES) {
      let idx = text.indexOf(name);
      while (idx !== -1) {
        const line = text.slice(0, idx).split("\n").length;
        hits.push(`${relative(root, file)}:${line} — ${name} … ${text.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, " ")}`);
        idx = text.indexOf(name, idx + name.length);
      }
    }
  }
}

if (hits.length) {
  console.error(`경쟁사 이름·링크 ${hits.length}건 남음:`);
  for (const h of hits.slice(0, 40)) console.error("  " + h);
  process.exit(1);
}
console.log("OK — src·public/data 에 경쟁사 이름·링크 0건");
