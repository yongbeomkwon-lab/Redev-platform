"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 관리자 모드 — 지도에서 직접 그린 구역(커스텀 구역)
//
//   · 대표님이 지도 위에서 직접 경계를 그리고/고쳐서 쓰는 구역이다. 서버가 없으므로
//     **이 브라우저의 localStorage** 에만 저장된다(새로고침해도 유지, 다른 기기와는 공유되지 않음).
//   · 저장된 구역은 관리자 모드에서만 지도에 그려진다 — 일반 방문자 화면은 그대로다.
//   · 내보내기(JSON 다운로드·클립보드 복사)는 `public/data/zones.geojson` 의 feature 모양과
//     `scripts/data/official-*.json` 의 좌표 순서를 함께 담아, 대표님이 그 파일을 그대로
//     넘겨주면 정식 데이터로 병합할 수 있게 한다.
//     - geometry.coordinates : GeoJSON 표준 [경도, 위도] (링은 첫 점을 끝에 반복해 닫는다)
//     - properties.ringLatLng : 우리 데이터(official-*.json·SeoulZone.polygon)와 같은 [위도, 경도]
//   · leaflet·kakao 를 임포트하지 않는 순수 모듈.
// ─────────────────────────────────────────────────────────────────────────────
import type { MapZoneType } from "@/lib/types";
import { TYPE_COLORS } from "@/components/map/colors";

/** 사업유형 — 기존 8분류 + 민간도심복합 2유형 + 기타(직접 입력 구역) */
export const CUSTOM_ZONE_TYPES = [
  "신통기획",
  "모아타운",
  "일반재개발",
  "도공복",
  "민간도심복합(성장거점형)",
  "민간도심복합(주거중심형)",
  "가로주택",
  "역세권",
  "장기전세",
  "기타",
] as const;
export type CustomZoneType = MapZoneType | "기타";

/**
 * 사업유형 → 서울시 사업유형 소분류(kind).
 *   내보낸 GeoJSON 의 kind 가 '관리자 직접 입력'으로 뭉개져 유형이 사라지는 걸 막는다
 *   (민간도심복합처럼 유형 이름에 소분류가 들어 있는 사업만 지정).
 */
export const CUSTOM_TYPE_KIND: Partial<Record<CustomZoneType, string>> = {
  "민간도심복합(성장거점형)": "민간도심복합개발(성장거점형)",
  "민간도심복합(주거중심형)": "민간도심복합개발(주거중심형)",
};

/** 추진단계 — 서울시 데이터(서울플랜+)의 단계 이름 + 추진준비(구역지정 전) */
export const CUSTOM_ZONE_STAGES = [
  "추진준비",
  "구역지정",
  "추진위원회",
  "사업시행인가",
  "관리처분",
  "이주·철거",
  "착공",
  "준공",
] as const;
export type CustomZoneStage = (typeof CUSTOM_ZONE_STAGES)[number];

/** 자치구 — 입력 보조(직접 입력도 허용) */
export const SEOUL_GU = [
  "종로구",
  "중구",
  "용산구",
  "성동구",
  "광진구",
  "동대문구",
  "중랑구",
  "성북구",
  "강북구",
  "도봉구",
  "노원구",
  "은평구",
  "서대문구",
  "마포구",
  "양천구",
  "강서구",
  "구로구",
  "금천구",
  "영등포구",
  "동작구",
  "관악구",
  "서초구",
  "강남구",
  "송파구",
  "강동구",
] as const;

/** 지도에 그린 구역 한 건 */
export type CustomZone = {
  id: string;
  name: string;
  type: CustomZoneType;
  stage: CustomZoneStage | string;
  gu: string;
  note: string;
  /** 외곽 링 — [위도, 경도] (첫 점을 끝에 반복하지 않는다) */
  ring: [number, number][];
  /** 그린 도형의 면적(㎡) — 구면 근사 계산 */
  areaSqm: number;
  /**
   * 서울시 고시 구역의 경계를 고쳐서 만든 경우, 그 구역의 id.
   * 병합할 때 이 구역의 도형을 대체해야 한다는 표시다.
   */
  replacesZoneId?: string;
  replacesName?: string;
  /** 고시·공고 면적(참고) — 내가 그린 면적과 비교해 보여준다 */
  replacesArea?: number;
  createdAt: string;
  updatedAt: string;
};

export const ADMIN_STORAGE_KEY = "redev.admin";
export const CUSTOM_ZONES_STORAGE_KEY = "redev.customZones.v1";

const isFinitePair = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length === 2 &&
  Number.isFinite(p[0] as number) &&
  Number.isFinite(p[1] as number) &&
  Math.abs(p[0] as number) <= 90 &&
  Math.abs(p[1] as number) <= 180;

/** 저장된 JSON → CustomZone[] (깨진 항목은 버린다 — 예전 형식이 섞여도 화면이 죽지 않게) */
export function parseCustomZones(raw: string | null): CustomZone[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: CustomZone[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const z = item as Partial<CustomZone>;
      if (typeof z.id !== "string" || typeof z.name !== "string") continue;
      if (!Array.isArray(z.ring)) continue;
      const ring = z.ring.filter(isFinitePair);
      if (ring.length < 3) continue;
      out.push({
        id: z.id,
        name: z.name,
        type: (CUSTOM_ZONE_TYPES as readonly string[]).includes(z.type as string)
          ? (z.type as CustomZoneType)
          : "기타",
        stage: typeof z.stage === "string" && z.stage ? z.stage : "추진준비",
        gu: typeof z.gu === "string" ? z.gu : "",
        note: typeof z.note === "string" ? z.note : "",
        ring,
        areaSqm:
          Number.isFinite(z.areaSqm) && (z.areaSqm as number) > 0
            ? (z.areaSqm as number)
            : ringAreaSqm(ring),
        ...(typeof z.replacesZoneId === "string" ? { replacesZoneId: z.replacesZoneId } : {}),
        ...(typeof z.replacesName === "string" ? { replacesName: z.replacesName } : {}),
        ...(Number.isFinite(z.replacesArea) ? { replacesArea: z.replacesArea as number } : {}),
        createdAt: typeof z.createdAt === "string" ? z.createdAt : new Date().toISOString(),
        updatedAt: typeof z.updatedAt === "string" ? z.updatedAt : new Date().toISOString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function loadCustomZones(): CustomZone[] {
  if (typeof window === "undefined") return [];
  try {
    return parseCustomZones(window.localStorage.getItem(CUSTOM_ZONES_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** localStorage 에 저장 — 실패(용량·사생활 모드)해도 화면은 살아 있게 결과만 돌려준다 */
export function saveCustomZones(list: CustomZone[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CUSTOM_ZONES_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newCustomZoneId(): string {
  return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── 면적 계산 ───────────────────────────────────────────────────────────────
//  구면 다각형 면적(구면 초과). 서울 정도의 크기(수십만 ㎡)에서 고시면적과 1% 안쪽으로 맞는다.
const EARTH_R = 6378137;
export const SQM_PER_PYEONG = 3.305785;

export function ringAreaSqm(ring: [number, number][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % n];
    // 경도 차는 -180~180 으로 정규화(날짜변경선을 넘는 경우 대비)
    let dLng = lng2 - lng1;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    sum += dLng * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * EARTH_R * EARTH_R) / 2);
}

/** ㎡ → 평 */
export function toPyeong(sqm: number): number {
  return sqm / SQM_PER_PYEONG;
}

/** "84,714㎡ · 25,623평" — 지도·패널 공용 표기 */
export function formatArea(sqm: number): string {
  const m2 = Math.round(sqm).toLocaleString();
  const py = Math.round(toPyeong(sqm)).toLocaleString();
  return `${m2}㎡ · ${py}평`;
}

/** 링의 무게중심(면적 가중) — 라벨·이름표 위치. 계산이 안 되면 꼭짓점 평균 */
export function ringCentroid(ring: [number, number][]): [number, number] {
  const n = ring.length;
  if (!n) return [0, 0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const avgLat = ring.reduce((s, p) => s + p[0], 0) / n;
    const avgLng = ring.reduce((s, p) => s + p[1], 0) / n;
    return [avgLat, avgLng];
  }
  const k = 1 / (3 * a);
  return [cy * k, cx * k];
}

/** 링 경계 상자 — [[남서], [북동]] */
export function ringBounds(ring: [number, number][]): [[number, number], [number, number]] {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

/** 광선 교차 — 링 안이면 true (지도 클릭으로 그린 구역 고르기) */
export function ringContainsLatLng(ring: [number, number][], lat: number, lng: number): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 사업유형 색 — 기타는 회색 */
export function customZoneColor(type: CustomZoneType): string {
  return (TYPE_COLORS as Record<string, string>)[type] ?? "#475569";
}

// ─── 내보내기 ────────────────────────────────────────────────────────────────
type ExportFeature = {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

const closeRing = (ring: [number, number][]) => {
  const coords = ring.map(([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return coords;
};

/**
 * 관리자 구역 → 병합용 GeoJSON.
 *   properties 는 zones.geojson 의 feature properties 와 같은 이름(id·name·type·kind·stage·gu·area·
 *   featured·sourceId·geom)을 쓰고, 그와 함께 official-*.json 과 같은 [위도, 경도] 링을 담는다.
 */
export function customZonesToGeoJSON(list: CustomZone[]): string {
  const features: ExportFeature[] = list.map((z) => ({
    type: "Feature",
    id: z.id,
    properties: {
      id: z.id,
      name: z.name,
      type: z.type,
      kind: z.replacesZoneId ? "관리자 경계 보정" : (CUSTOM_TYPE_KIND[z.type] ?? "관리자 직접 입력"),
      stage: z.stage,
      gu: z.gu,
      area: Math.round(z.areaSqm),
      featured: false,
      sourceId: z.id,
      geom: "가상경계",
      note: z.note,
      ...(z.replacesZoneId ? { replacesZoneId: z.replacesZoneId } : {}),
      ...(z.replacesName ? { replacesName: z.replacesName } : {}),
      ringLatLng: z.ring.map(([lat, lng]) => [Number(lat.toFixed(7)), Number(lng.toFixed(7))]),
      createdAt: z.createdAt,
      updatedAt: z.updatedAt,
    },
    geometry: { type: "Polygon", coordinates: [closeRing(z.ring)] },
  }));

  return JSON.stringify(
    {
      type: "FeatureCollection",
      metadata: {
        source: "리디브 관리자 모드 — 지도에서 직접 그린 구역",
        exportedAt: new Date().toISOString(),
        count: features.length,
        coordinateOrder:
          "geometry.coordinates 는 GeoJSON 표준 [경도, 위도] · properties.ringLatLng 는 scripts/data/official-*.json 과 같은 [위도, 경도]",
        mergeNote:
          "public/data/zones.geojson 의 features 배열에 그대로 이어 붙이면 지도에 반영됩니다. replacesZoneId 가 있는 항목은 같은 sourceId 의 공식 도형을 이 도형으로 바꿔 주세요.",
      },
      features,
    },
    null,
    2
  );
}

/** 내려받기 파일 이름 — custom-zones-YYYYMMDD-HHMM.json */
export function exportFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `custom-zones-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
