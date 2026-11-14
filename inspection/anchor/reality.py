"""Reality flag: is a finding on a CAPTURED surface (observed) or an imagined one (inferred)?

reality.json (optional, from the capture pipeline):
  {"images": {"<image file name or stem>": "observed" | "inferred"},
   "imaginedVolumes": [{"min": [x,y,z], "max": [x,y,z]}]}      # room metres; anchors inside are inferred
Rules, in order: finding's image listed as inferred -> inferred; anchor inside an imagined volume -> inferred;
reality.json given and image not listed -> inferred (unknown is not captured); no reality.json -> observed only
for a panorama-sourced finding that has a depth anchor, else inferred.
"""
from __future__ import annotations

from pathlib import Path


def _image_status(reality: dict, ref: str) -> str | None:
    imgs = reality.get("images") or {}
    return imgs.get(ref) or imgs.get(Path(ref).stem)


def reality_of(finding: dict, anchor: dict | None, reality: dict | None) -> tuple[str, str]:
    ev = finding.get("evidence") or {}
    pos = (anchor or {}).get("position")
    if reality is not None:
        st = _image_status(reality, str(ev.get("ref", "")))
        if st != "observed":
            return "inferred", "image not marked observed in reality.json" if st is None else "image marked inferred"
        for v in reality.get("imaginedVolumes") or []:
            try:
                if pos and all(v["min"][i] <= pos[i] <= v["max"][i] for i in range(3)):
                    return "inferred", "anchor inside an imagined volume"
            except (KeyError, IndexError, TypeError):
                continue
        return "observed", "image marked observed in reality.json"
    if ev.get("source") == "panorama" and pos:
        return "observed", "captured image with depth anchor (no reality.json)"
    return "inferred", "no captured-surface evidence"


def annotate(findings: list[dict], anchors: dict[str, dict], reality: dict | None) -> list[dict]:
    out = []
    for f in findings:
        a = anchors.get(f["id"])
        r, why = reality_of(f, a, reality)
        out.append({**f, "anchor": a, "reality": r, "realityReason": why})
    return out


def cost_totals(findings: list[dict], include_inferred: bool = False) -> dict:
    """Count of cost line item ids over findings; inferred findings are excluded unless asked."""
    counts: dict[str, int] = {}
    used = excluded = 0
    for f in findings:
        if f.get("reality") == "inferred" and not include_inferred:
            excluded += 1
            continue
        used += 1
        for cid in f.get("costLineItemIds", []):
            counts[cid] = counts.get(cid, 0) + 1
    return {"costLineItemCounts": counts, "findingsCounted": used, "inferredExcluded": excluded}
