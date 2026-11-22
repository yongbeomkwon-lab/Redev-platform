"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 커뮤니티 브라우저 쪽 호출 모음 — 화면 컴포넌트는 이 함수들만 부른다.
//   · 읽기는 토큰 없이, 쓰기는 authFetch(토큰 자동 갱신)로 나간다.
//   · 실패는 { ok:false, message } 로 돌려 화면이 그대로 안내하게 한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuthSession } from "@/lib/auth-client";
import { authFetch } from "@/lib/auth-client";
import type { CommunityCategory, CommunityComment, CommunityPost, PostListResult } from "@/lib/community";

async function asJson<T>(res: Response): Promise<T & { ok: boolean; message?: string }> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const ok = res.ok && body.ok !== false;
  const message =
    typeof body.message === "string" && body.message
      ? body.message
      : ok
        ? undefined
        : `응답을 읽지 못했습니다(HTTP ${res.status}).`;
  return { ...(body as T), ok, message };
}

export type ListParams = {
  tab?: string;
  category?: CommunityCategory | "";
  zoneId?: string;
  q?: string;
  limit?: number;
  offset?: number;
  mine?: boolean;
};

export async function fetchPosts(params: ListParams, session: AuthSession | null): Promise<PostListResult> {
  const qs = new URLSearchParams();
  if (params.tab) qs.set("tab", params.tab);
  if (params.category) qs.set("category", params.category);
  if (params.zoneId) qs.set("zoneId", params.zoneId);
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));

  const res = await authFetch(`/api/community/posts?${qs.toString()}`, session);
  const body = await asJson<{ items?: CommunityPost[]; total?: number }>(res);
  let items = body.items ?? [];
  if (params.mine) items = items.filter((p) => p.mine);
  return { ok: body.ok !== false, items, total: body.total ?? items.length, message: body.message };
}

export async function fetchPost(
  id: string,
  session: AuthSession | null
): Promise<{ ok: boolean; item?: CommunityPost; comments?: CommunityComment[]; message?: string }> {
  const res = await authFetch(`/api/community/posts/${encodeURIComponent(id)}`, session);
  return asJson<{ item?: CommunityPost; comments?: CommunityComment[] }>(res);
}

export async function createPost(
  payload: {
    category: CommunityCategory;
    title: string;
    content: string;
    zoneId?: string | null;
    zoneName?: string | null;
  },
  session: AuthSession | null
): Promise<{ ok: boolean; item?: CommunityPost; message?: string }> {
  const res = await authFetch("/api/community/posts", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return asJson<{ item?: CommunityPost }>(res);
}

export async function updatePost(
  id: string,
  payload: { title?: string; content?: string },
  session: AuthSession | null
): Promise<{ ok: boolean; item?: CommunityPost; message?: string }> {
  const res = await authFetch(`/api/community/posts/${encodeURIComponent(id)}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return asJson<{ item?: CommunityPost }>(res);
}

export async function removePost(
  id: string,
  session: AuthSession | null
): Promise<{ ok: boolean; message?: string }> {
  const res = await authFetch(`/api/community/posts/${encodeURIComponent(id)}`, session, {
    method: "DELETE",
  });
  return asJson<Record<string, never>>(res);
}

export async function toggleLike(
  postId: string,
  session: AuthSession | null
): Promise<{ ok: boolean; liked?: boolean; likesCount?: number; message?: string }> {
  const res = await authFetch("/api/community/likes", session, {
    method: "POST",
    body: JSON.stringify({ postId }),
  });
  return asJson<{ liked?: boolean; likesCount?: number }>(res);
}

export async function addComment(
  postId: string,
  content: string,
  session: AuthSession | null
): Promise<{ ok: boolean; item?: CommunityComment; commentsCount?: number; message?: string }> {
  const res = await authFetch("/api/community/comments", session, {
    method: "POST",
    body: JSON.stringify({ postId, content }),
  });
  return asJson<{ item?: CommunityComment; commentsCount?: number }>(res);
}

export async function removeComment(
  id: string,
  session: AuthSession | null
): Promise<{ ok: boolean; message?: string }> {
  const res = await authFetch(`/api/community/comments/${encodeURIComponent(id)}`, session, {
    method: "DELETE",
  });
  return asJson<Record<string, never>>(res);
}
