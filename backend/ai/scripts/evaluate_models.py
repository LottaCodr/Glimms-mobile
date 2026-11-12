"""Run the vision models over a folder of real photos and write a report.

Use this to see what the detector and CLIP actually do on Glimms photos
before launch, and to choose the two thresholds that depend on real data:

* ``CONFIDENCE_THRESHOLD`` (AI service) - how sure the detector must be.
* ``DUPLICATE_SIMILARITY`` (API) - how alike two items must look to be
  flagged as the same item.

Usage, from ``backend/ai`` with the models in ``./models`` (see the README,
"Models")::

    python scripts/evaluate_models.py path/to/photos --vertical wardrobe

It writes ``evaluation/report.html`` (open it in a browser), ``report.json``
and one annotated copy of every photo.  Photographing the same item twice
(different angle or light) is the useful test for the duplicate threshold:
the report lists the most similar pairs so you can see where real duplicates
and merely similar items separate.

Nothing is uploaded; everything runs locally through the same classes the
services use.
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
BOX_COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080", "#9a6324", "#800000"]


def find_photos(folder: Path) -> list[Path]:
    return sorted(path for path in folder.rglob("*") if path.is_file() and path.suffix.lower() in PHOTO_SUFFIXES)


def top_pairs(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """The most similar item pairs by cosine similarity, highest first."""

    if len(items) < 2:
        return []
    matrix = np.asarray([item["embedding"] for item in items], dtype=np.float32)
    matrix /= np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
    scores = matrix @ matrix.T
    first, second = np.triu_indices(len(items), k=1)
    order = np.argsort(-scores[first, second])[:limit]
    return [
        {"a": int(first[index]), "b": int(second[index]), "similarity": round(float(scores[first[index], second[index]]), 4)}
        for index in order
    ]


def evaluate(photos: list[Path], vertical: str, out: Path, pair_limit: int = 30) -> dict[str, Any]:
    from services.attribute_extractor.app.clip_extractor import CLIPExtractor
    from services.attribute_extractor.app.color_extractor import ColorExtractor
    from services.object_detection.app.detector import Detector
    from services.quality_guard.app.analyzer import QualityAnalyzer
    from shared.images import crop_to_bbox, open_oriented, to_png_bytes

    detector, clip, colours, quality = Detector(), CLIPExtractor(), ColorExtractor(), QualityAnalyzer()
    real_detector, real_clip = detector.model is not None, clip.ready()

    (out / "annotated").mkdir(parents=True, exist_ok=True)
    (out / "crops").mkdir(parents=True, exist_ok=True)

    photo_reports: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    for number, path in enumerate(photos):
        report: dict[str, Any] = {"file": path.name, "items": []}
        photo_reports.append(report)
        try:
            data = path.read_bytes()
            report["quality"] = quality.analyze(data)
            detections = detector.detect(data, vertical, path.name)
            image = open_oriented(data).convert("RGB")
        except Exception as exc:  # noqa: BLE001 - one unreadable photo must not end the run
            report["error"] = f"{type(exc).__name__}: {exc}"
            continue

        draw = ImageDraw.Draw(image)
        line = max(2, round(max(image.size) / 300))
        for position, detection in enumerate(detections):
            box = detection["bbox"]
            colour = BOX_COLOURS[position % len(BOX_COLOURS)]
            draw.rectangle(
                [box["x"], box["y"], box["x"] + box["width"], box["y"] + box["height"]], outline=colour, width=line
            )
            draw.text((box["x"] + line + 2, box["y"] + line + 2), f"{position + 1}", fill=colour)

            crop = crop_to_bbox(open_oriented(data), box, margin=0.04).convert("RGB")
            crop_bytes = to_png_bytes(crop)
            embedding = clip.embed(crop_bytes)
            crop.thumbnail((240, 240))
            crop_name = f"{number:03d}_{position + 1:02d}.jpg"
            crop.save(out / "crops" / crop_name, quality=85)

            try:
                dominant = colours.extract(crop_bytes).get("dominant", {}).get("hex")
            except Exception:  # noqa: BLE001
                dominant = None
            entry = {
                "index": len(items),
                "photo": path.name,
                "number": position + 1,
                "label": detection["label"],
                "category": detection["category"],
                "confidence": round(float(detection["confidence"]), 3),
                "bbox": box,
                "style_tags": clip.get_style_tags(embedding),
                "dominant_colour": dominant,
                "crop": f"crops/{crop_name}",
            }
            report["items"].append(entry)
            items.append({**entry, "embedding": embedding})

        image.thumbnail((1280, 1280))
        annotated = f"annotated/{number:03d}_{path.stem}.jpg"
        image.save(out / annotated, quality=85)
        report["annotated"] = annotated

    confidences = sorted(item["confidence"] for item in items)
    summary = {
        "vertical": vertical,
        "photos": len(photos),
        "photos_failed": sum(1 for report in photo_reports if "error" in report),
        "photos_with_no_items": sum(1 for report in photo_reports if "error" not in report and not report["items"]),
        "photos_with_quality_issues": sum(1 for report in photo_reports if report.get("quality", {}).get("issues")),
        "items": len(items),
        "detector": detector.describe(),
        "clip": clip.describe(),
        "real_models": {"detector": real_detector, "clip": real_clip},
        "confidence": {
            "min": confidences[0] if confidences else None,
            "median": confidences[len(confidences) // 2] if confidences else None,
            "max": confidences[-1] if confidences else None,
        },
    }
    # Offline placeholder vectors carry no meaning; comparing them would mislead.
    pairs = top_pairs(items, pair_limit) if real_clip else []
    for pair in pairs:
        pair["a_item"] = {key: items[pair["a"]][key] for key in ("photo", "number", "label", "crop")}
        pair["b_item"] = {key: items[pair["b"]][key] for key in ("photo", "number", "label", "crop")}

    result = {"summary": summary, "photos": photo_reports, "most_similar_pairs": pairs}
    (out / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (out / "report.html").write_text(render_html(result), encoding="utf-8")
    return result


def render_html(result: dict[str, Any]) -> str:
    summary = result["summary"]
    esc = html.escape
    parts = [
        "<!doctype html><meta charset='utf-8'><title>Glimms model evaluation</title>",
        "<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:1100px}"
        "img{max-width:100%;border-radius:6px}table{border-collapse:collapse}"
        "td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}"
        ".warn{background:#fff3cd;border:1px solid #e0c060;padding:10px;border-radius:6px}"
        ".crop{width:120px}.pair img{width:140px;margin-right:8px}section{margin:32px 0}</style>",
        "<h1>Glimms model evaluation</h1>",
    ]
    if not all(summary["real_models"].values()):
        missing = ", ".join(name for name, real in summary["real_models"].items() if not real)
        parts.append(
            f"<p class='warn'><b>Placeholder output.</b> No real model was loaded for: {esc(missing)}. "
            "The results below for it are development fallbacks and say nothing about accuracy. "
            "Build the models first (README, “Models”).</p>"
        )
    parts.append(
        f"<p>{summary['photos']} photos ({esc(summary['vertical'])}), {summary['items']} items detected. "
        f"{summary['photos_with_no_items']} photos with no items, "
        f"{summary['photos_with_quality_issues']} with quality issues, {summary['photos_failed']} unreadable. "
        f"Detector threshold {summary['detector']['confidence_threshold']}; "
        f"confidence min / median / max: {summary['confidence']['min']} / {summary['confidence']['median']} / "
        f"{summary['confidence']['max']}.</p>"
    )

    pairs = result["most_similar_pairs"]
    if pairs:
        parts.append(
            "<section><h2>Most similar item pairs</h2><p>Set <code>DUPLICATE_SIMILARITY</code> just below the "
            "lowest score of a pair that really is the same item, and above pairs that are only alike.</p>"
        )
        for pair in pairs:
            a, b = pair["a_item"], pair["b_item"]
            parts.append(
                f"<p class='pair'><img src='{esc(a['crop'])}'><img src='{esc(b['crop'])}'><br>"
                f"<b>{pair['similarity']}</b> — {esc(a['label'])} ({esc(a['photo'])} #{a['number']}) vs "
                f"{esc(b['label'])} ({esc(b['photo'])} #{b['number']})</p>"
            )
        parts.append("</section>")

    for photo in result["photos"]:
        parts.append(f"<section><h2>{esc(photo['file'])}</h2>")
        if "error" in photo:
            parts.append(f"<p class='warn'>Could not be processed: {esc(photo['error'])}</p></section>")
            continue
        issues = photo["quality"].get("issues") or []
        parts.append(f"<p>Quality issues: {esc(', '.join(issues)) if issues else 'none'}</p>")
        parts.append(f"<img src='{esc(photo['annotated'])}'>")
        if photo["items"]:
            parts.append("<table><tr><th>#</th><th>Crop</th><th>Label</th><th>Confidence</th><th>Style tags</th><th>Colour</th></tr>")
            for item in photo["items"]:
                colour = item["dominant_colour"] or ""
                parts.append(
                    f"<tr><td>{item['number']}</td><td><img class='crop' src='{esc(item['crop'])}'></td>"
                    f"<td>{esc(item['label'])}<br><small>{esc(item['category'])}</small></td>"
                    f"<td>{item['confidence']}</td><td>{esc(', '.join(item['style_tags']))}</td>"
                    f"<td><span style='display:inline-block;width:14px;height:14px;background:{esc(colour)}'></span> {esc(colour)}</td></tr>"
                )
            parts.append("</table>")
        else:
            parts.append("<p><b>No items detected.</b></p>")
        parts.append("</section>")
    return "\n".join(parts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("photos", type=Path, help="folder of photos (jpg, png, webp); searched recursively")
    parser.add_argument("--vertical", default="wardrobe", choices=["wardrobe", "room", "garden"])
    parser.add_argument("--out", type=Path, default=Path("evaluation"))
    parser.add_argument("--pairs", type=int, default=30, help="how many most-similar pairs to list")
    args = parser.parse_args(argv)

    photos = find_photos(args.photos)
    if not photos:
        print(f"No photos found in {args.photos}", file=sys.stderr)
        return 2
    summary = evaluate(photos, args.vertical, args.out, args.pairs)["summary"]
    print(json.dumps(summary, indent=2))
    if not all(summary["real_models"].values()):
        print("\nWARNING: a real model was not loaded; this output is placeholder data.", file=sys.stderr)
    print(f"\nReport: {args.out / 'report.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
