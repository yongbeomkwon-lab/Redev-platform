// ─────────────────────────────────────────────────────────────────────────────
// /api/community/comments/[id] — 내 댓글 지우기(DELETE)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/community-server";
import { sbDelete } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const cid = (id ?? "").trim();
    if (!cid) throw new ApiError(400, "댓글 주소가 올바르지 않습니다.");

    const res = await sbDelete<{ id: string }>(
      "community_comments",
      `id=eq.${encodeURIComponent(cid)}&user_id=eq.${encodeURIComponent(user.id)}`
    );
    if (!res.ok) throw new ApiError(502, res.message);
    if (res.rows.length === 0) throw new ApiError(403, "본인 댓글만 지울 수 있습니다.");
    return NextResponse.json({ ok: true, deleted: cid });
  } catch (e) {
    return errorResponse(e);
  }
}
