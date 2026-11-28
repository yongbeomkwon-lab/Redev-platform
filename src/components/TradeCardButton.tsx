"use client";
// ─────────────────────────────────────────────────────────────────────────────
// TradeCardButton — 실거래 1건을 카톡에 바로 붙여넣을 수 있는 카드 PNG 로 만든다
//
//  · 누르면 canvas 로 카드를 그려 **클립보드에 이미지로 복사**한다(카톡 Ctrl+V).
//  · 클립보드 이미지 쓰기가 안 되는 브라우저(모바일 일부)는 PNG 저장 + 미리보기 창으로
//    넘긴다 — 미리보기에서 '길게 눌러 저장' 또는 공유 시트를 쓴다.
//  · 카드에 들어가는 숫자는 모두 **같은 단지·비슷한 평형의 실제 거래**에서 계산한다
//    (최고가대비·3개월건수·평형최고·직전대비). 거래가 하나뿐이면 그 줄은 비운다.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from "react";
import { toPyeong, type MolitTransaction } from "@/lib/molit";
import {
  deltaEokWon,
  renderTradeCardPng,
  splitEokWon,
  type TradeCardData,
} from "@/lib/trade-card";

/** 같은 평형으로 볼 면적 차이(㎡) — 3㎡ 안쪽은 같은 타입으로 본다(전용 84 vs 84.9 등) */
const AREA_BAND = 3;
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;

type Status = "idle" | "making" | "copied" | "saved" | "error";

function md(iso: string): string {
  return `${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}

function sameDeal(t: MolitTransaction, base: MolitTransaction): boolean {
  if (t.canceled) return false;
  if (t.umdNm !== base.umdNm) return false;
  // 단독·다가구는 국토부가 지번을 `1**`처럼 가려 오기도 하지만, 이름이 `단독`·`다가구`뿐이라
  //   이름으로 묶으면 법정동 전체가 한 채처럼 섞인다 → 같은 지번만 같은 건물로 본다.
  if (base.kind === "단독·다가구") return t.jibun === base.jibun;
  if (t.name !== base.name) return false;
  // 연립·다세대는 건물명이 흔해서(`삼성빌라`) 같은 이름의 다른 지번이 섞인다 → 아파트만 이름 일치 허용
  if (base.kind === "연립·다세대" && t.jibun !== base.jibun) return false;
  if (base.areaSqm && t.areaSqm) return Math.abs(t.areaSqm - base.areaSqm) <= AREA_BAND;
  return true;
}

/** 카드에 넣을 문구·숫자를 만든다 — 화면 목록과 같은 규칙(해제 거래 제외) */
export function buildCardData(
  tx: MolitTransaction,
  peers: MolitTransaction[],
  opts?: { zoneName?: string }
): TradeCardData {
  const same = peers.filter((p) => sameDeal(p, tx) && p.price > 0);
  if (!same.some((p) => p.id === tx.id) && tx.price > 0 && !tx.canceled) same.push(tx);
  same.sort((a, b) => a.dealDate.localeCompare(b.dealDate));

  const prices = same.map((p) => p.price);
  const maxSame = prices.length ? Math.max(...prices) : tx.price;
  const before = same.filter((p) => p.dealDate < tx.dealDate);
  const prev = before.length ? before[before.length - 1] : null;
  const delta = prev ? tx.price - prev.price : null;

  const threeMonthsAgo = new Date(Date.parse(tx.dealDate) - 3 * MONTH_MS)
    .toISOString()
    .slice(0, 10);
  const recent3 = same.filter((p) => p.dealDate >= threeMonthsAgo && p.dealDate <= tx.dealDate).length;

  const pct = maxSame > 0 ? Math.round((tx.price / maxSame) * 1000) / 10 : null;
  const hot = tx.price >= maxSame;

  // 시계열 — **같은 평형** 거래만 월별 마지막 거래가로 이어 그린다.
  //   · 단지 전체를 섮으면 84㎡ 거래 하나가 113㎡ 선을 꾸억 꾸어 내려 추이가 왜곡된다(검수 2026-11-28).
  //   · 같은 평형 거래가 흔하면(3건 미만) 단지 전체로 대신한다.
  const monthSeries = (list: MolitTransaction[]) => {
    const byMonth = new Map<string, number>();
    for (const p of [...list].sort((a, b) => a.dealDate.localeCompare(b.dealDate))) {
      byMonth.set(p.dealDate.slice(0, 7), p.price);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, v]) => ({ t: Date.parse(`${ym}-01`), v }));
  };
  const all = peers.filter(
    (p) =>
      !p.canceled &&
      p.price > 0 &&
      p.umdNm === tx.umdNm &&
      (tx.kind === "단독·다가구"
        ? p.jibun === tx.jibun
        : p.name === tx.name && (tx.kind === "아파트" || p.jibun === tx.jibun))
  );
  const series = monthSeries(same.length >= 3 ? same : all.length ? all : same);

  const pyeong = tx.areaSqm ? toPyeong(tx.areaSqm) : null;
  const areaText = tx.areaSqm
    ? `${tx.areaSqm.toFixed(2).replace(/\.?0+$/, "")}m²${pyeong ? ` ${pyeong}평` : ""}`
    : "면적 미상";
  const floorText = tx.floor ? `${tx.floor}층` : "층 미상";
  const dealText = tx.dealingType || "중개거래";

  const price = splitEokWon(tx.price);
  const buildPart = tx.buildYear ? `${tx.buildYear}년(${new Date().getFullYear() - tx.buildYear}년차)` : "";
  const subline = [buildPart, opts?.zoneName, `${tx.umdNm} ${tx.jibun}`]
    .filter(Boolean)
    .join(" · ");

  const stats: TradeCardData["stats"] = [];
  stats.push({ label: "최고가대비", value: pct !== null ? `${pct}%` : "-", tone: pct !== null && pct >= 100 ? "red" : "violet" });
  stats.push({ label: "3개월건수", value: recent3 ? `${recent3}건` : "-" });
  stats.push({ label: "평형최고", value: splitEokWon(maxSame).main + (splitEokWon(maxSame).sub ? ` ${splitEokWon(maxSame).sub}` : ""), tone: "violet" });
  stats.push({
    label: tx.kind === "단독·다가구" ? "대지평당" : "전용평당",
    value: tx.pyeongPrice ? `${tx.pyeongPrice.toLocaleString()}만` : "-",
  });

  const firstYm = series[0]?.t ?? Date.parse(tx.dealDate);
  const months = Math.max(1, Math.round((Date.parse(tx.dealDate) - firstYm) / MONTH_MS));
  const spanText = months >= 12 ? `${Math.round((months / 12) * 10) / 10}년 전` : `${months}개월 전`;
  const first = series[0]?.v ?? tx.price;
  const short = (v: number) => {
    const s = splitEokWon(v);
    return s.sub ? `${s.main} ${s.sub}` : s.main;
  };

  return {
    name: tx.kind === "단독·다가구" ? `${tx.umdNm} ${tx.jibun}` : tx.name,
    subline,
    price,
    delta: delta !== null && delta !== 0 ? deltaEokWon(delta) : null,
    up: (delta ?? 0) >= 0,
    meta: `${areaText} · ${floorText} ${dealText} · ${md(tx.dealDate)} 계약`,
    badge: hot ? "🔥 평형신고가" : `신고가 대비 ${pct ?? 100}%`,
    hot,
    stats,
    series,
    chartTitle: months >= 12 ? `최근 ${Math.round((months / 12) * 10) / 10}년 실거래` : `최근 ${months}개월 실거래`,
    chartFooter: `${spanText} ${short(first)} → 지금 ${short(tx.price)} · ${same.length}건`,
    watermark: "리디브 · 서울재개발사다리",
    watermarkRight: `redev-platform · ${new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}`,
  };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function TradeCardButton({
  tx,
  peers,
  zoneName,
  compact = false,
}: {
  tx: MolitTransaction;
  /** 같은 단지·평형 통계를 낼 후보 거래 (구역 내 목록 등) */
  peers: MolitTransaction[];
  zoneName?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const data = useMemo(() => buildCardData(tx, peers, { zoneName }), [tx, peers, zoneName]);

  const make = useCallback(async () => {
    setStatus("making");
    try {
      const blob = await renderTradeCardPng(data);
      // 1) 클립보드 이미지 복사 — 되면 끝(카톡 Ctrl+V)
      const ClipItem = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (navigator.clipboard?.write && ClipItem) {
        try {
          await navigator.clipboard.write([new ClipItem({ "image/png": blob })]);
          setStatus("copied");
          setTimeout(() => setStatus("idle"), 3200);
          return;
        } catch {
          /* 권한 거부·미지원 — 아래 저장/미리보기로 */
        }
      }
      // 2) 안 되면 파일 저장 + 미리보기(길게 눌러 저장·공유)
      const safe = `${tx.name}-${tx.dealDate}`.replace(/[^\w가-힣.-]+/g, "_");
      download(blob, `${safe}-리디브.png`);
      setPreview({ url: URL.createObjectURL(blob), blob });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3200);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [data, tx.name, tx.dealDate]);

  const share = useCallback(async () => {
    if (!preview) return;
    const file = new File([preview.blob], "리디브-실거래.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: `${tx.name} 실거래` });
      } catch {
        /* 사용자가 취소 */
      }
    }
  }, [preview, tx.name]);

  const label =
    status === "making"
      ? "그리는 중…"
      : status === "copied"
        ? "복사됨!"
        : status === "saved"
          ? "저장됨"
          : status === "error"
            ? "실패"
            : "카드";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void make();
        }}
        disabled={status === "making"}
        data-testid="tx-card-copy"
        title="실거래 카드 이미지를 만들어 클립보드에 복사합니다 (카톡에 붙여넣기)"
        className={
          "shrink-0 whitespace-nowrap rounded-full border font-bold transition " +
          (status === "copied"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 "
            : "border-line bg-white text-brand hover:border-brand/60 hover:bg-brand-tint ") +
          (compact ? "px-1.5 py-[1px] text-[9px]" : "px-2 py-0.5 text-[10px]")
        }
      >
        {status === "idle" ? "📋 카드" : label}
      </button>

      {preview && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`${tx.name} 실거래 카드`}
              className="max-h-[70vh] w-full rounded-2xl object-contain shadow-2xl"
            />
            <p className="mt-2 text-center text-[11px] text-white/80">
              이미지를 길게 눌러 저장하거나, 아래 버튼으로 저장·공유하세요.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => download(preview.blob, `${tx.name}-${tx.dealDate}-리디브.png`)}
                className="flex-1 rounded-xl bg-white py-2 text-[12px] font-bold text-slate-900"
              >
                PNG 저장
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="flex-1 rounded-xl bg-brand py-2 text-[12px] font-bold text-white"
              >
                공유하기
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-xl border border-white/40 px-3 py-2 text-[12px] font-semibold text-white"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
