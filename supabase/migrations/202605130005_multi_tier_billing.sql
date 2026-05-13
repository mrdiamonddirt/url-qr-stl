-- ============================================================
-- Multi-tier billing (monthly/yearly/lifetime) + plan limits
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'premium', 'premium_monthly', 'premium_yearly', 'lifetime'));

update public.profiles
set plan = 'premium_monthly'
where plan = 'premium';

alter table public.profiles
  alter column plan set default 'free';

alter table public.profiles
  add column if not exists billing_cycle text check (billing_cycle in ('none', 'monthly', 'yearly', 'lifetime')) default 'none',
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists lifetime_activated_at timestamptz,
  add column if not exists upgrade_credit_source_plan text,
  add column if not exists upgrade_credit_amount_cents integer not null default 0,
  add column if not exists last_checkout_price_id text;

update public.profiles
set billing_cycle = case
  when plan = 'premium_monthly' then 'monthly'
  when plan = 'premium_yearly' then 'yearly'
  when plan = 'lifetime' then 'lifetime'
  else 'none'
end;

create or replace function public.is_paid_plan(p_plan text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_plan, 'free') in ('premium', 'premium_monthly', 'premium_yearly', 'lifetime');
$$;

create or replace function public.is_subscription_plan(p_plan text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_plan, 'free') in ('premium', 'premium_monthly', 'premium_yearly');
$$;

create or replace function public.get_plan_limits(p_plan text)
returns jsonb
language sql
immutable
as $$
  select case coalesce(p_plan, 'free')
    when 'premium' then jsonb_build_object('max_active_tags', 20, 'monthly_scan_limit', 10000, 'max_logos', 5, 'priority_support', false)
    when 'premium_monthly' then jsonb_build_object('max_active_tags', 20, 'monthly_scan_limit', 10000, 'max_logos', 5, 'priority_support', false)
    when 'premium_yearly' then jsonb_build_object('max_active_tags', 20, 'monthly_scan_limit', 10000, 'max_logos', 5, 'priority_support', false)
    when 'lifetime' then jsonb_build_object('max_active_tags', 40, 'monthly_scan_limit', 25000, 'max_logos', 10, 'priority_support', true)
    else jsonb_build_object('max_active_tags', 3, 'monthly_scan_limit', 20, 'max_logos', 0, 'priority_support', false)
  end;
$$;

create or replace function public.record_scan(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_short_url_id          uuid;
  v_original_url          text;
  v_user_id               uuid;
  v_scan_count            integer;
  v_plan                  text;
  v_monthly_scans         integer;
  v_reset_at              timestamptz;
  v_profile_redirect_mode text;
  v_redirect_mode         text;
  v_monthly_limit         integer;
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
  v_profile_redirect_mode := 'interstitial';
  v_monthly_limit := 20;

  if v_user_id is not null then
    select plan, monthly_scans, monthly_reset_at, redirect_mode
      into v_plan, v_monthly_scans, v_reset_at, v_profile_redirect_mode
      from public.profiles
      where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
    v_monthly_scans := coalesce(v_monthly_scans, 0);
    v_profile_redirect_mode := coalesce(v_profile_redirect_mode, 'interstitial');
    v_monthly_limit := coalesce((public.get_plan_limits(v_plan) ->> 'monthly_scan_limit')::integer, 20);
  end if;

  if not public.is_paid_plan(v_plan) and v_scan_count >= v_monthly_limit then
    return jsonb_build_object('error', 'limit_reached');
  end if;

  update public.short_urls
    set scan_count = scan_count + 1
    where short_code = p_code;

  if v_user_id is not null and public.is_paid_plan(v_plan) then
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

  v_redirect_mode := case
    when public.is_paid_plan(v_plan) then v_profile_redirect_mode
    else 'interstitial'
  end;

  return jsonb_build_object(
    'original_url',  v_original_url,
    'scan_count',    v_scan_count + 1,
    'monthly_scans', coalesce(v_monthly_scans, 0),
    'owner_plan',    v_plan,
    'redirect_mode', v_redirect_mode
  );
end;
$$;

create or replace function public.enforce_short_url_template_entitlements()
returns trigger language plpgsql security definer as $$
declare
  v_plan text := 'free';
  v_premium_templates constant text[] := array[
    'fancy-border',
    'open-link',
    'loop-square-text',
    'loop-round-text'
  ];
begin
  if NEW.user_id is not null then
    select plan into v_plan
    from public.profiles
    where id = NEW.user_id;
    v_plan := coalesce(v_plan, 'free');
  end if;

  if NEW.template_id = any(v_premium_templates) and not public.is_paid_plan(v_plan) then
    raise exception 'premium_template_required'
      using errcode = 'P0001',
            detail = format('Template "%s" is premium-only.', NEW.template_id);
  end if;

  if coalesce((NEW.template_payload ->> 'hide_watermark')::boolean, false) and not public.is_paid_plan(v_plan) then
    raise exception 'premium_branding_required'
      using errcode = 'P0001',
            detail = 'Watermark controls are premium-only.';
  end if;

  return NEW;
end;
$$;

create or replace function public.enforce_user_logo_entitlements()
returns trigger language plpgsql security definer as $$
declare
  v_plan text := 'free';
  v_active_count integer := 0;
  v_logo_limit integer := 0;
begin
  select plan into v_plan
  from public.profiles
  where id = NEW.user_id;

  v_logo_limit := coalesce((public.get_plan_limits(v_plan) ->> 'max_logos')::integer, 0);

  if v_logo_limit <= 0 then
    raise exception 'premium_logo_access_required'
      using errcode = 'P0001',
            detail = 'Frame logo uploads are paid-plan only.';
  end if;

  if TG_OP = 'INSERT' and NEW.is_active then
    select count(*) into v_active_count
    from public.user_logos
    where user_id = NEW.user_id
      and is_active = true;

    if v_active_count >= v_logo_limit then
      raise exception 'logo_limit_exceeded'
        using errcode = 'P0001',
              detail = format('You can store up to %s logos. Delete one before adding another.', v_logo_limit);
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.is_active and not OLD.is_active then
    select count(*) into v_active_count
    from public.user_logos
    where user_id = NEW.user_id
      and is_active = true
      and id <> NEW.id;

    if v_active_count >= v_logo_limit then
      raise exception 'logo_limit_exceeded'
        using errcode = 'P0001',
              detail = format('You can store up to %s logos. Delete one before adding another.', v_logo_limit);
    end if;
  end if;

  if NEW.is_default and not NEW.is_active then
    raise exception 'inactive_default_logo_not_allowed'
      using errcode = 'P0001',
            detail = 'Default logo must remain active.';
  end if;

  return NEW;
end;
$$;

create or replace function public.enforce_short_url_frame_logo_entitlements()
returns trigger language plpgsql security definer as $$
declare
  v_plan text := 'free';
  v_logo_owner uuid;
  v_logo_active boolean := false;
begin
  if NEW.frame_logo_id is null then
    return NEW;
  end if;

  if NEW.qr_type <> 'frame' then
    raise exception 'frame_logo_requires_frame_qr'
      using errcode = 'P0001',
            detail = 'Logos can only be used with Frame QR.';
  end if;

  if NEW.user_id is null then
    raise exception 'frame_logo_requires_authenticated_owner'
      using errcode = 'P0001',
            detail = 'Sign in to use a saved logo.';
  end if;

  select plan into v_plan
  from public.profiles
  where id = NEW.user_id;

  if not public.is_paid_plan(v_plan) then
    raise exception 'premium_logo_access_required'
      using errcode = 'P0001',
            detail = 'Frame logos are paid-plan only.';
  end if;

  select user_id, is_active
    into v_logo_owner, v_logo_active
  from public.user_logos
  where id = NEW.frame_logo_id;

  if v_logo_owner is null then
    raise exception 'logo_not_found'
      using errcode = 'P0001',
            detail = 'Selected logo was not found.';
  end if;

  if v_logo_owner <> NEW.user_id then
    raise exception 'logo_owner_mismatch'
      using errcode = 'P0001',
            detail = 'You can only use logos from your own library.';
  end if;

  if not coalesce(v_logo_active, false) then
    raise exception 'logo_inactive'
      using errcode = 'P0001',
            detail = 'Selected logo is no longer active.';
  end if;

  return NEW;
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

  if not public.is_paid_plan(v_plan) then
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
