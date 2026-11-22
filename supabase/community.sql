-- ═══════════════════════════════════════════════════════════════════════════
-- 리디브(redev) — 회원·커뮤니티 스키마 (2026-11-22)
--   profiles(닉네임) · community_posts · community_comments · community_likes
--   읽기: 누구나 / 쓰기·수정·삭제: 로그인 회원(본인 글만) — RLS 로 강제한다.
--   실행 위치: Supabase Dashboard → SQL Editor (프로젝트 izcrsqcyylkjxdgtyhpj)
--   이 파일은 멱등(idempotent)이다 — 여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";

-- ─── 1. 프로필 (닉네임) ────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 닉네임은 대소문자 무시하고 유일 — 같은 이름이 둘 생기면 누가 쓴 글인지 알 수 없다
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(btrim(nickname)));

alter table public.profiles enable row level security;

drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles
  for select using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id);

-- 가입(auth.users insert) 시 profiles 행을 자동으로 만든다.
--   nickname 은 회원가입 때 넘긴 user_metadata.nickname, 없으면 '회원xxxxxx'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  nick text;
begin
  nick := nullif(btrim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  if nick is null then
    nick := '회원' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (id, nickname)
  values (new.id, nick)
  on conflict (id) do nothing;
  return new;
exception
  -- 닉네임이 이미 쓰이고 있으면 가입 자체를 막지 않고 임시 이름으로 만든다
  when unique_violation then
    insert into public.profiles (id, nickname)
    values (new.id, '회원' || substr(replace(new.id::text, '-', ''), 1, 6))
    on conflict (id) do nothing;
    return new;
end
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. 게시글 ─────────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null,
  zone_id         text,                     -- null = 전체 자유글, 값 = 특정 구역 글
  zone_name       text,
  category        text not null default 'free'
                  check (category in ('free', 'zone', 'info', 'question')),
  title           text not null,
  content         text not null,
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc);
create index if not exists community_posts_zone_idx
  on public.community_posts (zone_id, created_at desc);
create index if not exists community_posts_hot_idx
  on public.community_posts (likes_count desc, comments_count desc, created_at desc);
create index if not exists community_posts_category_idx
  on public.community_posts (category, created_at desc);

alter table public.community_posts enable row level security;

drop policy if exists "posts read all" on public.community_posts;
create policy "posts read all" on public.community_posts
  for select using (true);

drop policy if exists "posts insert own" on public.community_posts;
create policy "posts insert own" on public.community_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts update own" on public.community_posts;
create policy "posts update own" on public.community_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "posts delete own" on public.community_posts;
create policy "posts delete own" on public.community_posts
  for delete using (auth.uid() = user_id);

-- ─── 3. 댓글 ───────────────────────────────────────────────────────────────
create table if not exists public.community_comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.community_posts(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at);

alter table public.community_comments enable row level security;

drop policy if exists "comments read all" on public.community_comments;
create policy "comments read all" on public.community_comments
  for select using (true);

drop policy if exists "comments insert own" on public.community_comments;
create policy "comments insert own" on public.community_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments delete own" on public.community_comments;
create policy "comments delete own" on public.community_comments
  for delete using (auth.uid() = user_id);

-- ─── 4. 좋아요 (1인 1좋아요 — 복합 기본키) ────────────────────────────────
create table if not exists public.community_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_likes enable row level security;

drop policy if exists "likes read all" on public.community_likes;
create policy "likes read all" on public.community_likes
  for select using (true);

drop policy if exists "likes insert own" on public.community_likes;
create policy "likes insert own" on public.community_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "likes delete own" on public.community_likes;
create policy "likes delete own" on public.community_likes
  for delete using (auth.uid() = user_id);

-- ─── 5. 카운터·수정시각 트리거 ────────────────────────────────────────────
create or replace function public.recount_post_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  pid uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.community_posts p
     set comments_count = (select count(*) from public.community_comments c where c.post_id = pid),
         likes_count    = (select count(*) from public.community_likes l where l.post_id = pid)
   where p.id = pid;
  return null;
end
$fn$;

drop trigger if exists community_comments_count on public.community_comments;
create trigger community_comments_count
  after insert or delete on public.community_comments
  for each row execute function public.recount_post_counters();

drop trigger if exists community_likes_count on public.community_likes;
create trigger community_likes_count
  after insert or delete on public.community_likes
  for each row execute function public.recount_post_counters();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$;

drop trigger if exists community_posts_touch on public.community_posts;
create trigger community_posts_touch
  before update on public.community_posts
  for each row execute function public.touch_updated_at();

-- ─── 6. 구역별 글 수 (지도 패널 「이 구역 이야기 N건」) ────────────────────
create or replace view public.community_zone_counts as
  select zone_id, count(*)::int as posts_count, max(created_at) as last_post_at
    from public.community_posts
   where zone_id is not null
   group by zone_id;

grant select on public.community_zone_counts to anon, authenticated;

-- ─── 7. 권한 ───────────────────────────────────────────────────────────────
grant select on public.community_posts, public.community_comments, public.community_likes,
  public.profiles to anon, authenticated;
grant insert, update, delete on public.community_posts, public.community_comments,
  public.community_likes to authenticated;
grant insert, update on public.profiles to authenticated;
