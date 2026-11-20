#!/usr/bin/env node
/**
 * 서울 법정동 코드 찾기 — 시군구 5자리마다 법정동코드(5자리)를 100 간격으로 훑어
 * `getBrTitleInfo` 가 응답하는 코드만 모은다(응답 첫 행의 `platPlc` 에서 동 이름을 읽는다).
 *
 *   node scripts/discover-bjdong.mjs [sigunguCd...]
 *
 * 결과: scripts/data/bjdong-codes.json  { generatedAt, dongs: [{ cd, sigungu, name, total }] }
 * · 법정동코드 5자리 = 읍면동(3)+리(2) 이고 서울은 리가 없어 00 으로 끝난다 → 100 간격이면 전부 걸린다.
 * · 이미 받은 결과가 있으면 그 구는 건너뛴다(이어 돌리기).
 */
import fs from "node:fs";
import path from "node:path";

const KEY = (() => {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = /^MOLIT_API_KEY=(.+)$/m.exec(env);
  if (!m) throw new Error("MOLIT_API_KEY 없음");
  return m[1].trim();
})();

const SEOUL = ["11110", "11140", "11170", "11200", "11215", "11230", "11260", "11290", "11305",
  "11320", "11350", "11380", "11410", "11440", "11470", "11500", "11530", "11545", "11560",
  "11590", "11620", "11650", "11680", "11710", "11740"];

const OUT = path.join(process.cwd(), "scripts/data/bjdong-codes.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const store = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : { generatedAt: null, done: [], dongs: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      if (!text.trim().startsWith("{")) throw new Error(`non-json ${res.status}`);
      const json = JSON.parse(text);
      if (!json.response) throw new Error(JSON.stringify(json).slice(0, 120));
      return json.response.body;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(600 * (i + 1));
    }
  }
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => /^\d{5}$/.test(a));
  const only = process.argv.slice(2).filter((a) => /^\d{5}$/.test(a));
  const start = Number(process.env.RANGE_START ?? 10000);
  const end = Number(process.env.RANGE_END ?? 15600);
  void only;
  const list = targets.length ? targets : SEOUL;
  for (const sg of list) {
    if (store.done.includes(sg) && !process.env.RANGE_START) {
      console.log(`${sg} — 이미 완료, 건너뜀`);
      continue;
    }
    let found = 0;
    const known = new Set(store.dongs.filter((d) => d.sigungu === sg).map((d) => d.cd));
    const started = Date.now();
    for (let code = start; code <= end; code += 100) {
      const bjd = String(sg) + String(code).padStart(5, "0");
      if (known.has(bjd)) continue;
      let body;
      try {
        body = await fetchJson(
          `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${KEY}` +
            `&sigunguCd=${sg}&bjdongCd=${String(code).padStart(5, "0")}&numOfRows=1&pageNo=1&_type=json`
        );
      } catch (e) {
        console.log(`  ! ${bjd} — ${e.message}`);
        continue;
      }
      const total = Number(body.totalCount ?? 0);
      if (total <= 0) continue;
      const item = (body.items?.item ?? [])[0] ?? {};
      const name = String(item.platPlc ?? "").replace(/^서울특별시\s+\S*구\s+/, "").replace(/\s.*$/, "");
      store.dongs.push({ cd: bjd, sigungu: sg, name, total });
      found++;
    }
    store.done.push(sg);
    store.generatedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(store, null, 0));
    console.log(`${sg} — 새 법정동 ${found}곳 (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  const tot = store.dongs.reduce((a, d) => a + d.total, 0);
  console.log(`\n법정동 ${store.dongs.length}곳 · 표제부 ${tot.toLocaleString()}행`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
