"""SYNTHETIC scripted tool environment for tests and the committed demo replay. Not CoStar/Matterport/Vexcel data."""
import copy

SYNTH = "SYNTHETIC FIXTURE: invented values for tests/demo, not real property data"


class ScriptedEnv:
    def __init__(self, overrides: dict | None = None):
        self.calls: list = []
        self.data = {
            "shortlist": {"profile": {"budget": 250000.0, "cities": ["Houston"], "minSeats": 40},
                          "counts": {"PASS": 1, "FAIL": 3, "UNKNOWN": 2}, "excluded": 3, "notShown": 0,
                          "matches": [{"listingId": 9001, "address": "SYNTH-1", "city": "Houston, TX", "squareFeet": 2400,
                                       "constraintStatus": "PASS", "missingFields": [], "evidenceReadiness": 4},
                                      {"listingId": 9002, "address": "SYNTH-2", "city": "Houston, TX", "squareFeet": 3100,
                                       "constraintStatus": "UNKNOWN", "missingFields": ["seat_capacity"], "evidenceReadiness": 2}],
                          "note": SYNTH},
            "property_facts": {"factorCards": [{"factorId": "seat_capacity", "status": "unknown", "value": ""}], "note": SYNTH},
            "inspection_findings": {"mode": "fixture", "notice": SYNTH, "findings": [
                {"title": "Water stain on ceiling", "category": "ceiling_water_damage", "severity": "medium", "grounding": "observed"}]},
            "costs": {"totals": {"low": 60000, "expected": 90000, "high": 140000}, "excludedLineIds": ["repair.roof"], "note": SYNTH},
            "assess": {"pOverBudget": 0.18, "pOverBudgetBuildout": 0.12, "unknownInputs": {}, "note": SYNTH},
            "replan": {"change": {"budget": 300000}, "countsBefore": {"PASS": 1, "FAIL": 3, "UNKNOWN": 2},
                       "countsAfter": {"PASS": 2, "FAIL": 2, "UNKNOWN": 2}, "changed": [], "pOverBudget": {}, "note": SYNTH},
            "asset_catalog": {"count": 2, "assets": [{"assetId": "synth-range", "category": "kitchen", "dimsStatus": "estimated"}]},
        }
        self.data.update(overrides or {})

    def call(self, name, args):
        self.calls.append((name, dict(args)))
        if name not in self.data:
            raise ValueError(f"no scripted result for {name}")
        d = copy.deepcopy(self.data[name])
        if isinstance(d, dict) and name in ("property_facts", "inspection_findings", "costs", "assess"):
            d["listingId"] = args.get("listingId")
        return d
