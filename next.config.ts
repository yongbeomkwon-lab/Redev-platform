import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 개발 모드의 Next.js 배지(N 아이콘)를 끈다 — 화면 왼쪽 아래 지도 도구·범례와 겹쳐
  // 클릭을 가로챘다. 배포 빌드에는 원래 나오지 않는다.
  devIndicators: false,
};

export default nextConfig;
