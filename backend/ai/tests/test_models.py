"""The real-model code paths, exercised with tiny synthetic ONNX models.

The production weights are hundreds of megabytes and are built into the image
(``scripts/build_models.py``), so they are not available to unit tests.  These
models have the same input/output *contract* as the real ones and known
outputs, which is what lets the surrounding logic — letterboxing, box
mapping, label routing, preprocessing, cropping, guards — be asserted exactly.
"""

from __future__ import annotations

import asyncio
import io
import json

import numpy as np
import onnx
import pytest
from onnx import TensorProto, helper, numpy_helper
from PIL import Image

OPSET = [helper.make_opsetid("", 13)]


def _save(graph: onnx.GraphProto, path) -> None:
    model = helper.make_model(graph, opset_imports=OPSET)
    model.ir_version = 8  # readable by the pinned onnxruntime
    onnx.checker.check_model(model)
    onnx.save(model, str(path))


def _png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _two_tone(width=400, height=200, left=(220, 20, 20), right=(20, 20, 220)) -> Image.Image:
    image = Image.new("RGB", (width, height), left)
    image.paste(right, (width // 2, 0, width, height))
    return image


# ------------------------------------------------------------------ detector


def _constant_detector(path, rows: list[list[float]], classes: int) -> None:
    """A YOLOv8-layout model ([1, 4 + classes, anchors]) with fixed output."""

    predictions = np.zeros((1, 4 + classes, len(rows)), dtype=np.float32)
    for anchor, row in enumerate(rows):
        predictions[0, :, anchor] = row
    graph = helper.make_graph(
        [
            helper.make_node("ReduceMean", ["images"], ["mean"], keepdims=0),
            helper.make_node("Mul", ["mean", "zero"], ["nothing"]),
            helper.make_node("Add", ["predictions", "nothing"], ["output0"]),
        ],
        "detector",
        [helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])],
        [helper.make_tensor_value_info("output0", TensorProto.FLOAT, [1, 4 + classes, len(rows)])],
        [
            numpy_helper.from_array(predictions, "predictions"),
            numpy_helper.from_array(np.zeros((), dtype=np.float32), "zero"),
        ],
    )
    _save(graph, path)


def _row(cx, cy, width, height, scores: dict[int, float], classes: int) -> list[float]:
    row = [cx, cy, width, height] + [0.0] * classes
    for index, score in scores.items():
        row[4 + index] = score
    return row


@pytest.fixture
def detector_factory(tmp_path, monkeypatch):
    labels = ["shirt", "pants", "jeans", "sofa", "plant"]

    def build(rows, **env):
        model = tmp_path / "detector.onnx"
        _constant_detector(model, [_row(*row[:4], row[4], len(labels)) for row in rows], len(labels))
        (tmp_path / "detector.labels.txt").write_text("\n".join(labels) + "\n", encoding="utf-8")
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        for name in ("MODEL_PATH", "MODEL_LABELS", "CONFIDENCE_THRESHOLD", "MODEL_INPUT_SIZE"):
            monkeypatch.delenv(name, raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        from services.object_detection.app.detector import Detector

        return Detector()

    return build


def test_detector_loads_model_and_labels_from_models_dir(detector_factory):
    detector = detector_factory([(320, 320, 100, 100, {0: 0.9})])
    assert detector.model is not None
    assert detector.model_labels == ["shirt", "pants", "jeans", "sofa", "plant"]
    assert detector.describe() == {
        "model_loaded": True,
        "model_file": "detector.onnx",
        "label_count": 5,
        "confidence_threshold": 0.5,
    }


def test_detector_maps_letterboxed_boxes_back_to_the_photo(detector_factory):
    # A 1000x500 photo is scaled by 0.64 to 640x320 and padded 160px top and
    # bottom.  A box centred in the model input therefore sits at the centre
    # of the photo, and its size is divided by the scale.
    detector = detector_factory([(320, 320, 128, 64, {0: 0.9})])
    photo = _png(Image.new("RGB", (1000, 500), (200, 200, 200)))

    [item] = detector.detect(photo, "wardrobe", "users/u/a.png")

    assert item["label"] == "shirt"
    assert item["category"] == "top"
    assert item["confidence"] == 0.9
    assert item["image_key"] == "users/u/a.png"
    assert item["bbox"] == {"x": 400, "y": 200, "width": 200, "height": 100}


def test_detector_clamps_boxes_to_the_photo(detector_factory):
    detector = detector_factory([(10, 320, 200, 2000, {0: 0.9})])
    [item] = detector.detect(_png(Image.new("RGB", (640, 640))), "wardrobe", "k")
    box = item["bbox"]
    assert box["x"] == 0 and box["y"] == 0
    assert box["x"] + box["width"] <= 640 and box["y"] + box["height"] <= 640


def test_detector_only_reports_labels_of_the_requested_vertical(detector_factory):
    detector = detector_factory(
        [
            (100, 320, 80, 80, {0: 0.9}),  # shirt
            (300, 320, 80, 80, {3: 0.9}),  # sofa
            (500, 320, 80, 80, {4: 0.9}),  # plant
        ]
    )
    photo = _png(Image.new("RGB", (640, 640)))
    assert [item["label"] for item in detector.detect(photo, "wardrobe", "k")] == ["shirt"]
    assert [item["label"] for item in detector.detect(photo, "room", "k")] == ["sofa"]
    assert [item["label"] for item in detector.detect(photo, "garden", "k")] == ["plant"]


def test_detector_applies_threshold_and_suppresses_duplicates(detector_factory):
    detector = detector_factory(
        [
            (320, 320, 200, 200, {1: 0.80}),  # pants
            (322, 320, 200, 200, {1: 0.70}),  # same pants again  -> NMS
            (320, 321, 200, 200, {2: 0.75}),  # "jeans" on the same box -> cross-class
            (100, 100, 60, 60, {0: 0.30}),    # below threshold
        ]
    )
    items = detector.detect(_png(Image.new("RGB", (640, 640))), "wardrobe", "k")
    assert [(item["label"], item["confidence"]) for item in items] == [("pants", 0.8)]


def test_detector_threshold_comes_from_manifest_then_env(detector_factory, tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps({"detector": {"confidence_threshold": 0.25}}))
    rows = [(100, 100, 60, 60, {0: 0.30})]
    assert detector_factory(rows).threshold == 0.25
    assert len(detector_factory(rows).detect(_png(Image.new("RGB", (640, 640))), "wardrobe", "k")) == 1
    assert detector_factory(rows, CONFIDENCE_THRESHOLD="0.6").threshold == 0.6


def test_detector_honours_exif_orientation(detector_factory):
    # Orientation 6 = stored landscape, displayed portrait.  Boxes must be in
    # displayed coordinates because every consumer opens the image that way.
    detector = detector_factory([(320, 320, 64, 64, {0: 0.9})])
    stored = Image.new("RGB", (800, 400), (10, 10, 10))
    exif = Image.Exif()
    exif[0x0112] = 6
    output = io.BytesIO()
    stored.save(output, format="JPEG", exif=exif)

    [item] = detector.detect(output.getvalue(), "wardrobe", "k")
    box = item["bbox"]
    assert box["x"] + box["width"] <= 400 and box["y"] + box["height"] <= 800
    assert abs((box["x"] + box["width"] / 2) - 200) <= 1
    assert abs((box["y"] + box["height"] / 2) - 400) <= 1


def test_detection_endpoint_serves_real_model_in_production(detector_factory, monkeypatch):
    from fastapi.testclient import TestClient

    detector = detector_factory([(320, 320, 128, 128, {0: 0.9})])
    monkeypatch.setenv("GLIMMS_ENV", "production")
    monkeypatch.setenv("AI_INTERNAL_TOKEN", "t")
    from services.object_detection.app import main, router

    monkeypatch.setattr(router, "fetch_image_bytes", lambda key: _png(Image.new("RGB", (640, 640))))
    main.app.state.detector = detector
    response = TestClient(main.app).post(
        "/detect",
        json={"image_keys": ["users/u/a.png"], "vertical": "wardrobe"},
        headers={"authorization": "Bearer t"},
    )
    assert response.status_code == 200
    assert [item["label"] for item in response.json()["items"]] == ["shirt"]


# ---------------------------------------------------------------------- CLIP


def _mean_colour_clip(path, dimension=512) -> np.ndarray:
    """An image tower whose embedding is a fixed projection of the mean colour."""

    projection = np.random.default_rng(7).normal(size=(3, dimension)).astype(np.float32)
    graph = helper.make_graph(
        [
            helper.make_node("ReduceMean", ["pixel_values"], ["colour"], axes=[2, 3], keepdims=0),
            helper.make_node("MatMul", ["colour", "projection"], ["image_embeds"]),
        ],
        "clip",
        [helper.make_tensor_value_info("pixel_values", TensorProto.FLOAT, ["batch", 3, 224, 224])],
        [helper.make_tensor_value_info("image_embeds", TensorProto.FLOAT, ["batch", dimension])],
        [numpy_helper.from_array(projection, "projection")],
    )
    _save(graph, path)
    return projection


@pytest.fixture
def clip_models(tmp_path, monkeypatch):
    projection = _mean_colour_clip(tmp_path / "clip_visual.onnx")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    for name in ("CLIP_ENABLED", "CLIP_MODEL_PATH", "CLIP_STYLE_TAGS_PATH"):
        monkeypatch.delenv(name, raising=False)
    return tmp_path, projection


def _extractor():
    from services.attribute_extractor.app.clip_extractor import CLIPExtractor

    return CLIPExtractor()


def test_clip_preprocessing_matches_the_reference_recipe():
    from services.attribute_extractor.app.clip_extractor import CLIP_MEAN, CLIP_STD, preprocess

    pixels = preprocess(Image.new("RGB", (640, 480), (255, 0, 128)))
    assert pixels.shape == (1, 3, 224, 224) and pixels.dtype == np.float32
    expected = (np.array([1.0, 0.0, 128 / 255]) - CLIP_MEAN) / CLIP_STD
    assert np.allclose(pixels[0, :, 100, 100], expected, atol=1e-4)

    # Centre crop: the short side is kept whole, the long side loses its ends,
    # so the seam of a wide two-tone image lands in the middle of the crop.
    wide = preprocess(_two_tone(896, 224, left=(255, 0, 0), right=(0, 0, 255)))
    red_channel = wide[0, 0, 112]
    assert red_channel[10] > 1.5 and red_channel[213] < -1.5


def test_clip_uses_the_onnx_model_when_present(clip_models):
    _, projection = clip_models
    extractor = _extractor()

    assert extractor.ready() is True
    assert extractor.backend == "onnx"
    red = np.array(extractor.embed(_png(Image.new("RGB", (300, 300), (255, 0, 0)))))
    blue = np.array(extractor.embed(_png(Image.new("RGB", (300, 300), (0, 0, 255)))))
    assert red.shape == (512,)
    assert abs(float(np.linalg.norm(red)) - 1) < 1e-5
    assert float(red @ blue) < 0.99  # a real function of the pixels, not a hash

    from services.attribute_extractor.app.clip_extractor import CLIP_MEAN, CLIP_STD

    expected = ((np.array([1.0, 0.0, 0.0]) - CLIP_MEAN) / CLIP_STD) @ projection
    assert float(red @ (expected / np.linalg.norm(expected))) > 0.9999


def test_clip_style_tags_come_from_precomputed_text_embeddings(clip_models):
    directory, _ = clip_models
    extractor = _extractor()
    target = np.array(extractor.embed(_png(Image.new("RGB", (300, 300), (255, 0, 0)))), dtype=np.float32)
    other = np.roll(target, 1)
    np.savez(
        directory / "clip_style_tags.npz",
        tags=np.array(["far", "near", "opposite"]),
        embeddings=np.stack([other, target * 3, -target]).astype(np.float32),
    )

    extractor = _extractor()
    assert extractor.get_style_tags(target.tolist())[0] == "near"
    assert extractor.get_style_tags(target.tolist())[-1] == "opposite"
    assert extractor.describe()["style_tags_available"] is True


def test_clip_never_invents_style_tags_for_real_embeddings(clip_models):
    extractor = _extractor()
    embedding = extractor.embed(_png(Image.new("RGB", (300, 300), (255, 0, 0))))
    assert extractor.get_style_tags(embedding) == []


def test_clip_reports_not_ready_when_the_flag_is_on_but_nothing_loads(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))  # empty
    monkeypatch.setenv("CLIP_ENABLED", "true")
    monkeypatch.setenv("CLIP_LOCAL_ONLY", "true")
    extractor = _extractor()
    assert extractor.enabled is True
    assert extractor.ready() is False
    assert extractor.describe()["clip_enabled"] is False
    assert len(extractor.embed(b"anything")) == 512  # documented dev fallback


def test_clip_can_be_switched_off(clip_models, monkeypatch):
    monkeypatch.setenv("CLIP_ENABLED", "false")
    extractor = _extractor()
    assert extractor.ready() is False and extractor.backend == "fallback"


def test_corrupt_clip_model_degrades_instead_of_crashing(tmp_path, monkeypatch):
    (tmp_path / "clip_visual.onnx").write_bytes(b"not a model")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    monkeypatch.delenv("CLIP_ENABLED", raising=False)
    assert _extractor().ready() is False


def _extract(monkeypatch, extractor, items, image: Image.Image):
    from services.attribute_extractor.app import router

    monkeypatch.setattr(router, "clip", extractor)
    monkeypatch.setattr(router, "fetch_image_bytes", lambda key: _png(image))
    return asyncio.run(router.extract(router.ExtractionRequest(items=items)))


def test_extraction_describes_each_item_by_its_own_box(clip_models, monkeypatch):
    items = [
        {"image_key": "users/u/a.png", "label": "shirt", "bbox": {"x": 0, "y": 0, "width": 200, "height": 200}},
        {"image_key": "users/u/a.png", "label": "pants", "bbox": {"x": 200, "y": 0, "width": 200, "height": 200}},
        {"image_key": "users/u/a.png", "label": "whole"},
    ]
    response = _extract(monkeypatch, _extractor(), items, _two_tone())

    left, right, whole = response.items
    assert response.failed_count == 0
    assert left["color"]["dominant"]["rgb"]["r"] > 200 and left["color"]["dominant"]["rgb"]["b"] < 40
    assert right["color"]["dominant"]["rgb"]["b"] > 200 and right["color"]["dominant"]["rgb"]["r"] < 40
    assert float(np.dot(left["embedding"], right["embedding"])) < 0.99
    assert whole["embedding"] != left["embedding"]
    assert left["label"] == "shirt" and left["embedding_dimension"] == 512


def test_extraction_in_production_requires_a_loaded_model(tmp_path, clip_models, monkeypatch):
    from fastapi import HTTPException

    monkeypatch.setenv("GLIMMS_ENV", "production")
    items = [{"image_key": "users/u/a.png"}]
    assert _extract(monkeypatch, _extractor(), items, _two_tone()).processed_count == 1

    # The flag alone used to satisfy the guard, so a production deployment
    # without the model silently indexed placeholder vectors.
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("MODELS_DIR", str(empty))
    monkeypatch.setenv("CLIP_ENABLED", "true")
    monkeypatch.setenv("CLIP_LOCAL_ONLY", "true")
    with pytest.raises(HTTPException) as blocked:
        _extract(monkeypatch, _extractor(), items, _two_tone())
    assert blocked.value.status_code == 503
    assert blocked.value.detail["service"] == "attribute-extractor"


# ------------------------------------------------------------------ pinecone


class _FakeIndex:
    def __init__(self) -> None:
        self.upserts: list[dict] = []
        self.queries: list[dict] = []
        self.deletes: list[dict] = []

    def upsert(self, **kwargs):
        self.upserts.append(kwargs)

    def query(self, **kwargs):
        self.queries.append(kwargs)
        return {"matches": [{"id": "a", "score": 0.9, "metadata": {"user_id": "u1"}}]}

    def delete(self, **kwargs):
        self.deletes.append(kwargs)


def _remote_store():
    from services.embedding_engine.app.store import EmbeddingStore

    store = EmbeddingStore()
    store._remote, store._remote_attempted = _FakeIndex(), True
    return store, store._remote


def test_pinecone_search_forwards_the_user_filter():
    store, index = _remote_store()
    matches = store.search([1.0, 0.0], top_k=5, namespace="items", filter_value={"user_id": "u1"})

    assert matches == [{"id": "a", "score": 0.9, "metadata": {"user_id": "u1"}}]
    assert index.queries[0]["filter"] == {"user_id": "u1"}
    assert index.queries[0]["top_k"] == 5 and index.queries[0]["namespace"] == "items"

    store.search([1.0, 0.0])
    assert "filter" not in index.queries[1]


def test_pinecone_upsert_cleans_metadata_batches_and_keeps_nothing_in_memory():
    store, index = _remote_store()
    records = [
        (f"id-{number}", [1.0, 0.0], {"user_id": "u1", "label": None, "tags": ["a"], "bbox": {"x": 1}, "score": 0.5})
        for number in range(250)
    ]
    assert len(store.upsert(records, namespace="items")) == 250

    assert [len(call["vectors"]) for call in index.upserts] == [100, 100, 50]
    assert index.upserts[0]["vectors"][0]["metadata"] == {
        "user_id": "u1",
        "tags": ["a"],
        "bbox": '{"x": 1}',
        "score": 0.5,
    }
    assert store._vectors == {}


def test_pinecone_delete_reports_requested_ids():
    store, index = _remote_store()
    assert store.delete(["a", "b"], namespace="items") == 2
    assert index.deletes == [{"ids": ["a", "b"], "namespace": "items"}]


def test_store_reports_pinecone_backend_only_when_connected(monkeypatch):
    from services.embedding_engine.app.store import EmbeddingStore

    monkeypatch.delenv("PINECONE_API_KEY", raising=False)
    assert EmbeddingStore().health()["backend"] == "memory"
    store, _ = _remote_store()
    assert store.health()["backend"] == "pinecone"


# -------------------------------------------------------------------- mockups


def _channel_segmenter(path) -> None:
    """A segmenter whose mask is the red channel of its (normalised) input."""

    graph = helper.make_graph(
        [helper.make_node("Slice", ["input", "start", "end", "axis"], ["mask"])],
        "segmenter",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 320, 320])],
        [helper.make_tensor_value_info("mask", TensorProto.FLOAT, [1, 1, 320, 320])],
        [
            numpy_helper.from_array(np.array([0], dtype=np.int64), "start"),
            numpy_helper.from_array(np.array([1], dtype=np.int64), "end"),
            numpy_helper.from_array(np.array([1], dtype=np.int64), "axis"),
        ],
    )
    _save(graph, path)


def test_compositor_crops_layers_to_the_detected_region():
    from services.mockup_compositor.app.compositor import Compositor

    source = _png(_two_tone())
    data, metadata = Compositor().compose(
        [({"image_key": "a", "crop": {"x": 200, "y": 0, "width": 200, "height": 200}}, source)],
        width=120,
        height=120,
        background="#ffffff",
        output_format="PNG",
    )
    canvas = Image.open(io.BytesIO(data)).convert("RGB")
    placed = metadata["layers"][0]
    assert placed["width"] == placed["height"]  # the square crop, not the 2:1 photo
    centre = canvas.getpixel((placed["x"] + placed["width"] // 2, placed["y"] + placed["height"] // 2))
    assert centre[2] > 200 and centre[0] < 40  # only the blue half was used
    colours = {pixel for pixel in canvas.getdata()}
    assert not any(red > 200 and blue < 40 for red, _, blue in colours)


def test_background_removal_makes_the_background_transparent(tmp_path, monkeypatch):
    from services.mockup_compositor.app import compositor as module

    _channel_segmenter(tmp_path / "background.onnx")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    monkeypatch.delenv("BACKGROUND_MODEL_PATH", raising=False)
    remover = module.BackgroundRemover()
    assert remover.available is True

    cutout = remover.remove(_two_tone(left=(255, 0, 0), right=(0, 0, 255)))
    assert cutout.mode == "RGBA" and cutout.size == (400, 200)
    assert cutout.getpixel((50, 100))[3] > 240   # "object" (red) is kept
    assert cutout.getpixel((350, 100))[3] < 15   # "background" is removed
    assert cutout.getpixel((50, 100))[:3] == (255, 0, 0)

    monkeypatch.setattr(module, "background_remover", remover)
    data, _ = module.Compositor().compose(
        [({"image_key": "a"}, _png(_two_tone(left=(255, 0, 0), right=(0, 0, 255))))],
        width=200,
        height=100,
        background="#00ff00",
        remove_background=True,
        output_format="PNG",
    )
    canvas = Image.open(io.BytesIO(data)).convert("RGB")
    assert canvas.getpixel((170, 50)) == (0, 255, 0)  # canvas shows through


def test_background_removal_is_a_no_op_without_a_model(tmp_path, monkeypatch):
    from services.mockup_compositor.app.compositor import BackgroundRemover

    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    remover = BackgroundRemover()
    image = _two_tone()
    assert remover.available is False
    assert remover.remove(image) is image


# --------------------------------------------------------------------- shared


def test_crop_to_bbox_clamps_and_tolerates_bad_boxes():
    from shared.images import crop_to_bbox, parse_bbox

    image = _two_tone()
    assert crop_to_bbox(image, {"x": 350, "y": 150, "width": 500, "height": 500}).size == (50, 50)
    assert crop_to_bbox(image, {"x": 100, "y": 50, "width": 100, "height": 100}, margin=0.1).size == (120, 120)
    for bad in (None, {}, {"x": 0, "y": 0, "width": 0, "height": 10}, {"width": "wide", "height": 1}, "box",
                {"x": float("nan"), "y": 0, "width": 5, "height": 5}):
        assert parse_bbox(bad) is None
        assert crop_to_bbox(image, bad) is image


def test_model_resolution_precedence(tmp_path, monkeypatch):
    from shared.models import manifest, resolve_model

    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    monkeypatch.delenv("SOME_MODEL", raising=False)
    assert resolve_model("SOME_MODEL", "m.onnx") is None
    assert manifest() == {}

    (tmp_path / "m.onnx").write_bytes(b"x")
    assert resolve_model("SOME_MODEL", "m.onnx") == tmp_path / "m.onnx"

    other = tmp_path / "other.onnx"
    other.write_bytes(b"y")
    monkeypatch.setenv("SOME_MODEL", str(other))
    assert resolve_model("SOME_MODEL", "m.onnx") == other
    monkeypatch.setenv("SOME_MODEL", "")  # explicit off
    assert resolve_model("SOME_MODEL", "m.onnx") is None
    monkeypatch.setenv("SOME_MODEL", str(tmp_path / "missing.onnx"))
    assert resolve_model("SOME_MODEL", "m.onnx") is None


# -- deleting an owner's vectors ---------------------------------------------


def test_memory_store_deletes_only_the_owners_vectors():
    from services.embedding_engine.app.store import EmbeddingStore

    store = EmbeddingStore()
    store.upsert(
        [
            ("u1:shirt", [1.0, 0.0], {"user_id": "u1"}),
            ("legacy-id", [1.0, 0.0], {"user_id": "u1"}),  # found by metadata, not prefix
            ("u2:shirt", [1.0, 0.0], {"user_id": "u2"}),
            ("u10:shirt", [1.0, 0.0], {"user_id": "u10"}),  # shares "u1" as a string prefix
        ]
    )

    assert store.delete_owner("u1") == 2
    remaining = {match["id"] for match in store.search([1.0, 0.0], top_k=10)}
    assert remaining == {"u2:shirt", "u10:shirt"}


class _ServerlessIndex(_FakeIndex):
    """Lists ids by prefix; refuses metadata deletes (as serverless Pinecone does)."""

    def __init__(self, ids):
        super().__init__()
        self.ids = ids

    def list(self, prefix, namespace):
        matching = [identifier for identifier in self.ids if identifier.startswith(prefix)]
        for start in range(0, len(matching), 2):
            yield matching[start : start + 2]

    def delete(self, **kwargs):
        if "filter" in kwargs:
            raise RuntimeError("serverless indexes do not support delete by metadata")
        super().delete(**kwargs)


class _PodIndex(_FakeIndex):
    """Deletes by metadata; cannot list ids (as pod-based Pinecone does)."""

    def list(self, prefix, namespace):
        raise RuntimeError("list is not supported for pod indexes")


def _store_with(index):
    from services.embedding_engine.app.store import EmbeddingStore

    store = EmbeddingStore()
    store._remote, store._remote_attempted = index, True
    return store


def test_pinecone_serverless_owner_delete_pages_through_the_id_prefix():
    index = _ServerlessIndex(["u1:a", "u1:b", "u1:c", "u2:a", "u10:a"])
    assert _store_with(index).delete_owner("u1", namespace="items") == 3
    assert index.deletes == [
        {"ids": ["u1:a", "u1:b"], "namespace": "items"},
        {"ids": ["u1:c"], "namespace": "items"},
    ]


def test_pinecone_pod_owner_delete_uses_the_metadata_filter():
    index = _PodIndex()
    assert _store_with(index).delete_owner("u1", namespace="items") is None
    assert index.deletes == [{"filter": {"user_id": "u1"}, "namespace": "items"}]


def test_owner_delete_fails_when_the_index_supports_neither_method():
    class _Broken(_PodIndex):
        def delete(self, **kwargs):
            raise RuntimeError("unavailable")

    with pytest.raises(RuntimeError):
        _store_with(_Broken()).delete_owner("u1")


def test_owner_delete_rejects_an_empty_owner():
    from services.embedding_engine.app.store import EmbeddingStore

    with pytest.raises(ValueError):
        EmbeddingStore().delete_owner("  ")
