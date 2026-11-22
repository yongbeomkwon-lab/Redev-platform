"use client";
// ─────────────────────────────────────────────────────────────────────────────
// HeaderAuth — 헤더 오른쪽 로그인/회원가입 · 로그인 후 닉네임 메뉴 (2026-11-22)
//   · 로그아웃 상태: 테두리 버튼 「로그인」 (누르면 로그인·회원가입 창)
//   · 로그인 상태: 닉네임 칩 + 드롭다운(내 글 · 로그아웃)
//   · 「중개사 매물 등록」 CTA 와 나란히 서도 튀지 않게 같은 높이·같은 서체로 둔다.
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function HeaderAuth() {
  const { ready, user, openAuth, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready) return <span className="w-[52px]" aria-hidden />;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openAuth("login")}
        className="rounded-md border border-line px-1.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-brand hover:text-brand sm:px-2.5"
      >
        로그인
      </button>
    );
  }

  const nick = user.nickname || (user.email ? user.email.split("@")[0] : "회원");

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[110px] items-center gap-1 rounded-md border border-line px-1.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-brand hover:text-brand sm:max-w-none sm:px-2.5"
      >
        <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-brand text-[9px] font-bold text-white">
          {nick.slice(0, 1)}
        </span>
        <span className="truncate">{nick}</span>
        <span aria-hidden className="text-[8px] text-slate-400">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-[900] w-[168px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl"
        >
          <p className="truncate px-3 py-1.5 text-[10.5px] text-slate-400">{user.email}</p>
          <Link
            href="/community?mine=1"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-brand-tint hover:text-brand"
          >
            내가 쓴 글
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="block w-full px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
