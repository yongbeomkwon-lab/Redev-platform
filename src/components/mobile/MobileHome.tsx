"use client";
// ─────────────────────────────────────────────────────────────────────────────
// MobileHome — 폰 전용 홈 대시보드 (2026-11-28)
//
//   맨 위 검색 → 지도 바로가기 큰 카드 + 퀵 메뉴 8칸 → 커뮤니티 최신글 3건 → 소식 카드.
//   · 지도 탭·`?zone=` 딥링크로 들어오면 이 화면은 뜨지 않는다(MobileShell 이 판단).
//   · 검색: 구역명·지번 별칭은 여기서 바로 골라 `?zone=` 으로 열고,
//     주소·지하철역처럼 지도 쪽 판정이 필요한 말은 `?q=` 로 넘겨 지도 검색이 처리한다.
//   · 데이터: 구역 목록은 지도와 같은 로더(lib/seoul-zones, 모듈 캐시)를 쓰고,
//     커뮤니티는 /api/community/posts 를 그대로 읽는다(없으면 소식 카드만).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { loadSeoulZones, type SeoulZone } from "@/lib/seoul-zones";
import { CATEGORY_CHIP, CATEGORY_LABEL, timeAgo, type CommunityPost } from "@/lib/community";
import { fetchPosts } from "@/lib/community-client";
import { TYPE_COLORS } from "@/components/map/colors";
import { readLastView } from "@/components/map/last-view";

type QuickItem = { label: string; emoji: string; tint: string; href?: string; action?: "map" | "auction" | "draw" };

// 퀵 메뉴 8칸 — 왼쪽 위부터: 매물 · 경매 · 법 · 판례 / 입주물량 · 구역 그리기 · 커뮤니티 · 매물 등록
const QUICK: QuickItem[] = [
  { label: "검증매물", emoji: "🏷️", tint: "bg-[#eef6fd]", href: "/listings" },
  { label: "경매·공매", emoji: "⚖️", tint: "bg-[#fff2ec]", action: "auction" },
  { label: "법령·조례", emoji: "📜", tint: "bg-[#f1f7ee]", href: "/laws" },
  { label: "판례리포트", emoji: "📚", tint: "bg-[#fdf6e7]", href: "/cases" },
  { label: "입주물량", emoji: "🏗️", tint: "bg-[#eef1fd]", href: "/supply" },
  { label: "구역 그리기", emoji: "✏️", tint: "bg-[#f4eefe]", action: "draw" },
  { label: "커뮤니티", emoji: "💬", tint: "bg-[#eef7f4]", href: "/community" },
  { label: "매물 등록", emoji: "📝", tint: "bg-[#fdeff2]", href: "/register" },
];

const NEWS = [
  {
    tag: "판례",
    title: "현금청산 판례 리포트",
    desc: "분양신청 미신청 · 다물권자 · 감정평가 기준일",
    href: "/cases",
    tint: "bg-gold-tint text-[#8a6a24]",
  },
  {
    tag: "법령",
    title: "도정법 · 서울시 조례 조문 검색",
    desc: "권리산정기준일 · 과소필지 · 1+1 · 현금청산",
    href: "/laws",
    tint: "bg-brand-tint text-brand",
  },
  {
    tag: "입주",
    title: "연도별 예상 입주물량",
    desc: "2026~2031 자치구별 계획 세대수",
    href: "/supply",
    tint: "bg-[#eef1fd] text-[#3b4a9c]",
  },
];

export default function MobileHome({
  onOpenMap,
  onOpenPath,
  onOpenLayer,
  onOpenZone,
  onSearchSubmit,
}: {
  onOpenMap: () => void;
  onOpenPath: (href: string) => void;
  onOpenLayer: (layer: "auction" | "gongmae" | "draw") => void;
  onOpenZone: (id: string) => void;
  onSearchSubmit: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [zones, setZones] = useState<SeoulZone[]>([]);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [recentZone, setRecentZone] = useState<SeoulZone | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 구역 목록 — 지도와 같은 모듈 캐시를 공유한다(이미 받았으면 즉시).
  useEffect(() => {
    let alive = true;
    loadSeoulZones()
      .then((d) => {
        if (alive) setZones(d.zones);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 최근 본 구역 — 지도가 마지막으로 열어 둔 구역을 한 줄로 이어 준다(상담 이어하기)
  useEffect(() => {
    if (!zones.length) return;
    const id = readLastView()?.selectedZoneId;
    if (!id) return;
    setRecentZone(zones.find((z) => z.id === id) ?? null);
  }, [zones]);

  // 커뮤니티 최신글 3건
  useEffect(() => {
    let alive = true;
    fetchPosts({ tab: "latest", limit: 3 }, null)
      .then((r) => {
        if (alive) setPosts(r.ok ? r.items : []);
      })
      .catch(() => {
        if (alive) setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 홈 화면에 추가 — 안드로이드 크롬이 설치 가능할 때만 배너를 띄운다(닫으면 기억)
  type InstallEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [installHidden, setInstallHidden] = useState(true);
  useEffect(() => {
    try {
      setInstallHidden(localStorage.getItem("redev_install_hint") === "off");
    } catch {
      setInstallHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const scored: { z: SeoulZone; score: number }[] = [];
    for (const z of zones) {
      if (z.hiddenByDefault) continue;
      const name = z.name.toLowerCase();
      const alias = z.alias?.find((a) => a.toLowerCase().includes(term));
      if (!name.includes(term) && !alias && !z.gu.includes(term)) continue;
      // 앞에서부터 맞는 이름을 먼저, 짧은 이름(공식 구역명)을 위로 — ‘(가칭)…일원’ 꼬리가 쏟아지지 않게
      const score = name.startsWith(term) ? 0 : name.includes(term) ? 1 : alias ? 2 : 3;
      scored.push({ z, score });
    }
    scored.sort((a, b) => a.score - b.score || a.z.name.length - b.z.name.length);
    return scored.slice(0, 6).map((s) => s.z);
  }, [q, zones]);

  const openQuick = (item: QuickItem) => {
    if (item.action === "map") return onOpenMap();
    if (item.action === "auction") return onOpenLayer("auction");
    if (item.action === "draw") return onOpenLayer("draw");
    if (item.href) onOpenPath(item.href);
  };

  return (
    <div className="fixed inset-x-0 bottom-[var(--mtab-h)] top-0 z-[740] flex flex-col bg-canvas md:hidden">
      {/* ── 머리: 브랜드 + 검색 ─────────────────────────────────────────── */}
      <div className="relative z-10 shrink-0 border-b border-line bg-white px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenMap} aria-label="리디브 홈" className="shrink-0">
            <BrandLogo size={22} showWordmark={false} />
          </button>
          <div className="relative flex-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <circle cx="10.8" cy="10.8" r="6.2" />
              <path d="m15.5 15.5 4.2 4.2" />
            </svg>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 180)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const term = q.trim();
                  if (!term) return;
                  if (hits[0]) {
                    setQ("");
                    onOpenZone(hits[0].id);
                  } else {
                    setQ("");
                    onSearchSubmit(term);
                  }
                }
                if (e.key === "Escape") setFocused(false);
              }}
              placeholder="구역·주소·지하철역 검색"
              enterKeyHint="search"
              aria-label="구역·주소·지하철역 검색"
              className="h-9 w-full rounded-full bg-slate-100 pl-9 pr-3 text-[13.5px] font-medium text-ink placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </div>
        </div>

        {/* 자동완성 — 구역명·지번 별칭·자치구 */}
        {focused && q.trim() && (
          <div className="absolute inset-x-2 top-[calc(100%-2px)] overflow-hidden rounded-xl border border-line bg-white shadow-[0_18px_40px_-18px_rgba(16,24,40,.45)]">
            {hits.map((z) => (
              <button
                key={z.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ("");
                  onOpenZone(z.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-tint"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TYPE_COLORS[z.type] ?? "#94a3b8" }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{z.name}</span>
                <span className="shrink-0 text-[10.5px] text-slate-400">
                  {z.gu} · {z.stage}
                </span>
              </button>
            ))}
            {hits.length === 0 && (
              <p className="px-3 py-2.5 text-[12px] text-slate-500">
                구역명으로 찾지 못했습니다 — 주소·역 이름은 지도에서 찾습니다.
              </p>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const term = q.trim();
                setQ("");
                onSearchSubmit(term);
              }}
              className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2.5 text-left text-[12px] font-semibold text-brand"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.2" />
                <path d="m15.5 15.5 4.2 4.2" />
              </svg>
              ‘{q.trim()}’ 지도에서 찾기
            </button>
          </div>
        )}
      </div>

      {/* ── 본문 ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain pb-5">
        <p className="px-3 pt-2.5 text-[10.5px] font-medium text-slate-500">
          서울 정비구역 <b className="font-bold text-slate-700">2,400여 곳</b> · 5년 실거래 · 법원경매·공매
        </p>

        {/* 지도 큰 카드 + 퀵 메뉴 */}
        <div className="mt-2 grid grid-cols-[118px_1fr] gap-2 px-3">
          <button
            type="button"
            onClick={onOpenMap}
            className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-[#1b7cc4] p-2.5 text-left text-white shadow-[0_12px_26px_-16px_rgba(0,84,166,.95)] active:brightness-95"
          >
            <span className="text-[13.5px] font-extrabold tracking-[-0.02em]">지도</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 32 32"
              fill="currentColor"
              aria-hidden="true"
              className="absolute right-2 top-2 opacity-55"
            >
              <path d="M16 3c-5.2 0-9.4 4.2-9.4 9.4 0 7 9.4 16.6 9.4 16.6s9.4-9.6 9.4-16.6C25.4 7.2 21.2 3 16 3zm0 13a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
            </svg>
            <span className="text-[9.5px] font-medium leading-[1.35] text-white/85">
              구역 경계 · 실거래
              <br />· 경매까지 한눈에
            </span>
            <span className="mt-2 inline-flex items-center gap-0.5 text-[10px] font-bold">
              지도 열기
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </span>
          </button>

          <div className="grid grid-cols-4 gap-x-0.5 gap-y-2">
            {QUICK.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openQuick(item)}
                className="flex flex-col items-center gap-1 rounded-lg py-0.5 active:bg-slate-200/50"
              >
                <span className={`grid h-[40px] w-[40px] place-items-center rounded-xl text-[19px] ${item.tint}`}>
                  <span aria-hidden>{item.emoji}</span>
                </span>
                <span className="whitespace-nowrap text-[10px] font-semibold leading-none text-slate-700">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 최근 본 구역 — 지도에서 마지막으로 열어 둔 구역 */}
        {recentZone && (
          <div className="mt-2.5 px-3">
            <button
              type="button"
              onClick={() => onOpenZone(recentZone.id)}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left active:bg-slate-50"
            >
              <span className="shrink-0 text-[10px] font-bold tracking-[0.02em] text-slate-400">최근 본 구역</span>
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: TYPE_COLORS[recentZone.type] ?? "#94a3b8" }}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold text-ink">
                {recentZone.name}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">{recentZone.gu}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-slate-300">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* 홈 화면에 추가 안내 — 설치 가능할 때만 */}
        {installEvt && !installHidden && (
          <div className="ml-3 mr-3 mt-3 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-tint px-3 py-2">
            <span className="text-[15px]" aria-hidden>
              📲
            </span>
            <p className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-brand-deep">
              홈 화면에 추가하면 앱처럼 바로 열립니다
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await installEvt.prompt();
                  await installEvt.userChoice;
                } catch {}
                setInstallEvt(null);
              }}
              className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-bold text-white"
            >
              추가
            </button>
            <button
              type="button"
              aria-label="안내 닫기"
              onClick={() => {
                setInstallHidden(true);
                try {
                  localStorage.setItem("redev_install_hint", "off");
                } catch {}
              }}
              className="shrink-0 px-1 text-[13px] text-slate-400"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 커뮤니티 최신글 ─────────────────────────────────────────── */}
        <section className="mt-4 border-t border-line bg-white pb-1 pt-3">
          <div className="flex items-center justify-between px-3">
            <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">커뮤니티</h2>
            <button
              type="button"
              onClick={() => onOpenPath("/community")}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-500"
            >
              전체 보기
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
          </div>

          {posts === null && (
            <div className="space-y-2 px-3 py-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-[54px] animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}

          {posts !== null && posts.length > 0 && (
            <ul className="mt-1 divide-y divide-line/70">
              {posts.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPath(`/community?post=${encodeURIComponent(p.id)}`)}
                    className="block w-full px-3 py-2.5 text-left active:bg-slate-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-[1px] text-[9.5px] font-bold ${CATEGORY_CHIP[p.category]}`}>
                        {CATEGORY_LABEL[p.category]}
                      </span>
                      {p.zoneName && (
                        <span className="max-w-[150px] truncate rounded-full bg-brand-tint px-1.5 py-[1px] text-[9.5px] font-bold text-brand">
                          📍 {p.zoneName}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-slate-400">{timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] font-bold leading-snug text-ink">{p.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                      <span className="truncate">{p.authorNickname}</span>
                      <span aria-hidden>·</span>
                      <span>좋아요 {p.likesCount}</span>
                      <span>댓글 {p.commentsCount}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {posts !== null && posts.length === 0 && (
            <div className="mx-3 my-2 rounded-xl border border-dashed border-line px-3 py-4 text-center">
              <p className="text-[12px] font-medium text-slate-500">아직 커뮤니티 글이 없습니다.</p>
              <button
                type="button"
                onClick={() => onOpenPath("/community")}
                className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-[11.5px] font-bold text-white"
              >
                첫 글 남기기
              </button>
            </div>
          )}

          <div className="mt-1 flex gap-2 px-3 pb-1">
            <button
              type="button"
              onClick={() => onOpenPath("/community?tab=hot")}
              className="flex-1 rounded-lg bg-slate-100 py-2 text-[11.5px] font-bold text-slate-700"
            >
              인기글 보기
            </button>
            <button
              type="button"
              onClick={() => onOpenPath("/community")}
              className="flex-1 rounded-lg bg-slate-100 py-2 text-[11.5px] font-bold text-slate-700"
            >
              자유게시판
            </button>
          </div>
        </section>

        {/* ── 소식 ─────────────────────────────────────────────────────── */}
        <section className="mt-3 bg-white pt-3">
          <h2 className="px-3 text-[15px] font-extrabold tracking-[-0.02em] text-ink">소식</h2>
          <ul className="mt-1.5 divide-y divide-line/70">
            {NEWS.map((n) => (
              <li key={n.href}>
                <button
                  type="button"
                  onClick={() => onOpenPath(n.href)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50"
                >
                  <span className={`shrink-0 rounded-md px-1.5 py-[2px] text-[9.5px] font-bold ${n.tint}`}>{n.tag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-ink">{n.title}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{n.desc}</span>
                  </span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-slate-300">
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 중개사 매물 등록 — 베타 무료 안내(플랫폼의 실제 수익 경로) */}
        <section className="mt-3 bg-white px-3 py-3">
          <div className="rounded-xl border border-brand/25 bg-brand-tint p-3">
            <p className="text-[10px] font-bold tracking-[0.04em] text-brand">중개사 매물 등록 · 베타 무료</p>
            <p className="mt-1 text-[13px] font-extrabold leading-snug text-ink">
              등록한 매물이 지도와 검증 매물 목록에 바로 뜹니다
            </p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-600">
              주소를 고르면 소속 구역·건축물대장이 자동으로 채워지고, 초기투자금은 입력하는 대로 계산됩니다.
            </p>
            <button
              type="button"
              onClick={() => onOpenPath("/register")}
              className="mt-2 w-full rounded-lg bg-brand py-2 text-[12px] font-bold text-white active:brightness-95"
            >
              매물 등록하기
            </button>
          </div>
        </section>

        <p className="mt-auto px-3 py-4 text-center text-[9.5px] leading-relaxed text-slate-400">
          리디브(redev) — 서울 정비사업 실거래·매물 플랫폼
          <br />
          서울 열린데이터광장 · 국토교통부 실거래 · 대법원 경매정보 기준
        </p>
      </div>
    </div>
  );
}
