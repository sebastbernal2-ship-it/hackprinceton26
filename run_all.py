#!/usr/bin/env python3
r"""
run_all.py - run the whole HackPrinceton pipeline, one step after another, with your settings in one place.

    python run_all.py                 # run every step that is not already done
    python run_all.py --force         # redo every step
    python run_all.py --from bake     # start at a step (download, pipeline, meshdiff, prepare, bake, open)
    python run_all.py --only meshdiff # run one step
    python run_all.py --list          # show the steps and whether each is done

Edit SETTINGS below. API keys are read from .env (never put them in this file).
Run from the repo root (the folder that contains Code/).
"""
import argparse, glob, os, shutil, subprocess, sys, time, webbrowser
from pathlib import Path

# =============================================================================== SETTINGS
SETTINGS = {
    "model": "zvKHR9DHNjJ",          # Matterport model id

    # 1. download every Matterport / hackathon visual (download_assets.py)
    "download_res": "4k",            # panorama face resolution: low | high | 2k | 4k  (4k = sharpest textures)
    "download_splat": False,         # exterior splat.ply (~550 MB)
    "download_drone": "12",          # drone photos: none | all | N

    # 2. panorama furniture detection (pano_pipeline.py)
    "pipeline_res": "high",          # skybox resolution used for detection: low | high | 2k | 4k
    "pipeline_max_panos": 0,         # 0 = all, 3-5 = quick test
    "pipeline_min_confidence": 1.3,
    "pipeline_label": False,         # name objects with a vision model (needs ANTHROPIC_API_KEY in .env)

    # 3. mesh difference (mesh_furniture_v2.py)
    "meshdiff_tol": 0.12,            # metres from the empty mesh that counts as furniture
    "meshdiff_cluster_radius": 0.20,

    # 5. texture bake (texture_bake.py)
    "bake_edge": 0.09,               # house mesh triangle size (m): smaller = sharper colours, bigger file
    "bake_obj_edge": 0.06,           # furniture model triangle size (m)
    "bake_pano_width": 8192,         # exported panorama width for photo projection (4096, 8192 if you downloaded 4k)
    "bake_refine_poses": True,       # re-fit pano headings against the mesh

    # 6. open the editor in your browser at the end
    "open_editor": True,
}
# ========================================================================================

ROOT = Path(__file__).resolve().parent
CODE = ROOT / "Code"
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
    sys.exit(f"missing script: Code/{names[0]}")


def run(cmd):
    print("   $ " + " ".join(str(c) for c in cmd), flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT)
    if r.returncode != 0:
        sys.exit(f"\nstep failed (exit {r.returncode}). Fix the error above, then rerun with --from <this step>.")


S = SETTINGS
SID = S["model"]
ASSETS = ROOT / f"assets_{SID}"
PANO = ROOT / f"pano_{SID}"
MD = PANO / "mesh_diff"


# ------------------------------------------------------------------------------- steps
def step_download():
    cmd = [PY, script("download_assets.py"), "--model", SID, "--res", S["download_res"], "--drone", S["download_drone"]]
    if S["download_splat"]:
        cmd.append("--splat")
    run(cmd)


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
    furn = sorted(meshes.glob("*simple_planes*.obj"))
    empty = sorted(meshes.glob("*defurnished*.obj"))
    if not (furn and empty):
        sys.exit(f"no meshes in {meshes} - run the download step first")
    run([PY, script("mesh_furniture_v2.py", "mesh_furniture.py"), "--furnished", furn[0], "--empty", empty[0],
         "--pano-dir", PANO, "--tol", S["meshdiff_tol"], "--cluster-radius", S["meshdiff_cluster_radius"]])


def step_prepare():
    """Make mesh_diff/ a complete folder for planner.html and editor3d.html."""
    MD.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(MD / "objects_fused.json", MD / "objects.json")
    for f in ("plan.json", "labels.json", "panos.json"):
        if (PANO / f).exists():
            shutil.copyfile(PANO / f, MD / f)
    if (PANO / "crops").exists():
        shutil.copytree(PANO / "crops", MD / "crops", dirs_exist_ok=True)
    print(f"   prepared {MD}")


def step_bake():
    cmd = [PY, script("texture_bake.py"), "--pano-dir", PANO, "--edge", S["bake_edge"],
           "--obj-edge", S["bake_obj_edge"], "--pano-width", S["bake_pano_width"]]
    if not S["bake_refine_poses"]:
        cmd.append("--no-refine")
    run(cmd)


def step_open():
    if not S["open_editor"]:
        return
    ed = CODE / "editor3d.html"
    webbrowser.open(ed.as_uri())
    print(f"   opened {ed.name} - click 'Choose mesh_diff folder' and pick:\n   {MD}")


STEPS = [  # name, function, "done" check
    ("download", step_download, lambda: (ASSETS / "matterport" / "meshes").exists()
                                        and any((ASSETS / "matterport" / "meshes").glob("*.obj"))),
    ("pipeline", step_pipeline, lambda: (PANO / "objects.json").exists() and (PANO / "panos.json").exists()),
    ("meshdiff", step_meshdiff, lambda: (MD / "objects_fused.json").exists()),
    ("prepare",  step_prepare,  lambda: False),           # cheap: always runs
    ("bake",     step_bake,     lambda: (MD / "empty_room_textured.obj").exists() and (MD / "pano_poses.json").exists()),
    ("open",     step_open,     lambda: False),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    names = [s[0] for s in STEPS]
    ap.add_argument("--force", action="store_true", help="redo steps even if their output exists")
    ap.add_argument("--from", dest="start", choices=names, help="start at this step (forces it and later ones)")
    ap.add_argument("--only", choices=names, help="run just this step")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    os.chdir(ROOT)
    load_env()

    if a.list:
        for n, _, done in STEPS:
            print(f"  {n:9s} {'done' if done() else '-'}")
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
