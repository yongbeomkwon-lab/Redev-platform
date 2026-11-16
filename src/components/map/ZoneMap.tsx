"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneMap — 지도 진입점 (엔진 선택)
//
//  · 기본: **카카오맵 JS SDK** (KakaoZoneMap) — 지하철 출구번호·건물명·스카이뷰·지적편집도가
//    카카오 기본지도에 그대로 나온다.
//  · 폴백: 카카오 키가 없거나, 키 종류가 다르거나(예: ADMIN_KEY), Web 도메인 미등록,
//    네트워크 차단으로 SDK를 못 열면 **Leaflet/OSM 지도**(LeafletZoneMap)로 내려간다.
//    지도가 비어 보이는 것보다 낫고, 어떤 이유로 폴백했는지 지도 위에 작게 알린다.
//
//  ▶ 지도 엔진을 바꾸려면 이 파일만 보면 된다. 탐색기(ZoneExplorer)는 props 계약만 안다.
// ─────────────────────────────────────────────────────────────────────────────
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { MapFailReason, ZoneMapProps } from "./props";
import { loadKakaoSdk } from "./kakao-loader";

function MapLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
      지도를 불러오는 중…
    </div>
  );
}

const KakaoZoneMap = dynamic(() => import("./KakaoZoneMap"), { ssr: false, loading: MapLoading });
const LeafletZoneMap = dynamic(() => import("./LeafletZoneMap"), { ssr: false, loading: MapLoading });

type Status =
  | { kind: "loading" }
  | { kind: "kakao" }
  | { kind: "osm"; reason: MapFailReason; detail?: string };

export default function ZoneMap(props: ZoneMapProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    loadKakaoSdk().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setStatus({ kind: "kakao" });
        return;
      }
      if (r.detail) console.warn(`[지도] 카카오맵 SDK를 열지 못해 OSM으로 표시합니다 (${r.reason}) — ${r.detail}`);
      setStatus({ kind: "osm", reason: r.reason, detail: r.detail });
    });
    return () => {
      alive = false;
    };
  }, []);

  // SDK는 열렸는데 지도 생성이 실패한 경우(도메인/키 문제)도 OSM으로 내려간다
  const handleFail = useCallback((reason: MapFailReason, detail?: string) => {
    console.warn(`[지도] 카카오맵 생성 실패 → OSM 폴백 (${reason})${detail ? ` — ${detail}` : ""}`);
    setStatus({ kind: "osm", reason, detail });
  }, []);

  if (status.kind === "loading") return <MapLoading />;
  if (status.kind === "kakao") return <KakaoZoneMap {...props} onFail={handleFail} />;
  return <LeafletZoneMap {...props} fallbackReason={status.reason} />;
}
