"use client";
// ─────────────────────────────────────────────────────────────────────────────
// CommunityBoard — /community 화면 본체 (2026-11-22)
//
//   탭: 전체(최신글) · 인기글 · 자유게시판(구역 미연결) · 구역별 이야기(구역 연결)
//   필터: 구역 고르기 · 검색어 · (로그인 시)내 글
//   쓰기: 비로그인이면 로그인 창을 띄우고, 로그인하면 글쓰기 창
//
//   · 주소 파라미터로 상태가 이어진다 — ?tab= / ?zoneId=&zoneName= / ?post=<글 id>
//     (지도 구역 패널의 「이 구역 이야기」·글 상세의 「지도에서 보기」가 같은 주소를 쓴다)
//   · 목록·상세·쓰기 모두 /api/community 아래 라우트만 본다(읽기는 비로그인 허용).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import PostCard from "@/components/community/PostCard";
import PostDetail from "@/components/community/PostDetail";
import WriteForm from "@/components/community/WriteForm";
import ZonePicker, { type ZoneRef } from "@/components/community/ZonePicker";
import type { CommunityPost } from "@/lib/community";
import { fetchPosts } from "@/lib/community-client";

const TABS = [
  { key: "latest", label: "전체", full: "최신글" },
  { key: "hot", label: "인기글", full: "인기글" },
  { key: "free", label: "자유게시판", full: "자유게시판" },
  { key: "zone", label: "구역별 이야기", full: "구역별 이야기" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const PAGE = 20;

export default function CommunityBoard() {
  const { session, ready, openAuth, version } = useAuth();

  const [tab, setTab] = useState<TabKey>("latest");
  const [zone, setZone] = useState<ZoneRef | null>(null);
  const [zonePicker, setZonePicker] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const [items, setItems] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");

  const [writeOpen, setWriteOpen] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [seedPost, setSeedPost] = useState<CommunityPost | null>(null);

  const initialised = useRef(false);

  // ── 주소 파라미터로 첫 상태를 잡는다(?tab= / ?zoneId= / ?post=) ────────────
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "latest" || t === "hot" || t === "free" || t === "zone") setTab(t);
    const zid = params.get("zoneId");
    if (zid) setZone({ id: zid, name: params.get("zoneName") || zid });
    const pid = params.get("post");
    if (pid) setOpenPostId(pid);
    if (params.get("mine") === "1") setMineOnly(true);
  }, []);

  // ── 검색어는 400ms 쉬었다가 반영 ─────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      if (offset === 0) setLoading(true);
      else setMoreLoading(true);
      const res = await fetchPosts(
        {
          tab,
          zoneId: zone?.id ?? "",
          q: query,
          limit: PAGE,
          offset,
          mine: mineOnly,
        },
        session
      );
      if (offset === 0) {
        setItems(res.items);
        setLoading(false);
      } else {
        setItems((prev) => [...prev, ...res.items.filter((p) => !prev.some((q) => q.id === p.id))]);
        setMoreLoading(false);
      }
      setTotal(res.total);
      setError(res.ok ? "" : res.message ?? "목록을 불러오지 못했습니다.");
    },
    [tab, zone, query, session, mineOnly]
  );

  useEffect(() => {
    if (!ready) return;
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab, zone?.id, query, session?.access_token, mineOnly, version]);

  const syncUrl = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/community?${qs}` : "/community");
  }, []);

  const pickZone = (z: ZoneRef | null) => {
    setZone(z);
    syncUrl({ zoneId: z?.id ?? null, zoneName: z?.name ?? null, tab: z ? "zone" : null });
    if (z) setTab("zone");
  };

  const openDetail = (post: CommunityPost) => {
    setSeedPost(post);
    setOpenPostId(post.id);
    syncUrl({ post: post.id });
  };

  const closeDetail = () => {
    setOpenPostId(null);
    setSeedPost(null);
    syncUrl({ post: null });
  };

  const startWrite = () => {
    if (!session) {
      openAuth("login", "글쓰기는 로그인한 회원만 할 수 있습니다. 게시글 읽기는 로그인 없이도 됩니다.");
      return;
    }
    setWriteOpen(true);
  };

  const zoneCountText = useMemo(() => {
    if (!total) return "0건";
    return `${total.toLocaleString()}건`;
  }, [total]);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      {/* ── 머리 ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-brand">REDEV · COMMUNITY</p>
          <h1 className="mt-2 text-[24px] font-extrabold leading-[1.3] tracking-[-0.035em] text-ink sm:text-[30px]">
            구역 이야기와 매수 질문을 한곳에
          </h1>
          <p className="mt-2 max-w-[620px] text-[13px] leading-[1.7] text-slate-600">
            지도에서 고른 구역의 소식, 입주권·조합원 물건 질문, 공고·판례 정보를 나눕니다. 읽기는 누구나,
            쓰기·댓글·좋아요는 회원만 — 글은 닉네임으로 공개됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={startWrite}
          className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
        >
          ✏️ 글쓰기
        </button>
      </div>

      {/* ── 탭 · 필터 ────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                syncUrl({ tab: t.key });
                if (t.key !== "zone") {
                  setZone(null);
                  syncUrl({ zoneId: null, zoneName: null });
                }
              }}
              className={
                "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors sm:text-[12.5px] " +
                (tab === t.key ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700")
              }
            >
              <span className="sm:hidden">{t.label}</span>
              <span className="hidden sm:inline">{t.full}</span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색 (제목·내용·구역)"
              className="w-[150px] rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10 sm:w-[190px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="검색어 지우기"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[12px] text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            )}
          </div>
          {session && (
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              className={
                "whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold transition-colors " +
                (mineOnly ? "border-brand bg-brand-tint text-brand" : "border-line bg-white text-slate-600 hover:border-slate-300")
              }
            >
              내 글
            </button>
          )}
        </div>
      </div>

      {/* 구역 필터 상태 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {zone ? (
          <span className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-tint px-2.5 py-1 text-[11.5px] font-bold text-brand">
            📍 {zone.name}
            {zone.gu ? <span className="font-medium text-brand/70">{zone.gu}</span> : null}
            <button type="button" onClick={() => pickZone(null)} aria-label="구역 필터 해제" className="text-brand/60 hover:text-brand">
              ×
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setZonePicker(true)}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:border-brand hover:text-brand"
          >
            + 구역 골라 보기
          </button>
        )}
        <span className="text-[10.5px] text-slate-400">{loading ? "불러오는 중…" : zoneCountText}</span>
      </div>

      {/* ── 목록 ─────────────────────────────────────────────────────────── */}
      <div className="mt-3 space-y-2">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>}
        {loading && items.length === 0 && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[96px] animate-pulse rounded-xl border border-line bg-white" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-slate-700">
              {query ? `「${query}」로 찾은 글이 없습니다.` : mineOnly ? "내가 쓴 글이 아직 없습니다." : "첫 글을 남겨 보세요."}
            </p>
            <p className="mt-1 text-[11.5px] text-slate-500">
              {zone
                ? `${zone.name} 이야기를 기다리고 있습니다.`
                : "지도에서 구역을 고르면 그 구역 이야기만 모아 볼 수 있습니다."}
            </p>
            <button
              type="button"
              onClick={startWrite}
              className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-brand-deep"
            >
              글쓰기
            </button>
          </div>
        )}

        {items.map((post) => (
          <PostCard key={post.id} post={post} onOpen={openDetail} onZone={(id, name) => pickZone({ id, name })} />
        ))}

        {items.length > 0 && items.length < total && (
          <button
            type="button"
            onClick={() => load(items.length)}
            disabled={moreLoading}
            className="w-full rounded-xl border border-line bg-white py-2.5 text-[12.5px] font-bold text-slate-600 hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {moreLoading ? "불러오는 중…" : `더 보기 (${total - items.length}건)`}
          </button>
        )}
      </div>

      {/* ── 창들 ─────────────────────────────────────────────────────────── */}
      <ZonePicker
        open={zonePicker}
        onClose={() => setZonePicker(false)}
        onPick={(z) => pickZone(z)}
        title="구역 골라 보기"
        selectedId={zone?.id ?? null}
      />

      <WriteForm
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        presetZone={zone}
        onCreated={(post) => {
          setWriteOpen(false);
          setItems((prev) => [post, ...prev]);
          setTotal((t) => t + 1);
          setSeedPost(post);
          setOpenPostId(post.id);
          syncUrl({ post: post.id });
        }}
      />

      {openPostId && (
        <PostDetail
          postId={openPostId}
          seed={seedPost}
          onClose={closeDetail}
          onChanged={() => load(0)}
        />
      )}

      {!session && ready && (
        <p className="mt-6 text-center text-[11px] text-slate-400">
          회원이 아니어도 글은 모두 읽을 수 있습니다.{" "}
          <button type="button" onClick={() => openAuth("signup")} className="font-bold text-brand hover:underline">
            회원가입
          </button>
        </p>
      )}
    </div>
  );
}
