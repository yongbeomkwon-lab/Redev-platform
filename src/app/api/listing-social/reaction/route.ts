// ─────────────────────────────────────────────────────────────────────────────
// /api/listing-social/reaction — 매물 감정 반응 누르기/취소(토글)
//
//   POST { listingId, reaction: "like"|"wow"|"fire" }
//     → { ok, active, counts, mine }
//   · 로그인 회원은 회원 id 로, 비회원은 쿠키(rdv_vid) 로 사람을 구분한다 → 1인 1반응.
//   · 같은 버튼을 다시 누르면 취소된다. 응답은 그 매물의 최신 카운트를 그대로 돌려준다.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sbDelete, sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";
import type { ReactionKind } from "@/lib/listing-social";
import { emptyCounts, emptyMine, isReactionKind } from "@/lib/listing-social";
import {
  attachVid,
  cleanListingId,
  myKeys,
  socialReady,
  voterOf,
} from "@/lib/listing-social-server";

export const dynamic = "force-dynamic";

const NOT_READY = {
  ok: false,
  ready: false,
  message: "매물 댓글·반응 기능을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.",
};

export async function POST(req: Request) {
  const voter = await voterOf(req);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const listingId = cleanListingId(body.listingId);
  const reaction = body.reaction;
  if (!listingId || !isReactionKind(reaction)) {
    return NextResponse.json(
      { ok: false, message: "어느 매물에 어떤 반응인지 확인하지 못했습니다." },
      { status: 400 }
    );
  }
  if (!supabaseConfigured() || !(await socialReady())) {
    return attachVid(NextResponse.json(NOT_READY, { status: 409 }), voter);
  }

  const kind = reaction as ReactionKind;
  const base = `listing_id=eq.${encodeURIComponent(listingId)}&reaction=eq.${kind}`;

  // 내가 이미 누른 반응인지 (로그인 회원이면 기기 키도 함께 본다)
  const keys = myKeys(voter);
  const existing = await sbSelect<{ voter_key: string }>(
    "listing_reactions",
    `select=voter_key&${base}&voter_key=in.(${keys.map((k) => encodeURIComponent(k)).join(",")})`
  );
  if (!existing.ok) {
    return attachVid(
      NextResponse.json(
        { ok: false, message: `반응을 확인하지 못했습니다 — ${existing.message}` },
        { status: 502 }
      ),
      voter
    );
  }

  const active = existing.rows.length === 0;
  if (active) {
    const saved = await sbUpsert<Record<string, unknown>>(
      "listing_reactions",
      [{ listing_id: listingId, reaction: kind, voter_key: voter.key }],
      "listing_id,reaction,voter_key"
    );
    if (!saved.ok) {
      return attachVid(
        NextResponse.json(
          { ok: false, message: `반응을 저장하지 못했습니다 — ${saved.message}` },
          { status: 502 }
        ),
        voter
      );
    }
    // 로그인 전에 기기로 눌러 둔 같은 반응이 있으면 지워 한 사람이 두 표가 되지 않게 한다
    if (voter.userId) {
      await sbDelete("listing_reactions", `${base}&voter_key=eq.${encodeURIComponent(`g:${voter.vid}`)}`);
    }
  } else {
    const del = await sbDelete(
      "listing_reactions",
      `${base}&voter_key=in.(${keys.map((k) => encodeURIComponent(k)).join(",")})`
    );
    if (!del.ok) {
      return attachVid(
        NextResponse.json(
          { ok: false, message: `반응을 취소하지 못했습니다 — ${del.message}` },
          { status: 502 }
        ),
        voter
      );
    }
  }

  // 최신 카운트·내 반응을 다시 읽어 화면이 서버 값과 어긋나지 않게 한다
  const [countRes, mineRes] = await Promise.all([
    sbSelect<{ reaction: string; cnt: number }>(
      "listing_reaction_counts",
      `select=reaction,cnt&listing_id=eq.${encodeURIComponent(listingId)}`
    ),
    sbSelect<{ reaction: string }>(
      "listing_reactions",
      `select=reaction&listing_id=eq.${encodeURIComponent(listingId)}&voter_key=in.(${keys
        .map((k) => encodeURIComponent(k))
        .join(",")})`
    ),
  ]);

  const counts = emptyCounts();
  if (countRes.ok) {
    for (const row of countRes.rows) {
      if (isReactionKind(row.reaction)) counts[row.reaction] = Number(row.cnt) || 0;
    }
  }
  const mine = emptyMine();
  if (mineRes.ok) {
    for (const row of mineRes.rows) {
      if (isReactionKind(row.reaction)) mine[row.reaction] = true;
    }
  }

  return attachVid(NextResponse.json({ ok: true, ready: true, active, counts, mine }), voter);
}
