import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import {
  AGE_WFS_MAX_FEATURES,
  buildingsFromFeatures,
  type BuildingAgeResponse,
} from "@/lib/building-age";

/**
 * 건물 연식(노후도) — 브이월드 국가중점 WFS 프록시
 *
 *   GET /api/building-age?bbox=minLng,minLat,maxLng,maxLat&tile=tx,ty
 *
 * · 인증키는 **서버에서만** 읽는다(VWORLD_API_KEY). 브라우저에는 키가 내려가지 않는다.
 * · 브이월드는 `domain` 파라미터가 인증키에 등록한 서비스URL 과 같아야 응답한다(VWORLD_DOMAIN).
 *   CORS 도 브이월드 쪽에서 열려 있지 않아, 클라이언트가 직접 부르지 않고 이 라우트를 거친다.
 * · 좌표는 EPSG:4326(경위도) GeoJSON 으로 받아 소수점 5자리(≈1m)로 줄여 내려준다.
 * · 타일 단위로만 호출되므로(클라이언트가 0.005° 격자로 요청) CDN 캐시가 잘 먹는다 —
 *   같은 타일을 다시 보는 방문자는 브이월드를 부르지 않는다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "https://api.vworld.kr/ned/wfs/getBldgisSpceWFS";
/** WFS 응답 대기 상한(ms) — 브이월드가 느릴 때 라우트가 매달리지 않게 */
const TIMEOUT_MS = 9000;
/** 한 요청의 bbox 상한(도) — 이보다 크면 타일을 쪼개서 부르라는 뜻으로 거절한다 */
const MAX_SPAN_DEG = 0.02;

/**
 * 브이월드는 **undici(fetch)의 HTTP/2 스트림을 거절**한다 — 서버 액션에서는 늘
 * `NGHTTP2_REFUSED_STREAM` 으로 떨어졌다(2026-11-20, Vercel·로컬 공동 확인).
 * 그래서 node:https(HTTP/1.1) 으로 직접 부르고, 일반 브라우저와 같은 헤더(UA·Referer)를 붙인다.
 */
function getText(
  url: string,
  timeoutMs: number,
  referer: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          referer,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

function fail(error: string, status: number, detail?: string) {
  const payload: BuildingAgeResponse = detail ? { ok: false, error, detail } : { ok: false, error };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const key = process.env.VWORLD_API_KEY;
  const domain = process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app";
  if (!key) {
    return fail("VWORLD_API_KEY_NOT_SET", 503, "서버 환경변수 VWORLD_API_KEY 가 없습니다.");
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("bbox") ?? "").split(",").map((v) => Number(v.trim()));
  if (raw.length !== 4 || raw.some((v) => !Number.isFinite(v))) {
    return fail("BAD_BBOX", 400, "bbox=minLng,minLat,maxLng,maxLat 형식이어야 합니다.");
  }
  const [minLng, minLat, maxLng, maxLat] = raw;
  if (maxLng <= minLng || maxLat <= minLat) {
    return fail("BAD_BBOX", 400, "bbox 의 최대값이 최소값보다 커야 합니다.");
  }
  if (maxLng - minLng > MAX_SPAN_DEG || maxLat - minLat > MAX_SPAN_DEG) {
    return fail("BBOX_TOO_LARGE", 400, `bbox 한 변은 ${MAX_SPAN_DEG}도 이하여야 합니다.`);
  }
  // 대한민국 대략 범위 밖이면 브이월드를 부르지 않는다(쿼터 보호)
  if (minLng < 124 || maxLng > 132 || minLat < 33 || maxLat > 39.5) {
    return fail("OUT_OF_KOREA", 400, "대한민국 범위 밖의 좌표입니다.");
  }

  const params = new URLSearchParams({
    SERVICE: "WFS",
    REQUEST: "GetFeature",
    VERSION: "1.1.0",
    TYPENAME: "dt_d010",
    BBOX: [minLng, minLat, maxLng, maxLat].map((v) => v.toFixed(6)).join(","),
    SRSNAME: "EPSG:4326",
    OUTPUT: "application/json",
    MAXFEATURES: String(AGE_WFS_MAX_FEATURES),
    key,
    domain,
  });

  let upstream: { status: number; body: string };
  try {
    upstream = await getText(
      `${ENDPOINT}?${params.toString()}`,
      TIMEOUT_MS,
      `https://${domain}/`
    );
  } catch (error) {
    // 원인을 최대한 남긴다 — 이 라우트는 Vercel(해외 리전)에서 도는 경우가 있어
    //   DNS/방화벽/타임아웃 중 무엇인지 구분되어야 한다.
    const e = error as {
      name?: string;
      message?: string;
      cause?: { code?: string; message?: string; errno?: number };
    };
    const detail = [e?.name, e?.message, e?.cause?.code, e?.cause?.message]
      .filter(Boolean)
      .join(" | ");
    return fail("VWORLD_UNREACHABLE", 502, detail || String(error));
  }

  const text = upstream.body;
  if (upstream.status < 200 || upstream.status >= 300) {
    return fail("VWORLD_HTTP_ERROR", 502, `HTTP ${upstream.status} ${text.slice(0, 300)}`);
  }
  // 브이월드는 오류를 XML(ServiceException)로 돌려준다 — JSON 이 아니면 사유를 그대로 올린다
  if (!text.trimStart().startsWith("{")) {
    const code = /code="([^"]+)"/.exec(text)?.[1] ?? "VWORLD_ERROR";
    const message = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(text)?.[1]?.trim();
    return fail(code, 502, message?.slice(0, 300));
  }

  let parsed: { features?: unknown; numberMatched?: number };
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("VWORLD_BAD_JSON", 502, text.slice(0, 200));
  }

  const buildings = buildingsFromFeatures(parsed.features);
  const matched = typeof parsed.numberMatched === "number" ? parsed.numberMatched : buildings.length;
  const payload: BuildingAgeResponse = {
    ok: true,
    tile: url.searchParams.get("tile") ?? "",
    total: buildings.length,
    truncated: matched > buildings.length,
    buildings,
  };

  return NextResponse.json(payload, {
    headers: {
      // 타일 키가 고정이라 오래 캐시해도 안전하다(건물 통합정보는 월 단위 갱신)
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
}
