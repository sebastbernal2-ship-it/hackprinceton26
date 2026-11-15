#!/usr/bin/env python3
"""scan_area.py - measured interior floor area for each local Matterport scan, computed once and saved.

    python modeling/scan_area.py                 # every assets_<id>/ folder in the current directory
    python modeling/scan_area.py --model <id>    # one model

Area = sum of Matterport's own room floor areas (rooms.dimensions.areaFloor, metric) over non-Void rooms, read from
pano_<id>/plan.json when the pipeline already saved it, otherwise from the Matterport Model API (keys from .env).
Writes data/derived/scan_areas.json (gitignored: sponsor-derived). Status "observed" (measured by the scan);
whether the scanned space is the suite for lease is NOT verified. Models without room data are recorded as unknown.
"""
import argparse, datetime, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import pano_pipeline as pp  # noqa: E402

SQFT_PER_M2 = 10.7639
OUT = Path("data/derived/scan_areas.json")


def rooms_for(model: str, s):
    plan = Path(f"pano_{model}/plan.json")
    if plan.exists():
        return json.loads(plan.read_text(encoding="utf-8")).get("rooms", []), "pano plan.json (Matterport rooms)"
    if s is None:
        return None, "no plan.json and no API session"
    raw = pp.gql(s, Q_ROOMS, id=model)
    return pp.build_plan(raw)["rooms"], "Matterport Model API rooms.dimensions.areaFloor"


# Q_PLAN without the defurnished view, which errors on models that have none.
Q_ROOMS = pp.Q_PLAN.replace('  view(type: "matterport.model.defurnished") { id }\n', "")


def _morph(g, k, grow):
    """Binary dilate (grow) or erode with a (2k+1) square, numpy only."""
    p = np.pad(g, k, constant_values=not grow)
    out = np.zeros_like(g) if grow else np.ones_like(g)
    for dy in range(2 * k + 1):
        for dx in range(2 * k + 1):
            win = p[dy:dy + g.shape[0], dx:dx + g.shape[1]]
            out = (out | win) if grow else (out & win)
    return out


def mesh_floor_sqft(model: str, cell=0.10, band=0.06, close=3):
    """Fallback when Matterport has no rooms: footprint of the floor plane (plus ceiling plane, which furniture does not
    hide) in the MatterPak mesh, rasterised at `cell` m and closed by `close` cells. A geometric estimate (derived)."""
    fz = Path(f"assets_{model}/tiles/furnished_mesh.npz")
    if not fz.exists():
        return None
    D = np.load(fz)
    V, F = D["V"].astype(float), D["F"]
    tri = V[F]
    cent = tri.mean(1)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-12)
    pts = []
    for sel, pick in ((n[:, 2] > 0.9, 0), (n[:, 2] < -0.9, -1)):
        z = cent[sel, 2]
        if not len(z):
            continue
        hist, edges = np.histogram(z, bins=max(1, int((z.max() - z.min()) / 0.02) + 1))
        lo, hi = np.percentile(cent[:, 2], [1, 99])
        bins = [i for i in np.argsort(-hist) if (edges[i] < lo + 0.5 * (hi - lo)) == (pick == 0)]
        if not bins:
            continue
        zc = edges[bins[0]] + 0.01
        keep = sel & (np.abs(cent[:, 2] - zc) < band)
        pts.append(np.concatenate([cent[keep], tri[keep].reshape(-1, 3)])[:, :2])
    if not pts:
        return None
    xy = np.concatenate(pts)
    ij = np.floor((xy - xy.min(0)) / cell).astype(int)
    g = np.zeros(ij.max(0) + 1, dtype=bool)
    g[ij[:, 0], ij[:, 1]] = True
    g = _morph(_morph(g, close, True), close, False)
    return round(float(g.sum()) * cell * cell * SQFT_PER_M2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append")
    a = ap.parse_args()
    models = a.model or sorted(p.name[len("assets_"):] for p in Path(".").glob("assets_*")
                               if p.is_dir() and p.name != "assets_catalog")
    try:
        s = pp.session()
    except SystemExit:
        s = None
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    today = datetime.date.today().isoformat()
    for m in models:
        try:
            rooms, src = rooms_for(m, s)
        except SystemExit as e:
            rooms, src = None, f"API error: {e}"
        areas = [r["area_m2"] for r in rooms or [] if r.get("area_m2")]
        mesh = None if areas else mesh_floor_sqft(m)
        if mesh:
            data[m] = {"status": "derived", "squareFeet": mesh, "rooms": 0, "asOf": today,
                       "source": f"MatterPak mesh floor/ceiling footprint, 0.1 m grid (Matterport rooms unavailable: {src})",
                       "limitations": "geometric estimate from the scan mesh; unscanned gaps under-count, open areas outside "
                                      "walls may over-count; suite-to-scan match unverified"}
        elif not areas:
            data[m] = {"status": "unknown", "squareFeet": None, "rooms": len(rooms or []), "source": src, "asOf": today}
        else:
            m2 = sum(areas)
            data[m] = {"status": "observed", "squareFeet": round(m2 * SQFT_PER_M2), "areaM2": round(m2, 1),
                       "rooms": len(areas), "floors": len({r.get("floor") for r in rooms}), "source": src, "asOf": today,
                       "limitations": "measured scanned interior; suite-to-scan match and lease boundary unverified"}
        print(f"  {m}: {data[m]['squareFeet'] or 'unknown'} sq ft ({data[m]['rooms']} rooms) - {src}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
