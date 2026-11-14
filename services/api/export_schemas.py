"""Write JSON Schemas to contracts/. Run from services/api: python export_schemas.py"""
import json
from pathlib import Path

from app.models import (
    AssessRequest, AssumptionInput, FactorCard, Match, MatchesResponse, ProjectionCard, ReplanRequest, ReplanResponse,
    ScenarioAssessment,
)

OUT = Path(__file__).resolve().parents[2] / "contracts"


def schemas() -> dict[str, dict]:
    return {
        "factor-card.schema.json": FactorCard.model_json_schema(),
        "match.schema.json": Match.model_json_schema(),
        "projection-card.schema.json": ProjectionCard.model_json_schema(),
        "assumption-input.schema.json": AssumptionInput.model_json_schema(),
        "scenario-assessment.schema.json": ScenarioAssessment.model_json_schema(),
        "matches-response.schema.json": MatchesResponse.model_json_schema(),
        "assess-request.schema.json": AssessRequest.model_json_schema(),
        "replan.schema.json": {"request": ReplanRequest.model_json_schema(), "response": ReplanResponse.model_json_schema()},
    }


if __name__ == "__main__":
    for name, s in schemas().items():
        (OUT / name).write_text(json.dumps(s, indent=2, sort_keys=True) + "\n")
