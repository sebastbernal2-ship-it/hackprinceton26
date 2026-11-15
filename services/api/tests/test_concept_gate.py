"""Concept gate: a food brief only ever shows spaces that can host it; a non-food brief is not restricted."""
import pytest
from fastapi.testclient import TestClient

from app import concept_gate, picker, pipeline
from app.main import app
from app.models import FactorCard, Match, SpaceFacts
from tests.test_api import FIX

client = TestClient(app)
EXCLUDED = {"GeneralRetail_Bank": "Bank branch", "GeneralRetail_DayCareCenter": "Day care", "GeneralRetail_AutoRepair": "Auto repair",
            "GeneralRetail_ConvenienceStore": "Convenience store", "GeneralRetail_Supermarket": "Supermarket", "Office_Medical": "Medical office",
            "Industrial_Warehouse": "Warehouse", "MultiFamily_Apartments": "Multifamily", "Hospitality_Hotel": "Hotel",
            "Specialty_SelfStorage": "Self-storage", "Specialty_Schools": "School", "Office_OfficeBuilding": "Office"}


def site(i, subtype="GeneralRetail_Storefront", ptype="GeneralRetail", space=1200, building=3000, rng=None, spells=0, src="listing"):
    cards = [FactorCard(factorId="restaurant_lineage", status="observed", value=f"{spells} food tenancy spells", unit="", source="s",
                        recordId="", asOf="", geography="", limitations="")] if spells else []
    return Match(listingId=i, address=f"{i} Main St", detail="", city="Houston, TX", blurb="", photo="", squareFeet=building, spaceSquareFeet=space,
                 spaceSource=src if space else None, tourId="T", evidenceReadiness=10, propertyType=ptype, propertySubtype=subtype,
                 suiteRangeSqft=rng, facts=SpaceFacts(photos=[], property=[], location=[]), factors=cards)


def shown(answer, pool, limit=10):
    prof, _ = pipeline.profile_from_brief([type("E", (), {"answer": answer})], pool)
    gate: dict = {}
    top, *_ = pipeline.shortlist(pool, prof, limit, answer, gate)
    return top, gate["summary"]


@pytest.mark.parametrize("subtype,label", sorted(EXCLUDED.items()))
def test_each_irrelevant_type_is_excluded_from_a_cafe_brief_and_counted(subtype, label):
    ptype = subtype.split("_")[0]
    pool = [site(1), site(2, subtype=subtype, ptype=ptype)]
    top, g = shown("I want to open a cafe in Houston, 800 to 1,500 sq ft", pool)
    assert [m.listingId for m in top] == [1]
    assert g["excluded"] == 1 and g["total"] == 2 and g["groups"][0]["type"] == label
    assert g["groups"][0]["sites"][0]["listingId"] == 2


def test_land_and_unknown_property_types_are_excluded_but_missing_type_data_is_not_judged():
    pool = [site(1, subtype="", ptype="Land"), site(2, subtype="", ptype="Office"), site(3, subtype="", ptype=""), site(4, subtype="", ptype="GeneralRetail")]
    top, g = shown("a coffee shop in Houston", pool)
    assert sorted(m.listingId for m in top) == [3, 4] and g["excluded"] == 2


def test_prior_food_service_rescues_only_a_site_with_no_recorded_subtype():
    pool = [site(1, subtype="", ptype="Office", spells=2), site(2, subtype="GeneralRetail_Bank", spells=5)]
    top, _ = shown("a cafe in Houston", pool)
    assert [m.listingId for m in top] == [1]


def test_suite_too_small_or_absurdly_large_is_excluded_and_the_building_is_not_used_when_a_suite_is_known():
    pool = [site(1, space=1000, building=24000), site(2, space=24000, building=24000), site(3, space=120, building=500),
            site(4, space=None, building=24000), site(5, space=None, building=1400)]
    top, g = shown("a cafe for 30 seats in Houston", pool)
    assert sorted(m.listingId for m in top) == [1, 5]  # 24,000 sq ft suite, 120 sq ft suite, and an unknown suite in a 24,000 sq ft building are out
    assert {e["listingId"] for e in g["groups"][0]["sites"]} == {2, 3, 4} and g["groups"][0]["type"] == "Wrong size"


def test_seats_set_the_floor_and_listed_ranges_use_the_right_suite():
    lo, hi = concept_gate.window(pipeline.profile_from_brief([type("E", (), {"answer": "cafe with 40 seats"})], [])[0], "cafe")
    assert lo == pytest.approx(40 * 15 / 0.7)
    r = site(1, space=150, rng=[150, 35000])  # a listing that spans 150 to 35,000: the suite tested is one inside the cafe window, and says so
    top, _ = shown("a cafe with 30 seats in Houston", [r])
    assert top and 600 < top[0].spaceSquareFeet < 4000 and any("confirm with the broker" in x for x in top[0].pick["reasons"])


def test_non_food_brief_is_not_restricted_to_cafes():
    pool = [site(1), site(2, subtype="Office_OfficeBuilding", ptype="Office", space=5000, building=20000), site(3, subtype="Industrial_Warehouse", ptype="Industrial")]
    top, g = shown("office for 20 people in Houston", pool)
    assert g is None and sorted(m.listingId for m in top) == [1, 2, 3]


def test_cafe_scans_are_always_offered_for_a_cafe_brief_even_when_the_estimated_area_fails(tmp_path, monkeypatch):
    for s in picker.CAFE_SCANS:
        (tmp_path / f"assets_{s['tourId']}" / "walk").mkdir(parents=True)
        (tmp_path / f"assets_{s['tourId']}" / "walk" / "meta.json").write_text("{}")
    monkeypatch.setenv("SCAN_ASSETS_DIR", str(tmp_path))
    pool = [site(1, space=5000)] + picker.cafe_candidates()
    top, _ = shown("a cafe of 5,000 to 6,000 sq ft in Houston or Los Angeles", pool)
    assert {m.listingId for m in top} >= picker.CAFE_IDS
    assert any(r.startswith("Does not meet") for m in top if m.listingId in picker.CAFE_IDS for r in m.pick["reasons"])


@pytest.mark.parametrize("text,concept", [("taqueria", "restaurant"), ("a bakery", "cafe"), ("cocktail bar", "restaurant"),
                                          ("pizzeria for 40", "restaurant"), ("coffee shop", "cafe"), ("office for 20 people", None)])
def test_concept_words(text, concept):
    assert picker.detect_concept(text) == concept


def test_api_reports_the_gate_and_never_returns_an_irrelevant_type(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))
    b = {"brief": [{"question": "q", "answer": "open a cafe in Springfield"}], "limit": 10}
    d = client.post("/api/matches", json=b).json()
    assert d["conceptGate"]["concept"] == "cafe" and d["conceptGate"]["total"] >= len(d["matches"])
    assert all(m["propertySubtype"] not in EXCLUDED for m in d["matches"])
    n = client.post("/api/matches", json={"brief": [{"question": "q", "answer": "office for 20 people"}]}).json()
    assert n["conceptGate"] is None
