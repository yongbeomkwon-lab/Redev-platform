"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneMap — 서울시 정비구역 **전수** 경계 지도 (Leaflet + OpenStreetMap, API 키 불필요)
//
// ▶ 경계 데이터 (public/data/zones.geojson — 클라이언트 fetch)
//    · 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 OA-22712 실경계
//    · 같은 구역이 「서울시 의제처리구역 위치정보」 OA-20957(UQ181)에 더 정밀한 필지 경계형
//      도형으로 있으면 그 도형을 쓴다 (EPSG:5174 → WGS84 변환·간략화)
//    · 갱신: python3 scripts/import-seoul-zones.py <UQ120 shp> <UQ181 shp>
//  ▶ 렌더링: 1,800여 폴리곤을 SVG로 그리면 브라우저가 버티지 못하므로 Canvas 렌더러를 쓴다
//    (`preferCanvas: true` + `L.canvas({ padding: 0.5 })`). 줌·이동 시에도 끊김이 없다.
//  ▶ 카카오맵/네이버맵으로 교체: 키 발급·도메인 등록 후 kakao.maps.Polygon으로
//    동일 렌더를 구현하고 MapPanel.tsx만 교체하면 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/lib/types";
import type { SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS, zoneStyle } from "./colors";

export { TYPE_COLORS };

/** 서울시 경계 (지도 초기 화면) */
const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [37.428, 126.764],
  [37.702, 127.184],
];

const TILE_ADAPTERS = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
};

/** 툴팁 한 줄: 신림1구역 · 재정비촉진구역 · 사업시행인가 · 22.3만㎡ (관악구) */
function labelLine(z: { name: string; kind: string; stage: string; area: number; gu?: string }) {
  const area = z.area >= 10000 ? `${(z.area / 10000).toFixed(1)}만㎡` : `${z.area.toLocaleString()}㎡`;
  return `${z.name} · ${z.kind} · ${z.stage} · ${area}${z.gu ? ` (${z.gu})` : ""}`;
}

/** 지도 이동/선택 구역 확대 */
function FitSelected({ ring }: { ring?: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!ring || ring.length < 3) return;
    map.flyToBounds(ring as [number, number][], { padding: [40, 40], maxZoom: 17, duration: 0.7 });
  }, [ring, map]);
  return null;
}

/** 확대 수준을 상위로 알린다 — 줌이 바뀌면 선 굵기를 다시 계산한다 */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onChange(map.getZoom());
    handler();
    map.on("zoomend", handler);
    return () => {
      map.off("zoomend", handler);
    };
  }, [map, onChange]);
  return null;
}

/** 전수 레이어 — L.geoJSON 한 겹을 Canvas로 그린다(수천 개 폴리곤도 부드럽게). */
function SeoulZoneLayer({
  zones,
  selectedId,
  zoom,
  onSelect,
}: {
  zones: SeoulZone[];
  selectedId?: string;
  zoom: number;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const selectedRef = useRef<string | undefined>(selectedId);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 서울시 전체 구역 GeoJSON (properties의 id로 선택 구역을 찾는다)
  const collection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: zones
        .filter((z) => !z.featured)
        .map((z) => ({
          type: "Feature" as const,
          id: z.id,
          properties: { id: z.id, name: z.name, type: z.type, kind: z.kind, stage: z.stage, gu: z.gu, area: z.area },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[...z.polygon, z.polygon[0]].map(([lat, lng]) => [lng, lat])],
          },
        })),
    };
  }, [zones]);

  useEffect(() => {
    const layer = L.geoJSON(collection, {
      interactive: true,
      style: (f) =>
        zoneStyle(
          (f?.properties?.type ?? "일반재개발") as SeoulZone["type"],
          f?.properties?.id === selectedRef.current,
          false,
          zoomRef.current
        ),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties as { id: string; name: string; type: string; kind: string; stage: string; gu: string; area: number };
        lyr.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(p.id);
        });
        lyr.bindTooltip(labelLine(p), { direction: "top", sticky: true, opacity: 0.95 });
      },
    }).addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [collection, map]);

  // 선택·줌 변경 → 폴리곤 스타일만 갱신 (레이어 재생성 없이)
  useEffect(() => {
    selectedRef.current = selectedId;
    zoomRef.current = zoom;
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const p = (l as L.Path & { feature?: GeoJSON.Feature }).feature?.properties;
      if (!p) return;
      (l as L.Path).setStyle(zoneStyle(p.type as SeoulZone["type"], p.id === selectedId, false, zoom));
    });
  }, [selectedId, zoom]);

  return null;
}

export type ZoneMapProps = {
  /** 대표 구역 (상세 데이터 보유 — 실거래·매물 포함) */
  zones: Zone[];
  /** 서울시 정비구역 전수 */
  seoulZones: SeoulZone[];
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
};

export default function ZoneMap({ zones, seoulZones, selectedZoneId, onSelectZone }: ZoneMapProps) {
  // Canvas 렌더러 하나를 지도 전체가 공유한다.
  //  · 1,800여 폴리곤을 SVG로 그리면 프레임이 떨어진다 → Canvas.
  //  · 레이어마다 렌더러를 따로 만들면 <canvas>가 여러 장 겹쳐 맨 위 캔버스가
  //    클릭·호버를 가로챈다(아래 캔버스의 구역은 클릭이 안 됨). 그래서 지도 옵션으로 하나만 준다.
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const [zoom, setZoom] = useState(11);

  const selectedRing = useMemo(() => {
    const f = zones.find((z) => z.id === selectedZoneId);
    if (f) return f.polygon;
    return seoulZones.find((z) => z.id === selectedZoneId)?.polygon;
  }, [zones, seoulZones, selectedZoneId]);

  return (
    <MapContainer
      bounds={SEOUL_BOUNDS}
      boundsOptions={{ padding: [8, 8] }}
      minZoom={9}
      maxZoom={18}
      className="h-full w-full"
      scrollWheelZoom
      preferCanvas // Path 레이어는 모두 Canvas로
      renderer={canvasRenderer} // 전수 레이어·대표 구역이 함께 쓰는 단일 Canvas(padding 0.5)
      style={{ borderRadius: "0.75rem", background: "#eef2f7" }}
    >
      <TileLayer url={TILE_ADAPTERS.osm.url} attribution={TILE_ADAPTERS.osm.attribution} />

      {/* ── 서울시 정비구역 전수 (Canvas) ── */}
      <ZoomWatcher onChange={setZoom} />
      <SeoulZoneLayer zones={seoulZones} selectedId={selectedZoneId} zoom={zoom} onSelect={onSelectZone} />

      {/* ── 대표 구역 (상세 데이터 있는 6곳 — 굵은 테두리로 강조) ── */}
      {zones.map((zone) => {
        const active = zone.id === selectedZoneId;
        const rings = [zone.polygon, ...(zone.parts ?? [])];
        return rings.map((ring, i) => (
          <Polygon
            key={`fg-${zone.id}-${i}`}
            positions={ring}
            pathOptions={zoneStyle(zone.type, active, true, zoom)}
            eventHandlers={{ click: () => onSelectZone(zone.id) }}
          >
            <Tooltip direction="top" sticky>
              <b>{zone.name}</b> · {zone.type} · {zone.stage}
            </Tooltip>
          </Polygon>
        ));
      })}

      <FitSelected ring={selectedRing} />
    </MapContainer>
  );
}
