-- ============================================================
-- profiles: one row per auth user, tracks plan + Stripe IDs
-- ============================================================
create table if not exists public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  plan                    text not null default 'free' check (plan in ('free', 'premium')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_ends_at    timestamptz,
  created_at              timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

-- auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill profiles for any existing users
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ============================================================
-- scan_count column on short_urls
-- ============================================================
alter table public.short_urls
  add column if not exists scan_count integer not null default 0;

-- ============================================================
-- record_scan: atomically increment and enforce free limit (20)
-- Returns: { original_url, scan_count } or { error: 'not_found' | 'limit_reached' }
-- ============================================================
create or replace function public.record_scan(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_original_url  text;
  v_user_id       uuid;
  v_scan_count    integer;
  v_plan          text;
  v_limit constant integer := 20;
begin
  select original_url, user_id, scan_count
    into v_original_url, v_user_id, v_scan_count
    from public.short_urls
    where short_code = p_code
    for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- look up owner plan (anonymous links always treated as free)
  v_plan := 'free';
  if v_user_id is not null then
    select plan into v_plan from public.profiles where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
  end if;

  if v_plan = 'free' and v_scan_count >= v_limit then
    return jsonb_build_object('error', 'limit_reached');
  end if;

  update public.short_urls set scan_count = scan_count + 1 where short_code = p_code;

  return jsonb_build_object(
    'original_url', v_original_url,
    'scan_count',   v_scan_count + 1
  );
end;
$$;

-- RLS: allow service role (edge functions) to read/update profiles
-- The record_scan function runs as security definer so no additional policy is needed.
