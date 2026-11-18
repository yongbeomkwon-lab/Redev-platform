"use client";
// ─────────────────────────────────────────────────────────────────────────────
// /register — 중개사 매물 등록 (베타 무료)
//
//  · 예전 화면은 "요금제 선택 → 모의 결제" 3단계라 실제로 매물을 올릴 수 없었다.
//    지금은 **바로 입력하는 실무 폼**이다: 구역을 2,289곳 중에서 검색해 고르고,
//    매매가·기보증금·전용면적·임대사업자 승계·토허제 여부를 적으면 초기투자금이 실시간으로 계산된다.
//  · 저장은 이 브라우저의 localStorage(`redev.customListings.v1`) — 새로고침해도 남고,
//    메인 지도(`/`)와 매물 목록(`/listings`)에 **즉시** 배지·카드로 나타난다.
//  · 다른 사람에게도 보이게 하려면 [JSON 다운로드/복사] 로 받은 내용을
//    `src/data/verified-listings.json` 에 넣으면 정식 검증 매물이 된다(파일 모양이 같다).
//  · 진입: `?zone=<구역 id>` 로 들어오면 그 구역이 미리 선택된다(지도·상세 패널의 '매물 등록하기').
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { calcInitialInvestment, listingDeposit } from "@/lib/types";
import { loadSeoulZones, type SeoulZone } from "@/lib/seoul-zones";
import { formatMan } from "@/lib/format";
import { TYPE_COLORS } from "@/components/map/colors";
import { Badge } from "@/components/Badges";
import { ListingConditionBadges } from "@/components/ZoneListingCards";
import {
  deleteCustomListing,
  listingExportFileName,
  listingsToJson,
  loadCustomListings,
  newListingId,
  upsertCustomListing,
} from "@/lib/custom-listings";

const PROPERTY_TYPES = ["다세대/도시형", "단독/다가구", "아파트", "상가주택", "오피스텔", "기타"];

/** 금액 입력 문자열 → 만원 정수 (빈 값은 0) */
const toNum = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");

/** 평수 표기 — ㎡ 입력 옆에 같이 보여준다 */
const pyeong = (sqm: number) => (sqm > 0 ? (sqm / 3.305785).toFixed(1) : "");

export default function RegisterPage() {
  const [seoulZones, setSeoulZones] = useState<SeoulZone[]>([]);
  const [zoneQuery, setZoneQuery] = useState("");
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zone, setZone] = useState<SeoulZone | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0]);
  const [unitType, setUnitType] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [appraised, setAppraised] = useState("");
  const [transferIncluded, setTransferIncluded] = useState(false);
  const [transferFee, setTransferFee] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("");
  const [landShare, setLandShare] = useState("");
  const [leaseOperatorOnly, setLeaseOperatorOnly] = useState(false);
  const [landPermitRequired, setLandPermitRequired] = useState(false);
  const [note, setNote] = useState("");
  const [markVerified, setMarkVerified] = useState(true);

  const [brokerName, setBrokerName] = useState("권용범 중개사");
  const [brokerAgency, setBrokerAgency] = useState("삼성동 eXp Realty Korea");
  const [brokerPhone, setBrokerPhone] = useState("문의 요청 시 안내");
  const [brokerLicense, setBrokerLicense] = useState("");

  const [saved, setSaved] = useState<Listing | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [mine, setMine] = useState<Listing[]>([]);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  // 구역 전수(2,289곳) — 지도와 같은 데이터(public/data/zones.geojson)
  useEffect(() => {
    loadSeoulZones()
      .then((d) => setSeoulZones(d.zones))
      .catch(() => setSeoulZones([]));
  }, []);

  // 이 브라우저에 등록한 매물 + `?zone=` 진입 시 구역 미리 선택
  useEffect(() => {
    setMine(loadCustomListings());
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

  // ── 실시간 초기투자금 ─────────────────────────────────────────────────────
  const draft: Listing = {
    id: "",
    zoneId: zone?.id ?? "",
    ...(zone ? { zoneName: zone.name, gu: zone.gu } : {}),
    propertyType,
    brokerName,
    brokerAgency,
    brokerPhone,
    brokerLicense,
    unitType: unitType || (exclusiveArea ? `전용 ${Number(exclusiveArea)}㎡` : "일반매물"),
    salePrice: toNum(salePrice),
    deposit: toNum(deposit),
    transferFeeIncluded: transferIncluded,
    transferFee: toNum(transferFee),
    exclusiveAreaSqm: exclusiveArea ? Number(exclusiveArea) : undefined,
    landShareSqm: landShare ? Number(landShare) : undefined,
    leaseOperatorOnly,
    landPermitRequired,
    verified: markVerified,
  };
  const initialInvestment = calcInitialInvestment(draft);
  const transfer = transferIncluded ? toNum(transferFee) : 0;

  const canSave = !!zone && toNum(salePrice) > 0 && !!brokerAgency.trim() && !!brokerName.trim();

  function pickZone(z: SeoulZone) {
    setZone(z);
    setZoneQuery(z.name);
    setZoneOpen(false);
    searchRef.current?.blur();
  }

  function resetForm() {
    setSaved(null);
    setUnitType("");
    setSalePrice("");
    setDeposit("");
    setAppraised("");
    setTransferIncluded(false);
    setTransferFee("");
    setExclusiveArea("");
    setLandShare("");
    setLeaseOperatorOnly(false);
    setLandPermitRequired(false);
    setNote("");
    setSaveFailed(false);
    setCopyMsg(null);
  }

  function submit() {
    if (!zone) return;
    const listing: Listing = {
      ...draft,
      id: newListingId(),
      unitType: draft.unitType,
      appraisedValue: toNum(appraised) || undefined,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const { ok, list } = upsertCustomListing(listing);
    setMine(list);
    setSaveFailed(!ok);
    setSaved(listing);
    // 등록한 구역으로 지도에서 바로 확인할 수 있게 주소를 남겨 둔다(아래 링크가 쓴다)
    if (ok) {
      setCopyMsg(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function remove(id: string) {
    setMine(deleteCustomListing(id));
    if (saved?.id === id) setSaved(null);
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
            서울 정비구역 <b>{(seoulZones.length || 2289).toLocaleString()}곳</b> 중에서 구역을 검색해 바로 올립니다.
            매매가·기보증금만 적으면 <b>초기투자금</b>이 자동 계산됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="green">베타 기간 무료 등록</Badge>
          <Badge tone="blue">결제 단계 없음</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-[12px] leading-relaxed text-blue-900">
        <b>베타 무료 등록</b> — 지금은 요금제·결제 없이 바로 등록됩니다(단건 9만원/월 29만원 요금제는 정식
        오픈 시 적용). 등록한 매물은 <b>이 브라우저</b>에 저장되어 메인 지도와 매물 목록에 바로 나타나며,
        다른 사람에게도 보이게 하려면 아래 <b>JSON 다운로드</b>로 받아 정식 데이터에 넣으면 됩니다.
      </div>

      {/* ── 등록 완료 카드 ── */}
      {saved && (
        <div
          data-testid="register-done"
          className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="text-lg leading-none">✅</span>
            <b className="text-sm text-emerald-900">등록 완료 — {saved.zoneName}</b>
            <Badge tone="green">지도·목록에 반영됨</Badge>
            {saveFailed && <Badge tone="red">브라우저 저장 실패 — JSON 으로 보관하세요</Badge>}
          </div>
          <p className="mt-1 text-[12px] text-emerald-900/90">
            {saved.unitType} · 매매 {formatMan(saved.salePrice)}
            {listingDeposit(saved) > 0 ? ` · 기보증금 ${formatMan(listingDeposit(saved))}` : ""} ·{" "}
            <b>초기투자금 {formatMan(calcInitialInvestment(saved))}</b>
          </p>
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
          {copyMsg && <p className="mt-1 text-[11px] text-emerald-800">{copyMsg}</p>}
        </div>
      )}

      {/* ── 등록 폼 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {/* 구역 검색 — 2,289곳 */}
          <div className="md:col-span-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                구역 선택 (서울 정비구역 {(seoulZones.length || 2289).toLocaleString()}곳)
              </span>
              <div className="relative">
                <input
                  ref={searchRef}
                  value={zoneQuery}
                  onChange={(e) => {
                    setZoneQuery(e.target.value);
                    setZoneOpen(true);
                    if (zone && e.target.value !== zone.name) setZone(null);
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
                              onClick={() => pickZone(z)}
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

          <Field label="매물 종류">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="input"
              data-testid="register-property-type"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="호수·타입 (예: 404호, 84D)">
            <input
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="input"
              placeholder="404호"
              data-testid="register-unit-type"
            />
          </Field>

          <Field label="매매가 (만원) *">
            <input
              value={salePrice}
              onChange={(e) => setSalePrice(onlyDigits(e.target.value))}
              className="input"
              placeholder="78000"
              inputMode="numeric"
              data-testid="register-sale-price"
            />
            <Hint>{toNum(salePrice) > 0 ? formatMan(toNum(salePrice)) : "7.8억은 78000"}</Hint>
          </Field>
          <Field label="기보증금 (만원) — 초기투자금에서 빠집니다">
            <input
              value={deposit}
              onChange={(e) => setDeposit(onlyDigits(e.target.value))}
              className="input"
              placeholder="27700"
              inputMode="numeric"
              data-testid="register-deposit"
            />
            <Hint>{toNum(deposit) > 0 ? formatMan(toNum(deposit)) : "예상 전세보증금으로 적어도 됩니다"}</Hint>
          </Field>

          <Field label="감정평가액 (만원, 선택)">
            <input
              value={appraised}
              onChange={(e) => setAppraised(onlyDigits(e.target.value))}
              className="input"
              placeholder="선택"
              inputMode="numeric"
            />
            <Hint>
              {toNum(appraised) > 0 && toNum(salePrice) > 0
                ? `프리미엄 ${formatMan(Math.max(0, toNum(salePrice) - toNum(appraised)))}`
                : "감정가를 넣으면 프리미엄이 계산됩니다"}
            </Hint>
          </Field>
          <Field label="불하금 (만원, 선택)">
            <div className="flex items-center gap-2">
              <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs">
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

          <Field label="전용면적 (㎡)">
            <input
              value={exclusiveArea}
              onChange={(e) => setExclusiveArea(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="29.175"
              inputMode="decimal"
              data-testid="register-exclusive-area"
            />
            <Hint>{exclusiveArea ? `${pyeong(Number(exclusiveArea))}평` : "건축물대장 전유면적"}</Hint>
          </Field>
          <Field label="대지지분 (㎡, 선택)">
            <input
              value={landShare}
              onChange={(e) => setLandShare(e.target.value.replace(/[^\d.]/g, ""))}
              className="input"
              placeholder="선택"
              inputMode="decimal"
              data-testid="register-land-share"
            />
            <Hint>{landShare ? `${pyeong(Number(landShare))}평` : "지적도·대지권면적"}</Hint>
          </Field>

          <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5 text-sm">
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
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5 text-sm">
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
          </div>

          <div className="md:col-span-2">
            <Field label="매물 핵심 특징">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="예: 임대사업자 승계 필수 물건 · 초기투자금 약 5.03억 · 2018.08 사용승인"
                data-testid="register-note"
              />
            </Field>
          </div>

          <Field label="중개사명 *">
            <input
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              className="input"
              data-testid="register-broker-name"
            />
          </Field>
          <Field label="중개사무소 *">
            <input
              value={brokerAgency}
              onChange={(e) => setBrokerAgency(e.target.value)}
              className="input"
              data-testid="register-broker-agency"
            />
          </Field>
          <Field label="연락처 (공개 범위는 직접 결정)">
            <input
              value={brokerPhone}
              onChange={(e) => setBrokerPhone(e.target.value)}
              className="input"
              placeholder="010-0000-0000"
              data-testid="register-broker-phone"
            />
            <Hint>비워 두면 &lsquo;문의 요청 시 안내&rsquo;로 표시됩니다</Hint>
          </Field>
          <Field label="개설등록번호 (선택)">
            <input
              value={brokerLicense}
              onChange={(e) => setBrokerLicense(e.target.value)}
              className="input"
              placeholder="서울동작-00000"
            />
          </Field>

          <label className="md:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markVerified}
              onChange={(e) => setMarkVerified(e.target.checked)}
              data-testid="register-mark-verified"
            />
            <span>
              <b>검증 매물</b>로 표시 — 건축물대장·현장 확인을 마친 물건
            </span>
          </label>
        </div>

        {/* ── 실시간 초기투자금 ── */}
        <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-slate-300">
              초기투자금 = 매매가 − 기보증금{transfer > 0 ? " + 불하금" : ""} (취득세 등 부대비용 별도)
            </span>
            <b data-testid="register-initial-investment" className="text-xl font-extrabold text-amber-300">
              {formatMan(initialInvestment)}
            </b>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span>매매가 {formatMan(toNum(salePrice))}</span>
            <span>기보증금 −{formatMan(toNum(deposit))}</span>
            {transfer > 0 && <span>불하금 +{formatMan(transfer)}</span>}
            <span className="ml-auto">등록비 무료 (베타)</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          data-testid="register-submit"
          className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {canSave ? "베타 무료로 등록하기" : "구역·매매가·중개사무소를 입력하세요"}
        </button>
        <p className="mt-1.5 text-[11px] text-slate-400">
          등록하면 메인 지도에 <b>🏠 매물</b> 배지가, 이 구역 상세 패널과 <Link href="/listings" className="underline">매물 목록</Link>에
          매물 카드가 바로 나타납니다.
        </p>
      </div>

      {/* ── 내가 등록한 매물 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">내가 등록한 매물 {mine.length}건</b>
          <span className="text-[11px] text-slate-500">이 브라우저에만 저장됩니다</span>
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
            아직 등록한 매물이 없습니다. 위에서 구역을 찾아 첫 매물을 올려 보세요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {mine.map((l) => (
              <li key={l.id} data-testid="register-mine-item" className="flex flex-wrap items-center gap-2 py-2">
                <b className="text-sm text-slate-900">{l.zoneName ?? l.zoneId}</b>
                <span className="text-[11px] text-slate-600">
                  {l.propertyType} · {l.unitType}
                </span>
                <span className="text-[11px] font-semibold text-slate-900">매매 {formatMan(l.salePrice)}</span>
                <span className="text-[11px] text-slate-600">
                  초기투자금 {formatMan(calcInitialInvestment(l))}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <ListingConditionBadges listing={l} />
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
