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
      {/* 헤더는 슬림(52px) — 지도 탐색 화면이 화면 전체를 쓰도록 위아래 여백을 최소화한다 */}
      <body className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 antialiased">
        <header className="sticky top-0 z-[700] h-[52px] shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight">
                리디브<span className="text-blue-600">.</span>
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">정비사업 실거래·매물 플랫폼</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/" className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100">
                구역 탐색
              </Link>
              <Link href="/listings" className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100">
                검증 매물
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-white hover:bg-blue-700"
              >
                중개사 매물 등록
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
