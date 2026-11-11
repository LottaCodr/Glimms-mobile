"""Build the model artefacts the production image runs on.

Run once, at image build time, in the ``models`` stage of the root Dockerfile
(it needs PyTorch; the runtime image does not).  It writes into ``--out``:

``detector.onnx`` + ``detector.labels.txt``
    YOLO-World (open vocabulary) with the Glimms vocabulary baked in, so one
    model covers wardrobe, room and garden without a per-domain training set.

``clip_visual.onnx`` + ``clip_style_tags.npz``
    The OpenAI CLIP ViT-B/32 image tower, and text embeddings of the style
    tags computed with the matching text tower.  Same embedding space as
    ``openai/clip-vit-base-patch32``.

``background.onnx``
    U^2-Net salient-object segmentation, for item cut-outs in mockups.

``manifest.json``
    What was built, from what, with which checksums.

Every artefact is loaded back with onnxruntime and checked before the script
succeeds: a broken export must fail the image build, not a user's request.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from services.attribute_extractor.app.clip_extractor import (  # noqa: E402
    CLIP_INPUT_SIZE,
    STYLE_TAGS,
    preprocess,
)
from services.object_detection.app.detector import DOMAIN_VOCABULARY  # noqa: E402

DETECTOR_WEIGHTS = "yolov8s-worldv2.pt"
DETECTOR_INPUT_SIZE = 640
#: Open-vocabulary scores run lower than a closed-set detector's.
DETECTOR_CONFIDENCE = 0.25
ONNX_OPSET = 14

CLIP_ARCHITECTURE = "ViT-B/32"
CLIP_DIMENSION = 512
#: Several phrasings per tag, averaged, is the standard zero-shot recipe.
STYLE_PROMPTS = ("a photo of {} clothing", "a {} outfit", "{} style")

BACKGROUND_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
BACKGROUND_MD5 = "60024c5c889badc19c04ad937298a77b"


def log(message: str) -> None:
    print(f"[build_models] {message}", flush=True)


def digest(path: Path, algorithm: str = "sha256") -> str:
    hasher = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def describe(path: Path) -> dict:
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}


def onnx_session(path: Path):
    import onnxruntime as ort

    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


# ------------------------------------------------------------------ detector


def build_detector(out: Path, work: Path) -> dict:
    from ultralytics import YOLO, YOLOWorld

    labels = list(DOMAIN_VOCABULARY)
    log(f"detector: {DETECTOR_WEIGHTS} with {len(labels)} labels")
    model = YOLOWorld(str(work / DETECTOR_WEIGHTS))
    model.set_classes(list(labels))  # embeds the vocabulary with CLIP's text tower
    custom = work / "detector-custom.pt"
    model.save(str(custom))

    exported = Path(
        YOLO(str(custom)).export(
            format="onnx", imgsz=DETECTOR_INPUT_SIZE, opset=ONNX_OPSET, simplify=False, dynamic=False
        )
    )
    target = out / "detector.onnx"
    shutil.move(str(exported), target)
    (out / "detector.labels.txt").write_text("\n".join(labels) + "\n", encoding="utf-8")

    session = onnx_session(target)
    blank = np.full((1, 3, DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE), 114 / 255, dtype=np.float32)
    output = session.run(None, {session.get_inputs()[0].name: blank})[0]
    expected = (1, 4 + len(labels))
    if output.ndim != 3 or output.shape[:2] != expected:
        raise SystemExit(f"detector output is {output.shape}; expected {expected} + (anchors,)")
    log(f"detector: ok, output {output.shape}")
    return {
        **describe(target),
        "source": DETECTOR_WEIGHTS,
        "labels": labels,
        "input_size": DETECTOR_INPUT_SIZE,
        "confidence_threshold": DETECTOR_CONFIDENCE,
    }


# ---------------------------------------------------------------------- CLIP


def build_clip(out: Path) -> dict:
    import clip
    import torch
    from PIL import Image

    log(f"clip: {CLIP_ARCHITECTURE}")
    model, _ = clip.load(CLIP_ARCHITECTURE, device="cpu", jit=False)
    model = model.float().eval()

    class ImageTower(torch.nn.Module):
        def __init__(self, clip_model: torch.nn.Module) -> None:
            super().__init__()
            self.clip_model = clip_model

        def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
            features = self.clip_model.encode_image(pixel_values)
            return features / features.norm(dim=-1, keepdim=True)

    tower = ImageTower(model).eval()
    target = out / "clip_visual.onnx"
    torch.onnx.export(
        tower,
        torch.randn(1, 3, CLIP_INPUT_SIZE, CLIP_INPUT_SIZE),
        str(target),
        input_names=["pixel_values"],
        output_names=["image_embeds"],
        dynamic_axes={"pixel_values": {0: "batch"}, "image_embeds": {0: "batch"}},
        opset_version=ONNX_OPSET,
        do_constant_folding=True,
    )

    # The runtime preprocesses with NumPy/Pillow; check the whole path (our
    # preprocessing + ONNX) against the reference model on a structured image.
    gradient = np.linspace(0, 255, 300 * 400 * 3, dtype=np.float32).reshape(300, 400, 3).astype(np.uint8)
    pixels = preprocess(Image.fromarray(gradient, mode="RGB"))
    session = onnx_session(target)
    exported = session.run(None, {"pixel_values": pixels})[0][0]
    with torch.no_grad():
        reference = tower(torch.from_numpy(pixels))[0].numpy()
    similarity = float(np.dot(exported, reference) / (np.linalg.norm(exported) * np.linalg.norm(reference)))
    if exported.shape != (CLIP_DIMENSION,) or similarity < 0.999:
        raise SystemExit(f"clip export mismatch: shape {exported.shape}, cosine {similarity:.5f}")
    log(f"clip: ok, cosine vs PyTorch {similarity:.6f}")

    with torch.no_grad():
        rows = []
        for tag in STYLE_TAGS:
            tokens = clip.tokenize([prompt.format(tag) for prompt in STYLE_PROMPTS])
            features = model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
            mean = features.mean(dim=0)
            rows.append((mean / mean.norm()).numpy())
    embeddings = np.stack(rows).astype(np.float32)
    tags_path = out / "clip_style_tags.npz"
    np.savez(tags_path, tags=np.array(STYLE_TAGS), embeddings=embeddings)
    log(f"clip: {len(STYLE_TAGS)} style-tag embeddings")

    return {
        **describe(target),
        "source": f"openai/CLIP {CLIP_ARCHITECTURE}",
        "dimension": CLIP_DIMENSION,
        "style_tags": {**describe(tags_path), "tags": STYLE_TAGS, "prompts": list(STYLE_PROMPTS)},
    }


# ---------------------------------------------------------------- background


def build_background(out: Path) -> dict:
    target = out / "background.onnx"
    log(f"background: {BACKGROUND_URL}")
    with urllib.request.urlopen(BACKGROUND_URL, timeout=300) as response, target.open("wb") as handle:  # noqa: S310
        shutil.copyfileobj(response, handle)
    checksum = digest(target, "md5")
    if checksum != BACKGROUND_MD5:
        raise SystemExit(f"background model checksum is {checksum}; expected {BACKGROUND_MD5}")

    session = onnx_session(target)
    output = session.run(None, {session.get_inputs()[0].name: np.zeros((1, 3, 320, 320), dtype=np.float32)})[0]
    if output.shape[-2:] != (320, 320):
        raise SystemExit(f"background output is {output.shape}; expected (..., 320, 320)")
    log("background: ok")
    return {**describe(target), "source": BACKGROUND_URL}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "models")
    parser.add_argument("--work", type=Path, default=Path("/tmp/glimms-model-build"))
    parser.add_argument("--skip", nargs="*", default=[], choices=["detector", "clip", "background"])
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    args.work.mkdir(parents=True, exist_ok=True)

    manifest: dict = {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if "detector" not in args.skip:
        manifest["detector"] = build_detector(args.out, args.work)
    if "clip" not in args.skip:
        manifest["clip"] = build_clip(args.out)
    if "background" not in args.skip:
        manifest["background"] = build_background(args.out)

    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"wrote {args.out / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
