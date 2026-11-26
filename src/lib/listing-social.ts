// ─────────────────────────────────────────────────────────────────────────────
// 매물별 댓글·감정 반응 — 공용 타입·표기 (서버·브라우저 양쪽에서 import 한다)
//
//   · DB: public.listing_comments · listing_reactions · listing_comment_reports
//     (스키마: supabase/listing-social.sql)
//   · 반응은 3종 — 👍 좋아요(l사람이 매물에 남기는 표시) · 😮 놀람 · 🔥 관심
//   · 사람 구분(voter_key): 로그인 회원 'u:<uuid>' / 비로그인 기기 'g:<cookie id>'
//     → 같은 사람이 같은 반응을 두 번 눌러도 1개(다시 누르면 취소).
// ─────────────────────────────────────────────────────────────────────────────

export type ReactionKind = "like" | "wow" | "fire";

/** 화면에 놓는 순서·이름 — 버튼 라벨은 여기만 고치면 된다 */
export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "like", emoji: "👍", label: "좋아요" },
  { kind: "wow", emoji: "😮", label: "놀람" },
  { kind: "fire", emoji: "🔥", label: "관심" },
];

export function isReactionKind(v: unknown): v is ReactionKind {
  return v === "like" || v === "wow" || v === "fire";
}

export function emptyCounts(): Record<ReactionKind, number> {
  return { like: 0, wow: 0, fire: 0 };
}

export function emptyMine(): Record<ReactionKind, boolean> {
  return { like: false, wow: false, fire: false };
}

/** 매물 1건의 소통 상태 — 목록에서는 이 값만 받아 카드에 그린다 */
export type ListingSocial = {
  listingId: string;
  counts: Record<ReactionKind, number>;
  mine: Record<ReactionKind, boolean>;
  commentCount: number;
};

/** 매물 댓글 1건 */
export type ListingComment = {
  id: string;
  listingId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
  /** 로그인한 내가 쓴 댓글인지 — 삭제 버튼 노출 */
  mine: boolean;
  /** 다른 사람이 신고한 횟수 */
  reports: number;
};

/** 댓글 길이·안내 문구 (공인중개사법 제33조 제2항 — 시세 부당 영향·허위 비방 금지) */
export const COMMENT_MAX = 300;
export const COMMENT_NOTICE =
  "건전한 매물 의견을 남겨주세요. 시세 조작·비방 댓글은 제한될 수 있습니다.";
