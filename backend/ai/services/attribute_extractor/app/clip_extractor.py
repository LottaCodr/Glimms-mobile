"""CLIP image features.

Backends, in order of preference:

``onnx``
    The CLIP ViT-B/32 image tower exported to ONNX at image build time
    (``scripts/build_models.py``), plus pre-computed text embeddings for the
    style tags.  Needs only onnxruntime, so it is what production runs.

``transformers``
    The original PyTorch path, used when ``CLIP_ENABLED=true`` and the
    transformer dependencies are installed but no ONNX model is present.

``fallback``
    Deterministic placeholder vectors.  Stable and the right shape, but not
    CLIP space; refused in production (see ``shared.runtime``).

``CLIP_ENABLED`` defaults to ``auto``: real CLIP when the ONNX model exists.
``false`` forces the fallback; ``true`` additionally allows the transformers
backend.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import numpy as np

from shared.models import resolve_model

logger = logging.getLogger(__name__)

STYLE_TAGS = [
    "casual",
    "formal",
    "smart-casual",
    "athletic",
    "bohemian",
    "minimalist",
    "maximalist",
    "vintage",
    "streetwear",
    "luxury",
    "traditional",
    "modest",
]


#: OpenAI CLIP preprocessing constants.
CLIP_INPUT_SIZE = 224
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def preprocess(image: Any) -> np.ndarray:
    """Resize (short side), centre-crop and normalise a PIL image to NCHW."""

    from PIL import Image

    image = image.convert("RGB")
    scale = CLIP_INPUT_SIZE / min(image.size)
    resized = image.resize(
        (max(CLIP_INPUT_SIZE, round(image.width * scale)), max(CLIP_INPUT_SIZE, round(image.height * scale))),
        Image.Resampling.BICUBIC,
    )
    left = (resized.width - CLIP_INPUT_SIZE) // 2
    top = (resized.height - CLIP_INPUT_SIZE) // 2
    cropped = resized.crop((left, top, left + CLIP_INPUT_SIZE, top + CLIP_INPUT_SIZE))
    pixels = (np.asarray(cropped, dtype=np.float32) / 255.0 - CLIP_MEAN) / CLIP_STD
    return pixels.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32)


class CLIPExtractor:
    """Extract normalized 512-dimensional image features.

    Models load lazily on first use (or on the first health check) so that
    importing the service never downloads or allocates anything.
    """

    dimension = 512

    def __init__(self) -> None:
        self.model: Any | None = None
        self.processor: Any | None = None
        self._torch: Any | None = None
        self._session: Any | None = None
        self._style_tags: list[str] = []
        self._style_embeddings: np.ndarray | None = None
        self._model_attempted = False
        self.backend = "fallback"

        mode = os.getenv("CLIP_ENABLED", "auto").strip().lower()
        self._onnx_path = None if mode in _FALSE else resolve_model("CLIP_MODEL_PATH", "clip_visual.onnx")
        self._allow_transformers = mode in _TRUE
        #: Whether real CLIP is *wanted*; ``ready()`` says whether it works.
        self.enabled = self._onnx_path is not None or self._allow_transformers
        self.model_name = os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")

    # ------------------------------------------------------------- loading

    def ready(self) -> bool:
        """True when embeddings come from a real model, not the fallback."""

        return self._ensure_model()

    def _ensure_model(self) -> bool:
        if self.backend != "fallback":
            return True
        if self._model_attempted or not self.enabled:
            return False
        self._model_attempted = True
        if self._onnx_path is not None and self._load_onnx():
            return True
        if self._allow_transformers and self._load_transformers():
            return True
        return False

    def _load_onnx(self) -> bool:
        try:
            import onnxruntime as ort

            session = ort.InferenceSession(str(self._onnx_path), providers=["CPUExecutionProvider"])
            output_shape = session.get_outputs()[0].shape
            if output_shape and isinstance(output_shape[-1], int) and output_shape[-1] != self.dimension:
                raise ValueError(f"expected {self.dimension}-d embeddings, model produces {output_shape[-1]}")
            self._session = session
            self._load_style_embeddings()
            self.backend = "onnx"
            logger.info("CLIP ONNX model loaded: %s", self._onnx_path)
            return True
        except Exception as exc:  # noqa: BLE001 - model loading must not break health checks
            self._session = None
            logger.warning("CLIP ONNX model unavailable (%s)", exc)
            return False

    def _load_style_embeddings(self) -> None:
        path = resolve_model("CLIP_STYLE_TAGS_PATH", "clip_style_tags.npz")
        if path is None:
            logger.warning("No style-tag embeddings found; style tags will be empty")
            return
        with np.load(path, allow_pickle=False) as data:
            tags = [str(tag) for tag in data["tags"].tolist()]
            embeddings = np.asarray(data["embeddings"], dtype=np.float32)
        if embeddings.ndim != 2 or embeddings.shape != (len(tags), self.dimension):
            raise ValueError(f"style-tag embeddings have unexpected shape {embeddings.shape}")
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        self._style_tags = tags
        self._style_embeddings = embeddings / np.clip(norms, 1e-12, None)

    def _load_transformers(self) -> bool:
        try:
            import torch
            from transformers import CLIPModel, CLIPProcessor

            kwargs = {}
            if os.getenv("CLIP_LOCAL_ONLY", "false").lower() in _TRUE:
                kwargs["local_files_only"] = True
            self.model = CLIPModel.from_pretrained(self.model_name, **kwargs)
            self.processor = CLIPProcessor.from_pretrained(self.model_name, **kwargs)
            self.model.eval()
            self._torch = torch
            self.backend = "transformers"
            logger.info("CLIP model loaded: %s", self.model_name)
            return True
        except Exception as exc:  # noqa: BLE001 - model loading must not break health checks
            self.model = None
            self.processor = None
            logger.warning("CLIP unavailable (%s); using deterministic embeddings", exc)
            return False

    def describe(self) -> dict[str, Any]:
        ready = self.ready()
        return {
            # ``clip_enabled`` is what callers key degradation on, so it must
            # mean "real CLIP is answering", not "someone set a flag".
            "clip_enabled": ready,
            "model_loaded": ready,
            "clip_backend": self.backend,
            "style_tags_available": self.backend == "transformers" or self._style_embeddings is not None,
        }

    # ----------------------------------------------------------- embedding

    def embed(self, image_bytes: bytes) -> list[float]:
        if not image_bytes:
            raise ValueError("image is empty")
        if not self._ensure_model():
            return self._fallback_embedding(image_bytes)

        import io

        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        if self.backend == "onnx":
            input_name = self._session.get_inputs()[0].name
            features = np.asarray(self._session.run(None, {input_name: preprocess(image)})[0], dtype=np.float32)
            vector = features.reshape(-1)
            if vector.size != self.dimension or not np.all(np.isfinite(vector)):
                raise ValueError("CLIP model returned an invalid embedding")
            vector = vector / max(float(np.linalg.norm(vector)), 1e-12)
            return [float(value) for value in vector]

        inputs = self.processor(images=image, return_tensors="pt")
        with self._torch.no_grad():
            features = self.model.get_image_features(**inputs)
            features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
        return [float(value) for value in features[0].tolist()]

    @classmethod
    def _fallback_embedding(cls, image_bytes: bytes) -> list[float]:
        # SHA-512 gives 64 stable bytes.  Repeating and centering the digest is
        # not a semantic substitute for CLIP, but it is deterministic and has
        # the same shape, so local pipelines remain testable without a model.
        digest = hashlib.sha512(image_bytes).digest()
        raw = np.frombuffer((digest * ((cls.dimension // len(digest)) + 1))[: cls.dimension], dtype=np.uint8)
        values = raw.astype(np.float32) / 127.5 - 1.0
        values /= max(float(np.linalg.norm(values)), 1e-12)
        return [float(value) for value in values]

    def get_style_tags(self, embedding: list[float]) -> list[str]:
        if not embedding:
            return []
        if self._ensure_model() and self.backend == "onnx":
            if self._style_embeddings is None:
                return []  # never invent tags for a real embedding
            vector = np.asarray(embedding, dtype=np.float32)
            scores = self._style_embeddings @ vector
            return [self._style_tags[index] for index in np.argsort(-scores, kind="stable")[:3]]
        if self.backend == "transformers":
            torch = self._torch
            texts = [f"a {tag} outfit" for tag in STYLE_TAGS]
            inputs = self.processor(text=texts, return_tensors="pt", padding=True)
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
            vector = torch.tensor(embedding, dtype=text_features.dtype).unsqueeze(0)
            scores = (vector @ text_features.T).squeeze(0)
            return [STYLE_TAGS[index] for index in scores.topk(min(3, len(STYLE_TAGS))).indices.tolist()]

        vector = np.asarray(embedding, dtype=np.float32)
        scores = []
        for tag in STYLE_TAGS:
            prototype = np.frombuffer(
                (hashlib.sha512(tag.encode("utf-8")).digest() * 9)[: self.dimension],
                dtype=np.uint8,
            ).astype(np.float32)
            prototype = prototype / 127.5 - 1.0
            prototype /= max(float(np.linalg.norm(prototype)), 1e-12)
            scores.append(float(np.dot(vector, prototype)))
        return [STYLE_TAGS[index] for index in np.argsort(scores)[::-1][:3]]
