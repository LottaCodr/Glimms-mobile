# Paystack subscriptions in Glimms

Paystack bills the renewing card subscriptions (Premium and Pro). It replaced
Stripe. Credo naira passes still sit alongside it (see `CREDO.md`).

## How it works

1. App: `GET /api/subscriptions/prices`. The API reads each plan (name, amount,
   currency, interval) from Paystack and caches it for 10 minutes.
2. App: `POST /api/subscriptions/checkout {tier}`. The API calls Paystack's
   `POST /transaction/initialize` with the plan code and returns the hosted
   checkout URL and a reference.
3. The app opens the URL in an in-app browser session. It only opens HTTPS
   URLs on `paystack.com` hosts.
4. Paystack redirects to `GET <PUBLIC_API_URL>/account/paystack/return`, which
   re-checks the payment and redirects to `glimms://billing/return?status=...`.
5. App: `POST /api/subscriptions/confirm {reference}` until the answer is
   `paid` or `failed`.
6. Paystack creates the subscription moments after the first charge and sends
   webhooks to `POST /api/subscriptions/webhook` for renewals, failures and
   cancellations.
7. "Manage billing" in the app opens Paystack's own subscription page
   (`GET /subscription/:code/manage/link`), where the customer updates the
   card or cancels.

## Rules

- Access is granted only from what Paystack answers when asked with the secret
  key (`/transaction/verify`, `/subscription/:code`). The browser redirect and
  the webhook body only say what to look up. The webhook signature
  (HMAC-SHA512 of the raw body with the secret key) is still checked.
- The tier comes from the plan code, never from request data or metadata.
- Cancelling keeps the plan until the paid period ends.
- A failed renewal keeps the tier for 7 days (`past_due`), then drops to free.
- A sweep every 5 minutes re-checks subscriptions whose renewal date passed
  more than a day ago, so a missed webhook corrects itself.
- Paystack events have no id, so redeliveries are detected by a hash of the body.
- Deleting an account first disables the Paystack subscription. If Paystack
  cannot be reached, the account is not deleted. Paystack has no API to delete
  a customer, so the customer record stays in your Paystack dashboard.
- A user cannot hold a Paystack subscription and a Credo pass at once (409).

## Setup

1. Paystack dashboard, Payments, Plans: create a Premium and a Pro plan
   (monthly, quarterly, biannual or annual; weekly and daily also work,
   hourly is not supported). Copy each plan code (`PLN_...`).
2. API environment:

   | Variable | Value |
   |---|---|
   | `PAYSTACK_SECRET_KEY` | `sk_test_...` or `sk_live_...`; blank turns card billing off |
   | `PAYSTACK_PREMIUM_PLAN_CODE`, `PAYSTACK_PRO_PLAN_CODE` | plan codes; blank = tier not sold |
   | `PAYSTACK_APP_RETURN_URL` | `glimms://billing/return` (default) |
   | `PUBLIC_API_URL` | public HTTPS URL of the API |
   | `FREE_SCAN_LIMIT`, `PREMIUM_SCAN_LIMIT` | replace `STRIPE_FREE_SCAN_LIMIT`, `STRIPE_PREMIUM_SCAN_LIMIT` |

   Remove every `STRIPE_*` variable. There is no webhook secret: Paystack
   signs with the secret key.
3. Paystack dashboard, Settings, API Keys & Webhooks: set the webhook URL to
   `<PUBLIC_API_URL>/api/subscriptions/webhook`.
4. Run the migration `20261114000000_paystack.sql`.

## Moving from Stripe

The migration clears Stripe ids and returns anyone whose paid tier came from a
Stripe subscription to the free tier. It does not cancel anything at Stripe.
If any live Stripe subscriptions exist, cancel them in the Stripe dashboard
first, or those customers keep being charged with no plan in the app.

## Not yet verified

Everything is tested against a stand-in for Paystack built from Paystack's
published OpenAPI description. No call has been made to the real service, so
run one test-mode purchase, one cancellation from the manage page, and check
that the webhooks arrive.

Paystack's subscription statuses `attention`, `non-renewing`, `completed` and
`cancelled` are handled as the documentation describes them; how quickly
Paystack moves a subscription between them was not observed.

## Store policy

Apple and Google generally require in-app purchase for digital subscriptions
bought inside the app. Selling Premium/Pro through Paystack or Credo may be
rejected at review, depending on the storefront.
