// ─────────────────────────────────────────────────────────────────────────────
// /api/community/posts — 커뮤니티 게시글 목록(GET) · 새 글(POST)
//
//   GET  ?tab=latest|hot|free|zone & category= & zoneId= & q= & limit= & offset=
//        → { ok, items: CommunityPost[], total }
//        로그인 토큰을 함께 보내면 각 글의 liked(내가 눌렀는지)·mine(내 글인지)이 채워진다.
//   POST { category, title, content, zoneId?, zoneName? }  (Authorization: Bearer 필수)
//        → { ok, item: CommunityPost }
//
//   읽기는 누구나, 쓰기는 로그인한 회원만 — 토큰 확인은 lib/community-server.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import type { CommunityCategory, CommunityPost } from "@/lib/community";
import { LIMITS, postFromRow } from "@/lib/community";
import { ApiError, errorResponse, field, readJson, requireUser } from "@/lib/community-server";
import { sbCount, sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";
import { SUPABASE_URL } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SELECT = "select=id,user_id,author_nickname,zone_id,zone_name,category,title,content,likes_count,comments_count,created_at,updated_at";

/** 선택 토큰으로 사용자 id 만 확인한다(없거나 만료면 null — 읽기는 그대로 허용) */
async function optionalUserId(req: Request): Promise<string | null> {
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

export async function GET(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, items: [], total: 0, message: "DB가 준비되지 않았습니다." });
  }

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "latest";
  const category = url.searchParams.get("category") ?? "";
  const zoneId = (url.searchParams.get("zoneId") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const filters: string[] = [];
  if (zoneId) filters.push(`zone_id=eq.${encodeURIComponent(zoneId)}`);
  if (category === "free" || category === "zone" || category === "info" || category === "question") {
    filters.push(`category=eq.${category}`);
  }
  if (tab === "free") filters.push("zone_id=is.null");
  if (tab === "zone") filters.push("zone_id=not.is.null");
  // 검색어는 제목·본문·닉네임에서 찾는다(구역 이름도 포함)
  if (q) {
    const like = encodeURIComponent(`*${q.replace(/[%,()*]/g, " ").trim()}*`);
    filters.push(
      `or=(title.ilike.${like},content.ilike.${like},author_nickname.ilike.${like},zone_name.ilike.${like})`
    );
  }
  const where = filters.length ? filters.join("&") : "";

  const order =
    tab === "hot"
      ? "order=likes_count.desc,comments_count.desc,created_at.desc"
      : "order=created_at.desc";

  const query = [SELECT, where, order, `limit=${limit}`, `offset=${offset}`].filter(Boolean).join("&");

  const [rows, count] = await Promise.all([
    sbSelect<Record<string, unknown>>("community_posts", query),
    sbCount("community_posts", `select=id&${where}`),
  ]);

  if (!rows.ok) {
    return NextResponse.json({ ok: false, items: [], total: 0, message: rows.message }, { status: 502 });
  }

  const items = rows.rows.map((r) => {
    const post = postFromRow(r);
    return { ...post, userId: String(r.user_id ?? "") } as CommunityPost & { userId: string };
  });

  // 로그인 사용자면 좋아요 여부를 한 번에 채운다
  const viewerId = await optionalUserId(req);
  if (viewerId && items.length > 0) {
    const ids = items.map((p) => p.id).join(",");
    const liked = await sbSelect<{ post_id: string }>(
      "community_likes",
      `select=post_id&user_id=eq.${encodeURIComponent(viewerId)}&post_id=in.(${ids})`
    );
    if (liked.ok) {
      const set = new Set(liked.rows.map((r) => r.post_id));
      for (const p of items) p.liked = set.has(p.id);
    }
  }

  const clean = items.map((p) => {
    const { userId, ...rest } = p;
    return { ...rest, mine: viewerId ? userId === viewerId : undefined };
  });

  return NextResponse.json({
    ok: true,
    items: clean,
    total: count.ok ? count.count : clean.length,
  });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    const rawZoneId = typeof body.zoneId === "string" ? body.zoneId.trim() : "";
    const zoneName = typeof body.zoneName === "string" ? body.zoneName.trim().slice(0, 80) : "";
    const requested = typeof body.category === "string" ? body.category : "free";
    const category: CommunityCategory =
      requested === "info" || requested === "question" || requested === "zone" ? requested : "free";

    const title = field(body, "title", { min: LIMITS.titleMin, max: LIMITS.titleMax, label: "제목" });
    const content = field(body, "content", { min: LIMITS.bodyMin, max: LIMITS.bodyMax, label: "내용" });

    if (category === "zone" && !rawZoneId) throw new ApiError(400, "구역 글은 구역을 하나 골라 주세요.");

    const row = {
      id: crypto.randomUUID(),
      user_id: user.id,
      author_nickname: user.nickname,
      zone_id: rawZoneId || null,
      zone_name: rawZoneId ? zoneName || null : null,
      category,
      title,
      content,
    };

    const saved = await sbUpsert<Record<string, unknown>>("community_posts", [row], "id");
    if (!saved.ok) throw new ApiError(502, `글을 저장하지 못했습니다 — ${saved.message}`);

    const item = { ...postFromRow(saved.rows[0] ?? row), liked: false, mine: true };
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return errorResponse(e);
  }
}
