// ─────────────────────────────────────────────────────────────────────────────
// 브이월드 호출(서버 전용) — 구역현황 계산용 원자료
//
//   · `/api/zone-stats` 한 곳에서만 쓴다. 인증키는 서버 환경변수(VWORLD_API_KEY)로만 읽고
//     브라우저에는 절대 내려보내지 않는다.
//   · 브이월드는 **undici(fetch)의 HTTP/2 스트림을 거절**한다(/api/building-age 와 같은 이유,
//     2026-11-20 확인). 그래서 node:https(HTTP/1.1)로 직접 부르고 브라우저와 같은 헤더를 붙인다.
//   · 건물(GIS건물통합정보 dt_d010)은 한 요청에 1,000동까지만 준다. 구역이 조밀해 상한에
//     걸리면 그 타일을 4분할해 다시 부르고(깊이 2까지), 그래도 모자라면 truncated 로 알린다.
//   · 필지(연속지적도 LP_PA_CBND_BUBUN)는 2D 데이터 API 로 페이지(1,000건)씩 받는다.
// ─────────────────────────────────────────────────────────────────────────────

import { request as httpsRequest } from "node:https";
import { AGE_WFS_MAX_FEATURES } from "./building-age";

const WFS_ENDPOINT = "https://api.vworld.kr/ned/wfs/getBldgisSpceWFS";
const DATA_ENDPOINT = "https://api.vworld.kr/req/data";

/** 브이월드 응답 대기 상한(ms) — 느릴 때 라우트가 매달리지 않게 */
const TIMEOUT_MS = 9000;

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export type VWorldFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

export function vworldGetText(
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

function vworldEnv(): { key: string; domain: string } | null {
  const key = process.env.VWORLD_API_KEY;
  if (!key) return null;
  return { key, domain: process.env.VWORLD_DOMAIN ?? "redev-platform-iota.vercel.app" };
}

/** 오류 응답(HTTP·XML·JSON error)을 사람이 읽을 문자열로 */
function explain(status: number, text: string): string {
  if (status < 200 || status >= 300) return `HTTP ${status} ${text.slice(0, 200)}`;
  if (!text.trimStart().startsWith("{")) {
    const code = /code="([^"]+)"/.exec(text)?.[1] ?? "VWORLD_ERROR";
    const message = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(text)?.[1]?.trim();
    return message ? `${code}: ${message.slice(0, 200)}` : text.slice(0, 200);
  }
  return "";
}

async function fetchBuildingTile(bbox: Bbox, key: string, domain: string): Promise<VWorldFeature[]> {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    REQUEST: "GetFeature",
    VERSION: "1.1.0",
    TYPENAME: "dt_d010",
    BBOX: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].map((v) => v.toFixed(6)).join(","),
    SRSNAME: "EPSG:4326",
    OUTPUT: "application/json",
    MAXFEATURES: String(AGE_WFS_MAX_FEATURES),
    key,
    domain,
  });
  const { status, body } = await vworldGetText(
    `${WFS_ENDPOINT}?${params.toString()}`,
    TIMEOUT_MS,
    `https://${domain}/`
  );
  const error = explain(status, body);
  if (error) throw new Error(error);
  let parsed: { features?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("VWORLD_BAD_JSON");
  }
  return Array.isArray(parsed.features) ? (parsed.features as VWorldFeature[]) : [];
}

/**
 * 구역 bbox 안의 건물 피처를 모은다.
 *   · 1,000동 상한에 걸린 타일은 4분할(최대 깊이 2)해서 다시 부른다.
 *   · 요청 수 상한(maxRequests)을 넘기면 truncated=true — 일부 건물이 빠진 채로 계산된다.
 */
export async function fetchBuildingFeatures(
  bbox: Bbox,
  opts: { maxRequests?: number } = {}
): Promise<{ features: VWorldFeature[]; requests: number; truncated: boolean; errors: string[] }> {
  const env = vworldEnv();
  if (!env) throw new Error("VWORLD_API_KEY_NOT_SET");
  const maxRequests = opts.maxRequests ?? 13;

  const queue: { b: Bbox; d: number }[] = [{ b: bbox, d: 0 }];
  const features: VWorldFeature[] = [];
  const errors: string[] = [];
  let requests = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (requests >= maxRequests) {
      truncated = true;
      break;
    }
    const item = queue.shift()!;
    requests++;
    let got: VWorldFeature[];
    try {
      got = await fetchBuildingTile(item.b, env.key, env.domain);
    } catch (e) {
      // 한 타일 실패 — 나머지는 계속 모으되, 이 타일 몫이 빠졌음을 truncated 로 남긴다
      errors.push(String((e as Error)?.message ?? e).slice(0, 200));
      truncated = true;
      continue;
    }
    if (got.length >= AGE_WFS_MAX_FEATURES) {
      // 상한에 걸렸다 — 조밀한 구역은 4분할해야 빠짐없이 센다(깊이 2까지)
      if (item.d >= 2) {
        truncated = true;
        features.push(...got);
        continue;
      }
      const midLng = (item.b.minLng + item.b.maxLng) / 2;
      const midLat = (item.b.minLat + item.b.maxLat) / 2;
      queue.push(
        { b: { minLng: item.b.minLng, minLat: item.b.minLat, maxLng: midLng, maxLat: midLat }, d: item.d + 1 },
        { b: { minLng: midLng, minLat: item.b.minLat, maxLng: item.b.maxLng, maxLat: midLat }, d: item.d + 1 },
        { b: { minLng: item.b.minLng, minLat: midLat, maxLng: midLng, maxLat: item.b.maxLat }, d: item.d + 1 },
        { b: { minLng: midLng, minLat: midLat, maxLng: item.b.maxLng, maxLat: item.b.maxLat }, d: item.d + 1 }
      );
      continue;
    }
    features.push(...got);
  }

  return { features, requests, truncated, errors };
}

/** 연속지적도 필지 피처 — 2D 데이터 API(페이지 1,000건) */
export async function fetchParcelFeatures(
  bbox: Bbox,
  opts: { maxPages?: number } = {}
): Promise<{ features: VWorldFeature[]; requests: number; truncated: boolean }> {
  const env = vworldEnv();
  if (!env) throw new Error("VWORLD_API_KEY_NOT_SET");
  const maxPages = opts.maxPages ?? 3;
  const size = 1000;
  const features: VWorldFeature[] = [];
  let requests = 0;
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    requests++;
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
      geomFilter: `BOX(${[bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
        .map((v) => v.toFixed(6))
        .join(",")})`,
      key: env.key,
      domain: env.domain,
    });
    // 공백은 %20 으로 — URLSearchParams 의 `+` 를 그대로 받지 않는 서버가 있다(GEOMFILTER)
    const url = `${DATA_ENDPOINT}?${params.toString().replace(/\+/g, "%20")}`;
    const { status, body } = await vworldGetText(url, TIMEOUT_MS, `https://${env.domain}/`);
    const error = explain(status, body);
    if (error) throw new Error(error);
    let parsed: {
      response?: {
        status?: string;
        error?: { code?: string; text?: string };
        result?: { featureCollection?: { features?: VWorldFeature[] } };
      };
    };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("VWORLD_BAD_JSON");
    }
    if (parsed.response?.status && parsed.response.status !== "OK") {
      throw new Error(
        [parsed.response.error?.code, parsed.response.error?.text].filter(Boolean).join(": ") || "VWORLD_ERROR"
      );
    }
    const got = parsed.response?.result?.featureCollection?.features ?? [];
    features.push(...got);
    if (got.length < size) break;
    if (page === maxPages) truncated = true;
  }

  return { features, requests, truncated };
}
