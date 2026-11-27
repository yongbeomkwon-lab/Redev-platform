// 추정 감평 순위 — 순수 계산·응답 파싱 자체 검사 (브이월드 없이 돌릴 수 있는 부분)
//   실행:
//     ./node_modules/.bin/tsc --outDir tmp/appr-test --module commonjs --target es2022 \
//       --moduleResolution node --skipLibCheck --noEmit false src/lib/appraisal-rank.ts src/lib/appraisal-server.ts
//     node scripts/test-appraisal-rank.cjs
const assert = require("node:assert/strict");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "tmp", "appr-test");
const rank = require(path.join(LIB, "appraisal-rank.js"));
const server = require(path.join(LIB, "appraisal-server.js"));

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass++;
    console.log("PASS " + name);
  } catch (e) {
    console.log("FAIL " + name + " — " + (e && e.message));
    process.exitCode = 1;
  }
}

function item(price, extra = {}) {
  const jibun = extra.jibun ?? "467-19";
  return {
    pnu: "1165010100100010001",
    kind: "land",
    jibun,
    addr: `서울특별시 서초구 방배동 ${jibun}`,
    complexNm: null,
    dongNm: null,
    hoNm: null,
    price,
    year: 2026,
    areaSqm: 100,
    landPricePerSqm: 1000,
    ...extra,
  };
}

// ── 순위 ────────────────────────────────────────────────────────────────
ok("순위: 내림차순 + 같은 금액은 같은 순위(경쟁 순위)", () => {
  const ranked = rank.rankItems([item(300), item(100), item(300), item(200)], 1);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3, 4]);
  assert.deepEqual(ranked.map((r) => r.estimated), [300, 300, 200, 100]);
  assert.equal(ranked[0].pctFromTop, 25);
  assert.equal(ranked[3].pctFromTop, 100);
});

ok("순위: 보정률 1.3 을 곱한다(1원 미만 반올림)", () => {
  const ranked = rank.rankItems([item(100000000)], 1.3);
  assert.equal(ranked[0].estimated, 130000000);
});

ok("순위: 0·NaN 금액은 목록에서 빠진다", () => {
  const ranked = rank.rankItems([item(0), item(NaN), item(500)], 1.3);
  assert.equal(ranked.length, 1);
});

ok("순위: 큰 목록의 1위는 0 이 아닌 아주 작은 상위 %", () => {
  const items = Array.from({ length: 2770 }, (_, i) => item(1_000_000 + i));
  const ranked = rank.rankItems(items, 1);
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].pctFromTop > 0 && ranked[0].pctFromTop < 0.1, String(ranked[0].pctFromTop));
  assert.equal(ranked[ranked.length - 1].pctFromTop, 100);
});

// ── 분위 ────────────────────────────────────────────────────────────────
ok("분위: 100건이면 10·25·50·75% 지점 값이 맞고 구간 합이 전체와 같다", () => {
  const items = Array.from({ length: 100 }, (_, i) => item((100 - i) * 1_000_000));
  const ranked = rank.rankItems(items, 1);
  const s = rank.summarizeRank(ranked);
  assert.equal(s.count, 100);
  assert.equal(s.max, 100_000_000);
  assert.equal(s.min, 1_000_000);
  assert.equal(s.top10, 91_000_000); // 10번째(상위 10%) 지점
  assert.equal(s.top25, 76_000_000);
  assert.equal(s.median, 51_000_000);
  assert.equal(s.low25, 26_000_000);
  assert.equal(s.buckets.reduce((a, b) => a + b.count, 0), 100);
  assert.deepEqual(
    s.buckets.map((b) => b.label),
    ["상위 10%", "상위 10~25%", "상위 25~50%", "상위 50~75%", "하위 25%"]
  );
  assert.deepEqual(s.buckets.map((b) => b.count), [10, 15, 25, 25, 25]);
  assert.equal(s.buckets[0].max, 100_000_000);
  assert.equal(s.buckets[4].min, 1_000_000);
});

ok("분위: 한 건짜리도 0으로 나누지 않는다", () => {
  const s = rank.summarizeRank(rank.rankItems([item(1000)], 1.3));
  assert.equal(s.count, 1);
  assert.equal(s.buckets.length, 1);
});

// ── 금액 순위 조회 ───────────────────────────────────────────────────────
ok("금액 순위: 높은 물건 수 + 1 = 경쟁 순위", () => {
  const ranked = rank.rankItems([item(500), item(400), item(300), item(200)], 1);
  const r = rank.rankOfAmount(ranked, 350);
  assert.equal(r.rank, 3);
  assert.equal(r.higher, 2);
  assert.equal(r.pctFromTop, 75);
  const same = rank.rankOfAmount(ranked, 400);
  assert.equal(same.rank, 2);
  assert.equal(same.equal, 1);
  const top = rank.rankOfAmount(ranked, 900);
  assert.equal(top.rank, 1);
  const bottom = rank.rankOfAmount(ranked, 100);
  assert.equal(bottom.rank, 5);
});

// ── 지번 찾기 ────────────────────────────────────────────────────────────
ok("지번 찾기: '467-19'·'방배동 467-19'·동호수 모두 걸린다", () => {
  const ranked = rank.rankItems(
    [
      item(1000, { jibun: "467-19" }),
      item(2000, { jibun: "467-2" }),
      item(3000, { jibun: "468", kind: "apart", dongNm: "101", hoNm: "502", complexNm: "방배아파트" }),
    ],
    1
  );
  assert.equal(rank.matchJibun(ranked, "467-19").length, 1);
  assert.equal(rank.matchJibun(ranked, "방배동 467-19").length, 1);
  assert.equal(rank.matchJibun(ranked, "467").length, 2);
  assert.equal(rank.matchJibun(ranked, "101502").length, 1);
  assert.equal(rank.matchJibun(ranked, "").length, 0);
});

// ── 금액 문자열 ──────────────────────────────────────────────────────────
ok("금액 파싱: '9억 8,000만'·'9.8억'·'980000000' 이 같은 값", () => {
  assert.equal(rank.parseAmount("9억 8,000만"), 980_000_000);
  assert.equal(rank.parseAmount("9.8억"), 980_000_000);
  assert.equal(rank.parseAmount("980000000"), 980_000_000);
  assert.equal(rank.parseAmount("4억"), 400_000_000);
  assert.equal(rank.parseAmount("9500만"), 95_000_000);
  assert.equal(rank.parseAmount(""), null);
  assert.equal(rank.parseAmount("없음"), null);
});

ok("금액 표기: 억·만원 단위로 줄인다", () => {
  assert.equal(rank.wonLabel(980_000_000), "9.80억");
  assert.equal(rank.wonLabel(95_000_000), "9,500만");
  assert.equal(rank.wonLabel(9000), "9,000원");
  assert.equal(rank.wonLabel(0), "—");
});

// ── 브이월드 NED 응답 파싱 ───────────────────────────────────────────────
ok("NED 파싱: 공동주택 봉투(apartHousingPrices.field[]) + 문자열 totalCount", () => {
  const body = JSON.stringify({
    apartHousingPrices: {
      numOfRows: 10,
      pageNo: 1,
      totalCount: "2",
      field: [
        { pnu: "1165010100100010001", pblntfPc: "88000000", dongNm: "101", hoNm: "502", aphusNm: "방배아파트", prvuseAr: "49.93", stdrYear: "2026" },
        { pnu: "1165010100100010001", pblntfPc: "84000000", dongNm: "101", hoNm: "501", aphusNm: "방배아파트", prvuseAr: "49.65", stdrYear: "2026" },
      ],
    },
  });
  const parsed = server.parseNedPayload(body);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.total, 2);
});

ok("NED 파싱: 한 행이 객체 하나로 와도 읽는다(개별공시지가)", () => {
  const body = JSON.stringify({
    indvdLandPrices: { resultCode: "success", field: { pblntfPclnd: "1860000", lndpclAr: "100.5", stdrYear: "2026" } },
  });
  const parsed = server.parseNedPayload(body);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].pblntfPclnd, "1860000");
});

ok("NED 파싱: {error:{code,message}} 를 코드로 올린다", () => {
  const parsed = server.parseNedPayload(JSON.stringify({ error: { code: "INCORRECT_KEY", message: "인증키가 올바르지 않습니다" } }));
  assert.match(parsed.error, /INCORRECT_KEY/);
  assert.equal(parsed.forbidden, true);
});

ok("NED 파싱: {response:{status:ERROR,…}} 도 잡는다", () => {
  const parsed = server.parseNedPayload(
    JSON.stringify({ response: { status: "ERROR", error: { code: "INVALID_KEY", text: "키 오류" } } })
  );
  assert.match(parsed.error, /INVALID_KEY/);
  assert.equal(parsed.forbidden, true);
});

ok("NED 파싱: XML 오류를 코드·메시지로", () => {
  const parsed = server.parseNedPayload('<?xml version="1.0"?><error code="UNAVAILABLE_KEY"><message>키 사용 불가</message></error>');
  assert.match(parsed.error, /UNAVAILABLE_KEY/);
  assert.equal(parsed.forbidden, true);
});

ok("NED 파싱: 결과 0건은 오류가 아니다", () => {
  const parsed = server.parseNedPayload(JSON.stringify({ indvdLandPrices: { totalCount: "0", field: [] } }));
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.total, 0);
});

console.log(`\n${pass} checks passed`);
