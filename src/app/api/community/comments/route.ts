// ─────────────────────────────────────────────────────────────────────────────
// /api/community/comments — 댓글 목록(GET) · 새 댓글(POST)
//
//   GET  ?postId=<글 id>            → { ok, items: CommunityComment[], total }
//   POST { postId, content }        → { ok, item, commentsCount }   (로그인 필수)
//        댓글 수는 DB 트리거가 community_posts.comments_count 를 다시 세고,
//        여기서는 그 최신 값을 돌려준다.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { commentFromRow, LIMITS } from "@/lib/community";
import { ApiError, errorResponse, field, readJson, requireUser } from "@/lib/community-server";
import { sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ ok: true, items: [], total: 0 });
    const postId = (new URL(req.url).searchParams.get("postId") ?? "").trim();
    if (!postId) throw new ApiError(400, "글 주소가 필요합니다.");

    const res = await sbSelect<Record<string, unknown>>(
      "community_comments",
      `select=id,post_id,author_nickname,content,created_at&post_id=eq.${encodeURIComponent(
        postId
      )}&order=created_at.asc&limit=200`
    );
    if (!res.ok) throw new ApiError(502, res.message);
    const items = res.rows.map((r) => commentFromRow(r));
    return NextResponse.json({ ok: true, items, total: items.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const postId = field(body, "postId", { min: 8, max: 64, label: "글 주소" });
    const content = field(body, "content", { min: 1, max: LIMITS.commentMax, label: "댓글" });

    // 글 존재 여부 먼저 확인 — 없는 글에 댓글이 붙는 것을 막는다
    const exists = await sbSelect<{ id: string }>(
      "community_posts",
      `select=id&id=eq.${encodeURIComponent(postId)}&limit=1`
    );
    if (!exists.ok) throw new ApiError(502, exists.message);
    if (exists.rows.length === 0) throw new ApiError(404, "글을 찾을 수 없습니다.");

    const row = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: user.id,
      author_nickname: user.nickname,
      content,
    };
    const saved = await sbUpsert<Record<string, unknown>>("community_comments", [row], "id");
    if (!saved.ok) throw new ApiError(502, `댓글을 저장하지 못했습니다 — ${saved.message}`);

    const count = await sbSelect<{ comments_count: number }>(
      "community_posts",
      `select=comments_count&id=eq.${encodeURIComponent(postId)}&limit=1`
    );

    return NextResponse.json({
      ok: true,
      item: { ...commentFromRow(saved.rows[0] ?? row), mine: true },
      commentsCount: count.ok && count.rows[0] ? Number(count.rows[0].comments_count) || 0 : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
