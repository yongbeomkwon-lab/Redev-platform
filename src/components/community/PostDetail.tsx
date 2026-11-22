"use client";
// ─────────────────────────────────────────────────────────────────────────────
// PostDetail — 글 상세 + 댓글 (2026-11-22)
//   · 목록 카드를 누르면 이 창이 열린다. 주소에 ?post=<id> 가 붙어 공유·새로고침에도 유지된다.
//   · 본인 글은 고치기·지우기가 보이고, 댓글도 본인 것만 지울 수 있다.
//   · 구역 글이면 「지도에서 보기」(/?zone=<id>) 로 그 구역을 바로 연다.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { CommunityComment, CommunityPost } from "@/lib/community";
import { CATEGORY_CHIP, CATEGORY_LABEL, timeAgo } from "@/lib/community";
import { addComment, fetchPost, removeComment, removePost, toggleLike, updatePost } from "@/lib/community-client";

export default function PostDetail({
  postId,
  seed,
  onClose,
  onChanged,
}: {
  postId: string;
  seed?: CommunityPost | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session, openAuth } = useAuth();
  const [post, setPost] = useState<CommunityPost | null>(seed ?? null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const load = useCallback(async () => {
    const res = await fetchPost(postId, session);
    if (!res.ok || !res.item) {
      setError(res.message ?? "글을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setPost(res.item);
    setComments(res.comments ?? []);
    setError("");
    setLoading(false);
  }, [postId, session]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const like = async () => {
    if (!post) return;
    if (!session) {
      openAuth("login", "좋아요는 로그인한 회원만 누를 수 있습니다.");
      return;
    }
    const res = await toggleLike(post.id, session);
    if (res.ok) {
      setPost({
        ...post,
        liked: Boolean(res.liked),
        likesCount:
          typeof res.likesCount === "number"
            ? res.likesCount
            : res.liked
              ? post.likesCount + 1
              : Math.max(0, post.likesCount - 1),
      });
      onChanged();
    }
  };

  const submitComment = async () => {
    if (!post) return;
    if (!session) {
      openAuth("login", "댓글은 로그인한 회원만 쓸 수 있습니다.");
      return;
    }
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await addComment(post.id, text, session);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "댓글을 남기지 못했습니다.");
      return;
    }
    if (res.item) setComments((list) => [...list, res.item as CommunityComment]);
    setDraft("");
    setPost({ ...post, commentsCount: typeof res.commentsCount === "number" ? res.commentsCount : post.commentsCount + 1 });
    onChanged();
  };

  const startEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditBody(post.content);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!post || busy) return;
    setBusy(true);
    const res = await updatePost(post.id, { title: editTitle, content: editBody }, session);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "고치지 못했습니다.");
      return;
    }
    setPost({ ...post, title: editTitle.trim(), content: editBody.trim() });
    setEditing(false);
    onChanged();
  };

  const destroy = async () => {
    if (!post) return;
    if (!window.confirm("이 글을 지울까요? 댓글도 함께 지워집니다.")) return;
    const res = await removePost(post.id, session);
    if (!res.ok) {
      setError(res.message ?? "지우지 못했습니다.");
      return;
    }
    onChanged();
    onClose();
  };

  const destroyComment = async (id: string) => {
    const res = await removeComment(id, session);
    if (!res.ok) return;
    setComments((list) => list.filter((c) => c.id !== id));
    if (post) setPost({ ...post, commentsCount: Math.max(0, post.commentsCount - 1) });
    onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-[#0b1725]/45 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[86vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="글 상세"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {post && (
              <>
                <span className={`rounded px-1.5 py-[2px] text-[10px] font-bold ${CATEGORY_CHIP[post.category]}`}>
                  {CATEGORY_LABEL[post.category]}
                </span>
                {post.zoneName && (
                  <span className="max-w-[180px] truncate rounded-full border border-brand/25 bg-brand-tint px-2 py-[2px] text-[10.5px] font-bold text-brand">
                    📍 {post.zoneName}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-[18px] leading-none text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          {loading && !post && <p className="py-8 text-center text-[12px] text-slate-400">불러오는 중…</p>}
          {error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>}

          {post && (
            <>
              {editing ? (
                <div className="space-y-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-[14px] font-bold outline-none focus:border-brand"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-line px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-brand"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={busy}
                      className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-deep"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-bold text-slate-600"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-[17px] font-extrabold leading-[1.4] tracking-[-0.03em] text-ink">{post.title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{post.authorNickname}</span>
                    <span>{timeAgo(post.createdAt)}</span>
                    {post.zoneId && (
                      <a
                        href={`/?zone=${encodeURIComponent(post.zoneId)}`}
                        className="font-bold text-brand hover:underline"
                      >
                        지도에서 보기 →
                      </a>
                    )}
                    {post.mine && (
                      <span className="ml-auto flex gap-1.5">
                        <button type="button" onClick={startEdit} className="font-bold text-slate-500 hover:text-brand">
                          수정
                        </button>
                        <button type="button" onClick={destroy} className="font-bold text-slate-400 hover:text-rose-600">
                          삭제
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-[1.75] text-slate-800">{post.content}</p>

                  <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5">
                    <button
                      type="button"
                      onClick={like}
                      aria-pressed={Boolean(post.liked)}
                      className={
                        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold transition-colors " +
                        (post.liked ? "bg-rose-50 text-rose-600" : "border border-line text-slate-600 hover:border-rose-200")
                      }
                    >
                      <span aria-hidden>{post.liked ? "❤️" : "🤍"}</span>
                      좋아요 {post.likesCount}
                    </button>
                    <span className="text-[12px] text-slate-500">💬 댓글 {post.commentsCount}</span>
                  </div>
                </>
              )}

              {/* 댓글 */}
              <div className="mt-4">
                <h3 className="mb-1.5 text-[12px] font-bold text-slate-700">댓글 {comments.length}</h3>
                <ul className="space-y-1.5">
                  {comments.map((c) => (
                    <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
                        <b className="font-bold text-slate-700">{c.authorNickname}</b>
                        <span>{timeAgo(c.createdAt)}</span>
                        {c.mine && (
                          <button
                            type="button"
                            onClick={() => destroyComment(c.id)}
                            className="ml-auto font-bold text-slate-400 hover:text-rose-600"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-[1.65] text-slate-800">{c.content}</p>
                    </li>
                  ))}
                  {comments.length === 0 && (
                    <li className="rounded-lg bg-slate-50 px-3 py-3 text-center text-[11.5px] text-slate-400">
                      첫 댓글을 남겨 보세요.
                    </li>
                  )}
                </ul>

                <div className="mt-2.5 flex items-end gap-1.5">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder={session ? "댓글을 남겨 보세요" : "댓글은 로그인 후 쓸 수 있습니다"}
                    onFocus={() => {
                      if (!session) openAuth("login", "댓글은 로그인한 회원만 쓸 수 있습니다.");
                    }}
                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-line px-3 py-2 text-[12.5px] outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={busy || !draft.trim()}
                    className="h-[44px] shrink-0 rounded-lg bg-brand px-3 text-[12.5px] font-bold text-white hover:bg-brand-deep disabled:opacity-50"
                  >
                    등록
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
