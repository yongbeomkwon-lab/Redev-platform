"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 필지(지적) 경계 — 주소로 고른 지점의 **연속지적도 필지**를 지도에 강조한다
//
//  · 서버 라우트 `/api/parcel` 이 브이월드 2D 데이터 API(LP_PA_CBND_BUBUN)를 대신 불러 준다.
//    인증키는 서버에만 있고, 응답은 우리 앱 규약인 [위도, 경도] 링으로 뒤집혀 온다.
//  · 실패(키 없음·브이월드 오류·필지 없음)해도 주소 핀은 그대로 둔다 — 필지 강조만 건너뛴다.
//    그래서 이 모듈은 **던지지 않고** ok:false 를 돌려준다.
// ─────────────────────────────────────────────────────────────────────────────

export type Parcel = {
  pnu: string | null;
  /** 지번 (예: 315-1) */
  jibun: string;
  /** 지번 주소 전체 (예: 서울특별시 성동구 성수동2가 315-1) */
  addr: string | null;
  /** 지도 말풍선용 짧은 이름 (예: 성동구 성수동2가 315-1) */
  label: string;
  /** 필지 외곽 링들 — [위도, 경도] */
  rings: [number, number][][];
  /** 필지 경계 상자의 가운데 — '보는중' 말풍선 자리 */
  center: [number, number];
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
};

export type ParcelResult = {
  ok: boolean;
  parcel?: Parcel | null;
  /** ok:false 일 때 이유(키 미설정·브이월드 오류 등) */
  error?: string;
  detail?: string;
};

/** 좌표가 속한 필지를 서버 라우트로 물어본다 — 실패해도 예외를 던지지 않는다 */
export async function fetchParcel(lat: number, lng: number, signal?: AbortSignal): Promise<ParcelResult> {
  try {
    const url = `/api/parcel?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`;
    const res = await fetch(url, { signal, cache: "no-store" });
    const body = (await res.json()) as ParcelResult;
    if (!res.ok && body.ok !== false) return { ok: false, error: `HTTP ${res.status}` };
    return body;
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return { ok: false, error: "aborted" };
    return { ok: false, error: "FETCH_FAILED", detail: String(error).slice(0, 200) };
  }
}
