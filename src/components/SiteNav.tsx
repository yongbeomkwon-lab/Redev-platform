"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SiteNav — 상단 내비게이션 (2026-11-22 커뮤니티 추가)
//   · 지도 화면(/), 검증 매물(/listings), 판례 리포트(/cases), 법령·조례(/laws),
//     입주물량(/supply), 커뮤니티(/community) + CTA(중개사 매물 등록) +
//     로그인/회원가입(HeaderAuth)
//   · 판례 리포트는 매주 월요일 정비사업 판례를 올리는 자리 — 지금은 현금청산 전용
//     (2026-11-23 개편). 첫 화면에서 바로 들어갈 수 있게 메뉴에 두고, 옆의 점이 업데이트 표시다.
//   · 지금 있는 화면은 오레오 블루 밑줄로 표시한다.
//   · 폰에서는 이름을 줄여 한 줄에 담는다(지도·매물·판례·커뮤 / 등록).
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";
import HeaderAuth from "@/components/auth/HeaderAuth";

const LINKS = [
  { href: "/", label: "구역 탐색", short: "지도" },
  { href: "/listings", label: "검증 매물", short: "매물" },
  { href: "/cases", label: "판례 리포트", short: "판례", note: true },
  // 2026-11-28 신설 — 도정법·서울시 조례·빈집법 조문 검색(상담 중 조문 확인용)
  { href: "/laws", label: "법령·조례", short: "법령" },
  // 2026-11-27 신설 — 정비사업 연도별·자치구별 예상 입주물량(아실 스타일)
  { href: "/supply", label: "입주물량", short: "입주" },
  { href: "/community", label: "커뮤니티", short: "커뮤" },
];

export default function SiteNav() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="flex shrink-0 items-center gap-0 whitespace-nowrap text-[12.5px] font-medium sm:gap-1 sm:text-[13px]">
      {LINKS.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "relative flex items-center gap-1 rounded-md px-1 py-1.5 transition-colors sm:px-2.5 " +
              (active
                ? "text-brand after:absolute after:inset-x-1.5 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-brand sm:after:inset-x-2"
                : "text-slate-600 hover:bg-slate-50 hover:text-ink")
            }
          >
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
            {l.note && (
              <span
                aria-hidden
                title="매주 월요일 업데이트"
                className="hidden h-[5px] w-[5px] rounded-full bg-accent sm:inline-block"
              />
            )}
          </Link>
        );
      })}
      <Link
        href="/register"
        className="ml-0.5 rounded-md bg-brand px-1.5 py-1.5 text-white transition-colors hover:bg-brand-deep sm:ml-1.5 sm:px-2.5"
      >
        <span className="sm:hidden">등록</span>
        <span className="hidden sm:inline">중개사 매물 등록</span>
      </Link>
      <div className="ml-0.5 sm:ml-1">        <HeaderAuth />
      </div>
    </nav>
  );
}
