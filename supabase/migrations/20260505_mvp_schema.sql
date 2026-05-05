create extension if not exists pgcrypto;

create table if not exists public.short_urls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  short_code text not null unique,
  original_url text not null,
  template_id text,
  template_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.stl_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  short_code text not null,
  params jsonb not null,
  exported_at timestamptz not null default now()
);

alter table public.short_urls enable row level security;
alter table public.stl_exports enable row level security;

create policy "short_urls_select_own_or_public_lookup"
  on public.short_urls
  for select
  using (auth.uid() = user_id or true);

create policy "short_urls_insert_own"
  on public.short_urls
  for insert
  with check (auth.uid() = user_id);

create policy "stl_exports_select_own"
  on public.stl_exports
  for select
  using (auth.uid() = user_id);

create policy "stl_exports_insert_own"
  on public.stl_exports
  for insert
  with check (auth.uid() = user_id);
