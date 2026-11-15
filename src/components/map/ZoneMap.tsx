"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneMap — 구역 경계 폴리곤 지도 (Leaflet + OpenStreetMap 타일, API 키 불필요)
//
// ▶ 실무 교체 가이드 (scripts/README-gis.md에 상세):
//   1) 실제 구역 경계: 서울 열린데이터광장 / VWorld WFS GeoJSON을
//      public/data/zones.geojson으로 두고 fetch()로 로드하면 된다.
//      (현재는 sample.ts의 polygon이 실 위·경도 기반 근사 샘플)
//   2) 카카오맵/네이버맵으로 교체: 키 발급·도메인 등록 후 kakao.maps.Map +
//      kakao.maps.Polygon로 동일 렌더를 구현하고 MapPanel.tsx만 교체하면 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/lib/types";
import { TYPE_COLORS } from "./colors";

export { TYPE_COLORS };

/**
 * 타일 어댑터 — 주석 해제로 교체.
 *  - OSM: 무료, 키 불필요 (MVP 기본). 실제 서울 도로·동네 이름이 그대로 보인다.
 *  - VWorld: 국토지리정보원 API 키 필요 (국내 도로/항공 정밀)
 *  - Kakao/Naver: JS SDK 기반 지도(kakao.maps.Polygon 등)로 교체
 *  * CARTO 베이스맵은 키 없이 호출하면 "API KEY REQUIRED" 워터마크가 찍혀 제외했다.
 */
const TILE_ADAPTERS = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
  // vworld: {
  //   url: "https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_KEY}/Base/{z}/{y}/{x}.png",
  //   attribution: "국토지리정보원 VWorld",
  // },
};

function FitSelected({ zone }: { zone?: Zone }) {
  const map = useMap();
  useEffect(() => {
    if (zone) {
      map.flyTo(zone.center, 15, { duration: 0.8 });
    }
  }, [zone, map]);
  return null;
}

export type ZoneMapProps = {
  zones: Zone[];
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
};

export default function ZoneMap({ zones, selectedZoneId, onSelectZone }: ZoneMapProps) {
  const selected = zones.find((z) => z.id === selectedZoneId);
  return (
    <MapContainer
      center={[37.52, 126.98]}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
      style={{ borderRadius: "0.75rem" }}
    >
      <TileLayer url={TILE_ADAPTERS.osm.url} attribution={TILE_ADAPTERS.osm.attribution} />
      {zones.map((zone) => {
        const active = zone.id === selectedZoneId;
        const color = TYPE_COLORS[zone.type];
        return (
          <Polygon
            key={zone.id}
            positions={zone.polygon}
            pathOptions={{
              color,
              weight: active ? 3 : 1.5,
              fillColor: color,
              fillOpacity: active ? 0.35 : 0.18,
            }}
            eventHandlers={{ click: () => onSelectZone(zone.id) }}
          >
            <Tooltip direction="top" sticky>
              <b>{zone.name}</b> · {zone.type} · {zone.stage}
            </Tooltip>
          </Polygon>
        );
      })}
      <FitSelected zone={selected} />
    </MapContainer>
  );
}
