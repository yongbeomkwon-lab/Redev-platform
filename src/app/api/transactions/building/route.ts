// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/building — 단지·건물 하나의 최근 N개월(최대 60개월) 실거래
//
//   ?gu=용산구&dong=한남동&jibun=123-4&kind=아파트&name=한남더힐&months=24&offset=0
//     · gu      서울 자치구 (필수) — 25개 구 → LAWD_CD 매핑
//     · dong    법정동 이름 (필수, umdNm 과 정확히 같아야 한다)
//     · jibun   지번 (예: 209-12) — 같은 필지 거래를 고른다
//     · kind    아파트 | 연립·다세대 (필수) — 이 유형 **1종만** 조회한다
//     · name    단지명·건물명 — 아파트는 이름이 같은 다른 지번도 같은 단지로 본다
//     · months  이번 호출에서 볼 개월 수 (1~60, 기본 60)
//     · offset  최근 몇 개월을 건너뛸지 (0~59, 기본 0) — 화면은 24개월 → 나머지 36개월로 나눠
//               부르므로 첫 화면이 1~2초에 뜨고, 60개월 한 번에 부르는 타임아웃 위험이 없다.
//
//   · 국토부는 3유형을 따로 제공하지만, 여기서는 이미 유형을 알고 있어 **한 종만** 부른다.
//   · 달 단위 응답은 molit-server 의 캐시(lawdCd:ym:kind, 1시간)를 그대로 공유한다.
//   · 키는 이 파일 계열(서버)에서만 읽는다 — 응답에 절대 넣지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import {
  BUILDING_TRADE_KINDS,
  MOLIT_KINDS,
  SEOUL_LAWD_CODES,
  type BuildingHistoryResponse,
  type BuildingTradeKind,
  type MolitTransaction,
} from "@/lib/molit";
import { loadBuildingTransactions, recentMonths } from "@/lib/molit-server";
import { molitFailMessage } from "@/lib/molit-error";

export const dynamic = "force-dynamic";
/** 60개월을 한 번에 불러도 Vercel 서버리스 한도를 넘지 않게 — 실제로는 24+36으로 나눠 부른다 */
export const maxDuration = 60;

/** 한 번에 볼 수 있는 최대 개월 — 창(offset+months)은 5년(60개월)을 넘지 않는다 */
const MAX_MONTHS = 60;

function fail(
  reason: NonNullable<BuildingHistoryResponse["reason"]>,
  message: string,
  status = 200
) {
  const body: BuildingHistoryResponse = { ok: false, reason, message };
  return NextResponse.json(body, { status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gu = (url.searchParams.get("gu") ?? "").trim();
  const dong = (url.searchParams.get("dong") ?? url.searchParams.get("dongs") ?? "")
    .split(/[,·]/)[0]
    .trim();
  const jibun = (url.searchParams.get("jibun") ?? "").trim();
  const name = (url.searchParams.get("name") ?? "").trim();
  const kindRaw = (url.searchParams.get("kind") ?? "").trim();

  const monthsParam = Number(url.searchParams.get("months") ?? MAX_MONTHS);
  const offsetParam = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isFinite(offsetParam)
    ? Math.min(MAX_MONTHS - 1, Math.max(0, Math.round(offsetParam)))
    : 0;
  const months = Number.isFinite(monthsParam)
    ? Math.min(MAX_MONTHS, Math.max(1, Math.round(monthsParam)))
    : MAX_MONTHS;
  // 창은 5년을 넘지 않게 — offset 이 뒤로 갈수록 개월 수를 줄인다
  const span = Math.min(months, MAX_MONTHS - offset);

  const lawdCd = SEOUL_LAWD_CODES[gu];
  if (!lawdCd) {
    return fail(
      "gu_not_found",
      `서울 자치구 이름을 확인해 주세요 (받은 값: ${gu || "없음"})`,
      400
    );
  }
  if (!kindRaw || !(BUILDING_TRADE_KINDS as string[]).includes(kindRaw)) {
    const isDanok = kindRaw === "단독·다가구";
    return fail(
      "bad_request",
      isDanok
        ? "단독·다가구는 지번이 가려져 오고 건물 단위로 묶기 어려워 5년 이력을 제공하지 않습니다."
        : `유형(kind)은 ${BUILDING_TRADE_KINDS.join(" 또는 ")} 이어야 합니다 (받은 값: ${kindRaw || "없음"}, 지원: ${MOLIT_KINDS.join("·")})`,
      400
    );
  }
  if (!dong) return fail("bad_request", "법정동(dong)을 지정해 주세요", 400);
  if (!jibun && !name) {
    return fail("bad_request", "지번(jibun) 또는 단지명(name)이 있어야 단지를 특정할 수 있습니다", 400);
  }

  const key = (process.env.MOLIT_API_KEY ?? "").trim();
  if (!key) {
    return fail(
      "key_missing",
      "국토부 API 키(MOLIT_API_KEY)가 서버에 설정되어 있지 않습니다. Vercel 프로젝트 환경변수에 추가하면 바로 표시됩니다."
    );
  }

  const kind = kindRaw as BuildingTradeKind;
  // offset 개월을 건너뛰고 span 개월 — recentMonths 는 오래된 순이므로 앞에서 잘라 낸다
  const monthList = recentMonths(offset + span).slice(0, span);

  const data = await loadBuildingTransactions({
    lawdCd,
    kind,
    months: monthList,
    key,
    dong,
    jibun: jibun || null,
    name: name || null,
  });

  if (!data.coverage.ok && data.monthsOk === 0) {
    const { reason, message } = molitFailMessage(data.coverage);
    return fail(reason, message);
  }

  const rows: MolitTransaction[] = data.transactions;
  const live = rows.filter((r) => !r.canceled);
  const prices = live.map((r) => r.price).filter((v) => v > 0);
  const mean = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const latestRow = live.length
    ? live.reduce((a, b) => (a.dealDate >= b.dealDate ? a : b))
    : null;

  const body: BuildingHistoryResponse = {
    ok: true,
    query: {
      gu,
      lawdCd,
      dong,
      jibun,
      kind,
      name,
      months: span,
      offset,
      from: monthList[0],
      to: monthList[monthList.length - 1],
    },
    coverage: data.coverage,
    transactions: rows,
    summary: {
      count: live.length,
      canceled: rows.length - live.length,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      latest: latestRow
        ? {
            price: latestRow.price,
            dealDate: latestRow.dealDate,
            areaSqm: latestRow.areaSqm,
            floor: latestRow.floor,
          }
        : null,
      avgPyeongPrice: mean(
        live.map((r) => r.pyeongPrice).filter((v): v is number => !!v && v > 0)
      ),
      avgLandPyeongPrice: mean(
        live.map((r) => r.landPyeongPrice).filter((v): v is number => !!v && v > 0)
      ),
    },
    partial: data.monthsOk < data.monthsTotal,
    failedMonths: data.failedMonths,
    cached: data.cached,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: {
      // 키가 없는 응답이라 CDN 캐시가 안전하다 — 서버 메모리 캐시(1시간)와 같은 길이로 둔다
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
