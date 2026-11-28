"use client";
// ─────────────────────────────────────────────────────────────────────────────
// MobileTabBar — 폰 전용 하단 고정 탭 (2026-11-28)
//   홈 · 지도 · 검색 · 법령·판례 · 내 정보 — 한 손 엄지로 바로 전환한다.
//   · 높이는 globals.css 의 `--mtab-h`(56px + 안전영역)와 같다. 본문 아래 여백과
//     지도 높이(ZoneExplorer)가 같은 값을 쓰므로 탭 바가 화면을 가리지 않는다.
//   · 데스크톱(md 이상)에는 나오지 않는다 — PC 는 지금까지의 상단 메뉴 그대로.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";

export type MobileTab = "home" | "map" | "search" | "laws" | "me";

const ICONS: Record<MobileTab, ReactNode> = {
  home: (
    <>
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M6.3 9.6V20h11.4V9.6" />
      <path d="M10 20v-5.2h4V20" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.6 3.8 6.8v12.6L9 17.2l6 2.2 5.2-2.2V4.6L15 6.8z" />
      <path d="M9 4.6v12.6M15 6.8v12.6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.5 15.5 4.2 4.2" />
    </>
  ),
  laws: (
    <>
      <path d="M12 4.4v15.2M6.4 19.6h11.2" />
      <path d="M4 8.2h16" />
      <path d="M4 8.2 6.9 14h-5.8zM20 8.2 22.9 14h-5.8z" />
      <circle cx="12" cy="6.2" r="1.6" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8.4" r="3.9" />
      <path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" />
    </>
  ),
};

const ITEMS: { key: MobileTab; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "map", label: "지도" },
  { key: "search", label: "검색" },
  { key: "laws", label: "법령·판례" },
  { key: "me", label: "내 정보" },
];

export default function MobileTabBar({
  active,
  onSelect,
}: {
  active: MobileTab | null;
  onSelect: (tab: MobileTab) => void;
}) {
  return (
    <nav
      aria-label="리디브 하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-[750] border-t border-line bg-white/97 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
    >
      <ul className="flex h-[56px] items-stretch">
        {ITEMS.map((it) => {
          const on = active === it.key;
          return (
            <li key={it.key} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(it.key)}
                aria-current={on ? "page" : undefined}
                className={
                  "flex h-full w-full flex-col items-center justify-center gap-[3px] transition-colors " +
                  (on ? "text-brand" : "text-slate-500 active:text-slate-800")
                }
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={on ? 2.1 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  {ICONS[it.key]}
                </svg>
                <span className={"text-[10px] leading-none " + (on ? "font-bold" : "font-medium")}>
                  {it.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
