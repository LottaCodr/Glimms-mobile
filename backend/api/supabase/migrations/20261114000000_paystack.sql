-- Card subscriptions move from Stripe to Paystack.
--
-- Stripe identifiers mean nothing to Paystack, so they are cleared. Anyone
-- whose paid tier came from a Stripe subscription returns to the free tier:
-- this API can no longer see or manage that subscription. Cancel any live
-- Stripe subscriptions in the Stripe dashboard before running this, otherwise
-- those customers keep being charged by Stripe.

update public.users u
   set tier = 'free'
  from public.subscriptions s
 where s.user_id = u.id
   and coalesce(s.provider, 'stripe') = 'stripe'
   and (s.stripe_subscription_id is not null or s.provider = 'stripe');

alter table public.subscriptions drop constraint if exists subscriptions_provider_valid;

update public.subscriptions
   set status = 'inactive', provider = null, current_period_end = null, cancel_at_period_end = false
 where coalesce(provider, 'stripe') = 'stripe'
   and (stripe_subscription_id is not null or provider = 'stripe');

update public.subscriptions set stripe_customer_id = null, stripe_subscription_id = null;

alter table public.subscriptions rename column stripe_customer_id to paystack_customer_code;
alter table public.subscriptions rename column stripe_subscription_id to paystack_subscription_code;
alter index public.subscriptions_stripe_customer_id_idx rename to subscriptions_paystack_customer_code_idx;

create index subscriptions_paystack_subscription_code_idx
  on public.subscriptions (paystack_subscription_code)
  where paystack_subscription_code is not null;

alter table public.subscriptions
  add constraint subscriptions_provider_valid check (provider in ('paystack', 'credo'));

-- Webhook de-duplication. Paystack events carry no id, so the key is a hash
-- of the delivered body.
alter table public.stripe_events rename to paystack_events;
alter index public.stripe_events_received_at_idx rename to paystack_events_received_at_idx;
delete from public.paystack_events;
