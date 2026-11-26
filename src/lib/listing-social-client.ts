"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 매물 소통(반응·댓글) 브라우저 쪽 호출·캐시
//
//   · 목록 화면은 카드가 수십 장이라 카드마다 요청하지 않는다 — id 를 모아
//     /api/listing-social 을 한 번만 부른다(40ms 모아 보내기).
//   · 카드 컴포넌트는 useListingSocial(id) 로 캐시를 구독한다.
//   · 실패는 조용히 0 으로 두고, 사용자가 누를 때만 안내 문구를 띄운다
//     (스키마가 아직 없어도 목록 화면이 깨지지 않게).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import type { AuthSession } from "@/lib/auth-client";
import { authFetch } from "@/lib/auth-client";
import type { ListingComment, ListingSocial, ReactionKind } from "@/lib/listing-social";
import { emptyCounts, emptyMine } from "@/lib/listing-social";

type Snapshot = { data: Map<string, ListingSocial>; ready: boolean };

let snapshot: Snapshot = { data: new Map(), ready: true };
const fetchedAt = new Map<string, number>();
const listeners = new Set<() => void>();
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

const FRESH_MS = 60_000;

function emit(): void {
  for (const fn of listeners) fn();
}

function blank(listingId: string): ListingSocial {
  return { listingId, counts: emptyCounts(), mine: emptyMine(), commentCount: 0 };
}

function keep(item: Partial<ListingSocial> & { listingId: string }): ListingSocial {
  return {
    listingId: item.listingId,
    counts: { ...emptyCounts(), ...(item.counts ?? {}) },
    mine: { ...emptyMine(), ...(item.mine ?? {}) },
    commentCount: Number(item.commentCount) || 0,
  };
}

/** 이 매물의 소통 상태 — 캐시에 있으면 즉시, 없으면 요청을 걸고 null */
export function getListingSocial(listingId: string): ListingSocial | null {
  return snapshot.data.get(listingId) ?? null;
}

/** 테이블이 준비됐는지 — false 면 화면은 '준비 중'으로 답한다 */
export function listingSocialReady(): boolean {
  return snapshot.ready;
}

function stale(listingId: string): boolean {
  const at = fetchedAt.get(listingId) ?? 0;
  return Date.now() - at > FRESH_MS;
}

function schedule(ids: string[]): void {
  for (const id of ids) queue.add(id);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, 40);
}

async function flush(): Promise<void> {
  if (inflight) return;
  const ids = Array.from(queue).filter((id) => !snapshot.data.has(id) || stale(id));
  queue.clear();
  if (ids.length === 0) return;
  inflight = true;
  try {
    const qs = ids.map((id) => encodeURIComponent(id)).join(",");
    const res = await fetch(`/api/listing-social?ids=${qs}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; ready?: boolean; items?: (Partial<ListingSocial> & { listingId: string })[] }
      | null;
    if (!body || body.ok === false || !Array.isArray(body.items)) return;
    const data = new Map(snapshot.data);
    const now = Date.now();
    for (const item of body.items) {
      if (!item?.listingId) continue;
      data.set(item.listingId, keep(item));
      fetchedAt.set(item.listingId, now);
    }
    // 응답에 없는 id(방금 사라진 매물)는 0 으로 채워 매 렌더마다 다시 묻지 않게 한다
    for (const id of ids) {
      if (!data.has(id)) {
        data.set(id, blank(id));
        fetchedAt.set(id, now);
      }
    }
    snapshot = { data, ready: body.ready !== false };
    emit();
  } catch {
    /* 네트워크·서버 오류는 화면을 멈추지 않는다 — 다음 방문에 다시 시도 */
  } finally {
    inflight = false;
  }
}

/** 목록 화면이 보이는 매물 id 를 한 번에 예약한다 */
export function primeListingSocial(ids: string[]): void {
  const need = ids.filter((id) => Boolean(id) && (!snapshot.data.has(id) || stale(id)));
  if (need.length > 0) schedule(need);
}

/** 카드 하나가 캐시를 구독한다 */
export function useListingSocial(listingId: string): ListingSocial | null {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((v) => v + 1);
    listeners.add(fn);
    primeListingSocial([listingId]);
    return () => {
      listeners.delete(fn);
    };
  }, [listingId]);
  return snapshot.data.get(listingId) ?? null;
}

/** 반응 누르기/취소 — 성공하면 캐시를 서버 값으로 갱신한다 */
export async function toggleListingReaction(
  listingId: string,
  reaction: ReactionKind,
  session: AuthSession | null
): Promise<{ ok: boolean; active?: boolean; message?: string }> {
  try {
    const res = await authFetch("/api/listing-social/reaction", session, {
      method: "POST",
      body: JSON.stringify({ listingId, reaction }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; active?: boolean; message?: string; counts?: Record<string, number>; mine?: Record<string, boolean> }
      | null;
    if (!res.ok || !body || body.ok === false) {
      if (body?.message) return { ok: false, message: body.message };
      return { ok: false, message: `반응을 저장하지 못했습니다(HTTP ${res.status}).` };
    }
    const prev = snapshot.data.get(listingId) ?? blank(listingId);
    const next: ListingSocial = keep({
      listingId,
      counts: (body.counts ?? prev.counts) as ListingSocial["counts"],
      mine: (body.mine ?? prev.mine) as ListingSocial["mine"],
      commentCount: prev.commentCount,
    });
    const data = new Map(snapshot.data);
    data.set(listingId, next);
    snapshot = { ...snapshot, data };
    fetchedAt.set(listingId, Date.now());
    emit();
    return { ok: true, active: body.active };
  } catch {
    return { ok: false, message: "네트워크가 불안정해 반응을 저장하지 못했습니다." };
  }
}

export async function fetchListingComments(
  listingId: string,
  session: AuthSession | null
): Promise<{ ok: boolean; ready: boolean; items: ListingComment[]; message?: string }> {
  try {
    const res = await authFetch(
      `/api/listing-social/comments?listingId=${encodeURIComponent(listingId)}`,
      session
    );
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; ready?: boolean; items?: ListingComment[]; message?: string }
      | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, ready: true, items: [], message: body?.message ?? "댓글을 불러오지 못했습니다." };
    }
    return { ok: true, ready: body.ready !== false, items: body.items ?? [] };
  } catch {
    return { ok: false, ready: true, items: [], message: "댓글을 불러오지 못했습니다." };
  }
}

/** 새 댓글 — 성공하면 그 매물의 댓글 수 캐시도 1 올린다 */
export async function postListingComment(
  listingId: string,
  content: string,
  session: AuthSession | null
): Promise<{ ok: boolean; item?: ListingComment; message?: string }> {
  try {
    const res = await authFetch("/api/listing-social/comments", session, {
      method: "POST",
      body: JSON.stringify({ listingId, content }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; item?: ListingComment; message?: string }
      | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, message: body?.message ?? "댓글을 남기지 못했습니다." };
    }
    const prev = snapshot.data.get(listingId) ?? blank(listingId);
    const data = new Map(snapshot.data);
    data.set(listingId, { ...prev, commentCount: prev.commentCount + 1 });
    snapshot = { ...snapshot, data };
    emit();
    return { ok: true, item: body.item };
  } catch {
    return { ok: false, message: "네트워크가 불안정해 댓글을 남기지 못했습니다." };
  }
}

export async function deleteListingComment(
  listingId: string,
  commentId: string,
  session: AuthSession | null
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authFetch(`/api/listing-social/comments/${encodeURIComponent(commentId)}`, session, {
      method: "DELETE",
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, message: body?.message ?? "댓글을 지우지 못했습니다." };
    }
    const prev = snapshot.data.get(listingId) ?? blank(listingId);
    const data = new Map(snapshot.data);
    data.set(listingId, { ...prev, commentCount: Math.max(0, prev.commentCount - 1) });
    snapshot = { ...snapshot, data };
    emit();
    return { ok: true };
  } catch {
    return { ok: false, message: "네트워크가 불안정해 댓글을 지우지 못했습니다." };
  }
}

export async function reportListingComment(
  commentId: string,
  session: AuthSession | null
): Promise<{ ok: boolean; reports?: number; message?: string }> {
  try {
    const res = await authFetch("/api/listing-social/report", session, {
      method: "POST",
      body: JSON.stringify({ commentId }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; reports?: number; message?: string }
      | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, message: body?.message ?? "신고를 접수하지 못했습니다." };
    }
    return { ok: true, reports: body.reports };
  } catch {
    return { ok: false, message: "네트워크가 불안정해 신고를 접수하지 못했습니다." };
  }
}
