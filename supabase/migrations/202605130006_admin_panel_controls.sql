-- ============================================================
-- Admin controls: profile moderation metadata + banned redirect guard
-- ============================================================

alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text,
  add column if not exists banned_by uuid references auth.users(id) on delete set null,
  add column if not exists plan_override_source text not null default 'system'
    check (plan_override_source in ('system', 'stripe_webhook', 'admin_manual', 'admin_stripe')),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_is_banned_idx
  on public.profiles(is_banned)
  where is_banned = true;

create or replace function public.set_updated_at_profiles()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at_profiles();

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
  v_is_banned             boolean;
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
  v_is_banned := false;

  if v_user_id is not null then
    select plan, monthly_scans, monthly_reset_at, redirect_mode, is_banned
      into v_plan, v_monthly_scans, v_reset_at, v_profile_redirect_mode, v_is_banned
      from public.profiles
      where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
    v_monthly_scans := coalesce(v_monthly_scans, 0);
    v_profile_redirect_mode := coalesce(v_profile_redirect_mode, 'interstitial');
    v_monthly_limit := coalesce((public.get_plan_limits(v_plan) ->> 'monthly_scan_limit')::integer, 20);
    v_is_banned := coalesce(v_is_banned, false);
  end if;

  if v_is_banned then
    return jsonb_build_object('error', 'banned');
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
