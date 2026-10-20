-- Trespasser cloud storage. Approved target: Biocoded (wheanskxobszhatpyyqk).
-- This script changes ONLY new trespasser_* objects. Auth is project-wide/shared.
-- Replayable schema source, not a migration-history entry.
-- Apply only after confirming the target project, then run schema-tests.sql.
begin;

create table if not exists public.trespasser_characters (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint trespasser_characters_id_valid check (
    octet_length(id) between 1 and 200 and id = btrim(id)
  ),
  constraint trespasser_characters_data_valid check (
    jsonb_typeof(data) = 'object'
    and data ? 'id'
    and jsonb_typeof(data -> 'id') = 'string'
    and data ->> 'id' = id
    and octet_length(data::text) <= 2097152
  ),
  constraint trespasser_characters_revision_valid check (revision between 1 and 9007199254740991)
);

-- The primary key's leading user_id also indexes the RLS ownership predicate.
alter table public.trespasser_characters enable row level security;
alter table public.trespasser_characters force row level security;

revoke all on table public.trespasser_characters from public, anon, authenticated;
grant select on table public.trespasser_characters to authenticated;
grant insert (user_id, id, data, revision, deleted_at) on public.trespasser_characters to authenticated;
grant update (data, revision, deleted_at) on public.trespasser_characters to authenticated;

drop policy if exists trespasser_characters_select_own on public.trespasser_characters;
create policy trespasser_characters_select_own on public.trespasser_characters
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists trespasser_characters_insert_own on public.trespasser_characters;
create policy trespasser_characters_insert_own on public.trespasser_characters
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists trespasser_characters_update_own on public.trespasser_characters;
create policy trespasser_characters_update_own on public.trespasser_characters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE grant or policy. Keep tombstones so an offline device cannot silently
-- recreate an erased character. A recovered copy must receive a new character id.
create or replace function public.trespasser_guard_character_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception using errcode = '22023', message = 'A new character must start at revision 1.';
    end if;
    new.created_at := pg_catalog.clock_timestamp();
  else
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception using errcode = '22023', message = 'Character ownership and id are immutable.';
    end if;
    if old.deleted_at is not null then
      raise exception using errcode = '22023', message = 'A deleted character id cannot be reused.';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception using errcode = '22023', message = 'The character revision must increase by exactly one.';
    end if;
    new.created_at := old.created_at;
    -- Deleting preserves the last acknowledged server content for recovery.
    if new.deleted_at is not null then
      new.data := old.data;
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  if new.deleted_at is not null then
    new.deleted_at := new.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.trespasser_guard_character_write() from public, anon, authenticated, service_role;
drop trigger if exists trespasser_characters_guard_write on public.trespasser_characters;
create trigger trespasser_characters_guard_write
  before insert or update on public.trespasser_characters
  for each row execute function public.trespasser_guard_character_write();

-- Atomic optimistic concurrency. No SECURITY DEFINER or user-supplied owner.
-- Contract: one row = committed write, zero rows = conflict; do not blind retry.
create or replace function public.trespasser_save_character(
  p_id text,
  p_data jsonb,
  p_expected_revision bigint,
  p_deleted boolean default false
)
returns setof public.trespasser_characters
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if current_user <> 'authenticated' or v_user_id is null then
    raise exception using errcode = '42501', message = 'An authenticated user is required.';
  end if;
  if p_id is null or pg_catalog.octet_length(p_id) not between 1 and 200
     or p_id <> pg_catalog.btrim(p_id)
     or p_expected_revision is null or p_expected_revision < 0
     or p_expected_revision >= 9007199254740991 or p_deleted is null
     or p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object'
     or not (p_data ? 'id') or pg_catalog.jsonb_typeof(p_data -> 'id') <> 'string'
     or p_data ->> 'id' is distinct from p_id
     or pg_catalog.octet_length(p_data::text) > 2097152 then
    raise exception using errcode = '22023', message = 'Invalid character id, data, revision or deletion flag.';
  end if;

  if p_expected_revision = 0 then
    return query
      insert into public.trespasser_characters as c (user_id, id, data, revision, deleted_at)
      values (v_user_id, p_id, p_data, 1,
        case when p_deleted then pg_catalog.clock_timestamp() else null end)
      on conflict (user_id, id) do nothing
      returning c.*;
  else
    return query
      update public.trespasser_characters as c
      set data = case when p_deleted then c.data else p_data end,
          revision = c.revision + 1,
          deleted_at = case when p_deleted then pg_catalog.clock_timestamp() else null end
      where c.user_id = v_user_id and c.id = p_id
        and c.revision = p_expected_revision and c.deleted_at is null
      returning c.*;
  end if;
end;
$$;

revoke all on function public.trespasser_save_character(text, jsonb, bigint, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.trespasser_save_character(text, jsonb, bigint, boolean) to authenticated;

comment on table public.trespasser_characters is
  'Private per-account character snapshots. Read tombstones during synchronization; filter them only in the sheet list.';
comment on function public.trespasser_save_character(text, jsonb, bigint, boolean) is
  'CAS save: expected 0 creates revision 1; matching revision updates. Empty result means conflict. Deleted ids never resurrect.';

commit;
