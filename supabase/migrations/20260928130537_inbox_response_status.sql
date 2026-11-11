-- Manual reply tracking for the two private admin inboxes. The public
-- submission path still has INSERT-only access and cannot set this state.
alter table public.contact_messages
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by uuid;

alter table public.suggestion_messages
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by uuid;

-- Admins may change only the status field. The trigger records the trusted
-- timestamp and actor; neither is accepted from the browser.
grant update (responded_at) on table public.contact_messages to authenticated;
grant update (responded_at) on table public.suggestion_messages to authenticated;

drop policy if exists "contact: admins update response" on public.contact_messages;
create policy "contact: admins update response"
  on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "suggestions: admins update response" on public.suggestion_messages;
create policy "suggestions: admins update response"
  on public.suggestion_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function private.set_message_response_metadata()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.responded_at is null then
    new.responded_by := null;
  else
    new.responded_at := clock_timestamp();
    new.responded_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists contact_response_metadata on public.contact_messages;
create trigger contact_response_metadata
  before update of responded_at on public.contact_messages
  for each row execute function private.set_message_response_metadata();
drop trigger if exists suggestion_response_metadata on public.suggestion_messages;
create trigger suggestion_response_metadata
  before update of responded_at on public.suggestion_messages
  for each row execute function private.set_message_response_metadata();

create or replace function private.record_message_response_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  actor_mail text;
  event_action text;
  event_label text;
begin
  if new.responded_at is not distinct from old.responded_at then
    return new;
  end if;
  actor_id := auth.uid();
  if actor_id is null or not public.is_admin() then
    return new;
  end if;
  select email into actor_mail from auth.users where id = actor_id;
  if actor_mail is null then return new; end if;

  event_action := case when new.responded_at is null then 'unrespond' else 'respond' end;
  event_label := case when tg_table_name = 'contact_messages'
    then coalesce(to_jsonb(new)->>'name', 'Contact message')
    else coalesce(to_jsonb(new)->>'author_name', 'Suggestion') end;
  insert into public.admin_activity
    (actor_user_id, actor_email, action, entity_type, entity_id, entity_label)
  values
    (actor_id, actor_mail, event_action, tg_table_name, new.id::text, event_label);
  return new;
end;
$$;

revoke all on function private.set_message_response_metadata() from public, anon, authenticated, service_role;
revoke all on function private.record_message_response_activity() from public, anon, authenticated, service_role;

drop trigger if exists admin_activity_contact_response on public.contact_messages;
create trigger admin_activity_contact_response
  after update of responded_at on public.contact_messages
  for each row execute function private.record_message_response_activity();
drop trigger if exists admin_activity_suggestion_response on public.suggestion_messages;
create trigger admin_activity_suggestion_response
  after update of responded_at on public.suggestion_messages
  for each row execute function private.record_message_response_activity();
