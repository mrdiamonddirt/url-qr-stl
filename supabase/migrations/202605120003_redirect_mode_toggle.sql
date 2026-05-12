-- ============================================================
-- Redirect mode toggle: premium-controlled, default interstitial
-- ============================================================

alter table public.profiles
  add column if not exists redirect_mode text not null default 'interstitial'
  check (redirect_mode in ('instant', 'interstitial'));

update public.profiles
set redirect_mode = 'interstitial'
where redirect_mode is distinct from 'interstitial';

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
  v_limit constant integer := 20;
  v_redirect_mode         text;
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

  if v_user_id is not null then
    select plan, monthly_scans, monthly_reset_at, redirect_mode
      into v_plan, v_monthly_scans, v_reset_at, v_profile_redirect_mode
      from public.profiles
      where id = v_user_id;
    v_plan := coalesce(v_plan, 'free');
    v_monthly_scans := coalesce(v_monthly_scans, 0);
    v_profile_redirect_mode := coalesce(v_profile_redirect_mode, 'interstitial');
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

  v_redirect_mode := case
    when v_plan = 'premium' then v_profile_redirect_mode
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
