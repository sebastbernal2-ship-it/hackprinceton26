"""Synthetic-data tests for the pure logic of the capture pipeline (no GPU, no model weights)."""
from __future__ import annotations

import json

import numpy as np
import pytest

from capture import frames as fr
from capture import reality as rl
from capture import scene as sc
from capture import splat_io as sio
from capture.depth import depth_input_size
from capture.run import metric_scale, view_to_viewer


# ---- frame sampling -------------------------------------------------------------------------------------------

def test_candidate_indices_spread_and_bounds():
    idx = fr.candidate_indices(300, 10, oversample=3)
    assert len(idx) == 30 and idx[0] == 0 and idx[-1] == 299
    assert np.all(np.diff(idx) > 0)


def test_candidate_indices_short_clip():
    assert list(fr.candidate_indices(5, 10)) == [0, 1, 2, 3, 4]


def test_pick_sharpest_one_per_slot():
    scores = np.array([1, 9, 2, 3, 8, 4, 7, 1, 1], float)
    assert fr.pick_sharpest(scores, 3) == [1, 4, 6]
    assert fr.pick_sharpest(np.array([]), 3) == []
    assert fr.pick_sharpest(scores, 20) == list(range(9))


def test_sharpness_orders_blur():
    rng = np.random.default_rng(0)
    sharp = (rng.random((120, 160, 3)) * 255).astype(np.uint8)
    blur = np.full_like(sharp, 128)
    assert fr.sharpness(sharp) > fr.sharpness(blur) == 0.0


def test_center_square_info_maps_back():
    img = np.zeros((848, 480, 3), np.uint8)
    out, info = fr.center_square(img, 448)
    assert out.shape == (448, 448, 3)
    assert info["x0"] == 0 and info["y0"] == (round(848 * 448 / 480) - 448) // 2


def test_depth_input_size_multiple_of_patch():
    nh, nw = depth_input_size(848, 480, 518)
    assert nh % 14 == 0 and nw % 14 == 0 and min(nh, nw) in range(504, 533)


# ---- metric scale ---------------------------------------------------------------------------------------------

def test_metric_scale_recovers_factor_with_outliers():
    rng = np.random.default_rng(1)
    z = rng.uniform(0.2, 1.0, (4, 64, 64)).astype(np.float32)
    d = z * 3.0
    d[:, :5] = 100.0  # out-of-range depth ignored
    z[:, 5:10] = 0  # no splat there
    out = metric_scale(list(z), list(d))
    assert out["factor"] == pytest.approx(3.0, rel=1e-3) and out["views"] == 4


def test_metric_scale_no_valid_pixels():
    assert metric_scale([np.zeros((8, 8), np.float32)], [np.ones((8, 8), np.float32)])["factor"] is None


# ---- reality split --------------------------------------------------------------------------------------------

def _view(yaw=0.0, pos=(0, 0, 0)):
    return rl.View(100, 100, 100.0, 100.0, 50.0, 50.0, sio.pose_matrix(sio.rot_y(yaw), pos))


def test_project_points_center_and_behind():
    v = _view()
    u, vv, z, ok = rl.project_points(np.array([[0, 0, -2.0], [0, 0, 2.0]]), v)
    assert ok.tolist() == [True, False]
    assert (u[0], vv[0], z[0]) == pytest.approx((50.0, 50.0, 2.0))


def test_classify_seen_frame_and_occlusion():
    v = _view()
    depth = np.full((100, 100), 2.0, np.float32)  # a wall 2 m ahead
    pts = np.array([
        [0, 0, -2.0],    # on the wall: seen
        [0, 0, -1.0],    # in front of the wall: seen
        [0, 0, -3.5],    # behind the wall: hidden
        [5, 0, -2.0],    # far outside the frame: not seen
        [0, 0, 2.0],     # behind the camera
    ])
    assert rl.classify_seen(pts, v, depth).tolist() == [True, True, False, False, False]


def test_classify_views_union_and_counts():
    a, b = _view(0.0), _view(np.pi)  # b faces +Z
    depth = np.full((100, 100), 4.0, np.float32)
    pts = np.array([[0, 0, -2.0], [0, 0, 2.0], [50.0, 0, 0.0]])
    res = rl.classify_views(pts, [a, b], [depth, depth])
    assert res.seen.tolist() == [True, True, False]
    assert res.view_count.tolist() == [1, 1, 0]
    assert res.seen_fraction == pytest.approx(2 / 3)


def test_close_see_through_fills_pinholes():
    d = np.full((9, 9), 2.0, np.float32)
    d[4, 4] = 8.0  # a far splat showing through the wall
    assert rl.close_see_through(d)[4, 4] == pytest.approx(2.0)


def test_pin_support_only_near_seen_surfaces():
    seen = np.array([[0, 1.0, -2.0], [1, 1.0, -2.0]])
    pins = np.array([[0.05, 1.0, -2.0], [0, 1.0, 5.0]])
    assert rl.pin_is_supported(pins, seen, 0.25).tolist() == [True, False]
    assert not rl.pin_is_supported(pins, np.zeros((0, 3)), 0.25).any()


def test_view_to_viewer_is_rigid_and_scales_position():
    tr = sio.transform_dict(sio.rot_y(0.5), [1, 2, 3], 2.0)
    c2w = sio.pose_matrix(np.eye(3), [1, 0, 0])
    out = view_to_viewer(c2w, tr)
    assert np.linalg.det(out[:3, :3]) == pytest.approx(1.0)
    R, t, s = sio.transform_parts(tr)
    assert out[:3, 3] == pytest.approx(s * (R @ [1, 0, 0]) + t)


# ---- splat io + scene.json ------------------------------------------------------------------------------------

def test_spz_roundtrip_count(tmp_path):
    rng = np.random.default_rng(2)
    s = sio.Splats.from_rgb(rng.normal(size=(50, 3)), [0.5, 0.4, 0.3], 0.02, opacities=0.9)
    sio.write_spz(tmp_path / "a.spz", s, sh_degree=0)
    assert len(sio.read_splats(tmp_path / "a.spz")) == 50


def test_place_world_scale_override_puts_floor_at_zero():
    rng = np.random.default_rng(3)
    floor = np.c_[rng.uniform(-3, 3, 4000), np.full(4000, -1.0) + rng.normal(0, 0.003, 4000), rng.uniform(-6, 0, 4000)]
    wall = np.c_[rng.uniform(-3, 3, 2000), rng.uniform(-1, 2, 2000), np.full(2000, -6.0)]
    p = sio.place_world(np.vstack([floor, wall]), None, np.eye(4), scale_override=2.0)
    assert p["floor"]["found"] and p["scale"] == 2.0 and p["floorY"] == 0.0
    assert p["camera"]["position"][1] == pytest.approx(2.0, abs=0.05)  # 1 unit above the floor * scale 2


def test_build_scene_contract(tmp_path):
    scene = sc.build_scene(world_file="world.spz", splat_count=10, bounds={"min": [0, 0, 0], "max": [4, 3, 5]},
                           floor_found=True, spawn={"position": [0, 1.5, 0], "yaw": 0.0},
                           scale={"method": "depth-anything-metric", "factor": 2.0}, capture={"views": 8}, thumb="thumb.jpg")
    assert scene["units"] == "meters" and scene["up"] == "y" and scene["floorY"] == 0.0
    assert scene["size"] == [4.0, 3.0, 5.0] and scene["world"]["transform"]["scale"] == 1.0
    sc.write_json_atomic(tmp_path / "scene.json", scene)
    assert json.loads((tmp_path / "scene.json").read_text())["reality"] == "reality.json"
    assert not list(tmp_path.glob(".tmp-*"))


def test_build_scene_floor_unknown_is_null():
    s = sc.build_scene(world_file="w.spz", splat_count=1, bounds={"min": [0, 0, 0], "max": [1, 1, 1]}, floor_found=False,
                       spawn={}, scale={}, capture={})
    assert s["floorY"] is None and s["floorFound"] is False


@pytest.mark.parametrize("bounds,count", [({"min": [0, 0, 0], "max": [0, 1, 1]}, 5),
                                          ({"min": [0, 0, 0], "max": [1, float("nan"), 1]}, 5),
                                          ({"min": [0, 0, 0], "max": [1, 1, 1]}, 0)])
def test_build_scene_rejects_unplaceable(bounds, count):
    with pytest.raises(ValueError):
        sc.build_scene(world_file="w.spz", splat_count=count, bounds=bounds, floor_found=True, spawn={}, scale={}, capture={})
