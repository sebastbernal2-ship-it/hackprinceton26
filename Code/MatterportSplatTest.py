#!/usr/bin/env python3
"""
matterport_splat.py - Build a Gaussian-splat training set from a Matterport model.

Matterport's Model API has no "splat" asset (as far as the public docs show), so this
does the next best thing:

  1. Pull every sweep (position + rotation + 6 skybox cube faces) via the Model API.
  2. Treat each cube face as a 90-degree pinhole camera with a KNOWN pose.
  3. Write a nerfstudio `transforms.json` dataset (no COLMAP/SfM needed).
  4. Optionally train with nerfstudio's splatfacto and export a .ply splat.

Usage:
  export MP_TOKEN_ID=...  MP_TOKEN_SECRET=...
  python matterport_splat.py MODEL_ID --out house --res 2k            # dataset only
  python matterport_splat.py MODEL_ID --out house --preview           # + equirect sanity previews
  python matterport_splat.py MODEL_ID --out house --train             # + train & export (needs GPU + nerfstudio)

Deps: pip install requests numpy pillow   (training: nerfstudio)
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image

API = "https://api.matterport.com/api/models/graph"

QUERY = """
fragment panoFragment on PanoramicImageLocation {
  id
  rotation { x y z w }
  position { x y z }
  skybox(resolution: "RES") { status format children }
}
query getSweeps($modelId: ID!) {
  model(id: $modelId) {
    id
    locations { id floor { id } panos { ...panoFragment } }
  }
}
"""

# ---------------------------------------------------------------------------
# Cube-face -> (forward, up) in the PANORAMA frame, for skybox0..skybox5.
# !! THIS TABLE IS A GUESS. Matterport does not document face order/orientation.
# Run with --preview and look at the equirect image; if it is scrambled, edit
# this table (or pass --faces-json with a list of 6 [forward, up] pairs).
# ---------------------------------------------------------------------------
DEFAULT_FACES = [
    ([0, -1, 0], [0, 0, 1]),
    ([1, 0, 0], [0, 0, 1]),
    ([0, 1, 0], [0, 0, 1]),
    ([-1, 0, 0], [0, 0, 1]),
    ([0, 0, 1], [0, 1, 0]),
    ([0, 0, -1], [0, -1, 0]),
]


def quat_to_mat(x, y, z, w):
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def face_basis(forward, up):
    """Return a 3x3 matrix whose columns are OpenGL camera axes (right, up, -forward)
    expressed in the panorama frame. nerfstudio cameras look down -Z with +Y up."""
    f = np.asarray(forward, float)
    f /= np.linalg.norm(f)
    u = np.asarray(up, float)
    u -= f * f.dot(u)
    u /= np.linalg.norm(u)
    r = np.cross(f, u)
    return np.stack([r, u, -f], axis=1)


def graphql(session, model_id, res):
    r = session.post(API, json={"query": QUERY.replace("RES", res),
                                "variables": {"modelId": model_id}}, timeout=120)
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        raise SystemExit("GraphQL errors:\n" + json.dumps(body["errors"], indent=2))
    return body["data"]["model"]["locations"]


def download(args):
    session, url, path = args
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    r = session.get(url, timeout=120)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)
    return path


def equirect_preview(face_paths, faces, out_path, h=512):
    """Stitch 6 faces into an equirectangular image using the assumed face table."""
    imgs = [np.asarray(Image.open(p).convert("RGB")) for p in face_paths]
    S = imgs[0].shape[0]
    w = h * 2
    lon = (np.arange(w) + 0.5) / w * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    # Z-up panorama frame
    d = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)
    bases = [face_basis(f, u) for f, u in faces]
    fwd = np.stack([-b[:, 2] for b in bases])           # (6,3)
    dots = d @ fwd.T                                      # (h,w,6)
    best = dots.argmax(-1)
    out = np.zeros((h, w, 3), np.uint8)
    for i, b in enumerate(bases):
        m = best == i
        if not m.any():
            continue
        dm = d[m]
        z = dm @ (-b[:, 2])
        px = (dm @ b[:, 0]) / z
        py = (dm @ b[:, 1]) / z
        ix = np.clip(((px + 1) / 2 * S).astype(int), 0, S - 1)
        iy = np.clip(((1 - py) / 2 * S).astype(int), 0, S - 1)
        out[m] = imgs[i][iy, ix]
    Image.fromarray(out).save(out_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model_id")
    ap.add_argument("--out", default="matterport_dataset")
    ap.add_argument("--res", default="2k", choices=["low", "high", "2k", "4k"],
                    help="skybox resolution (4k needs the High Resolution Imagery Pack)")
    ap.add_argument("--max-sweeps", type=int, default=0, help="0 = all (use a small number to test)")
    ap.add_argument("--faces-json", help="JSON file: list of 6 [forward, up] vector pairs")
    ap.add_argument("--pointcloud", help="optional .ply point cloud (from a MatterPak) to seed the splat")
    ap.add_argument("--preview", action="store_true", help="write equirect previews of the first 3 sweeps")
    ap.add_argument("--train", action="store_true", help="run nerfstudio splatfacto + export")
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()

    tid, sec = os.environ.get("MP_TOKEN_ID"), os.environ.get("MP_TOKEN_SECRET")
    if not (tid and sec):
        sys.exit("Set MP_TOKEN_ID and MP_TOKEN_SECRET")
    faces = json.load(open(a.faces_json)) if a.faces_json else DEFAULT_FACES
    assert len(faces) == 6

    s = requests.Session()
    s.auth = (tid, sec)

    locs = graphql(s, a.model_id, a.res)
    if a.max_sweeps:
        locs = locs[:a.max_sweeps]
    print(f"{len(locs)} sweep locations")

    img_dir = os.path.join(a.out, "images")
    os.makedirs(img_dir, exist_ok=True)

    jobs, meta = [], []
    for li, loc in enumerate(locs):
        for pano in loc.get("panos") or []:
            sky = pano.get("skybox") or {}
            kids = sky.get("children") or []
            if sky.get("status") != "available" or len(kids) != 6:
                print(f"  skip {loc['id']}: skybox status={sky.get('status')} faces={len(kids)}")
                continue
            paths = []
            for fi, url in enumerate(kids):
                p = os.path.join(img_dir, f"s{li:04d}_f{fi}.jpg")
                jobs.append((s, url, p))
                paths.append(p)
            meta.append((pano, paths))
            break  # one pano per location is enough
    if not meta:
        sys.exit("No usable skyboxes. Sandbox-mode keys only expose a demo model; "
                 "4k also needs the High Resolution Imagery Pack.")

    print(f"downloading {len(jobs)} images ...")
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(download, jobs))

    size = Image.open(meta[0][1][0]).size[0]
    frames = []
    for pano, paths in meta:
        q = pano["rotation"]
        R = quat_to_mat(q["x"], q["y"], q["z"], q["w"])
        t = np.array([pano["position"][k] for k in "xyz"], float)
        for (fwd, up), p in zip(faces, paths):
            c2w = np.eye(4)
            c2w[:3, :3] = R @ face_basis(fwd, up)
            c2w[:3, 3] = t
            frames.append({"file_path": os.path.relpath(p, a.out), "transform_matrix": c2w.tolist()})

    tf = {
        "camera_model": "OPENCV",
        "w": size, "h": size,
        "fl_x": size / 2, "fl_y": size / 2,   # 90 deg FOV cube face
        "cx": size / 2, "cy": size / 2,
        "k1": 0, "k2": 0, "p1": 0, "p2": 0,
        "frames": frames,
    }
    if a.pointcloud:
        shutil.copy(a.pointcloud, os.path.join(a.out, "points.ply"))
        tf["ply_file_path"] = "points.ply"
    json.dump(tf, open(os.path.join(a.out, "transforms.json"), "w"), indent=1)
    print(f"wrote {len(frames)} frames -> {a.out}/transforms.json")

    if a.preview:
        for i, (_, paths) in enumerate(meta[:3]):
            out = os.path.join(a.out, f"preview_{i}.jpg")
            equirect_preview(paths, faces, out)
            print("preview:", out, "(should look like a seamless room; if scrambled, fix DEFAULT_FACES)")

    train_cmd = ["ns-train", "splatfacto", "--data", a.out, "--output-dir", os.path.join(a.out, "runs"),
                 "nerfstudio-data", "--orientation-method", "none",
                 "--center-method", "none", "--auto-scale-poses", "False"]
    print("\ntrain:  " + " ".join(train_cmd))
    print("export: ns-export gaussian-splat --load-config <runs/.../config.yml> --output-dir "
          + os.path.join(a.out, "export"))
    if a.train:
        if not shutil.which("ns-train"):
            sys.exit("ns-train not found: pip install nerfstudio (needs a CUDA GPU)")
        subprocess.run(train_cmd, check=True)
        print("Now run the export command above with the config.yml path printed by training.")


if __name__ == "__main__":
    main()