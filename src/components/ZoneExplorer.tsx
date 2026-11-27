"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneExplorer — 메인 탐색기 (지도 중심 · 전체 화면 레이아웃)
//  · 네이버지도처럼 **지도가 화면 전체**를 채우고,
//    검색·필터·범례·구역 상세는 지도 위에 떠 있는 패널로 올린다.
//  · 구역현황 스타일: 유형/단계 필터 칩 + 구역 요약 뱃지(등록매물수·최저가·최저 초기투자금)
//  · 구역 상세 스타일: 사업개요·추진경과 타임라인·실거래 배수 분석·매물 비교
//  · 실거주 의무/토허제 뱃지, 예상 입주 구간
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing, MapZoneType, Transaction, Zone, ZoneStage } from "@/lib/types";
import { STAGE_ORDER, calcInitialInvestment, calcMultiple } from "@/lib/types";
import {
  loadSeoulZones,
  refreshSeoulZones,
  zonesDataChanged,
  isCompletedZone,
  type SeoulZone,
  type SeoulZonesMeta,
} from "@/lib/seoul-zones";
import { getProvider } from "@/lib/data-provider";
import { man } from "@/lib/format";
import MapPanel from "@/components/map/MapPanel";
import type { RecentZone } from "@/lib/dev-pressure";
import { TYPE_COLORS, TYPE_INK, TYPE_TINT } from "@/components/map/colors";
import { clearLastView, readLastView, urlPinsView, writeLastView, type StoredView } from "@/components/map/last-view";
import Icon from "@/components/Icon";
import ZoneOfficialPanel from "@/components/ZoneOfficialPanel";
import ZoneVitalStats from "@/components/ZoneVitalStats";
import ZoneTransactions from "@/components/ZoneTransactions";
import LandPermitNotice from "@/components/LandPermitNotice";
import { Badge, StageBadge, TypeBadge } from "@/components/Badges";
import { looksLikeAddress, searchAddresses, type AddressCandidate } from "@/lib/kakao-address";
import { fetchParcel, type Parcel } from "@/lib/parcel";
import { loadSubwayStations, lineNames, SUBWAY_LINES, searchStations, type SubwayStation } from "@/lib/subway-stations";
import { distanceM } from "@/components/map/prepare-zones";
import {
  judgeAddress,
  meters,
  prepareAllZones,
  verdictHeadline,
  zoneByJibunName,
  zonesAtAddress,
  type AddressVerdict,
} from "@/lib/address-verdict";
import type {
  AddressPin,
  AdminMapConfig,
  AdminZoneShape,
  DistrictStat,
  JibunPin,
  MapViewPoint,
  MyListingPin,
  StationPin,
  TxMapPin,
} from "@/components/map/props";
import BuildingTradeHistory from "@/components/BuildingTradeHistory";
import type { BuildingHistoryResponse, BuildingTradeKind, BuildingTradeTarget, MolitTransaction } from "@/lib/molit";
import { reverseGeocode } from "@/lib/kakao-address";
import { ListingCompare } from "@/components/ListingCompare";
import { UnlockModal } from "@/components/ListingUnlockModal";
import { ZoneListingCards } from "@/components/ZoneListingCards";
import ZoneAuctions from "@/components/ZoneAuctions";
import ZoneTalk from "@/components/community/ZoneTalk";
import AuctionDetailCard from "@/components/AuctionDetailCard";
import { formatWon, formatSaleDate, loadAuctions, countAuctionSales, type AuctionItem, type AuctionsData } from "@/lib/auctions";
import { buildAuctionPins, type AuctionMapPin } from "@/lib/auction-pins";
import {
  LISTINGS_CHANGED_EVENT,
  listingCountsByZoneId,
  listingMatchesZone,
} from "@/lib/custom-listings";
import { MY_LISTINGS, MY_LISTINGS_AS_OF, isMyListing, myPinFromListing } from "@/lib/my-listings";
// 지도 위 `🏠 매물 N` 배지 노출 스위치 — 지금은 초기 화면에서 숨김(마이페이지에서 되살린다)
import { SHOW_MAP_LISTING_BADGES } from "@/lib/zone-listing-badges";
import { AdminDrawToolbar, AdminZonePanel, type AdminMetaForm } from "@/components/AdminZonePanel";
import ZoneConsent from "@/components/ZoneConsent";
import {
  ADMIN_STORAGE_KEY,
  CUSTOM_ZONE_TYPES,
  customZoneColor,
  customZonesToGeoJSON,
  deleteCustomZoneFromDb,
  exportFileName,
  formatArea,
  isCustomZoneShared,
  loadAllCustomZones,
  loadCustomZones,
  newCustomZoneId,
  pushCustomZoneToDb,
  ringAreaSqm,
  saveCustomZones,
  type CustomZone,
  type CustomZoneType,
} from "@/lib/custom-zones";
import { applyCustomZoneOverrides, customOverrideFor } from "@/lib/zone-overrides";
import { parseConsentRate } from "@/lib/consent";
import { loadRecentTx } from "@/lib/tx-recent";

const ZONE_TYPES: (MapZoneType | "전체")[] = [
  "전체",
  "재건축",
  "일반재개발",
  "공공재개발",
  "신통기획",
  "모아타운",
  "도공복",
  "민간도심복합(성장거점형)",
  "민간도심복합(주거중심형)",
  "가로주택",
  "소규모",
  "역세권",
  "장기전세",
  "지주택",
];
const STAGES: (ZoneStage | "전체")[] = ["전체", "추진위원회", "사업계획승인", "관리처분", "이주·철거", "착공", "준공"];

/** 범례 11색 — 같은 색으로 묶인 소분류(민간도심복합 성장거점·주거중심, 가로주택·소규모)는
 *  한 줄로 합쳐 세고, 사람이 쓰는 이름으로 적는다. */
const LEGEND_GROUPS: { label: string; color: string; types: MapZoneType[] }[] = [
  { label: "재건축", color: TYPE_COLORS["재건축"], types: ["재건축"] },
  { label: "일반재개발", color: TYPE_COLORS["일반재개발"], types: ["일반재개발"] },
  { label: "공공재개발", color: TYPE_COLORS["공공재개발"], types: ["공공재개발"] },
  { label: "신속통합기획", color: TYPE_COLORS["신통기획"], types: ["신통기획"] },
  { label: "모아타운", color: TYPE_COLORS["모아타운"], types: ["모아타운", "모아타운통합기획"] },
  { label: "도공복", color: TYPE_COLORS["도공복"], types: ["도공복"] },
  {
    label: "민간도심복합",
    color: TYPE_COLORS["민간도심복합(성장거점형)"],
    types: ["민간도심복합(성장거점형)", "민간도심복합(주거중심형)"],
  },
  { label: "가로주택·소규모", color: TYPE_COLORS["가로주택"], types: ["가로주택", "소규모"] },
  { label: "역세권", color: TYPE_COLORS["역세권"], types: ["역세권"] },
  { label: "장기전세", color: TYPE_COLORS["장기전세"], types: ["장기전세"] },
  { label: "지주택", color: TYPE_COLORS["지주택"], types: ["지주택"] },
];

/** 주소 자동완성 줄에 붙는 구역명 — 어느 구역을 찾았는지와 그 근거를 함께 들고 다닌다 */
type AddrZoneBadge = {
  name: string;
  type: MapZoneType;
  completed: boolean;
  /** 겹친 구역 수 — 2곳 이상이면 '+N' 으로 접고 title 에 전부 적는다 */
  count: number;
  /** 경계 도형이 아니라 '동+지번 = 구역 이름'으로 찾은 경우(경계 미고시·보정 경계) */
  byJibun: boolean;
  /** 마우스를 올리면 보이는 설명(구역명·단계·근거) */
  title: string;
};

/**
 * 주소 자동완성 줄의 구역명 배지.
 *   · 사업유형 색은 지도 폴리곤·상세 패널 뱃지와 같은 팔레트를 쓴다 — 어느 구역인지 색으로도 이어진다.
 *   · 준공 구역과 '지번 기준'으로 찾은 구역은 슬레이트로 눌러 쓴다(진행 중 구역과 헷갈리지 않게).
 *   · 주소가 길어도 배지는 줄지 않게 두고, 주소 쪽을 말줄임한다(구역명이 이 기능의 핵심).
 */
function AddressZoneBadge({ badge }: { badge: AddrZoneBadge }) {
  const muted = badge.completed || badge.byJibun;
  const color = TYPE_COLORS[badge.type] ?? "#64748B";
  const ink = muted ? "#475569" : TYPE_INK[badge.type] ?? "#334155";
  const tint = muted ? "#F1F5F9" : TYPE_TINT[badge.type] ?? "#F1F5F9";
  return (
    <span
      data-testid="address-zone-badge"
      title={badge.title}
      className="inline-flex max-w-[54%] shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-[2px] text-[11px] font-bold leading-[14px]"
      style={{ backgroundColor: tint, color: ink, boxShadow: `inset 0 0 0 1px ${color}30` }}
    >
      <i
        aria-hidden
        className="h-[5px] w-[5px] shrink-0 rounded-full"
        style={{ backgroundColor: muted ? "#94A3B8" : color }}
      />
      {badge.completed && <span className="shrink-0 opacity-70">준공</span>}
      <span className="min-w-0 truncate">{badge.name}</span>
      {badge.count > 1 && <span className="shrink-0 opacity-70">+{badge.count - 1}</span>}
    </span>
  );
}

/**
 * YYYYMM 이 지금부터 몇 달 전인가 — `/api/transactions/building` 의 `offset` 과 같은 셈법(0 = 이번 달).
 *   국토부 호출 한도로 비어 버린 달을 그 달만 다시 물어볼 때 쓴다.
 */
function monthOffsetOf(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return -1;
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth() - (y * 12 + (m - 1));
}

export default function ZoneExplorer() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  // 서울시 정비구역 전수 (public/data/zones.geojson → 클라이언트 fetch)
  //   · 화면이 쓰는 `seoulZones` 는 관리자 저장본을 덮어쓴 목록이다(아래 useMemo).
  //     여기 상태는 서울시 원본만 담는다.
  const [seoulZonesBase, setSeoulZonesBase] = useState<SeoulZone[]>([]);
  const [seoulMeta, setSeoulMeta] = useState<SeoulZonesMeta | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MapZoneType | "전체">("전체");
  const [stageFilter, setStageFilter] = useState<ZoneStage | "전체">("전체");
  // ── 마지막으로 보던 화면 (2026-11-27 사용자 요청) ────────────────────────────
  //   · 첫 렌더에서 localStorage(`redev_last_view_v1`)를 한 번만 읽는다.
  //     주소가 특정 구역(`?zone=`)·매물(`?my=`)을 지정했으면 그 주소가 이긴다 — 링크가 목적한
  //     곳을 먼저 보여 줘야 한다.
  //   · 지도에는 `initialView` 로 넘겨, 서울 전체로 맞췄다가 다시 옮기는 깜빡임 없이
  //     닫기 직전 화면에서 바로 시작한다. (렌더 결과에는 쓰지 않아 SSR 불일치도 없다)
  const [bootView] = useState<StoredView | null>(() =>
    typeof window === "undefined" || urlPinsView() ? null : readLastView()
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  // 준공 완료 구역 표시 여부 — 기본은 숨김(진행 중 구역만 보여준다)
  const [showCompleted, setShowCompleted] = useState(false);
  // ── 매물 필터 ────────────────────────────────────────────────────────────
  //   · listingsOnly: 매물이 있는 구역만 지도에 남긴다
  //   · leaseOnly / noPermit: 매물 조건(임대사업자 승계 · 토허제 없음)으로 구역을 거른다
  //     → 지도 배지의 숫자도 같은 조건으로 센다(필터와 배지가 다른 말을 하지 않게).
  const [listingsOnly, setListingsOnly] = useState(false);
  const [leaseOnly, setLeaseOnly] = useState(false);
  const [noPermit, setNoPermit] = useState(false);
  // ── 내 매물만 보기 ────────────────────────────────────────────────────────
  //   · 부동산포스에 올린 권용범 대표 매물(`src/data/my-listings.json` 63건)만 남긴다.
  //   · 켜면: 내 매물이 있는 구역만 지도에 남기고, 63건 전체를 가격 핀으로 찍는다
  //            (정비구역 밖 일반 매물도 포함). 화면은 서울 전체로 넓힌다.
  //   · 끄면: 기존 2,400곳 서울 전체 재개발 지도로 즉시 돌아간다.
  const [myOnly, setMyOnly] = useState(false);
  const [seoulFitRequest, setSeoulFitRequest] = useState(0);
  /** 매물 목록에서 `/?my=<id>` 로 들어온 핀 — 지도가 그 핀을 펼친다 */
  const [myFocusId, setMyFocusId] = useState<string | null>(null);
  // 지도 위 떠 있는 패널 열림 상태
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 범례는 첫 접속에 접힌 채로 시작한다 — 지도를 최소한만 가리는 '범례' 바(칩)만 남기고,
  //   누르면 펼쳐진다(2026-11-27 요청, 데스크톱·모바일 공통).
  const [legendOpen, setLegendOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  // ── 주소 검색 → 소속 구역 판별 ─────────────────────────────────────────────
  //   입력이 주소 형태면 카카오 주소 검색 결과를 드롭다운에 함께 보여주고,
  //   후보를 고르면(또는 엔터) 전체 구역 폴리곤에 대고 포함 여부를 판정한다.
  const [addrCandidates, setAddrCandidates] = useState<AddressCandidate[]>([]);
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrNote, setAddrNote] = useState<string | null>(null);
  const [addrVerdict, setAddrVerdict] = useState<AddressVerdict | null>(null);
  // ── 필지(지적) 경계 — 주소로 고른 지점의 필지를 지도에 파랗게 칠한다(2026-11-23 요청) ──
  //   · 주소 후보를 고르거나 지도에서 지번을 찍으면 /api/parcel 로 그 지점의 필지를 받아 온다.
  //   · 실패해도 주소 핀은 그대로다 — 카드에 한 줄로만 알린다.
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [parcelNote, setParcelNote] = useState<string | null>(null);
  /** 마지막 필지 요청 번호 — 주소를 빠르게 연달아 고를 때 늦게 온 응답을 버린다 */
  const parcelSeqRef = useRef(0);
  // ── 지하철역 검색 ─────────────────────────────────────────────────────
  //   역 이름(‘사당역’·‘건대입구’)으로 574개 역을 찾아 지도를 그 역으로 확대하고,
  //   역 주변 정비구역을 목록으로 보여준다(구역 선택으로 바로 이어진다).
  const [stations, setStations] = useState<SubwayStation[]>([]);
  const [stationPick, setStationPick] = useState<SubwayStation | null>(null);
  // ‘구역 전체 보기’ 요청 토큰 — 주소 핀은 핀 지점을 확대해 보여주므로, 구역 경계 전체는 버튼으로 본다.
  // 값이 바뀔 때마다 지도가 선택 구역 경계에 화면을 맞춘다(카카오맵·OSM 공통).
  const [zoneFitRequest, setZoneFitRequest] = useState(0);
  // ── 지도 실거래 가격 핀 ────────────────────────────────────────────────
  //   · 구역 상세의 실거래 목록(ZoneTransactions)이 지번을 좌표로 바꿔 **구역 안 거래**만
  //     넘겨 준다. 표시 상태(ON/OFF)는 지도 위 토글이 바꾸도록 여기서 갖는다.
  const [txPins, setTxPins] = useState<TxMapPin[]>([]);
  // 첫 접속에는 **꺼진 상태**로 시작한다(2026-11-27 사용자 요청: 지도 첫 화면이 가격표로 덮여
  //   구역 경계·이름이 안 보인다). 지도 위 「실거래」 토글을 누르면 예전처럼 모두 표시된다.
  const [txPinsOn, setTxPinsOn] = useState(false);
  // ── 지도 전체 실거래 가격표 ─────────────────────────────────────────────
  //   · 국토부 신고 최근 3개월을 건물(법정동+지번) 단위로 묶은 정적 데이터(lib/tx-recent.ts).
  //   · 구역을 고르지 않아도 지도 어디에나 가격표가 뜨게 하는 것이 기본값이다(토글로 끈다).
  const [recentTxPins, setRecentTxPins] = useState<TxMapPin[]>([]);
  const [recentTxLoading, setRecentTxLoading] = useState(true);
  const [recentTxMeta, setRecentTxMeta] = useState<{ asOf?: string; months?: number } | null>(null);
  // ── 단지·건물 5년 실거래 이력 창 ─────────────────────────────────────
  //   · 지도 실거래 핀 또는 실거래 목록의 아파트·연립다세대 행을 누르면 그 단지의 5년 흐름이 열린다.
  //   · 열려 있는 동안 지도의 그 지번 핀을 강조(activeTxPin)하고 지도를 그쪽으로 옮긴다.
  const [buildingTarget, setBuildingTarget] = useState<BuildingTradeTarget | null>(null);
  // ── 「📍 지번 찍기」 ─────────────────────────────────────────────────
  //   · 켜면 지도 클릭이 구역 선택 대신 그 자리의 지번 핀을 꽂는다(아이패드·터치에서 필요).
  //   · 기본 모드에서도 우클릭·구역 밖 클릭은 지번 핀으로 간다.
  // ── ✏️ 구역 그려서 분석 (일반 방문자) ────────────────────────────────────
  //   · 지도에서 꼭짓점을 찍어 만든 링을 /api/zone-stats·/api/zone-stats/precise 로 분석한다.
  //   · 저장하지 않는다 — 화면 메모리 상태뿐이다(관리자 그리기·공용 DB 와 별개).
  const [zoneDrawOn, setZoneDrawOn] = useState(false);
  const [zoneDrawPoints, setZoneDrawPoints] = useState<[number, number][]>([]);
  const [zoneDrawDone, setZoneDrawDone] = useState<[number, number][] | null>(null);
  /** ⚡ 최근 변동 구역 — public/data/recent-zones.json (scripts/build-recent-zones.py) */
  const [recentZones, setRecentZones] = useState<RecentZone[]>([]);
  // ── 구역 내 법원경매 물건 (public/data/auctions.json) ─────────────
  //   대법원 법원경매정보에서 받아 지번 좌표로 구역 경계와 매칭해 둔 데이터.
  //   구역 상세 패널에 「⚖️ 구역 내 진행 경매 N건」으로 붙고, 지도에는 고른 물건만 핀으로 찍는다.
  const [auctions, setAuctions] = useState<AuctionsData | null>(null);
  /** 지도에 위치를 보여 줄 경매 물건(「📍 지도 위치」를 누른 것) */
  const [auctionFocus, setAuctionFocus] = useState<AuctionItem | null>(null);
  /**
   * ⚖️ 왼쪽 대시보드 창에 띄운 경매 물건 — 지도 핀을 누르면 그 핀의 물건 묶음이 들어온다.
   *   · 예전의 지도 말풍선 카드(AuctionPinCard)를 대신한다. 닫으면 null.
   *   · items 는 같은 좌표에 묶인 물건 전부(카드 안에서 전환), activeId 는 지금 펼친 물건.
   */
  const [auctionDetail, setAuctionDetail] = useState<{
    pinId: string;
    zoneId: string;
    items: AuctionItem[];
    activeId: string;
  } | null>(null);
  /** 오른쪽 패널의 경매 목록에서 강조·스크롤할 물건 — 「구역 경매 목록에서 보기」가 정한다 */
  const [auctionListFocus, setAuctionListFocus] = useState<{ id: string; token: number } | null>(null);
  /**
   * ⚖️ 지도 경매 핀 표시 — **첫 접속에는 꺼진 상태**로 시작한다(2026-11-27 사용자 요청).
   *   예전(2026-11-22)에는 서울 전체에서도 기본 ON 이었으나, ⚖️ 핀이 실거래 가격표와 겹쳐
   *   지도 첫 화면이 덮였다. 지도 위 「⚖️ 경매 핀」 토글을 누르면 예전처럼 모두 보인다.
   *   · 경매 목록·핀에서 구역으로 들어오면 그때는 명시적으로 켠다(pickZone opts.auction).
   */
  const [auctionPinsOn, setAuctionPinsOn] = useState(false);
  const [jibunPickOn, setJibunPickOn] = useState(false);
  const [jibunPin, setJibunPin] = useState<JibunPin | null>(null);
  const [jibunProbing, setJibunProbing] = useState(false);
  /** 주소 검색 결과의 지번 — 주소 카드에서도 「이 지번 실거래 5년 보기」를 연다 */
  const [addrJibun, setAddrJibun] = useState<{ gu: string; dong: string; jibun: string } | null>(null);
  /** 지번 실거래 조회 안내(거래 없음·조회 실패) — 지번 핀 카드와 주소 카드가 함께 본다 */
  const [jibunNote, setJibunNote] = useState<string | null>(null);
  const jibunSeqRef = useRef(0);

  // 첫 화면 패널 데이터 — 최근 반영 구역 6곳
  useEffect(() => {
    let alive = true;
    fetch(`/data/recent-zones.json?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID || "dev")}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ zones: RecentZone[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setRecentZones((d.zones ?? []).slice(0, 6));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ── 관리자 모드(?admin=1) ────────────────────────────────────────────────
  //   일반 방문자는 이 상태가 모두 비어 있어 화면이 기존과 똑같다.
  const [adminMode, setAdminMode] = useState(false);
  /** 이 브라우저에 저장된 관리자 구역 */
  const [customZones, setCustomZones] = useState<CustomZone[]>([]);
  /**
   * 화면이 보는 서울시 구역 목록 = 서울시 원본 + 관리자 저장본 덮어쓰기.
   *   · 관리자 화면에서 사업유형·추진단계·경계를 고쳐 저장하면 지도 칩·상세 패널·검색이
   *     **바로** 그 값으로 바뀐다(예전에는 관리자 화면의 반투명 도형에만 반영됐다).
   *   · 덮어쓸 저장본이 없으면 applyCustomZoneOverrides 가 원본 배열을 그대로 돌려준다.
   */
  const seoulZones = useMemo(
    () => applyCustomZoneOverrides(seoulZonesBase, customZones),
    [seoulZonesBase, customZones]
  );
  /** 지금 그리는/고치는 초안 */
  const [draft, setDraft] = useState<{
    points: [number, number][];
    editingId?: string;
    replacesZoneId?: string;
    replacesName?: string;
    replacesArea?: number;
  } | null>(null);
  /**
   * 구역 정보 입력 폼 — ‘경계·정보 수정’을 누르면 초안과 함께 바로 열린다(경계를 안 고쳐도
   * 사업유형·추진단계만 바꿔 저장할 수 있게). 새로 그릴 때는 ✓ 완료를 누른 뒤 열린다.
   */
  const [adminMeta, setAdminMeta] = useState<AdminMetaForm | null>(null);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [selectedCustomId, setSelectedCustomId] = useState<string | undefined>(undefined);
  const [adminFit, setAdminFit] = useState<{ id: string; token: number } | null>(null);

  // 진입: ?admin=1 → localStorage 에 기억. 이후 방문은 주소에 없어도 관리자 모드로 열린다.
  useEffect(() => {
    let url: URL | null = null;
    try {
      url = new URL(window.location.href);
    } catch {
      url = null;
    }
    const q = url?.searchParams.get("admin") ?? null;
    if (q === "1") {
      try {
        window.localStorage.setItem(ADMIN_STORAGE_KEY, "1");
      } catch {
        /* 저장 불가(사생활 모드)해도 이번 화면은 관리자 모드 */
      }
      setAdminMode(true);
    } else if (q === "0") {
      try {
        window.localStorage.removeItem(ADMIN_STORAGE_KEY);
      } catch {
        /* 무시 */
      }
      setAdminMode(false);
    } else {
      try {
        setAdminMode(window.localStorage.getItem(ADMIN_STORAGE_KEY) === "1");
      } catch {
        setAdminMode(false);
      }
    }
    setCustomZones(loadCustomZones());
    // 공용 DB(Supabase)의 관리자 구역까지 불러와 합친다 — 실패해도 이 브라우저 저장분으로 계속 돈다
    void loadAllCustomZones()
      .then((zs) => setCustomZones(zs))
      .catch(() => {});
  }, []);

  // 좁은 화면에서는 상세 패널을 접은 채로 시작해 지도를 가리지 않게 한다
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelOpen(false);
      setLegendOpen(false);
    }
  }, []);

  useEffect(() => {
    const p = getProvider();
    Promise.all([p.getZones(), p.getTransactions(), p.getListings()])
      .then(([z, t, l]) => {
        setZones(z);
        setTransactions(t);
        setListings(l);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 매물이 바뀌면(등록·삭제) 목록을 다시 읽어 지도 배지·카드에 바로 반영한다
  useEffect(() => {
    const reload = () => {
      getProvider()
        .getListings()
        .then((l) => setListings(l))
        .catch(() => {});
    };
    window.addEventListener(LISTINGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LISTINGS_CHANGED_EVENT, reload);
  }, []);

  // `/?zone=<구역 id>` — 매물 목록·등록 완료 화면에서 넘어오면 그 구역 상세를 바로 열어 준다
  useEffect(() => {
    let id: string | null = null;
    try {
      id = new URL(window.location.href).searchParams.get("zone");
    } catch {
      id = null;
    }
    if (!id) return;
    setSelectedId(id);
    setPanelOpen(true);
  }, []);

  // `/?my=<매물 id>` — 매물 목록에서 내 매물의 [지도에서 보기]로 들어오면
  //   「내 매물만 보기」를 켜고 그 핀을 지도에 펼친다.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = new URL(window.location.href).searchParams.get("my");
    } catch {
      id = null;
    }
    if (!id) return;
    setMyOnly(true);
    setMyFocusId(id);
    setPanelOpen(false);
    setSeoulFitRequest((v) => v + 1);
  }, []);

  // ── 마지막으로 보던 구역 되살리기 (2026-11-27) ────────────────────────────
  //   · 저장해 둔 구역이 있으면 상세 패널을 연 채로 시작한다 — “닫기 직전에 보던 구역이
  //     바로 열리게”. 화면(중심·배율)은 지도의 `initialView` 가 맡으므로 여기서는 selection 만.
  //   · 지도는 데이터를 다 불러온 뒤 마운트되므로(loading 가드), 이 effect 가 먼저 돌아
  //     선택이 이미 잡힌 상태로 지도가 뜨고, 지도는 저장된 화면을 그대로 유지한다(맞춤 생략).
  const restoredSelectionRef = useRef(false);
  useEffect(() => {
    if (restoredSelectionRef.current) return;
    restoredSelectionRef.current = true;
    const id = bootView?.selectedZoneId;
    if (!id) return;
    setSelectedId(id);
    // 넓은 화면은 오른쪽 드로어라 지도를 가리지 않는다 — 열어 둔 채로 시작한다.
    //   폰은 아래 시트가 지도를 덮으므로 열지 않는다(구역은 선택된 채라 탭 한 번이면 열린다).
    if (typeof window !== "undefined" && window.innerWidth >= 768) setPanelOpen(true);
  }, [bootView]);

  // 저장해 둔 구역이 데이터에서 사라졌으면(구역 개편·이름 변경) 선택을 비운다
  //   — 지도에 없는 id 로 패널만 빈 채 뜨는 일을 막는다.
  useEffect(() => {
    const id = bootView?.selectedZoneId;
    if (!id || !seoulZones.length) return;
    if (seoulZones.some((z) => z.id === id)) return;
    setSelectedId((cur) => (cur === id ? undefined : cur));
  }, [bootView, seoulZones]);

  // 서울시 정비구역 전수 레이어
  useEffect(() => {
    loadSeoulZones().then((d) => {
      setSeoulZonesBase(d.zones);
      setSeoulMeta(d.meta);
    });
  }, []);

  // 앱을 켜 둔 채 새 배포가 올라간 경우 — 화면이 다시 보일 때 데이터가 바뀌었는지 확인하고,
  // 바뀌었으면 새로고침 없이 다시 받아 지도를 갱신한다(아이패드 Safari 가 그려 둔 화면을
  // 그대로 되살려 예전 경계가 남는 것을 막는다).
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      zonesDataChanged()
        .then((changed) => (changed ? refreshSeoulZones() : null))
        .then((d) => {
          if (!d) return;
          setSeoulZonesBase(d.zones);
          setSeoulMeta(d.meta);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  // 지하철역 574개 — 검색용(지도 레이어와 별개로 한 번만 받아 둔다)
  useEffect(() => {
    loadSubwayStations()
      .then((list) => setStations(list))
      .catch(() => setStations([]));
  }, []);

  const filtered = useMemo(
    () =>
      zones.filter(
        (z) =>
          (typeFilter === "전체" || z.type === typeFilter) &&
          (stageFilter === "전체" || z.stage === stageFilter)
      ),
    [zones, typeFilter, stageFilter]
  );

  // 경매 데이터 — 한 번만 받아 둔다(없으면 섹션을 그리지 않는다)
  useEffect(() => {
    let alive = true;
    loadAuctions().then((d) => {
      if (alive) setAuctions(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const selected = zones.find((z) => z.id === selectedId);
  // 대표 구역이 아닌 구역 — 고시 레코드만 있는 구역
  const selectedSeoul = selected ? undefined : seoulZones.find((z) => z.id === selectedId);
  const selectedTx = transactions.filter((t) => t.zoneId === selectedId);
  // 지도 전체 실거래 가격표 — 지도가 뜬 뒤 한 번만 받아 둔다(700KB급, 화면을 막지 않게)
  useEffect(() => {
    let alive = true;
    loadRecentTx()
      .then((d) => {
        if (!alive) return;
        setRecentTxPins(d.pins);
        setRecentTxMeta(d.meta ? { asOf: d.meta.asOf, months: d.meta.months } : null);
      })
      .finally(() => {
        if (alive) setRecentTxLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 구역을 바꾸거나 닫으면 이전 구역의 실거래 핀·경매 위치 핀을 지도에서 지운다
  useEffect(() => {
    setTxPins([]);
    setAuctionFocus(null);
    setAuctionListFocus(null);
    // 경매 핀 토글은 **사용자가 켜 둔 상태를 그대로 둔다** — 한 번 켜고 여러 구역을 보는 흐름이 자연스럽고,
    //   여기서 꺼 버리면 경매 목록·핀에서 들어올 때 켠 상태(pickZone opts.auction)까지 되돌려진다.
    // 왼쪽 창의 경매 상세는 **그 구역의 물건일 때만** 남긴다(핀을 눌러 들어온 경우)
    setAuctionDetail((d) => (d && d.zoneId === selectedId ? d : null));
  }, [selectedId]);

  // 고른 구역이 준공·입주 완료 구역이면 ‘준공 포함’을 자동으로 켠다.
  //   꺼져 있으면 그 구역은 지도 레이어에서 통째로 빠져 패널만 열리고 경계가 사라진다
  //   (2026-11-23 제보: 경매 132건 쌍문동 507-1일원을 눌렀는데 지도에 구역이 안 보인다).
  //   경매 목록·경매 핀·검색·지도 이름표·`?zone=` 링크 어느 경로로 들어와도 같은 규칙이 적용된다.
  //   (‘준공 포함’을 다시 끄면 toggleCompleted 가 선택을 풀므로 바로 되켜지는 일은 없다.)
  useEffect(() => {
    if (!selectedId || showCompleted || !seoulZones.length) return;
    const z = seoulZones.find((s) => s.id === selectedId);
    if (z && isCompletedZone(z)) setShowCompleted(true);
  }, [selectedId, seoulZones, showCompleted]);
  // 선택 구역의 매물 — zoneId 로 먼저, 안 되면 구역명으로 맞춘다(옛 저장분·개편 전 id)
  const selectedListings = listings.filter((l) =>
    listingMatchesZone(l, selectedId, selectedSeoul?.name ?? selected?.name, selectedSeoul?.alias)
  );
  // 선택 구역에 매칭된 경매 물건 — 없으면 빈 배열(섹션을 그리지 않는다)
  const selectedAuctions: AuctionItem[] =
    selectedId && auctions ? auctions.byZone[selectedId] ?? [] : [];
  // ── ⚖️ 지도 경매 핀 ──────────────────────────────────────────────────────
  //   · 구역을 골랐으면 그 구역 안 물건만, 광역이면 매칭된 전체 물건을 **매각단위**로 묶어 지도에 넘긴다.
  //   · 일괄매각은 목적물이 여러 필지·호실이어도 핀 하나(중심점)다 — 대선제분 24필지 → `406.3억 · 일괄` 1핀.
  //   · 좌표가 같은 호실(쌍문동 507-1 132건)도 `buildAuctionPins` 가 핀 하나로 묶는다.
  //   · 표시는 구역 선택 시 기본 ON — 광역에서 보려면 지도 위 「⚖️ 경매 핀」 토글을 켜야 한다.
  const zoneAuctionPins = useMemo(() => buildAuctionPins(selectedAuctions), [selectedAuctions]);
  const allAuctionPins = useMemo(
    () => (auctions ? buildAuctionPins(Object.values(auctions.byZone).flat()) : []),
    [auctions]
  );
  const mapAuctionPins = selectedId ? zoneAuctionPins : allAuctionPins;

  /**
   * ⚖️ 지도 경매 핀 클릭 — 그 핀의 물건들을 왼쪽 창에 띄우고, 그 구역을 오른쪽 패널에 연다.
   *   · 말풍선 카드 대신 왼쪽 카드가 열린다(사용자 요구).
   *   · 이미 그 구역이 열려 있으면 지도 화면은 그대로 두고 카드만 갱신한다.
   */
  function openAuctionPin(pin: AuctionMapPin) {
    const zoneId = pin.lead.zoneId;
    setAuctionDetail({ pinId: pin.id, zoneId, items: pin.items, activeId: pin.lead.id });
    setAuctionFocus(null);
    setAuctionListFocus(null);
    if (zoneId && zoneId !== selectedId) pickZone(zoneId, { auction: true });
    else if (zoneId) setPanelOpen(true);
    // 좁은 화면에서는 왼쪽 카드가 화면을 덮으므로 오른쪽 패널을 접는다
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  }

  /** 경매 목록·카드에서 「상세」 — 그 물건이 속한 **지도 핀**을 찾아 왼쪽 창에 연다
   *   · 일괄매각은 목적물이 여러 필지에 흩어져 있어도 지도 핀이 1개다 — 목록에서 한 필지를 눌러도
   *     그 사건의 목적물 전체를 카드에 띄우고(눌러서 전환) 지도 핀도 함께 강조한다. */
  function openAuctionItem(item: AuctionItem) {
    const pin = mapAuctionPins.find((p) => p.items.some((x) => x.id === item.id));
    const items = pin ? pin.items : [item];
    const pinId = pin ? pin.id : `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
    setAuctionDetail({
      pinId,
      zoneId: selectedId ?? item.zoneId,
      items,
      activeId: item.id,
    });
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  }
  // ── 매물 조건 필터 ────────────────────────────────────────────────────────
  //   · 지도 배지 숫자·‘매물 있는 구역’ 필터 모두 **같은 목록**에서 센다 —
  //     임대사업자 승계·토허제 조건을 켜면 그 조건에 맞는 매물만 배지에 잡힌다.
  const filteredListings = useMemo(
    () =>
      listings.filter(
        (l) =>
          (!leaseOnly || l.leaseOperatorOnly === true) &&
          (!noPermit || l.landPermitRequired !== true)
      ),
    [listings, leaseOnly, noPermit]
  );
  const listingCounts = useMemo(() => listingCountsByZoneId(filteredListings), [filteredListings]);
  const listingZoneIds = useMemo(() => new Set(Object.keys(listingCounts)), [listingCounts]);

  // ── 내 매물만 보기 ────────────────────────────────────────────────────────
  //   · 핀: 정적 `my-listings.json`(부동산포스 63건) + **`/api/listings` 공용 DB·이 브라우저에서
  //     등록한 매물**까지 — `/register` 로 방금 올린 매물도 「내 매물만 보기」에서 바로 보여야 한다
  //     (2026-11-27 제보: 등록해도 63건만 떠서 새 매물이 지도에 안 나왔다).
  //   · 지도에 남길 구역: 그 핀들의 zoneId (좌표·매물설명으로 맞춘 정비구역 + 새로 등록한 구역)
  /** 구역 id → 중심 좌표 — 주소 좌표가 없는 등록 매물의 핀 자리로 쓴다 */
  const zoneCenterById = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const z of zones) if (z.center) m.set(z.id, z.center);
    for (const z of seoulZones) if (z.center) m.set(z.id, z.center);
    return m;
  }, [zones, seoulZones]);
  const myListings = useMemo<MyListingPin[]>(() => {
    const out: MyListingPin[] = [...MY_LISTINGS];
    const seen = new Set(out.map((p) => p.id));
    // 부동산포스 매물과 같은 건으로 표시된 검증 매물(duplicateOf)은 핀을 두 번 찍지 않는다
    const dupOf = new Set(out.map((p) => p.duplicateOf).filter((id): id is string => !!id));
    for (const l of listings) {
      if (seen.has(l.id) || dupOf.has(l.id) || !isMyListing(l)) continue;
      const pin = myPinFromListing(l, zoneCenterById.get(l.zoneId) ?? null);
      if (!pin) continue;
      seen.add(pin.id);
      out.push(pin);
    }
    return out;
  }, [listings, zoneCenterById]);
  const myZoneIds = useMemo(
    () => new Set(myListings.map((p) => p.zoneId).filter((id): id is string => !!id)),
    [myListings]
  );
  /** 내 매물 구성 — 패널 요약(거래유형·자치구) */
  const myByDeal = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of myListings) m[p.dealType] = (m[p.dealType] ?? 0) + 1;
    return m;
  }, [myListings]);
  const myByGu = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of myListings) m[p.gu] = (m[p.gu] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [myListings]);

  /** 「내 매물만 보기」 토글 — 켜면 서울 전체로 넓히고, 끄면 기존 지도로 즉시 돌아간다 */
  function toggleMyOnly() {
    const next = !myOnly;
    setMyOnly(next);
    if (next) {
      setSeoulFitRequest((v) => v + 1);
      // 내 매물이 없는 구역이 선택돼 있으면 선택을 풀어 빈 패널이 남지 않게 한다
      if (selectedId && !myZoneIds.has(selectedId)) setSelectedId(undefined);
    } else {
      setMyFocusId(null);
    }
  }

  // ── 준공 완료 구역(준공·준공(일부)·입주·사용승인 357곳) 숨김 ─────────────────
  //   이미 입주까지 끝나 아파트가 된 구역이라 상담 대상이 아니다. 기본 지도·검색·
  //   범례 숫자에서 모두 빼고, ‘준공 완료 포함’ 토글을 켠 때만 다시 보여준다(점선 표시).
  const completedZones = useMemo(() => seoulZones.filter(isCompletedZone), [seoulZones]);
  const visibleSeoulZones = useMemo(
    () => (showCompleted ? seoulZones : seoulZones.filter((z) => !isCompletedZone(z))),
    [seoulZones, showCompleted]
  );

  // 지도 레이어·범례 숫자에 실제로 깔리는 구역 — 유형 필터가 켜져 있으면 그 유형만.
  //   검색과 주소 판정은 visibleSeoulZones/seoulZones 전체를 그대로 본다(필터가 검색을 막지 않게).
  //   · hiddenByDefault 구역(예: 여의대방2역세권에 포함·통합 추진되는 여의대방 가로주택정비사업)은
  //     지도에서만 빠진다 — 구역이 겹쳐 두 색으로 보이지 않게.
  const mapSeoulZones = useMemo(
    () => {
      const base = (typeFilter === "전체" ? visibleSeoulZones : visibleSeoulZones.filter((z) => z.type === typeFilter))
        // ‘매물 있는 구역’ 필터 — 매물이 없는 구역은 지도에서 뺀다
        .filter((z) => !listingsOnly || listingZoneIds.has(z.id))
        // 「내 매물만 보기」 — 내 매물이 있는 구역만 남긴다
        .filter((z) => !myOnly || myZoneIds.has(z.id));
      // 기본 숨김 구역이라도 **검색해 고른 구역**은 지도에 그린다 —
      // 안 그러면 상세 패널만 열리고 지도에서는 사라져 위치를 찾을 수 없다(예: 사당21구역).
      const picked = selectedId ? seoulZones.find((z) => z.id === selectedId) : undefined;
      const rest = base.filter((z) => !z.hiddenByDefault || z.id === selectedId);
      return picked && !rest.some((z) => z.id === picked.id) ? [...rest, picked] : rest;
    },
    [visibleSeoulZones, typeFilter, listingsOnly, listingZoneIds, myOnly, myZoneIds, selectedId, seoulZones]
  );

  /** 매물이 있는 구역 수 — 필터 칩에 병기(준공 숨김·유형 필터 반영) */
  const listingZoneTotal = useMemo(
    () => mapSeoulZones.filter((z) => listingZoneIds.has(z.id)).length,
    [mapSeoulZones, listingZoneIds]
  );

  /** 지도에 넘기는 대표 구역 — ‘매물 있는 구역’·「내 매물만 보기」가 켜지면 해당 구역만 남는다 */
  const mapFeaturedZones = useMemo(
    () =>
      filtered
        .filter((z) => !listingsOnly || listingZoneIds.has(z.id))
        .filter((z) => !myOnly || myZoneIds.has(z.id)),
    [filtered, listingsOnly, listingZoneIds, myOnly, myZoneIds]
  );

  function toggleCompleted() {
    const next = !showCompleted;
    setShowCompleted(next);
    // 숨기는 순간 준공 구역이 선택돼 있으면 선택을 풀어 유령 선택이 남지 않게 한다
    if (!next) {
      const z = seoulZones.find((s) => s.id === selectedId);
      if (z && isCompletedZone(z)) setSelectedId(undefined);
    }
  }

  // 구역명·별칭·사업유형·자치구 검색 (2,100여 구역 중 원하는 곳으로 바로 이동)
  //   · 공식 별칭까지 훑는다 — '사당동 419-1'로도 '사당15'로도 같은 구역이 뜬다
  //   · 띄어쓰기를 무시해 '사당동419-1', '사당 15' 같은 입력도 걸린다
  //   · 서울시 사업유형(kind)도 같이 본다 — ‘청년안심’·‘미리내집’·‘장기전세’·‘역세권활성화’처럼
  //     지번 이름만으로는 찾기 어려운 새 레이어도 이름으로 바로 찾을 수 있게(이름·별칭에 이어 낮은 순위)
  //   · 기본(준공 숨김)에서는 준공 구역이 결과에 안 뜨고, 그 구역만 맞았을 때
  //     '준공 완료라 숨겨져 있다'는 안내를 대신 보여준다(데이터가 없는 줄 오해하지 않게)
  const search = useMemo(() => {
    const term = query.trim();
    const empty = { results: [] as SeoulZone[], hidden: [] as SeoulZone[] };
    if (!term) return empty;
    const flat = term.replace(/\s+/g, "");
    const hit = (s?: string) => !!s && s.replace(/\s+/g, "").includes(flat);
    const exact = (s?: string) => !!s && s.replace(/\s+/g, "") === flat;
    const starts = (s?: string) => !!s && s.replace(/\s+/g, "").startsWith(flat);
    // 정확 일치를 먼저 본다 — '용두동 39'로 찾을 때 '용두동 39-24 역세시프'(다른 구역)보다
    // '용두동 39'(가칭 용두7구역)가 먼저 나와야 한다(2026-11-18 제보).
    const rank = (z: SeoulZone) =>
      exact(z.name)
        ? 0
        : (z.alias ?? []).some(exact)
          ? 1
          : starts(z.name)
            ? 2
            : (z.alias ?? []).some(starts)
              ? 3
              : hit(z.name)
                ? 4
                : (z.alias ?? []).some(hit)
                  ? 5
                  : hit(z.kind) || hit(z.type)
                    ? 6
                    : 7;
    const matches = (list: SeoulZone[]) =>
      list.filter((z) => hit(z.name) || hit(z.kind) || hit(z.type) || z.gu.includes(term) || (z.alias ?? []).some(hit));
    const sortFn = (a: SeoulZone, b: SeoulZone) =>
      rank(a) - rank(b) ||
      Number(b.featured) - Number(a.featured) ||
      Number(!b.polygon) - Number(!a.polygon) ||
      b.area - a.area;
    const results = matches(visibleSeoulZones).sort(sortFn).slice(0, 8);
    const hidden =
      !showCompleted && results.length === 0 ? matches(completedZones).sort(sortFn).slice(0, 3) : [];
    return { results, hidden };
  }, [query, visibleSeoulZones, completedZones, showCompleted]);

  // ── 지하철역 검색 결과 ───────────────────────────────────────────────────
  //   · ‘사당’·‘사당역’ 둘 다 같은 역을 찾는다(끝의 ‘역’은 떼고 비교)
  //   · 구역 결과와 별도 섹션으로 보여주되, 입력이 주소 형태면 주소 후보가 우선이다
  const stationHits = useMemo(
    () => (stations.length && query.trim() ? searchStations(stations, query, 5) : []),
    [stations, query]
  );

  /** 역 주변 정비구역 — 역 중심 700m 안. 가까운 순 4곳 */
  const stationNearby = useMemo(() => {
    if (!stationPick) return [] as { zone: SeoulZone; distance: number }[];
    return visibleSeoulZones
      .map((z) => ({ zone: z, distance: distanceM(stationPick.lat, stationPick.lng, z.center[0], z.center[1]) }))
      .filter((r) => r.distance <= 700)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }, [stationPick, visibleSeoulZones]);

  // ── 주소 판별용 전체 구역 사전계산 ─────────────────────────────────────────
  //   준공 구역도 "주소가 속한 곳"을 말할 때는 빠지면 안 된다 — 표시 여부(visibleSeoulZones)와
  //   무관하게 전체(진행 중 1,822 + 준공 357)에 대고 판정하고, 숨겨졌으면 안내문으로 알린다.
  const allPrep = useMemo(() => prepareAllZones(seoulZones), [seoulZones]);

  // ── 주소 자동완성 줄의 구역명 (2026-11-23 요청) ─────────────────────────────
  //   "주소 + 그 주소가 속한 구역"이 한 줄에서 바로 읽히게 한다.
  //     · 포함 판정만 한다(거리 계산 없음) — 타이핑할 때마다 후보 8건을 판정해도 가볍다.
  //     · 경계 도형이 없거나(점 표시) 보정 경계가 지번 대표점을 살짝 벗어난 구역은
  //       '동+지번 = 구역 이름'으로 찾는다(신길동 113-5·방배동 2732번지 일대 같은 구역).
  //     · 구역 밖 주소는 배지를 달지 않는다 — 줄이 지저분해지고, 틀린 구역명은 오해를 만든다.
  const addrZoneBadges = useMemo(() => {
    const out = new Map<string, AddrZoneBadge>();
    if (!addrCandidates.length || !seoulZones.length) return out;
    for (const c of addrCandidates) {
      const hits = zonesAtAddress(allPrep, c.lat, c.lng);
      // 지번이 곧 구역 이름인 구역(신길동 113-5·행촌동 210-2 일대)을 먼저 본다 — 사용자가 친
      // 지번과 이름이 같은 구역이 곧 그 주소의 구역이고, 경계가 점으로만 표시된 후보지도 여기서 잡힌다.
      const byJibun = zoneByJibunName(seoulZones, c.dong, c.jibun, c.gu);
      const named = byJibun && !hits.some((h) => h.zone.id === byJibun.id) ? byJibun : null;

      if (named) {
        out.set(c.key, {
          name: named.name,
          type: named.type,
          completed: isCompletedZone(named),
          count: 1,
          // 경계 도형으로 확인한 것이 아니라 지번(이름)으로 찾은 경우만 눌러 쓴다
          byJibun: !named.polygon,
          title:
            `${named.name} · ${named.stage}\n지번(대표 필지) 기준` +
            (named.polygon ? "" : " — 구역 경계 도형이 아직 고시되지 않았습니다") +
            (hits.length ? `\n이 지점은 ${hits[0].zone.name} 경계 안에 있습니다` : ""),
        });
        continue;
      }

      if (hits.length) {
        const first = hits[0];
        out.set(c.key, {
          name: first.zone.name,
          type: first.zone.type,
          completed: first.completed,
          count: hits.length,
          byJibun: false,
          title:
            hits.map((h) => `${h.zone.name} · ${h.completed ? "준공" : h.zone.stage}`).join("\n") +
            (hits.length > 1 ? `\n겹친 구역 ${hits.length}곳 — 안쪽 구역부터` : ""),
        });
      }
    }
    return out;
  }, [addrCandidates, seoulZones, allPrep]);

  // ── 지도에서 찍은 지번 ────────────────────────────────────────────────
  //   · 즉시 핀을 꽂고(로딩 상태) 역지오코딩으로 법정동·지번을 채운다.
  //   · 그 지점이 속한 정비구역은 경계 판정(judgeAddress)으로 찾는다 — 카드에 바로가기로 붙는다.
  /**
   * 찍어 둔 지번 핀·필지 강조를 걷는다.
   *   · 구역 경계를 그리거나 고치기 시작할 때 지도 위에 떠 있던 지번 핀/팝업이 초안 클릭을 가리거나
   *     엉뚱한 점을 찍은 것처럼 보이지 않게 함께 치운다(사용자 제보 2026-11-24).
   *   · 지번 찍기 토글 상태(jibunPickOn)는 건드리지 않는다 — 그리기·수정을 마치면 그대로 돌아온다.
   */
  function clearJibunPick() {
    setJibunPin(null);
    parcelSeqRef.current += 1;
    setParcel(null);
    setParcelNote(null);
  }

  async function pickJibun(lat: number, lng: number) {
    const seq = ++jibunSeqRef.current;
    setJibunNote(null);
    // 클릭한 자리의 필지도 함께 강조한다 — 지번 핀 카드·주소 카드와 같은 필지를 본다
    void showParcel(lat, lng);
    setJibunPin({ lat, lng, gu: "", dong: "", jibun: "", jibunAddress: "", zones: [], state: "loading" });
    const rev = await reverseGeocode(lat, lng);
    if (jibunSeqRef.current !== seq) return;
    if (!rev) {
      setJibunPin((p) =>
        p ? { ...p, state: "error", note: "이 지점의 주소를 확인하지 못했습니다(카카오 주소 서비스 응답 없음)." } : p
      );
      return;
    }
    const v = judgeAddress(
      {
        key: `pick:${lat},${lng}`,
        label: rev.jibunAddress ?? rev.roadAddress ?? "",
        kind: "지번",
        lat,
        lng,
        gu: rev.gu ?? undefined,
        dong: rev.dong ?? undefined,
      },
      seoulZones,
      allPrep
    );
    const hits = [...v.inside, ...v.completedHits].map((h) => ({
      id: h.zone.id,
      name: h.zone.name,
      stage: h.zone.stage,
      type: h.zone.type,
      completed: h.completed,
    }));
    setJibunPin({
      lat,
      lng,
      gu: rev.gu ?? "",
      dong: rev.dong ?? "",
      jibun: rev.jibun ?? "",
      jibunAddress: rev.jibunAddress ?? "",
      roadAddress: rev.roadAddress,
      buildingName: rev.buildingName,
      zones: hits,
      state: "ready",
      note: rev.jibun ? null : "지번이 없는 주소(도로명만) — 이 지점은 단지 이력을 열 수 없습니다.",
    });
  }

  /**
   * 지번 하나의 공동주택 실거래를 확인해 5년 이력 창을 연다.
   *   · 1차: 최근 24개월 — 아파트·연립다세대 **병렬** 조회
   *   · 2차: 둘 다 없을 때만 나머지 36개월(offset 24) 병렬 — 합쳐 최근 5년(60개월)
   *   · 한 유형이라도 거래가 1건이라도 있으면 바로 그 단지·건물의 5년 이력 창을 연다.
   *     (예전엔 최근 12개월만 보고 없으면 포기해 — 1년 넘은 거래만 있는 건물(사당동 440-9
   *      한아름맨션)이 '거래 없음'으로 보였다.)
   */
  async function openJibunHistory(target: { gu: string; dong: string; jibun: string }) {
    const { gu, dong, jibun } = target;
    /** 안내 문구는 주소 카드에 쓰고, 같은 지번의 지도 핀이 있을 때만 그 핀에도 쓴다 */
    const say = (message: string | null) => {
      setJibunNote(message);
      setJibunPin((p) =>
        p && p.gu === gu && p.dong === dong && p.jibun === jibun ? { ...p, note: message } : p
      );
    };
    if (!jibun || !gu || !dong) {
      say("자치구·법정동·지번을 확인하지 못해 실거래를 조회할 수 없습니다.");
      return;
    }
    setJibunProbing(true);
    // 이전 안내 문구는 지운다 — 다시 누르면 새 조회 결과로 채운다
    say(null);
    try {
      const kinds: BuildingTradeKind[] = ["아파트", "연립·다세대"];
      const ask = async (kind: BuildingTradeKind, months: number, offset: number) => {
        const qs = new URLSearchParams({
          gu,
          dong,
          jibun,
          kind,
          months: String(months),
          offset: String(offset),
        });
        try {
          const res = await fetch(`/api/transactions/building?${qs.toString()}`, { cache: "no-store" });
          const json = (await res.json()) as BuildingHistoryResponse;
          return {
            ok: !!json.ok,
            rows: json.transactions ?? [],
            // 국토부 호출 한도(429)·오류로 받지 못한 달 — '거래 없음'으로 단정하지 않는다
            failedMonths: json.failedMonths ?? [],
            // 서울 밖 지점(구 이름이 없음)·키 미설정은 따로 안내한다
            reason: json.reason,
            message: json.message,
          };
        } catch {
          return {
            ok: false,
            rows: [] as MolitTransaction[],
            failedMonths: [] as string[],
            reason: undefined,
            message: undefined,
          };
        }
      };
      /** 가장 최근 계약일 — 유형을 고를 때 거래 건수가 같으면 최신 쪽을 고른다 */
      const latestDate = (rows: MolitTransaction[]) =>
        rows.reduce((acc, r) => (r.dealDate > acc ? r.dealDate : acc), "");

      let anyAnswered = false;
      /** 통째로 응답을 못 받은 호출 수 — 이게 있으면 '거래 없음'이라고 단정하지 않는다 */
      let failedCalls = 0;
      /** 거절 이유(서울 밖 주소 등) — 그대로 안내한다 */
      let rejected: string | null = null;
      /** 429 등으로 비어 버린 달(YYYYMM) — 마지막에 한 달씩 다시 물어본다 */
      const missing = new Set<string>();
      let found: { kind: BuildingTradeKind; rows: MolitTransaction[] } | null = null;
      const chunks: [number, number][] = [
        [24, 0], // 최근 2년
        [36, 24], // 그 앞 3년 — 위에서 없을 때만
      ];
      for (const [months, offset] of chunks) {
        const results = await Promise.all(
          kinds.map(async (kind) => ({ kind, ...(await ask(kind, months, offset)) }))
        );
        if (results.some((r) => r.ok)) anyAnswered = true;
        for (const r of results) {
          if (!r.ok) {
            failedCalls += 1;
            if (r.reason === "gu_not_found") rejected = "서울 자치구 주소만 실거래를 조회할 수 있습니다.";
            else if (r.reason === "key_missing" && r.message) rejected = r.message;
          }
          for (const ym of r.failedMonths) missing.add(ym);
        }
        // 거래가 많은 유형을 고르고, 같으면 최근 거래가 있는 유형을 고른다
        const hit = results
          .filter((r) => r.rows.length > 0)
          .sort(
            (a, b) =>
              b.rows.length - a.rows.length || latestDate(b.rows).localeCompare(latestDate(a.rows))
          )[0];
        if (hit) {
          found = { kind: hit.kind, rows: hit.rows };
          break;
        }
      }

      // 한도(429)로 비어 버린 달은 **한 달씩** 다시 물어본다 — 호출이 적어 성공률이 높다
      // (단지 이력 창도 같은 방식으로 빈 달을 메우므로, 여기서 뚫리면 창에서도 메워진다)
      if (!found && missing.size > 0) {
        for (const ym of [...missing]) {
          const off = monthOffsetOf(ym);
          if (off < 0 || off >= 60) {
            missing.delete(ym);
            continue;
          }
          let answered = false;
          for (const kind of kinds) {
            const r = await ask(kind, 1, off);
            if (r.ok) answered = true;
            if (r.ok && r.rows.length > 0) {
              found = { kind, rows: r.rows };
              break;
            }
          }
          if (answered) missing.delete(ym);
          if (found) break;
        }
      }

      if (!found) {
        say(
          rejected
            ? rejected
            : failedCalls > 0 || missing.size > 0
              ? "실거래를 일부만 불러왔습니다(국토부 호출 한도). 잠시 뒤 다시 시도해 주세요."
              : anyAnswered
                ? "이 지번에는 최근 5년 공동주택(아파트·연립다세대) 신고 거래가 없습니다."
                : "실거래를 조회하지 못했습니다. 잠시 뒤 다시 시도해 주세요."
        );
        return;
      }

      // 현 거래의 단지·건물명을 이력 창의 대상으로 넘긴다(이름이 비면 지번만으로 조회된다)
      const first = found.rows[0];
      setBuildingTarget({ gu, dong, jibun, kind: found.kind, name: first.name ?? "" });
    } catch {
      say("실거래를 조회하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setJibunProbing(false);
    }
  }

  // 입력이 주소 형태면 350ms 뒤 카카오 주소 검색 — 구역명 검색 결과와 나란히 보여준다
  useEffect(() => {
    const term = query.trim();
    if (!looksLikeAddress(term)) {
      setAddrCandidates([]);
      setAddrNote(null);
      setAddrBusy(false);
      return;
    }
    let alive = true;
    setAddrBusy(true);
    const timer = window.setTimeout(() => {
      searchAddresses(term)
        .then((r) => {
          if (!alive) return;
          setAddrBusy(false);
          setAddrCandidates(r.candidates);
          setAddrNote(
            r.ok
              ? r.candidates.length
                ? null
                : "서울 지역 주소를 찾지 못했습니다."
              : "주소 검색을 쓸 수 없습니다(카카오 서비스 라이브러리 미로드)."
          );
        })
        .catch(() => {
          if (!alive) return;
          setAddrBusy(false);
          setAddrCandidates([]);
          setAddrNote("주소 검색 중 오류가 났습니다.");
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  /**
   * 필지(지적) 경계 조회 — 좌표가 속한 필지를 서버 라우트로 받아 지도에 칠한다.
   *   · 응답이 늦게 와도 **마지막으로 고른 주소**의 필지만 남긴다(seq).
   *   · 실패·필지 없음은 카드 한 줄로만 알리고 주소 핀은 건드리지 않는다.
   */
  async function showParcel(lat: number, lng: number) {
    const seq = ++parcelSeqRef.current;
    setParcelNote(null);
    const r = await fetchParcel(lat, lng);
    if (parcelSeqRef.current !== seq) return;
    if (r.ok) {
      setParcel(r.parcel ?? null);
      setParcelNote(
        r.parcel ? null : "이 지점의 지적 필지를 찾지 못했습니다(지적도에 없는 자리일 수 있습니다)."
      );
    } else {
      setParcel(null);
      setParcelNote("필지 경계를 불러오지 못했습니다 — 주소 핀은 그대로입니다.");
    }
  }

  /** 주소 핀·판정 카드·필지 강조 초기화 — 구역 선택은 그대로 둔다 */
  function clearAddress() {
    setAddrVerdict(null);
    setAddrCandidates([]);
    setAddrNote(null);
    setAddrJibun(null);
    setJibunNote(null);
    parcelSeqRef.current += 1;
    setParcel(null);
    setParcelNote(null);
  }

  /** 주소 후보 확정 — 판정 → 핀 → (속한 구역이 있으면) 그 구역 선택 */
  function acceptAddress(c: AddressCandidate) {
    const v = judgeAddress(c, seoulZones, allPrep);
    setAddrVerdict(v);
    setQuery("");
    setAddrCandidates([]);
    setAddrNote(null);
    setJibunNote(null);
    // 지번이 있는 주소면 카드에서 바로 실거래 5년을 열 수 있게 지번을 기억한다
    //   (지도에서 지번을 찍지 않아도 같은 조회를 쓴다 — 사당동 440-9 같은 지번 주소)
    setAddrJibun(
      c.jibun && c.dong && c.gu ? { gu: c.gu, dong: c.dong, jibun: c.jibun } : null
    );
    // 필지(지적) 경계 — 주소 핀과 함께 그 필지를 파랗게 칠한다(실패해도 핀은 그대로)
    void showParcel(c.lat, c.lng);
    if (v.status === "inside") {
      pickZone(v.inside[0].zone.id);
    } else if (v.status === "completed") {
      // 준공 구역은 기본으로 숨겨져 있다 — 주소가 그 안이라는 사실을 보이게 토글을 켜 준다
      setShowCompleted(true);
      pickZone(v.completedHits[0].zone.id);
    } else {
      // 구역 밖·후보지 인근 — 엉뚱한 구역이 선택된 채로 남아 오해하지 않게 선택을 풀고,
      // 지도는 그 지점으로만 이동한다(구역 밖이면 판정 배너 없이 핀만). 카드의 가까운 구역
      // 목록에서 고르면 그때 상세가 열린다.
      setSelectedId(undefined);
      setPanelOpen(true);
    }
  }

  async function runAddressSearch(): Promise<AddressCandidate[]> {
    const term = query.trim();
    if (!term) return [];
    setAddrBusy(true);
    const r = await searchAddresses(term);
    setAddrBusy(false);
    setAddrCandidates(r.candidates);
    setAddrNote(
      r.ok
        ? r.candidates.length
          ? null
          : "서울 지역 주소를 찾지 못했습니다."
        : "주소 검색을 쓸 수 없습니다(카카오 서비스 라이브러리 미로드)."
    );
    return r.candidates;
  }

  /** 엔터 — 주소 후보가 있으면 첫 주소, 없으면 주소 검색 → 그래도 없으면 구역명 첫 결과 */
  async function submitSearch() {
    const term = query.trim();
    if (!term) return;
    let first = addrCandidates[0];
    if (!first && looksLikeAddress(term)) first = (await runAddressSearch())[0];
    if (first) {
      acceptAddress(first);
      return;
    }
    if (search.results.length > 0) {
      pickZone(search.results[0].id);
      setQuery("");
      return;
    }
    if (search.hidden.length > 0) {
      setShowCompleted(true);
      pickZone(search.hidden[0].id);
      setQuery("");
      return;
    }
    // 구역·주소가 아니면 역 이름으로 한 번 더 본다 — ‘사당역’ 입력 후 엔터
    if (stationHits.length > 0) {
      pickStation(stationHits[0]);
    }
  }

  const addressPin: AddressPin | null = useMemo(() => {
    // 경매 물건 위치를 눌렀으면 그 지점을 먼저 보여 준다(주소 판정 핀보다 우선)
    if (auctionFocus) {
      return {
        lat: auctionFocus.lat,
        lng: auctionFocus.lng,
        label: `⚖️ ${auctionFocus.caseNoPrint.replace(auctionFocus.court, "").trim() || auctionFocus.caseNo}`,
        status: "inside" as const,
        message: `${auctionFocus.usage || "경매"} · 최저 ${formatWon(auctionFocus.minimum)} · 매각 ${formatSaleDate(auctionFocus.saleDate)}`,
        zoneId: auctionFocus.zoneId,
      };
    }
    if (!addrVerdict) return null;
    return {
      lat: addrVerdict.address.lat,
      lng: addrVerdict.address.lng,
      label: addrVerdict.address.label,
      status: addrVerdict.status,
      message: verdictHeadline(addrVerdict),
      zoneId:
        addrVerdict.status === "inside"
          ? addrVerdict.inside[0].zone.id
          : addrVerdict.status === "completed"
            ? addrVerdict.completedHits[0].zone.id
            : undefined,
    };
  }, [addrVerdict, auctionFocus]);

  /** 역 핀 — 역 검색으로 고른 역을 지도에 찍는다(주소 핀과 동시에 뜨지 않는다) */
  const stationPin: StationPin | null = useMemo(() => {
    if (!stationPick) return null;
    return {
      name: stationPick.name,
      lat: stationPick.lat,
      lng: stationPick.lng,
      lines: stationPick.lines,
      lineLabel: lineNames(stationPick),
    };
  }, [stationPick]);

  // 범례 카운터 — 지금 지도에 깔린 구역 수(준공 숨김·유형 필터 반영)
  const typeCounts = useMemo(() => {
    const m: Partial<Record<MapZoneType, number>> = {};
    for (const z of mapSeoulZones) m[z.type] = (m[z.type] ?? 0) + 1;
    return m;
  }, [mapSeoulZones]);

  /**
   * 자치구별 총 구역 수 — 광역(초기 화면)에서 개별 구역 뱃지 대신 깔리는 `구 + 개수` 카드.
   *   · 개수는 **지도에 실제로 깔린 목록(mapSeoulZones)** 에서 센다 → 유형 필터·‘준공 포함’·
   *     ‘매물 있는 구역’ 을 모두 반영하고, 합계가 범례 총계(mapSeoulZones.length)와 정확히 같다.
   *   · 자리는 **전체 목록(seoulZones)** 의 경계 상자 중심에서 잡는다 — 필터를 바꿀 때마다
   *     뱃지가 이리저리 움직이지 않고, 준공 구역이 많은 구의 중심도 실제 구 한가운데에 온다.
   */
  const districtStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const z of mapSeoulZones) counts.set(z.gu, (counts.get(z.gu) ?? 0) + 1);
    const box = new Map<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>();
    const grow = (gu: string, lat: number, lng: number) => {
      const b = box.get(gu);
      if (!b) {
        box.set(gu, { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng });
        return;
      }
      if (lat < b.minLat) b.minLat = lat;
      if (lat > b.maxLat) b.maxLat = lat;
      if (lng < b.minLng) b.minLng = lng;
      if (lng > b.maxLng) b.maxLng = lng;
    };
    for (const z of seoulZones) {
      if (!z.center || !Number.isFinite(z.center[0]) || !Number.isFinite(z.center[1])) continue;
      grow(z.gu, z.center[0], z.center[1]);
    }
    const rows: DistrictStat[] = [];
    for (const [gu, count] of counts) {
      const b = box.get(gu);
      if (!b) continue;
      rows.push({
        gu,
        count,
        lat: (b.minLat + b.maxLat) / 2,
        lng: (b.minLng + b.maxLng) / 2,
      });
    }
    // 많이 담긴 구부터 — 지도가 자리를 잡을 때 큰 뱃지가 먼저 앉는다
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [mapSeoulZones, seoulZones]);

  function unlock(id: string) {
    setUnlocked((prev) => new Set(prev).add(id));
  }

  // ── 마지막으로 보던 화면 저장 (2026-11-27 사용자 요청) ───────────────────────
  /** 지도가 마지막으로 알려 온 화면(중심·배율) — 구역을 열고 닫을 때 이 자리와 함께 저장한다 */
  const lastMapViewRef = useRef<MapViewPoint | null>(null);
  /** 저장할 ‘지금 열어 둔 구역’ — 지도 이벤트가 옛 값을 잡지 않게 ref 로 최신을 본다 */
  const selectedIdRef = useRef<string | undefined>(selectedId);
  selectedIdRef.current = selectedId;

  /** 지도가 이동·확대를 멈출 때마다 온다 → 지금 화면 + 열어 둔 구역을 저장 */
  function handleViewChange(v: MapViewPoint) {
    lastMapViewRef.current = v;
    writeLastView(v, selectedIdRef.current ?? null);
  }

  // 구역을 열거나 닫을 때 — 화면은 그대로 두고 ‘열어 둔 구역’만 저장본에 반영한다
  useEffect(() => {
    const v = lastMapViewRef.current;
    if (!v) return;
    writeLastView(v, selectedId ?? null);
  }, [selectedId]);

  /**
   * ‘서울 전체’ 리셋 — 저장해 둔 마지막 화면을 지우고 서울 전체로 돌아간다.
   *   · 지도 도구 막대의 지도 버튼과 같은 뜻이다(상단 로고로 처음부터 시작하는 것과 동일한 초기화).
   *   · 지워 두면 다음에 열었을 때도 서울 전체가 기본값이다(테스트·상담 시 깨끗한 화면).
   */
  function resetToSeoul() {
    clearLastView();
    lastMapViewRef.current = null;
    setSelectedId(undefined);
    setStationPick(null);
    setSeoulFitRequest((v) => v + 1);
    // 주소에 ?zone= · ?my= 가 남아 있으면 새로고침 때 그 구역이 다시 열린다 — 함께 지운다
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("zone") || url.searchParams.has("my")) {
        url.searchParams.delete("zone");
        url.searchParams.delete("my");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      /* 주소를 못 고쳐도 화면은 이미 서울 전체다 */
    }
  }

  /**
   * 구역 선택. `opts.auction` 은 경매 목록·경매 핀에서 들어온 경우 — 경매 핀이 지도에 보이도록 켠다.
   */
  function pickZone(id: string, opts?: { auction?: boolean }) {
    setSelectedId(id);
    // 관리자 구역 선택은 공식 구역 선택과 **함께 살아 있으면 안 된다.**
    //   (예전: 4구역을 고쳐 둔 뒤 5구역을 누르면 상세는 5구역인데 「경계·정보 수정」 버튼은
    //    계속 4구역을 가리켜, 5구역을 클릭해도 수정 화면이 안 나오는 것처럼 보였다 — 2026-11-25 제보)
    //   · 이 구역을 덮어쓴 관리자 저장본이 있으면 그것을 선택해 둔다(수정은 저장본을 고친다).
    const override = adminMode ? customOverrideFor(customZones, id) : undefined;
    setSelectedCustomId(override?.id);
    setPanelOpen(true);
    setAuctionFocus(null);
    // 유형 필터가 켜져 있어 고른 구역이 지도 레이어에서 빠져 있으면 지도에서 사라진 것처럼 보인다
    // → 필터를 풀어 경계를 다시 그린다(검색·주소 판정은 필터와 무관하게 전체를 본다).
    const z = seoulZones.find((s) => s.id === id);
    if (z && typeFilter !== "전체" && z.type !== typeFilter) setTypeFilter("전체");
    // 경매 목록에서 들어온 경우 경매 핀도 켠다 — 핀은 첫 화면에서 꺼 두므로, 목록·카드로 경매를
    // 보러 들어온 사람에게는 위치 핀이 같이 보여야 한다(같은 구역에서 꺼 둔 경우까지 확실히 켠다).
    if (opts?.auction) setAuctionPinsOn(true);
  }

  // ── ✏️ 구역 그려서 분석 (일반 방문자) ──────────────────────────────────

  /** 툴바 「✏️ 구역 그려서 분석」 — 켜면 지도 클릭이 꼭짓점 추가로 간다(누구나 사용) */
  function toggleZoneDraw() {
    setZoneDrawOn((v) => {
      const next = !v;
      if (next) {
        // 새로 그리기 — 이전 결과·선택을 거둔다
        setZoneDrawPoints([]);
        setZoneDrawDone(null);
        setSelectedId(undefined);
        setJibunPickOn(false);
      }
      // 지도가 넓어야 점을 찍기 좋다 — 그리는 동안은 상세 패널·범례를 접는다(완료하면 패널은 다시 연다).
      //   · 좁은 화면은 패널이 지도 아래를 덮고, 넓은 화면은 안내 막대가 패널 머리말을 가린다.
      //   · 범례는 모바일에서 안내 막대 자리(아래)에 떠 있어 겹친다.
      if (next) {
        setPanelOpen(false);
        setLegendOpen(false);
      }
      return next;
    });
  }

  /** 그리기 닫기 — 찍은 점·완성된 폴리곤·분석 카드를 모두 거둔다 */
  function closeZoneDraw() {
    setZoneDrawOn(false);
    setZoneDrawPoints([]);
    setZoneDrawDone(null);
  }

  /**
   * 그리기 완료(더블클릭·「분석하기」) — 폴리곤을 닫고 패널에 분석 카드를 연다.
   *   1차 추정(/api/zone-stats)은 ZoneVitalStats 가 카드를 열 때 바로 돌린다.
   */
  function finishZoneDraw() {
    if (zoneDrawPoints.length < 3) return;
    setZoneDrawDone(zoneDrawPoints.slice());
    setZoneDrawOn(false);
    setZoneDrawPoints([]);
    setSelectedId(undefined);
    setPanelOpen(true);
  }

  /** 그린 구역을 그대로 두고 다시 그리기 — 지도는 그 상태에서 새 점을 받는다 */
  function redrawZoneDraw() {
    setZoneDrawDone(null);
    setZoneDrawPoints([]);
    setZoneDrawOn(true);
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  }

  /** 역 검색 결과 선택 — 역으로 지도를 옴기고, 역 주변 구역 목록을 띄운다 */
  function pickStation(s: SubwayStation) {
    setStationPick(s);
    setQuery("");
    // 주소 핀·판정 카드와는 성격이 다르므로 주소 쪽을 거둔다(핀이 둘 쥐이지 않게).
    clearAddress();
    // 구역 상세를 닫아 역 카드가 가려지지 않게 한다(지도는 역 중심 level 4 그대로).
    setSelectedId(undefined);
  }

  function clearStation() {
    setStationPick(null);
  }

  // ─── 관리자 모드: 구역 그리기·경계 수정 ─────────────────────────────────────
  /** 저장 + localStorage 반영 — 실패해도 화면 목록은 유지 */
  function commitCustomZones(next: CustomZone[]): boolean {
    setCustomZones(next);
    return saveCustomZones(next);
  }

  const selectedCustom = adminMode ? customZones.find((z) => z.id === selectedCustomId) : undefined;
  /** 경계 수정 대상 — 관리자 구역 우선, 다음 공식·대표 구역 */
  const selectedRing: [number, number][] | undefined =
    selectedCustom?.ring ?? selectedSeoul?.polygon ?? selected?.polygon;
  const canEditSelectedRing = !!selectedRing && selectedRing.length >= 3;

  function startNewDraw() {
    // 버튼 포커스가 남아 완료 후 Enter 를 눌렀을 때 0점으로 재시작되는 것을 막는다
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    // 경계를 그리기 시작하면 지도에 떠 있던 지번 핀·필지 강조를 치운다(초안 클릭을 가리지 않게)
    clearJibunPick();
    setSelectedCustomId(undefined);
    setAdminMeta(null);
    setDraft({ points: [] });
    setPanelOpen(true);
    setAdminMsg(
      "지도를 탭해 꼭짓점을 찍으세요. 다 찍었으면 더블클릭·우클릭·Enter — 마우스를 옮기지 않고 그 자리에서 완료됩니다."
    );
  }

  /**
   * 초안에 맞는 구역 정보 기본값 — 저장된 관리자 구역이면 그 값, 공식·대표 구역이면
   * 그 구역의 사업유형·추진단계·자치구를 그대로 채운다(‘경계·정보 수정’에서 바로 고칠 수 있게).
   */
  function metaFromDraft(d: {
    editingId?: string;
    replacesZoneId?: string;
    replacesName?: string;
  }): AdminMetaForm {
    const base = d.editingId ? customZones.find((z) => z.id === d.editingId) : undefined;
    const official = d.replacesZoneId ? seoulZones.find((z) => z.id === d.replacesZoneId) : undefined;
    const officialType = official?.type as CustomZoneType | undefined;
    const consentRate = base?.consentRate ?? official?.consentRate;
    return {
      name: base?.name ?? d.replacesName ?? official?.name ?? "",
      type:
        base?.type ??
        (officialType && (CUSTOM_ZONE_TYPES as readonly string[]).includes(officialType)
          ? officialType
          : "일반재개발"),
      stage: base?.stage ?? official?.stage ?? "추진준비",
      gu: base?.gu ?? official?.gu ?? "",
      note: base?.note ?? "",
      // 동의율 — 저장본이 있으면 그 값, 없으면 서울시 구역에 이미 있는 값(예: 기존 자료에서 옮긴 동의율)을 채운다
      consentRate:
        consentRate === null || consentRate === undefined ? "" : String(consentRate),
      consentDate: base?.consentDate ?? official?.consentDate ?? "",
      consentNote: base?.consentNote ?? official?.consentNote ?? "",
    };
  }

  /**
   * 선택한 구역(관리자 구역 또는 공식·대표 구역)의 경계·정보를 고치기 시작한다.
   *   경계를 안 고쳐도 사업유형·추진단계를 바로 고쳐 저장할 수 있도록 정보 입력 폼도 함께 연다.
   */
  function startEditSelected() {
    // 경계·정보를 고치기 시작하면 지번 핀을 치운다(그리기·수정 중에는 지번 찍기가 잠시 꺼진다)
    clearJibunPick();
    setPanelOpen(true);
    if (selectedCustom) {
      const next = {
        points: selectedCustom.ring.map(([lat, lng]) => [lat, lng] as [number, number]),
        editingId: selectedCustom.id,
        ...(selectedCustom.replacesZoneId ? { replacesZoneId: selectedCustom.replacesZoneId } : {}),
        ...(selectedCustom.replacesName ? { replacesName: selectedCustom.replacesName } : {}),
        ...(selectedCustom.replacesArea ? { replacesArea: selectedCustom.replacesArea } : {}),
      };
      setDraft(next);
      setAdminMeta(metaFromDraft(next));
      setAdminMsg(
        `‘${selectedCustom.name}’ 경계·정보를 고칩니다 — 경계는 그대로 두고 사업유형·추진단계·동의율만 바꿔 저장해도 됩니다.`
      );
      return;
    }
    const ring = selectedSeoul?.polygon ?? selected?.polygon;
    if (!ring || ring.length < 3) {
      setAdminMsg("선택한 구역에 경계 도형이 없습니다. ‘새 구역 그리기’로 시작하세요.");
      setAdminMeta(null);
      return;
    }
    const name = selectedSeoul?.name ?? selected?.name ?? "선택 구역";
    const officialArea = selectedSeoul?.area ?? ringAreaSqm(ring);
    // 이미 이 구역을 덮어쓴 저장본이 있으면 **그것을 고친다** — 같은 구역에 저장본이 둘로 늘지 않게.
    const officialId = selectedSeoul?.id ?? selected?.id;
    const existing = officialId
      ? customZones.find((z) => z.replacesZoneId === officialId)
      : undefined;
    if (existing) {
      editCustomGeometry(existing.id);
      return;
    }
    const next = {
      points: ring.map(([lat, lng]) => [lat, lng] as [number, number]),
      replacesZoneId: selectedSeoul?.id ?? selected?.id,
      replacesName: name,
      replacesArea: officialArea,
    };
    setDraft(next);
    setAdminMeta(metaFromDraft(next));
    setAdminMsg(
      `${name} 경계·정보를 고칩니다 — 점을 끌어 경계를 고치거나, 경계는 그대로 두고 사업유형·추진단계·동의율만 바꿔 저장하세요.`
    );
  }

  function addDraftPoint(lat: number, lng: number) {
    setDraft((d) => (d ? { ...d, points: [...d.points, [lat, lng] as [number, number]] } : d));
  }

  function moveDraftPoint(index: number, lat: number, lng: number) {
    setDraft((d) => {
      if (!d || !d.points[index]) return d;
      const points = d.points.slice();
      points[index] = [lat, lng];
      return { ...d, points };
    });
  }

  function insertDraftPoint(index: number, lat: number, lng: number) {
    setDraft((d) => {
      if (!d) return d;
      const points = d.points.slice();
      points.splice(Math.max(0, Math.min(points.length, index)), 0, [lat, lng]);
      return { ...d, points };
    });
  }

  function removeDraftPoint(index: number) {
    if (!draft) return;
    if (draft.points.length <= 3) {
      setAdminMsg("꼭짓점은 3개 이상이어야 합니다.");
      return;
    }
    setDraft({ ...draft, points: draft.points.filter((_, k) => k !== index) });
  }

  function undoDraftPoint() {
    setDraft((d) => (d && d.points.length ? { ...d, points: d.points.slice(0, -1) } : d));
  }

  /** 완료 → 메타 입력 폼 (이미 열려 있으면 입력값을 덮어쓰지 않는다) */
  function finishDraft() {
    if (!draft) return;
    if (draft.points.length < 3) {
      setAdminMsg("꼭짓점을 3개 이상 찍어야 구역이 됩니다.");
      return;
    }
    if (adminMeta) {
      setAdminMsg("구역 정보 입력 폼이 열려 있습니다 — 값을 고쳐 저장하세요.");
      return;
    }
    setAdminMeta(metaFromDraft(draft));
    setAdminMsg("구역 정보를 입력하고 저장하세요.");
  }

  function cancelDraft() {
    setDraft(null);
    setAdminMeta(null);
    setAdminMsg(null);
  }

  /** 메타 입력만 닫고 초안은 남긴다 — 점을 더 고칠 수 있게 */
  function cancelMeta() {
    setAdminMeta(null);
    setAdminMsg("구역 정보 입력을 닫았습니다 — 점을 더 고치거나 완료를 다시 누르세요.");
  }

  /** 메타 입력 → 저장(공용 DB + 이 브라우저) — 그리는/고치는 중이어도 꼭짓점 3개 이상이면 지금 모양대로 저장 */
  async function saveDraftZone() {
    if (!draft || !adminMeta) return;
    if (draft.points.length < 3) {
      setAdminMsg("꼭짓점을 3개 이상 찍거나 경계가 있는 구역을 골라야 저장할 수 있습니다.");
      return;
    }
    const name = adminMeta.name.trim();
    if (!name) {
      setAdminMsg("구역명을 입력하세요.");
      return;
    }
    const now = new Date().toISOString();
    const existing = draft.editingId ? customZones.find((z) => z.id === draft.editingId) : undefined;
    // 동의율 — 빈 칸은 '미공개'(null)로 저장해, 기존 값이 남아 있는 일이 없게 한다
    const consentRate = parseConsentRate(adminMeta.consentRate);
    const zone: CustomZone = {
      id: existing?.id ?? newCustomZoneId(),
      name,
      type: adminMeta.type,
      stage: adminMeta.stage,
      gu: adminMeta.gu.trim(),
      note: adminMeta.note.trim(),
      ring: draft.points.map(([lat, lng]) => [lat, lng] as [number, number]),
      areaSqm: ringAreaSqm(draft.points),
      consentRate,
      ...(adminMeta.consentDate.trim() ? { consentDate: adminMeta.consentDate.trim() } : {}),
      ...(adminMeta.consentNote.trim() ? { consentNote: adminMeta.consentNote.trim() } : {}),
      ...(draft.replacesZoneId ? { replacesZoneId: draft.replacesZoneId } : {}),
      ...(draft.replacesName ? { replacesName: draft.replacesName } : {}),
      ...(draft.replacesArea ? { replacesArea: draft.replacesArea } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing ? customZones.map((z) => (z.id === zone.id ? zone : z)) : [...customZones, zone];
    const localOk = commitCustomZones(next);
    setDraft(null);
    setAdminMeta(null);
    setSelectedCustomId(zone.id);
    // 저장한 뒤에는 화면을 그 구역에 맞추지 않는다 — 배율을 유지해야 바로 다음 구역을 이어서 그린다.
    setAdminMsg(
      `‘${zone.name}’ 저장 중 — 공용 DB에 올리는 중…` +
        (consentRate !== null ? ` (동의율 ${consentRate}%)` : " (동의율 미공개)")
    );

    // 공용 DB(Supabase)에 올린다 — 성공하면 모든 방문자·기기에서 같은 구역이 보인다
    const pushed = await pushCustomZoneToDb(zone);
    const officialNote = draft.replacesZoneId
      ? " 저장한 경계·사업유형·추진단계는 이제 지도 칩과 ‘서울시 고시 구역’ 상세 카드에 그대로 반영됩니다(모든 방문자)."
      : "";
    setAdminMsg(
      pushed.shared
        ? `‘${zone.name}’ 저장 완료 — 공용 DB에 보관되어 모든 방문자·기기에서 보입니다.` + officialNote
        : `‘${zone.name}’를 화면에는 반영했지만 DB에 올리지 못했습니다(${pushed.message ?? "연결 실패"}).` +
            (localOk ? " 이 브라우저에만 저장됩니다." : " 브라우저 저장도 실패했습니다(저장 공간 부족 등).")
    );
  }

  /**
   * 지도에서 관리자 구역을 **직접 눌러** 고른 경우 — 화면(줌·위치)은 그대로 둔다.
   *   · 사용자 제보(2026-11-24): “그리기(관리자) 모드에서 구역을 클릭하면 줌이 줄어들어”
   *     — 클릭 한 번에 그 구역 전체가 화면에 들어오도록 맞추면서(adminFit) 배율이 풀렸다.
   *   · 일반 구역(서울시 고시)도 지도에서 누를 때는 화면을 맞추지 않는 규칙과 같게 둔다.
   */
  function selectCustomZoneOnMap(id: string) {
    setSelectedCustomId(id);
    // 덮어쓰기 저장본이면 그 원본 서울시 구역을 상세 패널에도 열어 둔다 —
    //   패널(공식 구역)과 수정 대상(관리자 저장본)이 같은 구역을 가리키게.
    const z = customZones.find((v) => v.id === id);
    setSelectedId(z?.replacesZoneId);
    setPanelOpen(true);
  }

  /** 목록·도구 막대에서 골랐을 때 — 그 구역으로 이동한다(그리는/고치는 중에는 화면을 흔들지 않는다) */
  function selectCustomZone(id: string) {
    setSelectedCustomId(id);
    const z = customZones.find((v) => v.id === id);
    setSelectedId(z?.replacesZoneId);
    setPanelOpen(true);
    if (!draft) setAdminFit({ id, token: Date.now() });
  }

  /** 목록의 ‘경계·정보 수정’ — 경계 핸들과 함께 정보 입력 폼을 바로 연다 */
  function editCustomGeometry(id: string) {
    const z = customZones.find((v) => v.id === id);
    if (!z) return;
    // 경계 수정에 들어가면 지번 핀을 치운다(그리기·수정 중에는 지번 찍기가 잠시 꺼진다)
    clearJibunPick();
    setSelectedCustomId(id);
    setPanelOpen(true);
    const next = {
      points: z.ring.map(([lat, lng]) => [lat, lng] as [number, number]),
      editingId: z.id,
      ...(z.replacesZoneId ? { replacesZoneId: z.replacesZoneId } : {}),
      ...(z.replacesName ? { replacesName: z.replacesName } : {}),
      ...(z.replacesArea ? { replacesArea: z.replacesArea } : {}),
    };
    setDraft(next);
    setAdminMeta(metaFromDraft(next));
    setAdminMsg(`‘${z.name}’ 경계·정보를 고칩니다 — 사업유형·추진단계·동의율만 바꿔 저장해도 됩니다.`);
  }

  async function deleteCustomZone(id: string) {
    const z = customZones.find((v) => v.id === id);
    if (!z) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`‘${z.name}’ 구역을 삭제할까요?\n공용 DB에서도 지워져 모든 방문자·기기에서 사라집니다.`)
    ) {
      return;
    }
    commitCustomZones(customZones.filter((v) => v.id !== id));
    if (selectedCustomId === id) setSelectedCustomId(undefined);
    if (draft?.editingId === id) {
      setDraft(null);
      setAdminMeta(null);
    }
    setAdminMsg(`‘${z.name}’ 삭제 중 — 공용 DB에서 지우는 중…`);
    const removed = await deleteCustomZoneFromDb(id);
    setAdminMsg(
      removed.ok
        ? removed.shared
          ? `‘${z.name}’ 삭제 완료 — 공용 DB에서도 지웠습니다.`
          : `‘${z.name}’를 이 브라우저에서 지웠습니다(DB 미설정).`
        : `‘${z.name}’를 화면에서는 지웠지만 DB 삭제에 실패했습니다 — ${removed.message ?? "연결 실패"}`
    );
  }

  function exportDownload() {
    if (!customZones.length) return;
    try {
      const blob = new Blob([customZonesToGeoJSON(customZones)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setAdminMsg(`JSON 파일을 내려받았습니다 (${customZones.length}곳).`);
    } catch {
      setAdminMsg("JSON 파일을 만들지 못했습니다.");
    }
  }

  async function exportCopy() {
    if (!customZones.length) return;
    const json = customZonesToGeoJSON(customZones);
    try {
      await navigator.clipboard.writeText(json);
      setAdminMsg(`클립보드에 복사했습니다 (${customZones.length}곳 · ${json.length.toLocaleString()}자).`);
      return;
    } catch {
      /* 클립보드 권한이 없으면 아래 fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = json;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setAdminMsg(ok ? `클립보드에 복사했습니다 (${customZones.length}곳).` : "복사하지 못했습니다 — JSON 다운로드를 쓰세요.");
    } catch {
      setAdminMsg("복사하지 못했습니다 — JSON 다운로드를 쓰세요.");
    }
  }

  function exitAdminMode() {
    setAdminMode(false);
    setDraft(null);
    setAdminMeta(null);
    setSelectedCustomId(undefined);
    setAdminMsg(null);
    try {
      window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    } catch {
      /* 무시 */
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("admin")) {
        url.searchParams.delete("admin");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* 무시 */
    }
  }

  /** 지도에 넘기는 관리자 설정 — 일반 방문자에게는 undefined */
  const adminShapes: AdminZoneShape[] = useMemo(
    () =>
      customZones.map((z) => ({
        id: z.id,
        name: z.name,
        type: z.type,
        stage: z.stage,
        gu: z.gu,
        color: customZoneColor(z.type),
        ring: z.ring,
        replaces: !!z.replacesZoneId,
        ...(z.replacesZoneId ? { replacesZoneId: z.replacesZoneId } : {}),
      })),
    [customZones]
  );
  const adminMapConfig: AdminMapConfig | undefined = adminMode
    ? {
        zones: adminShapes,
        draft: draft?.points ?? null,
        adding: !!draft && !adminMeta,
        selectedId: selectedCustomId,
        fit: adminFit,
        onAddPoint: addDraftPoint,
        onFinishByFirstPoint: finishDraft,
        onMovePoint: moveDraftPoint,
        onInsertPoint: insertDraftPoint,
        onRemovePoint: removeDraftPoint,
        onSelectZone: selectCustomZoneOnMap,
      }
    : undefined;

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-52px)] items-center justify-center bg-slate-100 text-sm text-slate-500">
        데이터를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-52px)] w-full overflow-hidden bg-slate-200">
      {/* ── 지도: 화면 전체 ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        {/* 매물 배지 — 사용자 요청(2026-11-21)으로 초기 화면에는 매물 배지를 넘기지 않는다.
            `SHOW_MAP_LISTING_BADGES` 를 true 로 바꾸면 지도가 다시 `🏠 매물 N` 을 그린다. */}
        <MapPanel
          zones={mapFeaturedZones}
          seoulZones={mapSeoulZones}
          districtStats={districtStats}
          selectedZoneId={selectedId}
          onSelectZone={pickZone}
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          completedCount={completedZones.length}
          addressPin={addressPin}
          parcel={parcel}
          stationPin={stationPin}
          zoneFitRequest={zoneFitRequest}
          // 마지막으로 보던 화면 — 첫 렌더에서 읽은 저장본(없으면 서울 전체)
          initialView={bootView}
          onViewChange={handleViewChange}
          onResetView={resetToSeoul}
          listingCounts={SHOW_MAP_LISTING_BADGES ? listingCounts : undefined}
          myPins={myListings}
          myPinsOn={myOnly}
          onToggleMyPins={toggleMyOnly}
          fitSeoulRequest={seoulFitRequest}
          myFocusId={myFocusId}
          admin={adminMapConfig}
          txPins={txPins}
          txPinsOn={txPinsOn}
          onToggleTxPins={() => setTxPinsOn((v) => !v)}
          recentTxPins={recentTxPins}
          recentTxLoading={recentTxLoading}
          auctionPins={mapAuctionPins}
          auctionPinsOn={auctionPinsOn}
          onToggleAuctionPins={() => setAuctionPinsOn((v) => !v)}
          onSelectAuctionPin={openAuctionPin}
          activeAuctionPinId={auctionDetail?.pinId ?? null}
          onSelectTxPin={(pin) =>
            setBuildingTarget({
              gu: selected?.district ?? selectedSeoul?.gu ?? "",
              dong: pin.umdNm,
              jibun: pin.jibun,
              kind: (pin.kind === "연립·다세대" ? "연립·다세대" : "아파트") as BuildingTradeKind,
              name: pin.name,
            })
          }
          activeTxPin={
            buildingTarget ? { umdNm: buildingTarget.dong, jibun: buildingTarget.jibun } : null
          }
          zoneDraw={
            zoneDrawOn || zoneDrawDone
              ? {
                  active: zoneDrawOn,
                  ring: zoneDrawOn ? zoneDrawPoints : (zoneDrawDone ?? []),
                  onAddPoint: (lat, lng) => setZoneDrawPoints((pts) => [...pts, [lat, lng]]),
                  onFinish: finishZoneDraw,
                }
              : null
          }
          onToggleZoneDraw={toggleZoneDraw}
          jibunPickOn={jibunPickOn}
          onToggleJibunPick={() => setJibunPickOn((v) => !v)}
          onPickJibun={(lat, lng) => {
            void pickJibun(lat, lng);
          }}
          jibunPin={jibunPin}
          onCloseJibunPin={clearJibunPick}
          onOpenJibunHistory={(pin) => {
            void openJibunHistory({ gu: pin.gu, dong: pin.dong, jibun: pin.jibun });
          }}
          onOpenJibunZone={(id) => pickZone(id)}
          jibunHistoryLoading={jibunProbing}
        />
      </div>

      {/* ── 관리자 모드: 그리는 동안 손 가까이에 뜨는 도구 막대 ─────────────────── */}
      {adminMode && draft && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[640] hidden -translate-x-1/2 xl:block">
          <AdminDrawToolbar
            zones={customZones}
            draftPoints={draft.points}
            adding={!!draft && !adminMeta}
            editing={
              draft.editingId || draft.replacesName
                ? { id: draft.editingId, replacesName: draft.replacesName, officialArea: draft.replacesArea }
                : null
            }
            meta={adminMeta}
            message={adminMsg}
            selectedCustomId={selectedCustomId}
            selectedZoneName={selectedCustom?.name ?? selectedSeoul?.name ?? selected?.name}
            canEditSelectedRing={canEditSelectedRing}
            onStartNew={startNewDraw}
            onStartEditSelected={startEditSelected}
            onUndo={undoDraftPoint}
            onFinish={finishDraft}
            onCancel={cancelDraft}
            onCancelMeta={cancelMeta}
            onMetaChange={(patch) => setAdminMeta((m) => (m ? { ...m, ...patch } : m))}
            onSave={saveDraftZone}
            onSelectCustom={selectCustomZone}
            onEditCustomGeometry={editCustomGeometry}
            onDeleteCustom={deleteCustomZone}
            onExportDownload={exportDownload}
            onExportCopy={() => void exportCopy()}
            onExit={exitAdminMode}
          />
        </div>
      )}

      {/* ── ✏️ 구역 그려서 분석: 그리는 동안의 안내·조작 막대 ────────────────────
          · 모바일은 화면 아래(상세 패널은 접힌 상태), 데스크톱은 검색 패널 오른쪽 위에 띄운다 —
            검색창·필터와 지도 우측 상세 패널을 가리지 않는 자리다. */}
      {zoneDrawOn && (
        <div className="pointer-events-none absolute bottom-[6.6rem] left-2 right-2 z-[640] md:bottom-auto md:left-[400px] md:right-3 md:top-3">
          <div
            data-testid="zone-draw-bar"
            className="pointer-events-auto mx-auto w-full max-w-[560px] rounded-xl border-2 border-violet-300 bg-white/97 px-2.5 py-2 shadow-[0_2px_4px_rgba(16,24,40,.08),0_14px_32px_-18px_rgba(76,29,149,.55)]"
          >
            <div className="flex items-baseline gap-1.5">
              <b className="whitespace-nowrap text-[12.5px] font-bold text-violet-900">✏️ 구역 그려서 분석</b>
              <span className="truncate text-[10.5px] text-slate-500">
                지도에서 꼭짓점을 클릭(터치)하세요 — 마지막에 <b>분석하기</b> 또는 같은 자리 <b>더블클릭</b>
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="rounded-full bg-violet-100 px-2 py-[2px] text-[10.5px] font-bold text-violet-800">
                {zoneDrawPoints.length}점
              </span>
              {zoneDrawPoints.length >= 3 && (
                <span className="whitespace-nowrap text-[11px] font-bold text-violet-900">
                  {formatArea(ringAreaSqm(zoneDrawPoints))}
                </span>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  data-testid="zone-draw-undo"
                  onClick={() => setZoneDrawPoints((pts) => pts.slice(0, -1))}
                  disabled={zoneDrawPoints.length === 0}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-40"
                >
                  한 점 취소
                </button>
                <button
                  type="button"
                  data-testid="zone-draw-reset"
                  onClick={() => setZoneDrawPoints([])}
                  disabled={zoneDrawPoints.length === 0}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-40"
                >
                  초기화
                </button>
                <button
                  type="button"
                  data-testid="zone-draw-finish"
                  onClick={finishZoneDraw}
                  disabled={zoneDrawPoints.length < 3}
                  title={zoneDrawPoints.length < 3 ? "꼭짓점을 3개 이상 찍어야 분석할 수 있습니다" : "이 구역을 분석합니다"}
                  className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  분석하기
                </button>
                <button
                  type="button"
                  data-testid="zone-draw-close"
                  onClick={closeZoneDraw}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
                >
                  닫기 ✕
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 좌상단: 검색 + 필터 + ⚖️ 경매 물건 상세 ──────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-2 z-[620] flex w-[min(94vw,382px)] flex-col gap-2 sm:left-3 sm:top-3">
        <div className="pointer-events-auto relative z-[650] ui-float">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Icon name="search" size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitSearch();
                }
                if (e.key === "Escape") {
                  setQuery("");
                  clearAddress();
                }
              }}
              placeholder="구역명·사업유형·자치구·주소 검색 — 예: 신림동 362-32, 청년안심"
              aria-label="구역명·자치구·주소 검색"
              data-testid="zone-search-input"
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void runAddressSearch()}
              title="입력한 주소로 지번·도로명 주소를 찾아 소속 정비구역을 판별합니다"
              className="shrink-0 rounded-md border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
            >
              주소
            </button>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setAddrCandidates([]);
                  setAddrNote(null);
                }}
                aria-label="검색어 지우기"
                className="rounded px-1 text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* 검색 결과 — 구역 결과 + 지하철역 + 주소(지번·도로명) 후보 */}
          {(search.results.length > 0 ||
            search.hidden.length > 0 ||
            stationHits.length > 0 ||
            addrCandidates.length > 0 ||
            addrBusy ||
            (addrNote !== null && looksLikeAddress(query))) && (
            <div className="absolute inset-x-0 top-full z-[660] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              {search.results.length > 0 && (
                <ul className="max-h-[46vh] overflow-y-auto">
                  {search.results.map((z) => (
                    <li key={z.id}>
                      <button
                        onClick={() => {
                          pickZone(z.id);
                          setQuery("");
                        }}
                        data-testid="zone-result"
                        /* 2단 구조 — 위줄(구역명·자치구)은 절대 세로로 쪼개지지 않게 nowrap,
                           아래줄(사업유형·공식명·추진단계)은 넘치면 말줄임(truncate). */
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <i
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: TYPE_COLORS[z.type] }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span
                              className="min-w-0 truncate font-medium text-slate-800"
                              title={z.name}
                            >
                              {z.name}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                              {z.gu}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <span className="min-w-0 truncate text-[11px] text-slate-500">
                              {z.kind}
                              {z.alias?.[0] && !z.name.includes(z.alias[0]) ? ` · ${z.alias[0]}` : ""}
                            </span>
                            <span
                              className="ml-auto max-w-[58%] shrink-0 truncate whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                              title={z.polygon ? z.stage : "경계 미고시"}
                            >
                              {z.polygon ? z.stage : "경계 미고시"}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ── 지하철역 — 역 이름으로도 찾는다(클릭하면 지도가 역으로 확대) ── */}
              {stationHits.length > 0 && (
                <div className="border-t border-slate-200">
                  <p className="flex items-center gap-1.5 px-3 pt-2 text-[10px] font-semibold text-slate-500">
                    <Icon name="train" size={12} className="text-slate-400" /> 지하철역
                    <span className="font-normal text-slate-400">(클릭하면 역 주변 구역을 봅니다)</span>
                  </p>
                  <ul className="max-h-[30vh] overflow-y-auto pb-1">
                    {stationHits.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          data-testid="station-result"
                          onClick={() => pickStation(s)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-50"
                        >
                          <Icon name="train" size={13} className="shrink-0 text-slate-400" />
                          <span className="shrink-0 whitespace-nowrap text-sm font-medium text-slate-800">
                            {s.name}역
                          </span>
                          <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-slate-500">
                            {s.lines.slice(0, 3).map((id) => (
                              <i
                                key={id}
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: SUBWAY_LINES[id]?.color ?? "#64748b" }}
                              />
                            ))}
                            <span className="truncate whitespace-nowrap">{lineNames(s)}</span>
                          </span>
                          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] font-medium text-sky-700">
                            역 주변 보기
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 주소 후보 — 고르면(또는 엔터) 소속 정비구역을 판별한다 */}
              {(addrCandidates.length > 0 || addrBusy || addrNote) && (
                <div className="border-t border-slate-200 bg-slate-50/70">
                  <p className="flex items-center gap-1.5 px-3 pt-2 text-[10px] font-semibold text-slate-500">
                    <Icon name="pin" size={12} className="text-slate-400" /> 주소 · 지번·도로명
                    <span className="font-normal text-slate-400">(카카오)</span>
                    {addrBusy && <span className="ml-auto font-normal text-slate-400">찾는 중…</span>}
                  </p>
                  {addrCandidates.length > 0 && (
                    <ul className="max-h-[32vh] overflow-y-auto pb-1">
                      {addrCandidates.map((c) => (
                        <li key={c.key}>
                          <button
                            type="button"
                            data-testid="address-candidate"
                            onClick={() => acceptAddress(c)}
                            className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-blue-50/70"
                          >
                            <span aria-hidden className="mt-0.5 text-xs text-slate-400">
                              ⌖
                            </span>
                            <span className="min-w-0 flex-1">
                              {/* 주소 + 소속 구역명 — 한 줄에서 바로 읽히게(2026-11-23).
                                  · 카카오 주소 검색은 서울만 돌려주므로 앞의 `서울 ` 은 떼고 동·번지가 먼저 오게 한다
                                    (전체 주소는 title 로 남긴다).
                                  · 주소가 길면 주소만 말줄임하고 구역명 배지는 줄이지 않는다. */}
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="min-w-0 shrink truncate text-sm font-medium text-slate-800"
                                  title={c.label}
                                >
                                  {c.label.replace(/^서울(특별시)?\s+/, "")}
                                </span>
                                {addrZoneBadges.get(c.key) && (
                                  <AddressZoneBadge badge={addrZoneBadges.get(c.key)!} />
                                )}
                              </span>
                              {c.detail && (
                                <span className="block truncate text-[11px] text-slate-500">{c.detail}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-400">{c.kind}</span>
                          </button>
                        </li>
                      ))}
                      <li className="px-3 pb-1 pt-0.5 text-[10px] text-slate-400">
                        엔터를 누르면 첫 번째 주소로 구역을 판별합니다
                      </li>
                    </ul>
                  )}
                  {addrNote && addrCandidates.length === 0 && !addrBusy && (
                    <p className="px-3 pb-2 pt-1 text-[11px] text-slate-500">{addrNote}</p>
                  )}
                </div>
              )}

              {/* 준공 완료라 숨겨진 구역만 검색됐을 때 — 데이터 누락으로 오해하지 않도록 안내 */}
              {search.hidden.length > 0 && (
                <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p>
                    <b>{search.hidden[0].name}</b>
                    {search.hidden[0].stage ? ` (${search.hidden[0].stage})` : ""}
                    {search.hidden.length > 1 ? ` 외 ${search.hidden.length - 1}곳` : ""}은 준공 완료 구역이라
                    기본 지도에서 숨겨져 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCompleted(true)}
                    className="mt-1 rounded-full border border-amber-400 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    준공 완료 포함해서 보기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── ⚖️ 경매 물건 상세 — 지도 핀을 누르면 이 자리에 열린다(말풍선 대신) ── */}
        {auctionDetail && (
          <AuctionDetailCard
            items={auctionDetail.items}
            activeId={auctionDetail.activeId}
            onSelect={(id) =>
              setAuctionDetail((d) => (d ? { ...d, activeId: id } : d))
            }
            onClose={() => setAuctionDetail(null)}
            onLocate={(it) => {
              setAuctionFocus(it);
              if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
            }}
            onOpenList={(it) => {
              setPanelOpen(true);
              setAuctionListFocus({ id: it.id, token: Date.now() });
            }}
            zoneName={auctionDetail.items[0]?.zoneName}
            collectedAt={auctions?.meta?.collectedAt ?? null}
          />
        )}

        {/* ── 역 카드 — 고른 역과 그 주변 정비구역(골라서 바로 이동) ── */}
        {stationPick && (
          <div
            data-testid="station-card"
            className="pointer-events-auto ui-float p-3"
          >
            <div className="flex items-start gap-2">
              <Icon name="train" size={14} className="mt-0.5 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900" title={`${stationPick.name}역`}>
                  {stationPick.name}역
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  {lineNames(stationPick)} · 역 주변 700m
                </p>
              </div>
              <button
                type="button"
                onClick={clearStation}
                data-testid="station-pin-clear"
                title="역 핀과 주변 목록을 지웁니다"
                className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
              >
                지우기 ✕
              </button>
            </div>

            <p className="mt-2 text-[11px] font-semibold text-slate-600">
              역 주변 정비구역 {stationNearby.length}곳
              <span className="ml-1 font-normal text-slate-400">— 골라서 경계 보기</span>
            </p>
            {stationNearby.length > 0 ? (
              <div className="mt-1 flex flex-col gap-1">
                {stationNearby.map(({ zone, distance }) => (
                  <button
                    key={zone.id}
                    type="button"
                    data-testid="station-nearby-zone"
                    onClick={() => {
                      pickZone(zone.id);
                      setZoneFitRequest((n) => n + 1);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-left hover:border-slate-400 hover:bg-slate-50"
                  >
                    <i
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: TYPE_COLORS[zone.type] }}
                    />
                    <span className="min-w-0 truncate text-[11px] font-medium text-slate-800" title={zone.name}>
                      {zone.name}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{zone.gu}</span>
                    <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                      {meters(distance)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                반경 700m 안에 등록된 정비구역이 없습니다. 검색창에서 구역명·지번으로 찾아보세요.
              </p>
            )}
          </div>
        )}

        {/* ── 주소 판정 카드 — 핀을 찍은 주소의 결론과 다음 행동 ── */}
        {addrVerdict && (
          <div
            data-testid="address-card"
            className="pointer-events-auto ui-float p-3"
          >
            <div className="flex items-start gap-2">
              <Icon name="pin" size={14} className="mt-0.5 text-brand" />
              <div className="min-w-0 flex-1">
                <p
                  data-testid="address-pin-label"
                  className="truncate text-xs font-bold text-slate-900"
                  title={addrVerdict.address.label}
                >
                  {addrVerdict.address.label}
                </p>
                {addrVerdict.address.detail && (
                  <p className="truncate text-[10px] text-slate-500">{addrVerdict.address.detail}</p>
                )}
                {parcel && (
                  <p
                    data-testid="address-parcel"
                    className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-blue-700"
                    title={`${parcel.label} — 지적(연속지적도) 경계`}
                  >
                    <i aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-[1px] border border-blue-700 bg-blue-300" />
                    <span className="truncate">
                      지적 필지 {parcel.jibun ? `${parcel.jibun} ` : ""}경계 표시 중
                    </span>
                  </p>
                )}
                {parcelNote && (
                  <p className="mt-1 text-[10px] leading-snug text-amber-700">{parcelNote}</p>
                )}
              </div>
              <button
                type="button"
                onClick={clearAddress}
                data-testid="address-pin-clear"
                title="주소 핀과 안내를 지웁니다"
                className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
              >
                핀 지우기 ✕
              </button>
            </div>

            {/* 지번 실거래 — 주소 검색만으로도 그 지번의 5년 이력을 연다(지번이 있는 주소만) */}
            {addrJibun && (
              <div className="mt-1.5">
                <button
                  type="button"
                  data-testid="address-open-history"
                  disabled={jibunProbing}
                  onClick={() => void openJibunHistory(addrJibun)}
                  title={`${addrJibun.dong} ${addrJibun.jibun} 공동주택(아파트·연립다세대) 최근 5년 실거래`}
                  className={
                    "w-full rounded-lg py-1.5 text-[11px] font-bold transition " +
                    (jibunProbing
                      ? "cursor-progress bg-slate-100 text-slate-400"
                      : "bg-brand text-white hover:bg-brand-deep")
                  }
                >
                  {jibunProbing ? "실거래 확인 중…" : "이 지번 실거래 5년 보기"}
                </button>
                {jibunNote && (
                  <p className="mt-1 text-[10px] leading-snug text-amber-700">{jibunNote}</p>
                )}
              </div>
            )}

            {/* 결론 — 판정 종류별 색. 구역 밖은 판정 배너를 띄우지 않고 지점만 보여준다. */}
            {addrVerdict.status !== "outside" && (
            <div
              data-testid="address-status"
              className={
                "mt-2 rounded-xl border px-2.5 py-2 " +
                (addrVerdict.status === "inside"
                  ? "border-emerald-200 bg-emerald-50"
                  : addrVerdict.status === "completed"
                    ? "border-amber-300 bg-amber-50"
                    : addrVerdict.status === "near-candidate"
                      ? "border-violet-200 bg-violet-50"
                      : "border-rose-200 bg-rose-50")
              }
            >
              <p
                data-testid="address-status-headline"
                className={
                  "text-[13px] font-bold leading-snug " +
                  (addrVerdict.status === "inside"
                    ? "text-emerald-800"
                    : addrVerdict.status === "completed"
                      ? "text-amber-900"
                      : addrVerdict.status === "near-candidate"
                        ? "text-violet-900"
                        : "text-rose-800")
                }
              >
                {verdictHeadline(addrVerdict)}
              </p>

              {addrVerdict.status === "inside" && (
                <>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-900/80">
                    {addrVerdict.inside[0].zone.gu} · {addrVerdict.inside[0].zone.stage} ·{" "}
                    {addrVerdict.inside[0].zone.area.toLocaleString()}㎡
                    {addrVerdict.inside.length > 1 ? " · 겹친 구역이 있습니다" : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      data-testid="address-zone-fit"
                      onClick={() => {
                        pickZone(addrVerdict.inside[0].zone.id);
                        setZoneFitRequest((n) => n + 1);
                      }}
                      title="이 주소가 속한 구역 경계 전체를 한눈에 봅니다"
                      className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-800"
                    >
                      구역 전체 보기
                    </button>
                    {addrVerdict.inside.slice(1, 4).map((h) => (
                      <button
                        key={h.zone.id}
                        type="button"
                        onClick={() => pickZone(h.zone.id)}
                        title="이 주소를 함께 포함하는 다른 구역"
                        className="rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        겹침 · {h.zone.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {addrVerdict.status === "completed" && (
                <>
                  <p className="mt-0.5 text-[11px] leading-snug text-amber-900/80">
                    이미 준공·입주가 끝난 구역입니다. 기본 지도에서는 숨겨져 있어 함께 켜 두었습니다.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      data-testid="address-zone-fit"
                      onClick={() => {
                        pickZone(addrVerdict.completedHits[0].zone.id);
                        setZoneFitRequest((n) => n + 1);
                      }}
                      title="이 주소가 속한 구역 경계 전체를 한눈에 봅니다"
                      className="rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                    >
                      구역 전체 보기
                    </button>
                    {addrVerdict.completedHits.slice(1, 3).map((h) => (
                      <button
                        key={h.zone.id}
                        type="button"
                        onClick={() => pickZone(h.zone.id)}
                        className="rounded-full border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                      >
                        겹침 · {h.zone.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {addrVerdict.status === "near-candidate" && (
                <>
                  <p className="mt-0.5 text-[11px] leading-snug text-violet-900/80">
                    {addrVerdict.nearCandidates[0].zone.name}까지 약{" "}
                    {meters(addrVerdict.nearCandidates[0].distance)} · 구역계가 아직 고시되지 않아
                    포함 여부는 확정할 수 없습니다.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => pickZone(addrVerdict.nearCandidates[0].zone.id)}
                      className="rounded-full bg-violet-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-violet-800"
                    >
                      후보지 보기
                    </button>
                  </div>
                </>
              )}
            </div>
            )}

            {/* 구역 밖·후보지 인근 — 가장 가까운 정비구역 1~3곳(클릭하면 그 구역으로 이동) */}
            {(addrVerdict.status === "outside" || addrVerdict.status === "near-candidate") &&
              addrVerdict.nearest.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold text-slate-500">
                    가까운 정비구역 · 직선거리
                  </p>
                  <ul className="space-y-1">
                    {addrVerdict.nearest.slice(0, 3).map((n) => (
                      <li key={n.zone.id}>
                        <button
                          type="button"
                          data-testid="nearest-zone"
                          onClick={() => pickZone(n.zone.id)}
                          className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-left text-[11px] hover:border-blue-300 hover:bg-blue-50/60"
                        >
                          <i
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: TYPE_COLORS[n.zone.type] }}
                          />
                          <span className="truncate font-semibold text-slate-800">{n.zone.name}</span>
                          <span className="truncate text-[10px] text-slate-500">
                            {n.completed ? "준공" : n.zone.stage}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">
                            {meters(n.distance)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
              경계는 서울시 고시 도형 기준입니다. 실제 필지 경계와는 다를 수 있어요.
            </p>
          </div>
        )}

        {/* 필터 — 접었다 펼 수 있는 카드 */}
        <div className="pointer-events-auto ui-float">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <span className="text-xs font-bold text-slate-800">필터</span>
            <span className="truncate text-[11px] text-slate-500">
              {typeFilter} · {stageFilter}
              {listingsOnly ? " · 매물 있는 구역" : ""}
              {myOnly ? " · 내 매물만" : ""}
              {leaseOnly ? " · 임대사업자 승계" : ""}
              {noPermit ? " · 토허제 없음" : ""}
            </span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400">
              {filtersOpen ? "접기 ▲" : "펼치기 ▼"}
            </span>
          </button>
          {filtersOpen && (
            <div className="max-h-[46vh] space-y-2 overflow-y-auto border-t border-slate-100 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">구역 유형</span>
                {ZONE_TYPES.map((t) => (
                  <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">추진단계</span>
                {STAGES.map((s) => (
                  <Chip key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">매물 조건</span>
                <Chip active={myOnly} onClick={toggleMyOnly}>
                  <span data-testid="filter-my-only">내 매물만 보기 {myListings.length}</span>
                </Chip>
                <Chip
                  active={listingsOnly}
                  onClick={() => setListingsOnly((v) => !v)}
                >
                  <span data-testid="filter-listings-only">매물 있는 구역 {listingZoneTotal}</span>
                </Chip>
                <Chip active={leaseOnly} onClick={() => setLeaseOnly((v) => !v)}>
                  <span data-testid="filter-lease-only">임대사업자 승계</span>
                </Chip>
                <Chip active={noPermit} onClick={() => setNoPermit((v) => !v)}>
                  <span data-testid="filter-no-permit">실거주(토허제) 없음</span>
                </Chip>
                <span className="text-[10px] leading-tight text-slate-400">
                  {myOnly
                    ? `내 매물 ${myListings.length}건 핀 · 정비구역 ${myZoneIds.size}곳만 표시`
                    : SHOW_MAP_LISTING_BADGES
                      ? `${filteredListings.length}건 매물 · 지도에 매물 배지`
                      : `${filteredListings.length}건 매물 · 구역 상세에서 확인`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={toggleCompleted}
                  aria-pressed={showCompleted}
                  title={
                    showCompleted
                      ? "준공·입주 완료 구역을 지도에서 다시 숨깁니다"
                      : "이미 준공·입주가 끝난 구역까지 지도에 표시합니다"
                  }
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition " +
                    (showCompleted
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-dashed border-slate-300 bg-white text-slate-500 hover:border-slate-500 hover:text-slate-700")
                  }
                >
                  <Icon name="check" size={13} />
                  준공 완료 포함 ({completedZones.length})
                </button>
                <span className="text-[11px] leading-tight text-slate-500">
                  {showCompleted
                    ? `준공·입주 완료 ${completedZones.length}곳까지 표시 중 (점선)`
                    : `준공 구역 ${completedZones.length}곳 숨김 · 진행 중 ${visibleSeoulZones.length.toLocaleString()}곳`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 관리자 모드 도구 — 검색·필터 아래에 붙는다(일반 방문자에게는 없음) ── */}
      {adminMode && (
        <AdminZonePanel
          zones={customZones}
          draftPoints={draft?.points ?? null}
          adding={!!draft && !adminMeta}
          editing={
            draft?.editingId || draft?.replacesName
              ? { id: draft.editingId, replacesName: draft.replacesName, officialArea: draft.replacesArea }
              : null
          }
          meta={adminMeta}
          message={adminMsg}
          selectedCustomId={selectedCustomId}
          selectedZoneName={selectedCustom?.name ?? selectedSeoul?.name ?? selected?.name}
          canEditSelectedRing={canEditSelectedRing}
          onStartNew={startNewDraw}
          onStartEditSelected={startEditSelected}
          onUndo={undoDraftPoint}
          onFinish={finishDraft}
          onCancel={cancelDraft}
          onCancelMeta={cancelMeta}
          onMetaChange={(patch) => setAdminMeta((m) => (m ? { ...m, ...patch } : m))}
          onSave={saveDraftZone}
          onSelectCustom={selectCustomZone}
          onEditCustomGeometry={editCustomGeometry}
          onDeleteCustom={deleteCustomZone}
          onExportDownload={exportDownload}
          onExportCopy={() => void exportCopy()}
          onExit={exitAdminMode}
        />
      )}
      </div>

      {/* ── 좌하단: 범례 ───────────────────────────────────────────────────── */}
      <div className="pointer-events-auto absolute bottom-14 left-2 z-[600] max-w-[min(94vw,430px)] ui-float md:bottom-[3.4rem] md:left-2">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
        >
          <span className="text-xs font-bold text-slate-800">범례</span>
          <span className="truncate text-[11px] text-slate-500">
            서울시 {showCompleted ? "정비구역 전체" : "진행 중 정비구역"}{" "}
            {mapSeoulZones.length.toLocaleString()}곳
            {typeFilter === "전체" ? "" : ` · ${typeFilter}만`}
            {seoulMeta?.asOf ? ` · ${seoulMeta.asOf} 기준` : ""}
          </span>
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400">
            {legendOpen ? "▲" : "▼"}
          </span>
        </button>
        {legendOpen && (
          <div className="space-y-1.5 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
            <div className="grid grid-cols-2 gap-x-3 gap-y-[3px]">
              {LEGEND_GROUPS.map((g) => (
                <span key={g.label} className="inline-flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: g.color }} />
                  <span className="truncate">{g.label}</span>
                  <b className="ml-auto shrink-0 font-semibold text-ink">
                    {g.types.reduce((n, t) => n + (typeCounts[t] ?? 0), 0).toLocaleString()}
                  </b>
                </span>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              경계·면적·단계: 서울시 도시계획사업(서울플랜+)·의제처리구역(UQ181) 실데이터 ·{" "}
              <b>점</b>은 구역계 미고시 후보지(예: 신길16-1·방배16구역) · <b>점선</b>은 준공·입주 완료 구역 ·
              <b>옅은 점선 원</b>은 위치만 알려 주는 근사 경계(실제 구역계 아님)
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              <b>지도 가격표</b>는 국토교통부 신고 실거래 최근 {recentTxMeta?.months ?? 3}개월을 건물(법정동+지번) 단위로 묶은 것입니다
              {recentTxPins.length > 0 ? ` (${recentTxPins.length.toLocaleString()}곳${recentTxMeta?.asOf ? ` · ${recentTxMeta.asOf} 기준` : ""})` : ""} ·
              첫 화면에서는 꺼 두고, 지도 위 <b>「실거래」</b> 토글을 누르면 표시됩니다. 서울 전체(구 배지) 화면에서는 구를 눌러 확대하면 가격표가 보입니다.
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              <b style={{ color: TYPE_COLORS["재건축"] }}>재건축</b> = 서울시 사업유형 재건축(단독·공동) ·
              아파트 단지 재건축은 재개발과 사업 절차·권리가 달라 따로 표시합니다 ·{" "}
              <b style={{ color: TYPE_COLORS["역세권"] }}>역세권</b> = 역세권활성화·청년안심주택 ·{" "}
              <b style={{ color: TYPE_COLORS["장기전세"] }}>장기전세</b> = 장기전세주택·미리내집 (서울시 사업유형) ·{" "}
              <b style={{ color: TYPE_COLORS["지주택"] }}>지주택</b> = 지역주택조합이 지구단위계획구역으로 추진하는 공동주택
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              <b style={{ color: TYPE_COLORS["민간도심복합(성장거점형)"] }}>민간도심복합</b> = 민간이 하는
              도심복합개발(도공복의 민간판) · 성장거점형·주거중심형을 한 색으로 묶었습니다
            </p>
            <p className="text-[10px] leading-snug text-slate-400">
              구역을 클릭하면 상세 정보가 열립니다 · 지도를 움직여 둘러보세요 ·{" "}
              멀리서 보면 <b>자치구 총 개수 뱃지</b>가 뜨고, 구 뱃지를 누르면 그 구로 확대됩니다
            </p>
          </div>
        )}
      </div>

      {/* ── 우측: 구역 상세 · 목록 패널 ─────────────────────────────────────── */}
      {panelOpen ? (
        <aside className="absolute z-[610] flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.05),0_18px_44px_-24px_rgba(16,24,40,.38)] inset-x-2 bottom-2 top-auto max-h-[62dvh] md:inset-x-auto md:left-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-[400px]">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <b className="text-sm font-bold text-slate-900">
              {selectedCustom
                ? selectedCustom.name
                : zoneDrawDone && !selected && !selectedSeoul
                  ? "✏️ 내가 그린 구역"
                  : selected
                    ? selected.name
                    : selectedSeoul
                      ? "서울시 고시 구역"
                      : "리디브 대시보드"}
            </b>
            {!selected && !selectedSeoul && !zoneDrawDone && (
              <span className="text-[11px] text-slate-500">최근 변동</span>
            )}
            {!selected && !selectedSeoul && zoneDrawDone && (
              <span className="text-[10px] text-violet-700">지도에서 그린 경계 · 임시 분석</span>
            )}
            {/* ⚖️ 경매 배지 — 구역 상세의 경매 섹션은 아래쪽이라 놓치기 쉽다.
                헤더(스크롤과 무관하게 늘 보이는 줄)에서 바로 그 섹션으로 부드럽게 내려간다. */}
            {selectedAuctions.length > 0 && (
              <button
                type="button"
                data-testid="panel-auction-badge"
                onClick={() => {
                  const el = document.getElementById("zone-auctions");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                title={`이 구역 경매 ${countAuctionSales(selectedAuctions)}건 — 누르면 경매 목록으로 내려갑니다`}
                className="shrink-0 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-[3px] text-[11px] font-bold text-amber-900 hover:border-amber-500 hover:bg-amber-100"
              >
                ⚖️ 경매 {countAuctionSales(selectedAuctions)}건
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="패널 접기"
              className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              접기 ✕
            </button>
          </div>
          <div className="ui-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {/* ── ✏️ 내가 그린 구역 — 1차 추정(구역현황) → 「분석 실행」으로 정밀 분석 ──
                · ZoneVitalStats 가 /api/zone-stats(노후도·동수·밀도·과소필지)를 바로 돌리고,
                  「분석 실행」을 누르면 /api/zone-stats/precise(조례 호수밀도·조합원·대지지분·
                  모아타운50%·신통기획60% 판정·유형 비율)까지 낸다.
                · 저장하지 않는 임시 분석이다 — 관리자(R?admin=1)의 구역 저장과 무관하다. */}
            {zoneDrawDone && !selected && !selectedSeoul && (
              <div
                data-testid="zone-draw-card"
                className="mb-3 space-y-2 rounded-xl border-2 border-violet-300 bg-violet-50/60 p-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">분석</span>
                  <b className="text-sm font-bold text-slate-900">내가 그린 구역</b>
                  <span className="whitespace-nowrap text-[11px] font-bold text-violet-900">
                    {formatArea(ringAreaSqm(zoneDrawDone))}
                  </span>
                  <span className="ml-auto whitespace-nowrap text-[10px] text-slate-400">
                    {zoneDrawDone.length}점 · 저장 안 됨
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    data-testid="zone-draw-redraw"
                    onClick={redrawZoneDraw}
                    className="rounded-full bg-violet-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-violet-800"
                  >
                    다시 그리기
                  </button>
                  <button
                    type="button"
                    data-testid="zone-draw-clear"
                    onClick={closeZoneDraw}
                    className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  >
                    지우기
                  </button>
                  <span className="ml-auto self-center text-[10px] text-slate-400">
                    건축물대장·연속지적도 기준 추정치
                  </span>
                </div>
                <ZoneVitalStats shape={{ polygon: zoneDrawDone }} areaSqm={ringAreaSqm(zoneDrawDone)} />
                <p className="break-keep text-[10px] leading-snug text-slate-500">
                  경계는 내가 그린 선이라 실제 필지와 다를 수 있습니다 — 건물·필지는 그 선 안에 중심이
                  드는 것만 센다. 범위를 고치려면 <b>다시 그리기</b>.
                </p>
              </div>
            )}
            {/* 0-0) 관리자 — 고른 구역의 경계·정보를 바로 고치는 자리.
                왼쪽 관리자 패널까지 가지 않아도, 구역을 클릭한 그 자리에서 수정 화면이 열린다. */}
            {adminMode && !selectedCustom && (selectedSeoul || selected) && (
              <div
                data-testid="admin-edit-selected-bar"
                className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-sky-300 bg-sky-50/70 p-2"
              >
                <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">관리자</span>
                <b className="min-w-0 flex-1 truncate text-[11px] font-semibold text-sky-950">
                  {selectedSeoul?.name ?? selected?.name} 경계·정보(동의율) 수정
                </b>
                <button
                  type="button"
                  data-testid="admin-edit-selected-inline"
                  onClick={startEditSelected}
                  className="shrink-0 rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-800"
                >
                  수정하기
                </button>
              </div>
            )}
            {/* 내 매물만 보기 요약 — 핀을 누르기 전에 무엇이 달려 있는지 한눈에 */}
            {myOnly && !selected && !selectedSeoul && (
              <div data-testid="my-listings-summary" className="mb-3 space-y-1.5 rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <b className="text-sm font-bold text-amber-950">내 매물 {myListings.length}건</b>
                  <span className="text-[10px] text-amber-800/80">
                    {myListings.length > MY_LISTINGS.length
                      ? `부동산포스 ${MY_LISTINGS.length}건 + 등록 ${myListings.length - MY_LISTINGS.length}건`
                      : `부동산포스 · ${MY_LISTINGS_AS_OF} 기준`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-amber-900">
                  {["매매", "전세", "월세"].map(
                    (k) => myByDeal[k] && <span key={k}>{k} {myByDeal[k]}</span>
                  )}
                  <span className="text-amber-700/60">·</span>
                  <span>정비구역 안 {myListings.filter((p) => p.zoneId).length}건 / 구역 밖 {myListings.filter((p) => !p.zoneId).length}건</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {myByGu.map(([gu, n]) => (
                    <span key={gu} className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                      {gu} {n}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] leading-snug text-amber-900/80">
                  지도 핀을 누르면 주소·가격·면적·부동산포스 매물번호가 열립니다. 구역 안 매물은
                  <b> ‘○○구역 열기’</b>로 경계·실거래까지 볼 수 있어요. 끄면 서울 전체 재개발 지도로 돌아갑니다.
                </p>
              </div>
            )}

            {/* 0) 관리자 구역 — 내가 그린 구역의 상세 */}
            {selectedCustom && (
              <div data-testid="admin-custom-card" className="mb-3 space-y-2 rounded-xl border-2 border-sky-300 bg-sky-50/60 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">관리자</span>
                  <b className="text-sm font-bold text-slate-900">{selectedCustom.name}</b>
                  <span className="text-[11px] text-slate-600">{selectedCustom.type} · {selectedCustom.stage}</span>
                  {selectedCustom.gu && <span className="text-[11px] text-slate-500">{selectedCustom.gu}</span>}
                </div>
                <p className="text-xs font-semibold text-slate-800">{formatArea(selectedCustom.areaSqm)}</p>
                {selectedCustom.replacesName && (
                  <p className="text-[11px] text-emerald-800">
                    {selectedCustom.replacesName}
                    {selectedCustom.replacesArea
                      ? ` 고시면적 ${Math.round(selectedCustom.replacesArea).toLocaleString()}㎡ → 그린 면적 ${Math.round(
                          selectedCustom.areaSqm
                        ).toLocaleString()}㎡`
                      : " 경계 보정"}
                  </p>
                )}
                {selectedCustom.note && (
                  <p className="whitespace-pre-wrap text-[11px] leading-snug text-slate-600">{selectedCustom.note}</p>
                )}
                <ZoneConsent
                  rate={selectedCustom.consentRate}
                  date={selectedCustom.consentDate}
                  note={selectedCustom.consentNote}
                  dense
                  edited={typeof selectedCustom.consentRate === "number"}
                />
                {/* 직접 그린 구역도 같은 계산 — 현장에서 그린 경계로 요건(노후도 30년↑)을 바로 본다 */}
                {selectedCustom.ring && selectedCustom.ring.length >= 3 && (
                  <ZoneVitalStats
                    shape={{ polygon: selectedCustom.ring }}
                    areaSqm={selectedCustom.areaSqm}
                  />
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => editCustomGeometry(selectedCustom.id)}
                    className="rounded-full bg-sky-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                  >
                    경계 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomZone(selectedCustom.id)}
                    className="rounded-full border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    삭제
                  </button>
                  <span className="ml-auto self-center text-[10px] text-slate-400">
                    {isCustomZoneShared(selectedCustom.id) ? "공용 DB에 저장됨" : "공용 DB 미저장"}
                  </span>
                </div>
              </div>
            )}

            {/* 1) 대표 구역 상세 */}
            {selected && (
              <div className="space-y-4">
                {/* 토허제 참고 안내 — 상세 패널 맨 위(확정 판정이 아님을 함께 밝힌다) */}
                <LandPermitNotice
                  gu={selected.district}
                  names={[selected.name]}
                  type={selected.type}
                  flagged={selected.toehoApplied}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={selected.type} />
                  <StageBadge stage={selected.stage} stageOrder={STAGE_ORDER[selected.stage]} />
                  <Badge tone={selected.residenceRequired ? "red" : "slate"}>
                    {selected.residenceRequired ? "실거주 의무" : "실거주 무관"}
                  </Badge>
                  {selected.toehoApplied && <Badge tone="gold">토허제 적용</Badge>}
                  <Badge tone="blue">예상 입주 {selected.moveInEstimate}</Badge>
                </div>

                {/* 동의율 — 모든 구역 상세에 같은 자리로 붙는다(값이 없으면 '미공개') */}
                <ZoneConsent
                  rate={selected.consentRate}
                  date={selected.consentDate}
                  note={selected.consentNote}
                />

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">사업개요</h3>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl border border-slate-200 p-3 text-xs">
                    <dt className="whitespace-nowrap text-slate-500">총 세대수</dt>
                    <dd className="text-right font-semibold">{selected.households.toLocaleString()}세대</dd>
                    <dt className="whitespace-nowrap text-slate-500">추정 비례율</dt>
                    <dd className="text-right font-semibold">{selected.ratioEstimate}%</dd>
                    <dt className="whitespace-nowrap text-slate-500">시공사</dt>
                    <dd className="text-right font-semibold">{selected.constructor}</dd>
                    <dt className="whitespace-nowrap text-slate-500">예상 입주</dt>
                    <dd className="text-right font-semibold">{selected.moveInEstimate}</dd>
                  </dl>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500">{selected.summary}</p>

                {/* 구역현황(추정) — 사업개요 아래에 노후도·동수밀도를 붙인다 */}
                {selected.polygon && selected.polygon.length >= 3 && (
                  <ZoneVitalStats
                    shape={{ polygon: selected.polygon, parts: selected.parts, holes: selected.holes }}
                    areaSqm={selected.official?.area ?? null}
                  />
                )}

                {/* 검증 매물 — 실거래가 위에 '지금 나온 물건'을 먼저 */}
                <ZoneListingCards listings={selectedListings} zoneId={selected.id} zoneName={selected.name} />

                {/* 구역 내 법원경매 물건 — 매물 카드 바로 아래에 붙여 ‘지금 법원에 걸린 물건’을 함께 본다 */}
                <ZoneAuctions
                  items={selectedAuctions}
                  meta={auctions?.meta ?? null}
                  onLocate={(it) => {
                    setAuctionFocus(it);
                    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
                  }}
                  onSelectItem={openAuctionItem}
                  highlightId={
                    auctionDetail && auctionDetail.zoneId === selectedId ? auctionDetail.activeId : null
                  }
                  scrollToken={auctionListFocus?.token ?? null}
                />

                {/* 국토부 실거래가 — 샘플 거래와 별개로 실제 신고 거래를 함께 보여준다 */}
                <ZoneTransactions
                  gu={selected.district}
                  names={[selected.name]}
                  center={selected.center}
                  polygon={selected.polygon}
                  parts={selected.parts}
                  onTxPins={setTxPins}
                  onOpenBuilding={setBuildingTarget}
                />

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">추진경과</h3>
                  <ol className="ml-1.5 space-y-2 border-l-2 border-slate-200 pl-3 text-xs">
                    {selected.timeline.map((t) => (
                      <li key={t.date} className="relative">
                        <span className="absolute -left-[18px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                        <div className="text-[10px] text-slate-400">{t.date}</div>
                        {t.sourceUrl ? (
                          <a
                            href={t.sourceUrl}
                            className="font-medium text-blue-700 underline decoration-blue-200 hover:decoration-blue-500"
                          >
                            {t.label}
                          </a>
                        ) : (
                          <span className="font-medium">{t.label}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">
                    실거래가 분석 <span className="font-normal text-slate-400">(샘플)</span>
                  </h3>
                  <TransactionTrend transactions={selectedTx} />
                  <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">거래월</th>
                          <th className="px-2 py-1.5 font-medium">유형</th>
                          <th className="px-2 py-1.5 font-medium">동/층</th>
                          <th className="px-2 py-1.5 text-right font-medium">전용</th>
                          <th className="px-2 py-1.5 text-right font-medium">거래가</th>
                          <th className="px-2 py-1.5 text-right font-medium">대지지분</th>
                          <th className="px-2 py-1.5 text-right font-medium">공시가 배수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTx.map((t) => (
                          <tr key={t.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5">{t.date}</td>
                            <td className="px-2 py-1.5">{t.kind}</td>
                            <td className="px-2 py-1.5">{t.dong}</td>
                            <td className="px-2 py-1.5 text-right">{t.areaSqm}㎡</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{man(t.price)}</td>
                            <td className="px-2 py-1.5 text-right">{t.landShareSqm ? t.landShareSqm + "㎡" : "-"}</td>
                            <td className="px-2 py-1.5 text-right">{calcMultiple(t) ? calcMultiple(t) + "배" : "-"}</td>
                          </tr>
                        ))}
                        {selectedTx.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-2 py-6 text-center text-slate-400">
                              실거래 데이터가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">
                    구역 내 등록 매물 비교
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                      매매가·초기투자금 무료 / 권리가액·연락처는 열람권
                    </span>
                  </h3>
                  <ListingCompare
                    listings={selectedListings}
                    zones={zones}
                    unlockedIds={unlocked}
                    onUnlockRequest={setUnlockTarget}
                  />
                </div>

                {/* 이 구역 이야기 — 커뮤니티(community_posts)의 zone_id 글. 패널에서 바로 한줄 글쓰기 */}
                <ZoneTalk zoneId={selected.id} zoneName={selected.name} />

                <p className="text-[10px] leading-snug text-slate-400">
                  ※ 구역 경계·면적·추진단계는 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」(OA-22712)
                  실데이터이며, 경계 도형은 같은 구역의 「서울시 의제처리구역 위치정보」(OA-20957/UQ181) 정밀
                  도형이 있으면 그것을 씁니다. 세대수·비례율·시공사·거래·매물은 데모 샘플값입니다.
                </p>
              </div>
            )}

            {/* 2) 서울시 고시 구역 상세 (대표 구역이 아닌 구역) */}
            {selectedSeoul && (
              <ZoneOfficialPanel
                zone={selectedSeoul}
                listings={selectedListings}
                auctions={selectedAuctions}
                auctionsMeta={auctions?.meta ?? null}
                onLocateAuction={(it) => {
                  setAuctionFocus(it);
                  if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
                }}
                onSelectAuction={openAuctionItem}
                auctionHighlightId={
                  auctionDetail && auctionDetail.zoneId === selectedId ? auctionDetail.activeId : null
                }
                auctionScrollToken={auctionListFocus?.token ?? null}
                onTxPins={setTxPins}
                onOpenBuilding={setBuildingTarget}
                meta={
                  seoulMeta ?? {
                    source: "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+)",
                    sourceDetail: "OA-20957 서울시 의제처리구역 위치정보(UQ181)",
                    asOf: "2026-09-10",
                    asOfDetail: "2026-09-11",
                    count: seoulZones.length,
                  }
                }
                onClose={() => setSelectedId(undefined)}
              />
            )}

                        {/* 3) 아무것도 선택되지 않았을 때: ✏️ 구역 그려서 분석 + ⚡ 최근 변동 구역 */}
            {!selected && !selectedSeoul && (
              <div className="space-y-3">
                {/* ✏️ 구역 그려서 분석 — 아무것도 선택되지 않은 화면에서도 바로 시작할 수 있게 */}
                {!zoneDrawDone && !zoneDrawOn && (
                  <section
                    data-testid="zone-draw-start"
                    className="rounded-xl border border-violet-200 bg-violet-50/60 p-2.5"
                  >
                    <b className="text-[12.5px] font-bold text-violet-900">✏️ 구역 그려서 분석</b>
                    <p className="mt-0.5 break-keep text-[10.5px] leading-snug text-violet-900/70">
                      지도에서 꼭짓점을 찍어 그린 블록의 노후도·요건·조합원·유형 비율을 바로 분석합니다
                    </p>
                    <button
                      type="button"
                      onClick={toggleZoneDraw}
                      className="mt-1.5 w-full rounded-lg bg-violet-600 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700"
                    >
                      지도에서 그리기 시작
                    </button>
                  </section>
                )}

                <section data-testid="recent-zones" className="rounded-xl border border-slate-200 bg-white p-2.5">                  <div className="mb-1 flex items-baseline gap-1.5">
                    <b className="text-[12.5px] font-bold text-slate-900">⚡ 최근 변동 구역</b>
                    <span className="text-[10px] text-slate-500">고시·공람·단계가 새로 반영된 곳</span>
                  </div>
                  <div className="space-y-0.5">
                    {recentZones.length === 0 && (
                      <p className="px-1 py-2 text-[11px] text-slate-400">불러오는 중…</p>
                    )}
                    {recentZones.map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => pickZone(z.id)}
                        data-testid="recent-zone-item"
                        data-zone-id={z.id}
                        title={`${z.name} · ${z.asOf} ${z.label ?? ""} ${z.note ?? ""}`}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-blue-50/60"
                      >
                        <span className="w-8 shrink-0 text-center text-[9.5px] font-bold text-slate-400">
                          {z.asOf.slice(5).replace("-", ".")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold text-slate-900">{z.name}</span>
                          <span className="mt-[1px] block truncate text-[10px] text-slate-500">
                            {[z.gu, z.label].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-300">›</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute bottom-2 right-2 z-[610] rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur hover:bg-white md:bottom-auto md:right-3 md:top-3"
        >
          구역 정보 ▲
        </button>
      )}

      {buildingTarget && (
        <BuildingTradeHistory target={buildingTarget} onClose={() => setBuildingTarget(null)} />
      )}

      {unlockTarget && (
        <UnlockModal
          listing={unlockTarget}
          zone={zones.find((z) => z.id === unlockTarget.zoneId)}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={unlock}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition " +
        (active
          ? "border-brand bg-brand text-white"
          : "border-line bg-white text-slate-600 hover:border-slate-400 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

/** 유형별 실거래 추이 — 간단한 미니 바차트 (외부 차트 라이브러리 의존성 없음) */
function TransactionTrend({ transactions }: { transactions: Transaction[] }) {
  const kinds = [...new Set(transactions.map((t) => t.kind))];
  if (transactions.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {kinds.map((k) => {
        const rows = transactions.filter((t) => t.kind === k).sort((a, b) => a.date.localeCompare(b.date));
        const max = Math.max(...rows.map((r) => r.price));
        return (
          <div key={k} className="rounded-xl border border-slate-200 p-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-slate-600">{k}</span>
              <span className="text-[10px] text-slate-400">만원</span>
            </div>
            <div className="flex h-14 items-end gap-1">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-1 flex-col items-center gap-0.5" title={r.date + " " + man(r.price) + "만원"}>
                  <div
                    className="w-full rounded-t bg-blue-500/80"
                    style={{ height: Math.max(8, (r.price / max) * 48) + "px" }}
                  />
                  <span className="text-[9px] text-slate-400">{r.date.slice(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              최저 {man(Math.min(...rows.map((r) => r.price)))} ~ 최고 {man(max)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
