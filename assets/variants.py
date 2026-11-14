"""Parametric variant generator. Every variant derives dims/footprint exactly from the parent and params.

Footprint frame: x along width, y along depth (front edge at y=0), origin at the min corner.
"""
import hashlib
import json
from pathlib import Path

from .glb import write_glb
from .models import Asset, Model3D

R = 6  # rounding for metres


def _r(v: float) -> float:
    return round(v, R)


def rect(w: float, d: float) -> list[list[float]]:
    return [[0.0, 0.0], [_r(w), 0.0], [_r(w), _r(d)], [0.0, _r(d)], [0.0, 0.0]]


def l_shape(arm_a: float, arm_b: float, depth_a: float, depth_b: float) -> list[list[float]]:
    """L polygon: arm A runs along x (length arm_a, depth depth_a); arm B runs along y (length arm_b, depth depth_b).
    Inside (re-entrant) corner at (depth_b, depth_a). Outer corner at origin."""
    if not (arm_a > depth_b > 0 and arm_b > depth_a > 0 and depth_a > 0):
        raise ValueError("arms must be longer than the other arm's depth, depths > 0")
    a, b, da, db = map(_r, (arm_a, arm_b, depth_a, depth_b))
    return [[0.0, 0.0], [a, 0.0], [a, da], [db, da], [db, b], [0.0, b], [0.0, 0.0]]


def _clamp_err(name: str, v: float, rng) -> None:
    if rng and not rng[0] - 1e-9 <= v <= rng[1] + 1e-9:
        raise ValueError(f"{name}={v} outside dimRanges {list(rng)}")


def _vid(parent: Asset, kind: str, params: dict) -> str:
    h = hashlib.sha1(json.dumps([kind, params], sort_keys=True).encode()).hexdigest()[:8]
    return f"{parent.assetId}__{kind}_{h}"


def _derive(parent: Asset, kind: str, params: dict, dims: dict, footprint: list, name: str, clearance=None,
            status_note: str = "", keep_price: bool = False, extra_tags=(), dims_status: str = "estimated") -> Asset:
    d = parent.model_dump()
    d.update(
        assetId=_vid(parent, kind, params), name=name, source="generated", parentAssetId=parent.assetId,
        variantKind=kind, dims=dims, dimsStatus=dims_status, footprint=footprint, status="draft",
        model=None, imageRefs=list(parent.imageRefs), allowedSizes=parent.allowedSizes if kind in ("mirrored",) else None,
        tags=sorted(set(parent.tags) | {kind} | set(extra_tags)),
        priceRef=parent.priceRef if keep_price else None,
        provenance={"origin": f"generated:{kind} from {parent.assetId}", "retrievedAt": None,
                    "notes": f"Derived geometrically from parent (dims status {parent.dimsStatus}); params={json.dumps(params, sort_keys=True)}. "
                             + status_note + ("" if keep_price else " No price: a generated variant is not a catalog SKU.")},
    )
    if clearance:
        d["clearance"] = clearance
    if kind not in ("scaled", "mirrored"):
        d["dimRanges"] = None  # the parent's ranges do not describe fixed derived geometry
    return Asset.model_validate(d)


def make_variant(parent: Asset, kind: str, params: dict | None = None) -> Asset:
    params = dict(params or {})
    p = parent.dims
    if kind == "corner_l":
        a = float(params.get("armA", p.w))
        b = float(params.get("armB", p.w))
        da = float(params.get("depthA", p.d))
        db = float(params.get("depthB", p.d))
        fp = l_shape(a, b, da, db)
        return _derive(parent, kind, params | {"armA": a, "armB": b, "depthA": da, "depthB": db},
                       {"w": a, "d": b, "h": p.h}, fp, f"{parent.name} (corner L)",
                       status_note="Two arms meeting at an inside corner; arm lengths are measured along the outer edges.")
    if kind == "island":
        c = max(parent.clearance.front, parent.clearance.sides, parent.clearance.back)
        return _derive(parent, kind, params, p.model_dump(), rect(p.w, p.d), f"{parent.name} (island)",
                       clearance={"front": c, "sides": c, "back": c},
                       status_note="Free-standing: clearance applied on all four sides (assumed equal to the parent's largest).")
    if kind == "wall_run":
        L = float(params["length"])
        _clamp_err("length", L, parent.dimRanges.w if parent.dimRanges else None)
        if parent.allowedSizes:
            raise ValueError("parent only exists in discrete sizes; use 'scaled' with allowedSizes")
        return _derive(parent, kind, params, {"w": L, "d": p.d, "h": p.h}, rect(L, p.d), f"{parent.name} ({L:g} m wall run)")
    if kind == "scaled":
        w, d, h = (float(params.get(k, getattr(p, k))) for k in "wdh")
        if parent.allowedSizes:
            if not any(abs(s.w - w) < 1e-9 and abs(s.d - d) < 1e-9 and abs(s.h - h) < 1e-9 for s in parent.allowedSizes):
                raise ValueError("size not in allowedSizes: " + ", ".join(s.label for s in parent.allowedSizes))
        elif parent.dimRanges:
            for k, v in zip("wdh", (w, d, h)):
                _clamp_err(k, v, getattr(parent.dimRanges, k))
        else:
            raise ValueError("parent has neither allowedSizes nor dimRanges; scaling is not permitted")
        sx, sy = w / p.w, d / p.d
        fp = [[_r(x * sx), _r(y * sy)] for x, y in parent.footprint]
        return _derive(parent, kind, {"w": w, "d": d, "h": h}, {"w": w, "d": d, "h": h}, fp, f"{parent.name} ({w:g}x{d:g}x{h:g} m)")
    if kind == "mirrored":
        fp = [[_r(p.w - x), y] for x, y in parent.footprint][::-1]
        out = _derive(parent, kind, params, p.model_dump(), fp, f"{parent.name} (mirrored)", keep_price=True,
                      status_note="Mirror about the width axis; dims identical to parent.", dims_status=parent.dimsStatus)
        return out
    raise ValueError(f"unknown variant kind {kind!r}")


def write_variant_model(a: Asset, out_dir: Path, uri_base: str | None = None) -> Asset:
    """Write procedural GLB for asset into out_dir and return a copy with model set."""
    path = write_glb(out_dir / f"{a.assetId}.glb", a.footprint, a.dims.h)
    return a.model_copy(update={"model": Model3D(uri=uri_base or str(path), format="glb")})
