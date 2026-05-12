-- ============================================================
-- Premium frame logo library and short_url linkage
-- ============================================================

create table if not exists public.user_logos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes integer not null,
  width_px integer not null,
  height_px integer not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_logos_mime_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint user_logos_file_size_check check (file_size_bytes > 0 and file_size_bytes <= 1048576),
  constraint user_logos_width_check check (width_px between 64 and 1024),
  constraint user_logos_height_check check (height_px between 64 and 1024)
);

create index if not exists user_logos_user_active_idx
  on public.user_logos (user_id, is_active, created_at desc);

create unique index if not exists user_logos_one_default_per_user_idx
  on public.user_logos (user_id)
  where is_default and is_active;

alter table public.user_logos enable row level security;

drop policy if exists "user_logos: owner read" on public.user_logos;
create policy "user_logos: owner read"
  on public.user_logos
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_logos: owner insert" on public.user_logos;
create policy "user_logos: owner insert"
  on public.user_logos
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_logos: owner update" on public.user_logos;
create policy "user_logos: owner update"
  on public.user_logos
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_logos: owner delete" on public.user_logos;
create policy "user_logos: owner delete"
  on public.user_logos
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at_user_logos()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists set_updated_at_user_logos on public.user_logos;
create trigger set_updated_at_user_logos
  before update on public.user_logos
  for each row execute function public.set_updated_at_user_logos();

create or replace function public.enforce_user_logo_entitlements()
returns trigger language plpgsql security definer as $$
declare
  v_plan text := 'free';
  v_active_count integer := 0;
begin
  select plan into v_plan
  from public.profiles
  where id = NEW.user_id;

  if coalesce(v_plan, 'free') <> 'premium' then
    raise exception 'premium_logo_access_required'
      using errcode = 'P0001',
            detail = 'Frame logo uploads are premium-only.';
  end if;

  if TG_OP = 'INSERT' and NEW.is_active then
    select count(*) into v_active_count
    from public.user_logos
    where user_id = NEW.user_id
      and is_active = true;

    if v_active_count >= 5 then
      raise exception 'logo_limit_exceeded'
        using errcode = 'P0001',
              detail = 'You can store up to 5 logos. Delete one before adding another.';
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.is_active and not OLD.is_active then
    select count(*) into v_active_count
    from public.user_logos
    where user_id = NEW.user_id
      and is_active = true
      and id <> NEW.id;

    if v_active_count >= 5 then
      raise exception 'logo_limit_exceeded'
        using errcode = 'P0001',
              detail = 'You can store up to 5 logos. Delete one before adding another.';
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

drop trigger if exists user_logos_enforce_entitlements on public.user_logos;
create trigger user_logos_enforce_entitlements
  before insert or update on public.user_logos
  for each row execute function public.enforce_user_logo_entitlements();

alter table public.short_urls
  add column if not exists qr_type text not null default 'standard',
  add column if not exists frame_logo_id uuid references public.user_logos(id) on delete set null;

alter table public.short_urls
  drop constraint if exists short_urls_qr_type_check;

alter table public.short_urls
  add constraint short_urls_qr_type_check
  check (qr_type in ('standard', 'frame', 'micro', 'rmqr', 'iqr', 'sqrc'));

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

  if coalesce(v_plan, 'free') <> 'premium' then
    raise exception 'premium_logo_access_required'
      using errcode = 'P0001',
            detail = 'Frame logos are premium-only.';
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

drop trigger if exists short_urls_enforce_frame_logo_entitlements on public.short_urls;
create trigger short_urls_enforce_frame_logo_entitlements
  before insert or update on public.short_urls
  for each row execute function public.enforce_short_url_frame_logo_entitlements();

insert into storage.buckets (id, name, public)
values ('user-logos', 'user-logos', true)
on conflict (id) do nothing;

drop policy if exists "user-logos: owner insert" on storage.objects;
create policy "user-logos: owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user-logos: owner update" on storage.objects;
create policy "user-logos: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user-logos: owner delete" on storage.objects;
create policy "user-logos: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );