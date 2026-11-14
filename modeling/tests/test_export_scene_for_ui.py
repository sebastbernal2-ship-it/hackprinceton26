import json
import math

import pytest

import export_scene_for_ui as ex

OBJECTS = {
    "floor_z": 0.5,
    "objects": [
        {"id": 3, "label": "Sofa", "layer": "furniture", "source": "pano+mesh", "confirmed": True,
         "room": {"label": "Living"}, "flags": ["x"],
         "box": {"centre": [2.0, 3.0, 0.9], "size_lwh_m": [2.0, 1.0, 0.8], "yaw_deg": 90.0,
                 "z_bottom": 0.0, "z_top": 0.8}},
        {"id": 4, "label": None, "layer": "furniture", "source": "mesh", "room": None,
         "box": {"centre": [0, 0, 0.5], "size_lwh_m": [1, 1, 1], "yaw_deg": 0}},
        {"id": 5, "label": "Bad", "box": {"centre": [0, 0, float("nan")], "size_lwh_m": [1, 1, 1], "yaw_deg": 0}},
        {"id": 6, "label": "Zero", "box": {"centre": [0, 0, 0], "size_lwh_m": [1, 0, 1], "yaw_deg": 0}},
        {"id": 7},
    ],
}

SCENE = {
    "empty_mesh": "empty_room.obj", "units": "metres", "up": "z", "floor_z": 0.5,
    "objects": [{"id": 1, "file": "objects/obj_001.obj", "kind": "box", "label": "Table", "layer": "furniture",
                 "source": "mesh", "position_xy": [1.0, 2.0], "floor_z": 0.5, "yaw_deg": 0.0,
                 "size_lwh_m": [1.2, 0.6, 0.7], "room": {"label": "Kitchen"}}],
}


def test_objects_json_conversion_and_skips():
    scene, skipped = ex.convert(OBJECTS)
    assert scene["schema"] == "tour_scene/1"
    assert [o["id"] for o in scene["objects"]] == [3, 4]
    assert {s[0] for s in skipped} == {5, 6, 7}
    sofa = scene["objects"][0]
    assert sofa["centre_m"] == [2.0, 3.0, 0.9]
    assert sofa["size_m"] == {"length": 2.0, "width": 1.0, "height": 0.8}
    assert sofa["room"] == "Living" and sofa["label_status"] == "estimated"
    assert sofa["z_bottom_m"] == 0.5 and sofa["z_top_m"] == 1.3


def test_unknown_label_stays_null():
    scene, _ = ex.convert(OBJECTS)
    o = scene["objects"][1]
    assert o["label"] is None and o["label_status"] == "unknown" and o["room"] is None


def test_yaw_rotates_bounds():
    scene, _ = ex.convert(OBJECTS)
    # sofa 2 x 1 yawed 90 deg about (2, 3): x extent 1, y extent 2 (plus object 4 at origin)
    b = scene["bounds"]
    assert b["max"][0] == pytest.approx(2.5) and b["max"][1] == pytest.approx(4.0)
    assert b["min"][0] == pytest.approx(-0.5) and b["min"][1] == pytest.approx(-0.5)


def test_scene_json_conversion_derives_centre_z_from_floor():
    scene, skipped = ex.convert(SCENE)
    assert skipped == []
    o = scene["objects"][0]
    assert o["centre_m"] == [1.0, 2.0, pytest.approx(0.85)]
    assert o["room"] == "Kitchen" and scene["floor_z"] == 0.5


def test_scene_without_floor_is_skipped_not_invented():
    d = json.loads(json.dumps(SCENE))
    del d["floor_z"]; del d["objects"][0]["floor_z"]
    scene, skipped = ex.convert(d)
    assert scene["objects"] == [] and scene["bounds"] is None and len(skipped) == 1


def test_bad_input_raises():
    with pytest.raises(ValueError):
        ex.convert({"nope": 1})


def test_cli_roundtrip(tmp_path):
    src, dst = tmp_path / "objects.json", tmp_path / "out.json"
    src.write_text(json.dumps(OBJECTS))
    assert ex.main([str(src), "-o", str(dst)]) == 0
    loaded = json.loads(dst.read_text())
    assert len(loaded["objects"]) == 2
    assert all(math.isfinite(v) for v in loaded["bounds"]["min"])
