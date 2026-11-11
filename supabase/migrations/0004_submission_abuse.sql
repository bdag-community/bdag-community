-- 0004_submission_abuse.sql
-- Durable abuse counters for public submissions.
-- Rows hold a scoped HMAC digest, a fixed window, and a count only.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.submission_rate_limits (
  scope text not null
    constraint submission_rate_limits_scope_check
    check (scope in ('challenge', 'article', 'suggestion', 'contact')),
  fingerprint text not null
    constraint submission_rate_limits_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null
    constraint submission_rate_limits_count_check
    check (request_count > 0),
  expires_at timestamptz not null,
  constraint submission_rate_limits_window_check
    check (expires_at > window_start),
  primary key (scope, fingerprint, window_start)
);

create index if not exists submission_rate_limits_expires_idx
on public.submission_rate_limits (expires_at);

alter table public.submission_rate_limits enable row level security;

revoke all on table public.submission_rate_limits
from anon, authenticated, service_role, public;

create or replace function public.delete_expired_submission_rate_limits()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.submission_rate_limits
  where expires_at <= statement_timestamp();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter function public.delete_expired_submission_rate_limits() owner to postgres;
revoke all on function public.delete_expired_submission_rate_limits()
from anon, authenticated, service_role, public;

create or replace function public.consume_submission_rate_limit(
  p_scope text,
  p_fingerprint text
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window interval;
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_allowed boolean;
begin
  case p_scope
    when 'challenge' then
      v_limit := 30;
      v_window := interval '10 minutes';
    when 'article' then
      v_limit := 3;
      v_window := interval '24 hours';
    when 'suggestion' then
      v_limit := 5;
      v_window := interval '1 hour';
    when 'contact' then
      v_limit := 5;
      v_window := interval '1 hour';
    else
      raise exception using
        errcode = '22023',
        message = 'invalid rate-limit scope';
  end case;

  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid rate-limit fingerprint';
  end if;

  delete from public.submission_rate_limits
  where expires_at <= v_now;

  v_window_start := date_bin(
    v_window,
    v_now,
    timestamptz '1970-01-01 00:00:00+00'
  );
  v_window_end := v_window_start + v_window;

  insert into public.submission_rate_limits as current_window (
    scope,
    fingerprint,
    window_start,
    request_count,
    expires_at
  ) values (
    p_scope,
    p_fingerprint,
    v_window_start,
    1,
    v_window_end
  )
  on conflict (scope, fingerprint, window_start) do update
  set request_count = current_window.request_count + 1
  where current_window.request_count < v_limit
  returning current_window.request_count into v_count;

  v_allowed := found;
  if not v_allowed then
    v_count := v_limit;
  end if;

  return query
  select
    v_allowed,
    greatest(v_limit - v_count, 0),
    case
      when v_allowed then 0
      else greatest(
        1,
        ceil(extract(epoch from (v_window_end - v_now)))::integer
      )
    end;
end;
$$;

alter function public.consume_submission_rate_limit(text, text)
owner to postgres;
revoke all on function public.consume_submission_rate_limit(text, text)
from anon, authenticated, service_role, public;
grant usage on schema public to service_role;
grant execute on function public.consume_submission_rate_limit(text, text)
to service_role;

do $migration$
declare
  v_job_id bigint;
begin
  select cron.schedule(
    'bdag-community-submission-rate-retention',
    '17 * * * *',
    $job$select public.delete_expired_submission_rate_limits();$job$
  ) into v_job_id;
  perform cron.alter_job(v_job_id, active => true);
end;
$migration$;
