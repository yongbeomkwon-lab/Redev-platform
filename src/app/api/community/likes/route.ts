// ─────────────────────────────────────────────────────────────────────────────
// /api/community/likes — 좋아요 토글 (1인 1좋아요)
//
//   POST { postId }
//        → { ok, liked: boolean, likesCount: number }
//        이미 누른 글이면 취소, 아니면 추가. 카운트는 DB 트리거가 다시 센다.
//   로그인한 회원만 — 토큰 확인은 lib/community-server.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { ApiError, errorResponse, field, readJson, requireUser } from "@/lib/community-server";
import { sbDelete, sbSelect, supabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!supabaseConfigured()) throw new ApiError(503, "DB가 준비되지 않았습니다.");
    const user = await requireUser(req);
    const body = await readJson(req);
    const postId = field(body, "postId", { min: 8, max: 64, label: "글 주소" });

    const exists = await sbSelect<{ id: string }>(
      "community_posts",
      `select=id&id=eq.${encodeURIComponent(postId)}&limit=1`
    );
    if (!exists.ok) throw new ApiError(502, exists.message);
    if (exists.rows.length === 0) throw new ApiError(404, "글을 찾을 수 없습니다.");

    const mine = await sbSelect<{ post_id: string }>(
      "community_likes",
      `select=post_id&post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
    );
    const already = mine.ok && mine.rows.length > 0;

    if (already) {
      const del = await sbDelete<{ post_id: string }>(
        "community_likes",
        `post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`
      );
      if (!del.ok) throw new ApiError(502, del.message);
    } else {
      // PostgREST 삽입 — 복합키(post_id,user_id)
      const res = await fetch(
        `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "")}/rest/v1/community_likes`,
        {
          method: "POST",
          headers: {
            apikey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
            Authorization: `Bearer ${(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()}`,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: JSON.stringify([{ post_id: postId, user_id: user.id }]),
          cache: "no-store",
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(502, `좋아요를 저장하지 못했습니다 — ${text.slice(0, 160) || res.status}`);
      }
    }

    const count = await sbSelect<{ likes_count: number }>(
      "community_posts",
      `select=likes_count&id=eq.${encodeURIComponent(postId)}&limit=1`
    );
    return NextResponse.json({
      ok: true,
      liked: !already,
      likesCount: count.ok && count.rows[0] ? Number(count.rows[0].likes_count) || 0 : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
