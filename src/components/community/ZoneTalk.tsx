"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneTalk — 지도 구역 상세 패널의 「💬 이 구역 이야기 (N건)」 (2026-11-22)
//
//   · 그 구역(zone_id)에 달린 커뮤니티 글을 최신 3건 보여 주고, 바로 한줄 글을 쓸 수 있다.
//   · 글쓰기는 /community 와 같은 DB·같은 API(community_posts)를 쓴다 — 구역 패널에서 쓴 글이
//     커뮤니티 게시판 「구역별 이야기」에도 그대로 나타난다.
//   · 비로그인은 읽기만 — 쓰기 칸을 누르면 로그인 창이 뜬다(읽기는 로그인 없이 가능).
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { CommunityPost } from "@/lib/community";
import { timeAgo, titleFromBody } from "@/lib/community";
import { createPost, fetchPosts } from "@/lib/community-client";

export default function ZoneTalk({ zoneId, zoneName }: { zoneId: string; zoneName: string }) {
  const { session, openAuth, version } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!zoneId) return;
    const res = await fetchPosts({ zoneId, limit: 3, tab: "zone" }, session);
    setPosts(res.items);
    setTotal(res.total);
    setLoading(false);
  }, [zoneId, session]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, version]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!session) {
      openAuth("login", "구역 이야기는 로그인한 회원만 남길 수 있습니다. 글 읽기는 로그인 없이도 됩니다.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await createPost(
      { category: "zone", title: titleFromBody(text), content: text, zoneId, zoneName },
      session
    );
    setBusy(false);
    if (!res.ok || !res.item) {
      setError(res.message ?? "글을 남기지 못했습니다.");
      return;
    }
    setDraft("");
    setPosts((prev) => [res.item as CommunityPost, ...prev].slice(0, 3));
    setTotal((t) => t + 1);
  };

  const moreHref = `/community?tab=zone&zoneId=${encodeURIComponent(zoneId)}&zoneName=${encodeURIComponent(zoneName)}`;

  return (
    <section aria-label="이 구역 이야기" className="rounded-xl border border-line bg-[#F7F9FB] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-bold text-slate-800">
          💬 이 구역 이야기{" "}
          <span className="font-extrabold text-brand">{loading ? "…" : total.toLocaleString()}</span>건
        </h3>
        <Link href={moreHref} className="shrink-0 text-[10.5px] font-bold text-brand hover:underline">
          커뮤니티에서 보기 →
        </Link>
      </div>

      {loading ? (
        <p className="py-2 text-[11px] text-slate-400">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="py-2 text-[11px] leading-relaxed text-slate-500">
          아직 이 구역에 올라온 이야기가 없습니다. 첫 소식을 남겨 보세요.
        </p>
      ) : (
        <ul className="space-y-1">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/community?post=${encodeURIComponent(p.id)}&zoneId=${encodeURIComponent(zoneId)}&zoneName=${encodeURIComponent(zoneName)}`}
                className="block rounded-lg bg-white px-2.5 py-1.5 transition-colors hover:bg-brand-tint"
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-ink">{p.title}</span>
                  <span className="shrink-0 text-[9.5px] text-slate-400">{timeAgo(p.createdAt)}</span>
                </span>
                <span className="mt-[1px] flex items-center gap-2 text-[9.5px] text-slate-500">
                  <span className="truncate">{p.authorNickname}</span>
                  <span className="shrink-0">🤍 {p.likesCount}</span>
                  <span className="shrink-0">💬 {p.commentsCount}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            if (!session) openAuth("login", "구역 이야기는 로그인한 회원만 남길 수 있습니다.");
          }}
          rows={1}
          maxLength={1000}
          placeholder={session ? `${zoneName} 소식·질문을 한 줄로` : "로그인하고 이 구역에 한마디"}
          className="min-h-[34px] flex-1 resize-none rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] leading-[1.5] outline-none placeholder:text-slate-400 focus:border-brand"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="h-[34px] shrink-0 rounded-lg bg-brand px-3 text-[11.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "…" : "등록"}
        </button>
      </div>
      {error && <p className="mt-1 text-[10.5px] text-rose-600">{error}</p>}
    </section>
  );
}
