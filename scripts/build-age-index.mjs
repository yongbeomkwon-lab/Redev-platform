#!/usr/bin/env node
/**
 * 노후도 연식 색인 만들기 — 건축물대장 표제부(`getBrTitleInfo`) → 법정동별 경량 JSON
 *
 *   node scripts/build-age-index.mjs [--force] [bjdongCd...]
 *
 * 왜 필요한가
 *   브이월드 `dt_d010`(GIS건물통합정보)의 `use_confm_de`(사용승인일)는 지역에 따라
 *   세움터 속성 조인이 오래돼 있다 — 2026-11-20 실측으로 신림동은 2003년, 흑석동은 2019년
 *   이후 건물의 연도가 비어 버린다. 그래서 **건축물대장 원본**에서 사용승인일을 받아
 *   PNU 로 이어 붙일 색인을 따로 만든다.
 *
 * 산출물
 *   public/data/age-index/<법정동코드>.json
 *     { "cd": "1162010200", "updated": "2026-11-20", "rows": [[tail, year, totArea], …] }
 *   · tail = 고유번호(PNU 19자리) 끝 9자리 = 대지구분1+본번4+부번4 (앞 10자리는 파일의 법정동코드와 같아 뺀다)
 *   · year = 사용승인 연도(YYYY). 없는 행은 넣지 않는다(색인은 '덮어쓸 값'만 담는다)
 *   · totArea = 연면적 — 같은 필지에 건물이 여러 동일 때 브이월드 연면적과 가장 가까운 행을 고른다
 *
 * 속도
 *   data.go.kr 은 같은 키로 연달아 부르면 빈 200·503 을 섞어 돌려준다(2026-11-20 실측 성공률 30~60%).
 *   그래서 페이지를 6개씩 **병렬로** 부르고, 실패한 페이지만 다시 부른다(최대 20회, 점증 대기).
 */
import fs from "node:fs";
import path from "node:path";

const KEY = (() => {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = /^MOLIT_API_KEY=(.+)$/m.exec(env);
  if (!m) throw new Error("MOLIT_API_KEY 없음");
  return m[1].trim();
})();

const OUT_DIR = path.join(process.cwd(), "public/data/age-index");
const CODES = path.join(process.cwd(), "scripts/data/bjdong-codes.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes("--force");
const explicit = args.filter((a) => /^\d{10}$/.test(a));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path_, tries = 20) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/${path_}`, {
        signal: AbortSignal.timeout(40000),
      });
      const text = await res.text();
      if (!text.trim().startsWith("{")) throw new Error(`non-json ${res.status}`);
      const json = JSON.parse(text);
      if (!json.response) throw new Error("no response");
      return json.response.body;
    } catch (e) {
      last = e.message;
      await sleep(250 + Math.random() * 900);
    }
  }
  throw new Error(last || "failed");
}

function toRows(items) {
  const rows = new Map();
  for (const it of items) {
    const useApr = String(it.useAprDay ?? "").trim();
    if (!/^\d{8}$/.test(useApr)) continue;
    const year = Number(useApr.slice(0, 4));
    if (!(year > 1800 && year <= 2100)) continue;
    const plat = String(it.platGbCd ?? "0") === "1" ? "2" : "1";
    const bun = String(it.bun ?? "").padStart(4, "0");
    const ji = String(it.ji ?? "").padStart(4, "0");
    if (!/^\d{4}$/.test(bun) || !/^\d{4}$/.test(ji)) continue;
    const tail = Number(`${plat}${bun}${ji}`);
    const area = Math.round(Number(it.totArea ?? 0) || 0);
    const key = `${tail}|${year}`;
    const prev = rows.get(key);
    if (!prev || area > prev[2]) rows.set(key, [tail, year, area]);
  }
  return [...rows.values()];
}

async function buildBjdong(cd) {
  const sigungu = cd.slice(0, 5);
  const bjdong = cd.slice(5);
  const q = (page) =>
    `getBrTitleInfo?serviceKey=${KEY}&sigunguCd=${sigungu}&bjdongCd=${bjdong}` +
    `&numOfRows=100&pageNo=${page}&_type=json`;

  const first = await api(q(1));
  const total = Number(first.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / 100));
  const rows = new Map();
  for (const r of toRows(first.items?.item ?? [])) rows.set(`${r[0]}|${r[1]}`, r);

  let page = 2;
  const WORKERS = 6;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (page <= totalPages) {
        const p = page++;
        const body = await api(q(p));
        for (const r of toRows(body.items?.item ?? [])) rows.set(`${r[0]}|${r[1]}`, r);
      }
    })
  );
  return { total, rows: [...rows.values()] };
}

async function main() {
  const codes = JSON.parse(fs.readFileSync(CODES, "utf8"));
  const targets = explicit.length ? explicit : [];
  if (targets.length === 0) {
    console.error("대상 법정동 코드를 주세요");
    process.exit(2);
  }
  for (const cd of targets) {
    const out = path.join(OUT_DIR, `${cd}.json`);
    if (fs.existsSync(out) && !force) {
      console.log(`${cd} — 이미 있음, 건너뜀`);
      continue;
    }
    const info = codes.dongs.find((d) => d.cd === cd);
    const t0 = Date.now();
    const { total, rows } = await buildBjdong(cd);
    const recent = rows.filter((r) => r[1] >= 2019).length;
    fs.writeFileSync(
      out,
      JSON.stringify({ cd, updated: new Date().toISOString().slice(0, 10), rows })
    );
    console.log(
      `${cd} ${info?.name ?? ""} — 표제부 ${total.toLocaleString()}행 → 색인 ${rows.length.toLocaleString()}행` +
        ` (2019년 이후 ${recent.toLocaleString()}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
