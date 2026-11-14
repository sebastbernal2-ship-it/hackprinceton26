"""Write JSON Schemas to contracts/. Run from services/api: python export_schemas.py"""
import json
from pathlib import Path

from app.models import FactorCard, Match

OUT = Path(__file__).resolve().parents[2] / "contracts"


def schemas() -> dict[str, dict]:
    return {"factor-card.schema.json": FactorCard.model_json_schema(), "match.schema.json": Match.model_json_schema()}


if __name__ == "__main__":
    for name, s in schemas().items():
        (OUT / name).write_text(json.dumps(s, indent=2, sort_keys=True) + "\n")
