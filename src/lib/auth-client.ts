"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 브라우저용 Supabase Auth 클라이언트 (2026-11-22)
//
//   · supabase-js 패키지를 넣지 않는다 — GoTrue REST(`/auth/v1/*`)를 fetch 로 부른다.
//     프로젝트의 다른 DB 연동(supabase-server.ts)과 같은 방침이다.
//   · 세션은 localStorage('redev-auth-v1')에만 둔다. 공개 키(anon)만 브라우저에서 쓴다.
//   · access_token 은 1시간이면 만료된다 — 요청 전에 ensureSession() 이 먼저 갱신한다.
// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const STORAGE_KEY = "redev-auth-v1";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  /** epoch ms */
  expires_at: number;
  user: { id: string; email: string; nickname: string };
};

export type AuthResult = { ok: true; session: AuthSession | null; needsConfirm?: boolean } | { ok: false; message: string };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): AuthSession | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null): void {
  const s = storage();
  if (!s) return;
  try {
    if (session) s.setItem(STORAGE_KEY, JSON.stringify(session));
    else s.removeItem(STORAGE_KEY);
  } catch {
    /* 저장 공간이 막혀 있으면 세션은 이번 방문에만 산다 */
  }
}

type GoTrueUser = {
  id: string;
  email?: string;
  user_metadata?: { nickname?: string };
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: GoTrueUser;
  error?: string;
  error_description?: string;
  msg?: string;
};

/** Supabase 오류 문구 → 화면에 그대로 보여 줄 한국어 */
function koError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (m.includes("email not confirmed")) return "이메일 인증이 아직 끝나지 않았습니다. 받은 메일함의 확인 링크를 눌러 주세요.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (m.includes("password should be at least")) return "비밀번호가 너무 짧습니다(6자 이상).";
  if (m.includes("rate limit") || m.includes("too many")) return "요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.";
  if (m.includes("invalid email")) return "이메일 주소 형식이 올바르지 않습니다.";
  if (m.includes("signups not allowed")) return "지금은 새 가입을 받지 않고 있습니다.";
  return message;
}

async function tokenFrom(res: Response): Promise<AuthResult> {
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const raw = body.error_description || body.error || body.msg || `HTTP ${res.status}`;
    return { ok: false, message: koError(raw) };
  }
  const session: AuthSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? "",
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
    user: {
      id: body.user?.id ?? "",
      email: body.user?.email ?? "",
      nickname: body.user?.user_metadata?.nickname ?? "",
    },
  };
  // 닉네임은 profiles 가 정본 — 우리 서버에서 확인한다(실패해도 로그인은 유지)
  const me = await fetchNickname(session.access_token);
  if (me) session.user.nickname = me.nickname;
  if (!session.user.nickname) session.user.nickname = session.user.email.split("@")[0] ?? "회원";
  saveSession(session);
  return { ok: true, session };
}

async function fetchNickname(accessToken: string): Promise<{ nickname: string } | null> {
  try {
    const res = await fetch("/api/community/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; user?: { nickname?: string } };
    if (!body.ok || !body.user?.nickname) return null;
    return { nickname: body.user.nickname };
  } catch {
    return null;
  }
}

/** 회원가입 — 성공해도 이메일 확인 설정이 켜져 있으면 세션은 없다(needsConfirm) */
export async function signUp(email: string, password: string, nickname: string): Promise<AuthResult> {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      data: { nickname },
      gotrue_meta_security: {},
      // 확인 메일의 링크를 누르면 커뮤니티로 돌아온다
      options: { emailRedirectTo: `${window.location.origin}/community` },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & { id?: string };
  if (!res.ok) {
    const raw = body.error_description || body.error || body.msg || `HTTP ${res.status}`;
    return { ok: false, message: koError(raw) };
  }
  if (!body.access_token) {
    // 이메일 확인 대기 — 계정은 만들어졌다
    return { ok: true, session: null, needsConfirm: true };
  }
  return tokenFrom(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return tokenFrom(res);
}

export async function signOutNow(session: AuthSession | null): Promise<void> {
  saveSession(null);
  if (!session?.access_token) return;
  try {
    await fetch(`${URL_BASE}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    /* 서버 쪽 세션 정리는 실패해도 이 브라우저에서는 이미 로그아웃 상태다 */
  }
}

/** 만료가 임박했으면 refresh_token 으로 갱신한다. 갱신 불가면 null(로그아웃) */
export async function ensureSession(session: AuthSession | null): Promise<AuthSession | null> {
  if (!session) return null;
  if (session.expires_at - 60_000 > Date.now()) return session;
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) {
      saveSession(null);
      return null;
    }
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!body.access_token) {
      saveSession(null);
      return null;
    }
    const next: AuthSession = {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? session.refresh_token,
      expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
      user: {
        id: body.user?.id ?? session.user.id,
        email: body.user?.email ?? session.user.email,
        nickname: session.user.nickname,
      },
    };
    saveSession(next);
    return next;
  } catch {
    return session; // 네트워크 문제 — 기존 토큰으로 한 번 더 시도해 본다
  }
}

/** 인증이 필요한 요청 — 토큰을 붙이고, 401 이면 세션을 지운다 */
export async function authFetch(
  path: string,
  session: AuthSession | null,
  init: RequestInit = {}
): Promise<Response> {
  const fresh = await ensureSession(session);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (fresh?.access_token) headers.set("Authorization", `Bearer ${fresh.access_token}`);
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  if (res.status === 401) saveSession(null);
  return res;
}
