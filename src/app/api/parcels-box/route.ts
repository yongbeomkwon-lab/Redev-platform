import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";

/**
 * 필지(연속지적도) 상자 조회 — 브이월드 2D 데이터 API 프록시 (대량 조회용)
 *
 *   GET /api/parcels-box?minlat=..&minlng=..&maxlat=..&maxlng=..&page=1&size=1000
 *
 * · 구역 경계를 필지 합집합으로 작도할 때 쓰는 작업용 엔드포인트다. 화면에서는 쓰지 않는다.
 * · 브이월드는 해외 IP를 막는다(서울 밖 리눅스 셸에서 연결 거부). Vercel 함수는 서울(icn1)에서
 *   돌아 VWorld 에 닿으므로, 셸 스크립트는 이 엔드포인트로 필지를 받아 간다.
 * · 응답 좌표는 **[위도, 경도]** 로 뒤집어 내려준다(우리 앱 규약).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINT = "https://api.vworld.kr/req/data";
const TIMEOUT_MS = 25000;

type Ring = [number, number][];

function getText(url: string, timeoutMs: number, referer: string): Promise<{ status: number; body: string }> {
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
          timeout: timeoutMs,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

function outerRings(geometry: unknown): Ring[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !g.type) return [];
  const out: Ring[] = [];
  const conv = (ring: unknown): Ring =>
    (ring as number[][]).map((p) => [p[1], p[0]] as [number, number]);
  if (g.type === "Polygon") {
    const rings = g.coordinates as number[][][];
    if (rings?.[0]) out.push(conv(rings[0]));
  } else if (g.type === "MultiPolygon") {
    const polys = g.coordinates as number[][][][];
    for (const poly of polys) if (poly?.[0]) out.push(conv(poly[0]));
  }
  return out;
}

export async function GET(req: Request) {
  const key = process.env.VWORLD_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "VWORLD_API_KEY_NOT_SET" }, { status: 500 });
  const domain = process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app";

  const u = new URL(req.url);
  const num = (k: string) => {
    const v = Number(u.searchParams.get(k));
    return Number.isFinite(v) ? v : NaN;
  };
  const minlat = num("minlat");
  const minlng = num("minlng");
  const maxlat = num("maxlat");
  const maxlng = num("maxlng");
  if ([minlat, minlng, maxlat, maxlng].some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ ok: false, error: "BAD_BBOX" }, { status: 400 });
  }
  const page = Math.max(1, Math.min(20, Number(u.searchParams.get("page") ?? 1) || 1));
  const size = Math.max(1, Math.min(1000, Number(u.searchParams.get("size") ?? 1000) || 1000));

  const params = new URLSearchParams({
    service: "data",
    version: "2.0",
    request: "GetFeature",
    data: "LP_PA_CBND_BUBUN",
    format: "json",
    errorformat: "json",
    geometry: "true",
    attribute: "true",
    crs: "EPSG:4326",
    size: String(size),
    page: String(page),
    geomFilter: `BOX(${[minlng, minlat, maxlng, maxlat].map((v) => v.toFixed(6)).join(",")})`,
    key,
    domain,
  });
  const url = `${ENDPOINT}?${params.toString().replace(/\+/g, "%20")}`;

  let body: string;
  try {
    const res = await getText(url, TIMEOUT_MS, `https://${domain}/`);
    body = res.body;
  } catch (e) {
    return NextResponse.json({ ok: false, error: "VWORLD_UNREACHABLE", detail: String(e) }, { status: 502 });
  }
  if (!body.trim().startsWith("{")) {
    return NextResponse.json({ ok: false, error: "VWORLD_NOT_JSON", detail: body.slice(0, 200) }, { status: 502 });
  }
  let parsed: {
    response?: {
      status?: string;
      error?: { code?: string; text?: string };
      record?: { total?: string | number; current?: string | number };
      result?: { featureCollection?: { features?: unknown[] } };
    };
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "VWORLD_BAD_JSON" }, { status: 502 });
  }
  const resp = parsed.response ?? {};
  if (resp.status && resp.status !== "OK") {
    return NextResponse.json(
      { ok: false, error: [resp.error?.code, resp.error?.text].filter(Boolean).join(": ") || "VWORLD_ERROR" },
      { status: 502 }
    );
  }
  const feats = (resp.result?.featureCollection?.features ?? []) as {
    geometry?: unknown;
    properties?: Record<string, unknown> | null;
  }[];

  const parcels = feats
    .map((f) => {
      const p = f.properties ?? {};
      const rings = outerRings(f.geometry);
      if (!rings.length) return null;
      return {
        jibun: String(p.jibun ?? "").trim(),
        pnu: String(p.pnu ?? "").trim(),
        addr: String(p.addr ?? "").trim(),
        jimok: String(p.jimok ?? "").trim(),
        rings,
      };
    })
    .filter(Boolean);

  return NextResponse.json(
    {
      ok: true,
      total: Number(resp.record?.total ?? 0),
      page,
      size,
      count: parcels.length,
      parcels,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
