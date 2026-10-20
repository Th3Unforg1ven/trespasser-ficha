-- ROLLBACK-only integration checks. Run after havens-schema.sql in an approved project.
-- Uses FOUR existing Auth accounts. Account ids are selected inside this
-- transaction, never committed to the repository. This script never writes
-- auth.users, authentication settings, sessions, profiles, or permanent rows.
-- SQL JWT claims simulate PostgREST's already-verified claims. Never accept these
-- claims from a browser without GoTrue/JWT verification.
begin;
-- Character rows are only inspected via aggregate metadata and never modified.
select set_config('trespasser.haven_test_character_count', (select count(*)::text from public.trespasser_characters), true);
select set_config('trespasser.haven_test_character_revisions', (select coalesce(sum(revision), 0)::text from public.trespasser_characters), true);
select set_config('trespasser.haven_test_id', 'haven-schema-test-' || txid_current()::text, true);

do $$
declare
  v_users uuid[];
begin
  select array_agg(id order by created_at, id) into v_users
  from (select id, created_at from auth.users order by created_at, id limit 4) as existing_users;
  if coalesce(array_length(v_users, 1), 0) <> 4 then
    raise exception 'The rollback-only test requires FOUR existing Auth users.';
  end if;
  perform set_config('trespasser.haven_test_user_a', v_users[1]::text, true);
  perform set_config('trespasser.haven_test_user_b', v_users[2]::text, true);
  perform set_config('trespasser.haven_test_user_c', v_users[3]::text, true);
  perform set_config('trespasser.haven_test_user_d', v_users[4]::text, true);
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.trespasser_havens'::regclass) then
    raise exception 'RLS must be enabled and forced.';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.trespasser_save_haven(text,jsonb,bigint,boolean)'::regprocedure) then
    raise exception 'save_haven must remain SECURITY INVOKER.';
  end if;
  if has_function_privilege('anon', 'public.trespasser_save_haven(text,jsonb,bigint,boolean)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.trespasser_havens', 'DELETE')
     or has_table_privilege('anon', 'public.trespasser_havens', 'SELECT') then
    raise exception 'Unexpected public, anonymous or hard-delete grants.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('trespasser.haven_test_user_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trespasser.haven_test_user_a'), 'role', 'authenticated')::text, true);

do $$
declare
  v_id text := current_setting('trespasser.haven_test_id');
  v_row public.trespasser_havens;
  v_count integer;
begin
  select * into strict v_row from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'João: ação e coração'), 0);
  if v_row.revision <> 1 or v_row.user_id <> auth.uid() or v_row.deleted_at is not null then
    raise exception 'Create must return exactly the caller-owned revision 1.';
  end if;
  select * into strict v_row from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Atualizado no computador'), 1);
  if v_row.revision <> 2 then raise exception 'Expected revision 2.'; end if;
  select count(*) into v_count from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Stale mobile edit'), 1);
  if v_count <> 0 then raise exception 'Stale update must conflict.'; end if;
  select count(*) into v_count from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id), 0);
  if v_count <> 0 then raise exception 'Duplicate create must conflict.'; end if;
  if exists (select from public.trespasser_havens where user_id <> auth.uid()) then
    raise exception 'RLS leaked another account.';
  end if;
  begin
    perform public.trespasser_save_haven(v_id, '{"kind":"haven","id":"wrong-id"}'::jsonb, 2);
    raise exception 'Expected invalid data id to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.trespasser_save_haven(v_id, jsonb_build_object('id', v_id, 'kind', 'character'), 2);
    raise exception 'Expected a character payload in the Haven endpoint to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.trespasser_save_haven(v_id, jsonb_build_object('id', v_id), 2);
    raise exception 'Expected a missing Haven kind to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.trespasser_save_haven(v_id, '[]'::jsonb, 2);
    raise exception 'Expected non-object data to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id), -1);
    raise exception 'Expected invalid revision to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'notes', repeat('x', 2097152)), 2);
    raise exception 'Expected oversized data to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.trespasser_havens (user_id, id, data)
    values (current_setting('trespasser.haven_test_user_b')::uuid, v_id || '-forged', jsonb_build_object('kind', 'haven', 'id', v_id || '-forged'));
    raise exception 'Expected forged ownership to fail.';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.trespasser_havens where id = v_id;
    raise exception 'Expected hard-delete permission failure.';
  exception when insufficient_privilege then null; end;
end;
$$;

-- B can use the same character id but sees an independent, B-owned row.
select set_config('request.jwt.claim.sub', current_setting('trespasser.haven_test_user_b'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trespasser.haven_test_user_b'), 'role', 'authenticated')::text, true);
do $$
declare
  v_id text := current_setting('trespasser.haven_test_id');
  v_row public.trespasser_havens;
begin
  if exists (select from public.trespasser_havens where id = v_id) then
    raise exception 'B can read A before B has its own row.';
  end if;
  select * into strict v_row from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Personagem de B'), 0);
  if v_row.user_id <> auth.uid() or v_row.revision <> 1 then raise exception 'B must own its independent row.'; end if;
  if (select count(*) from public.trespasser_havens where id = v_id) <> 1 then raise exception 'B must see exactly its own row.'; end if;
end;
$$;

-- C and D also use the same id, without seeing any other account's content.
do $$
declare
  v_id text := current_setting('trespasser.haven_test_id');
  v_user text;
  v_row public.trespasser_havens;
  v_changed integer;
begin
  foreach v_user in array array[current_setting('trespasser.haven_test_user_c'), current_setting('trespasser.haven_test_user_d')]
  loop
    perform set_config('request.jwt.claim.sub', v_user, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    if exists (select from public.trespasser_havens where id = v_id) then
      raise exception 'A third account could read an existing account fixture.';
    end if;
    update public.trespasser_havens
      set data = jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Cross-account overwrite'), revision = revision + 1
      where id = v_id and user_id = current_setting('trespasser.haven_test_user_a')::uuid;
    get diagnostics v_changed = row_count;
    if v_changed <> 0 then raise exception 'A third account could update another account.'; end if;
    select * into strict v_row from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Independent account'), 0);
    if v_row.user_id::text <> v_user or v_row.revision <> 1 then raise exception 'A third account must own its independent row.'; end if;
    if (select count(*) from public.trespasser_havens where id = v_id) <> 1 then raise exception 'Third accounts must see only their own fixture.'; end if;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('trespasser.haven_test_user_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trespasser.haven_test_user_a'), 'role', 'authenticated')::text, true);
do $$
declare
  v_id text := current_setting('trespasser.haven_test_id');
  v_row public.trespasser_havens;
  v_count integer;
begin
  select * into strict v_row from public.trespasser_havens where id = v_id;
  if v_row.data ->> 'name' <> 'Atualizado no computador' or v_row.revision <> 2 then
    raise exception 'B or a stale write changed A.';
  end if;
  select * into strict v_row from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Deletion must not overwrite content'), 2, true);
  if v_row.deleted_at is null or v_row.revision <> 3 or v_row.data ->> 'name' <> 'Atualizado no computador' then
    raise exception 'Delete must create a revision-3 tombstone and preserve server content.';
  end if;
  select count(*) into v_count from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id), 3);
  if v_count <> 0 then raise exception 'CAS cannot resurrect a tombstone.'; end if;
  select count(*) into v_count from public.trespasser_save_haven(v_id, jsonb_build_object('kind', 'haven', 'id', v_id), 0);
  if v_count <> 0 then raise exception 'Expected-0 cannot resurrect a tombstone.'; end if;
  begin
    update public.trespasser_havens set deleted_at = null, revision = 4 where id = v_id;
    raise exception 'Expected direct tombstone resurrection to fail.';
  exception when sqlstate '22023' then null; end;
  begin
    update public.trespasser_havens set data = jsonb_build_object('kind', 'haven', 'id', v_id, 'name', 'Overwrite'), revision = 4 where id = v_id;
    raise exception 'Expected direct tombstone content changes to fail.';
  exception when sqlstate '22023' then null; end;
  -- Removing a never-uploaded local id is safe too: it creates a tombstone at 1.
  select * into strict v_row from public.trespasser_save_haven(v_id || '-offline-deleted', jsonb_build_object('kind', 'haven', 'id', v_id || '-offline-deleted'), 0, true);
  if v_row.deleted_at is null or v_row.revision <> 1 then raise exception 'Expected initial tombstone revision 1.'; end if;
end;
$$;

-- Both an anon role and an authenticated role without a uid are denied.
reset role;
set local role anon;
do $$
begin
  begin
    perform public.trespasser_save_haven('anonymous', '{"kind":"haven","id":"anonymous"}', 0);
    raise exception 'Expected anonymous execution to fail.';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
begin
  begin
    perform public.trespasser_save_haven('no-uid', '{"kind":"haven","id":"no-uid"}', 0);
    raise exception 'Expected missing uid to fail.';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
begin
  if (select count(*)::text from public.trespasser_characters) <> current_setting('trespasser.haven_test_character_count')
     or (select coalesce(sum(revision), 0)::text from public.trespasser_characters) <> current_setting('trespasser.haven_test_character_revisions') then
    raise exception 'Haven tests must leave character records unchanged.';
  end if;
end;
$$;
rollback;
-- If no exception was raised, all checks passed and all fixture rows rolled back.
