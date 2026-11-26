-- ═══════════════════════════════════════════════════════════════════════════
-- 리디브(redev) — 매물별 댓글·감정 반응(좋아요·놀람·관심) 스키마 (2026-11-26)
--   listing_comments      매물 댓글
--   listing_reactions     매물 반응 (매물별·반응별·사람별 1행 = 중복 방지)
--   listing_comment_reports  댓글 신고 (같은 사람이 같은 댓글을 두 번 신고하지 못하게)
--   listing_reaction_counts / listing_comment_counts  화면용 집계 뷰
--
--   · 읽기: 누구나(뷰 포함). 쓰기는 앱 서버(/api/listing-social/*)가 service role 로만 한다.
--   · 실행 위치: Supabase Dashboard → SQL Editor (프로젝트 izcrsqcyylkjxdgtyhpj)
--   · 이 파일은 멱등(idempotent)이다 — 여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";

-- ─── 1. 매물 댓글 ──────────────────────────────────────────────────────────
create table if not exists public.listing_comments (
  id              uuid primary key default gen_random_uuid(),
  listing_id      text not null,                 -- 매물 id (예: rfine-10767491)
  user_id         uuid references auth.users(id) on delete set null,
  author_nickname text not null,
  content         text not null,
  hidden          boolean not null default false, -- 신고 누적 등으로 가린 댓글
  created_at      timestamptz not null default now()
);

create index if not exists listing_comments_listing_idx
  on public.listing_comments (listing_id, created_at);

alter table public.listing_comments enable row level security;

-- ─── 2. 매물 감정 반응 ────────────────────────────────────────────────────
create table if not exists public.listing_reactions (
  listing_id text not null,
  reaction   text not null check (reaction in ('like', 'wow', 'fire')),
  voter_key  text not null,   -- 'u:<회원 uuid>' 로그인 회원 | 'g:<기기 id>' 비회원 브라우저
  created_at timestamptz not null default now(),
  primary key (listing_id, reaction, voter_key)
);

create index if not exists listing_reactions_listing_idx
  on public.listing_reactions (listing_id);

alter table public.listing_reactions enable row level security;

-- ─── 3. 댓글 신고 ─────────────────────────────────────────────────────────
create table if not exists public.listing_comment_reports (
  comment_id  uuid not null references public.listing_comments(id) on delete cascade,
  reporter_key text not null,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (comment_id, reporter_key)
);

alter table public.listing_comment_reports enable row level security;

-- ─── 4. 화면용 집계 뷰 ────────────────────────────────────────────────────
create or replace view public.listing_reaction_counts as
  select listing_id, reaction, count(*)::int as cnt
    from public.listing_reactions
   group by listing_id, reaction;

create or replace view public.listing_comment_counts as
  select listing_id, count(*)::int as cnt, max(created_at) as last_at
    from public.listing_comments
   where hidden = false
   group by listing_id;

create or replace view public.listing_comment_report_counts as
  select comment_id, count(*)::int as cnt
    from public.listing_comment_reports
   group by comment_id;

-- ─── 5. 권한 ───────────────────────────────────────────────────────────────
grant select on public.listing_comments, public.listing_reactions,
  public.listing_comment_reports,
  public.listing_reaction_counts, public.listing_comment_counts,
  public.listing_comment_report_counts to anon, authenticated;

grant all on public.listing_comments, public.listing_reactions,
  public.listing_comment_reports to service_role;
grant select on public.listing_reaction_counts, public.listing_comment_counts,
  public.listing_comment_report_counts to service_role;
