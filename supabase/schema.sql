-- ═══════════════════════════════════════════════════════════════════════════
-- 리디브(redev) 재개발 플랫폼 — Supabase 스키마 v0.1
-- 테이블: zones, transactions, listings, unlocks, broker_subscriptions (+brokers)
-- 권한: RLS 전면 활성 (공개 읽기 / 중개사 본인 쓰기)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";

-- ─── 공통 열거형 ───────────────────────────────────────────────────────────
create type public.zone_type as enum ('신통기획', '모아타운', '도공복', '일반재개발');
create type public.zone_stage as enum ('추진위원회', '사업계획승인', '관리처분', '이주·철거', '착공', '준공');

-- ─── 정비구역 ──────────────────────────────────────────────────────────────
create table public.zones (
  id text primary key,                      -- 예: 'sillim-1'
  name text not null,
  district text not null,                   -- 자치구
  type public.zone_type not null,
  stage public.zone_stage not null,
  households integer,                       -- 총 세대수
  ratio_estimate numeric(5,2),              -- 추정 비례율(%)
  constructor text,                         -- 시공사
  residence_required boolean not null default false,  -- 실거주 의무
  toeho_applied boolean not null default false,       -- 토허제 적용
  move_in_estimate text,                    -- 예상 입주 구간 예: '2031~2033'
  timeline jsonb not null default '[]',     -- [{date,label,sourceUrl}] 고시/공고 근거
  boundary jsonb,                           -- GeoJSON Polygon (WFS에서 갱신)
  center_lat double precision,
  center_lng double precision,
  summary text,
  updated_at timestamptz not null default now()
);

-- ─── 구역 내 실거래가 (국토부 API 배치 수집) ───────────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  zone_id text not null references public.zones(id) on delete cascade,
  trade_date date not null,                 -- 실거래일
  kind text not null,                       -- 아파트/오피스텔/다세대
  dong text,
  area_sqm numeric(7,2),                    -- 전용면적
  floor integer,
  price bigint not null,                    -- 거래금액(만원)
  land_share_sqm numeric(7,2),              -- 대지권면적(대지지분)
  official_land_value bigint,               -- 공시지가 기준 토지가(만원) → 배수 계산
  created_at timestamptz not null default now()
);
create index transactions_zone_date_idx on public.transactions (zone_id, trade_date desc);

-- ─── 중개사 프로필 ─────────────────────────────────────────────────────────
create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  agency text not null,
  phone text not null,
  license_number text not null,             -- 개설등록번호
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (agency, license_number)
);

-- ─── 중개사 매물 ───────────────────────────────────────────────────────────
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  zone_id text not null references public.zones(id) on delete cascade,
  broker_id uuid not null references public.brokers(id) on delete cascade,
  unit_type text not null,                  -- '84D', '59A', '일반매물' ...
  sale_price bigint not null,               -- 매매가(만원)
  appraised_value bigint,                   -- 감정평가액(만원)
  premium bigint,                           -- 프리미엄(만원) = 매매가-감정가
  transfer_fee_included boolean not null default false,  -- 불하금 포함 여부
  transfer_fee bigint,                      -- 불하금(만원)
  expected_jeonse bigint,                   -- 예상 전세 보증금 회수액
  expected_additional_cost bigint,          -- 예상 추가분담금
  note text,
  verified boolean not null default false,  -- 검증 매물(월 구좌/검증 절차 통과)
  status text not null default 'active',    -- active | expired | hidden
  expires_at timestamptz,                   -- 단건 등록권 30일
  created_at timestamptz not null default now()
);
create index listings_zone_idx on public.listings (zone_id, status, created_at desc);

-- ─── 매수자 열람권 (유료) ──────────────────────────────────────────────────
create table public.unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_token text,                         -- 익명 매수자 식별 토큰
  price_paid bigint not null,               -- 결제 금액(원 단위로 저장 권장)
  payment_ref text,                         -- PG 결제 승인번호
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_token)
);

-- ─── 중개사 구독 (유료 플랜) ───────────────────────────────────────────────
create type public.broker_plan as enum ('single', 'monthly');

create table public.broker_subscriptions (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers(id) on delete cascade,
  plan public.broker_plan not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz,                   -- monthly: +1개월 / single: 등록 건 소진 시
  price_paid bigint not null,
  payment_ref text,
  created_at timestamptz not null default now()
);

-- ═════════════════════════════ RLS ═════════════════════════════
alter table public.zones enable row level security;
alter table public.transactions enable row level security;
alter table public.listings enable row level security;
alter table public.unlocks enable row level security;
alter table public.brokers enable row level security;
alter table public.broker_subscriptions enable row level security;

-- 공개 읽기: 구역·실거래·활성 매물 (기본 정보만 노출, 연락처 열람은 앱 레이어에서 unlocks 확인)
create policy "public read zones" on public.zones for select using (true);
create policy "public read transactions" on public.transactions for select using (true);
create policy "public read active listings" on public.listings for select using (status = 'active');

-- 중개사 본인 데이터만 쓰기
create policy "broker read own" on public.brokers for select using (auth.uid() = user_id);
create policy "broker insert own" on public.brokers for insert with check (auth.uid() = user_id);
create policy "broker insert own listing" on public.listings
  for insert with check (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );
create policy "broker update own listing" on public.listings
  for update using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );
create policy "broker read own subscription" on public.broker_subscriptions
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

-- 열람권: 본인 구매 이력만 읽기(결과적으로 어떤 매물을 열 수 있는지 판정)
create policy "read own unlocks" on public.unlocks
  for select using (auth.uid() = user_id or buyer_token is not null);
create policy "insert own unlock" on public.unlocks
  for insert with check (auth.uid() = user_id or buyer_token is not null);

-- ═════════════════════════════ 샘플 데이터 ═════════════════════════════
-- 샘플 구역 6곳(앱 내 sample.ts와 동일 id). 실운영 시 정비사업 정보몽땅/WFS로 대체.
insert into public.zones (id, name, district, type, stage, households, ratio_estimate, constructor, residence_required, toeho_applied, move_in_estimate, summary) values
  ('sillim-1',   '신림1구역',          '관악구',   '모아타운',    '관리처분',   4200, 57.80, '삼성물산(예정)', true,  false, '2031~2033', '신림역 권역 최대 규모 정비사업'),
  ('banpo-1',    '반포1동 민간도심복합', '서초구',   '도공복',      '사업계획승인', 3060, 44.90, '미정',          false, false, '2034~2036', '한강뷰 도심복합 사업'),
  ('noryangjin', '노량진 제2구역',      '동작구',   '신통기획',    '사업계획승인', 2140, 55.00, '대우건설(예정)', false, false, '2032~2034', '노량진역 세 지구 중 제2구역'),
  ('hannam',     '한남뉴타운',          '용산구',   '일반재개발',  '이주·철거',   1630, 62.50, '현대건설',      true,  false, '2030~2031', '용산 국제업무지구 배후 주거지'),
  ('seongsu',    '성수 제2구역',        '성동구',   '일반재개발',  '착공',       2980, 60.20, '포스코이앤씨',  false, true,  '2029~2030', '성수역 이남 대단지 재건축'),
  ('bukahyeon',  '북아현 주공1차',      '서대문구', '모아타운',    '추진위원회',  1560, 53.50, '미정',          true,  false, '2034~2036', '홍제역 인근 주공1차 재건축')
on conflict (id) do nothing;
