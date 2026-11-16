"use client";
// 지도 패널 — 브라우저 전용 라이브러리(카카오맵 SDK / Leaflet)를 쓰므로 SSR 비활성 후 동적 로드.
// (핵심: dynamic(..., { ssr: false }) 없이는 서버 빌드에서 window 오류 발생)
// 엔진 선택(카카오맵 ↔ OSM 폴백)은 ZoneMap 이 한다.
import dynamic from "next/dynamic";
import type { ZoneMapProps } from "./props";

const ZoneMap = dynamic(() => import("./ZoneMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
      지도를 불러오는 중…
    </div>
  ),
});

export default function MapPanel(props: ZoneMapProps) {
  return <ZoneMap {...props} />;
}
