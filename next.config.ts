import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────────────────────
// 배포본 식별자 — 정적 데이터(/data/*.geojson)의 브라우저·CDN 캐시를 배포마다 끊는다.
//   · Vercel 은 배포마다 VERCEL_GIT_COMMIT_SHA(또는 VERCEL_DEPLOYMENT_ID)를 넣어 준다.
//   · 로컬 빌드에는 없으므로 시각 기반 값을 써서 개발 중에도 캐시가 물지 않게 한다.
// ─────────────────────────────────────────────────────────────────────────────
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  `dev-${Date.now()}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 개발 모드의 Next.js 배지(N 아이콘)를 끈다 — 화면 왼쪽 아래 지도 도구·범례와 겹쳐
  // 클릭을 가로챘다. 배포 빌드에는 원래 나오지 않는다.
  devIndicators: false,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // 구역 경계 데이터는 배포 직후 항상 최신이어야 한다.
  //   · 프론트엔드도 `?v=<빌드ID>` + cache:'no-store' 로 요청하지만,
  //   · 아이패드 Safari 처럼 정적 자산을 오래 물고 있는 브라우저를 위해 응답 헤더로도 막는다.
  async headers() {
    return [
      {
        source: "/data/zones.geojson",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
