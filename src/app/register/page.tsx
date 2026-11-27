"use client";
// ─────────────────────────────────────────────────────────────────────────────
// /register — 중개사 매물 등록 (베타 무료)
//
//  · 예전 화면은 "요금제 선택 → 모의 결제" 3단계라 실제로 매물을 올릴 수 없었다.
//    지금은 **바로 입력하는 실무 폼**이다: 구역을 2,300여 곳 중에서 검색해 고르고,
//    매매가·기보증금·전용면적·임대사업자 승계·토허제 여부를 적으면 초기투자금이 실시간으로 계산된다.
//  · 저장은 **공용 DB(Supabase `public.listings`)** 와 이 브라우저(localStorage) 두 곳에 동시에 한다.
//    → 등록한 매물은 메인 지도(`/`)·매물 목록(`/listings`)에 바로 나타나고,
//      새로고침·다른 기기·다른 방문자 화면에서도 그대로 보인다.
//    → DB 가 잠깐 죽거나 로컬 dev(환경변수 없음)이면 예전처럼 이 브라우저에만 저장되고 그 사실을 안내한다.
//  · 진입: `?zone=<구역 id>` 로 들어오면 그 구역이 미리 선택된다(지도·상세 패널의 '매물 등록하기').
//
//  ▶ 2026-11-27 개편 ① — 현직 공인중개사 실무 + 중개대상물 표시·광고 기준
//    ① **매물 주소 검색**을 맨 위에 두었다. 주소를 고르면
//       - 좌표가 어느 정비구역 폴리곤 안인지 광선교차로 판정해 **구역을 자동 선택**(구역 밖이면 안내 +
//         가까운 구역 · 지번 이름이 같은 구역을 후보로 준다),
//       - 카카오 지번 문서의 법정동코드로 만든 PNU(없으면 /api/parcel 이 준 PNU)로
//         **건축물대장 표제부**를 조회해 사용승인일·총층수·대지면적·건물명·주용도를 폼에 채운다
//         (대장에 없는 값 — 전유면적·대지지분 — 은 채우지 않는다. 실패해도 직접 입력으로 끝난다),
//       - 매물에는 정확한 좌표(lat·lng)와 지번·도로명 주소가 함께 저장된다.
//    ② 공인중개사법 시행규칙 제25조 **중개대상물 표시·광고 명시사항**을 입력·표시한다:
//       소재지(번지 비공개 토글) · 거래형태(매매/전세/월세) · 해당층/총층수 · 방/욕실 · 방향 ·
//       입주가능일 · 주차 · 사용승인일 · 관리비 · 중개사무소(명칭·등록번호·대표자·소속공인중개사·연락처·소재지).
//       → 카드에서 어떻게 보이는지 폼 안에서 그대로 **미리보기**한다.
//    · `public.listings` 에는 이 항목들의 컬럼이 없어 **note 끝 표식 한 줄**로 함께 저장한다
//      (lib/listing-extra.ts — 관리자 구역 동의율과 같은 방식). 따라서 DB 스키마·기존 매물과 호환된다.
//
//  ▶ 2026-11-27 개편 ② — 부동산포스(rfine.kr) 매물등록 양식으로 재구성
//    · 실제 등록 양식 순서(소재지 → 거래·가격 → 건물·상세 → 특징·설명)를 그대로 따르고,
//      부동산포스가 받는 항목(융자금·기보증금/기월세·공급면적·현관구조·난방방식·엘리베이터·
//      위반건축물)을 넣었다.
//    · **중개사무소 입력 섹션은 없앴다** — 가입(프로필) 때 정해지는 정보라 매물마다 적을 이유가 없다.
//      저장할 때 프로필(없으면 용범님 소속 기본값)에서 자동으로 붙어 법정 표시는 그대로 유지된다.
//    · 부동산포스에 없는 **재개발 전용 항목**(감정평가액·불하금·대지지분·이주비·임대사업자 승계·
//      토허제·검증 여부)을 ③ 으로 모아, 재개발 물건을 한 화면에서 끝내게 했다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Listing, ListingTradeType } from "@/lib/types";
import { listingDeposit } from "@/lib/types";
import { loadSeoulZones, type SeoulZone } from "@/lib/seoul-zones";
import { formatMan } from "@/lib/format";
import { TYPE_COLORS } from "@/components/map/colors";
import Icon from "@/components/Icon";
import { Badge } from "@/components/Badges";
import { SHOW_MAP_LISTING_BADGES } from "@/lib/zone-listing-badges";
import { ListingConditionBadges } from "@/components/ZoneListingCards";
import {
  ListingAddress,
  ListingBrokerLegal,
  ListingDescription,
  ListingDetailLine,
  ListingPriceLine,
  ListingSpecLine,
} from "@/components/ListingSpec";
import {
  judgeAddress,
  prepareAllZones,
  zoneByJibunName,
  type AddressVerdict,
} from "@/lib/address-verdict";
import { searchAddresses, type AddressCandidate } from "@/lib/kakao-address";
import {
  formValuesFromLedger,
  ledgerSummaryLine,
  PROPERTY_TYPE_OPTIONS,
  type BuildingInfoResponse,
  type LedgerBuildingBrief,
} from "@/lib/building-info";
import { priceLabel, upfrontLabel, upfrontValue } from "@/lib/listing-fields";
import {
  deleteCustomListing,
  deleteListingFromDb,
  listingExportFileName,
  listingsToJson,
  loadCustomListings,
  loadDbListings,
  newListingId,
  pushListingToDb,
  upsertCustomListing,
} from "@/lib/custom-listings";

/** 매물 종류 — 부동산포스 24종을 리디브에서 쓰는 갈래로 줄인 것(대장 주용도에서 옮겨 오는 값과 호환) */
const PROPERTY_TYPES = [...PROPERTY_TYPE_OPTIONS];

const DIRECTIONS = ["남향", "동향", "서향", "북향", "남동향", "남서향", "북동향", "북서향"] as const;
/** 현관구조 — 부동산포스 아파트·오피스텔 양식의 값 */
const ENTRANCE_TYPES = ["계단식", "복도식", "복합식", "기타"] as const;
/** 난방방식 — 부동산포스 시설 정보의 값 */
const HEATING_TYPES = ["개별난방", "중앙난방", "지역난방"] as const;
/** 위반건축물 여부 — 건축물대장 확인 결과를 그대로 적는다(비워 두면 표시하지 않는다) */
const VIOLATION_OPTIONS = ["해당 없음", "위반건축물 있음", "확인 필요"] as const;
/** 부동산포스가 매물특징에서 걸러 내는 금지문구 — 그대로 쓰면 노출이 삭제될 수 있다 */
const NOTE_BANNED = ["명품", "급급", "초초", "전화문의", "평형", "BEST", "best"] as const;
const NOTE_MAX = 40;
const DESCRIPTION_MAX = 1000;

/** 금액 입력 문자열 → 만원 정수 (빈 값은 0) */
const toNum = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");

/** 평수 표기 — ㎡ 입력 옆에 같이 보여준다 */
const pyeong = (sqm: number) => (sqm > 0 ? (sqm / 3.305785).toFixed(1) : "");

/**
 * 건축물대장 API 오류 → 사람이 읽을 문장.
 *   · 국토부는 일시 장애(SERVICETIMEOUT_ERROR)·일일 한도를 원문 JSON 으로 돌려준다 — 그대로 보여 주면
 *     중개사가 읽을 수 없다. 원인만 골라 짧게 안내하고, 해결책(다시 조회·직접 입력)을 붙인다.
 */
function ledgerErrorText(message?: string): string {
  const m = message ?? "";
  if (/SERVICETIMEOUT|서비스 연결실패|TIMEOUT/i.test(m)) {
    return "국토부 건축물대장 서비스가 잠시 응답하지 않습니다 — '다시 조회'를 눌러 보거나 아래에 직접 입력하세요.";
  }
  if (/LIMIT|한도/i.test(m)) {
    return "국토부 건축물대장 일일 호출 한도에 걸렸습니다 — 내일 다시 조회하거나 직접 입력하세요.";
  }
  return m || "건축물대장 조회에 실패했습니다 — 직접 입력하세요.";
}

/** 필지 API 실패 이유 → 사람이 읽을 문장(서버 환경변수 이름 같은 내부 사정은 감춘다) */
function parcelErrorText(error?: string, detail?: string): string {
  const all = `${error ?? ""} ${detail ?? ""}`;
  if (all.includes("VWORLD_API_KEY") || all.includes("VWORLD_DOMAIN")) {
    return "필지 경계 서비스를 쓰지 못했습니다 — 소재지는 주소 검색 결과로 채우고, 건축물대장은 지번으로 계속 조회합니다.";
  }
  if (all.includes("OUT_OF_KOREA")) return "대한민국 범위 밖의 지점입니다.";
  if (all.includes("VWORLD_UNREACHABLE")) return "필지 경계 서비스에 연결하지 못했습니다.";
  return detail?.trim() || error?.trim() || "필지 정보를 가져오지 못했습니다.";
}

/**
 * 중개사무소 법정 표시 기본값 — 용범님 소속(이엑스피코리아부동산중개법인).
 *   · 2026-11-27 개편으로 **등록 폼에서 이 칸들을 없앴다** — 가입(프로필) 정보로 보기 때문이다.
 *   · 저장할 때 이 값(또는 예전에 이 브라우저에서 고쳐 둔 프로필)이 매물에 자동으로 붙는다.
 *     그래서 매물 카드·목록의 법정 표시(사무소명·등록번호·대표자·소속공인중개사·연락처·소재지)는 그대로다.
 */
type BrokerProfile = { name: string; agency: string; address: string; license: string; ceo: string; phone: string };
const BROKER_DEFAULTS: BrokerProfile = {
  name: "권용범",
  agency: "이엑스피코리아부동산중개법인 주식회사",
  address: "서울특별시 강남구 영동대로 511, 30층(삼성동, 트레이드타워)",
  license: "제11680-2025-00292호",
  ceo: "김성환",
  phone: "010-2758-5292",
};
const BROKER_PROFILE_KEY = "redev.brokerProfile.v1";

function loadBrokerProfile(): BrokerProfile {
  const empty: BrokerProfile = { ...BROKER_DEFAULTS };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(BROKER_PROFILE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<BrokerProfile>;
    const out = { ...empty };
    for (const k of Object.keys(empty) as (keyof BrokerProfile)[]) {
      if (typeof p?.[k] === "string" && p[k]!.trim() !== "") out[k] = p[k]!;
    }
    return out;
  } catch {
    return empty;
  }
}

/** 대장이 자동으로 채우는 칸 — 주소를 바꿨을 때 앞 필지 값을 지우려고 기억해 둔다 */
type AutoKey = "approvalDate" | "totalFloors" | "platAreaSqm" | "buildingName" | "propertyType";

/** 필지·대장 조회 상태 — 화면 안내 문구를 이 상태로만 만든다 */
type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; message?: string }
  | { status: "none"; message: string }
  | { status: "error"; message: string };

export default function RegisterPage() {
  const [seoulZones, setSeoulZones] = useState<SeoulZone[]>([]);
  const [zoneQuery, setZoneQuery] = useState("");
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zone, setZone] = useState<SeoulZone | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── ① 매물 소재지 ─────────────────────────────────────────────────────────
  const [addrQuery, setAddrQuery] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrHits, setAddrHits] = useState<AddressCandidate[]>([]);
  const [addrState, setAddrState] = useState<"idle" | "searching" | "done" | "unavailable">("idle");
  const [addrDetail, setAddrDetail] = useState<string | null>(null);
  const [picked, setPicked] = useState<AddressCandidate | null>(null);
  const [verdict, setVerdict] = useState<AddressVerdict | null>(null);
  /** 구역이 자동으로 잡혔을 때 그 근거 — 화면 배너에 쓴다 */
  const [autoZone, setAutoZone] = useState<{ name: string; how: string; completed: boolean } | null>(null);
  /** 필지 API(/api/parcel) 결과 — 지번·PNU 확인 */
  const [parcel, setParcel] = useState<{ ok: boolean; pnu?: string | null; label?: string; addr?: string | null; message?: string } | null>(null);
  const [parcelState, setParcelState] = useState<FetchState>({ status: "idle" });
  /** 건축물대장 표제부 — 자동 채움의 근거 */
  const [ledger, setLedger] = useState<LedgerBuildingBrief | null>(null);
  const [ledgerState, setLedgerState] = useState<FetchState>({ status: "idle" });
  const [autoFilled, setAutoFilled] = useState<string[]>([]);
  /** 대장이 자동으로 채워 둔 값 — 다른 주소로 바꿀 때 이 값만 갈아끼운다 */
  const lastAutoRef = useRef<Partial<Record<AutoKey, string>>>({});

  const [address, setAddress] = useState("");
  const [addressRoad, setAddressRoad] = useState("");
  const [addressHidden, setAddressHidden] = useState(false);
  const [pnu, setPnu] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  /** 상세주소(동·층·호) — 부동산포스 표기처럼 건물명+동+층+호를 한 칸에 적는다 */
  const [detailAddress, setDetailAddress] = useState("");

  // ── ② 거래·가격 정보 ──────────────────────────────────────────────────────
  const [propertyType, setPropertyType] = useState<string>(PROPERTY_TYPES[0]);
  const [propertyTypeTouched, setPropertyTypeTouched] = useState(false);
  const [tradeType, setTradeType] = useState<ListingTradeType>("매매");
  const [salePrice, setSalePrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  /** 융자금 — 부동산포스처럼 '표시 안 함 / 없음 / 금액' 세 상태를 구분한다 */
  const [mortgageMode, setMortgageMode] = useState<"hidden" | "none" | "amount">("hidden");
  const [mortgageValue, setMortgageValue] = useState("");
  /** 기월세 — 매매에서 함께 승계하는 임차인의 월세 */
  const [tenantMonthlyRent, setTenantMonthlyRent] = useState("");

  // ── ③ 재개발 전용 항목 ────────────────────────────────────────────────────
  const [appraised, setAppraised] = useState("");
  const [transferIncluded, setTransferIncluded] = useState(false);
  const [transferFee, setTransferFee] = useState("");
  const [landShare, setLandShare] = useState("");
  const [relocationCost, setRelocationCost] = useState("");
  const [relocationFree, setRelocationFree] = useState(true);
  const [leaseOperatorOnly, setLeaseOperatorOnly] = useState(false);
  const [landPermitRequired, setLandPermitRequired] = useState(false);
  const [markVerified, setMarkVerified] = useState(true);

  // ── ④ 건물·상세 정보 ──────────────────────────────────────────────────────
  const [supplyArea, setSupplyArea] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("");
  const [platArea, setPlatArea] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [floor, setFloor] = useState("");
  const [totalFloors, setTotalFloors] = useState("");
  const [rooms, setRooms] = useState("");
  const [baths, setBaths] = useState("");
  const [direction, setDirection] = useState("");
  const [entranceType, setEntranceType] = useState("");
  const [heating, setHeating] = useState("");
  const [elevator, setElevator] = useState("");
  const [parking, setParking] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [moveInKind, setMoveInKind] = useState<"즉시입주" | "협의" | "날짜">("협의");
  const [moveInDate, setMoveInDate] = useState("");
  const [maintenanceFee, setMaintenanceFee] = useState("");
  const [violation, setViolation] = useState("");

  // ── ⑤ 매물 특징 · 상세 설명 ───────────────────────────────────────────────
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");

  /** 중개사무소 — 입력 칸 없이 프로필(없으면 기본값)에서 온다 */
  const [broker, setBroker] = useState<BrokerProfile>(BROKER_DEFAULTS);

  const [saved, setSaved] = useState<Listing | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [mine, setMine] = useState<Listing[]>([]);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  /** 등록 저장 중(DB 응답을 기다리는 중) */
  const [saving, setSaving] = useState(false);
  /** 방금 등록한 매물이 공용 DB 에 올라갔는지 — null 이면 아직 응답 전 */
  const [shared, setShared] = useState<boolean | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  /** 공용 DB 에 있는 매물 id — ‘공유됨’ 표시에 쓴다 */
  const [sharedIds, setSharedIds] = useState<string[]>([]);

  // 구역 전수(2,300여 곳) — 지도와 같은 데이터(public/data/zones.geojson)
  useEffect(() => {
    loadSeoulZones()
      .then((d) => setSeoulZones(d.zones))
      .catch(() => setSeoulZones([]));
  }, []);

  // 중개사무소 정보(프로필) — 등록 폼에는 칸이 없고, 저장할 때 매물에 자동으로 붙는다
  useEffect(() => {
    setBroker(loadBrokerProfile());
  }, []);

  // 이 브라우저에 등록한 매물 + `?zone=` 진입 시 구역 미리 선택
  useEffect(() => {
    setMine(loadCustomListings());
    // 공용 DB 매물 id 를 확보해 두면 ‘내가 등록한 매물’에서 공유 여부를 바로 보여줄 수 있다
    void loadDbListings()
      .then((db) => setSharedIds(db.map((l) => l.id)))
      .catch(() => {});
    let id: string | null = null;
    try {
      id = new URL(window.location.href).searchParams.get("zone");
    } catch {
      id = null;
    }
    if (id) {
      loadSeoulZones().then((d) => {
        const z = d.zones.find((x) => x.id === id);
        if (z) {
          setZone(z);
          setZoneQuery(z.name);
        }
      });
    }
  }, []);

  /** 구역 폴리곤 공간 색인 — 주소 판정에 쓴다(구역 데이터가 바뀔 때만 다시 만든다) */
  const prep = useMemo(() => (seoulZones.length > 0 ? prepareAllZones(seoulZones) : null), [seoulZones]);

  /** 구역 검색 — 이름·별칭·사업유형·자치구. 띄어쓰기를 무시하고, 이름이 먼저 걸린다 */
  const zoneHits = useMemo(() => {
    const term = zoneQuery.trim();
    if (!term) return [] as SeoulZone[];
    const flat = term.replace(/\s+/g, "");
    const hit = (s?: string) => !!s && s.replace(/\s+/g, "").includes(flat);
    const rank = (z: SeoulZone) =>
      z.name.startsWith(term) || z.name.replace(/\s+/g, "").startsWith(flat)
        ? 0
        : hit(z.name)
          ? 1
          : (z.alias ?? []).some(hit)
            ? 2
            : hit(z.kind) || hit(z.type) || z.gu.includes(term)
              ? 3
              : 4;
    return seoulZones
      .filter((z) => hit(z.name) || hit(z.kind) || hit(z.type) || z.gu.includes(term) || (z.alias ?? []).some(hit))
      .sort((a, b) => rank(a) - rank(b) || b.area - a.area)
      .slice(0, 8);
  }, [zoneQuery, seoulZones]);

  // ── 주소 자동완성 (입력이 멈추면 300ms 뒤 한 번) ──────────────────────────
  useEffect(() => {
    const q = addrQuery.trim();
    if (q.length < 3 || (picked && q === picked.label)) {
      setAddrHits([]);
      setAddrState("idle");
      return;
    }
    let alive = true;
    setAddrState("searching");
    const timer = setTimeout(() => {
      searchAddresses(q)
        .then((r) => {
          if (!alive) return;
          setAddrHits(r.candidates);
          setAddrState(r.ok ? "done" : "unavailable");
          setAddrDetail(r.ok ? null : (r.detail ?? null));
        })
        .catch(() => {
          if (!alive) return;
          setAddrHits([]);
          setAddrState("unavailable");
          setAddrDetail("주소 검색을 부르지 못했습니다.");
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [addrQuery, picked]);

  // ── 실시간 초기투자금 · 프리미엄 ──────────────────────────────────────────
  const draft = useMemo<Listing>(
    () => ({
      id: "",
      zoneId: zone?.id ?? "",
      ...(zone ? { zoneName: zone.name, gu: zone.gu } : {}),
      propertyType,
      brokerName: broker.name,
      brokerAgency: broker.agency,
      brokerPhone: broker.phone,
      brokerLicense: broker.license,
      // 상세주소(동·층·호)를 카드의 타입 자리에 그대로 쓴다 — 없으면 전용면적으로 대신한다
      unitType: detailAddress.trim() || (exclusiveArea ? `전용 ${Number(exclusiveArea)}㎡` : "일반매물"),
      salePrice: toNum(salePrice),
      ...(tradeType === "매매" ? { deposit: toNum(deposit) } : {}),
      tradeType,
      ...(tradeType === "월세" && toNum(monthlyRent) > 0 ? { monthlyRent: toNum(monthlyRent) } : {}),
      ...(mortgageMode === "none"
        ? { mortgage: 0 }
        : mortgageMode === "amount" && toNum(mortgageValue) > 0
          ? { mortgage: toNum(mortgageValue) }
          : {}),
      ...(tradeType === "매매" && toNum(tenantMonthlyRent) > 0 ? { tenantMonthlyRent: toNum(tenantMonthlyRent) } : {}),
      ...(toNum(appraised) > 0 ? { appraisedValue: toNum(appraised) } : {}),
      transferFeeIncluded: transferIncluded,
      transferFee: toNum(transferFee),
      ...(toNum(relocationCost) > 0
        ? { relocationCost: toNum(relocationCost), relocationCostFree: relocationFree }
        : {}),
      ...(exclusiveArea ? { exclusiveAreaSqm: Number(exclusiveArea) } : {}),
      ...(supplyArea ? { supplyAreaSqm: Number(supplyArea) } : {}),
      ...(landShare ? { landShareSqm: Number(landShare) } : {}),
      ...(entranceType ? { entranceType } : {}),
      ...(heating ? { heating } : {}),
      ...(elevator ? { elevator } : {}),
      ...(violation ? { violation } : {}),
      leaseOperatorOnly,
      landPermitRequired,
      verified: markVerified,
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(addressRoad.trim() ? { addressRoad: addressRoad.trim() } : {}),
      ...(addressHidden ? { addressHidden: true } : {}),
      ...(pnu ? { pnu } : {}),
      ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
      ...(floor.trim() ? { floor: floor.trim() } : {}),
      ...(totalFloors.trim() ? { totalFloors: totalFloors.trim() } : {}),
      ...(toNum(rooms) > 0 ? { rooms: toNum(rooms) } : {}),
      ...(toNum(baths) > 0 ? { baths: toNum(baths) } : {}),
      ...(direction.trim() ? { direction: direction.trim() } : {}),
      ...(moveInKind === "날짜" ? (moveInDate ? { moveIn: moveInDate } : {}) : { moveIn: moveInKind }),
      ...(parking.trim() ? { parking: parking.trim() } : {}),
      ...(approvalDate.trim() ? { approvalDate: approvalDate.trim() } : {}),
      ...(maintenanceFee.trim() ? { maintenanceFee: maintenanceFee.trim() } : {}),
      ...(platArea ? { platAreaSqm: Number(platArea) } : {}),
      ...(buildingName.trim() ? { buildingName: buildingName.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(broker.address.trim() ? { brokerAddress: broker.address.trim() } : {}),
      ...(broker.ceo.trim() ? { brokerCeo: broker.ceo.trim() } : {}),
    }),
    [
      zone,
      propertyType,
      broker,
      detailAddress,
      salePrice,
      tradeType,
      deposit,
      monthlyRent,
      mortgageMode,
      mortgageValue,
      tenantMonthlyRent,
      appraised,
      transferIncluded,
      transferFee,
      relocationCost,
      relocationFree,
      exclusiveArea,
      supplyArea,
      landShare,
      entranceType,
      heating,
      elevator,
      violation,
      leaseOperatorOnly,
      landPermitRequired,
      markVerified,
      address,
      addressRoad,
      addressHidden,
      pnu,
      coord,
      floor,
      totalFloors,
      rooms,
      baths,
      direction,
      moveInKind,
      moveInDate,
      parking,
      approvalDate,
      maintenanceFee,
      platArea,
      buildingName,
      description,
    ]
  );
  const transfer = transferIncluded ? toNum(transferFee) : 0;
  /** 프리미엄 = 매매가 − 감정평가액(권리가액). 감정가가 없으면 0(계산하지 않는다) */
  const premium = toNum(appraised) > 0 ? toNum(salePrice) - toNum(appraised) : 0;

  const canSave = !!zone && toNum(salePrice) > 0;

  /** 표시·광고 항목 가운데 아직 빈 칸 — 필수는 아니지만 '무엇이 비었는지' 보여 준다 */
  const missingSpec = [
    !address.trim() && "소재지",
    !detailAddress.trim() && "상세주소(동·호)",
    !floor.trim() && "해당층",
    !totalFloors.trim() && "총층수",
    !direction.trim() && "방향",
    !approvalDate.trim() && "사용승인일",
    !parking.trim() && "주차",
    !violation && "위반건축물",
  ].filter((v): v is string => typeof v === "string");

  /** 매물특징에 부동산포스 금지문구가 들어갔는지 — 저장 전에 알려 준다(막지는 않는다) */
  const noteBanned = NOTE_BANNED.filter((w) => note.includes(w));

  /** 고른 주소에서 갈 수 있는 다른 구역 후보 — 안쪽 구역 · 준공 구역 · 인근 구역 순(중복 제거) */
  const zoneCandidates = useMemo(() => {
    if (!verdict) return [] as { zone: SeoulZone; completed: boolean; distance?: number }[];
    const rows: { zone: SeoulZone; completed: boolean; distance?: number }[] = [
      ...verdict.inside.map((h) => ({ zone: h.zone, completed: h.completed })),
      ...verdict.completedHits.map((h) => ({ zone: h.zone, completed: h.completed })),
      ...verdict.nearCandidates.map((n) => ({ zone: n.zone, completed: false, distance: n.distance })),
      ...verdict.nearest.map((n) => ({ zone: n.zone, completed: n.completed, distance: n.distance })),
    ];
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        if (r.zone.id === zone?.id || seen.has(r.zone.id)) return false;
        seen.add(r.zone.id);
        return true;
      })
      .slice(0, 5);
  }, [verdict, zone]);

  function pickZone(z: SeoulZone, how?: string) {
    setZone(z);
    setZoneQuery(z.name);
    setZoneOpen(false);
    searchRef.current?.blur();
    setAutoZone(how ? { name: z.name, how, completed: false } : null);
  }

  /**
   * 주소 후보 선택 → ① 구역 자동 선택 ② 필지 확인 ③ 건축물대장 자동 채움
   *   · 구역: 좌표 포함 판정(작은 구역 우선) → 없으면 지번 이름이 구역명·별칭과 같은 구역
   *     (경계 미고시 후보지·보정 경계가 지번 대표점을 살짝 벗어난 경우의 안전망).
   *   · 좌표·주소는 그대로 매물에 저장된다 — 지도에서 해당 필지 자리에 놓을 수 있다.
   */
  async function applyAddress(c: AddressCandidate) {
    setPicked(c);
    setAddrQuery(c.label);
    setAddrOpen(false);
    setCoord({ lat: c.lat, lng: c.lng });
    setAddrDetail(null);

    // ① 구역 자동 선택
    const judged = prep ? judgeAddress(c, seoulZones, prep) : null;
    setVerdict(judged);
    const inside = judged?.inside[0] ?? null;
    const completed = !inside ? (judged?.completedHits[0] ?? null) : null;
    const byName = inside || completed ? null : zoneByJibunName(seoulZones, c.dong, c.jibun, c.gu);
    const target = inside?.zone ?? completed?.zone ?? byName ?? null;
    if (target) {
      setZone(target);
      setZoneQuery(target.name);
      setZoneOpen(false);
      setAutoZone({
        name: target.name,
        how: inside
          ? "주소 좌표가 구역 경계 안입니다"
          : completed
            ? "준공된 구역 안 주소입니다"
            : "지번 이름이 같은 구역과 연결했습니다",
        completed: !!completed,
      });
    } else {
      setZone(null);
      setZoneQuery("");
      setAutoZone(null);
    }

    // ② 소재지 — 지번 주소를 우선(카카오 지번 문서 → 없으면 지번 결과의 라벨)
    const jibun = c.jibunAddress ?? (c.kind === "지번" ? c.label : "");
    if (jibun) setAddress(jibun);
    const road = c.kind === "도로명" ? c.label : (c.detail ?? "").split(" · ")[0] ?? "";
    if (road) setAddressRoad(road);

    // ③ 필지(지번·PNU) 확인 → ④ 건축물대장 표제부
    void loadParcelAndLedger(c);
  }

  /** 필지 API → (실패해도) 카카오 지번으로 만든 PNU → 건축물대장 */
  async function loadParcelAndLedger(c: AddressCandidate) {
    setParcel(null);
    setParcelState({ status: "loading" });
    setLedger(null);
    setLedgerState({ status: "idle" });
    setAutoFilled([]);

    let nextPnu = c.pnu ?? "";
    try {
      const res = await fetch(`/api/parcel?lat=${c.lat.toFixed(6)}&lng=${c.lng.toFixed(6)}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        parcel?: { pnu?: string | null; label?: string; addr?: string | null; jibun?: string } | null;
        error?: string;
        detail?: string;
      };
      if (json?.ok) {
        if (json.parcel) {
          setParcel({ ok: true, pnu: json.parcel.pnu ?? null, label: json.parcel.label, addr: json.parcel.addr ?? null });
          setParcelState({ status: "ok", message: json.parcel.label });
          if (json.parcel.pnu) nextPnu = json.parcel.pnu;
          // 브이월드가 준 지번 주소가 더 정확하다(산 지번·부번 포함) — 비어 있을 때만 채운다
          if (json.parcel.addr) setAddress((prev) => prev || (json.parcel?.addr ?? ""));
        } else {
          setParcelState({ status: "none", message: "이 지점에 등록된 필지가 없습니다(도로·하천 등)." });
        }
      } else {
        setParcelState({
          status: "error",
          message: parcelErrorText(json?.error, json?.detail),
        });
      }
    } catch {
      setParcelState({ status: "error", message: "필지 API에 연결하지 못했습니다." });
    }

    if (!nextPnu) {
      setPnu("");
      clearAutoFilledValues();
      setLedgerState({
        status: "none",
        message: "필지고유번호(PNU)를 확인하지 못해 건축물대장을 자동 조회하지 못했습니다 — 아래에 직접 입력하세요.",
      });
      return;
    }
    setPnu(nextPnu);
    await loadLedger(nextPnu);
  }

  async function loadLedger(targetPnu: string, opts: { fresh?: boolean } = {}) {
    setLedgerState({ status: "loading" });
    try {
      const res = await fetch(`/api/building-info?pnu=${targetPnu}${opts.fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as BuildingInfoResponse;
      if (json?.ok) {
        if (json.primary) {
          setLedger(json.primary);
          setLedgerState({ status: "ok", message: ledgerSummaryLine(json.primary) });
          fillFromLedger(json.primary);
        } else {
          clearAutoFilledValues();
          setLedgerState({
            status: "none",
            message: json.note ?? "건축물대장 표제부가 없는 필지입니다 — 직접 입력하세요.",
          });
        }
      } else {
        clearAutoFilledValues();
        setLedgerState({
          status: "error",
          message: ledgerErrorText(json?.detail ?? json?.error),
        });
      }
    } catch {
      clearAutoFilledValues();
      setLedgerState({ status: "error", message: "건축물대장 API에 연결하지 못했습니다 — 직접 입력하세요." });
    }
  }

  /**
   * 대장 값 → 폼.
   *   · **비어 있는 칸**을 채운다. 다만 앞서 **자동으로 채웠던 칸**은 새 대장 값으로 바꾸거나 비운다
   *     — 주소를 다른 필지로 바꿨는데 앞 필지의 총층수·사용승인일이 남아 있으면 매물 표시가 거짓이 된다.
   *   · 중개사가 직접 고친 칸은 건드리지 않는다(자동 채웠던 값과 다르면 사용자가 고친 것으로 본다).
   *   · 대장에 없는 값(전유면적·대지지분)은 채우지 않는다 — 지어내면 표시가 거짓이 된다.
   */
  function fillFromLedger(brief: LedgerBuildingBrief) {
    const v = formValuesFromLedger(brief);
    const filled: string[] = [];

    /** 이 칸을 대장 값으로 바꿀 수 있는가 — 비었거나, 지난번에 대장이 채운 그대로일 때(아래 userEdited 판정) */
    const apply = (key: AutoKey, label: string, next: string | undefined, current: string, set: (v: string) => void) => {
      const prev = lastAutoRef.current[key];
      const userEdited = current.trim() !== "" && !(prev !== undefined && current.trim() === prev);
      if (key === "propertyType") {
        // 매물 종류는 기본값이 있어 '비었다'를 볼 수 없다 — 손대지 않았을 때만 대장 값을 따른다
        if (propertyTypeTouched && !(prev !== undefined && current === prev)) return;
      } else if (userEdited) {
        return;
      }
      if (!next) {
        // 앞 필지의 대장 값이었는데 새 필지에는 그 값이 없다 → 지운다
        if (prev !== undefined && current.trim() === prev) {
          set("");
          delete lastAutoRef.current[key];
        }
        return;
      }
      if (current.trim() === next) {
        lastAutoRef.current[key] = next;
        return;
      }
      set(next);
      lastAutoRef.current[key] = next;
      filled.push(label);
    };

    apply("approvalDate", "사용승인일", v.approvalDate, approvalDate, setApprovalDate);
    apply("totalFloors", "총층수", v.totalFloors, totalFloors, setTotalFloors);
    apply("platAreaSqm", "대지면적", v.platAreaSqm, platArea, setPlatArea);
    apply("buildingName", "건물명", v.buildingName, buildingName, setBuildingName);
    apply("propertyType", "매물 종류", v.propertyType, propertyType, setPropertyType);

    setAutoFilled(filled);
  }

  /** 대장을 못 읽었을 때 — 지난번 대장이 채워 둔 값만 지운다(직접 적은 값은 그대로) */
  function clearAutoFilledValues() {
    const map: [AutoKey, string, (v: string) => void][] = [
      ["approvalDate", approvalDate, setApprovalDate],
      ["totalFloors", totalFloors, setTotalFloors],
      ["platAreaSqm", platArea, setPlatArea],
      ["buildingName", buildingName, setBuildingName],
    ];
    for (const [key, current, set] of map) {
      const prev = lastAutoRef.current[key];
      if (prev !== undefined && current.trim() === prev) {
        set("");
        delete lastAutoRef.current[key];
      }
    }
    setAutoFilled([]);
  }

  function resetForm() {
    setSaved(null);
    setDetailAddress("");
    setSalePrice("");
    setDeposit("");
    setMonthlyRent("");
    setMortgageMode("hidden");
    setMortgageValue("");
    setTenantMonthlyRent("");
    setAppraised("");
    setTransferIncluded(false);
    setTransferFee("");
    setLandShare("");
    setRelocationCost("");
    setRelocationFree(true);
    setLeaseOperatorOnly(false);
    setLandPermitRequired(false);
    setMarkVerified(true);
    setSupplyArea("");
    setExclusiveArea("");
    setFloor("");
    setTotalFloors("");
    setRooms("");
    setBaths("");
    setDirection("");
    setEntranceType("");
    setHeating("");
    setElevator("");
    setMoveInKind("협의");
    setMoveInDate("");
    setParking("");
    setApprovalDate("");
    setMaintenanceFee("");
    setViolation("");
    setPlatArea("");
    setBuildingName("");
    setNote("");
    setDescription("");
    setAddress("");
    setAddressRoad("");
    setAddressHidden(false);
    setPnu("");
    setCoord(null);
    setPicked(null);
    setVerdict(null);
    setAutoZone(null);
    setParcel(null);
    setParcelState({ status: "idle" });
    setLedger(null);
    setLedgerState({ status: "idle" });
    setAutoFilled([]);
    lastAutoRef.current = {};
    setPropertyTypeTouched(false);
    setSaveFailed(false);
    setCopyMsg(null);
  }

  async function submit() {
    if (!zone || saving) return;
    const listing: Listing = {
      ...draft,
      id: newListingId(),
      note: note.trim() || undefined,
      description: description.trim() || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setSaving(true);
    setShared(null);
    setShareError(null);
    // ① 이 브라우저 사본(즉시) — DB 가 죽어도 등록한 매물이 화면에서 사라지지 않게
    const { ok, list } = upsertCustomListing(listing);
    setMine(list);
    setSaveFailed(!ok);
    setSaved(listing);
    // ② 공용 DB — 모든 방문자·기기에서 보이게
    const pushed = await pushListingToDb(listing);
    setSaving(false);
    setShared(pushed.shared);
    setShareError(pushed.shared ? null : (pushed.message ?? null));
    if (pushed.shared) setSharedIds((prev) => (prev.includes(listing.id) ? prev : [...prev, listing.id]));
    // 등록한 구역으로 지도에서 바로 확인할 수 있게 주소를 남겨 둔다(아래 링크가 쓴다)
    if (ok) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    setMine(deleteCustomListing(id));
    if (saved?.id === id) setSaved(null);
    const removed = await deleteListingFromDb(id);
    if (removed.ok) setSharedIds((prev) => prev.filter((x) => x !== id));
    else setCopyMsg(`DB 에서 지우지 못했습니다 — ${removed.message ?? "연결 실패"} (이 브라우저에서만 지워졌습니다)`);
  }

  function download() {
    const list = loadCustomListings();
    const blob = new Blob([listingsToJson(list)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = listingExportFileName();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    const text = listingsToJson(loadCustomListings());
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("내가 등록한 매물 JSON 을 클립보드에 복사했습니다.");
    } catch {
      setCopyMsg("복사하지 못했습니다 — JSON 다운로드를 쓰세요.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      {/* ── 머리말 + 베타 무료 안내 ── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">중개사 매물 등록</h1>
          <p className="text-sm text-slate-600">
            <b>주소를 먼저 검색</b>하면 구역이 자동 선택되고 건축물대장 값이 채워집니다. 부동산포스 등록 양식 순서대로
            적고, 재개발 항목은 ③에 모았습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="green">베타 기간 무료 등록</Badge>
          <Badge tone="blue">결제 단계 없음</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-[12px] leading-relaxed text-blue-900">
        <b>베타 무료 등록</b> — 지금은 요금제·결제 없이 바로 등록됩니다(단건 9만원/월 29만원 요금제는 정식
        오픈 시 적용). 등록한 매물은 <b>공용 DB에 저장</b>되어 메인 지도와 매물 목록에 바로 나타나고,{" "}
        <b>모든 방문자·기기에서 공유</b>됩니다. (DB 응답이 없을 때만 이 브라우저에 임시 저장됩니다.)
      </div>

      {/* ── 등록 완료 카드 ── */}
      {saved && (
        <div
          data-testid="register-done"
          className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Icon name="check" size={13} strokeWidth={2.2} />
            </span>
            <b className="text-sm text-emerald-900">등록 완료 — {saved.zoneName}</b>
            <Badge tone="green">지도·목록에 반영됨</Badge>
            {saving && <Badge tone="blue">공용 DB에 올리는 중…</Badge>}
            {!saving && shared === true && <Badge tone="green">DB 저장 — 모든 방문자에게 공유</Badge>}
            {!saving && shared === false && <Badge tone="amber">DB 저장 실패 — 이 브라우저에만</Badge>}
            {saveFailed && <Badge tone="red">브라우저 저장 실패 — JSON 으로 보관하세요</Badge>}
          </div>
          <p className="mt-1 text-[12px] text-emerald-900/90">
            {saved.unitType} ·{" "}
            {saved.tradeType === "월세"
              ? `보증금 ${formatMan(saved.salePrice)} / 월 ${formatMan(saved.monthlyRent ?? 0)}`
              : `${priceLabel(saved)} ${formatMan(saved.salePrice)}`}
            {listingDeposit(saved) > 0 ? ` · 기보증금 ${formatMan(listingDeposit(saved))}` : ""} ·{" "}
            <b>
              {upfrontLabel(saved)} {formatMan(upfrontValue(saved))}
            </b>
          </p>
          {(saved.address || saved.lat) && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-emerald-900/80">
              <ListingAddress listing={saved} />
              {saved.lat && saved.lng && (
                <span className="font-mono text-[10px] text-emerald-800/60">
                  {saved.lat.toFixed(5)}, {saved.lng.toFixed(5)} 저장됨
                </span>
              )}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link
              href={`/?zone=${encodeURIComponent(saved.zoneId)}`}
              data-testid="register-open-map"
              className="rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
            >
              지도에서 보기
            </Link>
            <Link
              href="/listings"
              className="rounded-full border border-emerald-400 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              매물 목록에서 보기
            </Link>
            <button
              type="button"
              onClick={download}
              className="rounded-full border border-emerald-400 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              JSON 다운로드
            </button>
            <button
              type="button"
              onClick={() => void copyAll()}
              className="rounded-full border border-emerald-400 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              JSON 복사
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="ml-auto rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-500"
            >
              새 매물 등록
            </button>
          </div>
          {shareError && (
            <p className="mt-1 text-[11px] text-amber-800">
              공용 DB에 올리지 못했습니다 — {shareError} 지금은 이 브라우저에만 보입니다.
            </p>
          )}
          {copyMsg && <p className="mt-1 text-[11px] text-emerald-800">{copyMsg}</p>}
        </div>
      )}

      {/* ══ ① 매물 소재지 — 주소 검색 → 구역 자동 선택 → 건축물대장 자동 채움 ══ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">① 매물 소재지</b>
          <span className="text-[11px] text-slate-500">
            지번·도로명·건물명으로 검색 — 고르면 <b>구역 자동 선택 + 건축물대장 자동 채움</b>
          </span>
          {picked && (
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setVerdict(null);
                setAutoZone(null);
                setAddrQuery("");
                setAddrHits([]);
                setParcel(null);
                setParcelState({ status: "idle" });
                setLedger(null);
                setLedgerState({ status: "idle" });
              }}
              className="ml-auto rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-500"
            >
              주소 지우기
            </button>
          )}
        </div>

        <div className="relative">
          <input
            value={addrQuery}
            onChange={(e) => {
              setAddrQuery(e.target.value);
              setAddrOpen(true);
              if (picked && e.target.value !== picked.label) setPicked(null);
            }}
            onFocus={() => setAddrOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && addrHits.length > 0) {
                e.preventDefault();
                void applyAddress(addrHits[0]);
              }
              if (e.key === "Escape") setAddrOpen(false);
            }}
            placeholder="예: 성수동2가 315-1 · 테헤란로 152 · 다원씨앤아이"
            aria-label="매물 주소 검색"
            data-testid="register-address-search"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {addrState === "searching" && (
            <span className="absolute right-3 top-2.5 text-[11px] text-slate-400">주소 찾는 중…</span>
          )}
          {addrOpen && addrQuery.trim().length >= 3 && !picked && addrState !== "idle" && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              {addrState === "unavailable" ? (
                <p className="px-3 py-3 text-xs text-amber-700">
                  주소 검색을 쓸 수 없습니다{addrDetail ? ` — ${addrDetail}` : ""}. 아래 <b>구역 검색</b>과 직접
                  입력으로 등록할 수 있습니다.
                </p>
              ) : addrHits.length > 0 ? (
                <ul className="max-h-[46vh] overflow-y-auto">
                  {addrHits.map((c) => (
                    <li key={c.key}>
                      <button
                        type="button"
                        data-testid="register-address-result"
                        data-address={c.label}
                        onClick={() => void applyAddress(c)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {c.kind}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-800">{c.label}</span>
                          {c.detail && <span className="block truncate text-[11px] text-slate-500">{c.detail}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-xs text-slate-500">
                  {addrState === "searching" ? "주소 찾는 중…" : "검색 결과가 없습니다 — 지번·도로명·건물명으로 다시 검색하세요."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 고른 주소 + 자동 판정 결과 */}
        {picked && (
          <div data-testid="register-address-picked" className="mt-2 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-700">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-sm text-slate-900">{picked.label}</b>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-600">{picked.kind}</span>
                {picked.jibun && (
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-600">지번 {picked.jibun}</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-slate-400">
                  {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  필지{" "}
                  {parcelState.status === "loading" ? (
                    <span className="text-slate-400">확인 중…</span>
                  ) : parcelState.status === "ok" ? (
                    <b className="text-slate-800">{parcel?.label ?? "확인됨"}</b>
                  ) : parcelState.status === "none" ? (
                    <span className="text-amber-700">필지 없음</span>
                  ) : parcelState.status === "error" ? (
                    <span className="text-amber-700">확인 실패 — {parcelState.message}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </span>
                {pnu && <span className="font-mono text-[10px] text-slate-400">PNU {pnu}</span>}
              </div>
            </div>

            {/* 구역 자동 선택 결과 */}
            {autoZone ? (
              <div
                data-testid="register-zone-auto"
                className={
                  "flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] " +
                  (autoZone.completed
                    ? "border-slate-300 bg-slate-50 text-slate-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900")
                }
              >
                <b className="text-sm">{autoZone.name}</b>
                <span>구역이 자동 선택되었습니다</span>
                <span className="text-slate-500">· {autoZone.how}</span>
                {autoZone.completed && <Badge tone="slate">준공</Badge>}
                <Link
                  href={`/?zone=${encodeURIComponent(zone?.id ?? "")}`}
                  className="ml-auto text-[10px] font-semibold text-emerald-800 underline"
                >
                  지도에서 경계 보기
                </Link>
              </div>
            ) : (
              <div
                data-testid="register-zone-auto"
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
              >
                <b>구역 밖 주소</b>입니다 — 정비구역 안 주소가 아니면 재개발 매물로 분류되지 않습니다. 아래에서
                구역을 직접 고르거나, 가까운 구역으로 등록하세요.
                {zoneCandidates.length > 0 && (
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-amber-800/80">가까운 구역:</span>
                    {zoneCandidates.map((h) => (
                      <button
                        key={h.zone.id}
                        type="button"
                        data-testid="register-zone-candidate"
                        onClick={() => pickZone(h.zone, "직접 선택")}
                        className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        {h.zone.name}
                        {"distance" in h && typeof h.distance === "number" ? ` ${Math.round(h.distance)}m` : ""}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}

            {/* 건축물대장 자동 채움 */}
            <div
              data-testid="register-ledger-fill"
              className={
                "rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed " +
                (ledgerState.status === "ok"
                  ? "border-sky-200 bg-sky-50 text-sky-900"
                  : ledgerState.status === "loading"
                    ? "border-slate-200 bg-slate-50 text-slate-600"
                    : "border-slate-200 bg-white text-slate-600")
              }
            >
              {ledgerState.status === "loading" ? (
                <span>건축물대장을 불러오는 중…</span>
              ) : ledgerState.status === "ok" ? (
                <>
                  <span className="font-semibold">건축물대장 표제부</span>
                  <span className="text-sky-800"> · {ledgerState.message}</span>
                  {autoFilled.length > 0 ? (
                    <span className="block text-[10px] text-sky-700">
                      폼에 채운 항목: {autoFilled.join(", ")} — 전유면적·대지지분은 대장 표제부에 없어 직접
                      입력합니다.
                    </span>
                  ) : (
                    <span className="block text-[10px] text-sky-700">
                      이미 입력한 값은 덮어쓰지 않았습니다(필요하면 아래 칸을 직접 고치세요).
                    </span>
                  )}
                  {ledger?.name && (
                    <span className="block text-[10px] text-sky-700">
                      건물 {ledger.name}
                      {ledger.mainPurps ? ` · 주용도 ${ledger.mainPurps}` : ""}
                      {ledger.hhldCnt ? ` · 세대 ${ledger.hhldCnt}` : ""}
                      {ledger.fmlyCnt ? ` · 가구 ${ledger.fmlyCnt}` : ""}
                    </span>
                  )}
                </>
              ) : ledgerState.status === "error" || ledgerState.status === "none" ? (
                <span className="flex flex-wrap items-center gap-1.5 text-amber-800">
                  <span>건축물대장 자동 채움 건너뜀 — {ledgerState.message}</span>
                  {pnu && (
                    <button
                      type="button"
                      data-testid="register-ledger-retry"
                      onClick={() => void loadLedger(pnu, { fresh: true })}
                      className="rounded-full border border-amber-400 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      다시 조회
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-slate-400">주소를 고르면 건축물대장(사용승인일·층수·대지면적·주용도)을 채웁니다.</span>
              )}
            </div>
          </div>
        )}

        {/* 구역 검색 — 2,300여 곳 */}
        <div className="mt-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              구역 선택 (서울 정비구역 {(seoulZones.length || 2300).toLocaleString()}곳)
              <span className="ml-1 text-[10px] font-normal text-slate-400">주소로 자동 선택되며, 직접 바꿀 수도 있습니다</span>
            </span>
            <div className="relative">
              <input
                ref={searchRef}
                value={zoneQuery}
                onChange={(e) => {
                  setZoneQuery(e.target.value);
                  setZoneOpen(true);
                  if (zone && e.target.value !== zone.name) setZone(null);
                  setAutoZone(null);
                }}
                onFocus={() => setZoneOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && zoneHits.length > 0) {
                    e.preventDefault();
                    pickZone(zoneHits[0]);
                  }
                  if (e.key === "Escape") setZoneOpen(false);
                }}
                placeholder="구역명·지번·자치구 검색 — 예: 상도23, 신림1, 자양동 10, 한남4"
                aria-label="구역 검색"
                data-testid="register-zone-search"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {zoneOpen && zoneQuery.trim() !== "" && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                  {zoneHits.length > 0 ? (
                    <ul className="max-h-[46vh] overflow-y-auto">
                      {zoneHits.map((z) => (
                        <li key={z.id}>
                          <button
                            type="button"
                            data-testid="register-zone-result"
                            data-zone-id={z.id}
                            onClick={() => pickZone(z, "직접 선택")}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <i
                              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: TYPE_COLORS[z.type] ?? "#64748b" }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5">
                                <span className="min-w-0 truncate font-medium text-slate-800">{z.name}</span>
                                <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{z.gu}</span>
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="min-w-0 truncate">{z.kind}</span>
                                <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                  {z.polygon ? z.stage : "경계 미고시"}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-3 text-xs text-slate-500">
                      {seoulZones.length === 0 ? "구역 데이터를 불러오는 중…" : "검색 결과가 없습니다."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>
          {zone && (
            <div
              data-testid="register-zone-selected"
              className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px]"
            >
              <b className="text-sm text-emerald-900">{zone.name}</b>
              <span className="text-emerald-800">{zone.gu}</span>
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-emerald-800">{zone.type}</span>
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-emerald-800">{zone.stage}</span>
              <span className="text-emerald-700/80">{zone.kind}</span>
              <span className="ml-auto font-mono text-[10px] text-emerald-700/60">id {zone.id}</span>
            </div>
          )}
        </div>

        {/* 소재지 표기 — 법정 명시사항 (주소 검색이 채우고, 필요하면 직접 고친다) */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="소재지 (지번)">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
              placeholder="서울특별시 성동구 성수동2가 315-1"
              data-testid="register-address"
            />
          </Field>
          <Field label="도로명 주소 (선택)">
            <input
              value={addressRoad}
              onChange={(e) => setAddressRoad(e.target.value)}
              className="input"
              placeholder="서울특별시 성동구 아차산로 100"
              data-testid="register-address-road"
            />
          </Field>
          <Field label="상세주소 — 건물명·동·층·호 (선택)">
            <input
              value={detailAddress}
              onChange={(e) => setDetailAddress(e.target.value)}
              className="input"
              placeholder="예: 예지팰리스78차 제101동 제2층 제202호"
              data-testid="register-detail-address"
            />
            <Hint>부동산포스 표기처럼 건물명·동·층·호를 한 칸에 적습니다 — 매물 카드의 타입 자리에 표시됩니다.</Hint>
          </Field>
          <label className="flex items-start gap-2 self-start rounded-lg border border-slate-200 bg-white p-2 text-xs sm:mt-6">
            <input
              type="checkbox"
              checked={addressHidden}
              onChange={(e) => setAddressHidden(e.target.checked)}
              className="mt-0.5"
              data-testid="register-address-hidden"
            />
            <span>
              <b className="text-slate-800">소재지 번지 비공개</b>
              <span className="text-slate-500">
                {" "}
                — 켜면 카드에 <b>동까지만</b> 표시됩니다(예: 서울특별시 성동구 성수동2가). 계약 전 확인은 중개사에게
                문의로 받습니다.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* ══ ② 거래·가격 정보 ══ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">② 거래·가격 정보</b>
          <span className="text-[11px] text-slate-500">부동산포스 순서 — 거래형태 → 매물종류 → 가격 → 융자금</span>
        </div>

        {/* 거래형태 */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-700">거래형태</span>
          {(["매매", "전세", "월세"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTradeType(t)}
              aria-pressed={tradeType === t}
              data-testid={`register-trade-${t}`}
              className={
                "rounded-full border px-3 py-1 text-[11px] font-semibold transition " +
                (tradeType === t
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
              }
            >
              {t}
            </button>
          ))}
          <span className="text-[10px] text-slate-400">
            {tradeType === "매매"
              ? "매매가·기보증금 → 초기투자금 자동 계산"
              : tradeType === "전세"
                ? "전세보증금이 그대로 초기 자금입니다"
                : "보증금 + 월세를 나눠 적습니다"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="매물 종류">
            <select
              value={propertyType}
              onChange={(e) => {
                setPropertyType(e.target.value);
                setPropertyTypeTouched(true);
              }}
              className="input"
              data-testid="register-property-type"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {ledger?.mainPurps ? <Hint>건축물대장 주용도: {ledger.mainPurps}</Hint> : null}
          </Field>

          <Field label={`${priceLabel(draft)} (만원) *`}>
            <input
              value={salePrice}
              onChange={(e) => setSalePrice(onlyDigits(e.target.value))}
              className="input"
              placeholder={tradeType === "매매" ? "78000" : "49000"}
              inputMode="numeric"
              data-testid="register-sale-price"
            />
            <Hint>{toNum(salePrice) > 0 ? formatMan(toNum(salePrice)) : "7.8억은 78000"}</Hint>
          </Field>

          {tradeType === "매매" ? (
            <>
              <Field label="기보증금 (만원) — 초기투자금에서 빠집니다">
                <input
                  value={deposit}
                  onChange={(e) => setDeposit(onlyDigits(e.target.value))}
                  className="input"
                  placeholder="27700"
                  inputMode="numeric"
                  data-testid="register-deposit"
                />
                <Hint>{toNum(deposit) > 0 ? formatMan(toNum(deposit)) : "승계하는 임차보증금 — 예상 전세보증금으로 적어도 됩니다"}</Hint>
              </Field>
              <Field label="기월세 (만원, 선택) — 함께 승계하는 월세">
                <input
                  value={tenantMonthlyRent}
                  onChange={(e) => setTenantMonthlyRent(onlyDigits(e.target.value))}
                  className="input"
                  placeholder="40"
                  inputMode="numeric"
                  data-testid="register-tenant-rent"
                />
                <Hint>{toNum(tenantMonthlyRent) > 0 ? formatMan(toNum(tenantMonthlyRent)) : "임차인이 없는 물건이면 비워 둡니다"}</Hint>
              </Field>
            </>
          ) : (
            <Field label="월세 (만원) — 월세 거래일 때">
              <input
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(onlyDigits(e.target.value))}
                disabled={tradeType !== "월세"}
                className={"input " + (tradeType === "월세" ? "" : "bg-slate-100")}
                placeholder={tradeType === "월세" ? "600" : "전세는 비워 둡니다"}
                inputMode="numeric"
                data-testid="register-monthly-rent"
              />
              <Hint>{tradeType === "월세" ? "예: 600 = 월 600만원" : "전세는 보증금만 적습니다"}</Hint>
            </Field>
          )}

          {/* 융자금 — 부동산포스의 3택(표시안함 / 융자금없음 / 금액) */}
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">융자금</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["hidden", "표시 안 함"],
                  ["none", "융자금 없음"],
                  ["amount", "금액 입력"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMortgageMode(mode)}
                  aria-pressed={mortgageMode === mode}
                  data-testid={`register-mortgage-${mode}`}
                  className={
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                    (mortgageMode === mode
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
                  }
                >
                  {label}
                </button>
              ))}
              {mortgageMode === "amount" && (
                <input
                  value={mortgageValue}
                  onChange={(e) => setMortgageValue(onlyDigits(e.target.value))}
                  className="h-8 w-32 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                  placeholder="12000"
                  inputMode="numeric"
                  aria-label="융자금 금액 (만원)"
                  data-testid="register-mortgage-value"
                />
              )}
              {mortgageMode === "amount" && toNum(mortgageValue) > 0 && (
                <span className="text-[11px] text-slate-600">{formatMan(toNum(mortgageValue))}</span>
              )}
            </div>
            <Hint>융자금은 매수자가 승계하는 채무라 초기투자금에는 넣지 않습니다 — 카드에 따로 표시됩니다.</Hint>
          </div>
        </div>
      </section>

      {/* ══ ③ 재개발 전용 항목 ══ */}
      <section
        data-testid="register-redev-section"
        className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-4 shadow-sm"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">③ 재개발 전용 항목</b>
          <span className="text-[11px] text-slate-500">
            감정평가액(권리가액)·불하금·대지지분을 적으면 프리미엄과 초기투자금이 자동 계산됩니다
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="감정평가액 · 권리가액 (만원)">
            <input
              value={appraised}
              onChange={(e) => setAppraised(onlyDigits(e.target.value))}
              className="input"
              placeholder="50000"
              inputMode="numeric"
              data-testid="register-appraised"
            />
            <Hint>
              {toNum(appraised) > 0 && toNum(salePrice) > 0 ? (
                <>
                  프리미엄 {formatMan(Math.abs(premium))}
                  {premium < 0 ? " (감정가보다 낮음)" : ""}
                  {toNum(appraised) > 0 ? ` · 감정가 대비 ${((toNum(salePrice) / toNum(appraised)) * 100 - 100).toFixed(1)}%` : ""}
                </>
              ) : (
                "감정평가서·권리가액을 넣으면 프리미엄(매매가−감정가)이 계산됩니다"
              )}
            </Hint>
          </Field>

          <Field label="불하금 (만원) — 포함하면 초기투자금에 더합니다">
            <div className="flex items-center gap-2">
              <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-xs">
                <input
                  type="checkbox"
                  checked={transferIncluded}
                  onChange={(e) => setTransferIncluded(e.target.checked)}
                  data-testid="register-transfer-included"
                />
                포함
              </label>
              <input
                value={transferFee}
                onChange={(e) => setTransferFee(onlyDigits(e.target.value))}
                disabled={!transferIncluded}
                className={"input " + (transferIncluded ? "" : "bg-slate-100")}
                placeholder="0"
                inputMode="numeric"
                data-testid="register-transfer-fee"
              />
            </div>
          </Field>

          <Field label="대지지분 (㎡)">
            <input
              value={landShare}
              onChange={(e) => setLandShare(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="18.3"
              inputMode="decimal"
              data-testid="register-land-share"
            />
            <Hint>{landShare ? `${pyeong(Number(landShare))}평` : "지적도·대지권면적 (대지면적과 다릅니다)"}</Hint>
          </Field>

          <Field label="이주비 (만원, 선택)">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 items-center gap-1">
                {(
                  [
                    [true, "무이자"],
                    [false, "유이자"],
                  ] as const
                ).map(([free, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setRelocationFree(free)}
                    aria-pressed={relocationFree === free}
                    data-testid={`register-relocation-${label}`}
                    className={
                      "h-10 rounded-lg border px-2 text-[11px] font-semibold " +
                      (relocationFree === free
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={relocationCost}
                onChange={(e) => setRelocationCost(onlyDigits(e.target.value))}
                className="input"
                placeholder="조합 지급 이주비"
                inputMode="numeric"
                data-testid="register-relocation-cost"
              />
            </div>
            <Hint>부동산포스 재개발 양식의 이주비 — 비워 두면 표시하지 않습니다</Hint>
          </Field>

          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
              <input
                type="checkbox"
                checked={leaseOperatorOnly}
                onChange={(e) => setLeaseOperatorOnly(e.target.checked)}
                className="mt-0.5"
                data-testid="register-lease-operator"
              />
              <span>
                <b className="block text-slate-800">임대사업자 승계 필수</b>
                <span className="text-[11px] text-slate-500">
                  임대사업자 지위를 승계해야 매수할 수 있는 물건(임대등록 주택)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
              <input
                type="checkbox"
                checked={landPermitRequired}
                onChange={(e) => setLandPermitRequired(e.target.checked)}
                className="mt-0.5"
                data-testid="register-land-permit"
              />
              <span>
                <b className="block text-slate-800">토지거래허가구역 (실거주 의무)</b>
                <span className="text-[11px] text-slate-500">
                  켜지 않으면 목록에서 <b>실거주·토허제 없음</b>으로 표시됩니다
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
              <input
                type="checkbox"
                checked={markVerified}
                onChange={(e) => setMarkVerified(e.target.checked)}
                className="mt-0.5"
                data-testid="register-mark-verified"
              />
              <span>
                <b className="block text-slate-800">검증 매물로 표시</b>
                <span className="text-[11px] text-slate-500">건축물대장·현장 확인을 마친 물건</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* ══ ④ 건물·상세 정보 ══ */}
      <section className="rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">④ 건물·상세 정보</b>
          <span className="text-[11px] text-slate-500">
            공인중개사법 시행규칙 제25조 명시사항 — 매물 카드·목록에 그대로 표시됩니다
          </span>
          {missingSpec.length > 0 && (
            <span data-testid="register-spec-missing" className="ml-auto text-[10px] text-amber-700">
              비어 있음: {missingSpec.join(", ")}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="공급면적 (㎡)">
            <input
              value={supplyArea}
              onChange={(e) => setSupplyArea(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="49.5"
              inputMode="decimal"
              data-testid="register-supply-area"
            />
            <Hint>{supplyArea ? `${pyeong(Number(supplyArea))}평` : "계약면적·분양면적"}</Hint>
          </Field>
          <Field label="전용면적 (㎡)">
            <input
              value={exclusiveArea}
              onChange={(e) => setExclusiveArea(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="39.6"
              inputMode="decimal"
              data-testid="register-exclusive-area"
            />
            <Hint>{exclusiveArea ? `${pyeong(Number(exclusiveArea))}평` : "건축물대장 전유면적"}</Hint>
          </Field>

          <Field label="해당층">
            <input
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="input"
              placeholder="3  (반지하·옥탑은 그대로)"
              data-testid="register-floor"
            />
          </Field>
          <Field label="총층수">
            <input
              value={totalFloors}
              onChange={(e) => setTotalFloors(onlyDigits(e.target.value))}
              className="input"
              placeholder="5"
              inputMode="numeric"
              data-testid="register-total-floors"
            />
            <Hint>
              {floor || totalFloors
                ? `표시: ${[floor, totalFloors].filter(Boolean).length === 2 ? `${floor} / ${totalFloors}층` : floor || `${totalFloors}층`}`
                : "건축물대장 지상층수로 자동 입력됩니다"}
            </Hint>
          </Field>

          <Field label="방 수">
            <input
              value={rooms}
              onChange={(e) => setRooms(onlyDigits(e.target.value))}
              className="input"
              placeholder="3"
              inputMode="numeric"
              data-testid="register-rooms"
            />
          </Field>
          <Field label="욕실 수">
            <input
              value={baths}
              onChange={(e) => setBaths(onlyDigits(e.target.value))}
              className="input"
              placeholder="1"
              inputMode="numeric"
              data-testid="register-baths"
            />
          </Field>

          <Field label="방향 (거실·주실 기준)">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="input"
              data-testid="register-direction"
            >
              <option value="">선택 안 함</option>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="현관구조">
            <select
              value={entranceType}
              onChange={(e) => setEntranceType(e.target.value)}
              className="input"
              data-testid="register-entrance-type"
            >
              <option value="">선택 안 함</option>
              {ENTRANCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="난방방식">
            <select
              value={heating}
              onChange={(e) => setHeating(e.target.value)}
              className="input"
              data-testid="register-heating"
            >
              <option value="">선택 안 함</option>
              {HEATING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="엘리베이터">
            <select
              value={elevator}
              onChange={(e) => setElevator(e.target.value)}
              className="input"
              data-testid="register-elevator"
            >
              <option value="">선택 안 함</option>
              <option value="있음">있음</option>
              <option value="없음">없음</option>
            </select>
          </Field>

          <Field label="주차 (총 주차대수 · 세대당)">
            <input
              value={parking}
              onChange={(e) => setParking(e.target.value)}
              className="input"
              placeholder="총 8대 · 세대당 1대 · 불가"
              data-testid="register-parking"
            />
          </Field>
          <Field label="관리비">
            <div className="flex items-center gap-1.5">
              <input
                value={maintenanceFee}
                onChange={(e) => setMaintenanceFee(e.target.value)}
                className="input"
                placeholder="5만원 (수도·전기 별도)"
                data-testid="register-maintenance-fee"
              />
              <button
                type="button"
                onClick={() => setMaintenanceFee("없음")}
                className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:border-slate-500"
              >
                없음
              </button>
            </div>
            <Hint>포함 항목은 괄호로 간단히 적습니다 — 미명시는 과태료 사유입니다</Hint>
          </Field>

          <Field label="사용승인일">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={approvalDate}
                onChange={(e) => setApprovalDate(e.target.value)}
                className="input"
                data-testid="register-approval-date"
              />
            </div>
            <Hint>{ledger?.useAprDay ? "건축물대장 값이 채워졌습니다 — 다르면 직접 고치세요" : "건축물대장 표제부 기준"}</Hint>
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">입주가능일</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["즉시입주", "협의"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setMoveInKind(k);
                    setMoveInDate("");
                  }}
                  aria-pressed={moveInKind === k}
                  data-testid={`register-move-in-${k}`}
                  className={
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                    (moveInKind === k
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
                  }
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMoveInKind("날짜")}
                aria-pressed={moveInKind === "날짜"}
                data-testid="register-move-in-날짜"
                className={
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                  (moveInKind === "날짜"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
                }
              >
                날짜 지정
              </button>
              {moveInKind === "날짜" && (
                <input
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                  data-testid="register-move-in-date"
                />
              )}
            </div>
          </div>

          <Field label="위반건축물 여부">
            <select
              value={violation}
              onChange={(e) => setViolation(e.target.value)}
              className="input"
              data-testid="register-violation"
            >
              <option value="">선택 안 함</option>
              {VIOLATION_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <Hint>건축물대장 확인 결과 그대로 — 비워 두면 표시하지 않습니다</Hint>
          </Field>

          <Field label="대지면적 (㎡, 건축물대장)">
            <input
              value={platArea}
              onChange={(e) => setPlatArea(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="312.4"
              inputMode="decimal"
              data-testid="register-plat-area"
            />
            <Hint>필지 전체 면적 — 대지지분(내 지분)과 다릅니다</Hint>
          </Field>
          <Field label="건물명 (건축물대장)">
            <input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              className="input"
              placeholder="다원씨앤아이"
              data-testid="register-building-name"
            />
          </Field>
        </div>
      </section>

      {/* ══ ⑤ 매물 특징 · 상세 설명 ══ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">⑤ 매물 특징 · 상세 설명</b>
          <span className="text-[11px] text-slate-500">부동산포스처럼 특징은 한 줄(40자), 설명은 길게</span>
        </div>

        <Field label="매물 핵심 특징 (한 줄)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            className="input"
            placeholder="예: 신림4구역 신통기획 내 귀한 3룸 빌라 매매"
            maxLength={NOTE_MAX}
            data-testid="register-note"
          />
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] leading-snug text-slate-400">
            <span data-testid="register-note-count">
              {note.length}/{NOTE_MAX}자
            </span>
            <span>카드·목록에 그대로 표시됩니다. 금지문구(명품·급급·전화문의·평형·BEST)는 노출이 삭제될 수 있습니다.</span>
          </span>
          {noteBanned.length > 0 && (
            <span data-testid="register-note-banned" className="mt-0.5 block text-[10px] font-semibold text-rose-600">
              금지문구가 들어 있습니다: {noteBanned.join(", ")}
            </span>
          )}
        </Field>

        <div className="mt-3">
          <Field label="상세 설명 (선택)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              rows={6}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={"매물 설명·입지·사업 진행 상황을 적습니다.\n(부동산포스 상세설명처럼 인사·푸터를 넣어도 됩니다)"}
              maxLength={DESCRIPTION_MAX}
              data-testid="register-description"
            />
            <span className="mt-0.5 block text-[10px] leading-snug text-slate-400" data-testid="register-description-count">
              {description.length}/{DESCRIPTION_MAX}자 — 카드에서 &lsquo;상세 설명 보기&rsquo;로 펼쳐집니다.
            </span>
          </Field>
        </div>
      </section>

      {/* ══ 초기투자금 + 미리보기 + 등록 ══ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-xl bg-slate-900 p-4 text-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-slate-300">
              {tradeType === "매매"
                ? `초기투자금 = 매매가 − 기보증금${transfer > 0 ? " + 불하금" : ""} (취득세 등 부대비용 별도)`
                : tradeType === "전세"
                  ? "전세는 전세보증금이 그대로 초기 자금입니다 (부대비용 별도)"
                  : "월세는 보증금이 초기 자금입니다 (월세·부대비용 별도)"}
            </span>
            <b data-testid="register-initial-investment" className="text-xl font-extrabold text-amber-300">
              {formatMan(upfrontValue(draft))}
            </b>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span>
              {priceLabel(draft)} {formatMan(toNum(salePrice))}
            </span>
            {tradeType === "매매" && <span>기보증금 −{formatMan(toNum(deposit))}</span>}
            {tradeType === "월세" && <span>월세 {formatMan(toNum(monthlyRent))}</span>}
            {transfer > 0 && <span>불하금 +{formatMan(transfer)}</span>}
            {toNum(appraised) > 0 && (
              <span data-testid="register-premium">
                프리미엄 {premium < 0 ? "−" : ""}
                {formatMan(Math.abs(premium))}
              </span>
            )}
            {mortgageMode === "amount" && toNum(mortgageValue) > 0 && (
              <span>융자금 {formatMan(toNum(mortgageValue))} (승계)</span>
            )}
            {toNum(relocationCost) > 0 && (
              <span>
                이주비 {formatMan(toNum(relocationCost))} ({relocationFree ? "무이자" : "유이자"})
              </span>
            )}
            <span className="ml-auto">등록비 무료 (베타)</span>
          </div>
        </div>

        {/* 미리보기 — 카드에서 어떻게 보이는지 그대로 */}
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3" data-testid="register-preview">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <b className="text-[11px] font-bold text-slate-500">미리보기 — 매물 카드에 이렇게 표시됩니다</b>
            <span className="text-[10px] text-slate-400">{zone?.name ?? "구역 미선택"}</span>
            <span data-testid="register-broker-auto" className="ml-auto text-[10px] text-slate-400">
              중개사무소 정보는 내 계정(프로필) 기준으로 자동 표시됩니다
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <ListingAddress listing={draft} className="text-[11px] text-slate-600" testId="register-preview-address" />
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <ListingConditionBadges listing={draft} />
              </span>
            </div>
            <div className="mt-1">
              {toNum(salePrice) > 0 ? (
                <ListingPriceLine listing={draft} />
              ) : (
                <p className="text-[12px] text-slate-400">금액을 입력하면 여기에 표시됩니다</p>
              )}
            </div>
            {toNum(appraised) > 0 && (
              <p data-testid="register-preview-premium" className="mt-0.5 text-[10.5px] text-slate-500">
                감정평가액 {formatMan(toNum(appraised))} · 프리미엄 {premium < 0 ? "−" : ""}
                {formatMan(Math.abs(premium))}
              </p>
            )}
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              {draft.propertyType ? `${draft.propertyType} · ` : ""}
              {draft.unitType}
              {exclusiveArea ? ` · 전용 ${exclusiveArea}㎡ (${pyeong(Number(exclusiveArea))}평)` : ""}
              {landShare ? ` · 대지지분 ${landShare}㎡` : ""}
            </p>
            <ListingSpecLine listing={draft} className="mt-1" />
            <ListingDetailLine listing={draft} className="mt-1" />
            {note.trim() && (
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-slate-600">{note.trim()}</p>
            )}
            <ListingDescription listing={draft} />
            <ListingBrokerLegal listing={draft} withAddress />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSave || saving}
          data-testid="register-submit"
          className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "공용 DB에 저장하는 중…" : canSave ? "베타 무료로 등록하기" : "구역·매매가를 입력하세요"}
        </button>
        <p className="mt-1.5 text-[11px] text-slate-400">
          등록하면 {SHOW_MAP_LISTING_BADGES && <>메인 지도에 <b>매물</b> 배지가, </>}이 구역 상세 패널과{" "}
          <Link href="/listings" className="underline">매물 목록</Link>에 매물 카드가 바로 나타납니다. 소재지·좌표도
          함께 저장되어 지도에서 정확한 필지 자리에 놓을 수 있습니다. 중개사무소 법정 표시(사무소명·등록번호·대표자·
          소속공인중개사·연락처)는 프로필 값으로 자동 첨부됩니다.
        </p>
      </section>

      {/* ── 내가 등록한 매물 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">내가 등록한 매물 {mine.length}건</b>
          <span className="text-[11px] text-slate-500">
            공용 DB에 저장된 매물은 모든 방문자·기기에서 보입니다
          </span>
          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={download}
              disabled={mine.length === 0}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-500 disabled:opacity-40"
            >
              JSON 다운로드
            </button>
            <button
              type="button"
              onClick={() => void copyAll()}
              disabled={mine.length === 0}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-500 disabled:opacity-40"
            >
              JSON 복사
            </button>
          </div>
        </div>
        {copyMsg && <p className="mt-1 text-[11px] text-emerald-700">{copyMsg}</p>}
        {mine.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            아직 등록한 매물이 없습니다. 위에서 주소를 검색해 첫 매물을 올려 보세요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {mine.map((l) => (
              <li key={l.id} data-testid="register-mine-item" className="flex flex-wrap items-center gap-2 py-2">
                <b className="text-sm text-slate-900">{l.zoneName ?? l.zoneId}</b>
                <span className="text-[11px] text-slate-600">
                  {l.propertyType} · {l.unitType}
                </span>
                <span className="text-[11px] font-semibold text-slate-900">{priceLabel(l)} {formatMan(l.salePrice)}</span>
                <span className="text-[11px] text-slate-600">
                  {upfrontLabel(l)} {formatMan(upfrontValue(l))}
                </span>
                <ListingAddress listing={l} className="text-[10px] text-slate-500" testId="register-mine-address" />
                <span className="flex flex-wrap items-center gap-1">
                  <ListingConditionBadges listing={l} />
                  {sharedIds.includes(l.id) ? <Badge tone="green">공유됨</Badge> : <Badge tone="amber">이 브라우저만</Badge>}
                </span>
                <Link
                  href={`/?zone=${encodeURIComponent(l.zoneId)}`}
                  className="ml-auto text-[11px] font-semibold text-blue-700 underline"
                >
                  지도에서 보기
                </Link>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  className="rounded-full border border-rose-300 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: 2px solid rgb(37 99 235 / 0.4);
          border-color: rgb(37 99 235);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{children}</span>;
}
