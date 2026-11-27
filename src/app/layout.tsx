import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import SiteNav from "@/components/SiteNav";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

const SITE_URL = "https://redev-platform-iota.vercel.app";
const SHARE_TITLE = "리디브 · 서울 정비사업 실거래·경매·매물 지도";
const SHARE_DESCRIPTION =
  "서울 2,400여 개 재개발·재건축 구역경계, 5년 실거래, 법원경매, 구역 그려서 분석까지 한눈에";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "리디브",
  title: "리디브(redev) — 서울 재개발 구역·매물 플랫폼",
  description:
    "서울 정비구역 실거래가 조회(무료), 중개사 매물 등록(유료), 검증 매물 열람(유료) — 재개발 입주권·조합원 물건 원스톱 플랫폼",
  // 카카오톡·스레드·커뮤니티에 링크를 붙였을 때 뜨는 미리보기 카드
  openGraph: {
    type: "website",
    siteName: "리디브",
    locale: "ko_KR",
    url: "/",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "리디브 — 서울 정비사업 실거래·경매·매물 지도",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: ["/og-image.png"],
  },
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
        {/* 로그인 상태·로그인 창은 앱 전체가 공유한다(헤더·커뮤니티·지도 구역 패널) */}
        <AuthProvider>
        <header className="sticky top-0 z-[700] h-[52px] shrink-0 border-b border-line bg-white">
          <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap" aria-label="리디브 홈">
              {/* 1번 시안(구역 폴리곤 + 핀) 심볼 + 리디브 워드마크 */}
              <BrandLogo size={24} />
              <span className="hidden text-[11px] font-medium tracking-[-0.01em] text-slate-500 sm:inline">
                서울 정비사업 실거래·매물
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
