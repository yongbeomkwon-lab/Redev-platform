import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";

/**
 * 임시 유틸리티 — 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 조회 프록시.
 *
 *   GET /api/lp-parcels?bbox=minLng,minLat,maxLng,maxLat&page=1
 *
 * · 경계 정합 작업용으로만 잠깐 띄우는 라우트다(작업 끝나면 삭제).
 * · 인증키는 서버 환경변수(VWORLD_API_KEY)에서만 읽는다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINT = "https://api.vworld.kr/req/data";
const TIMEOUT_MS = 30000;

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
          "accept-encoding": "identity",
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

export async function GET(request: Request) {
  const key = process.env.VWORLD_API_KEY;
  const domain = process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app";
  if (!key) {
    return NextResponse.json({ ok: false, error: "VWORLD_API_KEY_NOT_SET" }, { status: 503 });
  }

  const url = new URL(request.url);
  const bbox = url.searchParams.get("bbox") ?? "";
  const page = url.searchParams.get("page") ?? "1";
  const size = url.searchParams.get("size") ?? "1000";
  const data = url.searchParams.get("data") ?? "LP_PA_CBND_BUBUN";
  if (!bbox) {
    return NextResponse.json({ ok: false, error: "BAD_BBOX" }, { status: 400 });
  }

  const params = new URLSearchParams({
    service: "data",
    request: "GetFeature",
    format: "json",
    errorformat: "json",
    key,
    domain,
    data,
    crs: "EPSG:4326",
    size,
    page,
    geomFilter: `BOX(${bbox})`,
  });

  try {
    const upstream = await getText(
      `${ENDPOINT}?${params.toString()}`,
      TIMEOUT_MS,
      `https://${domain}/`
    );
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json(
      { ok: false, error: "VWORLD_UNREACHABLE", detail: e?.message ?? String(error) },
      { status: 502 }
    );
  }
}
