"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZonePicker — 커뮤니티에서 구역을 고르는 창 (2026-11-22)
//   · /data/zone-index.json (2,425개 구역 색인, 경계 좌표 없음)을 처음 열 때 한 번만 받는다.
//   · 이름·별칭·자치구로 찾고, 고르면 { id, name } 을 돌려준다.
//   · 여기서 고른 id 는 지도 구역 패널의 구역 id 와 같다 — 글이 지도와 그대로 이어진다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";

export type ZoneRef = { id: string; name: string; gu?: string };

type IndexZone = { id: string; name: string; gu: string; type: string; alias?: string[] };

let cache: IndexZone[] | null = null;
let pending: Promise<IndexZone[]> | null = null;

function loadZones(): Promise<IndexZone[]> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch("/data/zone-index.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : { zones: [] }))
    .then((data: { zones?: IndexZone[] }) => {
      cache = Array.isArray(data.zones) ? data.zones : [];
      pending = null;
      return cache;
    })
    .catch(() => {
      pending = null;
      cache = [];
      return cache as IndexZone[];
    });
  return pending;
}

export default function ZonePicker({
  open,
  onClose,
  onPick,
  title = "구역 고르기",
  selectedId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (zone: ZoneRef) => void;
  title?: string;
  selectedId?: string | null;
}) {
  const [zones, setZones] = useState<IndexZone[] | null>(cache);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    loadZones().then(setZones);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!zones) return [];
    const k = q.trim().toLowerCase();
    if (!k) return zones.slice(0, 40);
    const score = (z: IndexZone) => {
      const name = z.name.toLowerCase();
      if (name === k) return 0;
      if (name.startsWith(k)) return 1;
      if (name.includes(k)) return 2;
      if (z.alias?.some((a) => a.toLowerCase().includes(k))) return 3;
      if (z.gu.toLowerCase().includes(k)) return 4;
      return 9;
    };
    return zones
      .map((z) => ({ z, s: score(z) }))
      .filter((r) => r.s < 9)
      .sort((a, b) => a.s - b.s || a.z.name.localeCompare(b.z.name, "ko"))
      .slice(0, 60)
      .map((r) => r.z);
  }, [zones, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-end justify-center bg-[#0b1725]/45 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[14px] font-extrabold tracking-[-0.02em] text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-[18px] leading-none text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="border-b border-line p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="구역 이름·지번·자치구로 찾기 (예: 신림1, 상도23, 마포구)"
            className="w-full rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!zones && <p className="px-4 py-6 text-center text-[12px] text-slate-400">구역 목록을 불러오는 중…</p>}
          {zones && results.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-slate-400">찾는 구역이 없습니다.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {results.map((z) => {
              const active = z.id === selectedId;
              return (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ id: z.id, name: z.name, gu: z.gu });
                      onClose();
                    }}
                    className={
                      "flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors " +
                      (active ? "bg-brand-tint" : "hover:bg-slate-50")
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-ink">{z.name}</span>
                      <span className="block truncate text-[10.5px] text-slate-500">
                        {z.gu} · {z.type}
                        {z.alias?.length ? ` · ${z.alias.slice(0, 2).join(", ")}` : ""}
                      </span>
                    </span>
                    {active && <span className="shrink-0 text-[10px] font-bold text-brand">선택됨</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="border-t border-line px-4 py-2 text-[10.5px] text-slate-400">
          서울 정비구역 {zones?.length ? zones.length.toLocaleString() : "2,400"}곳에서 고릅니다.
        </p>
      </div>
    </div>
  );
}
