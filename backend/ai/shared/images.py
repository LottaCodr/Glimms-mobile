"""Image helpers shared by the vision services.

Detection reports boxes in the coordinate space of the *EXIF-oriented* image.
Every service that later consumes a box (attributes, mockups) must open the
image the same way, otherwise boxes land on the wrong pixels for any photo
taken with a rotated phone.
"""

from __future__ import annotations

import io
import math
from typing import Any

from PIL import Image, ImageOps


def open_oriented(image_bytes: bytes) -> Image.Image:
    """Decode an image and apply its EXIF orientation."""

    if not image_bytes:
        raise ValueError("image is empty")
    with Image.open(io.BytesIO(image_bytes)) as source:
        try:
            image = ImageOps.exif_transpose(source)
        except Exception:  # noqa: BLE001 - malformed EXIF should not reject valid pixels
            image = source
        image.load()
        return image.copy() if image is source else image


def parse_bbox(value: Any) -> tuple[float, float, float, float] | None:
    """Return ``(x, y, width, height)`` for a usable box, else ``None``."""

    if not isinstance(value, dict):
        return None
    try:
        x, y = float(value.get("x", 0)), float(value.get("y", 0))
        width, height = float(value["width"]), float(value["height"])
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(number) for number in (x, y, width, height)):
        return None
    if width <= 0 or height <= 0:
        return None
    return x, y, width, height


def crop_to_bbox(image: Image.Image, bbox: Any, *, margin: float = 0.0) -> Image.Image:
    """Crop ``image`` to ``bbox`` (clamped to the image).

    A missing, malformed or degenerate box returns the image unchanged: a
    whole-image answer is better than failing the item.  ``margin`` grows the
    box by that fraction on every side, which gives models a little context.
    """

    parsed = parse_bbox(bbox)
    if parsed is None:
        return image
    x, y, width, height = parsed
    pad_x, pad_y = width * margin, height * margin
    left = max(0, math.floor(x - pad_x))
    top = max(0, math.floor(y - pad_y))
    right = min(image.width, math.ceil(x + width + pad_x))
    bottom = min(image.height, math.ceil(y + height + pad_y))
    if right - left < 2 or bottom - top < 2:
        return image
    return image.crop((left, top, right, bottom))


def to_png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PNG")
    return output.getvalue()
