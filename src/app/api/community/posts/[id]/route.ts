// ─────────────────────────────────────────────────────────────────────────────
// /api/community/posts/[id] — 글 하나 읽기(GET) · 고치기(PATCH) · 지우기(DELETE)
//
//   GET   → { ok, item, comments: CommunityComment[] }
//           로그인 토큰이 있으면 item.liked·item.mine 이 채워진다.
//   PATCH { title?, content? }  — **본인 글만** (본문의 user_id 조건으로 확인)
//   DELETE                      — **본인 글만** (댓글·좋아요는 FK cascade 로 함께 지워진다)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { commentFromRow, LIMITS, postFromRow } from "@/lib/community";
import { ApiError, errorResponse, field, readJson, requireUser } from "@/lib/community-server";
import { sbDelete, sbSelect, sbUpdate, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const POST_COLS =
  "id,user_id,author_nickname,zone_id,zone_name,category,title,content,likes_count,comments_count,created_at,updated_at";

type Ctx = { params: Promise<{ id: string }> };

async function viewerId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() || token,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return body?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
  if (!supabaseConfigured()) throw new ApiError(503, "DB가 준비되지 않았습니다.");
  const { id } = await ctx.params;
  const pid = (id ?? "").trim();
  if (!pid) throw new ApiError(400, "글 주소가 올바르지 않습니다.");

  const [rows, comments] = await Promise.all([
    sbSelect<Record<string, unknown>>("community_posts", `select=${POST_COLS}&id=eq.${encodeURIComponent(pid)}&limit=1`),
    sbSelect<Record<string, unknown>>(
      "community_comments",
      `select=id,post_id,user_id,author_nickname,content,created_at&post_id=eq.${encodeURIComponent(pid)}&order=created_at.asc&limit=200`
    ),
  ]);
  if (!rows.ok) throw new ApiError(502, rows.message);
  if (rows.rows.length === 0) throw new ApiError(404, "글을 찾을 수 없습니다.");

  const viewer = await viewerId(req);
  const row = rows.rows[0];
  const post = {
    ...postFromRow(row),
    mine: viewer ? String(row.user_id ?? "") === viewer : undefined,
    liked: undefined as boolean | undefined,
  };

  if (viewer) {
    const liked = await sbSelect<{ post_id: string }>(
      "community_likes",
      `select=post_id&post_id=eq.${encodeURIComponent(pid)}&user_id=eq.${encodeURIComponent(viewer)}&limit=1`
    );
    post.liked = liked.ok && liked.rows.length > 0;
  }

  const list = comments.ok
    ? comments.rows.map((c) => {
        const item = commentFromRow(c);
        return viewer ? { ...item, mine: String(c.user_id ?? "") === viewer } : item;
      })
    : [];

  return NextResponse.json({ ok: true, item: post, comments: list });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const pid = (id ?? "").trim();
    if (!pid) throw new ApiError(400, "글 주소가 올바르지 않습니다.");
    const body = await readJson(req);

    const patch: Record<string, string> = {};
    if (typeof body.title === "string") {
      patch.title = field(body, "title", { min: LIMITS.titleMin, max: LIMITS.titleMax, label: "제목" });
    }
    if (typeof body.content === "string") {
      patch.content = field(body, "content", { min: LIMITS.bodyMin, max: LIMITS.bodyMax, label: "내용" });
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "고칠 내용이 없습니다.");

    const res = await sbUpdate<Record<string, unknown>>(
      "community_posts",
      `id=eq.${encodeURIComponent(pid)}&user_id=eq.${encodeURIComponent(user.id)}`,
      patch
    );
    if (!res.ok) throw new ApiError(502, res.message);
    if (res.rows.length === 0) throw new ApiError(403, "본인 글만 고칠 수 있습니다.");

    return NextResponse.json({ ok: true, item: postFromRow(res.rows[0]) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const pid = (id ?? "").trim();
    if (!pid) throw new ApiError(400, "글 주소가 올바르지 않습니다.");

    const res = await sbDelete<{ id: string }>(
      "community_posts",
      `id=eq.${encodeURIComponent(pid)}&user_id=eq.${encodeURIComponent(user.id)}`
    );
    if (!res.ok) throw new ApiError(502, res.message);
    if (res.rows.length === 0) throw new ApiError(403, "본인 글만 지울 수 있습니다.");
    return NextResponse.json({ ok: true, deleted: pid });
  } catch (e) {
    return errorResponse(e);
  }
}
