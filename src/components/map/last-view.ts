"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 마지막으로 보던 지도 화면 기억 (2026-11-27 사용자 요청)
//
//   “닫았다 열었을 때 보던 구역·위치가 그대로 열렸으면 좋겠다.”
//
//   · 지도를 옮기거나 배율을 바꾸고, 구역을 고르거나 닫을 때마다
//     `{ center, level, selectedZoneId, savedAt }` 을 localStorage 한 칸에 덮어쓴다.
//   · 다음에 앱·브라우저를 다시 열어 기본 주소(/)로 들어오면 그 화면을 그대로 되살린다.
//     (`/?zone=`·`/?my=` 처럼 **주소가 특정 구역을 지정한 경우에는 되살리지 않는다** — 주소가 이긴다.)
//   · 저장본을 지우는 순간( ‘서울 전체’ 리셋 )에는 서울 전체가 다시 기본값이 된다.
//
//   · localStorage 가 막힌 브라우저(사생활 모드·용량 초과)에서도 화면이 멈추지 않도록
//     모든 접근을 try/catch 로 감싼다 — 실패하면 ‘기억 없음’으로 동작한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { MapViewPoint } from "./props";

/** localStorage 키 — 값 모양이 바뀌면 _v2 로 올린다(옛 값은 자연히 무시된다) */
export const LAST_VIEW_KEY = "redev_last_view_v1";

/** 한 번에 기억하는 화면 — 지도 화면 + 그때 열어 둔 구역 */
export type StoredView = MapViewPoint & {
  /** 그때 상세를 열어 둔 구역 id (없으면 null) */
  selectedZoneId: string | null;
  /** 저장 시각(ms) — 진단·만료 판단용 */
  savedAt: number;
};

/** 카카오 배율 범위 — 이 밖의 값이 저장돼 있으면 버린다 */
const MIN_LEVEL = 1;
const MAX_LEVEL = 13;
/** 서울 대략 경계 — 이 밖의 좌표가 저장돼 있으면 버린다(다른 사이트가 같은 키를 쓴 경우 방어) */
const LAT_MIN = 37.3;
const LAT_MAX = 37.75;
const LNG_MIN = 126.7;
const LNG_MAX = 127.3;

/** 저장된 화면을 읽는다 — 없거나 망가졌으면 null */
export function readLastView(): StoredView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredView> | null;
    const lat = Number(v?.center?.lat);
    const lng = Number(v?.center?.lng);
    const level = Number(v?.level);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(level)) return null;
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) return null;
    if (level < MIN_LEVEL || level > MAX_LEVEL) return null;
    const id = typeof v?.selectedZoneId === "string" && v.selectedZoneId ? v.selectedZoneId : null;
    return {
      center: { lat, lng },
      level: Math.round(level),
      selectedZoneId: id,
      savedAt: Number(v?.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** 화면을 저장한다 — 실패해도 조용히 넘어간다(저장은 편의 기능이다) */
export function writeLastView(view: MapViewPoint, selectedZoneId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredView = {
      center: { lat: view.center.lat, lng: view.center.lng },
      level: Math.round(view.level),
      selectedZoneId: selectedZoneId ?? null,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(payload));
  } catch {
    /* 저장 불가(사생활 모드·용량 초과) — 이번 방문은 기억 없이 동작한다 */
  }
}

/** 저장본을 지운다 — ‘서울 전체’로 되돌릴 때 */
export function clearLastView(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_VIEW_KEY);
  } catch {
    /* 무시 */
  }
}

/**
 * 주소가 특정 구역/매물을 지정했는가 — `?zone=`·`?my=` 가 있으면 마지막 화면을 되살리지 않는다.
 *   (매물 목록의 [지도에서 보기]처럼 **링크가 목적한 구역**을 먼저 보여 줘야 하는 경우)
 */
export function urlPinsView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    return url.searchParams.has("zone") || url.searchParams.has("my");
  } catch {
    return false;
  }
}
