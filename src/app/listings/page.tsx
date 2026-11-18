"use client";
// ─────────────────────────────────────────────────────────────────────────────
// /listings — 검증 매물 목록
//
//  · 소스: 정식 검증 매물(src/data/verified-listings.json) + 샘플 매물 + 이 브라우저 등록 매물.
//    세 곳을 합치는 일은 `allListings()`(lib/custom-listings)가 한다 — 지도·등록 화면과 같은 목록.
//  · 필터: 임대사업자 승계 / 실거주(토허제) 없음, 정렬: 초기투자금·매매가·최근 등록.
//    지방 투자자가 먼저 거르는 조건이 '임대사업자 승계 여부'와 '실거주 의무'라 두 가지를 앞에 둔다.
//  · 매물마다 [지도에서 보기](`/?zone=<구역 id>` → 그 구역 상세가 열린다)와 [비교함 담기]가 붙는다.
//    비교함은 최대 4건까지 한 표에서 나란히 본다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { calcInitialInvestment, listingDeposit } from "@/lib/types";
import { getProvider } from "@/lib/data-provider";
import { listingZoneName, LISTINGS_CHANGED_EVENT } from "@/lib/custom-listings";
import { formatMan } from "@/lib/format";
import { ListingConditionBadges } from "@/components/ZoneListingCards";

type SortKey = "initial" | "price" | "recent";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "initial", label: "초기투자금 낮은 순" },
  { key: "price", label: "매매가 낮은 순" },
  { key: "recent", label: "최근 등록순" },
];

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [leaseOnly, setLeaseOnly] = useState(false);
  const [noPermit, setNoPermit] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("initial");
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    const load = () => {
      getProvider()
        .getListings()
        .then((l) => setListings(l))
        .catch(() => setListings([]))
        .finally(() => setLoading(false));
    };
    load();
    // 등록 화면에서 매물을 올리거나 지우면 새로고침 없이 목록을 다시 읽는다
    const onChange = () => load();
    window.addEventListener(LISTINGS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LISTINGS_CHANGED_EVENT, onChange);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().replace(/\s+/g, "");
    const hit = (l: Listing) => {
      if (!term) return true;
      const hay = [l.zoneName, listingZoneName(l), l.gu, l.unitType, l.propertyType, l.note, l.brokerAgency, l.brokerName]
        .filter(Boolean)
        .join("")
        .replace(/\s+/g, "");
      return hay.includes(term);
    };
    const list = listings.filter(
      (l) =>
        hit(l) &&
        (!leaseOnly || l.leaseOperatorOnly === true) &&
        (!noPermit || l.landPermitRequired !== true) &&
        (!verifiedOnly || l.verified)
    );
    return list.sort((a, b) => {
      if (sort === "price") return a.salePrice - b.salePrice;
      if (sort === "recent") return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      return calcInitialInvestment(a) - calcInitialInvestment(b);
    });
  }, [listings, query, leaseOnly, noPermit, verifiedOnly, sort]);

  const picked = useMemo(
    () => compare.map((id) => listings.find((l) => l.id === id)).filter((l): l is Listing => !!l),
    [compare, listings]
  );

  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
    setShowCompare(true);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">검증 매물</h1>
          <p className="text-sm text-slate-600">
            재개발 입주권·조합원 물건을 <b>매매가·기보증금·초기투자금</b>과 함께 봅니다. 구역을 누르면 지도에서
            경계와 실거래가까지 한 화면에 열립니다.
          </p>
        </div>
        <Link
          href="/register"
          className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          매물 등록하기 (베타 무료)
        </Link>
      </div>

      {/* ── 필터 ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="구역·타입·중개사무소 검색"
          aria-label="매물 검색"
          data-testid="listings-search"
          className="mr-1 h-9 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
        />
        <Chip active={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)} testId="filter-verified">
          검증 매물만
        </Chip>
        <Chip active={leaseOnly} onClick={() => setLeaseOnly((v) => !v)} testId="filter-lease">
          임대사업자 승계
        </Chip>
        <Chip active={noPermit} onClick={() => setNoPermit((v) => !v)} testId="filter-no-permit">
          실거주·토허제 없음
        </Chip>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">정렬</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            data-testid="listings-sort"
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span data-testid="listings-count">
          <b className="text-slate-800">{filtered.length}</b>건 / 전체 {listings.length}건
        </span>
        <span className="text-slate-300">|</span>
        <span>비교함 {picked.length}/4</span>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCompare((v) => !v)}
            className="rounded-full border border-slate-300 px-2 py-0.5 font-semibold text-slate-700 hover:border-slate-500"
          >
            {showCompare ? "비교함 접기" : "비교함 펼치기"}
          </button>
        )}
        {picked.length > 0 && (
          <button type="button" onClick={() => setCompare([])} className="text-slate-400 underline">
            비우기
          </button>
        )}
      </div>

      {/* ── 비교함 ── */}
      {showCompare && picked.length > 0 && (
        <div data-testid="listing-compare" className="overflow-x-auto rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-3">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="w-24 py-1.5 pr-2 font-medium">구역</th>
                {picked.map((l) => (
                  <th key={l.id} className="px-2 py-1.5 font-semibold text-slate-800">
                    {listingZoneName(l)}
                    <span className="ml-1 font-normal text-slate-500">{l.unitType}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              <CompareRow label="매매가" rows={picked.map((l) => formatMan(l.salePrice))} bold />
              <CompareRow label="기보증금" rows={picked.map((l) => (listingDeposit(l) ? formatMan(listingDeposit(l)) : "-"))} />
              <CompareRow
                label="초기투자금"
                rows={picked.map((l) => formatMan(calcInitialInvestment(l)))}
                bold
              />
              <CompareRow label="전용면적" rows={picked.map((l) => (l.exclusiveAreaSqm ? `${l.exclusiveAreaSqm}㎡` : "-"))} />
              <CompareRow label="대지지분" rows={picked.map((l) => (l.landShareSqm ? `${l.landShareSqm}㎡` : "-"))} />
              <CompareRow label="임대사업자" rows={picked.map((l) => (l.leaseOperatorOnly ? "승계 필수" : "무관"))} />
              <CompareRow label="토허제/실거주" rows={picked.map((l) => (l.landPermitRequired ? "해당" : "없음"))} />
              <CompareRow label="특징" rows={picked.map((l) => l.note ?? "-")} />
            </tbody>
          </table>
        </div>
      )}

      {/* ── 매물 카드 ── */}
      {loading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          매물을 불러오는 중…
        </p>
      ) : filtered.length === 0 ? (
        <p
          data-testid="listings-empty"
          className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500"
        >
          조건에 맞는 매물이 없습니다. 필터를 풀거나{" "}
          <Link href="/register" className="font-semibold text-blue-700 underline">
            매물을 등록
          </Link>
          해 보세요.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((l) => {
            const zoneName = listingZoneName(l);
            const deposit = listingDeposit(l);
            const inCompare = compare.includes(l.id);
            return (
              <li
                key={l.id}
                data-testid="listing-card"
                data-listing-id={l.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-1.5">
                  <Link
                    href={`/?zone=${encodeURIComponent(l.zoneId)}`}
                    data-testid="listing-zone-link"
                    className="text-sm font-bold text-slate-900 underline decoration-slate-300 hover:decoration-slate-800"
                  >
                    {zoneName}
                  </Link>
                  {l.gu && <span className="text-[11px] text-slate-500">{l.gu}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    <ListingConditionBadges listing={l} />
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <b className="text-lg font-extrabold text-slate-900">{formatMan(l.salePrice)}</b>
                  <span className="text-[11px] font-medium text-slate-600">
                    {l.propertyType ? `${l.propertyType} · ` : ""}
                    {l.unitType}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                  {deposit > 0 && <span>기보증금 {formatMan(deposit)}</span>}
                  <span className="font-semibold text-slate-900">초기투자금 {formatMan(calcInitialInvestment(l))}</span>
                  {l.exclusiveAreaSqm ? (
                    <span>
                      전용 {l.exclusiveAreaSqm}㎡ ({(l.exclusiveAreaSqm / 3.305785).toFixed(1)}평)
                    </span>
                  ) : null}
                  {l.landShareSqm ? <span>대지지분 {l.landShareSqm}㎡</span> : null}
                </div>
                {l.note && <p className="mt-1.5 text-[11px] leading-snug text-slate-600">{l.note}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                  <span className="text-[10px] text-slate-500">
                    {l.brokerAgency}
                    {l.brokerName ? ` · ${l.brokerName}` : ""}
                    {l.brokerPhone ? ` · ${l.brokerPhone}` : ""}
                  </span>
                  <Link
                    href={`/?zone=${encodeURIComponent(l.zoneId)}`}
                    className="ml-auto rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-500"
                  >
                    지도에서 보기
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleCompare(l.id)}
                    data-testid="listing-compare-toggle"
                    className={
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold " +
                      (inCompare
                        ? "bg-blue-700 text-white hover:bg-blue-800"
                        : "border border-blue-300 text-blue-700 hover:bg-blue-50")
                    }
                  >
                    {inCompare ? "비교함에서 빼기" : "비교함 담기"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        ※ 매매가·기보증금은 중개사가 등록한 값이며, 초기투자금은 <b>매매가 − 기보증금</b>으로 계산한 참고값입니다
        (취득세·법무·중개보수 등 부대비용 별도). 임대사업자 승계·토허제 여부는 계약 전 반드시 건축물대장·임대차
        내역으로 확인하세요.
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition " +
        (active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-500")
      }
    >
      {children}
    </button>
  );
}

function CompareRow({ label, rows, bold }: { label: string; rows: string[]; bold?: boolean }) {
  return (
    <tr>
      <th className="py-1.5 pr-2 text-left font-medium text-slate-500">{label}</th>
      {rows.map((r, i) => (
        <td key={i} className={"px-2 py-1.5 " + (bold ? "font-semibold text-slate-900" : "text-slate-700")}>
          {r}
        </td>
      ))}
    </tr>
  );
}
