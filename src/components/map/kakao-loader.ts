// ─────────────────────────────────────────────────────────────────────────────
// 카카오맵 JavaScript SDK 로더 (autoload=false — 우리가 원할 때 지도를 만든다)
//
//  ▶ 키: NEXT_PUBLIC_KAKAO_MAP_APP_KEY (카카오 Developers → 내 애플리케이션 → 플랫폼 키 →
//     **JavaScript 키**). Admin/REST 키는 절대 프론트엔드에 넣지 않는다(서버 전용 비밀 키).
//  ▶ 도메인: 카카오 Developers → 플랫폼 → Web 에 사이트 도메인을 등록해야 SDK가 열린다.
//     (https://redev-platform-iota.vercel.app, http://localhost:3000 등)
//  ▶ 실패 처리: 키가 없거나, 키 종류가 다르거나(예: ADMIN_KEY), 도메인 미등록이면 SDK 응답이
//     오류 JSON이라 window.kakao 가 생기지 않는다. 그때는 즉시 OSM 폴백으로 내려가 지도가
//     비어 보이지 않게 한다.
//  ▶ 재시도: 실패를 세션 스토리지에 캐시하지 않는다. 새로고침·재방문마다 SDK를 다시 불러
//     일시적 실패(네트워크·카카오 응답 지연) 한 번으로 탭 전체가 OSM에 고정되지 않게 한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { MapFailReason } from "./props";

export type KakaoLatLng = { getLat(): number; getLng(): number };
export type KakaoPoint = { x: number; y: number };

export type KakaoBounds = {
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
  extend(latlng: KakaoLatLng): void;
  isEmpty(): boolean;
};

export type KakaoProjection = {
  containerPointFromCoords(latlng: KakaoLatLng): KakaoPoint;
  coordsFromContainerPoint(point: KakaoPoint): KakaoLatLng;
  pointFromCoords(latlng: KakaoLatLng): KakaoPoint;
  coordsFromPoint(point: KakaoPoint): KakaoLatLng;
};

export type KakaoPolygon = {
  setMap(map: KakaoMap | null): void;
  setPath(path: KakaoLatLng[]): void;
  setOptions(options: Record<string, unknown>): void;
};

export type KakaoCustomOverlay = {
  setMap(map: KakaoMap | null): void;
  setPosition(latlng: KakaoLatLng): void;
  setVisible(visible: boolean): void;
  setZIndex(z: number): void;
};

export type KakaoMap = {
  getCenter(): KakaoLatLng;
  getLevel(): number;
  getBounds(): KakaoBounds;
  getProjection(): KakaoProjection;
  getMapTypeId(): string;
  setCenter(latlng: KakaoLatLng): void;
  panTo(target: KakaoLatLng | KakaoBounds, padding?: number): void;
  jump(center: KakaoLatLng, level: number, options?: unknown): void;
  setLevel(level: number, options?: unknown): void;
  setBounds(bounds: KakaoBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  setMapTypeId(mapTypeId: string): void;
  addOverlayMapTypeId(mapTypeId: string): void;
  removeOverlayMapTypeId(mapTypeId: string): void;
  setMinLevel(level: number): void;
  setMaxLevel(level: number): void;
  relayout(): void;
};

export type KakaoMouseEvent = {
  latLng: KakaoLatLng;
  point?: KakaoPoint;
};

// ── services 라이브러리 (주소·키워드 검색) ─────────────────────────────────
//   주소 검색은 `libraries=services` 로만 열린다. SDK 스크립트 URL 이 곧 계약이므로
//   KAKAO_SDK_URL 에 라이브러리를 붙여 두고, 이미 열린 SDK 에 services 가 없으면
//   loadKakaoServices() 가 라이브러리를 붙인 스크립트를 한 번 더 부른다.
export type KakaoAddressDoc = {
  address_name: string;
  address_type?: "REGION" | "ROAD" | "REGION_ADDR" | "ROAD_ADDR";
  x: string;
  y: string;
  address?: {
    address_name: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    main_address_no?: string;
    sub_address_no?: string;
    mountain_yn?: string;
    b_code?: string;
    h_code?: string;
  } | null;
  road_address?: {
    address_name: string;
    building_name?: string;
    main_building_no?: string;
    sub_building_no?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    road_name?: string;
  } | null;
};

export type KakaoKeywordDoc = {
  id?: string;
  place_name: string;
  category_name?: string;
  category_group_name?: string;
  phone?: string;
  address_name: string;
  road_address_name?: string;
  x: string;
  y: string;
  place_url?: string;
  distance?: string;
};

export type KakaoRegionDoc = {
  region_type: "B" | "H" | string; // B=법정동, H=행정동
  code?: string;
  address_name?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
  region_4depth_name?: string;
  x?: number;
  y?: number;
};

export type KakaoGeocoder = {
  addressSearch(
    address: string,
    callback: (data: KakaoAddressDoc[], status: string) => void,
    options?: Record<string, unknown>
  ): void;
  /** 좌표 → 법정동·행정동 (x=경도, y=위도) — 구역 중심에서 법정동을 알아낼 때 쓴다 */
  coord2RegionCode(
    x: number,
    y: number,
    callback: (data: KakaoRegionDoc[], status: string) => void
  ): void;
  /** 좌표 → 지번·도로명 주소 (x=경도, y=위도) — 지도에서 찍은 지점의 지번을 얻는다 */
  coord2Address(
    x: number,
    y: number,
    callback: (data: KakaoCoordDoc[], status: string) => void
  ): void;
};

/** coord2Address 응답 1건 — 지번 주소(address)와 도로명 주소(road_address) */
export type KakaoCoordDoc = {
  address: {
    address_name: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    main_address_no?: string;
    sub_address_no?: string;
    mountain_yn?: string;
  } | null;
  road_address: {
    address_name: string;
    building_name?: string;
    road_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    main_building_no?: string;
    sub_building_no?: string;
    underground_yn?: string;
  } | null;
};

export type KakaoPlaces = {
  keywordSearch(
    keyword: string,
    callback: (data: KakaoKeywordDoc[], status: string) => void,
    options?: Record<string, unknown>
  ): void;
};

export type KakaoServices = {
  Geocoder: new () => KakaoGeocoder;
  Places: new () => KakaoPlaces;
  Status: Record<string, string>;
};

export type KakaoSDK = {
  maps: {
    services?: KakaoServices;
    Map: new (container: HTMLElement, options: Record<string, unknown>) => KakaoMap;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new (sw?: KakaoLatLng, ne?: KakaoLatLng) => KakaoBounds;
    Point: new (x: number, y: number) => KakaoPoint;
    CustomOverlay: new (options: Record<string, unknown>) => KakaoCustomOverlay;
    Polygon: new (options: Record<string, unknown>) => KakaoPolygon;
    MapTypeId: Record<string, string>;
    ControlPosition: Record<string, number>;
    event: {
      addListener(target: unknown, type: string, handler: (e: KakaoMouseEvent) => void): void;
      removeListener(target: unknown, type: string, handler: (e: KakaoMouseEvent) => void): void;
    };
    load(callback: () => void): void;
  };
};

export type SdkResult = { ok: true; sdk: KakaoSDK } | { ok: false; reason: MapFailReason; detail?: string };

/**
 * 카카오 JavaScript 앱 키
 *  · NEXT_PUBLIC_KAKAO_MAP_APP_KEY 가 있으면 그것을, 없으면 배포본 기본값을 쓴다.
 *  · JavaScript 키는 웹에 노출되는 공개 키다(도메인 등록으로 보호). Admin/REST 키는
 *    서버 전용 비밀 키이므로 절대 여기에 두지 않는다.
 */
const FALLBACK_APP_KEY = "93c96d5852b48c1ad762359abe536869";
export const KAKAO_APP_KEY = (process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "").trim() || FALLBACK_APP_KEY;

//  · libraries=services — 주소(지번·도로명)·키워드 검색(Geocoder / Places).
//    이 파라미터가 빠지면 kakao.maps.services 가 없어 주소 검색이 통째로 죽는다.
export const KAKAO_LIBRARIES = "services";
export const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false&libraries=${KAKAO_LIBRARIES}`;

function kakaoGlobal(): KakaoSDK | undefined {
  return (window as unknown as { kakao?: KakaoSDK }).kakao;
}

/** SDK 응답 본문에서 카카오가 알려주는 오류 문구를 읽는다 (진단용) */
async function diagnose(): Promise<string | undefined> {
  try {
    const res = await fetch(KAKAO_SDK_URL, { cache: "no-store" });
    const text = (await res.text()).slice(0, 400);
    try {
      const json = JSON.parse(text) as { errorType?: string; message?: string };
      if (json.errorType || json.message) return `${json.errorType ?? "error"}: ${json.message ?? ""}`.trim();
    } catch {
      /* JSON이 아니면 그대로 잘라 쓴다 */
    }
    return res.ok ? undefined : `HTTP ${res.status}`;
  } catch {
    return undefined;
  }
}

let pending: Promise<SdkResult> | null = null;

/** 카카오맵 SDK 준비 — 성공하면 sdk, 실패하면 이유를 돌려준다(던지지 않는다). */
export function loadKakaoSdk(): Promise<SdkResult> {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, reason: "init-error" });
  if (!KAKAO_APP_KEY) return Promise.resolve({ ok: false, reason: "key-missing" });

  const loaded = kakaoGlobal();
  if (loaded?.maps?.Map) {
    return new Promise<SdkResult>((resolve) => loaded.maps.load(() => resolve({ ok: true, sdk: loaded })));
  }
  if (pending) return pending;

  pending = new Promise<SdkResult>((resolve) => {
    let settled = false;
    const finish = (r: SdkResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(r);
    };

    const timer = window.setTimeout(() => finish({ ok: false, reason: "timeout" }), 10_000);
    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.dataset.kakaoSdk = "1";

    script.onload = () => {
      const sdk = kakaoGlobal();
      if (!sdk?.maps?.load) {
        // 401/403 응답이면 브라우저는 스크립트를 실행하려다 파싱 오류를 내고 window.kakao 는 없다.
        void diagnose().then((detail) => finish({ ok: false, reason: "sdk-error", detail }));
        return;
      }
      sdk.maps.load(() => finish({ ok: true, sdk }));
    };
    script.onerror = () => {
      void diagnose().then((detail) => finish({ ok: false, reason: "script-error", detail }));
    };

    document.head.appendChild(script);
  });

  return pending;
}

/**
 * services 라이브러리(주소·키워드 검색)가 준비된 SDK 를 돌려준다.
 *  · 정상 경로: SDK URL 에 libraries=services 가 있어 첫 로드에 함께 온다.
 *  · 예외: 라이브러리 없이 먼저 열린 SDK(다른 탭·이전 배포본 캐시)라면 서비스가 없다.
 *    그때만 라이브러리를 붙인 스크립트를 한 번 더 불러 채운다(전체 재방문 없이).
 */
export function loadKakaoServices(): Promise<{ ok: true; sdk: KakaoSDK } | { ok: false; detail?: string }> {
  return loadKakaoSdk().then(
    (r) =>
      new Promise<{ ok: true; sdk: KakaoSDK } | { ok: false; detail?: string }>((resolve) => {
        if (!r.ok) return resolve({ ok: false, detail: r.reason });
        if (r.sdk.maps.services) return resolve({ ok: true, sdk: r.sdk });

        let settled = false;
        const finish = (v: { ok: true; sdk: KakaoSDK } | { ok: false; detail?: string }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(v);
        };
        const timer = window.setTimeout(() => finish({ ok: false, detail: "services-timeout" }), 8_000);
        const script = document.createElement("script");
        script.src = KAKAO_SDK_URL;
        script.async = true;
        script.onload = () => {
          const sdk = kakaoGlobal();
          const done = () => (sdk?.maps?.services ? finish({ ok: true, sdk }) : finish({ ok: false, detail: "services-missing" }));
          sdk?.maps?.load ? sdk.maps.load(done) : done();
        };
        script.onerror = () => finish({ ok: false, detail: "services-script-error" });
        document.head.appendChild(script);
      })
  );
}
