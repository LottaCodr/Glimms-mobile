"""Locating model artefacts.

The production image bakes its models into ``MODELS_DIR`` (see
``scripts/build_models.py``).  Development machines usually have none, and the
services then use their documented fallbacks.  Paths can always be overridden
per model through that model's own environment variable.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent


def models_dir() -> Path:
    configured = os.getenv("MODELS_DIR", "").strip()
    return Path(configured) if configured else REPO_ROOT / "models"


def resolve_model(env_name: str, default_filename: str) -> Path | None:
    """Return the path of a model file if it exists.

    ``env_name`` set to an empty string disables the model explicitly.
    """

    configured = os.getenv(env_name)
    if configured is not None:
        configured = configured.strip()
        if not configured:
            return None
        path = Path(configured)
        if not path.is_absolute() and not path.exists():
            path = REPO_ROOT / configured
        return path if path.is_file() else None
    path = models_dir() / default_filename
    return path if path.is_file() else None


def manifest() -> dict[str, Any]:
    """Build metadata written next to the models (empty when absent)."""

    path = models_dir() / "manifest.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}
