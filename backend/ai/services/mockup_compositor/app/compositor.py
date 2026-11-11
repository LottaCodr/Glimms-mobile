"""Pillow compositor for item mockups."""

from __future__ import annotations

import io
import math
from typing import Any

import logging
import threading

import numpy as np
from PIL import Image, ImageColor, ImageOps

from shared.images import crop_to_bbox, open_oriented
from shared.models import resolve_model

logger = logging.getLogger(__name__)

#: U^2-Net salient-object segmentation: 320x320 input, ImageNet statistics.
SEGMENTER_INPUT_SIZE = 320
SEGMENTER_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
SEGMENTER_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class BackgroundRemover:
    """Cut an object out of its background with a U^2-Net ONNX model.

    The model is baked into the production image (``scripts/build_models.py``)
    and loaded on first use.  When it is absent, ``available`` is false and
    callers keep the original pixels.
    """

    def __init__(self) -> None:
        self._session: Any | None = None
        self._attempted = False
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self._load() is not None

    def _load(self) -> Any | None:
        with self._lock:
            if self._attempted:
                return self._session
            self._attempted = True
            path = resolve_model("BACKGROUND_MODEL_PATH", "background.onnx")
            if path is None:
                logger.info("No background-removal model found; cutouts are disabled")
                return None
            try:
                import onnxruntime as ort

                self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
                logger.info("Background-removal model loaded: %s", path)
            except Exception as exc:  # noqa: BLE001 - optional enhancement must be fail-open
                logger.warning("Background-removal model could not be loaded: %s", exc)
                self._session = None
            return self._session

    def remove(self, image: Image.Image) -> Image.Image:
        session = self._load()
        if session is None:
            return image
        rgb = image.convert("RGB")
        resized = rgb.resize((SEGMENTER_INPUT_SIZE, SEGMENTER_INPUT_SIZE), Image.Resampling.LANCZOS)
        pixels = np.asarray(resized, dtype=np.float32)
        pixels = pixels / max(float(pixels.max()), 1e-6)
        tensor = ((pixels - SEGMENTER_MEAN) / SEGMENTER_STD).transpose(2, 0, 1)[np.newaxis, ...]
        prediction = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor.astype(np.float32)})[0])
        mask = prediction.reshape(prediction.shape[-2], prediction.shape[-1])
        low, high = float(mask.min()), float(mask.max())
        if not np.isfinite(low) or not np.isfinite(high) or high - low < 1e-6:
            return image  # the model found nothing to separate
        mask = (mask - low) / (high - low)
        alpha = Image.fromarray((mask * 255).astype(np.uint8), mode="L").resize(rgb.size, Image.Resampling.LANCZOS)
        # Respect transparency the source already had.
        if image.mode == "RGBA":
            alpha = Image.fromarray(
                np.minimum(np.asarray(alpha), np.asarray(image.getchannel("A"))).astype(np.uint8), mode="L"
            )
        cutout = rgb.convert("RGBA")
        cutout.putalpha(alpha)
        return cutout


background_remover = BackgroundRemover()


class Compositor:
    def compose(
        self,
        layers: list[tuple[dict[str, Any], bytes]],
        width: int = 1200,
        height: int = 900,
        background: str = "#f7f4ef",
        remove_background: bool = False,
        output_format: str = "JPEG",
    ) -> tuple[bytes, dict[str, Any]]:
        if not layers:
            raise ValueError("at least one layer is required")
        if not (1 <= width <= 4000 and 1 <= height <= 4000):
            raise ValueError("canvas dimensions must be between 1 and 4000 pixels")

        try:
            background_rgb = ImageColor.getrgb(background)
        except (ValueError, TypeError) as exc:
            raise ValueError("background must be a valid color") from exc
        canvas = Image.new("RGBA", (width, height), (*background_rgb[:3], 255))
        placed = []
        cell_columns = max(1, math.ceil(math.sqrt(len(layers))))
        cell_width = max(1, width // cell_columns)
        cell_rows = math.ceil(len(layers) / cell_columns)
        cell_height = max(1, height // cell_rows)

        for index, (layer, data) in enumerate(layers):
            # ``crop`` is a region of the *source* photo (a detection box);
            # ``bbox``/``position`` say where the layer goes on the canvas.
            image = crop_to_bbox(open_oriented(data), layer.get("crop")).convert("RGBA")
            if remove_background:
                image = self._remove_background(image)

            bbox = layer.get("bbox") or {}
            position = layer.get("position") or {}
            x = self._number(position.get("x", bbox.get("x")), None)
            y = self._number(position.get("y", bbox.get("y")), None)
            target_width = self._number(position.get("width", bbox.get("width")), None)
            target_height = self._number(position.get("height", bbox.get("height")), None)

            if target_width is None or target_height is None:
                column = index % cell_columns
                row = index // cell_columns
                padding = max(8, min(cell_width, cell_height) // 12)
                max_width = max(1, cell_width - padding * 2)
                max_height = max(1, cell_height - padding * 2)
                resized = ImageOps.contain(image, (max_width, max_height), method=Image.Resampling.LANCZOS)
                x = column * cell_width + (cell_width - resized.width) // 2
                y = row * cell_height + (cell_height - resized.height) // 2
            else:
                target_width = max(1, min(width, int(target_width)))
                target_height = max(1, min(height, int(target_height)))
                resized = ImageOps.contain(
                    image,
                    (target_width, target_height),
                    method=Image.Resampling.LANCZOS,
                )
                x = int(x or 0) + (target_width - resized.width) // 2
                y = int(y or 0) + (target_height - resized.height) // 2

            x = max(0, min(width - resized.width, int(x or 0)))
            y = max(0, min(height - resized.height, int(y or 0)))
            canvas.alpha_composite(resized, (x, y))
            placed.append(
                {
                    "image_key": layer.get("image_key", ""),
                    "x": x,
                    "y": y,
                    "width": resized.width,
                    "height": resized.height,
                }
            )

        output = io.BytesIO()
        output_format = output_format.upper()
        if output_format == "PNG":
            canvas.save(output, format="PNG", optimize=True)
        else:
            canvas.convert("RGB").save(output, format="JPEG", quality=90, optimize=True)
        return output.getvalue(), {"width": width, "height": height, "layers": placed}

    @staticmethod
    def _number(value: Any, default: float | None) -> float | None:
        if value is None:
            return default
        try:
            number = float(value)
            return number if math.isfinite(number) else default
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _remove_background(image: Image.Image) -> Image.Image:
        # Background removal is an enhancement: a regular image is preferable
        # to making the entire composition unavailable.
        try:
            return background_remover.remove(image)
        except Exception as exc:  # noqa: BLE001 - fail open
            logger.warning("Background removal failed: %s", exc)
            return image
