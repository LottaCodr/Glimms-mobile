from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from shared.runtime import DevFallbackBlocked, guard_dev_fallback
from shared.images import crop_to_bbox, open_oriented, parse_bbox, to_png_bytes
from shared.s3 import fetch_image_bytes

from .clip_extractor import CLIPExtractor
from .color_extractor import ColorExtractor
from .texture_extractor import TextureExtractor

router = APIRouter()
logger = logging.getLogger(__name__)

# These objects are lightweight: CLIP itself is lazy and will not download at
# import time.
clip = CLIPExtractor()
color = ColorExtractor()
texture = TextureExtractor()


class ExtractionRequest(BaseModel):
    items: list[dict] = Field(..., min_length=1, max_length=50)


class ExtractionError(BaseModel):
    image_key: str
    error: str


class ExtractionResponse(BaseModel):
    items: list[dict]
    processed_count: int
    failed_count: int
    errors: list[ExtractionError] = Field(default_factory=list)


def _item_pixels(image_bytes: bytes, bbox: object) -> bytes:
    """The pixels that describe one item.

    Several items are usually detected in the same photo.  Describing each by
    the whole photo would give them identical embeddings, colours and
    textures, so crop to the item's detection box when there is one.  A small
    margin keeps a little context around the object.
    """

    if parse_bbox(bbox) is None:
        return image_bytes
    return to_png_bytes(crop_to_bbox(open_oriented(image_bytes), bbox, margin=0.04))


@router.post("/extract", response_model=ExtractionResponse)
async def extract(body: ExtractionRequest) -> ExtractionResponse:
    # Offline vectors are stable and mutually comparable, but they are not
    # CLIP space: indexing them alongside real embeddings corrupts search.
    try:
        guard_dev_fallback(
            "attribute-extractor",
            # Readiness, not the CLIP_ENABLED flag: a flag that is on while the
            # model failed to load would otherwise index placeholders as real.
            degraded=not clip.ready(),
            reason="no CLIP model is loaded; embeddings would be deterministic placeholders",
            remedy="deploy the image built with models (scripts/build_models.py) or set CLIP_MODEL_PATH",
        )
    except DevFallbackBlocked as exc:
        raise HTTPException(status_code=503, detail=exc.detail()) from exc

    enriched: list[dict] = []
    errors: list[ExtractionError] = []
    for item in body.items:
        key = item.get("image_key")
        try:
            if not isinstance(key, str) or not key.strip():
                raise ValueError("image_key is required")
            image_bytes = _item_pixels(fetch_image_bytes(key), item.get("bbox"))
            embedding = clip.embed(image_bytes)
            color_info = color.extract(image_bytes)
            texture_info = texture.extract(image_bytes)
            enriched.append(
                {
                    **item,
                    "embedding": embedding,
                    "embedding_dimension": len(embedding),
                    "color": color_info,
                    "texture": texture_info,
                    "style_tags": clip.get_style_tags(embedding),
                }
            )
        except Exception as exc:  # noqa: BLE001 - process the remaining batch items
            logger.warning("Extraction failed for %s: %s", key, exc)
            errors.append(
                ExtractionError(
                    image_key=str(key or ""),
                    error="image could not be processed",
                )
            )
            # Preserve the item so a downstream caller can associate the error
            # with the original detection.
            enriched.append(
                {
                    **item,
                    "embedding": [],
                    "embedding_dimension": 0,
                    "color": {},
                    "texture": {},
                    "style_tags": [],
                }
            )
    return ExtractionResponse(
        items=enriched,
        processed_count=len(body.items) - len(errors),
        failed_count=len(errors),
        errors=errors,
    )
