// ─────────────────────────────────────────────────────────────────────────────
// 매물 소통(댓글·반응) 서버 헬퍼 — 사람 구분(voter) · 테이블 준비 확인 · 행 변환
//
//   · 반응은 로그인 없이도 누를 수 있어야 하므로, 비회원은 서버가 내려 주는
//     httpOnly 쿠키(rdv_vid)로 사람을 구분한다. 쿠키에는 아무 개인정보도 없다.
//   · 로그인 회원은 액세스 토큰을 GoTrue 로 확인해 'u:<uuid>' 로 구분한다.
//   · 테이블이 아직 없으면(스키마 미적용) 화면이 깨지지 않도록 '준비 안 됨'으로 답한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextResponse } from "next/server";
import { sbSelect, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase-server";
import type { ListingComment, ListingSocial, ReactionKind } from "@/lib/listing-social";
import { emptyCounts, emptyMine } from "@/lib/listing-social";

const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** 비회원 기기 식별 쿠키 이름 (개인정보 없음 — 무작위 id) */
export const VID_COOKIE = "rdv_vid";
const VID_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(req: Request, name: string): string {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return "";
}

function newVid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

/** Authorization: Bearer <access_token> → 로그인 회원 id (없거나 만료면 null) */
async function userIdFromToken(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !supabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return body?.id ?? null;
  } catch {
    return null;
  }
}

export type Voter = {
  /** DB listing_reactions.voter_key 값 */
  key: string;
  userId: string | null;
  vid: string;
  /** 이번 응답에 쿠키를 새로 내려 줘야 하는지 */
  setCookie: boolean;
};

export async function voterOf(req: Request): Promise<Voter> {
  const userId = await userIdFromToken(req);
  let vid = readCookie(req, VID_COOKIE);
  let setCookie = false;
  if (!vid) {
    vid = newVid();
    setCookie = true;
  }
  return { key: userId ? `u:${userId}` : `g:${vid}`, userId, vid, setCookie };
}

/** 응답에 기기 쿠키를 붙인다(새로 만든 경우에만) */
export function attachVid<T extends NextResponse>(res: T, voter: Voter): T {
  if (voter.setCookie) {
    res.cookies.set(VID_COOKIE, voter.vid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: VID_MAX_AGE,
    });
  }
  return res;
}

/** 화면이 쓰는 사람 식별 키 후보 — 로그인했으면 두 키 모두 내 것으로 본다 */
function myKeys(voter: Voter): string[] {
  const keys = [`g:${voter.vid}`];
  if (voter.userId) keys.unshift(`u:${voter.userId}`);
  return keys;
}

// ─── 테이블 준비 상태 (스키마 미적용이면 화면이 '준비 중'으로 답한다) ────────
let readyCache: { value: boolean; at: number } | null = null;

export async function socialReady(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const now = Date.now();
  if (readyCache && now - readyCache.at < 30_000) return readyCache.value;
  const probe = await sbSelect<{ listing_id: string }>(
    "listing_reaction_counts",
    "select=listing_id&limit=1"
  );
  readyCache = { value: probe.ok, at: now };
  return probe.ok;
}

/** 매물 id 문자열 검증 — 우리 매물 id(rfine-…, mylisting-…, 샘플 id)와 외부 입력을 가른다 */
export function cleanListingId(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 80) return "";
  if (!/^[0-9A-Za-z가-힣._:-]+$/.test(s)) return "";
  return s;
}

/** `ids=a,b,c` → 최대 200건, 중복 제거 */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = cleanListingId(part);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

/** PostgREST in.(…) 필터 값 — 각 값을 인코딩해 넣는다 */
export function inFilter(ids: string[]): string {
  return `in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`;
}

export function socialOf(
  listingId: string,
  counts: Record<ReactionKind, number>,
  mine: Record<ReactionKind, boolean>,
  commentCount: number
): ListingSocial {
  return { listingId, counts, mine, commentCount };
}

export function makeSocial(listingId: string): ListingSocial {
  return socialOf(listingId, emptyCounts(), emptyMine(), 0);
}

export function commentFromRow(
  row: Record<string, unknown>,
  myUserIds: (string | null)[]
): ListingComment {
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  return {
    id: String(row.id ?? ""),
    listingId: String(row.listing_id ?? ""),
    authorNickname: String(row.author_nickname ?? "회원"),
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? ""),
    mine: Boolean(userId && myUserIds.includes(userId)),
    reports: Number(row.reports ?? 0) || 0,
  };
}

export { myKeys };
