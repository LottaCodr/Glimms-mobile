"""Image object detection.

The production image ships an open-vocabulary YOLO-World model exported to
ONNX with the Glimms vocabulary baked in (``scripts/build_models.py``), found
through ``MODELS_DIR``.  ``MODEL_PATH`` / ``MODEL_LABELS`` point the service at
any other YOLOv8-layout ONNX model instead.

Without a model the service answers with deterministic prototype boxes.  That
keeps the pipeline exercisable in development, is reported by ``/health``, and
is refused in production (see ``shared.runtime``).
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from shared.models import manifest, resolve_model

logger = logging.getLogger(__name__)

LABELS = {
    "wardrobe": [
        "shirt",
        "pants",
        "dress",
        "jacket",
        "shoes",
        "bag",
        "hat",
        "skirt",
        "coat",
        "sweater",
        "jeans",
        "shorts",
        "blazer",
        "suit",
    ],
    "room": [
        "chair",
        "sofa",
        "table",
        "desk",
        "lamp",
        "shelf",
        "bed",
        "cabinet",
        "rug",
        "curtain",
        "pillow",
        "bookcase",
        "wardrobe",
        "mirror",
    ],
    "garden": [
        "plant",
        "flower",
        "tree",
        "shrub",
        "grass",
        "succulent",
        "herb",
        "pot",
        "fence",
        "path",
    ],
}

CATEGORIES = {
    "shirt": "top",
    "jacket": "top",
    "sweater": "top",
    "coat": "top",
    "dress": "full",
    "pants": "bottom",
    "jeans": "bottom",
    "shorts": "bottom",
    "skirt": "bottom",
    "shoes": "footwear",
    "bag": "accessory",
    "hat": "accessory",
    "blazer": "top",
    "suit": "full",
}

# The standard COCO names are useful when a stock YOLO model is mounted.  A
# domain-specific model should set MODEL_LABELS to its labels instead.
COCO_LABELS = [
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
]

COCO_TO_DOMAIN = {
    "couch": "sofa",
    "dining table": "table",
    "potted plant": "plant",
    "backpack": "bag",
    "handbag": "bag",
    "suitcase": "bag",
    "vase": "pot",
}

#: Every label the product knows, in a stable order.  This is the vocabulary
#: baked into the open-vocabulary detector at image build time.
DOMAIN_VOCABULARY: list[str] = list(dict.fromkeys(label for labels in LABELS.values() for label in labels))

DEFAULT_MODEL_FILENAME = "detector.onnx"
LETTERBOX_FILL = 114
MAX_DETECTIONS_PER_IMAGE = 30


def _env_float(name: str, default: float, low: float = 0.0, high: float = 1.0) -> float:
    try:
        value = float(os.getenv(name, "").strip() or default)
    except ValueError:
        value = default
    return min(max(value, low), high)


class Detector:
    def __init__(self) -> None:
        self.model_path: Path | None = None
        self.model = self._load_model()
        metadata = manifest().get("detector", {}) if self.model is not None else {}

        self.model_labels = self._load_labels()
        # Open-vocabulary scores run lower than a closed-set detector's, so a
        # build may record the threshold its model was validated with.
        self.threshold = _env_float("CONFIDENCE_THRESHOLD", float(metadata.get("confidence_threshold", 0.5)))
        self.nms_threshold = _env_float("NMS_IOU_THRESHOLD", 0.45)
        # Near-synonyms ("pants"/"jeans") fire on the same garment.  Keep only
        # the most confident label for boxes that are nearly identical.
        self.cross_class_threshold = _env_float("CROSS_CLASS_IOU_THRESHOLD", 0.8)
        try:
            configured_input_size = int(os.getenv("MODEL_INPUT_SIZE", "") or metadata.get("input_size", 640))
        except (TypeError, ValueError):
            configured_input_size = 640
        self.input_size = max(configured_input_size, 32)

    def _load_model(self) -> Any | None:
        path = resolve_model("MODEL_PATH", DEFAULT_MODEL_FILENAME)
        if path is None and os.getenv("MODEL_PATH") is None:
            # Location used before models moved to MODELS_DIR.
            legacy = Path(__file__).resolve().parents[1] / "models" / "yolov8n.onnx"
            path = legacy if legacy.is_file() else None
        if path is None:
            logger.warning("No detector model found; using the development fallback")
            return None

        try:
            import onnxruntime as ort

            logger.info("Loading ONNX detector from %s", path)
            session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            if not session.get_inputs():
                raise ValueError("ONNX detector has no inputs")
            self.model_path = path
            return session
        except Exception as exc:  # noqa: BLE001 - model errors must not prevent health checks
            logger.warning("ONNX detector could not be loaded: %s", exc)
            return None

    def _load_labels(self) -> list[str]:
        """MODEL_LABELS, else ``<model>.labels.txt`` beside the model, else COCO."""

        configured = [label.strip() for label in os.getenv("MODEL_LABELS", "").split(",") if label.strip()]
        if configured:
            return configured
        if self.model_path is not None:
            sidecar = self.model_path.with_suffix(".labels.txt")
            try:
                labels = [line.strip() for line in sidecar.read_text(encoding="utf-8").splitlines() if line.strip()]
                if labels:
                    return labels
            except OSError:
                pass
        return COCO_LABELS

    def describe(self) -> dict[str, Any]:
        """Health details: enough to tell which model is answering."""

        return {
            "model_loaded": self.model is not None,
            "model_file": self.model_path.name if self.model_path else None,
            "label_count": len(self.model_labels) if self.model is not None else 0,
            "confidence_threshold": self.threshold,
        }

    def detect(self, image_bytes: bytes, vertical: str, image_key: str) -> list[dict]:
        if vertical not in LABELS:
            raise ValueError(f"unsupported vertical: {vertical}")
        image = self._to_numpy(image_bytes)
        if self.model is not None:
            return self._infer(image, LABELS[vertical], image_key)
        return self._mock(LABELS[vertical], image_key, image.shape[:2], image_bytes)

    def _to_numpy(self, data: bytes) -> np.ndarray:
        if not data:
            raise ValueError("image is empty")
        with Image.open(io.BytesIO(data)) as source:
            image = self._auto_rotate(source).convert("RGB")
            return np.asarray(image, dtype=np.uint8)

    @staticmethod
    def _auto_rotate(image: Image.Image) -> Image.Image:
        """Apply EXIF orientation, including mirrored orientations."""

        try:
            return ImageOps.exif_transpose(image)
        except Exception:  # noqa: BLE001 - malformed EXIF should not reject valid pixels
            # Some malformed images expose invalid EXIF.  The pixels are still
            # useful, so keep the original rather than failing the request.
            return image

    def _letterbox(self, image: np.ndarray) -> tuple[np.ndarray, float, float, float]:
        """Resize keeping the aspect ratio and pad to a square, as YOLO is trained.

        Returns the NCHW float tensor plus ``scale, pad_x, pad_y`` to map
        boxes back to the original image.
        """

        height, width = image.shape[:2]
        size = self.input_size
        scale = min(size / width, size / height)
        new_width = max(1, min(size, round(width * scale)))
        new_height = max(1, min(size, round(height * scale)))
        resized = Image.fromarray(image, mode="RGB").resize((new_width, new_height), Image.Resampling.BILINEAR)
        pad_x, pad_y = (size - new_width) / 2, (size - new_height) / 2
        canvas = np.full((size, size, 3), LETTERBOX_FILL, dtype=np.uint8)
        top, left = int(pad_y), int(pad_x)
        canvas[top : top + new_height, left : left + new_width] = np.asarray(resized, dtype=np.uint8)
        tensor = canvas.astype(np.float32) / 255.0
        return tensor.transpose(2, 0, 1)[np.newaxis, ...], scale, float(left), float(top)

    def _infer(self, image: np.ndarray, valid_labels: list[str], image_key: str) -> list[dict]:
        """Run common YOLOv8 ONNX output layouts and clamp boxes to the image."""

        height, width = image.shape[:2]
        tensor, scale, pad_x, pad_y = self._letterbox(image)
        input_name = self.model.get_inputs()[0].name
        outputs = self.model.run(None, {input_name: tensor})
        if not outputs:
            return []

        predictions = np.asarray(outputs[0])
        if predictions.ndim == 3:
            predictions = predictions[0]
        if predictions.ndim == 1:
            predictions = predictions.reshape(1, -1)
        if predictions.ndim != 2:
            logger.warning("Unsupported detector output shape: %s", predictions.shape)
            return []
        # YOLOv8 commonly returns [4 + classes, 8400], while some exporters
        # return the transposed [8400, 4 + classes] layout.
        if (
            6 <= predictions.shape[0] <= 256
            and (predictions.shape[0] < predictions.shape[1] or predictions.shape[1] < 6)
        ):
            predictions = predictions.T

        # Drop the overwhelming majority of anchors before the Python loop.
        if predictions.shape[1] > 6:
            first_score = 5 if predictions.shape[1] == 85 else 4
            best = predictions[:, first_score:].max(axis=1)
            if predictions.shape[1] == 85:
                best = best * predictions[:, 4]
            predictions = predictions[best >= self.threshold]
        else:
            predictions = predictions[predictions[:, 4] >= self.threshold]

        results: list[dict] = []
        for row in predictions:
            parsed = self._parse_prediction(row, width, height, valid_labels, scale, pad_x, pad_y)
            if parsed is None:
                continue
            confidence, label, box = parsed
            if confidence < self.threshold:
                continue
            results.append(
                {
                    "label": label,
                    "confidence": round(float(confidence), 3),
                    "bbox": box,
                    "category": CATEGORIES.get(label, "item"),
                    "image_key": image_key,
                }
            )
        return self._suppress_across_classes(self._nms(results))[:MAX_DETECTIONS_PER_IMAGE]

    def _suppress_across_classes(self, detections: list[dict]) -> list[dict]:
        """Keep the most confident label where different labels share a box."""

        kept: list[dict] = []
        for candidate in detections:  # already sorted by confidence
            if all(self._iou(candidate["bbox"], other["bbox"]) <= self.cross_class_threshold for other in kept):
                kept.append(candidate)
        return kept

    def _nms(self, detections: list[dict]) -> list[dict]:
        """Suppress overlapping boxes of the same class."""

        kept: list[dict] = []
        for label in sorted({str(item.get("label")) for item in detections}):
            candidates = sorted(
                (item for item in detections if item.get("label") == label),
                key=lambda item: (-float(item["confidence"]), str(item["image_key"]), item["bbox"]["x"]),
            )
            while candidates:
                best = candidates.pop(0)
                kept.append(best)
                candidates = [
                    candidate
                    for candidate in candidates
                    if self._iou(best["bbox"], candidate["bbox"]) <= self.nms_threshold
                ]
        return sorted(kept, key=lambda item: (-float(item["confidence"]), item["label"]))

    @staticmethod
    def _iou(first: dict, second: dict) -> float:
        left = max(first["x"], second["x"])
        top = max(first["y"], second["y"])
        right = min(first["x"] + first["width"], second["x"] + second["width"])
        bottom = min(first["y"] + first["height"], second["y"] + second["height"])
        intersection = max(0, right - left) * max(0, bottom - top)
        first_area = max(0, first["width"]) * max(0, first["height"])
        second_area = max(0, second["width"]) * max(0, second["height"])
        union = first_area + second_area - intersection
        return intersection / union if union else 0.0

    def _parse_prediction(
        self,
        row: np.ndarray,
        width: int,
        height: int,
        valid_labels: list[str],
        scale: float | None = None,
        pad_x: float = 0.0,
        pad_y: float = 0.0,
    ) -> tuple[float, str, dict] | None:
        """Turn one model row into ``(confidence, label, box)`` in image pixels.

        ``scale``/``pad_x``/``pad_y`` describe the letterbox applied to the
        input.  Without them the input is assumed to have been stretched.
        """

        if row.size < 6:
            return None

        # Six-column exports are normally x1,y1,x2,y2,confidence,class_id.
        direct_xyxy = row.size == 6
        if direct_xyxy:
            confidence = float(row[4])
            class_index = int(row[5])
            coords = row[:4]
        else:
            scores = row[4:]
            if row.size == 85:  # YOLOv5-style objectness + 80 class scores
                scores = row[5:] * row[4]
            class_index = int(np.argmax(scores))
            confidence = float(scores[class_index])
            coords = row[:4]

        if not np.isfinite(confidence) or confidence <= 0:
            return None
        label = self._label_for_class(class_index, valid_labels)
        if label is None:
            return None

        if direct_xyxy:
            x1, y1, x2, y2 = [float(value) for value in coords]
        else:
            cx, cy, box_width, box_height = [float(value) for value in coords]
            x1, y1 = cx - box_width / 2, cy - box_height / 2
            x2, y2 = cx + box_width / 2, cy + box_height / 2

        # Exporters differ on whether coordinates are normalized or in input
        # pixels.  Bring both forms to input pixels first.
        if max(abs(x1), abs(y1), abs(x2), abs(y2)) <= 1.5:
            x1, x2 = x1 * self.input_size, x2 * self.input_size
            y1, y2 = y1 * self.input_size, y2 * self.input_size

        if scale:
            x1, x2 = (x1 - pad_x) / scale, (x2 - pad_x) / scale
            y1, y2 = (y1 - pad_y) / scale, (y2 - pad_y) / scale
        else:
            x1, x2 = x1 * width / self.input_size, x2 * width / self.input_size
            y1, y2 = y1 * height / self.input_size, y2 * height / self.input_size

        left = max(0, min(width - 1, round(x1)))
        top = max(0, min(height - 1, round(y1)))
        right = max(left + 1, min(width, round(x2)))
        bottom = max(top + 1, min(height, round(y2)))
        if right <= left or bottom <= top:
            return None
        return min(max(confidence, 0.0), 1.0), label, {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        }

    def _label_for_class(self, class_index: int, valid_labels: list[str]) -> str | None:
        if class_index < 0:
            return None
        raw_label = self.model_labels[class_index] if class_index < len(self.model_labels) else None
        if raw_label is None:
            return None
        normalized = COCO_TO_DOMAIN.get(raw_label, raw_label)
        if normalized in valid_labels:
            return normalized
        # A custom model may use category names not present in the starter
        # vocabulary.  Keep known domain objects, but do not turn a person or a
        # car into a random clothing item.
        if raw_label in valid_labels:
            return raw_label
        return None

    @staticmethod
    def _mock(
        valid_labels: list[str],
        image_key: str,
        image_shape: tuple[int, int] = (480, 640),
        image_bytes: bytes = b"",
    ) -> list[dict]:
        """Return stable prototype detections when no model is mounted."""

        seed = hashlib.sha256(image_key.encode("utf-8") + image_bytes[:4096]).digest()
        count = min(3, len(valid_labels))
        order = sorted(range(len(valid_labels)), key=lambda index: seed[index % len(seed)])
        height, width = image_shape
        results = []
        for position, index in enumerate(order[:count]):
            box_width = max(1, min(width, int(width * (0.28 + position * 0.04))))
            box_height = max(1, min(height, int(height * (0.42 + position * 0.03))))
            x = min(max(0, int(width * (0.12 + position * 0.24))), max(0, width - box_width))
            y = min(max(0, int(height * (0.12 + position * 0.12))), max(0, height - box_height))
            label = valid_labels[index]
            results.append(
                {
                    "label": label,
                    "confidence": round(0.72 + (seed[(index + 7) % len(seed)] / 2550), 3),
                    "bbox": {"x": x, "y": y, "width": box_width, "height": box_height},
                    "category": CATEGORIES.get(label, "item"),
                    "image_key": image_key,
                }
            )
        return results
