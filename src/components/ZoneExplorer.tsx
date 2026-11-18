"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneExplorer — 메인 탐색기 (지도 중심 · 전체 화면 레이아웃)
//  · 재개발뷰(jaeview.com)·네이버지도처럼 **지도가 화면 전체**를 채우고,
//    검색·필터·범례·구역 상세는 지도 위에 떠 있는 패널로 올린다.
//  · 재개발닷컴 스타일: 유형/단계 필터 칩 + 구역 요약 뱃지(등록매물수·최저가·최저 초기투자금)
//  · 갈타맵 스타일: 구역 상세(사업개요·추진경과 타임라인·실거래 배수 분석·매물 비교)
//  · 재개발뷰 스타일: 실거주 의무/토허제 뱃지, 예상 입주 구간
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { Listing, MapZoneType, Transaction, Zone, ZoneStage } from "@/lib/types";
import { STAGE_ORDER, calcMultiple } from "@/lib/types";
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
import { TYPE_COLORS, TYPE_ORDER } from "@/components/map/colors";
import ZoneOfficialPanel from "@/components/ZoneOfficialPanel";
import ZoneTransactions from "@/components/ZoneTransactions";
import { Badge, StageBadge, TypeBadge } from "@/components/Badges";
import { looksLikeAddress, searchAddresses, type AddressCandidate } from "@/lib/kakao-address";
import { loadSubwayStations, lineNames, SUBWAY_LINES, searchStations, type SubwayStation } from "@/lib/subway-stations";
import { distanceM } from "@/components/map/prepare-zones";
import {
  judgeAddress,
  meters,
  prepareAllZones,
  verdictHeadline,
  type AddressVerdict,
} from "@/lib/address-verdict";
import type { AddressPin, AdminMapConfig, AdminZoneShape, StationPin } from "@/components/map/props";
import { ListingCompare } from "@/components/ListingCompare";
import { UnlockModal } from "@/components/ListingUnlockModal";
import { AdminDrawToolbar, AdminZonePanel, type AdminMetaForm } from "@/components/AdminZonePanel";
import {
  ADMIN_STORAGE_KEY,
  CUSTOM_ZONE_TYPES,
  customZoneColor,
  customZonesToGeoJSON,
  exportFileName,
  formatArea,
  loadCustomZones,
  newCustomZoneId,
  ringAreaSqm,
  saveCustomZones,
  type CustomZone,
  type CustomZoneType,
} from "@/lib/custom-zones";

const ZONE_TYPES: (MapZoneType | "전체")[] = [
  "전체",
  "일반재개발",
  "신통기획",
  "모아타운",
  "도공복",
  "민간도심복합(성장거점형)",
  "민간도심복합(주거중심형)",
  "가로주택",
  "소규모",
  "역세권",
  "장기전세",
];
const STAGES: (ZoneStage | "전체")[] = ["전체", "추진위원회", "사업계획승인", "관리처분", "이주·철거", "착공", "준공"];

export default function ZoneExplorer() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  // 서울시 정비구역 전수 (public/data/zones.geojson → 클라이언트 fetch)
  const [seoulZones, setSeoulZones] = useState<SeoulZone[]>([]);
  const [seoulMeta, setSeoulMeta] = useState<SeoulZonesMeta | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MapZoneType | "전체">("전체");
  const [stageFilter, setStageFilter] = useState<ZoneStage | "전체">("전체");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  // 준공 완료 구역 표시 여부 — 기본은 숨김(진행 중 구역만 보여준다)
  const [showCompleted, setShowCompleted] = useState(false);
  // 지도 위 떠 있는 패널 열림 상태
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  // ── 주소 검색 → 소속 구역 판별 ─────────────────────────────────────────────
  //   입력이 주소 형태면 카카오 주소 검색 결과를 드롭다운에 함께 보여주고,
  //   후보를 고르면(또는 엔터) 전체 구역 폴리곤에 대고 포함 여부를 판정한다.
  const [addrCandidates, setAddrCandidates] = useState<AddressCandidate[]>([]);
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrNote, setAddrNote] = useState<string | null>(null);
  const [addrVerdict, setAddrVerdict] = useState<AddressVerdict | null>(null);
  // ── 지하철역 검색 ─────────────────────────────────────────────────────
  //   역 이름(‘사당역’·‘건대입구’)으로 574개 역을 찾아 지도를 그 역으로 확대하고,
  //   역 주변 정비구역을 목록으로 보여준다(구역 선택으로 바로 이어진다).
  const [stations, setStations] = useState<SubwayStation[]>([]);
  const [stationPick, setStationPick] = useState<SubwayStation | null>(null);
  // ‘구역 전체 보기’ 요청 토큰 — 주소 핀은 핀 지점을 확대해 보여주므로, 구역 경계 전체는 버튼으로 본다.
  // 값이 바뀔 때마다 지도가 선택 구역 경계에 화면을 맞춘다(카카오맵·OSM 공통).
  const [zoneFitRequest, setZoneFitRequest] = useState(0);

  // ── 관리자 모드(?admin=1) ────────────────────────────────────────────────
  //   일반 방문자는 이 상태가 모두 비어 있어 화면이 기존과 똑같다.
  const [adminMode, setAdminMode] = useState(false);
  /** 이 브라우저에 저장된 관리자 구역 */
  const [customZones, setCustomZones] = useState<CustomZone[]>([]);
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

  // 서울시 정비구역 전수 레이어
  useEffect(() => {
    loadSeoulZones().then((d) => {
      setSeoulZones(d.zones);
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
          setSeoulZones(d.zones);
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

  const selected = zones.find((z) => z.id === selectedId);
  // 대표 구역이 아닌 구역 — 서울시 고시 데이터만 있는 구역
  const selectedSeoul = selected ? undefined : seoulZones.find((z) => z.id === selectedId);
  const selectedTx = transactions.filter((t) => t.zoneId === selectedId);
  const selectedListings = listings.filter((l) => l.zoneId === selectedId);

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
    () =>
      (typeFilter === "전체" ? visibleSeoulZones : visibleSeoulZones.filter((z) => z.type === typeFilter)).filter(
        (z) => !z.hiddenByDefault
      ),
    [visibleSeoulZones, typeFilter]
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
    const rank = (z: SeoulZone) =>
      hit(z.name) ? 0 : (z.alias ?? []).some(hit) ? 1 : hit(z.kind) || hit(z.type) ? 2 : 3;
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

  /** 주소 핀·판정 카드 초기화 — 구역 선택은 그대로 둔다 */
  function clearAddress() {
    setAddrVerdict(null);
    setAddrCandidates([]);
    setAddrNote(null);
  }

  /** 주소 후보 확정 — 판정 → 핀 → (속한 구역이 있으면) 그 구역 선택 */
  function acceptAddress(c: AddressCandidate) {
    const v = judgeAddress(c, seoulZones, allPrep);
    setAddrVerdict(v);
    setQuery("");
    setAddrCandidates([]);
    setAddrNote(null);
    if (v.status === "inside") {
      pickZone(v.inside[0].zone.id);
    } else if (v.status === "completed") {
      // 준공 구역은 기본으로 숨겨져 있다 — 주소가 그 안이라는 사실을 보이게 토글을 켜 준다
      setShowCompleted(true);
      pickZone(v.completedHits[0].zone.id);
    } else {
      // 구역 밖·후보지 인근 — 엉뚱한 구역이 선택된 채로 남아 오해하지 않게 선택을 풀고,
      // 가까운 구역 목록(카드)만 보여준다. 목록에서 고르면 그때 상세가 열린다.
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
  }, [addrVerdict]);

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

  function unlock(id: string) {
    setUnlocked((prev) => new Set(prev).add(id));
  }

  function pickZone(id: string) {
    setSelectedId(id);
    setPanelOpen(true);
    // 유형 필터가 켜져 있어 고른 구역이 지도 레이어에서 빠져 있으면 지도에서 사라진 것처럼 보인다
    // → 필터를 풀어 경계를 다시 그린다(검색·주소 판정은 필터와 무관하게 전체를 본다).
    if (typeFilter !== "전체") {
      const z = seoulZones.find((s) => s.id === id);
      if (z && z.type !== typeFilter) setTypeFilter("전체");
    }
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
    };
  }

  /**
   * 선택한 구역(관리자 구역 또는 공식·대표 구역)의 경계·정보를 고치기 시작한다.
   *   경계를 안 고쳐도 사업유형·추진단계를 바로 고쳐 저장할 수 있도록 정보 입력 폼도 함께 연다.
   */
  function startEditSelected() {
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
        `‘${selectedCustom.name}’ 경계·정보를 고칩니다 — 경계는 그대로 두고 사업유형·추진단계만 바꿔 저장해도 됩니다.`
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
    const next = {
      points: ring.map(([lat, lng]) => [lat, lng] as [number, number]),
      replacesZoneId: selectedSeoul?.id ?? selected?.id,
      replacesName: name,
      replacesArea: officialArea,
    };
    setDraft(next);
    setAdminMeta(metaFromDraft(next));
    setAdminMsg(
      `${name} 경계·정보를 고칩니다 — 점을 끌어 경계를 고치거나, 경계는 그대로 두고 사업유형·추진단계만 바꿔 저장하세요.`
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

  /** 메타 입력 → 저장(localStorage) — 그리는/고치는 중이어도 꼭짓점 3개 이상이면 지금 모양대로 저장 */
  function saveDraftZone() {
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
    const zone: CustomZone = {
      id: existing?.id ?? newCustomZoneId(),
      name,
      type: adminMeta.type,
      stage: adminMeta.stage,
      gu: adminMeta.gu.trim(),
      note: adminMeta.note.trim(),
      ring: draft.points.map(([lat, lng]) => [lat, lng] as [number, number]),
      areaSqm: ringAreaSqm(draft.points),
      ...(draft.replacesZoneId ? { replacesZoneId: draft.replacesZoneId } : {}),
      ...(draft.replacesName ? { replacesName: draft.replacesName } : {}),
      ...(draft.replacesArea ? { replacesArea: draft.replacesArea } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing ? customZones.map((z) => (z.id === zone.id ? zone : z)) : [...customZones, zone];
    const ok = commitCustomZones(next);
    setDraft(null);
    setAdminMeta(null);
    setSelectedCustomId(zone.id);
    setAdminFit({ id: zone.id, token: Date.now() });
    setAdminMsg(
      ok
        ? `‘${zone.name}’ 저장 완료 — 이 브라우저에 보관되어 새로고침해도 남아 있습니다.`
        : `‘${zone.name}’를 화면에는 반영했지만 브라우저 저장에 실패했습니다(저장 공간 부족 등).`
    );
  }

  function selectCustomZone(id: string) {
    setSelectedCustomId(id);
    setAdminFit({ id, token: Date.now() });
  }

  /** 목록의 ‘경계·정보 수정’ — 경계 핸들과 함께 정보 입력 폼을 바로 연다 */
  function editCustomGeometry(id: string) {
    const z = customZones.find((v) => v.id === id);
    if (!z) return;
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
    setAdminMsg(`‘${z.name}’ 경계·정보를 고칩니다 — 사업유형·추진단계만 바꿔 저장해도 됩니다.`);
  }

  function deleteCustomZone(id: string) {
    const z = customZones.find((v) => v.id === id);
    if (!z) return;
    if (typeof window !== "undefined" && !window.confirm(`‘${z.name}’ 구역을 삭제할까요?\n이 브라우저에 저장된 도형만 지워집니다.`)) {
      return;
    }
    commitCustomZones(customZones.filter((v) => v.id !== id));
    if (selectedCustomId === id) setSelectedCustomId(undefined);
    if (draft?.editingId === id) {
      setDraft(null);
      setAdminMeta(null);
    }
    setAdminMsg(`‘${z.name}’ 삭제했습니다.`);
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
        color: customZoneColor(z.type),
        ring: z.ring,
        replaces: !!z.replacesZoneId,
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
        onSelectZone: selectCustomZone,
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
        <MapPanel
          zones={filtered}
          seoulZones={mapSeoulZones}
          selectedZoneId={selectedId}
          onSelectZone={pickZone}
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          completedCount={completedZones.length}
          addressPin={addressPin}
          stationPin={stationPin}
          zoneFitRequest={zoneFitRequest}
          admin={adminMapConfig}
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

      {/* ── 좌상단: 검색 + 필터 ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-2 z-[620] flex w-[min(94vw,382px)] flex-col gap-2 sm:left-3 sm:top-3">
        <div className="pointer-events-auto relative z-[650] rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden className="text-base leading-none text-slate-400">
              ⌕
            </span>
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
                    <span aria-hidden>🚇</span> 지하철역
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
                          <span aria-hidden className="shrink-0 text-xs leading-none">
                            🚇
                          </span>
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
                    <span aria-hidden>📍</span> 주소 · 지번·도로명
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
                              <span className="block truncate text-sm font-medium text-slate-800">{c.label}</span>
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

        {/* ── 역 카드 — 고른 역과 그 주변 정비구역(골라서 바로 이동) ── */}
        {stationPick && (
          <div
            data-testid="station-card"
            className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/97 p-3 shadow-xl backdrop-blur"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-sm">
                🚇
              </span>
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
            className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/97 p-3 shadow-xl backdrop-blur"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-sm">
                📍
              </span>
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

            {/* 결론 — 판정 종류별 색 */}
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
        <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <span className="text-xs font-bold text-slate-800">필터</span>
            <span className="truncate text-[11px] text-slate-500">
              {typeFilter} · {stageFilter}
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
                  <span aria-hidden>{showCompleted ? "👁" : "🏁"}</span>
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
      <div className="pointer-events-auto absolute bottom-14 left-2 z-[600] max-w-[min(94vw,430px)] rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur md:bottom-[3.4rem] md:left-2">
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {TYPE_ORDER.map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLORS[t] }} />
                  {t}
                  <b className="font-semibold text-slate-800">{(typeCounts[t] ?? 0).toLocaleString()}</b>
                </span>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              경계·면적·단계: 서울시 도시계획사업(서울플랜+)·의제처리구역(UQ181) 실데이터 ·{" "}
              <b>점</b>은 구역계 미고시 후보지(예: 사당21구역) · <b>점선</b>은 준공·입주 완료 구역
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              <b style={{ color: TYPE_COLORS["역세권"] }}>역세권</b> = 역세권활성화·청년안심주택 ·{" "}
              <b style={{ color: TYPE_COLORS["장기전세"] }}>장기전세</b> = 장기전세주택·미리내집 (서울시 사업유형)
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              <b style={{ color: TYPE_COLORS["민간도심복합(성장거점형)"] }}>민간도심복합</b> = 민간이 하는
              도심복합개발(도공복의 민간판) · 성장거점형·주거중심형을 진한/연한 빨강으로 나눔
            </p>
            <p className="text-[10px] leading-snug text-slate-400">
              구역을 클릭하면 서울시 고시 데이터가 열립니다 · 지도를 움직여 둘러보세요
            </p>
          </div>
        )}
      </div>

      {/* ── 우측: 구역 상세 · 목록 패널 ─────────────────────────────────────── */}
      {panelOpen ? (
        <aside className="absolute z-[610] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl inset-x-2 bottom-2 top-auto max-h-[62dvh] md:inset-x-auto md:left-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-[400px]">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <b className="text-sm font-bold text-slate-900">
              {selectedCustom ? selectedCustom.name : selected ? selected.name : selectedSeoul ? "서울시 고시 구역" : "대표 구역"}
            </b>
            {!selected && !selectedSeoul && (
              <span className="text-[11px] text-slate-500">{filtered.length}곳 · 실거래·매물 상세</span>
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
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
                  <span className="ml-auto self-center text-[10px] text-slate-400">이 브라우저에만 저장됨</span>
                </div>
              </div>
            )}

            {/* 1) 대표 구역 상세 */}
            {selected && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={selected.type} />
                  <StageBadge stage={selected.stage} stageOrder={STAGE_ORDER[selected.stage]} />
                  <Badge tone={selected.residenceRequired ? "red" : "slate"}>
                    {selected.residenceRequired ? "실거주 의무" : "실거주 무관"}
                  </Badge>
                  {selected.toehoApplied && <Badge tone="purple">토허제 적용</Badge>}
                  <Badge tone="blue">예상 입주 {selected.moveInEstimate}</Badge>
                </div>

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

                {/* 서울시 고시 데이터 (구역 경계·면적·단계의 근거) */}
                {selected.official && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[11px]">
                    <div className="mb-1 flex items-center justify-between font-semibold text-emerald-800">
                      <span>서울시 고시 데이터</span>
                      <span className="font-normal text-emerald-700/70">{selected.official.asOf} 기준</span>
                    </div>
                    <dl className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-emerald-900">
                      <dt className="whitespace-nowrap text-emerald-700/80">고시 명칭</dt>
                      <dd className="min-w-0 break-words">{selected.official.name}</dd>
                      <dt className="whitespace-nowrap text-emerald-700/80">사업유형</dt>
                      <dd className="min-w-0 break-words">{selected.official.kind}</dd>
                      <dt className="whitespace-nowrap text-emerald-700/80">추진단계</dt>
                      <dd className="min-w-0 break-words">{selected.official.stage}</dd>
                      <dt className="whitespace-nowrap text-emerald-700/80">구역면적</dt>
                      <dd className="min-w-0">
                        {selected.official.area.toLocaleString()}㎡
                        <span className="ml-1 whitespace-nowrap">
                          {(selected.official.area / 3.3058 / 1000).toFixed(1)}천평
                        </span>
                      </dd>
                      {selected.official.geomSource?.startsWith("UQ181") && (
                        <>
                          <dt className="whitespace-nowrap text-emerald-700/80">경계 도형</dt>
                          <dd className="min-w-0 break-words">
                            의제처리구역 실경계(필지선 추종)
                            <span className="text-emerald-700/70"> · {selected.official.geomAsOf} 기준</span>
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-slate-500">{selected.summary}</p>

                {/* 국토부 실거래가 — 샘플 거래와 별개로 실제 신고 거래를 함께 보여준다 */}
                <ZoneTransactions
                  gu={selected.district}
                  names={[selected.name]}
                  center={selected.center}
                  polygon={selected.polygon}
                  parts={selected.parts}
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
                      열람은 유료 열람권 / 등록은 유료 플랜
                    </span>
                  </h3>
                  <ListingCompare
                    listings={selectedListings}
                    zones={zones}
                    unlockedIds={unlocked}
                    onUnlockRequest={setUnlockTarget}
                  />
                </div>

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

            {/* 3) 아무것도 선택되지 않았을 때: 대표 구역 목록 */}
            {!selected && !selectedSeoul && (
              <div className="space-y-2">
                {filtered.map((z) => {
                  const zListings = listings.filter((l) => l.zoneId === z.id);
                  const lowest = transactions
                    .filter((t) => t.zoneId === z.id)
                    .reduce((m, t) => Math.min(m, t.price), Infinity);
                  return (
                    <button
                      key={z.id}
                      onClick={() => pickZone(z.id)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={z.type} />
                        <StageBadge stage={z.stage} stageOrder={STAGE_ORDER[z.stage]} />
                        {z.toehoApplied && <Badge tone="purple">토허제</Badge>}
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {z.name} <span className="text-xs font-normal text-slate-500">{z.district}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                        <span>
                          매물 <b className="text-slate-900">{zListings.length}건</b>
                        </span>
                        <span>
                          최저가 <b className="text-slate-900">{isFinite(lowest) ? man(lowest) : "-"}</b>만원
                        </span>
                        {z.lowestInitialInvestment && (
                          <span>
                            초기투자 <b className="text-slate-900">{man(z.lowestInitialInvestment)}</b>만원
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">예상 입주 {z.moveInEstimate}</div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    조건에 맞는 구역이 없습니다.
                  </p>
                )}
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
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition " +
        (active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
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
