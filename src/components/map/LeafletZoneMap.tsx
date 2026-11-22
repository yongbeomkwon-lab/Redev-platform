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
import { CircleMarker, MapContainer, Marker, Pane, Polygon, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { isCompletedZone, type SeoulZone } from "@/lib/seoul-zones";
import type { MapZoneType } from "@/lib/types";
import { TYPE_COLORS, shortStage, shortZoneType, zoneStyle } from "./colors";
import Icon from "@/components/Icon";
import SubwayLayer from "./SubwayLayer";
import { SEOUL_BOUNDS, txPinKey, type AddressPin, type JibunPin, type StationPin, type LeafletZoneMapProps, type MyListingPin, type TxMapPin } from "./props";
import type { AuctionMapPin } from "@/lib/auction-pins";
import JibunPinCard from "./JibunPinCard";
import { addressPinHtml, stationPinHtml } from "./address-pin";

export { TYPE_COLORS };

const TILE_ADAPTERS = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · 지하철 노선·역 OpenStreetMap (ODbL)',
  },
};

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
      // 이미 구역 전체가 화면에 들어와 있으면(지도에서 직접 누른 경우 등) 화면을 흔들지 않는다 —
      //   카카오맵과 같은 규칙. ‘구역 전체 보기’(forced)일 때만 다시 맞춘다.
      const bounds = L.latLngBounds(ring as [number, number][]);
      if (!forced && map.getBounds().contains(bounds)) return;
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

/**
 * 지하철역 핀 — 주소 핀과 같은 방식(divIcon + 맨 위 pane)이고, 역 중심으로 확대한다.
 *   · 카카오맵 level 4 와 같은 체감을 주도록 zoom 15 로 맞춘다(주변 구역이 한눈에 보인다).
 */
function StationPinMarker({ pin }: { pin?: StationPin | null }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "redev-station-pin",
        html: pin ? stationPinHtml(pin) : "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    [pin]
  );
  const map = useMap();
  useEffect(() => {
    if (!pin) return;
    map.flyTo([pin.lat, pin.lng], Math.min(Math.max(map.getZoom(), 15), 16), { duration: 0.7 });
  }, [pin?.lat, pin?.lng, map]);
  if (!pin) return null;
  return (
    <Pane name="redevStationPin" style={{ zIndex: 901 }}>
      <Marker position={[pin.lat, pin.lng]} icon={icon} interactive={false} keyboard={false} />
    </Pane>
  );
}

/**
 * 매물 배지 — `🏠 매물 N`. 카카오맵(BADGE_LAYER_STYLE, z-index 100)과 같은 생김새로,
 * Leaflet 에서는 divIcon 마커로 폴리곤 캔버스(400)보다 위 pane(700)에 얹는다.
 * 누르면 그 구역 상세가 열린다(마커 클릭은 지도 클릭으로 번지지 않는다).
 */
function ListingBadges({
  zones,
  counts,
  onSelect,
}: {
  zones: SeoulZone[];
  counts: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const badges = useMemo(
    () =>
      zones
        .filter((z) => (counts[z.id] ?? 0) > 0 && z.center && Number.isFinite(z.center[0]))
        .map((z) => ({ id: z.id, name: z.name, count: counts[z.id], center: z.center })),
    [zones, counts]
  );
  if (badges.length === 0) return null;
  return (
    <Pane name="redevListingBadges" style={{ zIndex: 700 }}>
      {badges.map((b) => (
        <Marker
          key={b.id}
          position={b.center}
          icon={L.divIcon({
            className: "redev-listing-badge",
            html: `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:3px;border-radius:999px;border:1.5px solid #b45309;background:#fffbeb;color:#7c2d12;font-size:11px;font-weight:700;line-height:1;padding:3px 7px;white-space:nowrap;box-shadow:0 2px 8px rgba(16,24,40,.25);"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.6 12 4l8 6.6"/><path d="M6.2 9.8V20h11.6V9.8"/></svg> 매물 ${b.count}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
          eventHandlers={{ click: () => onSelect(b.id) }}
          keyboard={false}
        />
      ))}
    </Pane>
  );
}

/**
 * 실거래 가격 핀 — 카카오맵(z-index 95)과 같은 생김새(`7.8억 / 전용 59㎡`)로,
 * Leaflet 에서는 divIcon 마커로 폴리곤 캔버스(400)·매물 배지(700) 사이 pane(690)에 얹는다.
 * 마우스를 올리면 단지명·거래일·면적·평당가가 툴팁으로 뜬다.
 */
function TxPricePins({
  pins,
  activeKey,
  onSelect,
}: {
  pins: TxMapPin[];
  activeKey: string;
  onSelect?: (p: TxMapPin) => void;
}) {
  if (pins.length === 0) return null;
  return (
    <Pane name="redevTxPins" style={{ zIndex: 690 }}>
      {pins.map((p) => {
        const active = !!activeKey && txPinKey(p.umdNm, p.jibun) === activeKey;
        const accent = active ? "#0054a6" : p.kind === "연립·다세대" ? "#7c3aed" : "#1d4ed8";
        const name = p.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const area = (p.areaLabel || p.kind).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const bg = active ? "#f1f7fb" : "#fff";
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            keyboard={false}
            eventHandlers={{ click: () => onSelect?.(p) }}
            icon={L.divIcon({
              className: "redev-tx-pin",
              html: `<div class="${active ? "tx-price-pin is-active" : ""}" style="transform:translate(-50%,-100%);display:block;text-align:center;border:1.5px solid ${accent};border-left:4px solid ${accent};background:${bg};border-radius:6px;padding:2px 5px;white-space:nowrap;box-shadow:0 2px 7px rgba(15,23,42,.3);line-height:1.15;"><span style="display:block;font-size:${active ? 12 : 11}px;font-weight:800;color:${active ? "#0054a6" : "#0f172a"};">${p.priceLabel}</span><span style="display:block;font-size:9px;font-weight:600;color:#475569;">${active ? name : area}</span></div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          >
            <Tooltip direction="top" opacity={0.97}>
              <b>{name}</b> · {p.dealDate}
              <br />
              {p.kind} {p.areaLabel} · {p.priceLabel}
              {p.pyeongPrice ? ` · ${p.kind === "연립·다세대" ? "전용" : "평당"} ${p.pyeongPrice.toLocaleString()}만` : ""}
              {p.landPyeongPrice ? ` · 지분 ${p.landPyeongPrice.toLocaleString()}만` : ""}
            </Tooltip>
          </Marker>
        );
      })}
    </Pane>
  );
}

/**
 * ⚖️ 경매 물건 핀 — 카카오맵(z-index 96)과 같은 모양(`⚖️ 2.0억 / 11.24 · 유찰 1회`).
 *   · 같은 좌표의 호실은 buildAuctionPins 가 한 핀으로 묶어 넘긴다(쌍문동 507-1 109건 → 1핀).
 *   · 누르면 지도 말풍선 대신 **왼쪽 대시보드 창**에 그 핀의 물건 상세가 열린다.
 */
function AuctionPins({
  pins,
  onSelectPin,
  activeId,
}: {
  pins: AuctionMapPin[];
  onSelectPin?: (pin: AuctionMapPin) => void;
  activeId?: string | null;
}) {
  if (pins.length === 0) return null;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    <Pane name="redevAuctionPins" style={{ zIndex: 691 }}>
      {pins.map((p) => {
        const open = activeId === p.id;
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            keyboard={false}
            eventHandlers={{
              click: () => onSelectPin?.(p),
            }}
            icon={L.divIcon({
              className: "redev-auction-pin",
              html: `<div data-testid="auction-pin" data-auction-id="${esc(p.id)}" data-active="${open ? "1" : "0"}" style="transform:translate(-50%,-100%);display:block;text-align:center;border:1px solid ${open ? "#b45309" : "#f3c98b"};border-left:3px solid #b45309;background:${open ? "#fff7ed" : "#fffbeb"};border-radius:5px;padding:2px 5px;white-space:nowrap;box-shadow:0 2px 7px rgba(15,23,42,.3);line-height:1.15;"><span style="display:block;font-size:11px;font-weight:800;color:#7c2d12;">⚖️ ${esc(p.priceLabel)}</span><span style="display:block;font-size:9px;font-weight:600;color:#92400e;">${esc(p.subLabel)}</span></div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          />
        );
      })}
    </Pane>
  );
}


/** 5년 이력 창에서 고른 단지·지번으로 지도를 부드럽게 옮긴다 */
function PanToActiveTxPin({ pins, activeKey }: { pins: TxMapPin[]; activeKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!activeKey) return;
    const p = pins.find((x) => txPinKey(x.umdNm, x.jibun) === activeKey);
    if (p) map.panTo([p.lat, p.lng], { animate: true });
  }, [activeKey, pins, map]);
  return null;
}

/**
 * 지번 찍기 — 「📍 지번 찍기」 모드에서는 지도 클릭이 지번 핀으로 가고,
 * 기본 모드에서도 우클릭(컨텍스트 메뉴 막음)이 그 자리를 찍는다.
 */
function JibunPicker({
  on,
  onPick,
}: {
  on: boolean;
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const onRef = useRef(on);
  const pickRef = useRef(onPick);
  onRef.current = on;
  pickRef.current = onPick;
  useEffect(() => {
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (!onRef.current) return;
      L.DomEvent.stopPropagation(e);
      pickRef.current?.(e.latlng.lat, e.latlng.lng);
    };
    const onContext = (e: L.LeafletMouseEvent) => {
      pickRef.current?.(e.latlng.lat, e.latlng.lng);
    };
    const blockMenu = (ev: MouseEvent) => {
      if (pickRef.current) ev.preventDefault();
    };
    const el = map.getContainer();
    map.on("click", onMapClick);
    map.on("contextmenu", onContext);
    el.addEventListener("contextmenu", blockMenu);
    return () => {
      map.off("click", onMapClick);
      map.off("contextmenu", onContext);
      el.removeEventListener("contextmenu", blockMenu);
    };
  }, [map]);
  return null;
}

/** 찍은 지번 핀 — 오레오 블루 물결 핀 + 지번 카드 팝업 (카카오맵과 같은 DOM·클래스) */
function JibunPinLayer({
  pin,
  onClose,
  onOpenHistory,
  onOpenZone,
  historyLoading,
}: {
  pin: JibunPin | null;
  onClose?: () => void;
  onOpenHistory?: (pin: JibunPin) => void;
  onOpenZone?: (zoneId: string) => void;
  historyLoading?: boolean;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const lat = pin?.lat;
  const lng = pin?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    map.panTo([lat, lng], { animate: true });
    // 카드를 바로 펼친다 — 찍었는데 아무것도 안 보이면 실패처럼 느껴진다
    const t = window.setTimeout(() => markerRef.current?.openPopup(), 90);
    return () => window.clearTimeout(t);
  }, [lat, lng, map]);
  if (!pin) return null;
  return (
    <Pane name="redevJibunPin" style={{ zIndex: 697 }}>
      <Marker
        ref={markerRef}
        position={[pin.lat, pin.lng]}
        keyboard={false}
        icon={L.divIcon({
          className: "redev-jibun-pin",
          html: `<div style="transform:translate(-50%,-50%)"><div class="jibun-drop-pin"><span class="jibun-drop-pin-dot"></span><span class="jibun-drop-pin-ripple"></span><span class="jibun-drop-pin-ripple jibun-drop-pin-ripple-late"></span></div></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })}
      >
        <Popup maxWidth={280} autoPan>
          <JibunPinCard
            pin={pin}
            onClose={onClose}
            onOpenHistory={onOpenHistory}
            onOpenZone={onOpenZone}
            historyLoading={historyLoading}
          />
        </Popup>
      </Marker>
    </Pane>
  );
}

/**
 * 내 매물 핀 — 카카오맵(z-index 96)과 같은 생김새(`매 7.3억 / 다세대 · 전 52.88㎡`).
 *   · Leaflet 에서는 divIcon 마커로 폴리곤 캔버스(400)·매물 배지(700) 사이 pane(695)에 얹는다.
 *   · 클릭하면 매물 카드(주소·가격·면적·특징·부동산포스 매물번호·연락처)가 팝업으로 열리고,
 *     소속 정비구역이 있으면 그 구역 열기 버튼이 붙는다.
 */
function MyListingPins({ pins, onSelectZone }: { pins: MyListingPin[]; onSelectZone: (id: string) => void }) {
  if (pins.length === 0) return null;
  return (
    <Pane name="redevMyPins" style={{ zIndex: 695 }}>
      {pins.map((p) => {
        const accent = p.dealType === "매매" ? "#b45309" : p.dealType === "전세" ? "#0369a1" : "#7c3aed";
        const areaShort = (p.areaLabel || "").split("·")[0];
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            keyboard={false}
            icon={L.divIcon({
              className: "redev-my-pin",
              html: `<div style="transform:translate(-50%,-100%);display:block;text-align:center;border:1.5px solid ${accent};border-left:4px solid ${accent};background:#fff;border-radius:6px;padding:2px 5px;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,.32);line-height:1.15;"><span style="display:block;font-size:11px;font-weight:800;color:#0f172a;">${esc(p.priceLabel)}</span><span style="display:block;font-size:9px;font-weight:600;color:#475569;">${esc(p.propertyType)}${areaShort ? ` · ${esc(areaShort)}` : ""}</span></div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          >
            <Popup maxWidth={280} autoPan>
              <div style={{ fontSize: 11, lineHeight: 1.4, color: "#334155" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ background: accent, color: "#fff", borderRadius: 3, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>
                    내 매물
                  </span>
                  <b style={{ fontSize: 11, color: "#0f172a" }}>
                    {p.propertyType} · {p.dealType}
                  </b>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#94a3b8" }}>포스 {p.rfineNo}</span>
                </div>
                <div style={{ marginTop: 3, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{p.priceText}</div>
                <div style={{ marginTop: 2, fontSize: 10 }}>{p.address || p.jibunAddress}</div>
                <div style={{ fontSize: 10 }}>
                  {p.areaLabel}
                  {p.floor ? ` · ${p.floor}층` : ""}
                  {p.zoneName ? ` · ${p.zoneName}` : ""}
                </div>
                {p.feature && <div style={{ marginTop: 3, fontSize: 10 }}>{p.feature}</div>}
                <div style={{ marginTop: 3, fontSize: 9.5, color: "#64748b" }}>
                  부동산포스 {p.rfineNo} · 010-2758-5292
                </div>
                <div style={{ marginTop: 5, display: "flex", gap: 4 }}>
                  {p.zoneId && p.zoneName && (
                    <button
                      type="button"
                      onClick={() => onSelectZone(p.zoneId as string)}
                      style={{ flex: 1, border: `1px solid ${accent}`, background: "#fffbeb", color: accent, borderRadius: 6, padding: "3px 4px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                    >
                      {p.zoneName} 열기
                    </button>
                  )}
                  {p.detailUrl && (
                    <a
                      href={p.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ flex: 1, textAlign: "center", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155", borderRadius: 6, padding: "3px 4px", fontSize: 10, fontWeight: 700, textDecoration: "none" }}
                    >
                      부동산포스 상세 ↗
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </Pane>
  );
}

/** `/?my=<id>` 로 들어왔을 때 그 매물 핀으로 화면을 옮긴다 */
function FocusMyPin({ pins, focusId }: { pins: MyListingPin[]; focusId?: string | null }) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || last.current === focusId) return;
    last.current = focusId;
    const p = pins.find((v) => v.id === focusId);
    if (p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
  }, [focusId, pins, map]);
  return null;
}

/** 확대 수준을 상위로 알린다 — 줌이 바뀌면 선 굵기를 다시 계산한다 */function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
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
          properties: { id: z.id, name: z.name, alias: z.alias, type: z.type, kind: z.kind, stage: z.stage, gu: z.gu, area: z.area, boundaryApprox: z.boundaryApprox },
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
          isCompletedZone({ stage: (f?.properties?.stage as string) ?? "" }),
          !!f?.properties?.boundaryApprox
        ),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties as { id: string; name: string; type: string; kind: string; stage: string; gu: string; area: number };
        lyr.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(p.id);
        });
        // 호버 툴팁은 두지 않는다(2026-11-22 사용자 요청) — 같은 정보는 오른쪽 상세 패널에 있다.
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
        zoneStyle(
          p.type as SeoulZone["type"],
          p.id === selectedId,
          false,
          zoom,
          isCompletedZone({ stage: p.stage ?? "" }),
          !!p.boundaryApprox
        )
      );
    });
  }, [selectedId, zoom]);

  // 선택 구역만 이름표를 고정 표시 — 경계만으로는 어느 구역인지 읽기 어렵다
  const prevSelRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || prevSelRef.current === selectedId) return;
    prevSelRef.current = selectedId;
    layer.eachLayer((l) => {
      const path = l as L.Path & { feature?: GeoJSON.Feature };
      const p = path.feature?.properties as
        | { id: string; name: string; alias?: string[]; type: string; kind: string; stage: string; gu: string; area: number }
        | undefined;
      if (!p) return;
      if (p.id === selectedId) {
        // 선택 구역 이름표 — 지번 별칭(예: 사당동 419-1)도 함께 적어 지도에서 바로 대조되게 한다.
        // 앞의 사업유형 칩은 카카오 지도 기본 이름표와 같은 짧은 문구(신통기획 → ‘신속통합기획’).
        //   이름표는 카카오와 같이 흰 칩이고, 단계·지번은 이름 뒤 회색 글씨로 붙인다(선택해도 뱃지 색 그대로).
        const parcel = (p.alias ?? []).find((a) => /\d+-\d+/.test(a));
        const typeLabel = shortZoneType(p.type);
        const typeColor = TYPE_COLORS[p.type as MapZoneType] ?? "#64748b";
        const badge = typeLabel
          ? `<span class="zone-type-badge" style="background:${typeColor}">${typeLabel}</span>`
          : "";
        const sub = [shortStage(p.stage), parcel && !p.name.includes(parcel) ? parcel : null]
          .filter(Boolean)
          .join(" · ");
        path.unbindTooltip();
        path.bindTooltip(
          `${badge}<b>${p.name}</b>${sub ? `<span class="zone-name-sub"> · ${sub}</span>` : ""}`,
          {
            permanent: true,
            direction: "center",
            className: "zone-name-label",
            opacity: 1,
          }
        );
        path.openTooltip();
      } else if (path.getTooltip()) {
        // 선택을 풀면 고정 이름표만 걷는다 — 구역 위 호버 툴팁은 두지 않는다(오른쪽 상세 패널에 같은 정보).
        path.unbindTooltip();
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
  stationPin,
  zoneFitRequest,
  listingCounts = {},
  txPins = [],
  txPinsOn = true,
  onToggleTxPins,
  onSelectTxPin,
  activeTxPin,
  auctionPins = [],
  auctionPinsOn = false,
  onToggleAuctionPins,
  onSelectAuctionPin,
  activeAuctionPinId,
  jibunPickOn = false,
  onToggleJibunPick,
  onPickJibun,
  jibunPin,
  onCloseJibunPin,
  onOpenJibunHistory,
  onOpenJibunZone,
  jibunHistoryLoading = false,
  myPins = [],
  myPinsOn = false,
  onToggleMyPins,
  myFocusId,
  admin,
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

  // 선택 구역 — 대표 구역(상세 데이터) → 전수 구역 → 관리자 직접 그린 구역. 경계 미고시 후보지는 polygon이 없다.
  const selected = useMemo(() => {
    const f = zones.find((z) => z.id === selectedZoneId);
    if (f) return { ring: f.polygon, point: undefined as [number, number] | undefined };
    const s = seoulZones.find((z) => z.id === selectedZoneId);
    if (s) return { ring: s.polygon, point: s.polygon ? undefined : s.center };
    const c = admin?.zones?.find((z) => z.id === selectedZoneId);
    if (c && c.ring.length >= 3) return { ring: c.ring, point: undefined as [number, number] | undefined };
    return { ring: undefined, point: undefined };
  }, [zones, seoulZones, selectedZoneId, admin?.zones]);

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
          />
        ));
      })}

      {/* ── 경계 미고시 후보지 (점) ──
           · 광역 줌아웃(줌 13 이하 = 카카오 레벨 7 이상): 작은 위치 점(반지름 4px, 흰 테두리)만 —
             정상 폴리곤 구역을 큰 점선 원으로 덮지 않게
           · 동네 확대(줌 14 이상): 기존처럼 점선 원(반지름 9px) */}
      {pointZones.map((z) => {
        const sel = z.id === selectedZoneId;
        const farOut = zoom <= 13;
        const color = TYPE_COLORS[z.type] ?? "#7c3aed";
        if (farOut && !sel) {
          return (
            <CircleMarker
              key={`pt-${z.id}`}
              center={z.center}
              radius={4}
              pathOptions={{
                color: "#ffffff",
                weight: 1.1,
                opacity: 0.9,
                fillColor: color,
                fillOpacity: 0.92,
              }}
              eventHandlers={{ click: () => onSelectZone(z.id) }}
            >
              <Tooltip direction="top" permanent opacity={1} className="zone-name-label">
                <b>{z.name}</b>
                <span className="zone-name-sub"> · {z.stage} · 경계 미고시</span>
              </Tooltip>
            </CircleMarker>
          );
        }
        return (
          <CircleMarker
            key={`pt-${z.id}`}
            center={z.center}
            radius={sel ? 12 : 9}
            pathOptions={{
              color,
              weight: sel ? 3 : 2,
              opacity: 1,
              fillColor: color,
              fillOpacity: sel ? 0.55 : 0.3,
              dashArray: "4 3",
            }}
            eventHandlers={{ click: () => onSelectZone(z.id) }}
          >
            <Tooltip direction="top" permanent opacity={1} className="zone-name-label">
              <b>{z.name}</b>
              <span className="zone-name-sub"> · {z.stage} · 경계 미고시</span>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* ── 매물 배지 — 카카오맵과 같은 `🏠 매물 N` ── */}
      <ListingBadges zones={seoulZones} counts={listingCounts} onSelect={onSelectZone} />

      {/* ── 실거래 가격 핀 — 구역 상세의 ‘구역 내’ 거래 ── */}
      <TxPricePins
        pins={txPinsOn ? txPins : []}
        activeKey={activeTxPin ? txPinKey(activeTxPin.umdNm, activeTxPin.jibun) : ""}
        onSelect={onSelectTxPin}
      />
      <PanToActiveTxPin
        pins={txPinsOn ? txPins : []}
        activeKey={activeTxPin ? txPinKey(activeTxPin.umdNm, activeTxPin.jibun) : ""}
      />

      {/* ── ⚖️ 경매 물건 핀 — 구역 안(광역이면 매칭된 전체) 법원경매 물건 ── */}
      <AuctionPins
        pins={auctionPinsOn ? auctionPins : []}
        onSelectPin={onSelectAuctionPin}
        activeId={activeAuctionPinId ?? null}
      />

      {/* ── 지번 찍기 — 클릭/우클릭으로 찍은 자리에 오레오 블루 물결 핀 ── */}
      <JibunPicker on={jibunPickOn} onPick={onPickJibun} />
      <JibunPinLayer
        pin={jibunPin ?? null}
        onClose={onCloseJibunPin}
        onOpenHistory={onOpenJibunHistory}
        onOpenZone={onOpenJibunZone}
        historyLoading={jibunHistoryLoading}
      />

      {/* ── 내 매물 핀 — 「내 매물만 보기」가 켜졌을 때 63건 전체 ── */}
      <MyListingPins pins={myPinsOn ? myPins : []} onSelectZone={onSelectZone} />
      <FocusMyPin pins={myPinsOn ? myPins : []} focusId={myFocusId} />

      <FitSelected
        ring={selected.ring}
        point={selected.point}
        fitRequest={zoneFitRequest}
        skip={!!addressPin && !!selectedZoneId && addressPin.zoneId === selectedZoneId}
      />
      {/* ── 주소 검색 핀 — 맨 위 pane(불투명 카드 + 드롭핀) ── */}
      <AddressPinMarker pin={addressPin} />
      {/* ── 지하철역 핀 — 역 검색으로 고른 역 ── */}
      <StationPinMarker pin={stationPin} />
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

      {/* 관리자 모드인데 카카오맵이 없어 OSM으로 내려온 경우 — 그리기는 카카오맵에서만 된다는 안내 */}
      {admin && (
        <div className="absolute bottom-14 left-1/2 z-[600] max-w-[92vw] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-[11px] font-semibold leading-snug text-amber-900 shadow">
          관리자 모드의 구역 그리기·경계 수정은 <b>카카오맵</b>에서만 동작합니다. 지금은 OSM 대체 지도라 그린 구역이 이
          지도에 그려지지 않습니다(저장은 됨) — 카카오 JavaScript 키와 Web 도메인 등록을 확인하세요.
        </div>
      )}

      {/* 지도 위 토글 — 지하철 노선 · 준공 포함 (구역 클릭과 무관) */}
      <div className="absolute right-3 top-3 z-[600] flex flex-col items-end gap-1.5">
        {onToggleMyPins && myPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleMyPins}
            aria-pressed={myPinsOn}
            data-testid="my-listings-toggle"
            title={`내가 올린 매물 ${myPins.length}건만 지도에 표시`}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              myPinsOn
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="home" size={13} />
            내 매물만 보기 ({myPins.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowSubway((v) => !v)}
          aria-pressed={showSubway}
          title="지하철 노선·역명 표시"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
            showSubway
              ? "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
              : "border-line bg-white/80 text-slate-400 line-through hover:text-slate-600"
          }`}
        >
          <Icon name="train" size={13} />
          지하철 노선
        </button>
        {onToggleJibunPick && (
          <button
            type="button"
            onClick={onToggleJibunPick}
            aria-pressed={jibunPickOn}
            data-testid="jibun-pick-toggle"
            title="지번 찍기 — 지도를 누르면 그 자리의 지번·구역·실거래를 보여 줍니다"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              jibunPickOn
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <span aria-hidden className="text-[12px] leading-none">◉</span>
            지번 찍기
          </button>
        )}
        {onToggleTxPins && txPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleTxPins}
            aria-pressed={txPinsOn}
            data-testid="tx-pins-toggle"
            title="구역 안 실거래 가격 핀 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              txPinsOn
                ? "border-brand/35 bg-brand-tint text-brand"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="tag" size={13} />
            실거래 핀
            <span className="font-normal text-slate-400">{txPins.length}</span>
          </button>
        )}
        {onToggleAuctionPins && auctionPins.length > 0 && (
          <button
            type="button"
            onClick={onToggleAuctionPins}
            aria-pressed={auctionPinsOn}
            data-testid="auction-pins-toggle"
            title="구역 안 법원경매 물건을 ⚖️ 핀으로 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              auctionPinsOn
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <span aria-hidden className="text-[12px] leading-none">⚖️</span>
            경매 핀
            <span className="font-normal text-amber-700/70">{auctionPins.length}</span>
          </button>
        )}
        {onToggleCompleted && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={showCompleted}
            title="준공·입주까지 끝난 구역도 지도에 표시"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_16px_-10px_rgba(16,24,40,.3)] transition ${
              showCompleted
                ? "border-brand/35 bg-brand-tint text-brand"
                : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon name="check" size={13} />
            준공 포함
            {completedCount > 0 && <span className="font-normal text-slate-400">{completedCount}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
