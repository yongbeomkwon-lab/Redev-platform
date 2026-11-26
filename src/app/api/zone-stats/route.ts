import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { approveYear } from "@/lib/building-age";
import { yearResolverFor } from "@/lib/building-age-index";
import { bboxOf, type ZoneShape } from "@/lib/zone-geo";
import {
  computeZoneStats,
  type ZoneShapeInput,
  type ZoneStatBuilding,
  type ZoneStatParcel,
  type ZoneStatsResponse,
} from "@/lib/zone-stats";
import {
  fetchBuildingFeatures,
  fetchParcelFeatures,
  type Bbox,
  type VWorldFeature,
} from "@/lib/building-age-server";

/**
 * 구역현황(추정) — POST /api/zone-stats
 *
 *   body: { shape: { polygon: [[lat,lng],…], parts?, holes? }, areaSqm?: number }
 *
 * · 구역 폴리곤(정식 등록 구역·직접 그린 구역 모두)을 받아, 그 안의 **건축물 연식**과
 *   **필지 면적**으로 노후도(30·20년)·건축물 동수·동수밀도·과소필지율을 계산한다.
 * · 원자료는 브이월드 두 레이어 — GIS건물통합정보(dt_d010) + 연속지적도(LP_PA_CBND_BUBUN).
 *   건물 연도는 `public/data/age-index`(건축물대장 표제부 색인)로 보정한다(/api/building-age 와 같다).
 * · 좌표를 body 로 받는 이유: 구역 링이 600점까지라 GET URL 로는 길이 제한에 걸린다.
 * · 같은 구역을 다시 열면 브이월드를 다시 부르지 않도록 함수 인스턴스 안에서 12시간 캐시한다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 브이월드 왕복이 2~3초 걸리고 조밀 구역은 타일을 쪼개 부른다 — 기본 10초로는 모자라다 */
export const maxDuration = 60;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; payload: ZoneStatsResponse }>();

/** 구역 bbox 한 변 상한(도) — 0.03° ≈ 3.3km. 이보다 큰 요청은 구역이 아니다(쿼터 보호) */
const MAX_SPAN_DEG = 0.03;

function fail(error: string, status: number, detail?: string) {
  const payload: ZoneStatsResponse = detail ? { ok: false, error, detail } : { ok: false, error };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

/** GeoJSON Polygon·MultiPolygon → 외곽 링 평면 배열([lng,lat,…]). 구멍은 버린다 */
function outerFlatRings(geometry: VWorldFeature["geometry"]): number[][] {
  if (!geometry?.coordinates) return [];
  const c = geometry.coordinates as unknown;
  const polygons: unknown[] =
    geometry.type === "Polygon" ? [c] : geometry.type === "MultiPolygon" ? (c as unknown[]) : [];
  const out: number[][] = [];
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    const ring = poly[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const flat: number[] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      flat.push(Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6);
    }
    if (flat.length >= 6) out.push(flat);
  }
  return out;
}

/** 건물 한 동의 중복 판정 키 — 같은 필지(pnu)에 여러 동이 있어 도형 앞부분까지 함께 쓴다 */
function buildingKey(pnu: unknown, rings: number[][]): string {
  const head = rings[0]?.slice(0, 6).join(",") ?? "";
  return `${typeof pnu === "string" ? pnu : ""}|${head}`;
}

/** 타일 경계에 걸친 건물은 두 타일에서 모두 온다 — 같은 도형이면 한 번만 센다 */
function dedupe(features: VWorldFeature[], keyOf: (f: VWorldFeature, rings: number[][]) => string) {
  const seen = new Set<string>();
  const out: { f: VWorldFeature; rings: number[][] }[] = [];
  for (const f of features) {
    const rings = outerFlatRings(f.geometry);
    if (!rings.length) continue;
    const key = keyOf(f, rings);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ f, rings });
  }
  return out;
}

/** 링([lng,lat,…] 평면 배열)의 면적(㎡) — 연속지적도 필지 크기용(위도 보정 평면 근사) */
function parcelAreaSqm(flat: number[]): number {
  if (!Array.isArray(flat) || flat.length < 6) return 0;
  let latSum = 0;
  let n = 0;
  for (let i = 1; i < flat.length; i += 2) {
    latSum += flat[i];
    n++;
  }
  if (n === 0) return 0;
  const lat0 = latSum / n;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  let a = 0;
  const pts = Math.floor(flat.length / 2);
  for (let i = 0, j = pts - 1; i < pts; j = i++) {
    const xi = flat[i * 2] * kx;
    const yi = flat[i * 2 + 1] * ky;
    const xj = flat[j * 2] * kx;
    const yj = flat[j * 2 + 1] * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a / 2);
}

function parcelCenter(flat: number[]): [number, number] {
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    lng += flat[i];
    lat += flat[i + 1];
    n++;
  }
  return n > 0 ? [lat / n, lng / n] : [0, 0];
}

type Body = { shape?: ZoneShapeInput; areaSqm?: number | null };

export async function POST(request: Request) {
  let body: Body | null = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("BAD_JSON", 400, "shape 를 담은 JSON 본문이 필요합니다.");
  }
  const shape = body?.shape;
  if (!shape || !shape.polygon || shape.polygon.length < 3) {
    return fail("NO_SHAPE", 400, "polygon(구역 경계)이 필요합니다 — 경계가 없는 후보지는 계산할 수 없습니다.");
  }
  // 좌표 검증 — [위도, 경도] 순서, 대한민국 범위
  const rings = [shape.polygon, ...(shape.parts ?? []), ...(shape.holes ?? [])];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) return fail("BAD_SHAPE", 400, "경계 링이 3점 이상이어야 합니다.");
    for (const [lat, lng] of ring) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < 124 || lng > 132 || lat < 33 || lat > 39.5) {
        return fail("BAD_SHAPE", 400, "경계 좌표가 대한민국 범위를 벗어났습니다.");
      }
    }
  }

  const bb = bboxOf(shape as ZoneShape);
  if (!bb) return fail("BAD_SHAPE", 400, "경계 상자를 계산할 수 없습니다.");
  if (bb.maxLng - bb.minLng > MAX_SPAN_DEG || bb.maxLat - bb.minLat > MAX_SPAN_DEG) {
    return fail("ZONE_TOO_LARGE", 400, "구역이 너무 넓습니다(한 변 3km 초과) — 동 단위로 나눠 확인해 주세요.");
  }
  const bbox: Bbox = { minLng: bb.minLng, minLat: bb.minLat, maxLng: bb.maxLng, maxLat: bb.maxLat };

  const areaGiven =
    typeof body?.areaSqm === "number" && Number.isFinite(body.areaSqm) && (body.areaSqm as number) > 0
      ? Math.round(body.areaSqm as number)
      : null;

  const cacheKey = createHash("sha1")
    .update(
      JSON.stringify({
        r: rings.map((ring) => ring.map(([lat, lng]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))])),
        area: areaGiven,
      })
    )
    .digest("hex");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { "Cache-Control": "no-store", "X-Zone-Stats": "hit" } });
  }

  if (!process.env.VWORLD_API_KEY) {
    return fail("VWORLD_API_KEY_NOT_SET", 503, "서버 환경변수 VWORLD_API_KEY 가 없습니다.");
  }

  // 건물(노후도·동수)과 필지(과소필지)를 함께 부른다. 필지는 실패해도 건물 지표는 낸다.
  const [buildingResult, parcelResult] = await Promise.all([
    fetchBuildingFeatures(bbox).catch((e) => ({ error: String((e as Error)?.message ?? e) })),
    fetchParcelFeatures(bbox).catch((e) => ({ error: String((e as Error)?.message ?? e) })),
  ]);

  if ("error" in buildingResult) {
    const message = String(buildingResult.error ?? "");
    if (message.includes("VWORLD_API_KEY_NOT_SET")) return fail("VWORLD_API_KEY_NOT_SET", 503, message);
    return fail("VWORLD_UNREACHABLE", 502, message.slice(0, 300));
  }

  const uniqueBuildings = dedupe(buildingResult.features, (f, r) => buildingKey(f.properties?.pnu, r));
  const resolver = await yearResolverFor(buildingResult.features);
  let patched = 0;
  const statBuildings: ZoneStatBuilding[] = uniqueBuildings.map(({ f, rings }) => {
    const props = f.properties ?? {};
    const base = approveYear(props.use_confm_de);
    const year = resolver(props.pnu, props.totar, base);
    if (base != null && year != null && year !== base) patched++;
    const areaRaw = props.totar;
    const areaNum = typeof areaRaw === "number" ? areaRaw : Number(areaRaw);
    return {
      year,
      areaSqm: Number.isFinite(areaNum) && areaNum > 0 ? areaNum : null,
      rings,
    };
  });

  let parcels: ZoneStatParcel[] | null = null;
  if (!("error" in parcelResult)) {
    const uniqueParcels = dedupe(parcelResult.features, (f, r) => {
      const pnu = f.properties?.pnu;
      if (typeof pnu === "string" && pnu) return pnu;
      return r[0]?.slice(0, 4).join(",") ?? "";
    });
    parcels = uniqueParcels.map(({ rings }) => {
      const [lat, lng] = parcelCenter(rings[0]);
      return { areaSqm: parcelAreaSqm(rings[0]), lat, lng };
    });
  }

  const stats = computeZoneStats({ shape, areaSqm: areaGiven, buildings: statBuildings, parcels });

  const payload: ZoneStatsResponse = {
    ok: true,
    stats,
    meta: {
      asOf: new Date().toISOString().slice(0, 10),
      requests: buildingResult.requests + ("error" in parcelResult ? 0 : parcelResult.requests),
      truncated: buildingResult.truncated || (!("error" in parcelResult) && parcelResult.truncated),
      patched,
    },
  };

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(cacheKey, { at: Date.now(), payload });

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store", "X-Zone-Stats": "miss" } });
}
