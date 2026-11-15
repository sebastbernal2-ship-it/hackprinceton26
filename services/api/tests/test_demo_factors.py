from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_demo_cards_filtered_by_model(tmp_path, monkeypatch):
    p = tmp_path / "cards.csv"
    p.write_text("property_id,factor_id,status,value,unit,source\n"
                 "AAAAAAAAAAA,traffic_access,observed,40826,vehicles/day,TxDOT\n"
                 "BBBBBBBBBBB,schools_education,derived,7,schools,NCES\n", encoding="utf-8")
    monkeypatch.setenv("DEMO_FACTOR_CARDS", str(p))
    d = client.get("/api/demo/AAAAAAAAAAA/factors").json()
    assert [c["factorId"] for c in d] == ["traffic_access"] and d[0]["status"] == "observed"


def test_missing_file_is_empty_and_bad_id_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_FACTOR_CARDS", str(tmp_path / "none.csv"))
    assert client.get("/api/demo/AAAAAAAAAAA/factors").json() == []
    assert client.get("/api/demo/bad..id/factors").status_code in (400, 404)
