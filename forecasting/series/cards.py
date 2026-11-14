"""Validate cards against the authoritative pydantic ProjectionCard and finalise hidden reasons."""
from __future__ import annotations

import sys
from pathlib import Path

_API = Path(__file__).resolve().parents[2] / "services" / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from app.models import ProjectionCard  # noqa: E402


def finalize(card: dict, reason: str | None = None) -> dict:
    """Return a validated card dict. A failed-validation card is hidden; keep the specific reason."""
    obj = ProjectionCard.model_validate(card)
    if obj.hidden and reason:
        obj.hiddenReason = reason
    return obj.model_dump(mode="json")
