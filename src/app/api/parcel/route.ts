import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";

/**
 * 필지(연속지적도) 경계 — 브이월드 2D 데이터 API 프록시
 *
 *   GET /api/parcel?lat=37.5141&lng=127.0322
 *
 * · 주소 검색으로 고른 지점이 **어느 필지**인지 그 지적 경계(LP_PA_CBND_BUBUN)를 돌려준다.
 *   지도는 이 도형을 파란 반투명 + 진한 파란 선으로 칠해 "지금 이 필지를 보고 있다"를 보여 준다.
 * · 인증키는 **서버에서만** 읽는다(VWORLD_API_KEY — 노후도(/api/building-age)와 같은 키).
 *   브이월드는 domain 파라미터가 인증키에 등록한 서비스 URL 과 같아야 응답한다(VWORLD_DOMAIN).
 * · 응답 좌표는 EPSG:4326 GeoJSON([경도, 위도]) → 우리 앱 규약인 **[위도, 경도]** 로 뒤집어 내려준다.
 * · 실패해도 지도의 기존 주소 핀은 그대로다 — 호출측(ZoneExplorer)은 ok:false 면 필지 강조만 건너뛴다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "https://api.vworld.kr/req/data";
/** 브이월드 응답 대기 상한(ms) */
const TIMEOUT_MS = 9000;

type Ring = [number, number][];

export type ParcelPayload = {
  ok: true;
  parcel: {
    /** 19자리 필지고유번호 */
    pnu: string | null;
    /** 지번 (예: 315-1) */
    jibun: string;
    /** 지번 주소 전체 (예: 서울특별시 성동구 성수동2가 315-1) */
    addr: string | null;
    /** 화면에 그대로 쓰는 짧은 이름 (예: 성동구 성수동2가 315-1) */
    label: string;
    /** 필지 외곽 링들 — [위도, 경도] */
    rings: Ring[];
    /** 필지 경계 상자의 가운데 [위도, 경도] — '보는중' 말풍선을 앉히는 자리 */
    center: [number, number];
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  };
};

/**
 * 브이월드는 **undici(fetch)의 HTTP/2 스트림을 거절**한다 — /api/building-age 와 같은 이유로
 * node:https(HTTP/1.1)로 직접 부르고 브라우저와 같은 헤더를 붙인다(2026-11-20 확인).
 */
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
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
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
  return NextResponse.json({ ok: false, error, ...(detail ? { detail } : {}) }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** 광선교차 — 점이 링 안인가 (링은 [경도, 위도] 순서) */
function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

/** GeoJSON Polygon/MultiPolygon → 외곽 링들([[lng,lat],...]) */
function outerRings(geometry: { type?: string; coordinates?: unknown }): number[][][] {
  const c = geometry?.coordinates as unknown;
  if (!c) return [];
  const polys = geometry?.type === "MultiPolygon" ? (c as number[][][][]) : [c as number[][][]];
  const out: number[][][] = [];
  for (const poly of polys) {
    const ring = Array.isArray(poly) ? poly[0] : null;
    if (Array.isArray(ring) && ring.length >= 3) out.push(ring as number[][]);
  }
  return out;
}

type VWorldFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  const key = process.env.VWORLD_API_KEY;
  const domain = process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app";
  if (!key) {
    return fail("VWORLD_API_KEY_NOT_SET", 503, "서버 환경변수 VWORLD_API_KEY 가 없습니다.");
  }

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail("BAD_POINT", 400, "lat·lng 가 필요합니다.");
  }
  // 대한민국 대략 범위 밖이면 브이월드를 부르지 않는다(쿼터 보호)
  if (lng < 124 || lng > 132 || lat < 33 || lat > 39.5) {
    return fail("OUT_OF_KOREA", 400, "대한민국 범위 밖의 좌표입니다.");
  }

  const query = (geomFilter: string, size: number) => {
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
      page: "1",
      geomFilter,
      key,
      domain,
    });
    // 공백은 %20 으로 — URLSearchParams 의 `+` 를 그대로 받지 않는 서버가 있다(GEOMFILTER: POINT(lng lat))
    return `${ENDPOINT}?${params.toString().replace(/\+/g, "%20")}`;
  };

  // ① 점이 속한 필지 — 브이월드는 점이 경계에 걸치면 이웃 필지까지 준다
  // ② 점 조회가 비면 3m 상자로 한 번 더(지적도에 점 판정이 빈틈인 곳이 있다)
  const attempts = [`POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`, `BOX(${(lng - 0.00003).toFixed(6)},${(lat - 0.00003).toFixed(6)},${(lng + 0.00003).toFixed(6)},${(lat + 0.00003).toFixed(6)})`];

  let features: VWorldFeature[] = [];
  for (const geomFilter of attempts) {
    let upstream: { status: number; body: string };
    try {
      upstream = await getText(query(geomFilter, 5), TIMEOUT_MS, `https://${domain}/`);
    } catch (error) {
      const e = error as { name?: string; message?: string; cause?: { code?: string } };
      const detail = [e?.name, e?.message, e?.cause?.code].filter(Boolean).join(" | ");
      return fail("VWORLD_UNREACHABLE", 502, detail || String(error));
    }
    const text = upstream.body;
    if (upstream.status < 200 || upstream.status >= 300) {
      return fail("VWORLD_HTTP_ERROR", 502, `HTTP ${upstream.status} ${text.slice(0, 300)}`);
    }
    if (!text.trimStart().startsWith("{")) {
      const code = /code="([^"]+)"/.exec(text)?.[1] ?? "VWORLD_ERROR";
      return fail(code, 502, text.slice(0, 300));
    }
    let parsed: {
      response?: {
        status?: string;
        error?: { code?: string; text?: string };
        result?: { featureCollection?: { features?: VWorldFeature[] } };
      };
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail("VWORLD_BAD_JSON", 502, text.slice(0, 200));
    }
    if (parsed.response?.status && parsed.response.status !== "OK") {
      const err = parsed.response.error;
      return fail(err?.code ?? "VWORLD_ERROR", 502, err?.text?.slice(0, 300));
    }
    features = parsed.response?.result?.featureCollection?.features ?? [];
    if (features.length > 0) break;
  }

  if (!features.length) {
    // 바다·하천처럼 지적도에 필지가 없는 자리 — 오류가 아니라 '필지 없음'이다
    return NextResponse.json({ ok: true, parcel: null }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  }

  // 점을 품은 필지 중 **가장 작은** 것 — 경계에 걸쳐 이웃 필지가 함께 와도 사용자가 찍은 필지를 고른다
  let best: { ring: number[][]; area: number; props: Record<string, unknown> } | null = null;
  for (const f of features) {
    for (const ring of outerRings(f.geometry ?? {})) {
      if (!ringContains(ring, lng, lat)) continue;
      const area = ringArea(ring);
      if (!best || area < best.area) best = { ring, area, props: (f.properties ?? {}) as Record<string, unknown> };
    }
  }
  if (!best) {
    // 점 판정이 빈틈인 자리 — 첫 필지를 그대로 쓰되 속성도 함께 가져온다
    const firstRing = outerRings(features[0].geometry ?? {})[0];
    if (firstRing && firstRing.length >= 3) {
      best = { ring: firstRing, area: ringArea(firstRing), props: (features[0].properties ?? {}) as Record<string, unknown> };
    }
  }
  if (!best) {
    return NextResponse.json({ ok: true, parcel: null }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  }
  const chosen = best;
  const props = best.props;
  const bonbun = String(props.bonbun ?? "").trim();
  const bubun = String(props.bubun ?? "").trim();
  const jibun = bonbun ? (bubun && bubun !== "0" ? `${bonbun}-${bubun}` : bonbun) : String(props.jibun ?? "").trim();
  const addr = String(props.addr ?? "").trim() || null;
  // 지도의 '보는중' 말풍선은 한 줄이라 '서울특별시 ' 를 떼고 구·동·번지로 읽히게 한다
  const label = (addr ?? jibun).replace(/^서울특별시\s+/, "").replace(/^서울\s+/, "");

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const [x, y] of chosen.ring) {
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
  }

  const payload: ParcelPayload = {
    ok: true,
    parcel: {
      pnu: props.pnu ? String(props.pnu) : null,
      jibun,
      addr,
      label,
      // [경도, 위도] → [위도, 경도], 소수 6자리(≈0.1m)
      rings: [chosen.ring.map(([x, y]) => [Number(y.toFixed(6)), Number(x.toFixed(6))] as [number, number])],
      center: [Number(((minLat + maxLat) / 2).toFixed(6)), Number(((minLng + maxLng) / 2).toFixed(6))],
      bounds: {
        minLat: Number(minLat.toFixed(6)),
        minLng: Number(minLng.toFixed(6)),
        maxLat: Number(maxLat.toFixed(6)),
        maxLng: Number(maxLng.toFixed(6)),
      },
    },
  };

  return NextResponse.json(payload, {
    // 필지 경계는 거의 바뀌지 않는다 — 좌표(소수 6자리)가 캐시 키라 오래 캐시해도 안전하다
    headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=604800" },
  });
}
