// ─────────────────────────────────────────────────────────────────────────────
// /api/listing-social — 매물 여러 건의 소통 상태(반응 수·내 반응·댓글 수) 한 번에
//
//   GET ?ids=rfine-1,rfine-2 → { ok, ready, items: ListingSocial[] }
//     · 목록 화면은 카드가 많으므로 매물 id 를 모아 한 번만 부른다.
//     · 비회원은 응답과 함께 rdv_vid 쿠키를 받아 '내가 누른 반응'을 이어서 본다.
//     · 스키마(supabase/listing-social.sql)가 아직 없으면 ready:false — 화면은 '준비 중'.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sbSelect, supabaseConfigured } from "@/lib/supabase-server";
import type { ListingSocial, ReactionKind } from "@/lib/listing-social";
import { isReactionKind } from "@/lib/listing-social";
import {
  attachVid,
  inFilter,
  makeSocial,
  myKeys,
  parseIds,
  socialReady,
  voterOf,
} from "@/lib/listing-social-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const voter = await voterOf(req);
  const ids = parseIds(new URL(req.url).searchParams.get("ids"));

  if (ids.length === 0 || !supabaseConfigured()) {
    return attachVid(NextResponse.json({ ok: true, ready: true, items: [] }), voter);
  }
  if (!(await socialReady())) {
    return attachVid(NextResponse.json({ ok: true, ready: false, items: [] }), voter);
  }

  const filter = inFilter(ids);
  const keys = myKeys(voter);
  const [countsRes, mineRes, commentRes] = await Promise.all([
    sbSelect<{ listing_id: string; reaction: string; cnt: number }>(
      "listing_reaction_counts",
      `select=listing_id,reaction,cnt&listing_id=${filter}`
    ),
    sbSelect<{ listing_id: string; reaction: string }>(
      "listing_reactions",
      `select=listing_id,reaction&listing_id=${filter}&voter_key=in.(${keys
        .map((k) => encodeURIComponent(k))
        .join(",")})`
    ),
    sbSelect<{ listing_id: string; cnt: number }>(
      "listing_comment_counts",
      `select=listing_id,cnt&listing_id=${filter}`
    ),
  ]);

  const map = new Map<string, ListingSocial>(ids.map((id) => [id, makeSocial(id)]));

  if (countsRes.ok) {
    for (const row of countsRes.rows) {
      const item = map.get(row.listing_id);
      if (!item || !isReactionKind(row.reaction)) continue;
      item.counts[row.reaction as ReactionKind] = Number(row.cnt) || 0;
    }
  }
  if (mineRes.ok) {
    for (const row of mineRes.rows) {
      const item = map.get(row.listing_id);
      if (!item || !isReactionKind(row.reaction)) continue;
      item.mine[row.reaction as ReactionKind] = true;
    }
  }
  if (commentRes.ok) {
    for (const row of commentRes.rows) {
      const item = map.get(row.listing_id);
      if (item) item.commentCount = Number(row.cnt) || 0;
    }
  }

  // 집계 뷰를 못 읽었으면(권한·스키마 문제) 0 으로 답하되 ready 는 유지한다
  return attachVid(
    NextResponse.json({ ok: true, ready: true, items: Array.from(map.values()) }),
    voter
  );
}
