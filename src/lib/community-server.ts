// ─────────────────────────────────────────────────────────────────────────────
// 커뮤니티 서버 헬퍼 — Supabase Auth 토큰 확인 · 프로필(닉네임) 보장 · 입력 검증
//
//   · 브라우저는 Supabase Auth(GoTrue)에 직접 로그인하고 access_token 을 들고 다닌다.
//   · 글쓰기·댓글·좋아요 같은 **쓰기**는 이 서버 라우트를 거친다. 라우트는 토큰을
//     GoTrue `/auth/v1/user` 로 확인해 사용자 id 를 얻고, 실제 저장은 service role 로 한다.
//     (RLS 는 그대로 켜 두었으므로 브라우저가 anon 키로 직접 쓰는 길은 막혀 있다.)
//   · 닉네임은 public.profiles 에서 읽는다. 프로필이 없으면(가입 트리거 이전 계정)
//     여기서 만들어 준다.
// ─────────────────────────────────────────────────────────────────────────────
import { LIMITS } from "@/lib/community";
import { sbSelect, sbUpsert, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase-server";

const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

export type CommunityUser = { id: string; email: string | null; nickname: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Authorization: Bearer <access_token> → 로그인 사용자. 없거나 만료면 ApiError(401) */
export async function requireUser(req: Request): Promise<CommunityUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "로그인이 필요합니다.");
  if (!supabaseConfigured()) throw new ApiError(503, "DB가 준비되지 않았습니다.");

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiError(503, e instanceof Error ? e.message : "인증 서버에 연결하지 못했습니다.");
  }
  if (!res.ok) {
    throw new ApiError(401, res.status === 403 ? "로그인이 만료되었습니다. 다시 로그인해 주세요." : "로그인이 필요합니다.");
  }
  const body = (await res.json().catch(() => null)) as
    | { id?: string; email?: string; user_metadata?: { nickname?: string } }
    | null;
  const id = body?.id;
  if (!id) throw new ApiError(401, "로그인이 필요합니다.");

  const nickname = await nicknameOf(id, body?.user_metadata?.nickname);
  return { id, email: body?.email ?? null, nickname };
}

/** profiles 의 닉네임. 없으면 user_metadata 값(또는 임시 이름)으로 만들어 준다 */
async function nicknameOf(userId: string, metaNickname?: string): Promise<string> {
  const found = await sbSelect<{ nickname: string }>(
    "profiles",
    `select=nickname&id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  if (found.ok && found.rows.length > 0 && found.rows[0].nickname) return found.rows[0].nickname;

  const fallback = (metaNickname ?? "").trim().slice(0, LIMITS.nicknameMax) || `회원${userId.slice(0, 6)}`;
  await sbUpsert("profiles", [{ id: userId, nickname: fallback }], "id");
  return fallback;
}

/** 본문 JSON 파싱 — 잘못된 JSON 은 400 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("bad");
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }
}

/** 문자열 필드 하나 — trim 후 길이 검사 */
export function field(
  body: Record<string, unknown>,
  key: string,
  { min = 0, max = 2000, label = key }: { min?: number; max?: number; label?: string }
): string {
  const raw = body[key];
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v.length < min) throw new ApiError(400, `${label}을(를) ${min}자 이상 적어 주세요.`);
  if (v.length > max) throw new ApiError(400, `${label}은(는) ${max}자까지 쓸 수 있습니다.`);
  return v;
}

/** 라우트 공통 오류 응답 */
export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    return Response.json({ ok: false, message: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "처리하지 못했습니다.";
  return Response.json({ ok: false, message }, { status: 500 });
}
