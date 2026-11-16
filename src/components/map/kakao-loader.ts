// ─────────────────────────────────────────────────────────────────────────────
// 카카오맵 JavaScript SDK 로더 (autoload=false — 우리가 원할 때 지도를 만든다)
//
//  ▶ 키: NEXT_PUBLIC_KAKAO_MAP_APP_KEY (카카오 Developers → 내 애플리케이션 → 플랫폼 키 →
//     **JavaScript 키**). Admin/REST 키는 절대 프론트엔드에 넣지 않는다(서버 전용 비밀 키).
//  ▶ 도메인: 카카오 Developers → 플랫폼 → Web 에 사이트 도메인을 등록해야 SDK가 열린다.
//     (https://redev-platform-iota.vercel.app, http://localhost:3000 등)
//  ▶ 실패 처리: 키가 없거나, 키 종류가 다르거나(예: ADMIN_KEY), 도메인 미등록이면 SDK 응답이
//     오류 JSON이라 window.kakao 가 생기지 않는다. 그때는 같은 탭 세션에서 재시도를 건너뛰고
//     즉시 OSM 폴백으로 내려가 지도가 비어 보이지 않게 한다.
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

export type KakaoSDK = {
  maps: {
    Map: new (container: HTMLElement, options: Record<string, unknown>) => KakaoMap;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new (sw?: KakaoLatLng, ne?: KakaoLatLng) => KakaoBounds;
    Point: new (x: number, y: number) => KakaoPoint;
    CustomOverlay: new (options: Record<string, unknown>) => KakaoCustomOverlay;
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

export const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false`;

const FAIL_KEY = "redev.kakao.sdk.failed";

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

  // 같은 탭에서 이미 실패한 키라면 다시 기다리지 않는다(방문자 체감 속도)
  try {
    if (sessionStorage.getItem(FAIL_KEY) === KAKAO_APP_KEY) {
      return Promise.resolve({ ok: false, reason: "sdk-error" });
    }
  } catch {
    /* 세션 스토리지 차단 환경은 무시 */
  }

  pending = new Promise<SdkResult>((resolve) => {
    let settled = false;
    const finish = (r: SdkResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!r.ok) {
        try {
          sessionStorage.setItem(FAIL_KEY, KAKAO_APP_KEY);
        } catch {
          /* ignore */
        }
      }
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
