import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "리디브(redev) — 서울 재개발 구역·매물 플랫폼",
  description:
    "서울 정비구역 실거래가 조회(무료), 중개사 매물 등록(유료), 검증 매물 열람(유료) — 재개발 입주권·조합원 물건 원스톱 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="sticky top-0 z-[600] border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight">
                리디브<span className="text-blue-600">.</span>
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">정비사업 실거래·매물 플랫폼</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
                구역 탐색
              </Link>
              <Link href="/listings" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
                검증 매물
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
              >
                중개사 매물 등록
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          데모 데이터 기반 MVP · 실거래가·구역 경계는 공공 API 연동 시 실데이터로 교체됩니다 ·
          투자 판단은 본인 책임
        </footer>
      </body>
    </html>
  );
}
