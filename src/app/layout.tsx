import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "리디브(redev) — 서울 재개발 구역·매물 플랫폼",
  description:
    "서울 정비구역 실거래가 조회(무료), 중개사 매물 등록(유료), 검증 매물 열람(유료) — 재개발 입주권·조합원 물건 원스톱 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* 지마켓 산스 — 화면에 먼저 필요한 두 굵기만 미리 받는다(교체 전 깜빡임 방지) */}
      <head>
        <link
          rel="preload"
          href="/fonts/gmarket/GmarketSansMedium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/gmarket/GmarketSansBold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      {/* 헤더는 슬림(52px) — 지도 탐색 화면이 화면 전체를 쓰도록 위아래 여백을 최소화한다 */}
      <body className="flex min-h-dvh flex-col bg-canvas text-ink antialiased">
        <header className="sticky top-0 z-[700] h-[52px] shrink-0 border-b border-line bg-white">
          <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-[19px] font-extrabold leading-none tracking-[-0.03em] text-ink">
                리디브<span className="text-brand">.</span>
              </span>
              <span className="hidden text-[11px] font-medium tracking-[-0.01em] text-slate-500 sm:inline">
                서울 정비사업 실거래·매물
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
