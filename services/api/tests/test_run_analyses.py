"""Every analysis runs for every site the picker can show: candidates and cafe scans. Where a real run cannot happen the result is
a labelled DEMO ESTIMATE (status estimated/derived), never a 404, never 'not run', never observed."""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from app import analyses, demo_fixture, loader, picker  # noqa: E402
from app.main import app  # noqa: E402
from inspection.demo import build_demo  # noqa: E402
from inspection.schema import validate_finding  # noqa: E402

client = TestClient(app)
LINKED, UNLINKED = 8035301, -2
SCANS = {s["listingId"]: s for s in picker.CAFE_SCANS}


@pytest.fixture
def world(tmp_path, monkeypatch):
    """A tiny data world: the two cafe scans (one linked to a CoStar id, one not), one real candidate with a triage row, a walk export."""
    scan = tmp_path / "scans"
    for tour, top in (("JAnuRsaVo9M", 3.1), ("xVKH13z5MJ8", 3.7)):
        (scan / f"assets_{tour}" / "walk").mkdir(parents=True)
        (scan / f"assets_{tour}" / "walk" / "meta.json").write_text(json.dumps(
            {"bbox": [[-4, -4, -0.1], [3, 4, top]], "pieces": [{"kind": "wardrobe"}, {"kind": "table"}, {"kind": "table"}]}))
    cafes = [m for m in picker.cafe_candidates() if m.listingId in (LINKED, UNLINKED)]
    cand = cafes[0].model_copy(update={"listingId": 555, "city": "Houston, TX", "tourId": "", "spaceSquareFeet": 3000, "spaceSource": "listing", "detail": "Candidate"})
    pool = {m.listingId: m for m in cafes + [cand]}
    derived = tmp_path / "derived"
    (derived / "triage").mkdir(parents=True)
    (derived / "lineage").mkdir()
    (derived / "structure").mkdir()
    blank = {"field": "clear_height_ft", "status": "blank-unfillable", "costarValue": None, "scanValue": None, "value": None, "valueStatus": "unknown", "scope": "unknown", "confidence": "none", "evidenceRefs": [], "rule": "r", "reviewScore": 5}
    unver = {**blank, "field": "floors", "status": "unverified", "costarValue": 2, "valueStatus": "observed"}
    (derived / "triage" / "results.json").write_text(json.dumps([{"listingId": "555", "hasScan": False, "hasAerial": False, "scope": "suite", "fields": [blank, unver]}]))
    (derived / "lineage" / "presence.json").write_text(json.dumps({"555": {"radii": {"0.5mi": {"radiusMiles": 0.5, "kitBuildingsInRadius": 6, "dayShare": 0.2, "day": {"workers": 100}, "night": {"nightPopulation": {"low": 1, "expected": 2, "high": 3}}}}}}))
    (derived / "lineage" / "lineage.json").write_text("{}")
    (derived / "lineage" / "summary.json").write_text(json.dumps({"marketPrior": {"label": "prior"}}))
    (derived / "structure" / "properties.json").write_text("{}")
    for k, v in {"DERIVED_DIR": derived, "TRIAGE_DERIVED_DIR": derived / "triage", "LINEAGE_DIR": derived / "lineage", "STRUCTURE_DIR": derived / "structure",
                 "AERIAL_DIR": derived / "aerial", "SCAN_ASSETS_DIR": scan}.items():
        monkeypatch.setenv(k, str(v))
    monkeypatch.delenv("INSPECTION_DIR", raising=False)
    monkeypatch.setattr(analyses, "_match", lambda lid: pool.get(lid))
    monkeypatch.setattr(loader, "load_matches", lambda *a, **k: list(pool.values()))
    monkeypatch.setattr(analyses, "_kit_record", lambda pid: None)  # no CoStar kit in tests: a linked scan then falls back to metro-only
    monkeypatch.setattr(analyses, "_kit_sites", lambda lid: None)
    monkeypatch.setattr(demo_fixture, "get", lambda *a, **k: None)  # these tests cover the generated path; the hand-authored fixture has its own tests
    analyses._BIG.clear()
    return derived


def test_inspection_runs_lazily_for_a_scan_and_is_cached_on_disk(world):
    r = client.get(f"/api/property/{LINKED}/inspection").json()
    assert r["mode"] == "demo" and "No inspection" not in r["notice"] and "not been run" not in r["notice"]
    assert r["notice"].startswith("DEMO ESTIMATE") and len(r["findings"]) >= 8
    assert all(not validate_finding(f) for f in r["findings"])
    titles = " ".join(f["title"].lower() for f in r["findings"])
    for word in ("hood", "restroom", "ada", "sprinkler", "electrical", "floor", "ceiling", "egress"):
        assert word in titles
    assert all(f["status"] in ("derived", "estimated") and f["confidenceLabel"] in ("low", "medium", "high") for f in r["findings"])
    assert all(f["description"].startswith(("DEMO ESTIMATE", "DERIVED")) for f in r["findings"])
    assert (world / "inspection" / f"{LINKED}.json").is_file()
    ceil = next(f for f in r["findings"] if f["id"] == "run-ceiling")
    assert ceil["status"] == "derived" and "3.1 m" in ceil["title"]  # walk bbox top (3.1) above the floor plane, not a constant


def test_inspection_for_a_site_the_picker_cannot_show_is_a_plain_none(world):
    r = client.get("/api/property/999/inspection").json()
    assert r["mode"] == "none" and r["findings"] == [] and "not been run" not in r["notice"]


def test_inspection_dir_written_file_wins_over_the_demo(world, tmp_path, monkeypatch):
    d = tmp_path / "insp"
    d.mkdir()
    monkeypatch.setenv("INSPECTION_DIR", str(d))
    (d / f"{LINKED}.json").write_text(json.dumps({"findings": [], "mode": "fixture", "notice": "x"}))
    assert client.get(f"/api/property/{LINKED}/inspection").json()["mode"] == "fixture"


def test_demo_inspection_uses_what_is_known():
    facts = {"name": "X", "sqft": 3000, "hasScan": True, "foodSpells": 2, "yearBuilt": 1960, "hasSprinklers": False, "ceilingM": 2.4, "rooftopUnits": 3,
             "restrooms": 2, "restroomsBasis": "scan"}
    by = {f["id"]: f for f in build_demo(facts)["findings"]}
    assert "likely present" in by["run-hood"]["title"] and "2 past food" in by["run-hood"]["description"]
    assert by["run-ceiling"]["severity"] == "medium"  # 2.4 m is under the 2.7 m hood rule of thumb
    assert by["run-sprinklers"]["status"] == "derived" and by["run-electrical"]["severity"] == "medium"
    assert by["run-restrooms"]["status"] == "derived" and by["run-hvac"]["status"] == "derived"
    assert "two exits" in by["run-egress"]["title"]
    empty = {f["id"]: f for f in build_demo({})["findings"]}
    assert all(f["status"] == "estimated" and f["description"].startswith("DEMO ESTIMATE") for f in empty.values())


@pytest.mark.parametrize("lid", [LINKED, UNLINKED])
def test_scan_only_sites_answer_every_analysis_with_200_and_demo_labels(world, lid):
    for path in (f"triage/property/{lid}", f"aerial/{lid}", f"structure/{lid}", f"structure/{lid}/scenarios", f"lineage/{lid}", f"presence/{lid}"):
        r = client.get(f"/api/{path}")
        assert r.status_code == 200, path
    tri = client.get(f"/api/triage/property/{lid}").json()
    assert tri["demo"] and {f["field"] for f in tri["fields"]} >= {"clear_height_ft", "area_sqft", "restroom_count", "kitchen_present"}
    for f in tri["fields"]:
        assert f["status"] == "filled" and f["valueStatus"] in ("derived", "estimated") and f["value"] is not None
        assert f["valueStatus"] != "derived" or f["note"].startswith("Derived") or f["note"].startswith("DEMO"), f
        if f["valueStatus"] == "estimated":
            assert f["note"].startswith("DEMO ESTIMATE")
    h = next(f for f in tri["fields"] if f["field"] == "clear_height_ft")
    assert h["valueStatus"] == "derived" and 10 < h["value"] < 13  # from the walk bbox, not a constant
    aer = client.get(f"/api/aerial/{lid}").json()
    assert aer["demo"] and all(aer[k]["status"] == "estimated" and aer[k]["rationale"].startswith("DEMO ESTIMATE") for k in ("vehicles", "rooftop_units", "parking_stalls"))
    st = client.get(f"/api/structure/{lid}").json()
    assert st["demo"] and st["demoNote"].startswith("DEMO ESTIMATE") and "yearBuilt" in st["screening"]["unknowns"]
    lin = client.get(f"/api/lineage/{lid}").json()
    assert lin["foodHistoryInKit"] is False and lin["tenants"] == [] and lin["marketPrior"] and lin["note"]


def test_unlinked_scan_presence_is_the_metro_median_and_labelled(world):
    p = client.get(f"/api/presence/{UNLINKED}").json()
    assert p["demo"] and p["radii"]["0.5mi"]["day"]["workers"] == 100
    assert p["radii"]["0.5mi"]["day"]["status"].startswith("DEMO ESTIMATE")


def test_real_triage_blanks_are_filled_with_labelled_demo_values_and_keep_their_real_status(world):
    tri = client.get("/api/triage/property/555").json()
    for f in tri["fields"]:
        assert f["status"] == "filled" and f["valueStatus"] == "estimated" and f["note"].startswith("DEMO ESTIMATE") and f["realStatus"] in ("blank-unfillable", "unverified")
    assert next(f for f in tri["fields"] if f["field"] == "floors")["value"] == 2  # the CoStar value, not a constant
    assert client.get("/api/triage/property/999").status_code == 404


def test_run_site_summary_labels_and_warm_all_is_idempotent(world):
    first = analyses.warm_all()
    assert {r["listingId"] for r in first} == {LINKED, UNLINKED, 555}
    r = next(x for x in first if x["listingId"] == UNLINKED)
    assert r["aerial"] == r["structure"] == r["lineage"] == r["presence"] == "demo" and r["inspection"]["n"] >= 8
    before = {p: p.read_text() for p in world.rglob("*.json")}
    assert analyses.warm_all() == first
    assert {p: p.read_text() for p in world.rglob("*.json")} == before


def test_tool_prints_table(world, capsys, monkeypatch):
    sys.path.insert(0, str(ROOT / "tools"))
    import run_analyses
    rows = analyses.warm_all()
    # the tool imports the package under its uvicorn name (services.api.app), a second module instance: hand it this world's rows
    monkeypatch.setattr(run_analyses.analyses, "pool_ids", lambda: [r["listingId"] for r in rows])
    monkeypatch.setattr(run_analyses.analyses, "warm_all", lambda **k: rows)
    assert run_analyses.main(["--quiet"]) == 0
    out = capsys.readouterr().out
    assert "inspection" in out and str(LINKED) in out and "presence" in out and "3 sites" in out
