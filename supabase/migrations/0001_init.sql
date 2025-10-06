-- 0001_init.sql
create schema if not exists public;

-- Tables
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  transcript jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.lecture_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lecture_id uuid references public.lectures(id) on delete cascade,
  summary jsonb,
  report jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  outline jsonb,
  content text,
  created_at timestamp with time zone default now()
);

create table if not exists public.material_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  material_id uuid references public.materials(id) on delete cascade,
  items jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_kind text not null,
  source_id uuid,
  front text not null,
  back text not null,
  tags text[],
  interval_days int default 0,
  ease float default 2.5,
  reps int default 0,
  lapses int default 0,
  due_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid references public.cards(id) on delete cascade,
  grade int not null,
  reviewed_at timestamptz default now()
);

-- RLS
alter table public.blocks enable row level security;
alter table public.lectures enable row level security;
alter table public.lecture_packs enable row level security;
alter table public.materials enable row level security;
alter table public.material_packs enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;

create policy owner_blocks on public.blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_lectures on public.lectures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_lecture_packs on public.lecture_packs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_materials on public.materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_material_packs on public.material_packs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_cards on public.cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_reviews on public.reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
