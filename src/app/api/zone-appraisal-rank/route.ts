import { NextResponse } from "next/server";
import type { AppraisalItem } from "@/lib/appraisal-rank";
import type { ZoneShapeInput } from "@/lib/zone-stats";
import {
  fetchParcelAppraisal,
  nedEnv,
  planZoneParcels,
  resolveAppraisalYear,
  type ParcelInput,
  type PlanParcel,
} from "@/lib/appraisal-server";

/**
 * 구역 내 추정 감평 순위 — POST /api/zone-appraisal-rank
 *
 *   국토부 공시가격(공동주택가격·개별주택가격·개별공시지가)을 구역 안 필지마다 모아
 *   감평 순위의 원자료(공시가격 항목 목록)를 낸다. 순위·분위·보정률 계산은 화면이 한다
 *   (보정률 슬라이더를 움직일 때마다 서버를 다시 부르지 않게 — `lib/appraisal-rank.ts` 공용).
 *
 *   body ① 계획: { mode: "plan", shape: { polygon, parts?, holes? } }
 *        → 구역 안 필지(PNU·지번·면적) 목록. 브이월드 연속지적도만 부른다(1~3회).
 *   body ② 조회: { mode: "appraise", parcels: [{ pnu, jibun, addr, areaSqm }] }  (한 번에 30필지까지)
 *        → 필지마다 아파트(호별) → 단독·다가구 → 토지(공시지가×면적) 순으로 조회해 항목을 낸다.
 *
 *   · 왜 두 단계인가: 필지 하나당 브이월드를 1~3회 왕복해야 해서(구역 단위 일괄 API 가 없다)
 *     필지가 많은 구역은 한 요청(함수 60초)에 다 못 넣는다. 화면이 25필지씩 나눠 보내고
 *     진행률을 그리며, 필지 결과는 서버가 24시간 캐시해 다시 열 때 즉시 나온다.
 *   · 인증키는 서버 환경변수(VWORLD_API_KEY)로만 쓴다 — 브라우저에는 내려보내지 않는다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 필지 30곳 × 최대 3회 왕복 — 기본 10초로는 모자란다 */
export const maxDuration = 60;

/** 한 요청에 담는 필지 수 상한 */
const MAX_PARCELS = 30;
/** 구역 bbox 한 변 상한(도) — 0.03° ≈ 3.3km (zone-stats 와 같은 쿼터 보호) */
const MAX_SPAN_DEG = 0.03;
/** 동시에 도는 브이월드 왕복 수 — 쿼터·지연을 함께 본다 */
const CONCURRENCY = 4;

type PlanBody = { mode?: "plan"; shape?: ZoneShapeInput };
type AppraiseBody = { mode: "appraise"; parcels?: ParcelInput[] };
type Body = PlanBody | AppraiseBody;

export type ZoneAppraisalPlanResponse = {
  ok: true;
  mode: "plan";
  parcels: PlanParcel[];
  total: number;
  meta: { requests: number; truncated: boolean; excluded: number };
};

export type ZoneAppraisalItemsResponse = {
  ok: true;
  mode: "appraise";
  year: number;
  items: AppraisalItem[];
  parcels: { pnu: string; count: number; missing: boolean; error: string | null }[];
  meta: { requests: number; missing: number; errors: string[]; truncated: boolean };
};

export type ZoneAppraisalError = {
  ok: false;
  error: string;
  detail?: string;
  /** 사용자가 무엇을 하면 풀리는지 (권한·키 문제일 때) */
  hint?: string;
};

function fail(error: string, status: number, detail?: string, hint?: string) {
  const payload: ZoneAppraisalError = { ok: false, error, ...(detail ? { detail } : {}), ...(hint ? { hint } : {}) };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

const NED_HINT =
  "브이월드 인증키에 「국가중점데이터 API(NED 속성정보)」 사용이 켜져 있어야 합니다. vworld.kr → 오픈API → 인증키 관리에서 활용 API 에 공동주택가격·개별주택가격·개별공시지가를 추가하고, 서비스 URL(VWORLD_DOMAIN)이 배포 도메인과 같은지 확인해 주세요.";

export async function POST(request: Request) {
  let body: Body | null = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("BAD_JSON", 400, "shape 또는 parcels 를 담은 JSON 본문이 필요합니다.");
  }

  const env = nedEnv();
  if (!env) {
    return fail("VWORLD_API_KEY_NOT_SET", 503, "서버 환경변수 VWORLD_API_KEY 가 없습니다.");
  }

  /* ── ① 구역 필지 목록 ─────────────────────────────────────────────── */
  if (!body || body.mode !== "appraise") {
    const shape = (body as PlanBody | null)?.shape;
    if (!shape || !shape.polygon || shape.polygon.length < 3) {
      return fail("NO_SHAPE", 400, "polygon(구역 경계)이 필요합니다 — 경계가 없는 후보지는 계산할 수 없습니다.");
    }
    const rings = [shape.polygon, ...(shape.parts ?? []), ...(shape.holes ?? [])];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 3) return fail("BAD_SHAPE", 400, "경계 링이 3점 이상이어야 합니다.");
      for (const [lat, lng] of ring) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < 124 || lng > 132 || lat < 33 || lat > 39.5) {
          return fail("BAD_SHAPE", 400, "경계 좌표가 대한민국 범위를 벗어났습니다.");
        }
      }
    }
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    for (const [lat, lng] of shape.polygon) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    if (maxLng - minLng > MAX_SPAN_DEG || maxLat - minLat > MAX_SPAN_DEG) {
      return fail("ZONE_TOO_LARGE", 400, "구역이 너무 넓습니다(한 변 3km 초과) — 동 단위로 나눠 확인해 주세요.");
    }

    const planned = await planZoneParcels(shape);
    if ("error" in planned) {
      return fail(planned.error, planned.error === "BAD_SHAPE" ? 400 : 502, planned.detail, /VWORLD_UNREACHABLE/.test(planned.error) ? undefined : NED_HINT);
    }
    const payload: ZoneAppraisalPlanResponse = {
      ok: true,
      mode: "plan",
      parcels: planned.parcels,
      total: planned.parcels.length,
      meta: { requests: planned.requests, truncated: planned.truncated, excluded: planned.excluded },
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  /* ── ② 필지별 공시가격 ────────────────────────────────────────────── */
  const parcels = (body as AppraiseBody).parcels;
  if (!Array.isArray(parcels) || parcels.length === 0) {
    return fail("NO_PARCELS", 400, "parcels(필지 목록)가 필요합니다.");
  }
  if (parcels.length > MAX_PARCELS) {
    return fail("TOO_MANY_PARCELS", 400, `한 번에 ${MAX_PARCELS}필지까지만 조회합니다 — 나눠 보내 주세요.`);
  }
  for (const p of parcels) {
    if (!p || typeof p.pnu !== "string" || !/^\d{19}$/.test(p.pnu)) {
      return fail("BAD_PNU", 400, "필지고유번호(PNU 19자리)가 필요합니다.");
    }
  }

  const year = await resolveAppraisalYear(env, parcels.map((p) => p.pnu));

  const results: Awaited<ReturnType<typeof fetchParcelAppraisal>>[] = new Array(parcels.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, parcels.length) }, async () => {
    while (cursor < parcels.length) {
      const index = cursor++;
      const parcel = parcels[index];
      results[index] = await fetchParcelAppraisal(
        {
          pnu: parcel.pnu,
          jibun: typeof parcel.jibun === "string" ? parcel.jibun : null,
          addr: typeof parcel.addr === "string" ? parcel.addr : null,
          areaSqm: typeof parcel.areaSqm === "number" && parcel.areaSqm > 0 ? parcel.areaSqm : null,
        },
        env,
        year
      );
    }
  });
  await Promise.all(workers);

  // 전부 인증키·권한 문제로 실패했으면 기능이 동작하지 않는 상태다 — 원인을 정확히 돌려준다
  const failed = results.filter((r) => r && r.error);
  if (failed.length === parcels.length && failed.every((r) => r.forbidden)) {
    return fail(
      "VWORLD_NED_FORBIDDEN",
      502,
      failed[0]?.error ?? "브이월드가 인증키를 거절했습니다.",
      NED_HINT
    );
  }

  const items: AppraisalItem[] = [];
  let missing = 0;
  let requests = 0;
  let truncated = false;
  const errors: string[] = [];
  const perParcel = results.map((r, i) => {
    requests += r?.requests ?? 0;
    if (r?.truncated) truncated = true;
    if (r?.error && errors.length < 5) errors.push(`${parcels[i].jibun ?? parcels[i].pnu}: ${r.error}`);
    if (r?.missing) missing++;
    if (r?.items?.length) items.push(...r.items);
    return {
      pnu: parcels[i].pnu,
      count: r?.items?.length ?? 0,
      missing: !!r?.missing,
      error: r?.error ?? null,
    };
  });

  const payload: ZoneAppraisalItemsResponse = {
    ok: true,
    mode: "appraise",
    year,
    items,
    parcels: perParcel,
    meta: { requests, missing, errors, truncated },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
