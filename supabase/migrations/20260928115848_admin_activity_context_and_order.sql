-- Timestamp each event at occurrence, including several events in one transaction.
alter table public.admin_activity
  alter column occurred_at set default clock_timestamp();

-- Approval and rejection entries identify the parent article or project.
create or replace function private.record_admin_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_value jsonb;
  previous_value jsonb;
  event_action text;
  event_label text;
  actor_id uuid;
  actor_mail text;
begin
  actor_id := auth.uid();
  if actor_id is null or not public.is_admin() then
    return coalesce(new, old);
  end if;

  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_value := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  event_action := lower(tg_op);

  if tg_table_name in ('article_assets', 'project_assets') then
    if tg_op <> 'UPDATE' or row_value->>'state' is not distinct from previous_value->>'state'
      or row_value->>'state' not in ('approved', 'rejected') then
      return coalesce(new, old);
    end if;
    event_action := case when row_value->>'state' = 'approved' then 'approve' else 'reject' end;
    if tg_table_name = 'article_assets' then
      select title into event_label from public.news_articles
      where id = (row_value->>'article_id')::uuid;
    else
      select name into event_label from public.community_projects
      where id = (row_value->>'project_id')::uuid;
    end if;
    event_label := coalesce(event_label, 'Cover image') || ' — cover image';
  elsif tg_table_name in ('news_articles', 'community_projects') then
    if tg_op = 'UPDATE' then
      if row_value->>'is_published' is distinct from previous_value->>'is_published' then
        event_action := case when row_value->>'is_published' = 'true' then 'publish' else 'unpublish' end;
      else
        event_action := 'edit';
      end if;
    end if;
    event_label := coalesce(row_value->>'title', row_value->>'name', 'Untitled');
  elsif tg_table_name = 'infrastructure_resources' then
    if tg_op = 'UPDATE' then event_action := 'edit'; end if;
    event_label := coalesce(row_value->>'name', 'Unnamed resource');
  elsif tg_table_name in ('contact_messages', 'suggestion_messages') then
    if tg_op <> 'DELETE' then return coalesce(new, old); end if;
    event_label := case when tg_table_name = 'contact_messages'
      then coalesce(row_value->>'name', 'Contact message')
      else coalesce(row_value->>'author_name', 'Suggestion') end;
  else
    return coalesce(new, old);
  end if;

  select email into actor_mail from auth.users where id = actor_id;
  if actor_mail is null then return coalesce(new, old); end if;
  insert into public.admin_activity
    (actor_user_id, actor_email, action, entity_type, entity_id, entity_label)
  values
    (actor_id, actor_mail, event_action, tg_table_name, row_value->>'id', event_label);
  return coalesce(new, old);
end;
$$;
revoke all on function private.record_admin_activity() from anon, authenticated, service_role, public;
