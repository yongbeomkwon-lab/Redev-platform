"use client";
// ─────────────────────────────────────────────────────────────────────────────
// AuthProvider — 리디브 로그인 상태와 로그인/회원가입 창 (2026-11-22)
//
//   · 앱 전체(헤더·커뮤니티·지도 구역 패널)가 useAuth() 하나로 같은 세션을 본다.
//   · 세션이 없으면 openAuth() 로 로그인 창을 띄운다 — 글쓰기 버튼이 그렇게 안내한다.
//   · 세션 저장·갱신은 lib/auth-client.ts 가 맡는다(localStorage).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession } from "@/lib/auth-client";
import { ensureSession, readSession, saveSession, signIn as apiSignIn, signOutNow, signUp as apiSignUp } from "@/lib/auth-client";

type AuthMode = "login" | "signup";

type AuthContextValue = {
  /** 아직 저장된 세션을 읽는 중이면 false */
  ready: boolean;
  session: AuthSession | null;
  user: AuthSession["user"] | null;
  openAuth: (mode?: AuthMode, reason?: string) => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
  /** 목록·상세를 다시 읽어야 할 때 올라가는 값 */
  version: number;
  touch: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Provider 없이 쓰인 화면(예: 잘못된 import)에서도 앱이 죽지 않게 최소 동작만 준다
    return {
      ready: true,
      session: null,
      user: null,
      openAuth: () => {},
      closeAuth: () => {},
      signOut: async () => {},
      version: 0,
      touch: () => {},
    };
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; mode: AuthMode; reason?: string }>({
    open: false,
    mode: "login",
  });

  // 첫 마운트 — 저장된 세션을 읽고, 만료됐으면 조용히 갱신한다
  useEffect(() => {
    let alive = true;
    const stored = readSession();
    if (!stored) {
      setReady(true);
      return;
    }
    setSession(stored);
    setReady(true);
    ensureSession(stored).then((fresh) => {
      if (!alive) return;
      if (fresh) setSession(fresh);
      else {
        setSession(null);
        setVersion((v) => v + 1);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const openAuth = useCallback((mode: AuthMode = "login", reason?: string) => {
    setModal({ open: true, mode, reason });
  }, []);
  const closeAuth = useCallback(() => setModal((m) => ({ ...m, open: false })), []);
  const touch = useCallback(() => setVersion((v) => v + 1), []);

  const signOut = useCallback(async () => {
    await signOutNow(session);
    setSession(null);
    setVersion((v) => v + 1);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      openAuth,
      closeAuth,
      signOut,
      version,
      touch,
    }),
    [ready, session, openAuth, closeAuth, signOut, version, touch]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modal.open && (
        <AuthModal
          initialMode={modal.mode}
          reason={modal.reason}
          onClose={closeAuth}
          onAuthed={(next) => {
            setSession(next);
            saveSession(next);
            setVersion((v) => v + 1);
            setModal((m) => ({ ...m, open: false }));
          }}
        />
      )}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 로그인 / 회원가입 창
// ─────────────────────────────────────────────────────────────────────────────
function AuthModal({
  initialMode,
  reason,
  onClose,
  onAuthed,
}: {
  initialMode: AuthMode;
  reason?: string;
  onClose: () => void;
  onAuthed: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const nick = nickname.trim();
        if (nick.length < 2) {
          setError("닉네임을 2자 이상 적어 주세요.");
          return;
        }
        const res = await apiSignUp(email.trim(), password, nick);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if (res.needsConfirm) {
          setNotice(
            "가입 확인 메일을 보냈습니다. 메일함의 확인 링크를 누르면 가입이 끝나고, 그 뒤에 로그인할 수 있습니다."
          );
          setMode("login");
          return;
        }
        if (res.session) onAuthed(res.session);
      } else {
        const res = await apiSignIn(email.trim(), password);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if (res.session) onAuthed(res.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-[#0b1725]/45 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "login" ? "로그인" : "회원가입"}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-brand">REDEV · MEMBER</p>
            <h2 className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] text-ink">
              {mode === "login" ? "로그인" : "회원가입"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 rounded-md px-2 py-1 text-[18px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        {reason && (
          <p className="mb-3 rounded-lg bg-brand-tint px-3 py-2 text-[11.5px] leading-relaxed text-brand">
            {reason}
          </p>
        )}

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(["login", "signup"] as AuthMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={
                "rounded-md py-1.5 text-[12.5px] font-bold transition-colors " +
                (mode === m ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700")
              }
            >
              {m === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">이메일</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          {mode === "signup" && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">닉네임</span>
              <input
                type="text"
                required
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="게시판에 보일 이름 (2~16자)"
                className="w-full rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">비밀번호</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              className="w-full rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>}
          {notice && <p className="rounded-lg bg-brand-tint px-3 py-2 text-[11.5px] leading-relaxed text-brand">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
          >
            {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
          </button>
        </form>

        <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
          글쓰기·댓글·좋아요에는 로그인이 필요합니다. 게시글 읽기는 로그인 없이도 가능합니다.
        </p>
      </div>
    </div>
  );
}
