"""Turn raw detections + validation into per-property JSON (gitignored under data/derived/triage/aerial/properties).
Only fields whose validated relative error is <= MAX_REL_ERR are exposed as values; others are 'unknown' with the reason."""
import json, os
from pathlib import Path
ROOT = Path(os.environ.get("HP_ROOT", "/home/vorte/code/hackprinceton"))
HERE = Path(__file__).parent
BASE = ROOT / "data/derived/triage/aerial"
MAX_REL_ERR = 0.30
VEH_T = 0.30
val = json.loads((HERE / "validation.json").read_text())
raw = json.loads((BASE / "raw_detections.json").read_text())
lab = json.loads((HERE / "labels.json").read_text())["labels"]
veh = val["classes"]["vehicle"]; unit = val["classes"]["rooftop_unit"]
mean_v = sum(l["vehicles"] for l in lab.values()) / len(lab)
rel_v = round(veh["cv_mae"] / mean_v, 2)
ru = [l["rooftop_units"] for l in lab.values() if l["rooftop_units"] is not None]
rel_u = round(unit["cv_mae"] / (sum(ru) / len(ru)), 2)

def unknown(reason): return {"status": "unknown", "value": None, "reason": reason}

out = BASE / "properties"; out.mkdir(parents=True, exist_ok=True)
for pid, dets in raw.items():
    meta = json.loads((BASE / "images" / f"{pid}.meta.json").read_text())
    boxes = [d for d in dets if d["cls"] == "vehicle" and d["score"] >= VEH_T]
    n = len(boxes); mae = veh["cv_mae"]
    rec = {
        "listingId": int(pid),
        "imagery": {"source": "Vexcel ortho/extract", "fetched": meta["fetched"], "capture_date": None,
                    "capture_date_note": "unknown: the API response carried no capture date",
                    "crop_half_width_m": meta["half_width_m"], "requested_m_per_px": meta["m_per_px"],
                    "bbox_lon_lat": meta["bbox_lon_lat"], "centred_on": "CoStar lat/long (no footprint polygon in kit)"},
        "vehicles": {
            "status": "estimated" if rel_v <= MAX_REL_ERR else "unknown",
            "label": "vehicles visible in the crop (parked or moving, incl. street and neighbouring lots); NOT parking stalls",
            "low": max(0, round(n - mae)), "expected": n, "high": round(n + mae),
            "rationale": f"OWLv2 count at score>={VEH_T}; range is +/- cross-validated MAE {mae} vehicles on {val['n_labelled']} hand-labelled crops (relative {rel_v:.0%}; threshold-sensitive). One imagery date; occupancy is a snapshot.",
            "boxes_xyxy_px": [b["box"] for b in boxes], "image_px": 2000},
        "rooftop_units": unknown(f"validated count error too high to expose (cv MAE {unit['cv_mae']} on mean {round(sum(ru)/len(ru),1)} units, {rel_u:.0%} relative, n={len(ru)})"),
        "parking_stalls": unknown("no stall-level validation set; painted-stripe counting not validated"),
        "loading_docks": unknown("loading docks are facade features, not observable in nadir imagery"),
        "roof_area_shape": unknown("no building footprint in the kit; not computed"),
        "validation": {"n_labelled": val["n_labelled"], "labels": "hand-labelled by the model, single annotator, counts only",
                       "vehicle_cv_mae": veh["cv_mae"], "rooftop_unit_cv_mae": unit["cv_mae"]},
        "provenance": "triage/aerial/detect.py (google/owlv2-base-patch16-ensemble, 800 px tiles) + build.py; screening estimate, not an engineering or survey assessment; model score is not a probability",
    }
    (out / f"{pid}.json").write_text(json.dumps(rec))
print("wrote", len(raw), "vehicle rel err", rel_v, "unit rel err", rel_u)
