"""2D region -> 3D room anchor from a metric depth map (ported from the user's Deja-View guide/hotspots.ts)."""
from .geometry import (Camera, anchor_box, camera_from_json, load_depth, pixel_ray, project, rotate,
                       sample_depth, unproject)
from .reality import annotate, cost_totals

__all__ = ["Camera", "anchor_box", "camera_from_json", "load_depth", "pixel_ray", "project", "rotate",
           "sample_depth", "unproject", "annotate", "cost_totals"]
