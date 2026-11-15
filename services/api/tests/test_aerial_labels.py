import json
from pathlib import Path

LABELS = Path(__file__).resolve().parents[3] / "triage/aerial/labels.json"


def test_labels_are_counts_only():
    d = json.loads(LABELS.read_text())
    assert len(d["labels"]) >= 15
    for v in d["labels"].values():
        assert set(v) <= {"vehicles", "rooftop_units"}
        assert all(x is None or (isinstance(x, int) and x >= 0) for x in v.values())
