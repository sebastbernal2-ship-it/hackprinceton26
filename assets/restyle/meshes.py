"""Procedural, VISUAL-ONLY GLB models for the reskin asset kinds (simple extrusions; not scans, not manufacturer CAD)."""
from pathlib import Path

from ..glb import circle_ring, glb_from_parts
from ..models import Asset
from ..variants import rect

STEEL, DARK, CLAY, WARM = "#B8BCC2", "#3A3D42", "#B5603A", "#D8C9A8"


def parts_for(a: Asset) -> list[dict]:
    w, d, h = a.dims.w, a.dims.d, a.dims.h
    tags = set(a.tags)
    if "tandoor" in tags:  # square steel drum, clay dome top, dark mouth disc
        r = min(w, d) / 2 * 0.8
        cx, cy = w / 2, d / 2
        return [{"ring": rect(w, d), "y0": 0, "y1": h * 0.82, "material": "body", "color": STEEL},
                {"ring": circle_ring(cx, cy, r, 24), "y0": h * 0.82, "y1": h, "material": "clay", "color": CLAY},
                {"ring": circle_ring(cx, cy, r * 0.45, 24), "y0": h, "y1": h + 0.01, "material": "mouth", "color": DARK}]
    if a.category in ("range", "oven") and h < 0.6:  # countertop griddle/broiler: cabinet + plate
        return [{"ring": rect(w, d), "y0": 0, "y1": h * 0.7, "material": "body", "color": STEEL},
                {"ring": rect(w, d), "y0": h * 0.7, "y1": h, "material": "plate", "color": DARK}]
    if a.category in ("seating", "table") and h > 0.3:  # top slab + central pedestal
        t = min(0.04, h / 6)
        px, py = w / 2, d / 2
        return [{"ring": rect(w, d), "y0": h - t, "y1": h, "material": "top", "color": WARM},
                {"ring": circle_ring(px, py, min(w, d) * 0.08, 12), "y0": 0, "y1": h - t, "material": "leg", "color": DARK}]
    return [{"ring": rect(w, d), "y0": 0, "y1": h, "material": "body", "color": STEEL}]


def write_model(a: Asset, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / f"{a.assetId}.glb"
    p.write_bytes(glb_from_parts(parts_for(a)))
    return p


def build_library_models(lib: Path, only_missing: bool = True) -> list[str]:
    """Write procedural GLBs for library assets into <lib>/models and set `model` on each asset JSON."""
    import json
    from ..models import Model3D
    done = []
    for f in sorted(lib.glob("*.json")):
        a = Asset.model_validate_json(f.read_text())
        if only_missing and a.model is not None:
            continue
        write_model(a, lib / "models")
        a = a.model_copy(update={"model": Model3D(uri=f"assets/library/models/{a.assetId}.glb", format="glb")})
        f.write_text(json.dumps(a.model_dump(mode="json"), indent=2) + "\n")
        done.append(a.assetId)
    return done
