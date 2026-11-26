// ─────────────────────────────────────────────────────────────────────────────
// /api/listing-social/comments/[id] — 내가 쓴 매물 댓글 삭제
//
//   DELETE → { ok, deleted: id }   (로그인 필수 · 본인 댓글만)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sbDelete, sbSelect, supabaseConfigured } from "@/lib/supabase-server";
import { ApiError, errorResponse, requireUser } from "@/lib/community-server";
import { socialReady } from "@/lib/listing-social-server";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const commentId = (id ?? "").trim();
    if (!commentId) throw new ApiError(400, "댓글 주소가 필요합니다.");
    if (!supabaseConfigured() || !(await socialReady())) {
      throw new ApiError(409, "매물 댓글 기능을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.");
    }

    const found = await sbSelect<{ id: string; user_id: string | null }>(
      "listing_comments",
      `select=id,user_id&id=eq.${encodeURIComponent(commentId)}&limit=1`
    );
    if (!found.ok) throw new ApiError(502, found.message);
    const row = found.rows[0];
    if (!row) throw new ApiError(404, "이미 지운 댓글입니다.");
    if (row.user_id !== user.id) throw new ApiError(403, "내가 쓴 댓글만 지울 수 있습니다.");

    const del = await sbDelete("listing_comments", `id=eq.${encodeURIComponent(commentId)}`);
    if (!del.ok) throw new ApiError(502, `댓글을 지우지 못했습니다 — ${del.message}`);
    return NextResponse.json({ ok: true, deleted: commentId });
  } catch (e) {
    return errorResponse(e);
  }
}
