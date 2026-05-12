-- ============================================================
-- Premium analytics depth: scan events + premium analytics RPC
-- ============================================================

create table if not exists public.short_url_scan_events (
  id bigserial primary key,
  short_url_id uuid not null references public.short_urls(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  short_code text not null,
  scanned_at timestamptz not null default now()
);

create index if not exists short_url_scan_events_user_scanned_idx
  on public.short_url_scan_events(user_id, scanned_at desc);

create index if not exists short_url_scan_events_code_scanned_idx
  on public.short_url_scan_events(short_code, scanned_at desc);

alter table public.short_url_scan_events enable row level security;

drop policy if exists "scan_events: owner read" on public.short_url_scan_events;
create policy "scan_events: owner read"
  on public.short_url_scan_events
  for select
  using (auth.uid() = user_id);

-- Log every successful scan for analytics while preserving existing plan gating.
create or replace function public.record_scan(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_short_url_id  uuid;
  v_original_url  text;
  v_user_id       uuid;
  v_scan_count    integer;
  v_plan          text;
  v_monthly_scans integer;
  v_reset_at      timestamptz;
  v_limit constant integer := 20;
  v_redirect_mode text;
begin
  select id, original_url, user_id, scan_count
    into v_short_url_id, v_original_url, v_user_id, v_scan_count
    from public.short_urls
    where short_code = p_code
    for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_plan := 'free';
  if v_user_id is not null then
    select plan, monthly_scans, monthly_reset_at
      into v_plan, v_monthly_scans, v_reset_at
      from public.profiles
      where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
    v_monthly_scans := coalesce(v_monthly_scans, 0);
  end if;

  if v_plan = 'free' and v_scan_count >= v_limit then
    return jsonb_build_object('error', 'limit_reached');
  end if;

  update public.short_urls
    set scan_count = scan_count + 1
    where short_code = p_code;

  if v_user_id is not null and v_plan = 'premium' then
    if v_reset_at is null or now() > v_reset_at + interval '30 days' then
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

  insert into public.short_url_scan_events (short_url_id, user_id, short_code)
  values (v_short_url_id, v_user_id, p_code);

  v_redirect_mode := case when v_plan = 'premium' then 'instant' else 'interstitial' end;

  return jsonb_build_object(
    'original_url',  v_original_url,
    'scan_count',    v_scan_count + 1,
    'monthly_scans', coalesce(v_monthly_scans, 0),
    'owner_plan',    v_plan,
    'redirect_mode', v_redirect_mode
  );
end;
$$;

create or replace function public.get_premium_scan_analytics(
  p_user_id uuid,
  p_days integer default 14
)
returns jsonb language plpgsql security definer as $$
declare
  v_plan text := 'free';
  v_days integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_daily jsonb := '[]'::jsonb;
  v_top_tags jsonb := '[]'::jsonb;
  v_total bigint := 0;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select plan into v_plan
  from public.profiles
  where id = p_user_id;

  if coalesce(v_plan, 'free') <> 'premium' then
    return jsonb_build_object('error', 'premium_required');
  end if;

  with day_window as (
    select generate_series(
      current_date - (v_days - 1),
      current_date,
      interval '1 day'
    )::date as day
  ),
  daily_rollup as (
    select
      dw.day,
      coalesce(count(se.id), 0)::integer as scans
    from day_window dw
    left join public.short_url_scan_events se
      on se.user_id = p_user_id
      and se.scanned_at::date = dw.day
    group by dw.day
    order by dw.day
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', day,
        'scans', scans
      )
      order by day
    ),
    '[]'::jsonb
  )
  into v_daily
  from daily_rollup;

  select coalesce(sum((entry->>'scans')::integer), 0)
    into v_total
  from jsonb_array_elements(v_daily) as entry;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'short_code', short_code,
        'original_url', original_url,
        'scan_count', scan_count
      )
      order by scan_count desc, created_at desc
    ),
    '[]'::jsonb
  )
  into v_top_tags
  from (
    select short_code, original_url, scan_count, created_at
    from public.short_urls
    where user_id = p_user_id
    order by scan_count desc, created_at desc
    limit 5
  ) t;

  return jsonb_build_object(
    'days', v_days,
    'total_scans_in_window', v_total,
    'daily_scans', v_daily,
    'top_tags', v_top_tags
  );
end;
$$;
