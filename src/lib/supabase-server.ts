// ─────────────────────────────────────────────────────────────────────────────
// Supabase REST(PostgREST) 헬퍼 — **서버 전용**
//
//   · supabase-js 패키지를 넣지 않고 `fetch` 로만 호출한다(의존성·빌드 이슈 회피).
//   · Supabase 의 새 키 형식(`sb_secret_…` / `sb_publishable_…`)은 `apikey` 헤더와
//     `Authorization: Bearer …` 헤더 **둘 다**로 전달하면 PostgREST 가 받는다(2026-11-18 확인).
//   · 환경변수가 없으면 `supabaseConfigured()` 가 false — 라우트는 정적 모드로 답하고,
//     화면은 예전처럼 `verified-listings.json` + `localStorage` 로 안전하게 동작한다.
//   · 이 파일은 서버 코드(route handler)에서만 import 한다. 비밀 키가 브라우저로 나가면 안 된다.
// ─────────────────────────────────────────────────────────────────────────────

const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
/** 서버는 service role(RLS 우회) 키를 쓴다. 없으면 공개 키로 폴백(읽기만 될 수 있음) */
const rawKey = (
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() ||
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
).trim();

export const SUPABASE_URL = rawUrl;

/** Supabase 환경변수가 준비되어 있는지 — false 면 모든 호출이 정적 폴백으로 간다 */
export function supabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && rawKey.length > 0;
}

export type SbResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; status: number; message: string };

/** PostgREST 오류 본문 → 사람이 읽을 한 줄 */
function messageOf(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [b.message, b.details, b.hint, b.code ? `code ${b.code}` : ""].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 200);
  return `HTTP ${status}`;
}

async function request<T>(path: string, init: RequestInit): Promise<SbResult<T>> {
  if (!supabaseConfigured()) {
    return {
      ok: false,
      status: 0,
      message:
        "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY)가 서버에 설정되어 있지 않습니다.",
    };
  }
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        apikey: rawKey,
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      // Next 캐시에 매물·구역 목록이 얼어붙지 않게 매번 새로 읽는다
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) return { ok: false, status: res.status, message: messageOf(body, res.status) };
    return { ok: true, rows: Array.isArray(body) ? (body as T[]) : [] };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Supabase 요청에 실패했습니다.",
    };
  }
}

/** 행 조회 — query 는 `select=*&order=created_at.desc` 같은 PostgREST 쿼리 문자열 */
export function sbSelect<T>(table: string, query: string): Promise<SbResult<T>> {
  return request<T>(`${table}?${query}`, { method: "GET" });
}

/** upsert — 같은 기본키(id)가 있으면 갱신, 없으면 삽입. 저장된 행을 돌려받는다 */
export function sbUpsert<T>(table: string, rows: unknown[], onConflict = "id"): Promise<SbResult<T>> {
  return request<T>(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
}

/** 행 삭제 — filter 는 `id=eq.<값>` 같은 PostgREST 필터 */
export function sbDelete<T>(table: string, filter: string): Promise<SbResult<T>> {
  return request<T>(`${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
}
