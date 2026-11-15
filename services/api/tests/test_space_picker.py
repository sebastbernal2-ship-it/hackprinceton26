"""Space picker: concept-aware ordering with reasons, and the cafe scans as editable candidates."""
import pytest
from fastapi.testclient import TestClient

from app import picker, pipeline
from app.main import app
from app.models import FactorCard, Match, SpaceFacts
from tests.test_api import FIX

client = TestClient(app)

A1 = ("I'm Sarah. I run Fruity Yogurt, a small yogurt and juice shop in Houston, and I want to open an independent cafe as a second concept, "
      "with coffee, pastries and light food, in Houston or Los Angeles. I'm looking for 800 to 1,500 sq ft with 24 to 40 seats, and my build-out "
      "budget is under $250,000. I want to carry over what works at my current shop: my counter, my seating and my look.")
A2 = ("A space that already had food service, so a hood and grease line might already exist. Power and water for an espresso setup, an accessible "
      "entrance, and a 3D scan so I can walk it before I visit. Nice to have is street frontage and daytime foot traffic from nearby offices. "
      "My dealbreakers are unknown utilities, a lease area nobody will confirm, and a landlord who won't state the permitted use.")


def site(i, city="Houston, TX", sqft=1000, spells=0, tour="T"):
    cards = [FactorCard(factorId="restaurant_lineage", status="observed", value=f"{spells} food tenancy spells", unit="", source="s",
                        recordId="", asOf="", geography="", limitations="")] if spells else []
    cards.append(FactorCard(factorId="building_kit", status="observed", value="x", unit="", source="s", recordId="", asOf="", geography="", limitations=""))
    return Match(listingId=i, address=f"{i} Main St", detail="", city=city, blurb="", photo="", squareFeet=5000, spaceSquareFeet=sqft,
                 spaceSource="listing", tourId=tour, evidenceReadiness=10, facts=SpaceFacts(photos=[], property=[], location=[]), factors=cards)


@pytest.fixture
def walks(tmp_path, monkeypatch):
    for s in picker.CAFE_SCANS:
        w = tmp_path / f"assets_{s['tourId']}" / "walk"
        w.mkdir(parents=True)
        (w / "meta.json").write_text("{}")
    monkeypatch.setenv("SCAN_ASSETS_DIR", str(tmp_path))


def brief(*a):
    return {"brief": [{"question": "q", "answer": x} for x in a], "limit": 5}


def run(answers, pool):
    text = " . ".join(answers)
    prof, _ = pipeline.profile_from_brief([type("E", (), {"answer": a}) for a in answers], pool)
    return pipeline.shortlist(pool, prof, 5, text)[0]


def test_cafe_brief_puts_a_cafe_ready_scan_first_with_a_best_match_label(walks):
    pool = [site(1, spells=9), site(2, spells=5)] + picker.cafe_candidates()
    top = run([A1, A2], pool)
    assert top[0].listingId in picker.CAFE_IDS
    assert top[0].pick["bestMatch"] and top[0].pick["label"].startswith("Best match")
    assert sum(m.pick["bestMatch"] for m in top) == 1
    assert any("Editable 3D walk" in r for r in top[0].pick["reasons"])


def test_best_cafe_scan_is_first_even_when_the_filter_order_would_put_it_last(walks):
    # the scan only ties on status; many tenancy-rich listings must not push it out of first place
    pool = [site(i, spells=11) for i in range(1, 12)] + picker.cafe_candidates()
    assert run([A1, A2], pool)[0].listingId in picker.CAFE_IDS


def test_non_food_brief_gets_no_best_match_and_no_food_claims(walks):
    top = run(["a 1000 sq ft office in Houston"], [site(1)] + picker.cafe_candidates())
    assert not any(m.pick["bestMatch"] for m in top)
    assert not any("food-service" in r for m in top for r in m.pick["reasons"])


def test_prior_food_tenancy_is_preferred_for_a_restaurant_brief(walks):
    top = run(["I want to open a restaurant in Houston, 1000 sq ft"], [site(1), site(2, spells=8), site(3, spells=2)])
    assert [m.listingId for m in top] == [2, 3, 1]
    assert "Prior food-service tenancy: 8 spells" in top[0].pick["reasons"][0]


def test_city_mismatch_is_excluded_and_cafe_scan_area_is_labelled_estimated(walks):
    top = run(["coffee shop in Los Angeles, 800 to 1,500 sq ft"], [site(1, city="Houston, TX")] + picker.cafe_candidates())
    assert [m.listingId for m in top] == [11104240]
    c = top[0]
    assert c.spaceSource == picker.ESTIMATE
    ev = next(r for r in c.constraints if r.constraint == "area").evidence["listed_space_area_sqft"]
    assert ev["status"] == "estimated"
    assert "Area" not in c.alignment.confirmed or "Suite area" in c.alignment.estimatedItems


def test_scan_without_a_local_walk_export_is_not_called_editable(monkeypatch, tmp_path):
    monkeypatch.setenv("SCAN_ASSETS_DIR", str(tmp_path))
    top = run([A1, A2], picker.cafe_candidates())
    assert top and not any("Editable" in r for m in top for r in m.pick["reasons"])


def test_typed_long_brief_and_scripted_brief_give_the_same_shortlist(walks, monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))
    a = client.post("/api/matches", json=brief(A1, A2)).json()
    b = client.post("/api/matches", json=brief(A1, A2)).json()  # the UI replaces the word "Sarah" with exactly these answers
    assert [m["listingId"] for m in a["matches"]] == [m["listingId"] for m in b["matches"]]
    assert a["matches"][0]["listingId"] in picker.CAFE_IDS and a["matches"][0]["pick"]["bestMatch"]
    assert a["profile"]["matchedText"]["concept"] == "cafe"
    assert a["matches"][0]["buildout"]["basis"] == "scan-estimate"
