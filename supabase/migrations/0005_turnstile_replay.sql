-- 0005_turnstile_replay.sql
-- Atomic short-lived claims for HMAC digests of verified challenge tokens.

create table if not exists public.submission_token_claims (
  fingerprint text primary key
    constraint submission_token_claims_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint submission_token_claims_window_check
    check (expires_at > claimed_at)
);

create index if not exists submission_token_claims_expires_idx
on public.submission_token_claims (expires_at);

alter table public.submission_token_claims enable row level security;

revoke all on table public.submission_token_claims
from anon, authenticated, service_role, public;

create or replace function public.claim_submission_token(
  p_fingerprint text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_claimed boolean;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid token fingerprint';
  end if;

  delete from public.submission_token_claims
  where fingerprint = p_fingerprint
    and expires_at <= v_now;

  insert into public.submission_token_claims (
    fingerprint,
    claimed_at,
    expires_at
  ) values (
    p_fingerprint,
    v_now,
    v_now + interval '10 minutes'
  )
  on conflict (fingerprint) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

alter function public.claim_submission_token(text) owner to postgres;
revoke all on function public.claim_submission_token(text)
from anon, authenticated, service_role, public;
grant usage on schema public to service_role;
grant execute on function public.claim_submission_token(text)
to service_role;

create or replace function public.delete_expired_submission_rate_limits()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rate_limits_deleted bigint;
  v_token_claims_deleted bigint;
begin
  delete from public.submission_rate_limits
  where expires_at <= statement_timestamp();
  get diagnostics v_rate_limits_deleted = row_count;

  delete from public.submission_token_claims
  where expires_at <= statement_timestamp();
  get diagnostics v_token_claims_deleted = row_count;

  return v_rate_limits_deleted + v_token_claims_deleted;
end;
$$;

alter function public.delete_expired_submission_rate_limits()
owner to postgres;
revoke all on function public.delete_expired_submission_rate_limits()
from anon, authenticated, service_role, public;
