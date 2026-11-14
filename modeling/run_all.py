#!/usr/bin/env python3
r"""
run_all.py - run the whole HackPrinceton pipeline, one step after another, with your settings in one place.

    python run_all.py                 # run every step that is not already done
    python run_all.py --force         # redo every step
    python run_all.py --from bake     # start at a step (download, matterpak, fetch, tiles, pipeline, meshdiff, prepare, tileobjects, refine, bake, carve, walk, sdk, serve)
    python run_all.py --only meshdiff # run one step
    python run_all.py --list          # show the steps and whether each is done
    python run_all.py --only serve    # just start the local server and open the studio

Edit SETTINGS below. API keys are read from .env (never put them in this file).
Run from the working folder that should hold assets_<id>/ and pano_<id>/ (the current directory is used):
    MODEL_ID=<id> python modeling/run_all.py --list      # or:  --model <id>
"""
import argparse, glob, os, shutil, subprocess, sys, time, webbrowser
from pathlib import Path

# =============================================================================== SETTINGS
SETTINGS = {
    "model": os.environ.get("MODEL_ID", ""),   # Matterport model id; or pass --model <id>

    # 1. download every Matterport / hackathon visual (download_assets.py)
    "download_res": "2k",            # panorama face resolution: low | high | 2k | 4k  (4k = sharpest textures)
    "download_splat": False,         # exterior splat.ply (~550 MB)
    "download_drone": "12",          # drone photos: none | all | N

    # 1a. MatterPak: textured OBJ of the furnished house (matterpak.py). Never buys/unlocks anything.
    "matterpak": True,

    # 1b. Matterport's full-quality 3D Tiles + AI object annotations (fetch_tiles.py, tiles_mesh.py)
    "tiles": True,                   # download + convert the tiles (the mesh Matterport itself renders)
    "tiles_max": 0,                  # 0 = all tiles; e.g. 50 for a quick test

    # 2. panorama furniture detection (pano_pipeline.py)
    "pipeline_res": "high",          # skybox resolution used for detection: low | high | 2k | 4k
    "pipeline_max_panos": 0,         # 0 = all, 3-5 = quick test
    "pipeline_min_confidence": 1.3,
    "pipeline_label": False,         # name objects with a vision model (needs ANTHROPIC_API_KEY in .env)

    # 3. mesh difference (mesh_furniture_v2.py)
    "meshdiff_tol": 0.12,            # metres from the empty mesh that counts as furniture
    "meshdiff_cluster_radius": 0.20,

    # 4b. furniture models from Matterport's full-quality mesh
    "furniture_split": "segment",    # segment = split the mesh by its own geometry (segment_furniture.py, recommended)
                                     # boxes   = cut the mesh with the object boxes (tile_objects.py, older)
    "tileobj_pad": 0.12,             # m added around each object box
    "tileobj_tol": 0.06,             # m: closer than this to the empty house = house, not furniture
    "tileobj_tol_coarse": 0.10,      # ...used instead when the empty house is only the coarse 50k defurnished OBJ

    # 4c. closed, tear-free furniture models (complete_objects.py: rebuild A + legged templates D, decimated)
    "refine": True,
    "refine_max_tris": 40000,        # triangles per piece after decimation (studio load time)

    # 5. texture bake (texture_bake.py)
    "bake_edge": 0.09,               # house mesh triangle size (m): smaller = sharper colours, bigger file
    "bake_obj_edge": 0.06,           # furniture model triangle size (m)
    "bake_pano_width": 4096,         # exported panorama width for photo projection (8192 if you downloaded 4k)
    "bake_refine_poses": True,       # re-fit pano headings against the mesh

    # 6. silhouette carving (shape_carve.py) - real object shapes; experimental
    "carve": True,
    "carve_mask_mode": "both",       # diff | consistency | both
    "carve_voxel": 0.03,             # m
    "carve_debug": True,             # write shape_debug/ contact sheets for tuning

    # 7. Matterport SDK studio (studio.html): Matterport's own render + our movable furniture
    "serve_port": 8000,              # local web server (the SDK key only works on localhost)
    "open_studio": True,             # open studio.html in the browser
    "open_editor": False,            # also open editor3d.html (offline editor with wall editing)
}
# ========================================================================================

CODE = Path(__file__).resolve().parent          # this folder (modeling/)
ROOT = Path.cwd()                               # working folder: assets_<id>/, pano_<id>/ and .env live here
if "--model" in sys.argv:                        # peek so the path globals below see it
    SETTINGS["model"] = sys.argv[sys.argv.index("--model") + 1]
if not SETTINGS["model"] and not {"-h", "--help"} & set(sys.argv):
    sys.exit("set MODEL_ID in the environment or pass --model <id>")
PY = sys.executable


def load_env():
    """Put .env values into the environment for the child scripts (keys stay out of this file and git)."""
    p = ROOT / ".env"
    if not p.exists():
        print("note: no .env found - steps that call the Matterport API will fail")
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.replace("$env:", "").strip()
        os.environ.setdefault(k, v.strip().strip('"').strip("'"))


def script(*names):
    for n in names:
        if (CODE / n).exists():
            return str(CODE / n)
    sys.exit(f"missing script: {CODE / names[0]}")


def run(cmd, fatal=True):
    print("   $ " + " ".join(str(c) for c in cmd), flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT)
    if r.returncode != 0 and not fatal:
        print(f"   (step failed with exit {r.returncode}; continuing without it)")
        return False
    if r.returncode != 0:
        sys.exit(f"\nstep failed (exit {r.returncode}). Fix the error above, then rerun with --from <this step>.")


S = SETTINGS
SID = S["model"]
ASSETS = ROOT / f"assets_{SID}"
PANO = ROOT / f"pano_{SID}"
MD = PANO / "mesh_diff"
TILES = ASSETS / "tiles"


# ------------------------------------------------------------------------------- steps
def step_download():
    cmd = [PY, script("download_assets.py"), "--model", SID, "--res", S["download_res"], "--drone", S["download_drone"]]
    if S["download_splat"]:
        cmd.append("--splat")
    run(cmd)


def step_matterpak():
    if not S["matterpak"]:
        print("   MatterPak disabled in SETTINGS"); return
    run([PY, script("matterpak.py"), "--model", SID], fatal=False)


def step_fetch():
    if not S["tiles"]:
        print("   tiles disabled in SETTINGS"); return
    cmd = [PY, script("fetch_tiles.py"), "--model", SID]
    if S["tiles_max"]:
        cmd += ["--max-tiles", S["tiles_max"]]
    run(cmd, fatal=False)


def step_tiles():
    if not S["tiles"]:
        print("   tiles disabled in SETTINGS"); return
    if not (TILES / "furnished" / "tileset.json").exists():
        print("   no tiles were downloaded (see the fetch step / tiles/report.txt) - continuing without them"); return
    run([PY, script("tiles_mesh.py"), "--model", SID], fatal=False)


def step_pipeline():
    cmd = [PY, script("pano_pipeline.py"), "--model", SID, "--res", S["pipeline_res"],
           "--max-panos", S["pipeline_max_panos"], "--min-confidence", S["pipeline_min_confidence"]]
    if S["pipeline_label"]:
        cmd.append("--label")
    if (PANO / "plan_raw.json").exists():
        cmd += ["--plan-raw", PANO / "plan_raw.json"]
    run(cmd)


def step_meshdiff():
    meshes = ASSETS / "matterport" / "meshes"
    if (TILES / "furnished_mesh.obj").exists():
        furn = [TILES / "furnished_mesh.obj"]
        empty = [TILES / "defurnished_mesh.obj"] if (TILES / "defurnished_mesh.obj").exists() else sorted(meshes.glob("*defurnished*.obj"))
        print(f"   furnished: full-quality mesh ({furn[0].name}); empty: {empty[0].name if empty else '?'}")
    else:
        furn = sorted(meshes.glob("*simple_planes*.obj"))
        empty = sorted(meshes.glob("*defurnished*.obj"))
    if not (furn and empty):
        sys.exit(f"no meshes in {meshes} - run the download step first")
    run([PY, script("mesh_furniture.py"), "--furnished", furn[0], "--empty", empty[0],
         "--pano-dir", PANO, "--tol", S["meshdiff_tol"], "--cluster-radius", S["meshdiff_cluster_radius"]])


def step_prepare():
    """Make mesh_diff/ a complete folder for planner.html and editor3d.html."""
    MD.mkdir(parents=True, exist_ok=True)
    # tileobjects rewrites objects.json to match scene_tiles.json; once it has run, keep its output
    if (MD / "scene_tiles.json").exists() and (MD / "objects.json").exists():
        print("   objects.json comes from the tileobjects step - keeping it")
    else:
        shutil.copyfile(MD / "objects_fused.json", MD / "objects.json")
    for f in ("plan.json", "labels.json", "panos.json"):
        if (PANO / f).exists():
            shutil.copyfile(PANO / f, MD / f)
    if (PANO / "crops").exists():
        shutil.copytree(PANO / "crops", MD / "crops", dirs_exist_ok=True)
    print(f"   prepared {MD}")


def step_tileobjects():
    if not (TILES / "furnished_mesh.npz").exists():
        print("   no tiles mesh - skipping (objects keep their baked/carved models)"); return
    tol = S["tileobj_tol"] if (TILES / "defurnished_mesh.npz").exists() else S["tileobj_tol_coarse"]
    if S.get("furniture_split", "segment") == "segment":
        # rewrites mesh_diff/objects.json with one object per real piece of furniture (+ scene_tiles.json, GLBs)
        run([PY, script("segment_furniture.py"), "--model", SID, "--tol", tol])
    else:
        run([PY, script("tile_objects.py"), "--model", SID, "--pad", S["tileobj_pad"], "--tol", tol])


def step_refine():
    if not S["refine"]:
        print("   refine disabled in SETTINGS"); return
    if not (MD / "scene_tiles.json").exists():
        print("   no scene_tiles.json - skipping"); return
    # builds variant A (closed rebuild) + D (templates), picks per piece, writes scene_refined.json for the studio
    run([PY, script("complete_objects.py"), "--model", SID, "--max-tris", S["refine_max_tris"]], fatal=False)


def refine_done():
    out, src = MD / "scene_refined.json", MD / "scene_tiles.json"
    return out.exists() and (not src.exists() or out.stat().st_mtime >= src.stat().st_mtime)


def step_bake():
    cmd = [PY, script("texture_bake.py"), "--pano-dir", PANO, "--edge", S["bake_edge"],
           "--obj-edge", S["bake_obj_edge"], "--pano-width", S["bake_pano_width"]]
    if not S["bake_refine_poses"]:
        cmd.append("--no-refine")
    run(cmd)


def step_carve():
    if not S["carve"]:
        print("   carving disabled in SETTINGS"); return
    cmd = [PY, script("shape_carve.py"), "--pano-dir", PANO, "--mask-mode", S["carve_mask_mode"], "--voxel", S["carve_voxel"]]
    if S["carve_debug"]:
        cmd.append("--debug")
    run(cmd)


def step_walk():
    """Pack the furnished mesh for walk.html (first-person walk-through). Cheap, so it always refreshes."""
    if not (TILES / "furnished_mesh.npz").exists():
        print("   no furnished mesh (matterpak / tiles step) - skipping the walk-through"); return
    run([PY, script("walk_export.py"), "--model", SID], fatal=False)


SHOWCASE = CODE / "showcase"


def step_sdk():
    """Write modeling/showcase/config.js (SDK key from .env, model ids, data folder) for studio.html."""
    import json, tempfile
    # The house is shown with Matterport's embedded viewer (my.matterport.com) + our three.js overlay.
    # (The self-hosted Bundle SDK hangs on this model's exterior splat, so it is no longer used.)
    if not (CODE / "vendor" / "three.module.min.js").exists():
        sys.exit("modeling/vendor/three.module.min.js is missing (needed by studio.html)")
    key = os.environ.get("MATTERPORT_SDK_KEY")
    if not key:
        sys.exit("MATTERPORT_SDK_KEY is not in .env")
    plan = json.loads((PANO / "plan.json").read_text()) if (PANO / "plan.json").exists() else {}
    cfg = {"sdkKey": key, "model": SID, "defurnished": plan.get("defurnished_view") or "",
           "dataDir": f"/pano_{SID}/mesh_diff/"}
    SHOWCASE.mkdir(exist_ok=True)
    (SHOWCASE / "config.js").write_text("// written by run_all.py from .env - gitignored, do not commit\n"
                                        "window.HP_CONFIG = " + json.dumps(cfg, indent=1) + ";\n")
    print(f"   wrote {SHOWCASE / 'config.js'} (defurnished view: {cfg['defurnished'] or 'none'})")


def step_serve():
    """Serve the repo on localhost and open the studio. Runs until you press Ctrl+C."""
    import http.server, functools, threading
    port = S["serve_port"]
    class NoCache(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):                       # never let the browser run a stale page/script
            self.send_header("Cache-Control", "no-store, max-age=0")
            super().end_headers()
        def log_message(self, *a):
            pass
    handler = functools.partial(NoCache, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    base = f"http://localhost:{port}"
    rel = Path(os.path.relpath(CODE, ROOT)).as_posix()   # URL prefix of this folder under the served root
    print(f"   studio : {base}/{rel}/studio.html   (the page title shows its version)")
    print(f"   editor : {base}/{rel}/editor3d.html  (choose the folder {MD})")
    if S["open_studio"]:
        threading.Timer(1.0, lambda: webbrowser.open(base + f"/{rel}/studio.html")).start()
    if S["open_editor"]:
        threading.Timer(1.5, lambda: webbrowser.open(base + f"/{rel}/editor3d.html")).start()
    print("   serving - press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n   stopped")


STEPS = [  # name, function, "done" check
    ("download", step_download, lambda: (ASSETS / "matterport" / "meshes").exists()
                                        and any((ASSETS / "matterport" / "meshes").glob("*.obj"))),
    ("matterpak", step_matterpak, lambda: (TILES / "furnished_mesh.npz").exists()),
    ("fetch",    step_fetch,    lambda: (TILES / "furnished" / "tileset.json").exists()),
    ("tiles",    step_tiles,    lambda: (TILES / "furnished_mesh.npz").exists()),   # skipped when the MatterPak supplied it
    ("pipeline", step_pipeline, lambda: (PANO / "objects.json").exists() and (PANO / "panos.json").exists()),
    ("meshdiff", step_meshdiff, lambda: (MD / "objects_fused.json").exists()),
    ("prepare",  step_prepare,  lambda: False),           # cheap: always runs
    ("tileobjects", step_tileobjects, lambda: (MD / "scene_tiles.json").exists()),
    ("refine",   step_refine,   refine_done),             # redone whenever the cuts are newer
    ("bake",     step_bake,     lambda: (MD / "empty_room_textured.obj").exists() and (MD / "pano_poses.json").exists()),
    ("carve",    step_carve,    lambda: (MD / "scene_shapes.json").exists()),
    ("walk",     step_walk,     lambda: False),           # cheap: always repacks the walk-through mesh
    ("sdk",      step_sdk,      lambda: False),           # cheap: always refreshes config.js
    ("serve",    step_serve,    lambda: False),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    names = [s[0] for s in STEPS]
    ap.add_argument("--force", action="store_true", help="redo steps even if their output exists")
    ap.add_argument("--from", dest="start", choices=names, help="start at this step (forces it and later ones)")
    ap.add_argument("--only", choices=names, help="run just this step")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--model", help="Matterport model id (overrides SETTINGS / MODEL_ID)")
    a = ap.parse_args()
    load_env()

    if a.list:
        for n, _, done in STEPS:
            print(f"  {n:12s} {'done' if done() else '-'}")
        return

    t_all = time.time()
    started = a.start is None
    for i, (n, fn, done) in enumerate(STEPS, 1):
        if a.only and n != a.only:
            continue
        if not started and n == a.start:
            started = True
        if not started:
            continue
        forced = a.force or a.only == n or (a.start is not None)
        if done() and not forced:
            print(f"[{i}/{len(STEPS)}] {n}: already done (use --force or --from {n} to redo)")
            continue
        print(f"\n[{i}/{len(STEPS)}] {n} ...", flush=True)
        t = time.time()
        fn()
        print(f"[{i}/{len(STEPS)}] {n} finished in {time.time()-t:.0f}s")
    print(f"\nall done in {time.time()-t_all:.0f}s")


if __name__ == "__main__":
    main()
