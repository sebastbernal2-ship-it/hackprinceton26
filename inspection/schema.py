"""DefectFinding validation (mirrors contracts/defect-finding.schema.json)."""
from typing import Any

CATEGORIES = {"plumbing", "electrical", "hvac", "flooring", "ceiling_water_damage", "walls_finishes",
              "structural", "kitchen_infrastructure", "egress_accessibility", "layout_inefficiency", "other"}
SEVERITIES = {"low", "medium", "high", "unknown"}
SOURCES = {"panorama", "floorplan_geometry", "listing_text"}


def coerce_finding(raw: dict, fid: str, source: str, ref: str, room_id: Any = None) -> dict | None:
    """Return a valid DefectFinding built from untrusted model output, or None if unusable.
    Unknown/invalid values degrade to the safe value (severity unknown, category other)."""
    if not isinstance(raw, dict) or not str(raw.get("title", "")).strip():
        return None
    cat = raw.get("category") if raw.get("category") in CATEGORIES else "other"
    sev = raw.get("severity") if raw.get("severity") in SEVERITIES else "unknown"
    try:
        conf = float(raw.get("modelConfidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = min(1.0, max(0.0, conf))
    region = raw.get("region")
    if isinstance(region, dict) and all(isinstance(region.get(k), (int, float)) for k in "xywh"):
        region = {k: float(region[k]) for k in "xywh"}
    else:
        region = None
    can = raw.get("canConfirmFromImagery")
    step = str(raw.get("verificationStep", "")).strip() or "On-site inspector must verify this item in person."
    return {
        "id": fid, "roomId": room_id, "category": cat, "title": str(raw["title"]).strip()[:140],
        "description": str(raw.get("description", "")).strip()[:1000], "severity": sev,
        "modelConfidence": conf,
        "evidence": {"source": source, "ref": ref, "region": region},
        "canConfirmFromImagery": can if isinstance(can, bool) else False,
        "verificationStep": step, "costLineItemIds": [],
    }


def validate_finding(f: dict) -> list[str]:
    errs = []
    for k in ("id", "roomId", "category", "title", "description", "severity", "modelConfidence",
              "evidence", "canConfirmFromImagery", "verificationStep", "costLineItemIds"):
        if k not in f:
            errs.append(f"missing {k}")
    if errs:
        return errs
    if f["category"] not in CATEGORIES: errs.append("bad category")
    if f["severity"] not in SEVERITIES: errs.append("bad severity")
    if not (isinstance(f["modelConfidence"], (int, float)) and 0 <= f["modelConfidence"] <= 1): errs.append("bad modelConfidence")
    ev = f["evidence"]
    if not isinstance(ev, dict) or ev.get("source") not in SOURCES or not isinstance(ev.get("ref"), str): errs.append("bad evidence")
    if not isinstance(f["canConfirmFromImagery"], bool): errs.append("bad canConfirmFromImagery")
    if not f["verificationStep"]: errs.append("empty verificationStep")
    if not isinstance(f["costLineItemIds"], list): errs.append("bad costLineItemIds")
    return errs
