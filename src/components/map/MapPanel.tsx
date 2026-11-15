"use client";
// Leaflet은 window 전용 라이브러리이므로 SSR 비활성 후 동적 로드.
// (핵심: dynamic(..., { ssr: false }) 없이는 서버 빌드에서 window 오류 발생)
import dynamic from "next/dynamic";
import type { ZoneMapProps } from "./ZoneMap";

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
