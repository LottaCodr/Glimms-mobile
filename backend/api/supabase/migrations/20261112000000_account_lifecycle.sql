-- Account lifecycle: verified email, social sign-in identities, one-time
-- account tokens (password reset, email verification), Stripe webhook
-- de-duplication, and a work list for erasing a deleted account's files.

alter table public.users
  add column email_verified_at timestamptz,
  add column google_sub        text,
  add column apple_sub         text,
  add constraint users_google_sub_key unique (google_sub),
  add constraint users_apple_sub_key  unique (apple_sub);


-- One-time tokens sent by email. Only the SHA-256 hash is stored, so a
-- database leak cannot be used to reset passwords.
create table public.account_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  purpose    text        not null,
  token_hash text        not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint account_tokens_token_hash_key unique (token_hash),
  constraint account_tokens_purpose_valid  check (purpose in ('password_reset', 'email_verification'))
);

create index account_tokens_user_purpose_idx on public.account_tokens (user_id, purpose);
create index account_tokens_expires_at_idx   on public.account_tokens (expires_at);


-- Stripe delivers webhooks at least once. Recording each event id makes
-- handling exactly-once.
create table public.stripe_events (
  event_id    text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);

create index stripe_events_received_at_idx on public.stripe_events (received_at);


-- A deleted account's rows go immediately; its files and vectors live in other
-- systems. Each row here is an erasure still owed, retried until it succeeds.
-- Deliberately no foreign key: the user row no longer exists.
create table public.account_erasures (
  user_id      uuid        primary key,
  attempts     integer     not null default 0,
  last_error   text,
  requested_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger account_erasures_set_updated_at
  before update on public.account_erasures
  for each row execute function public.set_updated_at();


alter table public.account_tokens   enable row level security;
alter table public.stripe_events    enable row level security;
alter table public.account_erasures enable row level security;

do $$
declare
  api_role   text;
  table_name text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      foreach table_name in array array['account_tokens', 'stripe_events', 'account_erasures'] loop
        execute format('revoke all on table public.%I from %I', table_name, api_role);
      end loop;
    end if;
  end loop;
end;
$$;
