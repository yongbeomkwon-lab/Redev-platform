"use client";
// 검증 매물 목록 (매수자용) — 전체 매물 비교 + 유료 열람 플로우
import { useEffect, useMemo, useState } from "react";
import type { Listing, Transaction, Zone } from "@/lib/types";
import { getProvider } from "@/lib/data-provider";
import { formatMan } from "@/lib/format";
import { Badge, TypeBadge } from "@/components/Badges";
import { ListingCompare } from "@/components/ListingCompare";
import { UnlockModal } from "@/components/ListingUnlockModal";

export default function ListingsPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [zoneFilter, setZoneFilter] = useState<string>("전체");
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<Listing | null>(null);

  useEffect(() => {
    const p = getProvider();
    Promise.all([p.getZones(), p.getListings(), p.getTransactions()]).then(([z, l, t]) => {
      setZones(z);
      setListings(l);
      setTransactions(t);
    });
  }, []);

  const filtered = useMemo(
    () => (zoneFilter === "전체" ? listings : listings.filter((l) => l.zoneId === zoneFilter)),
    [listings, zoneFilter]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">검증 매물</h1>
        <p className="text-sm text-slate-600">
          매물 목록·매매가는 무료 공개. 초기투자금 시뮬레이션·추정 권리가액·중개사 직통 연락처는
          <b> 열람권 건당 {formatMan(3)}</b>에 확인하세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["전체", ...zones.map((z) => z.id)].map((id) => {
          const z = zones.find((x) => x.id === id);
          return (
            <button
              key={id}
              onClick={() => setZoneFilter(id)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium " +
                (zoneFilter === id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600")
              }
            >
              {z ? z.name : "전체"}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {zones.map((z) => (
            <span key={z.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs">
              <TypeBadge type={z.type} /> {z.name}
              <span className="text-slate-400">
                · 실거래 {transactions.filter((t) => t.zoneId === z.id).length}건
              </span>
              <Badge tone={z.residenceRequired ? "red" : "slate"}>{z.residenceRequired ? "실거주 의무" : "실거주 무관"}</Badge>
            </span>
          ))}
        </div>
        <ListingCompare listings={filtered} zones={zones} unlockedIds={unlocked} onUnlockRequest={setTarget} />
      </div>

      {target && (
        <UnlockModal
          listing={target}
          zone={zones.find((z) => z.id === target.zoneId)}
          onClose={() => setTarget(null)}
          onUnlocked={(id) => setUnlocked((prev) => new Set(prev).add(id))}
        />
      )}
    </div>
  );
}
