-- ============================================================
-- Premium feature enforcement + redirect metadata
-- ============================================================

-- Mark premium-only redirect behavior by owner plan in record_scan response.
-- Free links now return redirect_mode='interstitial'.
-- Premium links return redirect_mode='instant'.
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
  v_redirect_mode text;
begin
  select original_url, user_id, scan_count
    into v_original_url, v_user_id, v_scan_count
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

-- ============================================================
-- Premium template enforcement at write-time (server-side)
-- ============================================================
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

  if NEW.template_id = any(v_premium_templates) and v_plan <> 'premium' then
    raise exception 'premium_template_required'
      using errcode = 'P0001',
            detail = format('Template "%s" is premium-only.', NEW.template_id);
  end if;

  if coalesce((NEW.template_payload ->> 'hide_watermark')::boolean, false) and v_plan <> 'premium' then
    raise exception 'premium_branding_required'
      using errcode = 'P0001',
            detail = 'Watermark controls are premium-only.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists short_urls_enforce_entitlements on public.short_urls;
create trigger short_urls_enforce_entitlements
  before insert or update on public.short_urls
  for each row execute function public.enforce_short_url_template_entitlements();
