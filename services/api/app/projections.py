"""Projection stubs. No models exist yet: answers are honestly empty/unknown."""
import os

from .models import ProjectionCard, ProjectionsResponse


def models_available() -> bool:
    """Flag only. Set MODELS_AVAILABLE=1 once validated models are wired in."""
    return os.environ.get("MODELS_AVAILABLE", "").lower() in {"1", "true", "yes"}


def visible(cards: list[ProjectionCard]) -> list[ProjectionCard]:
    return [c for c in cards if not c.hidden]


def projections_for(listing_id: int) -> ProjectionsResponse:
    avail = models_available()
    note = ("No projection producers are implemented yet; unknown, not zero."
            if avail else "Models are not available; unknown, not zero.")
    return ProjectionsResponse(listingId=listing_id, modelsAvailable=avail, projections=[], note=note)
