"use client";
// ─────────────────────────────────────────────────────────────────────────────
// PostCard — 커뮤니티 목록의 글 한 장 (2026-11-22)
//   카테고리 칩 · 구역 태그(누르면 그 구역 글만 모아 보기) · 닉네임 · 작성시간
//   · 좋아요/댓글 수. 좋아요는 로그인한 회원만 — 비로그인은 로그인 창을 띄운다.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CATEGORY_CHIP, CATEGORY_LABEL, timeAgo } from "@/lib/community";
import type { CommunityPost } from "@/lib/community";
import { toggleLike } from "@/lib/community-client";

export default function PostCard({
  post,
  onOpen,
  onZone,
}: {
  post: CommunityPost;
  onOpen: (post: CommunityPost) => void;
  onZone?: (zoneId: string, zoneName: string) => void;
}) {
  const { session, openAuth } = useAuth();
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [likes, setLikes] = useState(post.likesCount);
  const [busy, setBusy] = useState(false);

  const like = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      openAuth("login", "좋아요는 로그인한 회원만 누를 수 있습니다. 10초면 가입됩니다.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const res = await toggleLike(post.id, session);
    setBusy(false);
    if (res.ok) {
      setLiked(Boolean(res.liked));
      setLikes(typeof res.likesCount === "number" ? res.likesCount : res.liked ? likes + 1 : Math.max(0, likes - 1));
    }
  };

  return (
    <article className="rounded-xl border border-line bg-white p-3.5 transition-colors hover:border-brand/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-[2px] text-[10px] font-bold ${CATEGORY_CHIP[post.category]}`}>
          {CATEGORY_LABEL[post.category]}
        </span>
        {post.zoneId && post.zoneName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZone?.(post.zoneId as string, post.zoneName as string);
            }}
            title="이 구역 글만 모아 보기"
            className="max-w-[190px] truncate rounded-full border border-brand/25 bg-brand-tint px-2 py-[2px] text-[10.5px] font-bold text-brand hover:border-brand/60"
          >
            📍 {post.zoneName}
          </button>
        )}
        <span className="ml-auto shrink-0 text-[10.5px] text-slate-400">{timeAgo(post.createdAt)}</span>
      </div>

      <button type="button" onClick={() => onOpen(post)} className="mt-1.5 block w-full text-left">
        <h3 className="text-[14.5px] font-extrabold leading-[1.4] tracking-[-0.02em] text-ink hover:text-brand">
          {post.title}
        </h3>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-slate-600">
          {post.content}
        </p>
      </button>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1 font-medium text-slate-600">
          <span className="grid h-[15px] w-[15px] place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
            {post.authorNickname.slice(0, 1)}
          </span>
          {post.authorNickname}
        </span>
        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          className={
            "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors " +
            (liked ? "bg-rose-50 text-rose-600" : "hover:bg-slate-100")
          }
        >
          <span aria-hidden>{liked ? "❤️" : "🤍"}</span>
          {likes}
        </button>
        <button
          type="button"
          onClick={() => onOpen(post)}
          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-slate-100"
        >
          <span aria-hidden>💬</span>
          {post.commentsCount}
        </button>
      </div>
    </article>
  );
}
