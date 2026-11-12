# Credo (eTranzact) payments in Glimms

Credo is eTranzact's payment gateway (docs: https://docs.credocentral.com). It lets
Nigerian customers pay in naira by card or bank transfer. Glimms offers it
alongside Paystack (see `PAYSTACK.md`).

## What Credo can and cannot do

| | |
|---|---|
| Hosted checkout page (card, bank transfer) | Yes, used here |
| Verify a payment server-side | Yes, used here |
| Webhooks | Yes, used here |
| Subscriptions / automatic renewal / saved-card charging | **Not documented.** The changelog lists recurring payments as "upcoming" |
| Customer billing portal | No |
| Direct card charge | Needs PCI-DSS certification and Credo's approval; not used |

Because Credo cannot renew a card by itself, a Credo purchase in Glimms is a
**pass**: one payment buys `CREDO_PERIOD_DAYS` (default 30) of Premium or Pro.
It does not renew. Buying the same tier again before it runs out adds the days
to the end.

## Flow

1. App: `GET /api/subscriptions/credo/plans`. The paywall shows "Pay in naira"
   only if this returns plans.
2. App: `POST /api/subscriptions/credo/checkout {tier}`. The API calls Credo's
   `POST /transaction/initialize` (public key), stores a pending payment row
   and returns the hosted checkout URL and our reference.
3. App opens the URL in an in-app browser session. The app only opens HTTPS
   URLs on Credo's checkout hosts.
4. Credo redirects to `GET <PUBLIC_API_URL>/account/credo/return`, which
   re-verifies and redirects to `glimms://billing/return?status=...`.
5. App: `POST /api/subscriptions/credo/confirm {reference}` until the answer is
   `paid` or `failed`. The app never decides by itself that a payment succeeded.
6. Credo also calls `POST /api/subscriptions/credo/webhook`. A sweep every five
   minutes re-checks payments still pending and ends passes that have run out.

Access is granted only when Credo's `GET /transaction/{ref}/verify` (secret key)
says the payment succeeded **and** the amount, currency and reference match
what was stored, and only once per payment. Credo's webhook signature is
`SHA512(secretKey + businessCode)`: it is the same for every call and does not
cover the body, so the webhook is treated as a hint to verify, never as proof.

Paystack and Credo are mutually exclusive: a user with an active Paystack
subscription cannot buy a pass, and the reverse (both answer 409).

## Setup

1. Create a Credo business account and take the key pair from the dashboard
   (sandbox and live have separate pairs).
2. API environment:

   | Variable | Value |
   |---|---|
   | `CREDO_PUBLIC_KEY`, `CREDO_SECRET_KEY` | from the dashboard; blank turns Credo off |
   | `CREDO_BASE_URL` | `https://api.credodemo.com` (sandbox) or `https://api.credocentral.com` (live) |
   | `CREDO_PREMIUM_AMOUNT`, `CREDO_PRO_AMOUNT` | price in kobo (`250000` = NGN 2,500); blank = tier not sold |
   | `CREDO_CURRENCY` | `NGN` |
   | `CREDO_PERIOD_DAYS` | `30` |
   | `CREDO_FEE_BEARER` | `1` merchant absorbs Credo's fee, `0` customer pays it on top |
   | `CREDO_APP_RETURN_URL` | `glimms://billing/return` |
   | `PUBLIC_API_URL` | public HTTPS URL of the API |

3. Credo dashboard, Settings, Webhooks: `<PUBLIC_API_URL>/api/subscriptions/credo/webhook`.
4. Run the migration `20261113000000_credo_payments.sql`.
5. Sandbox test card: `5399 8383 8383 8381`, CVV `470`, expiry `10/28`, PIN `1234`, OTP `123456`.

## Not yet verified

Everything is tested against a stubbed Credo. No call has been made to Credo's
sandbox, so the first sandbox payment is the real test of the request and
response shapes. The docs name the webhook signature header two ways
(`X-Credo-Signature` and `credo-signature`); the API accepts either.

## Store policy

Apple and Google generally require in-app purchase for digital subscriptions
bought inside the app. Selling Premium/Pro through Paystack or Credo may be
rejected at review, depending on the storefront. Decide this before submitting.
