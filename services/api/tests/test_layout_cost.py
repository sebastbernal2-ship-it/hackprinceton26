"""POST /api/layout-cost: cost of the equipment actually placed in the layout. Unpriced pieces are listed, never $0."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
KIT = [{"assetId": "espresso_machine_2group", "quantity": 1}, {"assetId": "coffee_grinder_on_demand", "quantity": 1},
       {"assetId": "tortilla_warmer_press", "quantity": 1}]


def post(**kw):
    return client.post("/api/layout-cost", json=kw)


def test_priced_pieces_use_catalog_prices_and_unpriced_are_listed_not_zero():
    d = post(items=KIT).json()
    assert [l["assetId"] for l in d["lines"]] == ["espresso_machine_2group", "coffee_grinder_on_demand"]
    assert d["lines"][0]["low"] == d["lines"][0]["high"] == 3549.0  # observed list price x 1
    assert [u["assetId"] for u in d["unpriced"]] == ["tortilla_warmer_press"]
    assert d["equipment"]["low"] == 3549.0 + 599.0
    assert d["totalStatus"].startswith("partial")


def test_quantity_changes_the_cost():
    one = post(items=[{"assetId": "espresso_machine_2group", "quantity": 1}]).json()
    two = post(items=[{"assetId": "espresso_machine_2group", "quantity": 2}]).json()
    assert two["equipment"]["low"] == 2 * one["equipment"]["low"]


def test_fitout_needs_an_area_and_is_unknown_without_one():
    assert post(items=KIT).json()["fitout"] is None
    f = post(items=KIT, sqft=1000).json()["fitout"]
    assert f["status"] == "estimated" and f["low"] < f["high"]


def test_p_over_budget_depends_on_budget_and_needs_a_budget():
    assert post(items=KIT, sqft=1000).json()["pOverBudget"] is None
    tight = post(items=KIT, sqft=1000, budget=50_000).json()["pOverBudget"]
    loose = post(items=KIT, sqft=1000, budget=1_000_000).json()["pOverBudget"]
    assert tight > loose and loose == 0.0


def test_unknown_asset_and_empty_layout():
    assert post(items=[{"assetId": "nope", "quantity": 1}]).json()["unpriced"][0]["assetId"] == "nope"
    d = post(items=[]).json()
    assert d["equipment"] is None and d["totalStatus"] == "unknown"
