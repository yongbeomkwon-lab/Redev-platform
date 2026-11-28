"use client";
// ─────────────────────────────────────────────────────────────────────────────
// MobileMeSheet — 하단 탭 「내 정보」가 여는 시트 (2026-11-28)
//   · 로그인 상태: 닉네임·이메일 + 내가 쓴 글 · 검증 매물 · 중개사 매물 등록 · 로그아웃
//   · 로그아웃 상태: 로그인/회원가입 + 매물 등록 · 검증 매물
//   · 폰에서만 쓰는 화면이라 시트는 아래에서 올라온다(데스크톱은 상단 메뉴 그대로).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function MobileMeSheet({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const { ready, user, openAuth, signOut } = useAuth();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nick = user?.nickname || (user?.email ? user.email.split("@")[0] : "");

  return (
    <div className="fixed inset-0 z-[980] flex items-end md:hidden" role="dialog" aria-modal="true" aria-label="내 정보">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-[#0b1725]/40" />
      <div className="relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white pb-[calc(10px+env(safe-area-inset-bottom,0px))] shadow-[0_-10px_30px_-18px_rgba(16,24,40,.6)]">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-slate-200" aria-hidden />

        <div className="flex items-center gap-2.5 px-4 pb-3 pt-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-[15px] font-extrabold text-white">
            {(nick || "?").slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            {ready && user ? (
              <>
                <p className="truncate text-[14px] font-extrabold text-ink">{nick}</p>
                <p className="truncate text-[10.5px] text-slate-500">{user.email}</p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-extrabold text-ink">로그인하고 더 쓰기</p>
                <p className="text-[10.5px] text-slate-500">내가 쓴 글 · 좋아요 · 댓글은 회원만</p>
              </>
            )}
          </div>
          {ready && !user && (
            <button
              type="button"
              onClick={() => {
                onClose();
                openAuth("login");
              }}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-[12px] font-bold text-white"
            >
              로그인
            </button>
          )}
        </div>

        <ul className="border-t border-line text-[13px]">
          {user && (
            <li>
              <button
                type="button"
                onClick={() => onNavigate("/community?mine=1")}
                className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-700 active:bg-slate-50"
              >
                내가 쓴 글 <span aria-hidden className="text-slate-300">›</span>
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={() => onNavigate("/register")}
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-700 active:bg-slate-50"
            >
              중개사 매물 등록 <span aria-hidden className="text-slate-300">›</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onNavigate("/listings")}
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-700 active:bg-slate-50"
            >
              검증 매물 보기 <span aria-hidden className="text-slate-300">›</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onNavigate("/laws")}
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-700 active:bg-slate-50"
            >
              법령·조례 검색 <span aria-hidden className="text-slate-300">›</span>
            </button>
          </li>
          {user && (
            <li>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  onClose();
                }}
                className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-500 active:bg-slate-50"
              >
                로그아웃 <span aria-hidden className="text-slate-300">›</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
