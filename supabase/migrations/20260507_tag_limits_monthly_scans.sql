-- ============================================================
-- Allow tag owners to delete their own short_urls rows
-- ============================================================
create policy "short_urls: owner delete"
  on public.short_urls for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Monthly scan tracking columns on profiles
-- ============================================================
alter table public.profiles
  add column if not exists monthly_scans integer not null default 0;

alter table public.profiles
  add column if not exists monthly_reset_at timestamptz;

-- Backfill existing profiles with a reset timestamp of now()
update public.profiles
  set monthly_reset_at = now()
  where monthly_reset_at is null;

-- Ensure new users get monthly_reset_at set on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, monthly_reset_at)
    values (new.id, now())
    on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- record_scan: add rolling-30-day monthly_scans increment
-- Free limit stays at 20 per tag (hard block).
-- Premium 10,000/month is tracked only (soft cap, not enforced).
-- ============================================================
create or replace function public.record_scan(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_original_url  text;
  v_user_id       uuid;
  v_scan_count    integer;
  v_plan          text;
  v_monthly_scans integer;
  v_reset_at      timestamptz;
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
    select plan, monthly_scans, monthly_reset_at
      into v_plan, v_monthly_scans, v_reset_at
      from public.profiles
      where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
    v_monthly_scans := coalesce(v_monthly_scans, 0);
  end if;

  -- enforce free per-tag limit
  if v_plan = 'free' and v_scan_count >= v_limit then
    return jsonb_build_object('error', 'limit_reached');
  end if;

  -- increment scan count on the tag
  update public.short_urls
    set scan_count = scan_count + 1
    where short_code = p_code;

  -- track monthly scans on premium profiles (soft cap, rolling 30-day window)
  if v_user_id is not null and v_plan = 'premium' then
    if v_reset_at is null or now() > v_reset_at + interval '30 days' then
      -- reset window
      update public.profiles
        set monthly_scans = 1,
            monthly_reset_at = now()
        where id = v_user_id;
      v_monthly_scans := 1;
    else
      update public.profiles
        set monthly_scans = monthly_scans + 1
        where id = v_user_id;
      v_monthly_scans := v_monthly_scans + 1;
    end if;
  end if;

  return jsonb_build_object(
    'original_url',  v_original_url,
    'scan_count',    v_scan_count + 1,
    'monthly_scans', coalesce(v_monthly_scans, 0)
  );
end;
$$;
