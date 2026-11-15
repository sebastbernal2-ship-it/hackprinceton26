"""GET /api/property/{id}/business-peers: precomputed results, live concept path, fixture (demo) path, absent artifacts."""
import importlib.util
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from app import business_routes, loader  # noqa: E402
from app.main import app  # noqa: E402
from forecasting.peers import build  # noqa: E402

spec = importlib.util.spec_from_file_location("synth_kit", ROOT / "forecasting/peers/tests/synth_kit.py")
synth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(synth)

client = TestClient(app)
BAYOU = 8035301
FX = json.loads((ROOT / "services/api/app/demo_sites/bayou_cafe.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("biz")
    kit = synth.write_kit(tmp / "kit")
    (tmp / "scans.json").write_text(json.dumps({"scans": [{"listingId": -2, "city": "Houston, TX", "name": "y"}, {"listingId": BAYOU, "city": "Houston, TX", "name": "Bayou"}]}))
    (tmp / "cand.csv").write_text("property_id,latitude,longitude,city\n1005,29.71,-95.5,Houston\n")
    out = tmp / "out"
    build.build_all(kit, out, tmp / "cand.csv", tmp / "scans.json", [FX], n_configs=4, reps=20)
    return out


@pytest.fixture
def biz(built, monkeypatch):
    monkeypatch.setenv("BUSINESS_DIR", str(built))
    business_routes._CACHE.clear()
    return built


def test_candidate_result_shape_and_labels(biz):
    r = client.get("/api/property/1005/business-peers")
    assert r.status_code == 200
    j = r.json()
    assert j["listingId"] == 1005 and j["dataAvailable"] and j["demo"] is False and j["concept"] == "cafe"
    k = j["knn"]
    assert k["status"] == "estimated" and k["neighbours"] and k["nNeighbours"] == len(k["neighbours"])
    for h in ("1", "2", "3", "5"):
        s = k["survival"][h]
        assert s["low"] <= s["value"] <= s["high"] or s["value"] is None
    n0 = k["neighbours"][0]
    assert set(n0) >= {"id", "distanceMi", "sameKind", "outcome", "kind", "relation", "weight", "demo"} and "name" not in n0
    assert k["evaluation"]["plainly"] and "not better than the same-market prior" in j["notice"]
    nb = j["neighbourhood"]
    assert nb["index"] is not None and nb["label"].endswith("NOT a forecast.") and isinstance(nb["adjacentCompetitor"], bool) and nb["drivers"]
    assert "observed" in j["labels"]["neighbours"] and j["coverage"]["kitBuildingsWithin1mi"] >= 0


def test_no_company_names_anywhere(biz):
    body = client.get("/api/property/1005/business-peers").text
    for word in ("Bean Cafe", "Corner Coffee", "Rose Bakery", "Steak House"):
        assert word not in body


def test_scan_without_coordinates_gets_market_prior_only(biz):
    j = client.get("/api/property/-2/business-peers").json()
    assert j["knn"]["mode"] == "market_prior_only" and j["knn"]["neighbours"] == [] and j["neighbourhood"] is None and j["site"]["lat"] is None


def test_live_concept_path_and_validation(biz):
    j = client.get("/api/property/1005/business-peers?concept=restaurant").json()
    assert j["concept"] == "restaurant" and j["neighbourhood"]["concept"] == "restaurant"
    assert client.get("/api/property/1005/business-peers?concept=sushi").status_code == 422


def test_bayou_fixture_is_demo_labelled_with_artifacts(biz):
    j = client.get(f"/api/property/{BAYOU}/business-peers").json()
    assert j["demo"] is True and j["demoNote"].startswith("DEMO DATA") and j["knn"]["status"] == "demo"
    demos = [n for n in j["knn"]["neighbours"] if n["demo"]]
    assert len(demos) >= 1 and j["site"]["lat"] == pytest.approx(FX["meta"]["coordinates"]["lat"])
    assert j["neighbourhood"]["status"] == "demo" and j["neighbourhood"]["adjacentCompetitor"] is False
    assert all(n["distanceMi"] <= 1.0 for n in j["neighbourhood"]["nearbyFood"] if n["demo"])  # consistent with the fixture's 9 competitors within 1 mi
    assert sum(1 for n in j["neighbourhood"]["nearbyFood"] if n["demo"]) == len(FX["peers"]["spells"]) == FX["market"]["competition"]["count1mi"]


def test_bayou_fixture_still_answers_without_artifacts(tmp_path, monkeypatch):
    monkeypatch.setenv("BUSINESS_DIR", str(tmp_path / "none"))
    business_routes._CACHE.clear()
    j = client.get(f"/api/property/{BAYOU}/business-peers").json()
    assert j["demo"] is True and all(n["demo"] for n in j["knn"]["neighbours"]) and j["knn"]["evaluation"] is None
    assert j["neighbourhood"]["index"] is not None


def test_unknown_listing_404_and_known_without_artifacts_503(tmp_path, monkeypatch):
    monkeypatch.setenv("BUSINESS_DIR", str(tmp_path / "none"))
    business_routes._CACHE.clear()
    assert client.get("/api/property/123/business-peers").status_code == 404
    class M:  # a listing the pool knows, with no business artifacts built
        listingId = 123
    monkeypatch.setattr(loader, "load_matches", lambda *a, **k: [M()])
    assert client.get("/api/property/123/business-peers").status_code == 503
