"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 서울시 정비구역 전수 데이터 로더
//   public/data/zones.geojson (서울 열린데이터광장 OA-22712 + OA-20957)
//   → 지도(ZoneMap)와 탐색기(ZoneExplorer)가 함께 쓰는 경량 목록으로 변환한다.
//
//   · 원천: 「서울시 도시계획사업 현황(서울플랜+)」 실경계 + 「의제처리구역 위치정보」
//     (두 소스 모두 EPSG:5174 → WGS84 변환·간략화. 자세한 규칙은 scripts/import-seoul-zones.py)
//   · 공식 구역명·별칭 보강: 서울시 고시·정비사업 정보몽땅·자치구 자료로 확인한 이름을
//     scripts/data/official-supplement.json 에 두고 `alias`로 함께 검색된다
//     (예: 사당동 419-1 ↔ 사당15구역).
//   · 아직 구역계가 고시되지 않은 후보지는 geometry가 null이고 center만 있다(geom: "미고시").
//     → 지도에는 폴리곤 대신 점으로 그린다. 없는 경계를 지어내지 않는다.
//   · 페이지 번들에 넣지 않고 클라이언트에서 fetch한다(2,179구역 ≈ 1.6MB → gzip 300KB대).
// ─────────────────────────────────────────────────────────────────────────────
import type { MapZoneType } from "@/lib/types";

/** 공식 확인 출처(고시·정보몽땅·자치구) */
export type ZoneSource = { label: string; url: string };

export type SeoulZone = {
  id: string;
  name: string;
  /** 공식 구역명의 다른 표기(지번·가칭 등) — 검색에 함께 걸린다 */
  alias?: string[];
  type: MapZoneType;
  kind: string; // 서울시 사업유형 소분류 (예: 재정비촉진구역)
  stage: string; // 서울시 추진단계 (예: 사업시행인가)
  gu: string; // 자치구
  area: number; // 고시 구역면적(㎡)
  featured: boolean; // 대표 구역(상세 데이터 있음)
  sourceId: string; // 서울 열린데이터광장 PRESENT_SN
  geom: "UQ120" | "UQ181" | "공고도면" | "고시도면" | "가상경계" | "미고시"; // 경계 도형 출처 (공고도면 = 구청·서울시 공고 도면, 고시도면 = 구청·서울시 고시 지형도면, 가상경계 = 추진준비 단계에서 공개된 검토 범위 지도에서 옮긴 참고 경계, 미고시 = 구역계 미고시 후보지)
  center: [number, number];
  polygon?: [number, number][]; // 미고시 후보지는 없다
  /** MultiPolygon 의 나머지 조각(외곽 링) */
  parts?: [number, number][][];
  /** 구역 안에 뚫린 구멍(홀) 링 — 있으면 그 안은 구역 밖이다 */
  holes?: [number, number][][];
  /** 신속통합기획 후보지 선정일 등 공식 일자 */
  selectedAt?: string;
  /** 경계가 없을 때 대표 지점 설명 */
  centerLabel?: string;
  /** 서울시(정보몽땅) 위치도 이미지 — 경계 미고시 구역의 공식 도면 */
  locationMap?: string;
  /** 구역 성격·경계 상태 설명 */
  note?: string;
  areaNote?: string;
  nameNote?: string;
  nameSources?: ZoneSource[];
  /** 경계를 어떤 도면에서 옮겼는지(공고도면 구역) */
  boundaryNote?: string;
  sources?: ZoneSource[];
  /**
   * 기본 지도에서 숨긴다 — 다른 구역에 포함·통합 추진되어 한 구역으로 보여야 하는 경우
   * (예: 여의대방 가로주택정비사업 → 여의대방2역세권). 데이터는 남기므로 검색·주소 판정에는 그대로 쓰인다.
   */
  hiddenByDefault?: boolean;
};

/**
 * 사업이 끝난 구역(준공·입주 완료)인지 — 지도에서는 기본으로 숨긴다.
 *   · 서울플랜+ 추진단계 '준공'(263곳) / '준공(일부)'(8곳) + 청년안심주택 '입주'(73)·'사용승인'(13) = 357곳
 *   · 사용승인·입주·입주중·사업완료는 다른 사업유형(역세권·청년안심·도시재생 등)의 종료 단계라
 *     현재 전수 레이어에는 없지만, 단계명이 바뀌어 들어와도 같은 규칙으로 숨겨지도록 함께 본다.
 */
export function isCompletedZone(z: { stage: string }): boolean {
  const s = z.stage ?? "";
  return s.startsWith("준공") || s === "사용승인" || s === "입주" || s === "입주중" || s === "사업완료";
}

export type SeoulZonesMeta = {
  source: string;
  sourceDetail: string;
  asOf: string;
  asOfDetail: string;
  count: number;
  /** 공식 명칭·신규 후보지 보강(서울시 고시·정보몽땅) 기준일 */
  supplement?: { asOf?: string; renamed?: number; added?: number; note?: string };
  /** 누락 비교리스트 ① 80곳 재검증 결과(별칭·신규 구역) */
  official80?: { asOf?: string; aliases?: number; additions?: number; points?: number; polygons?: number; note?: string };
  /** 동작·마포 추진준비 구역 20곳 반영 결과 */
  dongjakMapo?: { asOf?: string; additions?: number; polygons?: number; points?: number; aliases?: number; note?: string };
  /** 성동·용산 추진준비 구역 37곳 반영 결과 */
  seongdongYongsan?: { asOf?: string; additions?: number; polygons?: number; points?: number; aliases?: number; note?: string };
  /** 여의대방2역세권(영등포구 고시 제2026-33호 지형도면) 반영 결과 */
  yeouidaebang2?: { asOf?: string; additions?: number; polygons?: number; points?: number; aliases?: number; note?: string };
};

type RawZoneProps = Omit<SeoulZone, "center" | "polygon" | "parts"> & {
  id: string;
  center?: [number, number];
};

type RawFeature = {
  id?: string;
  properties: RawZoneProps;
  geometry: { type: string; coordinates: number[][][] | number[][][][] } | null;
};

type RawCollection = {
  type: "FeatureCollection";
  metadata: SeoulZonesMeta;
  features: RawFeature[];
};

export type SeoulZonesData = { meta: SeoulZonesMeta; zones: SeoulZone[] };

/** GeoJSON(경도,위도) → Leaflet([위도,경도]) 링 — 외곽 링과 구멍(홀) 링을 나눠 돌려준다 */
function ringsOf(g: NonNullable<RawFeature["geometry"]>): {
  outer: [number, number][][];
  holes: [number, number][][];
} {
  const polys = g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [(g.coordinates as number[][][])];
  const toRing = (ring: number[][]) => ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  const outer: [number, number][][] = [];
  const holes: [number, number][][] = [];
  for (const poly of polys) {
    const first = poly[0] ? toRing(poly[0]) : [];
    if (first.length >= 3) outer.push(first);
    for (const h of poly.slice(1)) {
      const ring = toRing(h);
      if (ring.length >= 3) holes.push(ring);
    }
  }
  return { outer, holes };
}

function bboxCenter(ring: [number, number][]): [number, number] {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

let cache: Promise<SeoulZonesData> | null = null;

/** 서울시 정비구역 전수 목록 (실패 시 빈 목록 — 지도는 대표 구역만 그린다) */
export function loadSeoulZones(): Promise<SeoulZonesData> {
  if (cache) return cache;
  cache = fetch("/data/zones.geojson")
    .then((r) => (r.ok ? (r.json() as Promise<RawCollection>) : Promise.reject(new Error(String(r.status)))))
    .then((fc) => {
      const zones: SeoulZone[] = [];
      for (const f of fc.features) {
        const { id, ...props } = f.properties;
        const zoneId = id ?? f.id ?? "";
        // 경계 미고시 후보지 — 폴리곤 없이 대표 지점만
        if (!f.geometry) {
          if (!props.center) continue;
          zones.push({ ...props, id: zoneId, center: props.center });
          continue;
        }
        const { outer, holes } = ringsOf(f.geometry);
        if (!outer.length) continue;
        zones.push({
          ...props,
          id: zoneId,
          center: bboxCenter(outer[0]),
          polygon: outer[0],
          ...(outer.length > 1 ? { parts: outer.slice(1) } : {}),
          ...(holes.length ? { holes } : {}),
        });
      }
      return { meta: fc.metadata, zones };
    })
    .catch((e) => {
      console.warn("[zones] 서울시 정비구역 데이터를 불러오지 못했습니다", e);
      cache = null;
      return {
        meta: { source: "", sourceDetail: "", asOf: "", asOfDetail: "", count: 0 },
        zones: [],
      } as SeoulZonesData;
    });
  return cache;
}
