# Glimms AI services

> Eight independently deployable FastAPI services used by the Glimms style and
> design pipeline.

## What is implemented

| Service | Port | API | Current implementation |
|---|---:|---|---|
| `object-detection` | 8001 | `POST /detect` | YOLOv8 ONNX inference with EXIF handling, box clamping, and a deterministic development fallback when no model is mounted |
| `attribute-extractor` | 8002 | `POST /extract` | Lazy CLIP embeddings, deterministic offline vectors, dominant palette, mood, texture, and style tags |
| `embedding-engine` | 8003 | `POST /upsert`, `POST /search`, `DELETE /vectors` | Pinecone adapter with cosine-similarity in-memory fallback for local development |
| `permutation-engine` | 8004 | `POST /generate` | Outfit, room, and garden combinations ranked by category completeness, color harmony, style, and context |
| `llm-reasoning` | 8005 | `POST /reason` | OpenAI/Anthropic failover, defensive JSON parsing, bounded concurrency, schema-safe offline fallback |
| `mockup-compositor` | 8006 | `POST /compose` | Pillow composition from S3 image keys, optional lazy background removal, JPEG/PNG upload |
| `quality-guard` | 8007 | `POST /check` | Blur, exposure, contrast, resolution, quality score, and re-capture guidance |
| `context-inference` | 8008 | `POST /infer` | Explicit-input climate/culture/occasion rules mapped to reusable style constraints |

Every service also exposes `GET /health`, an unauthenticated `GET /livez`
liveness probe, and FastAPI documentation at `/docs`. Compatibility aliases are available for the main pipeline endpoints:
`/context`, `/permute`, `/permutations`, `/query`, `/assess`, `/quality`, and
`/mockup`.

## Pipeline shape

```text
image keys
   │
   ├── quality-guard ──┐
   ├── object-detection │
   │                    └── attribute-extractor
   └── context-inference ── permutation-engine ──┬── embedding-engine
                                                  ├── llm-reasoning
                                                  └── mockup-compositor
```

The services exchange S3 object keys rather than arbitrary URLs. This keeps the
internal image APIs from becoming an SSRF proxy and lets the API gateway own
upload authorization.

For the recommended public API, database, queue, security, and worker design,
see [`docs/BACKEND_IMPLEMENTATION.md`](docs/BACKEND_IMPLEMENTATION.md).

To call an already-hosted all-in-one deployment (for example on Render) from a
product backend, see [`docs/RENDER_INTEGRATION.md`](docs/RENDER_INTEGRATION.md)
and the reference client in
[`examples/glimms-client.ts`](examples/glimms-client.ts).

## Security and deployment mode

Two environment variables decide how the services behave in a real deployment:

| Variable | Effect |
|---|---|
| `AI_INTERNAL_TOKEN` | When set, the gateway and every service require `Authorization: Bearer <token>` on all endpoints except `/livez`. Comma-separated values are accepted so tokens can be rotated without downtime. |
| `GLIMMS_ENV` | `development` (default), `staging`, or `production`. In `production` the token becomes **mandatory** — the process refuses to start without it — and every deterministic development fallback returns `503` instead of prototype output. |

`ALLOW_DEV_FALLBACKS` overrides the fallback policy explicitly in either
direction (for example `true` for a production demo running without models).

The gateway also exposes `GET /readyz`, which returns `503` unless every
service is reachable *and* none of them is answering with a blocked fallback.
Point a load balancer or platform health check at `/readyz` (or `/livez` for
pure liveness) rather than `/health`.

Two further limits apply to S3 keys: `S3_ALLOWED_KEY_PREFIXES` and
`S3_OUTPUT_KEY_PREFIXES` restrict which object keys may be read and written.
Path traversal and absolute keys are always rejected.

## Start all services locally

```bash
cp .env.example .env
# Fill in S3 credentials/bucket if using image-key endpoints.
docker compose up --build
```

## Models

The vision services run real models through **onnxruntime**. The ONNX files
are produced by [`scripts/build_models.py`](scripts/build_models.py) — at image
build time for the production image — and read from `MODELS_DIR`
(default `./models`):

| File | Used by | What it is |
|---|---|---|
| `detector.onnx`, `detector.labels.txt` | object-detection | **YOLO-World** (open vocabulary, `yolov8s-worldv2`) with the Glimms vocabulary — every wardrobe, room and garden label — baked in. One model covers all three verticals without a per-domain training set. |
| `clip_visual.onnx` | attribute-extractor | **OpenAI CLIP ViT-B/32** image tower. 512-d, L2-normalised; the same space as `openai/clip-vit-base-patch32`. |
| `clip_style_tags.npz` | attribute-extractor | Text embeddings of the style tags from the matching text tower, so zero-shot style tagging needs no text model at runtime. |
| `background.onnx` | mockup-compositor | **U²-Net** salient-object segmentation for item cut-outs. |
| `manifest.json` | all | Sources, checksums, label list, recommended detection threshold. |

PyTorch, ultralytics and CLIP are needed only to *export* these
(`requirements-models.txt`); nothing in `requirements.txt` depends on them.
The build script loads every artefact back and checks it (output shapes; CLIP
against the PyTorch reference) and fails otherwise.

How each item is processed:

1. **Detection** letterboxes the EXIF-oriented photo, runs the detector, keeps
   labels of the requested vertical, and removes duplicates (per-label NMS,
   then near-identical boxes with different labels such as *pants*/*jeans*).
2. **Attributes** are computed on **each item's detection box**, not the whole
   photo — embedding, palette, texture and style tags describe that item.
3. **Mockups** place each layer's `crop` region (the detection box) on the
   canvas; with `remove_background: true` the item is cut out first.

Without models (a plain checkout, or an image built with
`--build-arg WITH_MODELS=false`) the services answer with deterministic
development fallbacks: prototype boxes, placeholder vectors, no cut-outs.
`/health` reports this (`model_loaded`, `clip_enabled`, `background_removal`),
and with `GLIMMS_ENV=production` the affected endpoints return `503` rather
than a fake result.

To get models for local development or `docker compose`:

```bash
docker build --target models -t glimms-ai-models .
docker run --rm -v "$PWD/models:/out" glimms-ai-models cp -r /models/. /out/
```

Tuning and overrides (see `.env.example`): `CONFIDENCE_THRESHOLD` (default
from the manifest, 0.25), `NMS_IOU_THRESHOLD`, `CROSS_CLASS_IOU_THRESHOLD`,
`MODEL_PATH` + `MODEL_LABELS` to swap in any YOLOv8-layout ONNX model (for
example one fine-tuned on your own catalogue), `CLIP_MODEL_PATH`,
`BACKGROUND_MODEL_PATH`.

> **Know the limits.** YOLO-World is a zero-shot detector: it is real
> detection and a sound starting point, but a model fine-tuned on fashion /
> interior data will be more accurate, and the 0.25 threshold has not been
> tuned against Glimms photos. Evaluate on real uploads before launch.

Still configured through credentials rather than files:

- **Pinecone** — set `PINECONE_API_KEY` and `PINECONE_INDEX`. Create the index
  with **dimension 512, metric cosine**. Without them the embedding engine
  uses a non-durable in-memory store (refused in production). Search filters
  (for example `{"user_id": …}`) are passed through to Pinecone.
- **LLM** — set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`.
- Set `S3_ENDPOINT_URL` when using an S3-compatible local service such as
  MinIO.

## Run everything in one container

The `Dockerfile` in this directory builds the all-in-one production image: all
eight services, a gateway exposing them on a single port, and the models.

```bash
docker build -t glimms-ai .                                   # with models
docker build --build-arg WITH_MODELS=false -t glimms-ai:lite . # fallbacks only
docker run --rm -p 8080:8080 --env-file .env glimms-ai
```

The first build downloads the model weights and CPU PyTorch into a throwaway
stage (several minutes); the runtime stage contains only onnxruntime and the
exported models. Give the container **at least 2 GB of memory**.

The gateway listens on `$PORT` (default 8080). Route any request through a
`/<service-name>/` prefix and it is passed to that service unchanged, for
example `POST /permutation-engine/generate`, `GET /quality-guard/health`, or
`/llm-reasoning/docs`. `GET /health` returns the aggregated status of all
eight services. `GET /readyz` succeeds only when nothing is answering with a fallback.

## Start one service

```bash
cd services/llm_reasoning
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8005
```

The image-key services need the repository root on `PYTHONPATH` when run
outside Docker, for example:

```bash
PYTHONPATH="$PWD/../.." uvicorn app.main:app --reload --port 8002
```

## API examples

### Generate permutations

```bash
curl -X POST http://localhost:8004/generate \
  -H 'content-type: application/json' \
  -d '{
    "vertical": "wardrobe",
    "context": {"occasion": "work", "style_constraints": {"preferred_styles": ["minimalist"]}},
    "items": [
      {"id": "top-1", "label": "shirt", "category": "top", "style_tags": ["minimalist"]},
      {"id": "bottom-1", "label": "jeans", "category": "bottom"},
      {"id": "shoe-1", "label": "shoes", "category": "footwear"}
    ]
  }'
```

### Upsert and search vectors

```bash
curl -X POST http://localhost:8003/upsert \
  -H 'content-type: application/json' \
  -d '{"vectors":[{"id":"top-1","embedding":[1,0,0],"metadata":{"label":"shirt"}}]}'

curl -X POST http://localhost:8003/search \
  -H 'content-type: application/json' \
  -d '{"embedding":[0.9,0.1,0],"top_k":5}'
```

## Configuration

See [`.env.example`](.env.example) for provider, S3, model, threshold, and
service limits. Do not commit `.env`, model weights, or credentials.

### Free LLM fallback provider

`llm-reasoning` tries providers in this order: the configured primary
(OpenAI or Anthropic), the other one, every active free OpenAI-compatible
provider, and finally the deterministic offline fallback.

**Pollinations is enabled by default and needs no API key**, so the free
fallback works with zero configuration. **OpenRouter, Groq, Google AI Studio,
NVIDIA NIM and GitHub Models are also built in** and activate automatically
once their API key is set (`OPENROUTER_API_KEY`, `GROQ_API_KEY`,
`GOOGLE_AI_API_KEY` — `GEMINI_API_KEY` also works, `NVIDIA_NIM_API_KEY`,
`GITHUB_MODELS_API_KEY` — `GITHUB_TOKEN` also works). Each has a sensible
default model that can be overridden with the matching `*_MODEL` variable,
and every provider is tried in order. To add further OpenAI-compatible
providers, use the comma-separated `FALLBACK_LLM_BASE_URL` /
`FALLBACK_LLM_API_KEY` / `FALLBACK_LLM_MODEL` variables — entries align by
position, an API key may be empty for keyless providers, and duplicates are
skipped. Set `FALLBACK_LLM_DISABLE=true` to turn the free tier off entirely.
Free tiers are rate-limited and intended for development; do not rely on
them under production load.

## Verification

The repository CI workflow checks imports for every service. The lightweight
unit suite can be run locally (and is ready to be enabled in CI) with the
same command. The code can also be compiled without third-party imports with:

```bash
python -m compileall -q services shared
```

## Remaining nice-to-haves

These are intentionally kept separate from the working baseline:

1. **Domain-tuned detection:** the shipped detector is zero-shot YOLO-World.
   Fine-tune on Glimms data, evaluate against a labelled set, tune the
   threshold; add warm-up and GPU/provider selection.
2. **Real quality scoring:** add a calibrated BRISQUE/NIQE model and a labelled
   acceptance set instead of hand-tuned blur/exposure thresholds.
3. **Durable vector operations:** create/migrate Pinecone indexes, add metadata
   schema/versioning, bulk re-index jobs, and a durable local development
   backend.
4. **Pipeline orchestration:** add a gateway workflow with retries, idempotency
   keys, correlation IDs, timeouts, circuit breakers, and a job queue for long
   model/LLM work.
5. **Security hardening:** service-to-service authentication, per-user S3
   prefixes, signed download URLs, rate limits, request-size limits, and secret
   rotation.
6. **Observability:** structured logs, traces across all eight services,
   latency/error metrics, provider token/cost metrics, and model confidence
   dashboards.
7. **Better visual composition:** segmentation-aware placement, alpha masks,
   occlusion/depth ordering, crop controls, and an async image-result CDN.
8. **Recommendation quality:** learned outfit compatibility, user feedback
   loops, localization, accessibility descriptions, and explicit preference
   controls rather than broad cultural assumptions.
9. **Deployment maturity:** container image scanning, non-root model volumes,
   autoscaling/GPU profiles, readiness probes, and separate production/staging
   configuration.
10. **Test depth:** contract tests between services, golden image fixtures,
    provider-mocked integration tests, load tests, and a security regression
    suite.
