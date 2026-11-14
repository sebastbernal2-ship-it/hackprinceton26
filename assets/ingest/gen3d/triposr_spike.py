"""Image -> mesh spike with TripoSR (MIT). NOT YET RUN: the run was blocked by the permission system.

VISUAL ONLY: output scale is arbitrary/normalised; never read dimensions from it (dims come from catalog/parametrics).

Intended setup (all under gitignored .cache/): clone VAST-AI-Research/TripoSR, a venv with torch cu128 (RTX 5080 is
sm_120), omegaconf einops transformers trimesh rembg[cpu] huggingface-hub scikit-image, and a CPU shim for
torchmcubes (needs nvcc, absent here) that wraps skimage.measure.marching_cubes with reversed vertex order.
  .cache/venv/bin/python triposr_spike.py IMAGE OUT_DIR
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path[:0] = [str(HERE / ".cache" / "shim"), str(HERE / ".cache" / "TripoSR")]

import numpy as np  # noqa: E402
import rembg  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from tsr.system import TSR  # noqa: E402
from tsr.utils import remove_background, resize_foreground  # noqa: E402


def main(image: str, out: str, res: int = 256):
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    t = {}
    t0 = time.time()
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to("cuda")
    t["load_s"] = round(time.time() - t0, 1)
    t0 = time.time()
    img = resize_foreground(remove_background(Image.open(image).convert("RGB"), rembg.new_session()), 0.85)
    a = np.array(img).astype(np.float32) / 255.0
    a = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5
    img = Image.fromarray((a * 255).astype(np.uint8))
    t["preprocess_s"] = round(time.time() - t0, 1)
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    with torch.no_grad():
        codes = model([img], device="cuda")
        torch.cuda.synchronize()
        t["encode_s"] = round(time.time() - t0, 1)
        t0 = time.time()
        mesh = model.extract_mesh(codes, True, resolution=res)[0]
    t["mesh_s"] = round(time.time() - t0, 1)
    mesh.export(out_dir / "mesh.glb")
    b = mesh.bounds
    stats = {"timing": t, "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1e9, 2),
             "vertices": len(mesh.vertices), "faces": len(mesh.faces), "watertight": bool(mesh.is_watertight),
             "bounds_extent_unitless": [round(float(v), 3) for v in b[1] - b[0]],
             "note": "extent is in arbitrary model units, NOT metres; do not use for dimensions"}
    (out_dir / "stats.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
