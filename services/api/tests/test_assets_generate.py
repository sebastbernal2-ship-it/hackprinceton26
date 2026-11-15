import httpx
import pytest
from fastapi.testclient import TestClient

from app import assets_generate_routes as gen
from app import assets_routes
from app.main import app
from assets.generate import draft, parse_length, svg_illustration
from assets.models import polygon_area
from assets.store import Store


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / "assets" / "library").mkdir(parents=True)
    monkeypatch.setattr(assets_routes, "STORE", Store(tmp_path / "assets"))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    return TestClient(app)


@pytest.mark.parametrize("text,cat,ref", [
    ("espresso machine", "other", "espresso_machine_2group"),
    ("pastry display case", "freezer_display", "bakery_display_case_48"),
    ("round marble table", "table", "table_2top_30"),
    ("bar stool", "seating", "chair_dining"),
    ("72 inch bakery table", "prep_table", "bakery_work_table_72"),
])
def test_rules_are_deterministic_and_valid(text, cat, ref):
    a, matched = draft(text, "generated")
    assert matched and a.category == cat and a.priceRef == ref
    assert a.dimsStatus == "estimated" and a.source == "generated" and a.status == "draft"
    assert a.clearanceBasis.startswith("ASSUMPTION")
    assert draft(text, "generated")[0] == a
    assert svg_illustration(a).startswith("<svg") and svg_illustration(a) == svg_illustration(a)


def test_round_table_and_length_and_unknown():
    a, _ = draft("round marble table", "generated")
    assert a.dims.w == a.dims.d == 0.9 and polygon_area(a.footprint) < 0.9 * 0.9 and len(a.footprint) == 17
    assert draft("72 inch bakery table", "generated")[0].dims.w == pytest.approx(1.8288)
    assert parse_length("48 cm thing") == 0.48 and parse_length("nothing") is None and parse_length("900 in") is None
    u, matched = draft("zorblax", "generated")
    assert not matched and u.priceRef is None and u.category == "other"


def test_generate_persists_lists_and_serves_svg(client):
    r = client.post("/api/assets/generate", json={"prompt": "espresso machine"})
    assert r.status_code == 201
    j = r.json()
    a = j["asset"]
    assert j["imageMode"] == "svg" and "OPENAI_API_KEY" in j["notice"] and "key" not in str(a).lower().replace("keyword", "")
    assert a["profileId"] == "generated" and a["priceRef"] == "espresso_machine_2group" and "Estimated demo price" in j["priceNote"]
    assert [x["assetId"] for x in client.get("/api/assets?profileId=generated").json()] == [a["assetId"]]
    img = client.get(f"/api/assets/{a['assetId']}/image")
    assert img.status_code == 200 and img.headers["content-type"] == "image/svg+xml" and img.text.startswith("<svg")
    again = client.post("/api/assets/generate", json={"prompt": "espresso machine"}).json()["asset"]
    assert again["assetId"] == a["assetId"] + "-2"


def test_prices_through_layout_cost(client):
    a = client.post("/api/assets/generate", json={"prompt": "pastry display case"}).json()["asset"]
    c = client.post("/api/layout-cost", json={"items": [{"assetId": a["priceRef"], "quantity": 1}]}).json()
    assert c["lines"][0]["status"] == "estimated" and c["lines"][0]["high"] > 0


@pytest.mark.parametrize("prompt", ["", "ab", "x" * 81, "bad\x00text"])
def test_bad_prompt_rejected(client, prompt):
    assert client.post("/api/assets/generate", json={"prompt": prompt}).status_code == 422


def test_unknown_item_is_unpriced_with_notice(client):
    j = client.post("/api/assets/generate", json={"prompt": "zorblax"}).json()
    assert j["asset"]["priceRef"] is None and "placeholder" in j["notice"] and j["priceNote"].startswith("No price")


def test_openai_success_and_failure_never_leak_key(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret-test")
    seen = {}

    def ok(url, json, headers, timeout):
        seen.update(json=json, auth=headers["Authorization"])
        import base64
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(b"RIFFfakewebp").decode()}]})
    monkeypatch.setattr(gen.httpx, "post", ok)
    j = client.post("/api/assets/generate", json={"prompt": "espresso machine"}).json()
    assert j["imageMode"] == "openai" and j["notice"] == ""
    img = client.get(f"/api/assets/{j['asset']['assetId']}/image")
    assert img.headers["content-type"] == "image/webp" and img.content == b"RIFFfakewebp"
    assert "sk-secret-test" not in str(j)

    monkeypatch.setattr(gen.httpx, "post", lambda *a, **k: httpx.Response(429, json={"error": {"code": "insufficient_quota", "message": "bad sk-secret-test"}}))
    f = client.post("/api/assets/generate", json={"prompt": "espresso machine"}).json()
    assert f["imageMode"] == "svg" and "429, insufficient_quota" in f["notice"] and "sk-secret" not in str(f)

    def boom(*a, **k):
        raise httpx.ConnectTimeout("sk-secret-test")
    monkeypatch.setattr(gen.httpx, "post", boom)
    t = client.post("/api/assets/generate", json={"prompt": "espresso machine"}).json()
    assert t["imageMode"] == "svg" and "ConnectTimeout" in t["notice"] and "sk-secret" not in str(t)

    opt_out = client.post("/api/assets/generate", json={"prompt": "espresso machine", "useImageModel": False}).json()
    assert opt_out["imageMode"] == "svg" and opt_out["notice"] == ""
