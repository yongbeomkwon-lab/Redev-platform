"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneMap — 서울시 실제 정비구역 경계 지도 (Leaflet + OpenStreetMap, API 키 불필요)
//
// ▶ 경계 데이터
//    · 배경 레이어: 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 OA-22712
//      실경계 150여 곳 (public/data/zones.geojson, EPSG:5174 → WGS84 변환·간략화)
//    · 대표 구역: src/data/zones-geo.json (같은 원천, 고정밀 폴리곤)
//    데이터 갱신: python3 scripts/import-seoul-zones.py <shp 디렉터리>
//  ▶ 카카오맵/네이버맵으로 교체: 키 발급·도메인 등록 후 kakao.maps.Polygon으로
//    동일 렌더를 구현하고 MapPanel.tsx만 교체하면 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone, ZoneType } from "@/lib/types";
import { TYPE_COLORS } from "./colors";

export { TYPE_COLORS };

/**
 * 타일 어댑터 — 주석 해제로 교체.
 *  - OSM: 무료, 키 불필요 (MVP 기본). 실제 서울 도로·동네 이름이 그대로 보인다.
 *  - VWorld: 국토지리정보원 API 키 필요 (국내 도로/항공 정밀)
 *  * CARTO 베이스맵은 키 없이 호출하면 "API KEY REQUIRED" 워터마크가 찍혀 제외했다.
 */
const TILE_ADAPTERS = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
};

/** 배경 레이어 구역 (public/data/zones.geojson) */
type BgZone = {
  id: string;
  name: string;
  type: ZoneType;
  gu: string;
  stage: string;
  kind: string;
  area: number;
  center: [number, number];
  polygon: [number, number][];
  parts?: [number, number][][];
  featured: boolean;
};

/** 텍스트 예: 신림1구역 · 재정비촉진구역 · 사업시행인가 · 22.3만㎡ */
function labelLine(z: { name: string; kind: string; stage: string; area: number }) {
  const area = z.area >= 10000 ? `${(z.area / 10000).toFixed(1)}만㎡` : `${z.area.toLocaleString()}㎡`;
  return `${z.name} · ${z.kind} · ${z.stage} · ${area}`;
}

function FitSelected({ zone }: { zone?: Zone }) {
  const map = useMap();
  useEffect(() => {
    if (!zone) return;
    const ring = zone.polygon.length > 2 ? zone.polygon : [zone.center];
    map.flyToBounds(ring as [number, number][], { padding: [40, 40], maxZoom: 17, duration: 0.8 });
  }, [zone, map]);
  return null;
}

export type ZoneMapProps = {
  zones: Zone[];
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
};

export default function ZoneMap({ zones, selectedZoneId, onSelectZone }: ZoneMapProps) {
  const [bg, setBg] = useState<BgZone[]>([]);
  const selected = zones.find((z) => z.id === selectedZoneId);

  // 서울시 실경계 배경 레이어 (정적 GeoJSON)
  useEffect(() => {
    let alive = true;
    fetch("/data/zones.geojson")
      .then((r) => r.json())
      .then((fc: { features: { id: string; properties: Omit<BgZone, "polygon" | "parts" | "center">; geometry: { type: string; coordinates: unknown } }[] }) => {
        if (!alive) return;
        const list: BgZone[] = fc.features.map((f) => {
          const toLatLng = (ring: number[][]) => ring.map(([lng, lat]) => [lat, lng] as [number, number]);
          const g = f.geometry;
          const rings: [number, number][][] =
            g.type === "MultiPolygon"
              ? (g.coordinates as number[][][][]).map((poly) => toLatLng(poly[0]))
              : [toLatLng((g.coordinates as number[][][])[0])];
          return { ...f.properties, id: f.id, polygon: rings[0], ...(rings.length > 1 ? { parts: rings.slice(1) } : {}), center: [0, 0] };
        });
        setBg(list);
      })
      .catch(() => setBg([]));
    return () => {
      alive = false;
    };
  }, []);

  // 배경 레이어에서 대표 구역과 같은 id는 대표 폴리곤(정밀)으로만 그린다
  const featuredIds = useMemo(() => new Set(zones.map((z) => z.id)), [zones]);
  const backgroundZones = useMemo(() => bg.filter((z) => !(z.featured && featuredIds.has(z.id))), [bg, featuredIds]);

  return (
    <MapContainer
      center={[37.535, 126.98]}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
      style={{ borderRadius: "0.75rem" }}
    >
      <TileLayer url={TILE_ADAPTERS.osm.url} attribution={TILE_ADAPTERS.osm.attribution} />

      {/* ── 서울시 실제 정비구역 전체 배경 ── */}
      {backgroundZones.map((z) => {
        const color = TYPE_COLORS[z.type] ?? "#64748b";
        const rings = [z.polygon, ...(z.parts ?? [])];
        return rings.map((ring, i) => (
          <Polygon
            key={`bg-${z.id}-${i}`}
            positions={ring}
            pathOptions={{
              color,
              weight: z.featured ? 1.6 : 1,
              opacity: 0.75,
              fillColor: color,
              fillOpacity: z.featured ? 0.14 : 0.1,
            }}
            eventHandlers={{ click: () => featuredIds.has(z.id) && onSelectZone(z.id) }}
          >
            <Tooltip direction="top" sticky>
              {labelLine(z)} <span className="text-slate-400">({z.gu})</span>
            </Tooltip>
          </Polygon>
        ));
      })}

      {/* ── 대표 구역 (상세 데이터 있는 구역) ── */}
      {zones.map((zone) => {
        const active = zone.id === selectedZoneId;
        const color = TYPE_COLORS[zone.type];
        const rings = [zone.polygon, ...(zone.parts ?? [])];
        return rings.map((ring, i) => (
          <Polygon
            key={`fg-${zone.id}-${i}`}
            positions={ring}
            pathOptions={{
              color,
              weight: active ? 3.5 : 2,
              fillColor: color,
              fillOpacity: active ? 0.4 : 0.28,
            }}
            eventHandlers={{ click: () => onSelectZone(zone.id) }}
          >
            <Tooltip direction="top" sticky>
              <b>{zone.name}</b> · {zone.type} · {zone.stage}
            </Tooltip>
          </Polygon>
        ));
      })}

      <FitSelected zone={selected} />
    </MapContainer>
  );
}
