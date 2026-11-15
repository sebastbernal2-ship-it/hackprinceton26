"""Tool environment. LiveEnv calls our typed API logic in-process; tests use ScriptedEnv. Results are plain dicts."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT, ROOT / "services" / "api"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

LAYERS = ("triage", "review_queue", "aerial", "lineage", "presence")

# name -> (description, json-schema properties, required)
SPECS = {
    "shortlist": ("Run the constraint filter on the owner's goal text and return the shortlist: ids, status PASS/UNKNOWN, "
                  "missing facts, counts of PASS/FAIL/UNKNOWN. Optional 'overrides' (cities, budget, minSeats, minAreaSqft, ...).",
                  {"goal": {"type": "string"}, "overrides": {"type": "object"}}, ["goal"]),
    "property_facts": ("Property facts and factor cards (observed/derived/estimated/unknown) for one listing.",
                       {"listingId": {"type": "integer"}}, ["listingId"]),
    "inspection_findings": ("DefectFinding list from the panorama inspection for one listing (mode live/fixture/none).",
                            {"listingId": {"type": "integer"}}, ["listingId"]),
    "costs": ("Repair/maintenance/utility/equipment cost lines for one listing; unknown lines are excluded from totals, not zero.",
              {"listingId": {"type": "integer"}, "repairs": {"type": "object"}}, ["listingId"]),
    "assess": ("Scenario analysis (not a forecast): P(over budget), build-out and total p5/p50/p95 for one listing.",
               {"listingId": {"type": "integer"}, "budget": {"type": "number"}, "monthlyRent": {"type": "number"},
                "rentFreeMonths": {"type": "number"}, "delayCostPerMonth": {"type": "number"},
                "plannedOpenMonths": {"type": "number"}, "leaseStartDelayMonths": {"type": "number"},
                "goal": {"type": "string", "description": "owner goal text; its budget is used when budget is not given"}},
               ["listingId"]),
    "constraint_filter": ("Per-constraint PASS/FAIL/UNKNOWN verdicts with reasons for ONE listing under the goal's profile.",
                          {"goal": {"type": "string"}, "listingId": {"type": "integer"}}, ["goal", "listingId"]),
    "asset_catalog": ("Equipment/furniture asset catalog (ids, categories, dimension status); optional category filter.",
                      {"category": {"type": "string"}}, []),
    "derived_layer": (f"Read a derived evidence layer for a listing: one of {list(LAYERS)}. Returns status 'unavailable' "
                      "when the layer has not been produced; unavailable is unknown, never zero.",
                      {"layer": {"type": "string", "enum": list(LAYERS)}, "listingId": {"type": "integer"}}, ["layer"]),
}
INSPECTOR_TOOLS = ["property_facts", "inspection_findings", "costs", "assess", "constraint_filter", "derived_layer"]
PLANNER_TOOLS = ["shortlist", "asset_catalog", "derived_layer"]


def tool_defs(names) -> list[dict]:
    return [{"name": n, "description": SPECS[n][0],
             "input_schema": {"type": "object", "properties": SPECS[n][1], "required": SPECS[n][2]}} for n in names]


class LiveEnv:
    """In-process calls into the same logic the HTTP routes use. Read-only."""

    def __init__(self, pool=None):
        from app import loader
        self._pool = pool if pool is not None else loader.load_matches()

    @property
    def pool(self):
        if self._pool is None:
            raise RuntimeError("CoStar data unavailable (set COSTAR_NORMALIZED_DIR)")
        return self._pool

    def _match(self, lid):
        m = next((m for m in self.pool if m.listingId == lid), None)
        if m is None:
            raise ValueError(f"listing {lid} not found")
        return m

    def _profile(self, goal, overrides=None):
        from app import pipeline
        from app.models import Exchange
        prof, why = pipeline.profile_from_brief([Exchange(question="goal", answer=goal)], self.pool)
        if overrides:
            import dataclasses
            keys = {pipeline.PROFILE_KEYS[k]: (tuple(v) if k == "cities" and v else v)
                    for k, v in overrides.items() if k in pipeline.PROFILE_KEYS}
            prof = dataclasses.replace(prof, **keys)
        return prof, why

    def call(self, name: str, a: dict) -> dict:
        return getattr(self, f"t_{name}")(**a)

    def t_shortlist(self, goal, overrides=None):
        from app import pipeline
        prof, why = self._profile(goal, overrides)
        shown, counts, excluded, not_shown = pipeline.shortlist(self.pool, prof)
        return {"profile": pipeline.to_parsed(prof, why).model_dump(), "counts": counts, "excluded": excluded,
                "notShown": not_shown,
                "matches": [{"listingId": m.listingId, "address": m.address, "city": m.city, "squareFeet": m.squareFeet,
                             "constraintStatus": m.constraintStatus, "missingFields": m.missingFields,
                             "evidenceReadiness": m.evidenceReadiness} for m in shown],
                "note": "PASS before UNKNOWN by evidence readiness; FAIL excluded; not a fit score."}

    def t_property_facts(self, listingId):
        m = self._match(listingId)
        return {"listingId": m.listingId, "address": m.address, "city": m.city, "squareFeet": m.squareFeet,
                "evidenceReadiness": m.evidenceReadiness, "hasScanModel": bool(m.tourId),
                "facts": m.facts.model_dump(),
                "factorCards": [{k: v for k, v in c.model_dump().items() if k in
                                 ("factorId", "status", "value", "unit", "source", "asOf", "limitations")} for c in m.factors]}

    def t_inspection_findings(self, listingId):
        from app.inspection_routes import inspection
        r = inspection(listingId)
        return {"listingId": listingId, "mode": r["mode"], "notice": r["notice"], "findings": r["findings"][:12]}

    def t_costs(self, listingId, repairs=None):
        from planning import financials
        m = self._match(listingId)
        state = m.city.split(",")[1].strip() if "," in m.city else None
        lines = financials.all_lines(m.city.split(",")[0], state, {k: float(v) for k, v in (repairs or {}).items()})
        t = financials.totals(lines)
        return {"listingId": listingId, "totals": t["totals"], "totalsStatus": t["totalsStatus"],
                "excludedLineIds": t["excludedLineIds"], "statusCounts": financials.counts(lines),
                "notice": "Scenario analysis, not a quote. unknown lines are excluded from totals and are not zero."}

    def t_assess(self, listingId, goal=None, **kw):
        from app import pipeline
        from app.models import AssessRequest, Exchange
        brief = [Exchange(question="goal", answer=goal)] if goal else []
        r = pipeline.assess_response(AssessRequest(listingId=listingId, brief=brief, **kw), True, self.pool)
        return {"listingId": listingId, "label": r.label, "analysisBasis": r.analysisBasis, "budget": r.budget,
                "pOverBudgetBuildout": r.pOverBudgetBuildout, "pOverBudget": r.pOverBudget, "buildout": r.buildout,
                "total": r.total, "unknownInputs": r.unknownInputs, "note": r.note}

    def t_constraint_filter(self, goal, listingId):
        from app import pipeline
        from integration.constraint_filter import filter as cf
        from planning import assessment
        prof, _ = self._profile(goal)
        m = self._match(listingId)
        res = cf.evaluate(prof, pipeline.site_facts(m, assessment.buildout_bounds() if prof.budget is not None else None))
        return {"listingId": listingId, "status": res.status,
                "verdicts": [v.model_dump() for v in pipeline._verdicts(res)]}

    def t_replan(self, goal, profileChange, listingId=None):
        from app import pipeline
        from app.models import Exchange, ReplanRequest
        r = pipeline.replan(ReplanRequest(brief=[Exchange(question="goal", answer=goal)], profileChange=profileChange,
                                          listingId=listingId), self.pool)
        return {"change": r["change"], "changed": r["changed"], "countsBefore": r["countsBefore"],
                "countsAfter": r["countsAfter"], "pOverBudget": r["pOverBudget"], "note": r["note"]}

    def t_asset_catalog(self, category=None):
        from assets.store import Store
        rows = Store().list(None, category)
        return {"count": len(rows), "assets": [{"assetId": a.assetId, "name": a.name, "category": a.category,
                                                "dimsStatus": a.dimsStatus} for a in rows[:40]]}

    def t_derived_layer(self, layer, listingId=None):
        if layer not in LAYERS:
            raise ValueError(f"unknown layer {layer!r}")
        base = Path(os.environ.get("DERIVED_DIR", "data/derived")) / layer
        for f in ([base / f"{listingId}.json"] if listingId is not None else []) + [base / "all.json"]:
            if f.is_file() and f.stat().st_size < 1_000_000:
                d = json.loads(f.read_text())
                if listingId is not None and isinstance(d, dict) and str(listingId) in d:
                    d = d[str(listingId)]
                return {"layer": layer, "status": "available", "data": d}
        return {"layer": layer, "status": "unavailable", "listingId": listingId,
                "note": "layer not produced for this listing; value unknown (not zero)"}
