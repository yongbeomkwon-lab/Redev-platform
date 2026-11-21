import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BrandLogo — 리디브 1번 시안(구역 폴리곤 + 핀) 헤더 락업
//   · 심볼은 인라인 SVG. 작은 크기용 작도(선 굵게·핀 확대)를 써서 24px 에서도
//     폴리곤과 핀이 뭉개지지 않는다. 파비콘(src/app/icon.svg)과 같은 좌표계.
//   · 워드마크는 Gmarket Sans Bold 실텍스트 — 화면 배율에서 선명하고 낭독기가 읽는다.
// ─────────────────────────────────────────────────────────────────────────────
export default function BrandLogo({
  size = 24,
  showWordmark = true,
  className = "",
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  const wordStyle: CSSProperties = {
    fontSize: Math.round(size * 0.8),
    lineHeight: 1,
  };

  return (
    <span className={"inline-flex items-center gap-[6px] " + className}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="shrink-0 text-brand"
      >
        <g transform="translate(16,16) scale(0.118332) translate(-4.7,-2.5)">
          <polygon
            points="-110.9,18.8 -99.6,-80.8 -15,-110.9 88.4,-103.4 120.3,-15 97.8,75.2 -11.3,110.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="18"
            strokeLinejoin="round"
          />
          <circle cx="-110.9" cy="18.8" r="13" fill="currentColor" />
          <circle cx="120.3" cy="-15" r="13" fill="currentColor" />
          <g transform="translate(2,-6) scale(1.06) translate(0,-4)">
            <path
              d="M 0 72 C -17.59 27 -45 23.4 -45 0 A 45 45 0 1 1 45 0 C 45 23.4 17.59 27 0 72 Z M -15.5 0 A 15.5 15.5 0 1 0 15.5 0 A 15.5 15.5 0 1 0 -15.5 0 Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </g>
        </g>
      </svg>
      {showWordmark && (
        <span className="font-extrabold tracking-[-0.03em] text-ink" style={wordStyle}>
          리디브
        </span>
      )}
    </span>
  );
}
