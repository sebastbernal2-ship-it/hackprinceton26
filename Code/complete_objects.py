#!/usr/bin/env python3
r"""
complete_objects.py - closed, tear-free furniture models for the studio (replaces the old refine_objects.py patches).

Four approaches were built and compared with Code/eval_models.py (rays that see a back face = tear / open side, or cross
two front faces = doubled surface) and against photos of similar real furniture. Test set (12 pieces), open %:
    raw cuts 31.1 | old refine 25.0 | A rebuild 8.6 | D templates 8.7 | C fusion+photos 10.8
A (Code/variants/variant_a_poisson.py) - one closed surface per piece rebuilt from the scan: signed distance near the
    scan, solid pieces filled down to the floor, space the 39 scan cameras saw empty carved away, marching cubes, colour
    from the scan texture. Stays closest to the real piece (piano, mantel, sofas, beds) and has 0 open edges.
D (Code/variants/variant_d_template.py) - per-kind templates fitted to the scan. Its legged template is the only method
    that rebuilds legs the segmentation cut off (tables, stools) and closes the pouf as a drum; elsewhere templates
    look generic, so they are only used for those.

This step:
  1. builds A and D (skipped when their output is newer than scene_tiles.json, or with --no-build)
  2. picks per piece: D where D fitted its legged template (table / coffee / side table / stool) and does not score
     clearly worse than A; A everywhere else; the raw cut if neither produced a model
  3. decimates each chosen mesh (fast-simplification) to keep the studio fast, carrying the vertex colours over
  4. writes objects_complete/*.glb and scene_refined.json (what studio.html loads)

    python Code\complete_objects.py
    python Code\complete_objects.py --no-build --max-tris 30000
"""
import argparse, json, os, subprocess, sys, time
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from eval_models import load_glb       # noqa: E402
from tile_objects import write_glb     # noqa: E402


def newer(a, b):
    return os.path.exists(a) and os.path.exists(b) and os.path.getmtime(a) >= os.path.getmtime(b)


def build(md, model, a):
    tiles = os.path.join(md, "scene_tiles.json")
    for name, script in (("a", "variant_a_poisson.py"), ("d", "variant_d_template.py")):
        out = os.path.join(md, f"scene_variant_{name}.json")
        if a.no_build or (newer(out, tiles) and not a.force):
            print(f"variant {name.upper()}: using existing {out}"); continue
        print(f"variant {name.upper()}: building ...", flush=True)
        t = time.time()
        r = subprocess.run([sys.executable, os.path.join(HERE, "variants", script), "--model", model])
        print(f"variant {name.upper()}: exit {r.returncode} in {time.time() - t:.0f}s", flush=True)


def to_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def decimate(prims, max_tris):
    """Merge primitives into one coloured mesh and reduce it to <= max_tris triangles."""
    P, F, C, off = [], [], [], 0
    for p in prims:
        if not len(p["F"]):
            continue
        P.append(p["P"]); F.append(p["F"] + off); off += len(p["P"])
        C.append(p["COL"] if p["COL"] is not None else np.tile(p["color"], (len(p["P"]), 1)))
    if not P:
        return None
    P, F, C = np.vstack(P), np.vstack(F), np.vstack(C)          # C is display (sRGB-ish) colour from load_glb
    if len(F) > max_tris:
        import fast_simplification
        P2, F2 = fast_simplification.simplify(P.astype(np.float32), F.astype(np.int64), target_reduction=1 - max_tris / len(F))
        C = C[cKDTree(P).query(P2)[1]]
        P, F = P2, F2
    return {"P": np.asarray(P, np.float32), "F": np.asarray(F, np.uint32), "COL": to_linear(C).astype(np.float32),
            "name": "closed model"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--no-build", action="store_true", help="only combine the existing variant outputs")
    ap.add_argument("--force", action="store_true", help="rebuild A and D even if up to date")
    ap.add_argument("--max-tris", type=int, default=40000, help="per piece after decimation")
    ap.add_argument("--d-margin", type=float, default=3.0, help="use D only if its open%% is at most this much worse than A")
    a = ap.parse_args()
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    build(md, a.model, a)

    tiles = {r["id"]: r for r in json.load(open(os.path.join(md, "scene_tiles.json")))["objects"]}
    load = lambda n: {r["id"]: r for r in json.load(open(os.path.join(md, n)))["objects"]} if os.path.exists(os.path.join(md, n)) else {}
    A, D = load("scene_variant_a.json"), load("scene_variant_d.json")
    ev = lambda n: {r["id"]: r for r in json.load(open(os.path.join(md, n)))["objects"]} if os.path.exists(os.path.join(md, n)) else {}
    EA, ED = ev("eval_variant_a_all.json"), ev("eval_variant_d_all.json")

    od = os.path.join(md, "objects_complete"); os.makedirs(od, exist_ok=True)
    out, counts, t0 = [], {"A": 0, "D": 0, "raw": 0}, time.time()
    for oid, r in tiles.items():
        if not r.get("file"):
            out.append(dict(r)); continue
        d = D.get(oid, {}); vd = d.get("variant_d") or {}
        use = "A" if A.get(oid, {}).get("file") else "raw"
        if str(vd.get("template", "")).startswith("legged") and d.get("file"):
            ea, ed = EA.get(oid, {}).get("open_pct"), ED.get(oid, {}).get("open_pct")
            if ea is None or ed is None or ed <= ea + a.d_margin:
                use = "D"
        src = {"A": A.get(oid, {}), "D": d, "raw": r}[use]
        prims = load_glb(os.path.join(md, src["file"]))
        prim = decimate(prims, a.max_tris) if use != "raw" else None
        nr = dict(r); nr["original_file"] = r["file"]
        if prim is None:
            use = "raw"; nr["file"] = r["file"]
        else:
            fn = f"objects_complete/{os.path.basename(src['file'])}"
            write_glb(os.path.join(md, fn), [prim]); nr["file"] = fn
            nr["triangles"] = int(len(prim["F"]))
        e = (EA if use == "A" else ED if use == "D" else {}).get(oid, {})
        nr["refine"] = {"method": {"A": "closed rebuild from the scan (A)", "D": "fitted template (D)", "raw": "raw cut"}[use],
                        "template": vd.get("template") if use == "D" else None,
                        "open_pct": e.get("open_pct"), "see_through_pct": e.get("see_through_pct"), "doubled_pct": e.get("doubled_pct")}
        counts[use] += 1; out.append(nr)
    json.dump({"frame": "local: origin = box centre (x,y) and floor (z), unrotated, z up",
               "method": "complete_objects.py: per piece A (closed rebuild) or D (legged template); see Code/eval_models.py",
               "objects": out}, open(os.path.join(md, "scene_refined.json"), "w"), indent=1)
    mb = sum(os.path.getsize(os.path.join(od, f)) for f in os.listdir(od)) / 1e6
    print(f"{counts['A']} rebuilt (A), {counts['D']} templates (D), {counts['raw']} raw -> {od} ({mb:.0f} MB) + scene_refined.json "
          f"in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
