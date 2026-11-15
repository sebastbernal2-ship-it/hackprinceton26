"""GET /api/demo/{model_id}/factors: evidence cards for a demo scan (the "cafes" shortcut), built by
data/build_demo_factor_cards.py into data/derived/demo/factor-cards.csv (local, gitignored). Same card format and
honesty rules as the candidate cards: unknown stays unknown, never zero. An empty list means the cards were not built."""
import csv
import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from . import demo_fixture
from .loader import _card
from .models import FactorCard

router = APIRouter()


def _path() -> Path:
    return Path(os.environ.get("DEMO_FACTOR_CARDS", "data/derived/demo/factor-cards.csv"))


def csv_cards(model_id: str) -> list[FactorCard]:
    p = _path()
    if not p.is_file():
        return []
    with p.open(newline="", encoding="utf-8") as fh:
        return [_card(r) for r in csv.DictReader(fh) if r.get("property_id") == model_id]


@router.get("/api/demo/{model_id}/factors", response_model=list[FactorCard])
def demo_factors(model_id: str):
    if not re.fullmatch(r"[A-Za-z0-9]{11}", model_id):
        raise HTTPException(status_code=400, detail="unknown model")
    cards = csv_cards(model_id)
    fx = demo_fixture.get(tour=model_id)
    return demo_fixture.demo_factor_cards(fx, cards) if fx else cards


@router.get("/api/demo-site/{listing_id}")
def demo_site(listing_id: int):
    """The whole hand-authored fixture for a demo site (labelled DEMO DATA), for consumers that want one authoritative document."""
    fx = demo_fixture.get(listing_id)
    if fx is None:
        raise HTTPException(status_code=404, detail="no demo fixture for this listing")
    return fx
