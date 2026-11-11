-- Glimms — initial relational schema (replaces the MongoDB/Mongoose collections).
--
-- Target: Supabase Postgres. The file is plain PostgreSQL (>= 13) so the same
-- migration also runs on a vanilla Postgres container and in the test suite.
--
-- Conventions
--   * snake_case columns; the API maps them to the camelCase JSON it has always
--     returned, so the HTTP contract is unchanged.
--   * uuid primary keys (were Mongo ObjectIds).
--   * Fixed-shape data is relational; genuinely schemaless AI output (design
--     results, colour info, extracted attributes) stays in jsonb.
--   * Enumerations are text + CHECK rather than Postgres enums: adding a value
--     is then an ordinary, transactional migration.
--   * Every table has RLS enabled with NO policies. Only the API (which connects
--     as the table owner and therefore bypasses RLS) can read or write. The
--     Supabase Data API roles (anon/authenticated) are locked out by default.

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ────────────────────────────────────────────────────────────────────

create table public.users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  password_hash text,
  name          text,
  avatar_url    text,
  tier          text        not null default 'free',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint users_email_key        unique (email),
  constraint users_email_lowercase  check (email = lower(email)),
  constraint users_email_format     check (email ~ '^\S+@\S+\.\S+$'),
  constraint users_name_length      check (name is null or char_length(name) <= 100),
  constraint users_tier_valid       check (tier in ('free', 'premium', 'pro'))
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ── refresh_tokens ───────────────────────────────────────────────────────────
-- Mongo expired these with a TTL index. Postgres has no TTL, so the API deletes
-- expired rows itself (see refreshToken.repository.ts → deleteExpired).

create table public.refresh_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  token_hash text        not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint refresh_tokens_token_hash_key unique (token_hash)
);

create index refresh_tokens_user_id_idx    on public.refresh_tokens (user_id);
create index refresh_tokens_expires_at_idx on public.refresh_tokens (expires_at);

-- ── user_preferences ─────────────────────────────────────────────────────────

create table public.user_preferences (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  occupation   text,
  style_goals  text[]      not null default '{}',
  occasions    text[]      not null default '{}',
  cultural_ctx text,
  -- { lat, lon, city?, country? }
  location     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint user_preferences_user_id_key unique (user_id),
  constraint user_preferences_location_shape check (
    location is null
    or (
      -- coalesce: a missing key yields NULL, and a NULL CHECK result passes.
      jsonb_typeof(location) = 'object'
      and coalesce(jsonb_typeof(location -> 'lat'), '') = 'number'
      and coalesce(jsonb_typeof(location -> 'lon'), '') = 'number'
    )
  )
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ── subscriptions ────────────────────────────────────────────────────────────

create table public.subscriptions (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references public.users (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text        not null default 'inactive',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint subscriptions_user_id_key  unique (user_id),
  constraint subscriptions_status_valid check (status in ('active', 'inactive', 'past_due', 'cancelled'))
);

-- Stripe webhooks look subscriptions up by customer id.
create index subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── catalog_items ────────────────────────────────────────────────────────────

create table public.catalog_items (
  id            uuid             primary key default gen_random_uuid(),
  user_id       uuid             not null references public.users (id) on delete cascade,
  vertical      text             not null,
  label         text             not null,
  category      text             not null,
  -- { dominant: { hex, rgb }, palette: [...], mood }
  color         jsonb            not null,
  texture       text,
  pattern       text,
  image_key     text             not null,
  thumbnail_key text,
  confidence    double precision not null,
  -- Free-form AI extras (bbox, sleeve length, material, …)
  attributes    jsonb            not null default '{}',
  tags          text[]           not null default '{}',
  style_tags    text[]           not null default '{}',
  is_active     boolean          not null default true,
  created_at    timestamptz      not null default now(),
  updated_at    timestamptz      not null default now(),

  constraint catalog_items_vertical_valid   check (vertical in ('wardrobe', 'room', 'garden')),
  constraint catalog_items_label_present    check (btrim(label) <> ''),
  constraint catalog_items_category_present check (btrim(category) <> ''),
  constraint catalog_items_image_key_present check (image_key <> ''),
  constraint catalog_items_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint catalog_items_color_shape      check (
    jsonb_typeof(color) = 'object' and coalesce(jsonb_typeof(color -> 'dominant'), '') = 'object'
  )
);

-- The hot path: "my active items, newest first", optionally narrowed by vertical.
create index catalog_items_user_recent_idx
  on public.catalog_items (user_id, created_at desc)
  where is_active;
create index catalog_items_user_vertical_category_idx
  on public.catalog_items (user_id, vertical, category);
create index catalog_items_tags_idx
  on public.catalog_items using gin (tags);

create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();

-- ── design_jobs (legacy /api/scans/upload pipeline) ──────────────────────────

create table public.design_jobs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  vertical     text        not null,
  status       text        not null default 'pending',
  image_keys   text[]      not null default '{}',
  context_data jsonb       not null default '{}',
  result       jsonb,
  error_msg    text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint design_jobs_vertical_valid check (vertical in ('wardrobe', 'room', 'garden')),
  constraint design_jobs_status_valid   check (status in ('pending', 'processing', 'completed', 'failed'))
);

create index design_jobs_user_recent_idx on public.design_jobs (user_id, created_at desc);
create index design_jobs_user_status_idx on public.design_jobs (user_id, status);

create trigger design_jobs_set_updated_at
  before update on public.design_jobs
  for each row execute function public.set_updated_at();

-- ── design_sessions (v1 pipeline) ────────────────────────────────────────────

create table public.design_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.users (id) on delete cascade,
  vertical         text        not null,
  status           text        not null default 'created',
  progress         integer     not null default 0,
  -- { quality, detection, attributes, context, permutations, embeddings, reasoning, mockups }
  steps            jsonb       not null default jsonb_build_object(
                                 'quality', 'pending', 'detection', 'pending',
                                 'attributes', 'pending', 'context', 'pending',
                                 'permutations', 'pending', 'embeddings', 'pending',
                                 'reasoning', 'pending', 'mockups', 'pending'),
  input_context    jsonb       not null default '{}',
  inferred_context jsonb,
  -- [{ imageId, objectKey, uploadUrl?, expiresAt?, contentType?, byteSize?, width?, height?, qualityResult?, qualityStatus }]
  source_images    jsonb       not null default '[]',
  pipeline_version text        not null default '1.0.0',
  correlation_id   text        not null,
  warnings         text[]      not null default '{}',
  designs          jsonb       not null default '[]',
  artifacts        jsonb       not null default '[]',
  error            jsonb,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint design_sessions_vertical_valid check (vertical in ('wardrobe', 'room', 'garden')),
  constraint design_sessions_status_valid   check (status in (
    'created', 'uploading', 'queued', 'quality_review',
    'detecting', 'extracting', 'permuting', 'embedding', 'reasoning', 'composing',
    'completed', 'failed', 'cancelled')),
  constraint design_sessions_progress_range check (progress between 0 and 100),
  constraint design_sessions_steps_shape    check (jsonb_typeof(steps) = 'object'),
  constraint design_sessions_source_images_shape check (jsonb_typeof(source_images) = 'array'),
  constraint design_sessions_designs_shape   check (jsonb_typeof(designs) = 'array'),
  constraint design_sessions_artifacts_shape check (jsonb_typeof(artifacts) = 'array')
);

create index design_sessions_user_recent_idx    on public.design_sessions (user_id, created_at desc);
create index design_sessions_user_status_idx    on public.design_sessions (user_id, status);
create index design_sessions_correlation_id_idx on public.design_sessions (correlation_id);

create trigger design_sessions_set_updated_at
  before update on public.design_sessions
  for each row execute function public.set_updated_at();

-- ── saved_designs ────────────────────────────────────────────────────────────
-- A saved design is the user's own copy of a generated look. It originates from
-- either a legacy job or a v1 session; the API exposes whichever is set as
-- `jobId`. The copy outlives its source, hence ON DELETE SET NULL.

create table public.saved_designs (
  id          uuid             primary key default gen_random_uuid(),
  user_id     uuid             not null references public.users (id) on delete cascade,
  job_id      uuid             references public.design_jobs (id) on delete set null,
  session_id  uuid             references public.design_sessions (id) on delete set null,
  title       text,
  items       jsonb            not null default '[]',
  mockup_url  text,
  explanation text,
  tips        text[]           not null default '{}',
  score       double precision not null default 0,
  is_favorite boolean          not null default false,
  tags        text[]           not null default '{}',
  created_at  timestamptz      not null default now(),

  constraint saved_designs_single_source check (num_nonnulls(job_id, session_id) <= 1),
  constraint saved_designs_score_range   check (score >= 0 and score <= 1),
  constraint saved_designs_items_shape   check (jsonb_typeof(items) = 'array')
);

create index saved_designs_user_recent_idx on public.saved_designs (user_id, created_at desc);
create index saved_designs_user_favorite_idx
  on public.saved_designs (user_id, created_at desc)
  where is_favorite;
-- Foreign keys are not indexed automatically; these keep SET NULL cascades cheap.
create index saved_designs_job_id_idx     on public.saved_designs (job_id)     where job_id is not null;
create index saved_designs_session_id_idx on public.saved_designs (session_id) where session_id is not null;

-- ── device_tokens ────────────────────────────────────────────────────────────

create table public.device_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  token      text        not null,
  platform   text        not null,
  created_at timestamptz not null default now(),

  constraint device_tokens_token_key      unique (token),
  constraint device_tokens_platform_valid check (platform in ('ios', 'android'))
);

create index device_tokens_user_id_idx on public.device_tokens (user_id);

-- ── Access control ───────────────────────────────────────────────────────────
-- Deny-by-default for anything that is not the API's own database role.

alter table public.users            enable row level security;
alter table public.refresh_tokens   enable row level security;
alter table public.user_preferences enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.catalog_items    enable row level security;
alter table public.design_jobs      enable row level security;
alter table public.design_sessions  enable row level security;
alter table public.saved_designs    enable row level security;
alter table public.device_tokens    enable row level security;

-- Supabase grants its Data API roles privileges on new public tables by default.
-- These tables hold password hashes and refresh tokens, so revoke outright. The
-- roles do not exist on vanilla Postgres (local Docker, tests) — skip there.
do $$
declare
  api_role   text;
  table_name text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      foreach table_name in array array[
        'users', 'refresh_tokens', 'user_preferences', 'subscriptions', 'catalog_items',
        'design_jobs', 'design_sessions', 'saved_designs', 'device_tokens'
      ] loop
        execute format('revoke all on table public.%I from %I', table_name, api_role);
      end loop;
    end if;
  end loop;
end;
$$;
