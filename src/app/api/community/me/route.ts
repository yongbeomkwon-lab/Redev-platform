// ─────────────────────────────────────────────────────────────────────────────
// /api/community/me — 지금 토큰의 회원 정보(닉네임 포함) 확인
//   브라우저는 Supabase Auth 로 로그인한 뒤 이 라우트로 닉네임을 확정한다.
//   → { ok, user: { id, email, nickname } }
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/community-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return errorResponse(e);
  }
}
