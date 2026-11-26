// ─────────────────────────────────────────────────────────────────────────────
// /api/listing-social/comments — 매물 댓글 목록(GET) · 새 댓글(POST)
//
//   GET  ?listingId=<매물 id>   → { ok, ready, items: ListingComment[] }
//   POST { listingId, content } → { ok, item }   (로그인 필수 — 커뮤니티와 같은 정책)
//   · 비로그인은 목록만 볼 수 있고, 쓰기는 로그인 창으로 안내한다(화면 담당).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";
import { COMMENT_MAX } from "@/lib/listing-social";
import { ApiError, errorResponse, field, readJson, requireUser } from "@/lib/community-server";
import {
  attachVid,
  cleanListingId,
  commentFromRow,
  inFilter,
  myKeys,
  socialReady,
  voterOf,
} from "@/lib/listing-social-server";

export const dynamic = "force-dynamic";

const COMMENT_COLS = "id,listing_id,user_id,author_nickname,content,created_at,hidden";

export async function GET(req: Request) {
  try {
    const voter = await voterOf(req);
    const listingId = cleanListingId(new URL(req.url).searchParams.get("listingId"));
    if (!listingId) throw new ApiError(400, "어느 매물의 댓글인지 확인하지 못했습니다.");
    if (!supabaseConfigured() || !(await socialReady())) {
      return attachVid(NextResponse.json({ ok: true, ready: false, items: [] }), voter);
    }

    const res = await sbSelect<Record<string, unknown>>(
      "listing_comments",
      `select=${COMMENT_COLS}&listing_id=eq.${encodeURIComponent(
        listingId
      )}&hidden=eq.false&order=created_at.asc&limit=200`
    );
    if (!res.ok) throw new ApiError(502, `댓글을 불러오지 못했습니다 — ${res.message}`);

    // 신고 횟수는 따로 모아 붙인다(댓글 수가 적어 한 번 더 읽는 편이 단순하다)
    const ids = res.rows.map((r) => String(r.id ?? "")).filter(Boolean);
    const reports = new Map<string, number>();
    if (ids.length > 0) {
      const rep = await sbSelect<{ comment_id: string; cnt: number }>(
        "listing_comment_report_counts",
        `select=comment_id,cnt&comment_id=${inFilter(ids)}`
      );
      if (rep.ok) for (const row of rep.rows) reports.set(row.comment_id, Number(row.cnt) || 0);
    }

    const myIds = [voter.userId].filter((v): v is string => Boolean(v));
    const items = res.rows.map((row) =>
      commentFromRow({ ...row, reports: reports.get(String(row.id ?? "")) ?? 0 }, myIds)
    );
    return attachVid(NextResponse.json({ ok: true, ready: true, items }), voter);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const voter = await voterOf(req);
    // 로그인 확인을 먼저 한다 — 비회원에게는 '로그인이 필요합니다'(401)로 답한다
    const user = await requireUser(req);
    const body = await readJson(req);
    const listingId = cleanListingId(body.listingId);
    if (!listingId) throw new ApiError(400, "어느 매물의 댓글인지 확인하지 못했습니다.");
    const content = field(body, "content", { min: 1, max: COMMENT_MAX, label: "댓글" });

    if (!supabaseConfigured() || !(await socialReady())) {
      return attachVid(
        NextResponse.json(
          { ok: false, ready: false, message: "매물 댓글 기능을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요." },
          { status: 409 }
        ),
        voter
      );
    }

    const row = {
      id: crypto.randomUUID(),
      listing_id: listingId,
      user_id: user.id,
      author_nickname: user.nickname,
      content,
    };
    const saved = await sbUpsert<Record<string, unknown>>("listing_comments", [row], "id");
    if (!saved.ok) throw new ApiError(502, `댓글을 저장하지 못했습니다 — ${saved.message}`);

    const item = commentFromRow(saved.rows[0] ?? row, [user.id]);
    return attachVid(NextResponse.json({ ok: true, ready: true, item }), voter);
  } catch (e) {
    return errorResponse(e);
  }
}
