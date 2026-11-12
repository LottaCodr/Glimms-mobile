-- Credo (eTranzact) payments: one-off naira payments that buy a fixed period of
-- a paid tier. Credo has no recurring billing, so each row is one purchase and
-- the subscription row carries the date the paid period ends.

alter table public.subscriptions
  add column provider text,
  add constraint subscriptions_provider_valid check (provider in ('stripe', 'credo'));

update public.subscriptions set provider = 'stripe' where stripe_subscription_id is not null;

-- The expiry sweep looks for Credo passes whose period has ended.
create index subscriptions_credo_expiry_idx
  on public.subscriptions (current_period_end)
  where provider = 'credo' and status = 'active';

create table public.credo_payments (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users (id) on delete cascade,
  -- Our reference (Credo's "businessRef"); also the idempotency key.
  reference       text        not null,
  -- Credo's reference ("transRef"), known once the transaction is initialised.
  credo_reference text,
  tier            text        not null,
  -- What was asked for, in the minor unit (kobo). Compared against what Credo
  -- reports before anything is granted.
  amount_minor    integer     not null,
  currency        text        not null,
  period_days     integer     not null,
  status          text        not null default 'pending',
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint credo_payments_reference_key       unique (reference),
  constraint credo_payments_credo_reference_key unique (credo_reference),
  constraint credo_payments_tier_valid          check (tier in ('premium', 'pro')),
  constraint credo_payments_status_valid        check (status in ('pending', 'paid', 'failed')),
  constraint credo_payments_amount_positive     check (amount_minor > 0),
  constraint credo_payments_period_positive     check (period_days > 0)
);

create index credo_payments_user_id_idx on public.credo_payments (user_id, created_at desc);

create trigger credo_payments_set_updated_at
  before update on public.credo_payments
  for each row execute function public.set_updated_at();

alter table public.credo_payments enable row level security;

-- Only the API (service role / direct connection) reads or writes payments.
do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on table public.credo_payments from %I', api_role);
    end if;
  end loop;
end;
$$;
