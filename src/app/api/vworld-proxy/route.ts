import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";

/**
 * (임시) 브이월드 오픈API 프록시 — 삼전동·석촌고분 일대 구역계 정합 작업용.
 *
 *   GET /api/vworld-proxy?service=address&...   → https://api.vworld.kr/req/address?... (지번→좌표)
 *   GET /api/vworld-proxy?service=data&...      → https://api.vworld.kr/req/data?...     (연속지적도 필지)
 *
 * · 작업 환경(해외 IP)에서는 브이월드가 502로 막아, 서울 리전(icn1)에서 도는 이 라우트를 잠깐 쓴다.
 * · 인증키는 서버 환경변수(VWORLD_API_KEY)에서만 읽고 브라우저로 내보내지 않는다.
 * · 작업이 끝나면 이 파일을 지운다(push 전).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINT = "https://api.vworld.kr/req";
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

  const incoming = new URL(request.url);
  const service = incoming.searchParams.get("service") ?? "data";
  if (!["data", "address", "search"].includes(service)) {
    return NextResponse.json({ ok: false, error: "BAD_SERVICE" }, { status: 400 });
  }

  const params = new URLSearchParams();
  incoming.searchParams.forEach((value, name) => {
    if (name === "key" || name === "domain") return;
    params.set(name, value);
  });
  params.set("service", service);
  params.set("key", key);
  params.set("domain", domain);
  if (!params.has("format")) params.set("format", "json");
  if (!params.has("errorformat")) params.set("errorformat", "json");

  try {
    const upstream = await getText(
      `${ENDPOINT}/${service}?${params.toString()}`,
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
