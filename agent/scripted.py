"""Deterministic policy providers, clearly labelled SCRIPTED: no LLM. They plan from tool results with fixed rules so the
whole agent loop (parallel calls, subagents, actions, cited brief) runs and replays without any API key."""
import json
import re

from .providers import Turn

ORDER = {"strong": 0, "workable": 1, "risky": 2, "unknown": 3, "reject": 4}


def _results(messages) -> list[dict]:
    out = []
    for m in messages:
        if m["role"] == "user" and isinstance(m["content"], list):
            for b in m["content"]:
                if b.get("type") == "tool_result":
                    try:
                        d = json.loads(b["content"])
                    except (ValueError, TypeError):
                        continue
                    if isinstance(d, dict) and "resultId" in d:
                        out.append(d)
    return out


def _goal(messages) -> str:
    return re.sub(r"^GOAL: ", "", messages[0]["content"])


class ScriptedPlanner:
    name = "scripted"

    def step(self, system, messages, tools, max_tokens=0) -> Turn:
        rs = _results(messages)
        by = {}
        for r in rs:
            by.setdefault(r["tool"], []).append(r)
        goal, n = _goal(messages), [0]

        def call(name, **args):
            n[0] += 1
            return {"id": f"s{len(rs)}_{n[0]}", "name": name, "args": args}

        if "shortlist" not in by:
            return Turn("SCRIPTED plan: shortlist by constraints, inspect each in parallel, re-run with a changed "
                        "assumption, build a checklist, save a cited brief.",
                        [call("write_plan", items=["Shortlist candidates with the constraint filter",
                                                   "Inspect each candidate in parallel (facts, findings, costs, assess)",
                                                   "Re-run the plan with a changed assumption",
                                                   "Generate verification checklist and landlord questions",
                                                   "Save a cited decision brief"]),
                         call("shortlist", goal=goal), call("asset_catalog")])
        sl = by["shortlist"][0]["untrusted_data"]
        ids = [m["listingId"] for m in sl.get("matches", []) if isinstance(m, dict)][:3]
        if "inspect_sites" not in by:
            if not ids:
                return Turn("No site passed or remained unknown under these constraints; nothing to inspect.", [])
            return Turn("Inspecting the shortlist in parallel.", [call("inspect_sites", listingIds=ids)])
        verdicts = by["inspect_sites"][0]["untrusted_data"].get("verdicts", [])
        ranked = sorted(verdicts, key=lambda v: (ORDER.get(v.get("verdict"), 9), ids.index(v["listingId"]) if v.get("listingId") in ids else 9))
        best = next((v for v in ranked if v.get("verdict") != "reject"), None)
        if "rerun_plan" not in by and "make_checklist" not in by:
            calls = []
            budget = (sl.get("profile") or {}).get("budget")
            if budget:
                calls.append(call("rerun_plan", profileChange={"budget": round(budget * 1.2)}))
            if best:
                calls.append(call("make_checklist", listingId=best["listingId"]))
            if calls:
                return Turn("Acting: what-if budget +20% (scenario), and a verification checklist for the top candidate.", calls)
        claims = []
        for v in ranked:
            if v.get("verified"):
                claims.append({"text": f"Listing {v['listingId']} is {v['verdict']}: {v['headline']}", "cites": v["cites"]})
        rp = (by.get("rerun_plan") or [None])[0]
        if rp and "countsBefore" in rp["untrusted_data"]:
            d = rp["untrusted_data"]
            claims.append({"text": f"What-if (scenario analysis, not a forecast): PASS sites {d['countsBefore'].get('PASS')} "
                                   f"before and {d['countsAfter'].get('PASS')} after the budget change.", "cites": [rp["resultId"]]})
        cl = (by.get("make_checklist") or [None])[0]
        if cl:
            d = cl["untrusted_data"]
            claims.append({"text": f"Verification checklist and landlord questions generated for listing {d['listingId']} from its findings and unknowns.", "cites": [cl["resultId"]]})
        rec = (f"Verify listing {best['listingId']} first ({best['verdict']}); this is a screening ranking, not a fit score."
               if best else "No candidate is currently recommendable; see unknowns.")
        if "save_brief" not in by:
            return Turn("Saving the decision brief.", [call("save_brief", recommendation=rec, claims=claims)])
        return Turn("Done.", [])


class ScriptedInspector:
    name = "scripted"

    def step(self, system, messages, tools, max_tokens=0) -> Turn:
        rs = _results(messages)
        lid = int(re.search(r"listingId=(\d+)", messages[0]["content"]).group(1))
        if not rs:
            return Turn("", [{"id": f"i{lid}_{k}", "name": k, "args": {"listingId": lid}}
                             for k in ("property_facts", "inspection_findings", "costs", "assess")])
        by = {r["tool"]: r for r in rs}
        cites = [r["resultId"] for r in rs]
        a = by.get("assess", {}).get("untrusted_data", {})
        f = by.get("inspection_findings", {}).get("untrusted_data", {})
        c = by.get("costs", {}).get("untrusted_data", {})
        p = a.get("pOverBudget") if a.get("pOverBudget") is not None else a.get("pOverBudgetBuildout")
        risks, unknowns = [], []
        n_find = len(f.get("findings", [])) if isinstance(f.get("findings"), list) else 0
        hi = [x for x in f.get("findings", []) if x.get("severity") == "high"] if n_find else []
        if f.get("mode") in (None, "none"):
            unknowns.append("no inspection findings exist for this listing")
        if hi:
            risks.append("high-severity inspection finding(s) present; see inspection_findings")
        for k in (a.get("unknownInputs") or {}):
            unknowns.append(f"assess input unknown: {k}")
        if c.get("excludedLineIds"):
            unknowns.append("some cost lines have no figure and are excluded from totals (unknown, not zero)")
        if p is None:
            verdict, head = "unknown", "Budget or rent/delay inputs missing: P(over budget) is unknown, not zero."
        else:
            verdict = "risky" if p >= 0.5 or hi else ("strong" if p < 0.2 and not unknowns else "workable")
            head = f"Scenario analysis, not a forecast: P(over budget) {p:.2f}."
            if p >= 0.5:
                risks.append(f"P(over budget) {p:.2f} is at or above the 0.5 screening line")
        if n_find:
            head += " Inspection findings exist; see the checklist."
        return Turn("", [{"id": f"i{lid}_v", "name": "submit_verdict", "args": {
            "verdict": verdict, "headline": head, "topRisk": (risks or unknowns or ["none observed"])[0],
            "risks": risks, "unknowns": unknowns, "cites": cites}}])
