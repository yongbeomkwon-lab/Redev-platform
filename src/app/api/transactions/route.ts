// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions — 국토교통부 실거래가 (최근 3~12개월)
//
//   ?gu=동작구&dongs=상도동&months=6&jibun=209
//     · gu      서울 자치구 (필수) — 25개 구 → LAWD_CD 매핑
//     · dongs   법정동 이름 (필수, 쉼표·가운뎃점으로 여러 개: 한남동,보광동)
//                · 예전 이름 `dong` 도 그대로 받는다(단일 동 호환)
//     · months  3~12 (기본 6, 이번 달 포함)
//     · jibun   구역 대표 지번 본번 — 같은 지번 거래를 '구역 내'로 표시(선택, 경계 도형이 없을 때만 씀)
//
//   응답에는 비밀 키가 절대 들어가지 않는다 — 키는 이 파일에서만 읽는다.
//   구역 경계 안팎 판정은 클라이언트(지번 지오코딩 + 폴리곤)에서 한다. 이 라우트는
//   **어느 법정동을 조회할지**만 정하고, 그 동들의 거래를 그대로 넘긴다.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import {
  SEOUL_LAWD_CODES,
  type MolitResponse,
  type MolitTransaction,
} from "@/lib/molit";
import { loadGuTransactions, recentMonths } from "@/lib/molit-server";

export const dynamic = "force-dynamic";

/** 구역이 걸치는 법정동은 보통 1~3개, 많아도 5개 안팎 — 그 이상은 받지 않는다 */
const MAX_DONGS = 8;

function fail(reason: NonNullable<MolitResponse["reason"]>, message: string, status = 200) {
  const body: MolitResponse = { ok: false, reason, message };
  return NextResponse.json(body, { status });
}

/** 주소의 '상도동 209'처럼 이름에 붙은 지번에서 본번·부번을 뽑는다 */
function parseJibun(raw: string | null): { bonbun: number; bubun: number | null } | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,4})(?:\s*-\s*(\d{1,4}))?/);
  if (!m) return null;
  const bonbun = Number(m[1]);
  if (!Number.isFinite(bonbun) || bonbun <= 0) return null;
  return { bonbun, bubun: m[2] ? Number(m[2]) : null };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gu = (url.searchParams.get("gu") ?? "").trim();
  const dongRaw = (url.searchParams.get("dongs") ?? url.searchParams.get("dong") ?? "").trim();
  const monthsParam = Number(url.searchParams.get("months") ?? "6");
  const months = Number.isFinite(monthsParam) ? Math.min(12, Math.max(3, Math.round(monthsParam))) : 6;
  const zoneJibun = parseJibun(url.searchParams.get("jibun"));

  const lawdCd = SEOUL_LAWD_CODES[gu];
  if (!lawdCd) return fail("gu_not_found", `서울 자치구 이름을 확인해 주세요 (받은 값: ${gu || "없음"})`, 400);

  const dongs = Array.from(
    new Set(
      dongRaw
        .split(/[,·]/)
        .map((d) => d.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_DONGS);
  if (!dongs.length) return fail("bad_request", "법정동(dongs)을 지정해 주세요", 400);

  const key = (process.env.MOLIT_API_KEY ?? "").trim();
  if (!key) {
    return fail(
      "key_missing",
      "국토부 API 키(MOLIT_API_KEY)가 서버에 설정되어 있지 않습니다. Vercel 프로젝트 환경변수에 추가하면 바로 표시됩니다."
    );
  }

  const monthList = recentMonths(months);
  const data = await loadGuTransactions({ lawdCd, months: monthList, key });

  if (!data.anyOk) {
    const firstFail = data.coverage.find((c) => !c.ok);
    return fail(
      "upstream_failed",
      `국토부 실거래 API가 응답하지 않았습니다${firstFail?.code ? ` (${firstFail.code} ${firstFail.message ?? ""})` : ""}. 잠시 뒤 다시 시도해 주세요.`
    );
  }

  const want = new Set(dongs);
  const rows: MolitTransaction[] = [];
  for (const tx of data.transactions) {
    if (!want.has(tx.umdNm)) continue;
    // 구역 대표 지번과 같은 필지(본번·부번)면 '구역 내'로 표시
    let scope: MolitTransaction["scope"] = "dong";
    if (zoneJibun) {
      const m = tx.jibun.match(/^(\d+)(?:-(\d+))?$/);
      if (m) {
        const bonbun = Number(m[1]);
        const bubun = m[2] ? Number(m[2]) : 0;
        const dongMatches = !tx.umdNm || want.has(tx.umdNm);
        if (dongMatches && bonbun === zoneJibun.bonbun && (zoneJibun.bubun === null || bubun === zoneJibun.bubun)) {
          scope = "zone";
        }
      }
    }
    rows.push({ ...tx, scope });
  }

  rows.sort((a, b) => b.dealDate.localeCompare(a.dealDate) || b.price - a.price);

  const live = rows.filter((r) => !r.canceled);
  const byKind: Record<string, number> = {};
  for (const r of live) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const pyeongPrices = live
    .filter((r) => r.pyeongBasis === "전용")
    .map((r) => r.pyeongPrice)
    .filter((v): v is number => !!v && v > 0);
  // 지분·대지 평당가 — 단독·다가구(대지면적) + 연립·다세대(대지권면적 landAr)
  const landPyeongPrices = live
    .map((r) => r.landPyeongPrice)
    .filter((v): v is number => !!v && v > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  const notices: string[] = [
    "국토부 실거래가는 계약일 기준 신고 자료입니다. 최근 1~2개월은 신고가 덜 들어와 건수가 적습니다.",
  ];
  const miss30 = data.coverage.filter((c) => !c.ok && c.code === "30");
  if (miss30.length) {
    notices.push(
      `${miss30.map((c) => c.kind).join("·")} 매매는 국토부 활용신청이 아직 승인되지 않아 표시되지 않습니다 — 승인되면 자동으로 나옵니다.`
    );
  }
  const otherFail = data.coverage.filter((c) => !c.ok && c.code !== "30");
  if (otherFail.length) {
    notices.push(`${otherFail.map((c) => c.kind).join("·")} 매매는 국토부 응답 오류로 이번 조회에서 빠졌습니다.`);
  }
  if (data.coverage.some((c) => c.kind === "단독·다가구" && c.ok)) {
    notices.push("단독·다가구는 국토부가 지번을 가려서(`1**`) 필지를 특정할 수 없습니다 — 같은 법정동 최근 거래로만 봐 주세요.");
  }
  if (rows.length === 0) {
    notices.push(`${dongs.join("·")}에는 최근 ${months}개월 국토부 신고 거래가 없습니다.`);
  }

  const body: MolitResponse = {
    ok: true,
    query: {
      gu,
      lawdCd,
      dongs,
      months,
      from: monthList[0],
      to: monthList[monthList.length - 1],
      zoneJibun: zoneJibun ? `${zoneJibun.bonbun}${zoneJibun.bubun !== null ? `-${zoneJibun.bubun}` : ""}` : null,
    },
    coverage: data.coverage,
    transactions: rows,
    summary: {
      count: live.length,
      byKind,
      inZone: live.filter((r) => r.scope === "zone").length,
      sameDong: live.filter((r) => r.scope === "dong").length,
      canceled: rows.filter((r) => r.canceled).length,
      avgPyeongPrice: avg(pyeongPrices),
      avgLandPyeongPrice: avg(landPyeongPrices),
    },
    notices,
    cached: data.cached,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: {
      // 키가 없는 응답이라 CDN 캐시가 안전하다. 서버 캐시(1시간)보다 짧게 둔다.
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
