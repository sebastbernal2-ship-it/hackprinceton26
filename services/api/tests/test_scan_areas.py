import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from triage.reconcile import scan_areas as S  # noqa: E402


def rec(model, rooms):
    return {"propertyId": "1", "modelId": model, "fetchedAt": "t", "model": {"rooms": rooms}}


def room(area, label=None):
    return {"dimensions": {"areaFloor": area}, "classifications": [{"label": label}] if label else []}


def test_sums_room_areas_and_excludes_void_rooms(tmp_path):
    (tmp_path / "1.json").write_text(json.dumps(rec("M1", [room(400), room(350.4, "Kitchen"), room(9999, "Void")])))
    out = S.build(tmp_path)
    assert out["M1"]["squareFeet"] == 750 and out["M1"]["status"] == "observed"


def test_models_without_room_areas_are_left_out_not_zero(tmp_path):
    (tmp_path / "1.json").write_text(json.dumps(rec("M1", [])))
    (tmp_path / "2.json").write_text(json.dumps(rec("M2", [room(None), {"dimensions": {}}])))
    (tmp_path / "3.json").write_text("not json")
    assert S.build(tmp_path) == {}
