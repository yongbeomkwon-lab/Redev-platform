"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ListingSocial — 매물 카드에 붙는 「반응 + 댓글」 한 줄 (2026-11-26)
//
//   · 접힌 상태: 👍 좋아요 · 😮 놀람 · 🔥 관심 + 💬 댓글 N (카드가 지저분해지지 않게)
//   · 펼친 상태: 댓글 목록 · 새 댓글 쓰기 · 내 댓글 삭제 · 신고
//   · 반응은 로그인 없이도 누를 수 있고(기기 단위 1개), 댓글은 로그인 후 쓴다
//     — 커뮤니티(/community)와 같은 정책이다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { timeAgo } from "@/lib/community";
import type { ListingComment, ReactionKind } from "@/lib/listing-social";
import { COMMENT_MAX, COMMENT_NOTICE, REACTIONS } from "@/lib/listing-social";
import {
  deleteListingComment,
  fetchListingComments,
  postListingComment,
  reportListingComment,
  toggleListingReaction,
  useListingSocial,
} from "@/lib/listing-social-client";

export default function ListingSocial({
  listingId,
  tone = "plain",
}: {
  listingId: string;
  /** amber = 구역 패널의 매물 카드(노란 배경) 안에서 쓸 때 */
  tone?: "plain" | "amber";
}) {
  const { session, openAuth } = useAuth();
  const social = useListingSocial(listingId);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<ListingComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState("");

  const counts = social?.counts;
  const mine = social?.mine;

  // 펼칠 때만 댓글을 읽는다 (목록 화면에서 카드가 수십 장이어도 요청은 한 번)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetchListingComments(listingId, session).then((res) => {
      if (!alive) return;
      setComments(res.items);
      setNotice(res.ready === false ? "매물 댓글 기능을 준비하고 있습니다." : "");
      if (!res.ok && res.message) setMsg(res.message);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, listingId, session]);

  async function react(kind: ReactionKind) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    const res = await toggleListingReaction(listingId, kind, session);
    setBusy(false);
    if (!res.ok) setMsg(res.message ?? "반응을 저장하지 못했습니다.");
  }

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    if (!session) {
      openAuth("login", "매물 댓글은 로그인 후 남길 수 있습니다.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await postListingComment(listingId, body, session);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.message ?? "댓글을 남기지 못했습니다.");
      return;
    }
    if (res.item) setComments((prev) => [...(prev ?? []), res.item as ListingComment]);
    setDraft("");
  }

  async function remove(comment: ListingComment) {
    if (!session || busy) return;
    if (typeof window !== "undefined" && !window.confirm("이 댓글을 지울까요?")) return;
    setBusy(true);
    const res = await deleteListingComment(listingId, comment.id, session);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.message ?? "댓글을 지우지 못했습니다.");
      return;
    }
    setComments((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
  }

  async function report(comment: ListingComment) {
    if (typeof window !== "undefined" && !window.confirm("이 댓글을 신고할까요? 운영자가 확인합니다.")) return;
    const res = await reportListingComment(comment.id, session);
    setMsg(res.ok ? "신고가 접수되었습니다. 운영자가 확인합니다." : res.message ?? "신고를 접수하지 못했습니다.");
  }

  const barBorder = tone === "amber" ? "border-amber-300" : "border-slate-300";
  const barText = tone === "amber" ? "text-amber-900" : "text-slate-600";

  return (
    <div data-testid="listing-social" data-listing-id={listingId} className="mt-2">
      <div className="flex flex-wrap items-center gap-1">
        {REACTIONS.map((r) => {
          const active = mine?.[r.kind] ?? false;
          const count = counts?.[r.kind] ?? 0;
          return (
            <button
              key={r.kind}
              type="button"
              onClick={() => react(r.kind)}
              aria-pressed={active}
              aria-label={`${r.label} ${count}명`}
              data-testid={`listing-reaction-${r.kind}`}
              className={
                "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition " +
                (active
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : `bg-white ${barBorder} ${barText} hover:border-slate-500`)
              }
            >
              <span aria-hidden>{r.emoji}</span>
              <span className="tabular-nums">{count > 0 ? count : r.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`listing-social-panel-${listingId}`}
          data-testid="listing-social-toggle"
          className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-500"
        >
          <span aria-hidden>💬</span>
          <span>댓글 {social?.commentCount ?? 0}</span>
          <span aria-hidden className="text-slate-400">
            {open ? "▴" : "▾"}
          </span>
        </button>
      </div>

      {open && (
        <div
          id={`listing-social-panel-${listingId}`}
          data-testid="listing-social-panel"
          className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2"
        >
          <p className="text-[10px] leading-snug text-slate-500">{COMMENT_NOTICE}</p>

          {loading ? (
            <p className="py-2 text-[11px] text-slate-400">댓글을 불러오는 중…</p>
          ) : comments && comments.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {comments.map((c) => (
                <li key={c.id} data-testid="listing-comment" className="rounded-md bg-white px-2 py-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <b className="text-[11px] font-bold text-slate-800">{c.authorNickname}</b>
                    <span className="text-[10px] text-slate-400">{timeAgo(c.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {c.mine && (
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          className="text-[10px] text-slate-400 underline hover:text-slate-700"
                        >
                          삭제
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => report(c)}
                        className="rounded border border-slate-200 px-1 py-0.5 text-[9px] text-slate-400 hover:border-slate-400 hover:text-slate-600"
                      >
                        신고
                      </button>
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-700">
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-[11px] text-slate-400">
              {notice || "아직 댓글이 없습니다. 이 매물에 대한 생각을 한 줄 남겨 보세요."}
            </p>
          )}

          {session ? (
            <div className="mt-2 flex items-end gap-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
                rows={2}
                placeholder={`${session.user.nickname}님의 생각을 남겨 주세요`}
                aria-label="매물 댓글"
                data-testid="listing-comment-input"
                className="min-h-[38px] flex-1 resize-y rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-snug focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || draft.trim().length === 0}
                data-testid="listing-comment-submit"
                className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:bg-slate-300 hover:bg-blue-700"
              >
                등록
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAuth("login", "매물 댓글은 로그인 후 남길 수 있습니다.")}
              data-testid="listing-comment-login"
              className="mt-2 w-full rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
            >
              로그인하고 댓글 쓰기
            </button>
          )}

          {msg && <p className="mt-1 text-[10px] font-semibold text-rose-600">{msg}</p>}
        </div>
      )}

      {/* 반응 버튼을 눌렀는데 저장이 안 됐을 때(기능 준비 중 포함) 접힌 상태에서도 바로 보이게 */}
      {!open && msg && (
        <p data-testid="listing-social-message" className="mt-1 text-[10px] font-semibold text-rose-600">
          {msg}
        </p>
      )}
    </div>
  );
}
