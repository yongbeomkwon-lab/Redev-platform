import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Icon — 화면에 쓰는 최소한의 선 아이콘 (2026-11-21 리디자인)
//   · 이모지(🏠 🛰 📐 🏚 🏷 👁 🏁 🚇 📍)를 대신한다. 1.7px 선, 둥근 끝 —
//     지도 위 도구·검색 머리글처럼 작은 자리에서도 형태가 읽히게.
// ─────────────────────────────────────────────────────────────────────────────
export type IconName =
  | "home"
  | "image"
  | "grid"
  | "building"
  | "tag"
  | "check"
  | "pin"
  | "train"
  | "search"
  | "fit"
  | "lock";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.6 12 4l8 6.6" />
      <path d="M6.2 9.8V20h11.6V9.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="8.6" cy="10" r="1.3" />
      <path d="m4.4 17.2 4.4-4.1 3.3 3 2.9-2.6 5 4" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4h6.6v6.6H4zM13.4 4H20v6.6h-6.6zM4 13.4h6.6V20H4zM13.4 13.4H20V20h-6.6z" />
    </>
  ),
  building: (
    <>
      <path d="M5 20V6.6L12 4v16" />
      <path d="M12 9.4h7V20" />
      <path d="M7.9 8.8h1.1M7.9 11.8h1.1M7.9 14.8h1.1M14.8 12.2h1.5M14.8 15.2h1.5" />
      <path d="M3.4 20h17.2" />
    </>
  ),
  tag: (
    <>
      <path d="M4 4h7.1l8.9 8.9-7.1 7.1L4 11.1z" />
      <circle cx="8.2" cy="8.2" r="1.15" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.1" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.6s6.1-6 6.1-10.3A6.1 6.1 0 0 0 5.9 10.3c0 4.3 6.1 10.3 6.1 10.3Z" />
      <circle cx="12" cy="10.2" r="2.1" />
    </>
  ),
  train: (
    <>
      <rect x="6.2" y="3.6" width="11.6" height="12.9" rx="3" />
      <path d="M6.2 10.4h11.6" />
      <path d="m8.7 20 2-3.5M15.3 20l-2-3.5" />
      <path d="M9.8 6.9h4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 4 4" />
    </>
  ),
  lock: (
    <>
      <rect x="5.2" y="10.4" width="13.6" height="9.4" rx="2.2" />
      <path d="M8.5 10.4V7.9a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  // ‘서울 전체’ 리셋 — 네 모서리로 ‘화면 맞추기’를 뜻한다
  fit: (
    <>
      <path d="M4 9V4.8h4.2" />
      <path d="M20 9V4.8h-4.2" />
      <path d="M4 15v4.2h4.2" />
      <path d="M20 15v4.2h-4.2" />
    </>
  ),
};

export default function Icon({
  name,
  size = 14,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
