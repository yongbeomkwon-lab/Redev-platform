// ─────────────────────────────────────────────────────────────────────────────
// 커뮤니티 공용 타입·표기 규칙 (서버·브라우저 양쪽에서 import 한다)
//   · DB 행(snake_case) → 화면 타입(camelCase) 변환도 여기서 한다.
//   · 카테고리 4종: free(자유) · zone(구역) · info(정보) · question(질문)
// ─────────────────────────────────────────────────────────────────────────────

export type CommunityCategory = "free" | "zone" | "info" | "question";

export const COMMUNITY_CATEGORIES: CommunityCategory[] = ["free", "zone", "info", "question"];

export const CATEGORY_LABEL: Record<CommunityCategory, string> = {
  free: "자유",
  zone: "구역",
  info: "정보",
  question: "질문",
};

/** 카테고리 칩 색 — 오레오 블루 계열 안에서만 구분한다(사업유형 9색과 섞이지 않게) */
export const CATEGORY_CHIP: Record<CommunityCategory, string> = {
  free: "bg-slate-100 text-slate-700",
  zone: "bg-brand text-white",
  info: "bg-brand-tint text-brand",
  question: "bg-gold-tint text-[#8a6a24]",
};

export type CommunityPost = {
  id: string;
  authorNickname: string;
  zoneId: string | null;
  zoneName: string | null;
  category: CommunityCategory;
  title: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  /** 로그인한 사람이 좋아요를 눌렀는지 (비로그인 조회면 undefined) */
  liked?: boolean;
  /** 내가 쓴 글인지 */
  mine?: boolean;
};

export type CommunityComment = {
  id: string;
  postId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
  mine?: boolean;
};

export type PostListResult = {
  ok: boolean;
  items: CommunityPost[];
  total: number;
  message?: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function asCategory(v: unknown): CommunityCategory {
  return v === "zone" || v === "info" || v === "question" ? v : "free";
}

/** DB 행 → 화면 타입 */
export function postFromRow(row: Record<string, unknown>): CommunityPost {
  return {
    id: str(row.id),
    authorNickname: str(row.author_nickname) || "회원",
    zoneId: row.zone_id == null ? null : str(row.zone_id) || null,
    zoneName: row.zone_name == null ? null : str(row.zone_name) || null,
    category: asCategory(row.category),
    title: str(row.title),
    content: str(row.content),
    likesCount: num(row.likes_count),
    commentsCount: num(row.comments_count),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at) || str(row.created_at),
  };
}

export function commentFromRow(row: Record<string, unknown>): CommunityComment {
  return {
    id: str(row.id),
    postId: str(row.post_id),
    authorNickname: str(row.author_nickname) || "회원",
    content: str(row.content),
    createdAt: str(row.created_at),
  };
}

/** 제목·본문 길이 제한 — 서버와 화면이 같은 값을 쓴다 */
export const LIMITS = {
  titleMin: 2,
  titleMax: 80,
  bodyMin: 2,
  bodyMax: 4000,
  commentMax: 1000,
  nicknameMin: 2,
  nicknameMax: 16,
};

/** "3분 전", "어제", "11.19" — 목록에서 쓰는 짧은 표기 */
export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const d = new Date(t);
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return y === new Date().getFullYear() ? `${mm}.${dd}` : `${String(y).slice(2)}.${mm}.${dd}`;
}

/** 한 줄 글쓰기(구역 패널)의 제목 — 본문 앞부분을 제목으로 쓴다 */
export function titleFromBody(body: string): string {
  const first = body.trim().split("\n")[0] ?? "";
  const cut = first.length > 40 ? `${first.slice(0, 40)}…` : first;
  return cut || "구역 이야기";
}
