# Glimms — feature audit and gap analysis

> **Out of date in places.** Written before account deletion, password reset,
> social sign-in, Expo push and Credo were added, and before billing moved
> from Stripe to Paystack. Read "Stripe" below as history; the current billing
> design is in `PAYSTACK.md` and `CREDO.md`.

Audited 2026-11-11 against the code in this repository (mobile app at the root,
`backend/api`, `backend/ai`). "Verified" means exercised by an automated test in
this repo. Nothing here was run against live Stripe, Supabase, S3, Redis,
Firebase, Pinecone or Render, and no real model weights were loaded.

## Summary

| Area | State |
| --- | --- |
| Auth (email + password, rotating refresh tokens) | Working, tested on both sides |
| Scan → design session → results → save | Wired end to end; AI quality unproven with real models |
| Catalog, saved designs, preferences, analytics | Working, tested in the API |
| Subscriptions | Prices, checkout, portal and webhooks implemented and tested with a fake Stripe |
| Push notifications | Android path plausible; iOS will not deliver (see B1) |
| AI models | Packaged into the image build; never built or run here |
| Hosting | AI blueprint exists; API has no blueprint entry |

## A. Must fix before taking payments or shipping to a store

1. **Account deletion only deactivates.** `DELETE /api/users/me` sets
   `is_active = false`. It does not cancel the Stripe subscription (the user
   keeps being billed), and it leaves photos in S3, vectors in Pinecone and
   device tokens in place. Apple and Google both require real in-app account
   deletion.
2. **No password reset and no email verification.** There is no
   forgot-password route or screen. SendGrid is only used for a welcome email.
   A user who forgets their password is locked out.
3. **Social sign-in buttons do nothing.** Google and Apple buttons on login,
   register and onboarding show "coming soon". Apple rejects apps that show
   non-functional sign-in options; remove them or implement them.
4. **Stripe is unverified against the real service.** Set
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`,
   `STRIPE_PRO_PRICE_ID` and the three return URLs on the API, enable the
   billing portal in the Stripe dashboard, and run one test-mode purchase,
   plan change and cancellation. Until the price IDs are set the paywall shows
   "Upgrades aren't available right now".
5. **Selling digital subscriptions through Stripe in a store build.** Apple
   and Google generally require their own in-app purchase for digital goods.
   This is a policy decision, not a code defect, but it can block review.
6. **AI image has never been built.** `backend/ai/Dockerfile` exports
   YOLO-World, CLIP and U²-Net to ONNX in a build stage. That stage, the
   export script and the models themselves were not run (no Docker and no
   access to the weight hosts in the build sandbox). The first real build is
   the test. The tests use small synthetic ONNX models with the same
   input/output contract.

## B. Functional gaps

1. **iOS push will not arrive.** The app registers the native device token.
   On iOS that is an APNs token, but the API sends through Firebase
   (`messaging().send({ token })`), which needs an FCM registration token.
   Either add Firebase Messaging to the iOS build or send iOS pushes through
   APNs/Expo. Android also needs `google-services.json` in the build; none is
   configured in `app.json`.
2. **Dead push tokens are never removed.** Failed sends are counted and
   logged; unregistered tokens stay in `device_tokens`.
3. **Detection is zero-shot and untuned.** YOLO-World with a fixed vocabulary
   and a 0.25 confidence threshold. There is no evaluation set, so accuracy on
   real wardrobe, room and garden photos is unknown.
4. **Embeddings are written but never searched.** The worker upserts item
   vectors to Pinecone; nothing calls the search endpoint, so there is no
   "similar items" or cross-session recall feature yet.
5. **LLM reasoning needs a paid key for production quality.** Without
   `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` the service runs on the free
   fallback provider, which the gateway reports as degraded.
6. **Stripe webhooks are not de-duplicated or ordered.** Handlers are
   idempotent per event, but a late `subscription.updated` arriving after
   `subscription.deleted` would re-activate the row. Store processed event
   IDs, or re-read the subscription from Stripe in the handler.
7. **Tier changes reach the scan limiter through the access token.** The app
   now rotates the token right after a purchase or portal visit. A downgrade
   made elsewhere (web, failed payment) takes effect when the token next
   refreshes, up to 15 minutes later.
8. **Scan limit fails open.** If Redis is unreachable every scan is allowed.
9. **Offline queue retries forever.** A queued scan whose photo file has been
   deleted, or that the API permanently rejects, is retried on every
   reconnect and never surfaced to the user. Queued scans also never navigate
   the user to the resulting session.
10. **Starting the app offline shows onboarding.** The stored session is now
    kept (previously it was wiped), but the user still sees the signed-out
    flow until the next launch with a connection.
11. **Catalog items cannot be added manually** without an existing S3 key;
    scanning is the only way in. Deleted items cannot be restored.
12. **No MongoDB → Postgres data import.** Existing users, catalogs and
    designs from the old database are not carried over; every user must
    register or sign in again.

## C. Deployment and operations

1. **The API is not in `render.yaml`.** Only the AI services are defined. The
   API needs a web service (Docker, context `backend/api`, pre-deploy
   `npm run db:migrate:prod`, health check `/health`), a Redis instance with
   `noeviction`, and `DATABASE_URL` pointing at the Supabase session pooler.
2. **Worker and HTTP server share one process.** Fine for one instance;
   scaling the API also multiplies pipeline workers.
3. **AI service memory.** The plan in `render.yaml` was raised to `standard`
   because three ONNX models plus eight processes do not fit in 512 MB. Real
   usage is unmeasured.
4. **Pinecone index must exist** with 512 dimensions and cosine metric before
   `PINECONE_API_KEY` / `PINECONE_INDEX` are set.
5. **Never run:** the GitHub workflows, the Docker builds, the Render
   blueprint, the Supabase migration against a real project, and the Metro and
   EAS exclusions for `backend/`.
6. **`npm audit`** reports advisories in `backend/api` production
   dependencies that have not been triaged.

## D. Test coverage

| Suite | Tests | Covers | Does not cover |
| --- | --- | --- | --- |
| Mobile (`npm test`) | 71 | API client (auth header, refresh, error mapping), auth store, upload flow, offline queue, subscription service, plan pricing, pricing card, paywall screen | Every other screen, WebSocket progress, notifications, navigation guard, camera |
| API (`npm test`) | 196 | Routes, services, repositories on an in-memory Postgres; billing with a fake Stripe | The BullMQ worker pipeline end to end, Socket.IO, real Redis/S3 |
| AI (`python -m pytest -q`) | 62 | Gateway, auth, each service, model loading and inference with synthetic ONNX models | Real model accuracy, the export script, the Docker build |

There are no end-to-end tests that drive the app against a running API.

## E. Screens

| Screen | State |
| --- | --- |
| Onboarding, quiz, login, register | Live; social buttons are placeholders (A3) |
| Home, wardrobe, saved, profile, activity, preferences | Live, backed by the API |
| Scan (`screens/scan`) and style setup (`screens/style-setup`) | Live. Style setup is part of the flow: the scan screen opens it to set occasion and style, which are sent with the session |
| Session progress and results (`session/[id]`), job detail (`jobs/[id]`) | Live |
| Paywall | Live; plans and prices now come from the API |
| `screens/processing`, `screens/results` | **Removed.** They showed hard-coded sample outfits and nothing navigated to them; `session/[id]` does both jobs with real data |
| `screens/upload/upload`, `screens/upload/review` | Unreachable. They call the real session API but duplicate the scan screen (wardrobe only). Left in place; remove or link deliberately |
| Legal (terms, privacy) | Static text. The privacy policy describes deactivation, which matches the code but not store requirements (A1) |

Several empty placeholder files remain (`constants/*.ts`, `lib/utils/formatters.ts`,
`lib/utils/validators.ts`, `types/api.types.ts`, `types/payment.types.ts`,
`types/style.types.ts`, `components/buttons/SecondaryButton.tsx`) and
`services/calender.service.ts` is unused.
