"""Reskin engine: swap a layout from one cuisine concept to another, with cost and feasibility deltas.

Everything here is scenario analysis built on LABELLED ASSUMPTIONS (assets/concepts/*.json). Nothing is a code
determination, a quote or an engineering assessment. Unknown stays unknown (never 0)."""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from assets.models import FIN_CATALOG, Asset  # noqa: E402
from assets.store import Store  # noqa: E402
from planning.price_catalog import band  # noqa: E402

CONCEPTS = Path(__file__).resolve().parents[1] / "concepts"
AS_OF = "2026-11-14"
NOTICE = ("Scenario analysis, not a forecast or a quote. Concept profiles, quantities, adjacency and load notes are "
          "labelled assumptions, not code determinations or engineering assessments: verify with an inspector and a "
          "licensed engineer. Unknown prices stay unknown and are excluded from totals (not zero). Removed-equipment "
          "resale/removal cost is unknown. The placement is a simple geometric packer, not an optimised plan.")


def list_concepts() -> list[str]:
    return sorted(p.stem for p in CONCEPTS.glob("*.json"))


def load_concept(cid: str) -> dict:
    if cid not in list_concepts():
        raise KeyError(cid)
    return json.loads((CONCEPTS / f"{cid}.json").read_text())


def palette_for(concept: dict) -> dict[str, str]:
    """Substring->hex palette usable by assets.glb.restyle_glb."""
    return {k: v["hex"] for k, v in concept["materials"].items()}


def required_qty(entry: dict, seats: int | None) -> int:
    q = entry["qty"]
    if "fixed" in q:
        return q["fixed"]
    mn = q.get("min", 1)
    return max(mn, math.ceil(seats / q["perSeats"])) if seats else mn


# ---- geometry (axis-aligned boxes; rot in 0/90/180/270) -------------------------------------------------------
def _box(a: Asset, x: float, y: float, rot: int = 0):
    w, d = (a.dims.d, a.dims.w) if rot % 180 else (a.dims.w, a.dims.d)
    return (x, y, x + w, y + d)


def _overlap(a, b) -> bool:
    return a[0] < b[2] - 1e-9 and b[0] < a[2] - 1e-9 and a[1] < b[3] - 1e-9 and b[1] < a[3] - 1e-9


def _gap(a, b) -> float:
    dx = max(b[0] - a[2], a[0] - b[2], 0.0)
    dy = max(b[1] - a[3], a[1] - b[3], 0.0)
    return math.hypot(dx, dy)


def _find_spot(a: Asset, boxes: list, room: dict | None):
    """First free axis-aligned position scanning y then x in 0.05 m steps; None if it does not fit the room."""
    w, d = a.dims.w, a.dims.d
    rw = room["w"] if room else max([b[2] for b in boxes] + [0.0]) + w + 0.5
    rd = room["d"] if room else max([b[3] for b in boxes] + [d])
    ny = int((rd - d) / 0.05 + 1e-9) + 1
    nx = int((rw - w) / 0.05 + 1e-9) + 1
    for j in range(max(ny, 0)):
        for i in range(max(nx, 0)):
            x, y = round(i * 0.05, 3), round(j * 0.05, 3)
            c = (x, y, x + w, y + d)
            if not any(_overlap(c, b) for b in boxes):
                return x, y
    return None


def _catalog() -> dict:
    return json.loads(FIN_CATALOG.read_text())


def _price_line(a: Asset, qty: int, cat: dict) -> dict:
    base = dict(itemId=f"reskin:add:{a.assetId}", label=f"Add: {a.name}", category="equipment", quantity=qty, unit="each",
                currency="USD", basis="one_time", asOf=AS_OF)
    eq = {e["id"]: e for e in cat["equipment"]}.get(a.priceRef or "")
    if eq is None:
        return {**base, "low": None, "expected": None, "high": None, "status": "unknown", "source": "none",
                "rationale": "No sourced price for this asset in data/financial/catalog.json; unknown, not zero."}
    if eq["priceStatus"] == "observed":
        lo = ex = hi = round(eq["listPrice"] * qty, 2)
        src, st = eq["vendorUrl"], "observed"
    else:
        lo, ex, hi = (round(v * qty, 2) for v in band(eq["listPrice"], "costBand", cat))
        src, st = "estimate://neutral-band-v1 (reference: " + eq["vendorUrl"] + ")", "estimated"
    return {**base, "low": lo, "expected": ex, "high": hi, "status": st, "source": src,
            "rationale": eq["priceNote"] + f" Catalog item {eq['id']} ({eq['manufacturer']} {eq['model']}); excludes freight/install."}


def _unknown(itemId, label, category, rationale):
    return dict(itemId=itemId, label=label, category=category, quantity=None, unit="lump_sum", low=None, expected=None,
                high=None, currency="USD", basis="one_time", status="unknown", source="none", asOf=AS_OF, rationale=rationale)


def _totals(lines: list[dict]) -> dict:
    known = [l for l in lines if l["status"] != "unknown"]
    t = {k: round(sum(l[k] for l in known), 2) if known else None for k in ("low", "expected", "high")}
    excl = [l["itemId"] for l in lines if l["status"] == "unknown"]
    return {"totals": t, "totalsStatus": "unknown" if not known else ("partial" if excl else "complete"), "excludedLineIds": excl}


def synthesize_layout(concept: dict, seats: int | None, room: dict | None, store: Store | None = None) -> dict:
    """Reference layout generated from a concept profile (NOT an observed layout): packs required equipment."""
    store = store or Store()
    placements, boxes = [], []
    for e in concept["equipment"]:
        a = store.get(e["assetId"])
        if a is None:
            continue
        for _ in range(required_qty(e, seats)):
            s = _find_spot(a, boxes, room)
            if s is None:
                continue
            boxes.append(_box(a, *s))
            placements.append({"assetId": a.assetId, "x": s[0], "y": s[1], "rot": 0})
    return {"seats": seats, "room": room, "placements": placements, "synthetic": True}


def reskin(layout: dict, from_concept: str, to_concept: str, store: Store | None = None) -> dict:
    store = store or Store()
    fc, tc = load_concept(from_concept), load_concept(to_concept)
    seats = layout.get("seats")
    room = layout.get("room")
    cat = _catalog()
    assets: dict[str, Asset | None] = {}

    def get(aid):
        if aid not in assets:
            assets[aid] = store.get(aid)
        return assets[aid]

    from_specific = {e["assetId"] for e in fc["equipment"] if e["specific"]}
    to_ids = {e["assetId"] for e in tc["equipment"]}
    unknown_ids = sorted({p["assetId"] for p in layout["placements"] if get(p["assetId"]) is None})
    kept, removed = [], []
    for p in layout["placements"]:
        (removed if p["assetId"] in from_specific and p["assetId"] not in to_ids and get(p["assetId"]) else kept).append(p)
    boxes = [_box(get(p["assetId"]), p["x"], p["y"], p.get("rot", 0)) for p in kept if get(p["assetId"])]
    free = [(p, _box(get(p["assetId"]), p["x"], p["y"], p.get("rot", 0))) for p in removed]  # slots vacated
    kept_count: dict[str, int] = {}
    for p in kept:
        kept_count[p["assetId"]] = kept_count.get(p["assetId"], 0) + 1

    added, unplaced, new_pl = [], [], []
    for e in tc["equipment"]:
        a = get(e["assetId"])
        if a is None:
            unplaced.append({"assetId": e["assetId"], "reason": "asset missing from catalog"})
            continue
        need = required_qty(e, seats) - kept_count.get(e["assetId"], 0)
        for _ in range(max(need, 0)):
            slot = next((f for f in free if a.dims.w <= (f[1][2] - f[1][0]) + 0.3 and a.dims.d <= (f[1][3] - f[1][1]) + 0.3), None)
            spot, how = None, ""
            if slot:
                free.remove(slot)
                x, y = slot[1][0], slot[1][1]
                cand = (x, y, x + a.dims.w, y + a.dims.d)
                if not any(_overlap(cand, b) for b in boxes) and (
                        room is None or (cand[2] <= room["w"] + 1e-9 and cand[3] <= room["d"] + 1e-9)):
                    spot, how = (x, y), "took the footprint vacated by removed equipment"
            if spot is None:
                s = _find_spot(a, boxes, room)
                spot, how = (s, "first free spot (geometric packer)") if s else (None, "")
            if spot is None:
                unplaced.append({"assetId": a.assetId, "reason": "no free spot inside the room (simple packer); verify manually"})
                continue
            boxes.append((spot[0], spot[1], spot[0] + a.dims.w, spot[1] + a.dims.d))
            pl = {"assetId": a.assetId, "x": spot[0], "y": spot[1], "rot": 0, "placement": how}
            new_pl.append(pl)
            added.append(pl)

    final_pl = [{**p} for p in kept] + new_pl
    qty_added: dict[str, int] = {}
    for p in added:
        qty_added[p["assetId"]] = qty_added.get(p["assetId"], 0) + 1

    # adjacency
    def boxes_of(aid):
        return [_box(get(p["assetId"]), p["x"], p["y"], p.get("rot", 0)) for p in final_pl if p["assetId"] == aid and get(aid)]
    adjacency = []
    for r in tc["adjacency"]:
        ba, bb = boxes_of(r["a"]), boxes_of(r["b"])
        if not ba or not bb:
            adjacency.append({**r, "result": "not_applicable", "gapM": None})
            continue
        g = round(min(_gap(x, y) for x in ba for y in bb), 3)
        adjacency.append({**r, "result": "satisfied" if g <= r["maxGapM"] else "violated", "gapM": g})

    # costs
    lines = [_price_line(get(aid), q, cat) for aid, q in qty_added.items()]
    priced = [l for l in lines if l["status"] != "unknown"]
    if priced:
        ref = sum({e["id"]: e for e in cat["equipment"]}[get(aid).priceRef]["listPrice"] * q
                  for aid, q in qty_added.items() if get(aid).priceRef)
        lo, ex, hi = (round(v, 2) for v in band(0.2 * ref, "costBand", cat))
        ia = cat["installAllowance"]
        lines.append(dict(itemId="reskin:install_allowance", label="Delivery/install allowance for priced added equipment (20%)",
                          category="buildout", quantity=1, unit="lump_sum", low=lo, expected=ex, high=hi, currency="USD",
                          basis="one_time", status="estimated", source="estimate://neutral-band-v1", asOf=AS_OF,
                          rationale=ia["rationale"] + " Applies only to the priced added items."))
    if added:
        lines.append(_unknown("reskin:mep", "Hood, gas, plumbing and electrical modifications for new equipment", "buildout",
                              "No quote or fetched source; depends on inspector findings. Unknown, not zero."))
    if removed:
        lines.append(_unknown("reskin:removal", "Removal/disposal or resale of removed equipment", "equipment",
                              "No fetched figure; resale value and haul-away cost unknown, so no credit is taken."))
    lines.append(_unknown("reskin:finishes", "Restyle finishes (wall, floor, ceiling, decor, signage)", "buildout",
                          "Area and finish prices not fetched: unknown, not zero."))

    # feasibility
    feas = []
    for kind in ("ventilation", "gas", "water", "electrical"):
        tl = next((l for l in tc["loads"] if l["kind"] == kind), None)
        fl = next((l for l in fc["loads"] if l["kind"] == kind), None)
        if tl:
            feas.append({"id": f"load:{kind}", "topic": kind, "status": "verify with inspector",
                         "from": fl["note"] if fl else None, "to": tl["note"], "basis": tl["basis"], "labelledAs": tl["status"]})
    for aid in qty_added:
        if {"open_flame", "tandoor"} & set(get(aid).tags):
            feas.append({"id": f"hood:{aid}", "topic": "hood class / suppression", "status": "verify with inspector",
                         "to": f"{get(aid).name}: open-flame or high-radiant appliance; hood type, fire suppression and clearance to combustibles per manufacturer listing",
                         "from": None, "basis": "appliance class assumption", "labelledAs": "assumption"})
    for u in unplaced:
        feas.append({"id": f"fit:{u['assetId']}", "topic": "fit", "status": "does not fit (packer)", "to": u["reason"], "from": None,
                     "basis": "geometry check on catalog dimensions (many are estimated)", "labelledAs": "derived"})
    for r in adjacency:
        if r["result"] == "violated":
            feas.append({"id": f"adj:{r['a']}:{r['b']}", "topic": "adjacency", "status": "advisory",
                         "to": f"{r['why']}: gap {r['gapM']} m > {r['maxGapM']} m", "from": None, "basis": r["basis"], "labelledAs": "assumption"})
    for p in tc["permits"]:
        feas.append({"id": "permit:" + p["item"][:40], "topic": "permit/inspection", "status": "verify with inspector",
                     "to": p["item"], "from": None, "basis": p["source"], "labelledAs": p["status"]})

    def card(p):
        a = get(p["assetId"])
        return {"assetId": p["assetId"], "name": a.name if a else None, "dimsStatus": a.dimsStatus if a else None}
    return {
        "fromConcept": from_concept, "toConcept": to_concept, "seats": seats, "seatsAssumed": seats is None,
        "syntheticSource": bool(layout.get("synthetic")),
        "removed": [{**card(p), "x": p["x"], "y": p["y"]} for p in removed],
        "added": [{**card(p), "x": p["x"], "y": p["y"], "placement": p["placement"]} for p in added],
        "unplaced": unplaced, "unknownAssetIds": unknown_ids,
        "keptCount": len(kept), "placements": final_pl, "adjacency": adjacency,
        "costDelta": {"lines": lines, **_totals(lines)},
        "feasibility": feas,
        "materials": {"from": fc["materials"], "to": tc["materials"], "glbPalette": palette_for(tc), "decor": tc["decor"],
                      "signage": tc["signage"],
                      "note": "Visual restyle spec. Apply with assets.glb.restyle_glb(glb, glbPalette) (keys match material names containing wall/floor/ceiling/accent)."},
        "notice": NOTICE,
    }
