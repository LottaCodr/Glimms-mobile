# glimms-api

> The Glimms backend — a single **Express.js + PostgreSQL (Supabase)** server handling all API routing, business logic, authentication, real-time WebSocket events, and the background AI pipeline worker.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Express.js 4 |
| Database | **PostgreSQL on Supabase**, via `pg` (node-postgres) and plain SQL migrations |
| Cache / Queue | Redis 7 + BullMQ |
| Real-time | Socket.IO |
| Storage | AWS S3 |
| Payments | Stripe |
| Push notifications | Expo push service (relays to APNs / FCM) |
| Naira payments | Credo by eTranzact (hosted checkout, 30-day passes) |
| Email | SendGrid |
| Style vectors | Pinecone |

---

## Database: Supabase Postgres

The API is the only client of the database. It connects with a normal Postgres
connection string (`DATABASE_URL`) using `pg`, so the same code runs against
Supabase, the local Postgres container, and the in-process PGlite used by tests.

- **Supabase is used as managed Postgres.** Authentication stays in this service
  (JWT + bcrypt), files stay in S3 and vectors in Pinecone. Supabase Auth,
  Storage and the auto-generated REST API are not used.
- **Row Level Security is enabled on every table with no policies**, and the
  `anon` / `authenticated` roles have no privileges. The Supabase REST API and
  the public anon key therefore cannot read or write anything; only this
  service's database role can. Never put the database password in the mobile app.
- **Relational where the shape is known, `jsonb` where it is not.** Users,
  tokens, subscriptions and ownership are columns with foreign keys and CHECK
  constraints; AI output (design results, detected attributes, pipeline steps)
  is `jsonb`.
- **Ids are UUIDs.** JSON responses are unchanged: camelCase fields and `id`.

### Migrations

Schema changes are forward-only SQL files in `supabase/migrations/`, named
`<YYYYMMDDHHMMSS>_<name>.sql` — the Supabase CLI convention, recorded in the
same `supabase_migrations.schema_migrations` table the CLI uses, so
`supabase db push` and `npm run db:migrate` agree on what has been applied.

```bash
npm run db:migrate        # apply pending migrations (uses DATABASE_URL)
npm run db:migrate:prod   # same, from the compiled build (deploy/release step)
npm run seed              # dev users + sample data (refuses to run in production)
```

Each file runs in its own transaction under an advisory lock, so concurrent
deploys cannot apply the same migration twice. Never edit a migration that has
been applied anywhere — add a new file. `DB_MIGRATE_ON_START=true` applies
pending migrations at boot (handy locally; prefer the explicit step in production).

### Pointing at Supabase

1. Create a project, then **Connect → Session pooler** and copy the URI into
   `DATABASE_URL` (direct connections are IPv6-only without the IPv4 add-on;
   the transaction pooler on port 6543 is not suitable for running migrations).
2. `DATABASE_SSL` defaults to `require` for non-local hosts. For full
   verification set `DATABASE_SSL=verify-full` and `DATABASE_CA_CERT` to the
   project's CA certificate.
3. `npm run db:migrate`.

> **Cutting over from the MongoDB version:** there is no data migration script.
> The schema starts empty, existing users must be re-created or imported
> separately, and tokens issued before the switch are rejected (users sign in
> again).

### Code layout

`src/db` holds the connection, transactions, migration runner and error
helpers; `src/repositories` holds all SQL, one module per table. Services call
repositories and never write SQL. Repository methods accept an optional
transaction handle, so several can be combined atomically with
`getDb().transaction(tx => …)`.

---

## Project Structure

```
src/
├── config/          — Zod-validated environment config
├── db/              — Postgres pool, transactions, migration runner, error helpers
├── lib/             — Singleton clients: Redis, S3, BullMQ queues
├── models/          — Entity types (plain TypeScript, no ORM)
├── repositories/    — All SQL: one repository per table
├── middleware/       — Auth, rate limiting, validation, error handling
├── routes/          — Express route handlers (thin — delegate to services)
├── services/        — All business logic (auth, users, catalog, designs, ...)
├── workers/         — BullMQ worker: drives the 8-step AI pipeline
├── websocket/       — Socket.IO server: pushes job progress to mobile
├── app.ts           — Express app factory
└── server.ts        — Bootstrap: connect DB → start HTTP + WS + worker
supabase/migrations/ — SQL schema migrations
```

---

## Quick Start

### Option A — Docker (recommended)

```bash
cp .env.example .env
# No other config needed for local dev
docker compose up
```

Starts: **glimms-api** on port 4000, **Postgres** on 5432, **Redis** on 6379. The
schema is migrated automatically on boot in this setup.

To browse the data, point any Postgres client (psql, TablePlus, DBeaver) at
`postgresql://postgres:postgres@localhost:5432/glimms`.

### Option B — Local

```bash
cp .env.example .env
npm install

# Start infra only (Postgres + Redis) — the API will NOT start without both running
npm run services:up
# equivalent to: docker compose up -d postgres redis

# Create the schema, and optionally some dev data
npm run db:migrate
npm run seed

# Run with hot reload
npm run dev
```

No Docker on your machine? Get Postgres and Redis some other way before running `npm run dev`:
- **Postgres** — the simplest route is a free Supabase project (`DATABASE_URL` in `.env`, see [Pointing at Supabase](#pointing-at-supabase)); a locally installed PostgreSQL 15+ works too
- **Redis** — on Windows use [Memurai](https://www.memurai.com/) or WSL2 (`sudo apt install redis-server && redis-server`); on macOS `brew install redis && brew services start redis`; or a hosted Redis via `REDIS_URL` in `.env`. BullMQ requires the Redis eviction policy to be `noeviction`; for a local server, set it with `redis-cli CONFIG SET maxmemory-policy noeviction` (and persist it in your Redis configuration).

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login, get token pair |
| POST | `/api/auth/refresh` | — | Rotate refresh token |
| POST | `/api/auth/logout` | — | Revoke refresh token |

### Users
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/me` | ✅ | Get own profile |
| PATCH | `/api/users/me` | ✅ | Update name / avatar |
| DELETE | `/api/users/me` | ✅ | Deactivate account |
| GET | `/api/users/me/preferences` | ✅ | Get style preferences |
| PUT | `/api/users/me/preferences` | ✅ | Save style preferences |

### Scans & Designs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/scans/upload` | ✅ + quota | Upload images → start AI pipeline |
| GET | `/api/designs/jobs` | ✅ | List design jobs |
| GET | `/api/designs/jobs/:id` | ✅ | Get job status + result |
| GET | `/api/designs/saved` | ✅ | Saved designs |
| POST | `/api/designs/saved` | ✅ | Save a design |
| PATCH | `/api/designs/saved/:id/favorite` | ✅ | Toggle favourite |

### Catalog
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/catalog` | ✅ | List items (filter by vertical/category/tag) |
| GET | `/api/catalog/:id` | ✅ | Get single item |
| POST | `/api/catalog` | ✅ | Add item manually |
| PATCH | `/api/catalog/:id` | ✅ | Update tags / attributes |
| DELETE | `/api/catalog/:id` | ✅ | Soft-delete item |

### Other
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/subscriptions/me` | ✅ | Current subscription |
| GET | `/api/subscriptions/prices` | — | Plans for sale (from Stripe, cached) |
| POST | `/api/subscriptions/checkout` | ✅ | Create Stripe checkout for a plan |
| POST | `/api/subscriptions/portal` | ✅ | Stripe billing portal (manage / cancel) |
| POST | `/api/subscriptions/webhook` | Stripe | Stripe webhook |
| POST | `/api/notifications/device-token` | ✅ | Register push token |
| POST | `/api/analytics/track` | Optional | Track event |

---

## WebSocket

Connect to `ws://localhost:4000` with `{ auth: { token: "<jwt>" } }`.

```js
// Subscribe to a job's progress
socket.emit('subscribe:job', jobId)

// Listen for updates
socket.on('job:update',   data => { /* { status, step, progress } */ })
socket.on('job:complete', data => { /* full result with designs */ })
socket.on('job:failed',   data => { /* { error } */ })
```

---

## AI Pipeline (design worker)

When a scan is uploaded, the BullMQ worker runs 8 steps in sequence:

```
1. Object detection     → glimms-ai :8001  (YOLOv8)
2. Attribute extraction → glimms-ai :8002  (CLIP + colour + texture)
3. Embedding upsert     → glimms-ai :8003  (Pinecone — non-blocking)
4. Catalog save         → Postgres          (detected items saved)
5. Permutations         → glimms-ai :8004  (combinatorics + filters)
6. LLM reasoning        → glimms-ai :8005  (GPT-4o / Claude)
7. Mockup compositor    → glimms-ai :8006  (Pillow + S3)
8. Complete             → Postgres + WS push + push notification
```

Each step's URL is configurable via `.env`. If an AI service is down, the worker retries up to 3 times with exponential backoff.

---

## Connecting to the AI services

The Glimms AI tier is an **internal dependency, never a public one**. This API is
the only public entry point: it owns auth, sessions, the database, S3 presigning
and the job queue, and calls Glimms server-to-server. Never call the AI URL from
browser or mobile code — even with a token, shipping it to a client hands over
the pipeline and the bucket.

```
client ──HTTPS+auth──> glimms-api ──server-to-server──> glimms-ai gateway
```

### A — Single gateway (hosted deployment)

All eight services run in one container behind one origin, addressed by path
prefix (`/object-detection/…`, `/quality-guard/…`):

```bash
AI_GATEWAY_URL=https://glimms-ai.onrender.com   # alias: GLIMMS_BASE_URL
AI_INTERNAL_TOKEN=<same value as AI_INTERNAL_TOKEN on the deployment>
GLIMMS_TIMEOUT_MS=120000
```

Every service URL is derived from that one variable — `AI_GATEWAY_URL` +
`/<service-name>` — so `POST /check` on quality-guard lands on
`https://glimms-ai.onrender.com/quality-guard/check`.

**The token is required.** Once `AI_INTERNAL_TOKEN` is set on the deployment
(mandatory there when `GLIMMS_ENV=production` — the container refuses to boot
without it), every endpoint except `/livez` returns 401 without
`Authorization: Bearer …`. That includes the health endpoints. Rotation is
additive: the gateway accepts a comma-separated list, so add the new value,
redeploy callers, then drop the old one.

### B — One URL per service (docker-compose / k8s)

```bash
AI_OBJECT_DETECTION_URL=http://object-detection:8001
AI_ATTRIBUTE_EXTRACTOR_URL=http://attribute-extractor:8002
# …
```

Resolution order per service: **`AI_<SERVICE>_URL` → `AI_GATEWAY_URL` →
`http://localhost:800X`.** A per-service value always wins, so you can run seven
services through a gateway and pin one elsewhere. Blank values count as unset,
and trailing slashes are trimmed.

### Client policy (all of it lives in `src/lib/aiClient.ts`)

Every AI call goes through `aiClient`, so these apply uniformly — including to
health probes. Nothing else in the codebase should call the AI tier directly.

| Concern | Behaviour | Env |
|---|---|---|
| Auth | `Authorization: Bearer` on every request except `/livez` | `AI_INTERNAL_TOKEN` |
| Correlation | `X-Correlation-ID` sent and echoed back; log it per job | — |
| Timeouts | 20s rule-based, 45s image-backed, 120s reasoning/compose | `GLIMMS_TIMEOUT_MS`, `AI_TIMEOUT_MULTIPLIER` |
| Retries | Only connection resets, 429, 502/503/504; honours `Retry-After`; exponential backoff with jitter | `AI_MAX_RETRIES` |
| Concurrency | Semaphore caps in-flight upstream requests (gateway's own cap is 16) | `AI_MAX_CONCURRENCY` |
| Circuit breaker | After N consecutive failures, fail fast with a retryable error | `AI_BREAKER_THRESHOLD`, `AI_BREAKER_RESET_MS` |

Because the free tier sleeps when idle and takes 30–60s to wake, **run the
pipeline in the worker/queue, never inside an HTTP handler**, and consider a
cheap periodic `GET /livez` as a warmer.

### Health, readiness, and degradation

The gateway exposes three signals; `aiClient` prefers the aggregated ones, so
readiness costs **one** request instead of eight:

| Endpoint | Token | Meaning |
|---|---|---|
| `GET /livez` | no | Gateway process is up |
| `GET /health` | yes | Per-service detail + `production_ready` + `degradations[]` |
| `GET /readyz` | yes | 503 unless every service is running its real backend |

`GET /health/ready` on this API surfaces all of it, classifying each service:

| Status | Meaning |
|---|---|
| `ok` | Reachable, running its real backend |
| `degraded` | Reachable, but on a fallback the gateway names in `degradations[]` |
| `unavailable` | Not reachable, or the token was rejected |

The hosted all-in-one image deliberately ships without torch/YOLO/CLIP/rembg/
Pinecone, so it currently reports `production_ready: false`:

- **detections are deterministic prototypes**, not real detections;
- **attributes are offline pseudo-embeddings**, not CLIP vectors — comparable to
  each other, meaningless against real CLIP space;
- **vectors live in process memory**, wiped on every deploy, restart and idle
  spin-down. Keep your own store as the system of record;
- **LLM output comes from a keyless, rate-limited free provider.**

That makes it a good integration/staging target, not a production one. Set
`AI_ALLOW_DEGRADED=true` to let `/health/ready` pass against it — unreachable
services still fail readiness — and store `degraded: true` on any session
produced that way (`aiClient.isDegraded()`) so those results can be found and
re-run later.

When the deployment runs with `GLIMMS_ENV=production` (or
`ALLOW_DEV_FALLBACKS=false`), the affected endpoints return 503 with a
machine-readable body instead of prototype output. `aiClient` turns that into a
typed `AiFallbackBlockedError` carrying `service`, `reason` and `remedy`, and
**never retries it** — it is a configuration problem, not a blip. The rule-based
services (context-inference, permutation-engine, quality-guard) have no fallback
to block and keep working.

### S3 is a shared prerequisite

`/quality-guard`, `/object-detection`, `/attribute-extractor` and
`/mockup-compositor` take **S3 object keys, not URLs** — deliberately, so they
cannot be used as an SSRF proxy. The AI deployment must therefore share this
API's bucket and credentials, or those four endpoints cannot work at all. The
live deployment currently reports `s3_configured: false`.

`/compose` returns `signed_url` (short-lived) alongside `output_key`. Persist
`output_key` as the durable reference and mint a fresh presigned URL per read.

### Verifying the connection

```bash
AI_GATEWAY_URL=https://glimms-ai.onrender.com \
AI_INTERNAL_TOKEN=... npm run ai:check
```

Checks `/livez`, `/health` and `/readyz`, prints each service with any active
degradation, and exits non-zero if anything is unreachable or the credentials
are rejected — so it can gate a deploy. A degraded-but-reachable tier exits 0
and warns.

---

## Tables

Defined in `supabase/migrations/`. All primary keys are `uuid`; every table has
`created_at`, and mutable ones a trigger-maintained `updated_at`.

| Table | Notable constraints and indexes |
|---|---|
| `users` | `email` unique + lowercase, `tier` check |
| `refresh_tokens` | `token_hash` unique, index on `expires_at` (swept hourly) |
| `user_preferences` | one row per user |
| `subscriptions` | one row per user, index on `stripe_customer_id` |
| `catalog_items` | `(user_id, vertical)`, active items per user, GIN on `tags` |
| `design_jobs` | `(user_id, status)`, `(user_id, created_at)` |
| `design_sessions` | `(user_id, created_at)`, `(user_id, status)`; `steps` / `result` are `jsonb` |
| `saved_designs` | `(user_id, created_at)`; survives deletion of its job/session |
| `device_tokens` | `token` unique |

Deleting a user cascades to everything they own.

---

## Environment Variables

See `.env.example` — all variables are documented inline.

Minimum required for local dev:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/glimms
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32+ chars>
REFRESH_TOKEN_SECRET=<32+ chars>
```

To point at the hosted AI tier instead of local AI containers, add
`AI_GATEWAY_URL` — see [Connecting to the AI services](#connecting-to-the-ai-services).

---

## Testing

```bash
npm test                 # run all tests
npm run test:watch       # watch mode
```

No services are needed: database tests run against **PGlite** (PostgreSQL
compiled to WebAssembly, in-process), with the real migrations applied to a
fresh database per test file. Redis and the queue are mocked.

To run the same suite through the production driver against a real server
(CI does this on every push):

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/glimms_test npm run test:pg
```

> ⚠️ The harness **drops and recreates the `public` schema** of
> `TEST_DATABASE_URL`. Only ever point it at a disposable database.
