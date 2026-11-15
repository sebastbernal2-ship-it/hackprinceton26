"""Per-frame metric depth with Depth Anything V2 Metric-Indoor (transformers).

Ported from Deja-View pipeline/common/models.py (DepthEstimator). Weights come from the Hugging Face hub
(public repos, no HF_TOKEN needed; the hub client reads HF_TOKEN from the environment if one is set).
"""
from __future__ import annotations

import numpy as np

DEPTH_MODELS = {
    "small": "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf",   # ~100 MB
    "base": "depth-anything/Depth-Anything-V2-Metric-Indoor-Base-hf",     # ~390 MB
    "large": "depth-anything/Depth-Anything-V2-Metric-Indoor-Large-hf",   # ~1.3 GB
}
_MEAN = (0.485, 0.456, 0.406)
_STD = (0.229, 0.224, 0.225)


def depth_input_size(h: int, w: int, short_side: int = 518, multiple: int = 14) -> tuple[int, int]:
    """Network input size: short side ~`short_side`, both sides multiples of the ViT patch size."""
    s = short_side / min(h, w)
    nh = max(multiple, int(round(h * s / multiple)) * multiple)
    nw = max(multiple, int(round(w * s / multiple)) * multiple)
    return nh, nw


class DepthEstimator:
    """Batched monocular metric depth. Input RGB uint8 frames, output float32 metres at the input resolution."""

    def __init__(self, name: str = "small", device: str = "cuda", short_side: int = 518):
        import torch
        from transformers import AutoModelForDepthEstimation

        self.repo = DEPTH_MODELS[name]
        self.device = device
        self.dtype = torch.float16 if device == "cuda" else torch.float32
        self.short_side = short_side
        self.model = AutoModelForDepthEstimation.from_pretrained(self.repo).to(device, dtype=self.dtype).eval()
        self._torch = torch

    def __call__(self, frames: list[np.ndarray], batch: int = 8) -> list[np.ndarray]:
        torch = self._torch
        out: list[np.ndarray] = []
        mean = torch.tensor(_MEAN, device=self.device, dtype=self.dtype).view(1, 3, 1, 1)
        std = torch.tensor(_STD, device=self.device, dtype=self.dtype).view(1, 3, 1, 1)
        for i in range(0, len(frames), batch):
            chunk = frames[i:i + batch]
            h, w = chunk[0].shape[:2]
            x = torch.from_numpy(np.stack(chunk)).to(self.device).permute(0, 3, 1, 2).to(self.dtype) / 255.0
            nh, nw = depth_input_size(h, w, self.short_side)
            with torch.inference_mode():
                x = torch.nn.functional.interpolate(x, size=(nh, nw), mode="bicubic", align_corners=False, antialias=True)
                x = (x.clamp(0, 1) - mean) / std
                pred = self.model(pixel_values=x).predicted_depth
                if pred.ndim == 3:
                    pred = pred[:, None]
                pred = torch.nn.functional.interpolate(pred.float(), size=(h, w), mode="bilinear", align_corners=False)
            out.extend(p[0].cpu().numpy().astype(np.float32) for p in pred)
        return out
