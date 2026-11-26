// ─────────────────────────────────────────────────────────────────────────────
// /api/listing-social/report — 매물 댓글 신고 (공인중개사법 제33조 제2항 대응)
//
//   POST { commentId, reason? } → { ok, reports }
//   · 신고는 로그인 없이도 할 수 있게 두되, 같은 댓글을 같은 사람이 두 번 신고하면 1건.
//   · 신고가 쌓인 댓글의 숨김 여부는 운영자 판단 몫으로 남긴다(자동 삭제하지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";
import { ApiError, errorResponse, readJson } from "@/lib/community-server";
import { attachVid, socialReady, voterOf } from "@/lib/listing-social-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const voter = await voterOf(req);
    const body = await readJson(req);
    const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
    if (!commentId) throw new ApiError(400, "신고할 댓글을 확인하지 못했습니다.");
    if (!supabaseConfigured() || !(await socialReady())) {
      throw new ApiError(409, "매물 댓글 기능을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.");
    }

    const found = await sbSelect<{ id: string }>(
      "listing_comments",
      `select=id&id=eq.${encodeURIComponent(commentId)}&limit=1`
    );
    if (!found.ok) throw new ApiError(502, found.message);
    if (found.rows.length === 0) throw new ApiError(404, "이미 지워진 댓글입니다.");

    const saved = await sbUpsert<Record<string, unknown>>(
      "listing_comment_reports",
      [{ comment_id: commentId, reporter_key: voter.key, reason: reason || null }],
      "comment_id,reporter_key"
    );
    if (!saved.ok) throw new ApiError(502, `신고를 접수하지 못했습니다 — ${saved.message}`);

    const count = await sbSelect<{ cnt: number }>(
      "listing_comment_report_counts",
      `select=cnt&comment_id=eq.${encodeURIComponent(commentId)}&limit=1`
    );
    const reports = count.ok && count.rows[0] ? Number(count.rows[0].cnt) || 0 : 1;
    return attachVid(NextResponse.json({ ok: true, reports }), voter);
  } catch (e) {
    return errorResponse(e);
  }
}
