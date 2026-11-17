"use client";
// ─────────────────────────────────────────────────────────────────────────────
// LeafletZoneMap — 서울시 정비구역 **전수** 경계 지도 (Leaflet + OpenStreetMap)
//
//  ▶ 지금은 **폴백(fallback)** 이다. 기본은 KakaoZoneMap(카카오맵 JS SDK)이고,
//    카카오 키·도메인이 준비되지 않아 SDK가 뜨지 않을 때만 이 지도로 내려온다.
//    (카카오맵이 뜨면 출구번호·건물명·스카이뷰·지적편집도가 기본으로 나온다)
//  ▶ 아래 설명은 Leaflet 구현 자체에 대한 것이며 그대로 유효하다.
//
// ▶ 경계 데이터 (public/data/zones.geojson — 클라이언트 fetch)
//    · 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 OA-22712 실경계
//    · 같은 구역이 「서울시 의제처리구역 위치정보」 OA-20957(UQ181)에 더 정밀한 필지 경계형
//      도형으로 있으면 그 도형을 쓴다 (EPSG:5174 → WGS84 변환·간략화)
//    · 갱신: python3 scripts/import-seoul-zones.py <UQ120 shp> <UQ181 shp>
//    · 구역계가 아직 고시되지 않은 후보지(예: 사당21구역)는 폴리곤이 없어 **점**으로 그린다
//      (없는 경계를 지어내지 않는다 — 정확한 도형은 구역 지정 뒤 UQ120/UQ181에 올라온다)
//  ▶ 렌더링: 1,800여 폴리곤을 SVG로 그리면 브라우저가 버티지 못하므로 Canvas 렌더러를 쓴다
//    (`preferCanvas: true` + `L.canvas({ padding: 0.5 })`). 줌·이동 시에도 끊김이 없다.
//  ▶ 지하철 노선·역명: 별도 캔버스 pane(SubwayLayer) — 기본 켜짐, 오른쪽 위 🚇 버튼으로 토글.
//    역이 어디인지가 재개발 상담의 첫 질문이라 구역 폴리곤과 같은 화면에 올린다.
//    데이터·재생성 방법은 scripts/README-subway.md
//  ▶ 준공 완료 구역(준공·준공(일부)·입주·사용승인 357곳)은 기본으로 숨긴다 — 이미 아파트가 된 구역이라
//    상담 대상이 아니다. 지도 위 ‘준공 포함’ 버튼을 켜면 점선으로 함께 보인다.
//    (필터는 ZoneExplorer가 하고, 이 컴포넌트는 넘겨받은 목록만 그린다)
//  ▶ 카카오맵/네이버맵으로 교체: 키 발급·도메인 등록 후 kakao.maps.Polygon으로
//    동일 렌더를 구현하고 MapPanel.tsx만 교체하면 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Pane, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { isCompletedZone, type SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS, zoneStyle } from "./colors";
import SubwayLayer from "./SubwayLayer";
import { SEOUL_BOUNDS, type AddressPin, type LeafletZoneMapProps } from "./props";
import { addressPinHtml } from "./address-pin";

export { TYPE_COLORS };

const TILE_ADAPTERS = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · 지하철 노선·역 OpenStreetMap (ODbL)',
  },
};

/** 툴팁 한 줄: 신림1구역 · 재정비촉진구역 · 사업시행인가 · 22.3만㎡ (관악구) */
function labelLine(z: { name: string; kind: string; stage: string; area: number; gu?: string }) {
  const area = z.area >= 10000 ? `${(z.area / 10000).toFixed(1)}만㎡` : `${z.area.toLocaleString()}㎡`;
  return `${z.name} · ${z.kind} · ${z.stage} · ${area}${z.gu ? ` (${z.gu})` : ""}`;
}

/** 지도 이동/선택 구역 확대 — 폴리곤 구역은 경계에 맞추고, 경계 미고시 후보지는 점으로 이동 */
function FitSelected({
  ring,
  point,
  fitRequest,
  skip,
}: {
  ring?: [number, number][];
  point?: [number, number];
  fitRequest?: number;
  /** 주소 핀으로 들어온 구역 — 핀 지점 확대를 유지하고 구역 전체로 넓히지 않는다 */
  skip?: boolean;
}) {
  const map = useMap();
  const lastReq = useRef<number | undefined>(undefined);
  useEffect(() => {
    // ‘구역 전체 보기’ 요청이 들어온 순간은 핀 화면이어도 구역 경계로 넓힌다
    const forced = fitRequest !== undefined && fitRequest !== lastReq.current;
    lastReq.current = fitRequest;
    if (skip && !forced) return;
    if (ring && ring.length >= 3) {
      map.flyToBounds(ring as [number, number][], { padding: [40, 40], maxZoom: 17, duration: 0.7 });
      return;
    }
    if (point) map.flyTo(point, 16, { duration: 0.7 });
  }, [ring, point, map, fitRequest, skip]);
  return null;
}

/**
 * 주소 검색 핀 — 카카오맵과 **같은 생김새**(불투명 흰 카드 + 드롭핀)로, 지도 위 맨 위 pane 에 얹는다.
 *   · Leaflet 기본 markerPane(600)·tooltipPane(650) 보다 위(900)라 구역 폴리곤 캔버스(400)에 덮이지 않는다.
 *   · divIcon 아이콘 크기를 0 으로 두고 HTML 이 스스로 translate(-50%,-100%) 로 좌표에 핀 끝을 맞춘다.
 */
function AddressPinMarker({ pin }: { pin?: AddressPin | null }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "redev-address-pin",
        html: pin ? addressPinHtml(pin) : "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    [pin]
  );
  const map = useMap();
  useEffect(() => {
    if (!pin) return;
    // 핀 지점 중심으로 확대 — 카카오맵(level 3~4)과 같은 체감. 이미 더 확대돼 있으면 그대로 둔다.
    map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 16), { duration: 0.7 });
  }, [pin?.lat, pin?.lng, map]);
  if (!pin) return null;
  return (
    <Pane name="redevAddressPin" style={{ zIndex: 900 }}>
      <Marker position={[pin.lat, pin.lng]} icon={icon} interactive={false} keyboard={false} />
    </Pane>
  );
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
        .filter((z): z is SeoulZone & { polygon: [number, number][] } => !z.featured && !!z.polygon)
        .map((z) => ({
          type: "Feature" as const,
          id: z.id,
          properties: { id: z.id, name: z.name, alias: z.alias, type: z.type, kind: z.kind, stage: z.stage, gu: z.gu, area: z.area },
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
          zoomRef.current,
          isCompletedZone({ stage: (f?.properties?.stage as string) ?? "" })
        ),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties as { id: string; name: string; type: string; kind: string; stage: string; gu: string; area: number };
        lyr.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(p.id);
        });
        lyr.bindTooltip(labelLine(p), { direction: "top", sticky: true, opacity: 0.95 });
      },
    }).addTo(map);    layerRef.current = layer;
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
      (l as L.Path).setStyle(
        zoneStyle(p.type as SeoulZone["type"], p.id === selectedId, false, zoom, isCompletedZone({ stage: p.stage ?? "" }))
      );
    });
  }, [selectedId, zoom]);

  // 선택 구역만 이름표를 고정 표시 — 경계만으로는 어느 구역인지 읽기 어렵다
  const prevSelRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || prevSelRef.current === selectedId) return;
    const prev = prevSelRef.current;
    prevSelRef.current = selectedId;
    layer.eachLayer((l) => {
      const path = l as L.Path & { feature?: GeoJSON.Feature };
      const p = path.feature?.properties as
        | { id: string; name: string; alias?: string[]; type: string; kind: string; stage: string; gu: string; area: number }
        | undefined;
      if (!p) return;
      if (p.id === selectedId) {
        // 선택 구역 이름표 — 지번 별칭(예: 사당동 419-1)도 함께 적어 지도에서 바로 대조되게 한다
        const parcel = (p.alias ?? []).find((a) => /\d+-\d+/.test(a));
        path.unbindTooltip();
        path.bindTooltip(parcel ? `<b>${p.name}</b><span class="zone-name-sub"> · ${parcel}</span>` : `<b>${p.name}</b>`, {
          permanent: true,
          direction: "center",
          className: "zone-name-label",
          opacity: 1,
        });
        path.openTooltip();
      } else if (p.id === prev || path.getTooltip()?.options.permanent) {
        path.unbindTooltip();
        path.bindTooltip(labelLine(p), { direction: "top", sticky: true, opacity: 0.95 });
      }
    });
  }, [selectedId, collection]);

  return null;
}

export default function LeafletZoneMap({
  zones,
  seoulZones,
  selectedZoneId,
  onSelectZone,
  showCompleted = false,
  onToggleCompleted,
  completedCount = 0,
  addressPin,
  zoneFitRequest,
  fallbackReason,
}: LeafletZoneMapProps) {
  // Canvas 렌더러 하나를 지도 전체가 공유한다.
  //  · 1,800여 폴리곤을 SVG로 그리면 프레임이 떨어진다 → Canvas.
  //  · 레이어마다 렌더러를 따로 만들면 <canvas>가 여러 장 겹쳐 맨 위 캔버스가
  //    클릭·호버를 가로챈다(아래 캔버스의 구역은 클릭이 안 됨). 그래서 지도 옵션으로 하나만 준다.
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const [zoom, setZoom] = useState(11);
  // 지하철 노선·역명 레이어 — 재개발 상담에서 “역세권인지”가 첫 질문이라 기본 ON
  const [showSubway, setShowSubway] = useState(true);

  // 선택 구역 — 대표 구역(상세 데이터) → 전수 구역 순. 경계 미고시 후보지는 polygon이 없다.
  const selected = useMemo(() => {
    const f = zones.find((z) => z.id === selectedZoneId);
    if (f) return { ring: f.polygon, point: undefined as [number, number] | undefined };
    const s = seoulZones.find((z) => z.id === selectedZoneId);
    if (!s) return { ring: undefined, point: undefined };
    return { ring: s.polygon, point: s.polygon ? undefined : s.center };
  }, [zones, seoulZones, selectedZoneId]);

  // 구역계가 아직 고시되지 않은 후보지(예: 사당21구역) — 폴리곤 대신 점으로 표시
  const pointZones = useMemo(() => seoulZones.filter((z) => !z.featured && !z.polygon), [seoulZones]);

  return (
    <div className="relative h-full w-full">
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

      {/* ── 지하철 노선·역명 (별도 캔버스 pane, 클릭 통과) ── */}
      <SubwayLayer enabled={showSubway} />

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

      {/* ── 경계 미고시 후보지 (점) ── */}
      {pointZones.map((z) => (
        <CircleMarker
          key={`pt-${z.id}`}
          center={z.center}
          radius={z.id === selectedZoneId ? 12 : 9}
          pathOptions={{
            color: TYPE_COLORS[z.type] ?? "#7c3aed",
            weight: z.id === selectedZoneId ? 3 : 2,
            opacity: 1,
            fillColor: TYPE_COLORS[z.type] ?? "#7c3aed",
            fillOpacity: z.id === selectedZoneId ? 0.55 : 0.3,
            dashArray: "4 3",
          }}
          eventHandlers={{ click: () => onSelectZone(z.id) }}
        >
          <Tooltip direction="top" permanent opacity={1} className="zone-name-label">
            <b>{z.name}</b>
            <span className="zone-name-sub"> · {z.stage} · 경계 미고시</span>
          </Tooltip>
        </CircleMarker>
      ))}

      <FitSelected
        ring={selected.ring}
        point={selected.point}
        fitRequest={zoneFitRequest}
        skip={!!addressPin && !!selectedZoneId && addressPin.zoneId === selectedZoneId}
      />
      {/* ── 주소 검색 핀 — 맨 위 pane(불투명 카드 + 드롭핀) ── */}
      <AddressPinMarker pin={addressPin} />
      </MapContainer>

      {/* 카카오맵을 쓸 수 없어 OSM으로 표시 중이라는 안내 (작게, 지도 조작은 그대로) */}
      {fallbackReason && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 z-[600] -translate-x-1/2 rounded-full bg-slate-900/70 px-2.5 py-1 text-[10px] font-semibold text-white shadow"
          title={
            fallbackReason === "key-missing"
              ? "카카오 JavaScript 앱 키가 설정되지 않았습니다 (NEXT_PUBLIC_KAKAO_MAP_APP_KEY)"
              : fallbackReason === "sdk-error" || fallbackReason === "script-error"
                ? "카카오맵 SDK를 열지 못했습니다 — 앱 키 종류(JavaScript 키)·Web 도메인 등록을 확인하세요"
                : fallbackReason === "timeout"
                  ? "카카오맵 SDK 응답이 없어 OSM 지도로 표시합니다"
                  : "카카오맵 생성 실패로 OSM 지도로 표시합니다"
          }
        >
          지도: OpenStreetMap · 카카오맵 대기
        </div>
      )}

      {/* 지도 위 토글 — 지하철 노선 · 준공 포함 (구역 클릭과 무관) */}
      <div className="absolute right-3 top-3 z-[600] flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setShowSubway((v) => !v)}
          aria-pressed={showSubway}
          title="지하철 노선·역명 표시"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
            showSubway
              ? "border-slate-300 bg-white text-slate-800"
              : "border-slate-300 bg-white/80 text-slate-400 line-through hover:text-slate-600"
          }`}
        >
          <span aria-hidden>🚇</span>
          지하철 노선
        </button>
        {onToggleCompleted && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={showCompleted}
            title="준공·입주까지 끝난 구역도 지도에 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-md transition ${
              showCompleted
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-slate-300 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            <span aria-hidden>{showCompleted ? "👁" : "🏁"}</span>
            준공 포함
            {completedCount > 0 && <span className="font-normal text-slate-400">{completedCount}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
