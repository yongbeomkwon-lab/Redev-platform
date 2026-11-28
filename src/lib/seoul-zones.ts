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
import type { MapZoneType, ZoneDivider } from "@/lib/types";

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
  geom: "UQ120" | "UQ120보정" | "UQ181" | "공고도면" | "고시도면" | "추진위안내도" | "가상경계" | "참고도" | "필지정합" | "직접작도" | "근사원" | "고시미반영" | "미고시"; // 경계 도형 출처 (UQ120보정 = UQ120 일반화 도형을 인접 구역 경계에 맞춰 보정, 공고도면 = 구청·서울시 공고 도면, 고시도면 = 구청·서울시 고시 지형도면, 추진위안내도 = 추진위·신탁사 사업설명회 상세구역도(지적편집도 위 구역계), 가상경계 = 추진준비 단계에서 공개된 검토 범위 지도에서 옮긴 참고 경계, 참고도 = 공식 공고 전 검토용 참고도(사진·도면)에서 옮긴 경계, 필지정합 = 공고·추정 경계를 연속지적도 필지 단위로 다시 조립해 필지선에 맞춘 경계(2026-11-23 양재2동 2구역·양재동 397-1), 직접작도 = 고시·공고 도면을 참고해 리디브 지도에서 직접 그린 경계(정밀 측량값 아님 — 2026-11-24 양재동 374·382·397-1), 근사원 = 대표 지번 중심에 면적을 원으로 환산한 위치 참고용 점선원, 미고시 = 구역계 미고시 후보지, 고시미반영 = 정비구역 지정 고시는 났지만 고시 도면 경계를 반영하지 못한 구역)
  /**
   * 지도 뱃지에 사업유형 대신 띄울 말 — 사업 방식이 확정되기 전일 때 쓴다.
   *   · 예: 방배동 467-19는 신속통합기획인지 모아타운인지 정해지지 않아 '신통모아미정'으로 표시하고,
   *     색은 11색 팔레트에서 빼 둔 중립 슬레이트를 쓴다(범례·필터는 type 그대로 유지).
   */
  badgeType?: string;
  center: [number, number];
  polygon?: [number, number][]; // 미고시 후보지는 없다
  /** MultiPolygon 의 나머지 조각(외곽 링) */
  parts?: [number, number][][];
  /** 구역 안에 뚫린 구멍(홀) 링 — 있으면 그 안은 구역 밖이다 */
  holes?: [number, number][][];
  /** 구역 안을 나누는 점선(사업예정구역 1·2 등) — 도면 표기를 지도에 그대로 옮긴 것 */
  dividers?: ZoneDivider[];
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
  /**
   * 위치만 알려 주는 근사 경계 — 대표 지번 중심에 면적을 원으로 환산한 점선원(geom="근사원").
   * 실제 사업 구역계가 아니므로 지도에서는 점선으로 옅게 긋고, 상세창에서도 그 사실을 밝힌다.
   */
  boundaryApprox?: boolean;
  sources?: ZoneSource[];
  /**
   * 기본 지도에서 숨긴다 — 다른 구역에 포함·통합 추진되어 한 구역으로 보여야 하는 경우
   * (예: 여의대방 가로주택정비사업 → 여의대방2역세권). 데이터는 남기므로 검색·주소 판정에는 그대로 쓰인다.
   */
  hiddenByDefault?: boolean;
  /**
   * 관리자 화면(?admin=1)에서 경계·정보를 고쳐 저장한 구역 — 서울시 원본 위에 관리자 저장본을 얹었다.
   * (lib/zone-overrides.ts) 상세 패널이 ‘관리자 보정’ 표시를 띄우는 데 쓴다.
   */
  adminEdited?: boolean;
  /**
   * 토지등소유자 동의율(%) — 사업 추진을 가르는 핵심 수치라 모든 구역 상세에 한 줄로 붙는다.
   *   · 값이 없으면 화면은 '미공개'로 보여 준다(0%와 다른 상태다 — 없는 값을 지어내지 않는다).
   *   · 기준일은 "YYYY-MM-DD" 또는 월까지만 아는 경우 "YYYY-MM".
   *   · 비고에는 진행 경과·출처(예: 11/10 약 56% → 11/25 60% 도달)를 적는다.
   */
  consentRate?: number | null;
  consentDate?: string;
  consentNote?: string;
  /** 토지등소유자 수(명) — 공개 자료 기준 */
  owners?: number;
  /** 기존 세대수 */
  householdsNow?: number;
  /** 계획(구상) 세대수 */
  householdsPlan?: number;
  /** 노후도 % */
  deterioration?: number;
  /**
   * 단계별 공식 날짜 — 서울시 도시정비사업 통계·정비사업 정보몽땅 추진경과·보도자료로 확인한 값만.
   *   키는 stage-timeline 의 StageKey(district·committee·union·implement·design·disposition·demolish·construct …).
   *   화면은 `stage` 문자열이 말하는 현재 단계를 우선하고, 이 날짜는 지나온 단계의 날짜로만 붙인다.
   */
  stageDates?: Partial<Record<string, string>>;
  /** 권리산정기준일(YYYY-MM-DD) — 분양받을 권리의 산정 기준일 */
  rightsDate?: string;
  /** 단계 날짜 기준일(예: 2026-06-30 서울시 통계 기준) */
  datesAsOf?: string;
  /** 이 구역 레코드의 자료 기준일(서울플랜+ 기준일, 예: 2026-09-10) — 화면에 '단계 기준'으로 쓴다 */
  asOf?: string;
};

/**
 * 사업유형 정규화 — 레코드의 소분류(kind)가 사업유형을 더 정확히 말해 줄 때 지도 분류를 바로잡는다.
 *   · 서울플랜+ 레코드는 type 이 옛 분류(예: '일반재개발')로 들어오거나 비어 있을 수 있다.
 *   · 성장거점형·주거중심형은 사용자가 따로 보고 싶어 하는 구분이라 kind 이름에서 읽어 정한다.
 *     (kind 에 유형이 없으면 레코드의 type 을 그대로 둔다 — 없는 유형을 지어내지 않는다)
 *   · 재건축(단독·공동)은 옛 6색 분류에서 '일반재개발'로 묶여 지도에 '재개발'로 보였다 —
 *     소분류가 재건축이면 '재건축'으로 되돌린다(2026-11-23). 원본 데이터가 다시 예전 값으로
 *     들어와도 화면이 재개발로 되돌아가지 않게 하는 안전장치다.
 */
export function resolveZoneType(type: string | undefined, kind: string | undefined): MapZoneType {
  const k = kind ?? "";
  if (k.includes("민간도심복합")) {
    if (k.includes("성장거점")) return "민간도심복합(성장거점형)";
    if (k.includes("주거중심")) return "민간도심복합(주거중심형)";
  }
  if (k.startsWith("재건축")) return "재건축";
  if (k === "공공재개발") return "공공재개발";
  // 모아타운의 통합기획 방식 — 서울시 소분류가 '모아타운(모아통합기획)'이면 사업유형도
  //   '모아타운통합기획'으로 보여 준다. (원본 type 은 '모아타운'으로 들어오는 레코드가 있어
  //   소분류를 읽지 않으면 지도 칩·상세 배지가 모두 '모아타운'으로 되돌아갔다 — 2026-11-25 제보)
  if (k.startsWith("모아타운") && k.includes("모아통합기획")) return "모아타운통합기획";
  return (type as MapZoneType) || "일반재개발";
}

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

// 구역 경계는 배포마다 파일이 통째로 바뀐다 — 브라우저·CDN·아이패드 Safari 가 예전
// 파일을 물고 있으면 지도에 지난 배포의 경계가 그대로 남는다(2026-11-17 제보: 배포 후에도
// 자양동 10번지 일원 구버전 폴리곤이 보임). 그래서 요청에 빌드 ID를 붙이고 캐시를 끈다.
//   · `?v=` — CDN·프록시의 URL 단위 캐시를 배포마다 새 키로 만든다.
//   · `cache: "no-store"` — 브라우저 HTTP 캐시를 쓰지 않는다.
//   · 응답 헤더(Cache-Control)는 next.config.ts 의 headers() 에서 함께 막는다.
const DATA_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const ZONES_GEOJSON_URL = `/data/zones.geojson?v=${encodeURIComponent(DATA_VERSION)}`;

let cache: Promise<SeoulZonesData> | null = null;
/** 마지막으로 받은 데이터의 ETag — 배포가 바뀌었는지 확인하는 데 쓴다 */
let loadedEtag: string | null = null;

/**
 * 배포가 바뀌어 정비구역 데이터가 갱신됐는지 확인한다.
 *   · 앱을 켜 둔 채 새 배포가 올라가면, 아이패드 Safari 는 이미 그려 둔 화면을 그대로
 *     되살린다(뒤로가기 캐시·앱 전환). 그래서 화면이 다시 보일 때 이 함수로 확인하고,
 *     바뀌었으면 데이터를 다시 받아 지도를 다시 그린다(새로고침 없이).
 */
export async function zonesDataChanged(): Promise<boolean> {
  try {
    const r = await fetch(ZONES_GEOJSON_URL, { method: "HEAD", cache: "no-store" });
    if (!r.ok) return false;
    const etag = r.headers.get("etag");
    if (!etag) return false;
    return loadedEtag !== null && etag !== loadedEtag;
  } catch {
    return false;
  }
}

/** 받아 둔 데이터를 버리고 새 배포본에서 다시 받는다 */
export function refreshSeoulZones(): Promise<SeoulZonesData> {
  cache = null;
  return loadSeoulZones();
}

/** 서울시 정비구역 전수 목록 (실패 시 빈 목록 — 지도는 대표 구역만 그린다) */
export function loadSeoulZones(): Promise<SeoulZonesData> {
  if (cache) return cache;
  cache = fetch(ZONES_GEOJSON_URL, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) return Promise.reject(new Error(String(r.status)));
      loadedEtag = r.headers.get("etag") || loadedEtag;
      return r.json() as Promise<RawCollection>;
    })
    .then((fc) => {
      const zones: SeoulZone[] = [];
      for (const f of fc.features) {
        const { id, ...props } = f.properties;
        const zoneId = id ?? f.id ?? "";
        // 경계 미고시 후보지 — 폴리곤 없이 대표 지점만
        if (!f.geometry) {
          if (!props.center) continue;
          zones.push({ ...props, type: resolveZoneType(props.type, props.kind), id: zoneId, center: props.center });
          continue;
        }
        const { outer, holes } = ringsOf(f.geometry);
        if (!outer.length) continue;
        zones.push({
          ...props,
          type: resolveZoneType(props.type, props.kind),
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
