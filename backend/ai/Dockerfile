# All-in-one image: every Glimms service plus a single-port gateway, with the
# real models baked in.
#
#   docker build -t glimms-ai backend/ai
#
# Stage 1 exports the models to ONNX (needs PyTorch, ~2 GB of build tooling).
# Stage 2 is the runtime: onnxruntime only, no PyTorch.  It runs all eight
# services in one container behind the gateway on $PORT (default 8080).
#
# For a quick image without models (services answer with their development
# fallbacks, which production refuses to serve):
#
#   docker build --build-arg WITH_MODELS=false -t glimms-ai:lite backend/ai

# ── Stage 1: build model artefacts ──────────────────────────────────────────
FROM python:3.11-slim AS models
ARG WITH_MODELS=true
WORKDIR /build

# git: pip installs CLIP from a pinned commit.  libgl1/libglib: OpenCV, which
# ultralytics imports.
RUN if [ "$WITH_MODELS" = "true" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 \
      && rm -rf /var/lib/apt/lists/*; \
    fi

COPY requirements-models.txt ./
# The CPU wheel index keeps PyTorch at ~200 MB instead of ~2 GB of CUDA.
RUN if [ "$WITH_MODELS" = "true" ]; then \
      pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements-models.txt; \
    fi

COPY shared/ ./shared/
COPY services/ ./services/
COPY scripts/ ./scripts/
# Exports, then loads every artefact back and checks it; a bad export fails
# the build here rather than a request in production.
RUN mkdir -p /models \
    && if [ "$WITH_MODELS" = "true" ]; then \
         python scripts/build_models.py --out /models; \
       fi

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN addgroup --system app && adduser --system --group app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ ./shared/
COPY services/ ./services/
COPY gateway/ ./gateway/
COPY --from=models /models/ /app/models/

USER app
ENV PYTHONUNBUFFERED=1 \
    MODELS_DIR=/app/models \
    # Eight processes share the CPUs; stop each model grabbing all of them.
    OMP_NUM_THREADS=2

# Single public port; the gateway proxies each /<service-name>/ prefix.
EXPOSE 8080

CMD ["python", "-m", "gateway.serve_all"]
