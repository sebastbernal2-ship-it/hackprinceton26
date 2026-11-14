"""AnySplat wrapper: N views -> Gaussian splats + camera poses + intrinsics, in one feed-forward pass.

Ported from the owner's Deja-View (pipeline/anysplat_run.py): the model loader, the xformers / torch_scatter /
lightning shims (so it runs on Blackwell GPUs without those CUDA extensions) and `infer`. Everything about
HPC/HiPerGator, Roblox, jobs and thumbnails was dropped. AnySplat itself is a source checkout in
capture/.cache/AnySplat (MIT, https://github.com/InternRobotics/AnySplat, commit 5f5e208a) plus the
lhjiang/anysplat weights (2.9 GB, public).
"""
from __future__ import annotations

import os
import sys
import time
import types
from pathlib import Path

import numpy as np

from . import splat_io as sio

HERE = Path(__file__).resolve().parent
ANYSPLAT_MODEL = os.environ.get("ANYSPLAT_MODEL", "lhjiang/anysplat")
INPUT_SIZE = 448


def log(msg: str) -> None:
    print(f"[anysplat] {time.strftime('%H:%M:%S')} {msg}", file=sys.stderr, flush=True)


def _sdpa_attention(q, k, v, attn_bias=None, p: float = 0.0, scale=None, op=None, **_):
    """xformers.ops.memory_efficient_attention on [B, M, H, K] tensors, via PyTorch SDPA."""
    import torch.nn.functional as F

    out = F.scaled_dot_product_attention(
        q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2), attn_mask=attn_bias, dropout_p=0.0, scale=scale
    )
    return out.transpose(1, 2).contiguous()


def make_xformers_shim() -> types.ModuleType:
    ops = types.ModuleType("xformers.ops")
    ops.memory_efficient_attention = _sdpa_attention  # type: ignore[attr-defined]
    flash = types.SimpleNamespace(FwOp=None, BwOp=None)
    ops.fmha = types.SimpleNamespace(flash=flash)  # type: ignore[attr-defined]
    return ops


def make_torch_scatter_shim() -> types.ModuleType:
    import torch

    def _expand(index, src):
        return index.reshape(-1, *([1] * (src.dim() - 1))).expand_as(src)

    def scatter_add(src, index, dim=0, out=None, dim_size=None):
        if dim != 0:
            raise NotImplementedError("shim supports dim=0 only")
        size = int(dim_size) if dim_size is not None else int(index.max()) + 1
        res = torch.zeros((size,) + tuple(src.shape[1:]), dtype=src.dtype, device=src.device)
        return res.scatter_add_(0, _expand(index, src), src)

    def scatter_max(src, index, dim=0, out=None, dim_size=None):
        if dim != 0:
            raise NotImplementedError("shim supports dim=0 only")
        size = int(dim_size) if dim_size is not None else int(index.max()) + 1
        base = torch.zeros((size,) + tuple(src.shape[1:]), dtype=src.dtype, device=src.device)
        res = base.scatter_reduce(0, _expand(index, src), src, reduce="amax", include_self=False)
        return res, torch.zeros(res.shape, dtype=torch.long, device=src.device)

    mod = types.ModuleType("torch_scatter")
    mod.scatter_add = scatter_add  # type: ignore[attr-defined]
    mod.scatter_max = scatter_max  # type: ignore[attr-defined]
    return mod


def install_shims(force_xformers_shim: bool = False) -> dict:
    """Puts stand-ins into sys.modules for missing extensions. Returns what was shimmed."""
    used = {}
    try:
        if force_xformers_shim:
            raise ImportError("forced")
        import xformers.ops  # noqa: F401
    except Exception:
        shim = make_xformers_shim()
        pkg = types.ModuleType("xformers")
        pkg.ops = shim  # type: ignore[attr-defined]
        sys.modules["xformers"] = pkg
        sys.modules["xformers.ops"] = shim
        used["xformers"] = "sdpa"
    try:
        import torch_scatter  # noqa: F401
    except Exception:
        sys.modules["torch_scatter"] = make_torch_scatter_shim()
        used["torch_scatter"] = "torch.scatter_reduce"
    # Imported at module level by training/evaluation code that inference never calls.
    try:
        import skvideo  # noqa: F401
    except Exception:
        sys.modules["skvideo"] = types.ModuleType("skvideo")
        used["skvideo"] = "empty"
    try:
        import lightning.pytorch  # noqa: F401
    except Exception:
        import torch

        light = types.ModuleType("lightning")
        lp = types.ModuleType("lightning.pytorch")
        lp.LightningModule = torch.nn.Module  # type: ignore[attr-defined]
        light.pytorch = lp  # type: ignore[attr-defined]
        sys.modules["lightning"] = light
        sys.modules["lightning.pytorch"] = lp
        used["lightning"] = "placeholder"
    return used


def find_anysplat_src() -> Path:
    cands = []
    if os.environ.get("ANYSPLAT_SRC"):
        cands.append(Path(os.environ["ANYSPLAT_SRC"]))
    cands += [HERE / ".cache" / "AnySplat"]
    for c in cands:
        if (c / "src" / "model" / "model" / "anysplat.py").is_file():
            return c.resolve()
    raise RuntimeError("AnySplat source not found; set ANYSPLAT_SRC to a checkout of https://github.com/InternRobotics/AnySplat")


# --------------------------------------------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------------------------------------------


class AnySplatModel:
    def __init__(self, device: str = "cuda"):
        self.device = device
        self.model = None
        self.shims: dict = {}
        self.load_seconds = 0.0

    def load(self) -> None:
        if self.model is not None:
            return
        import torch

        if not torch.cuda.is_available():
            if os.environ.get("ANYSPLAT_ALLOW_CPU") != "1":
                raise RuntimeError("AnySplat needs a CUDA GPU (none visible)")
            self.device = "cpu"  # debugging only: minutes per view
        t0 = time.time()
        src = find_anysplat_src()
        if str(src) in sys.path:
            sys.path.remove(str(src))
        sys.path.insert(0, str(src))
        mod = sys.modules.get("src")
        if mod is not None and not str(getattr(mod, "__file__", "") or "").startswith(str(src)):
            for k in [k for k in sys.modules if k == "src" or k.startswith("src.")]:
                del sys.modules[k]
        self.shims = install_shims(os.environ.get("ANYSPLAT_XFORMERS") == "shim")
        from src.model.model.anysplat import AnySplat  # AnySplat's own package

        if "xformers" not in self.shims and (self.device == "cpu" or not _flash_attention_works()):
            import src.model.encoder.heads.head_modules as hm

            hm.xops = make_xformers_shim()
            self.shims["xformers"] = "sdpa (flash op failed on this GPU)"
        # Upstream's encoder downloads facebook/VGGT-1B (4.7 GB) only to overwrite it with the AnySplat checkpoint
        # (its own commented-out line is `VGGT()`). Skip that download: random init, then load lhjiang/anysplat.
        import src.model.encoder.anysplat as _enc

        _enc.VGGT.from_pretrained = classmethod(lambda cls, *a, **k: cls())
        model = AnySplat.from_pretrained(ANYSPLAT_MODEL)
        model = model.to(self.device).eval()
        for p in model.parameters():
            p.requires_grad = False
        self.model = model
        self.load_seconds = time.time() - t0
        log(f"AnySplat ready in {self.load_seconds:.1f}s (shims: {self.shims or 'none'})")

    def infer(self, views: np.ndarray) -> tuple[sio.Splats, np.ndarray, np.ndarray, float]:
        """views [V, S, S, 3] in 0..1 -> (splats in AnySplat's world, c2w OpenCV [V,4,4], K normalised [V,3,3], seconds)."""
        import torch

        self.load()
        x = torch.from_numpy(np.ascontiguousarray(views.transpose(0, 3, 1, 2))).float().to(self.device)[None]
        _sync()
        t0 = time.time()
        with torch.no_grad():
            gaussians, pose = self.model.inference(x)
        _sync()
        secs = time.time() - t0
        harm = gaussians.harmonics[0].float()  # [G, 3, d_sh], channel-major
        rot = gaussians.rotations[0].float()  # xyzw
        rot = torch.nn.functional.normalize(rot, dim=-1)[:, [3, 0, 1, 2]]
        splats = sio.Splats(
            gaussians.means[0].float().cpu().numpy(),
            gaussians.scales[0].float().cpu().numpy(),
            rot.cpu().numpy(),
            gaussians.opacities[0].float().reshape(-1).cpu().numpy(),
            harm[:, :, 0].cpu().numpy(),
            harm[:, :, 1:16].transpose(1, 2).cpu().numpy() if harm.shape[-1] > 1 else None,
        )
        c2w = pose["extrinsic"][0].float().cpu().numpy()
        K = pose["intrinsic"][0].float().cpu().numpy()
        del gaussians
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return splats, c2w, K, secs


def _sync() -> None:
    import torch

    if torch.cuda.is_available():
        torch.cuda.synchronize()


def _flash_attention_works() -> bool:
    try:
        import torch
        import xformers.ops as xops

        q = torch.randn(1, 64, 2, 64, device="cuda", dtype=torch.bfloat16)
        xops.memory_efficient_attention(q, q, q, op=(xops.fmha.flash.FwOp, xops.fmha.flash.BwOp))
        torch.cuda.synchronize()
        return True
    except Exception as e:
        log(f"xformers flash attention unavailable ({str(e).splitlines()[0][:120]}); using PyTorch SDPA")
        return False


_MODEL: AnySplatModel | None = None


def get_model() -> AnySplatModel:
    global _MODEL
    if _MODEL is None:
        _MODEL = AnySplatModel()
    return _MODEL
