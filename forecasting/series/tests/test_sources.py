import json

import pytest

from forecasting.series import published, sources as S


def test_monthly_array_refuses_gaps():
    with pytest.raises(ValueError):
        S.to_monthly_array({"2020-01": 1.0, "2020-03": 2.0})
    m, v = S.to_monthly_array({"2019-12": 1.0, "2020-01": 2.0})
    assert m == ["2019-12", "2020-01"] and v == [1.0, 2.0]


def test_drop_incomplete_tail():
    months = [f"2020-{i:02d}" for i in range(1, 9)]
    m, v, dropped = S.drop_incomplete_tail(months, [100.0] * 7 + [40.0])
    assert dropped == "2020-08" and len(v) == 7
    assert S.drop_incomplete_tail(months, [100.0] * 8)[2] is None


def test_parse_bls_skips_annual_avg():
    rows = [{"year": "2024", "period": "M01", "value": "10.5"}, {"year": "2024", "period": "M13", "value": "9"}]
    assert S.parse_bls(rows) == {"2024-01": 10.5}


def test_climate_missing_days_not_zero():
    days = [f"2020-01-{d:02d}" for d in range(1, 31)] + ["2020-02-01"]
    temps = [10.0] * 30 + [None]
    assert S.parse_climate({"daily": {"time": days, "temperature_2m_mean": temps}}) == {"2020-01": 10.0}


def test_aadt_series_stops_at_gap():
    a = {"AADT_RPT_YEAR": 2025, "AADT_RPT_QTY": 100, "AADT_RPT_HIST_01_QTY": 90, "AADT_RPT_HIST_02_QTY": None,
         "AADT_RPT_HIST_03_QTY": 80}
    assert S.aadt_series(a) == (2024, [90.0, 100.0])


def test_houston_monthly(tmp_path):
    f = tmp_path / "h.csv"
    f.write_text("Occurrence Date,Offense Count\n2026-01-02,1\n2026-01-09,2\n2026-02-01,1\n")
    assert S.houston_monthly(f) == (["2026-01", "2026-02"], [3, 1])


def test_published_cards_require_citation():
    e = published.SOURCES[0] | {"retrieved": "2026-01-01"}
    c = published.published_cards([e])[0]
    from forecasting.series.cards import finalize
    out = finalize(c)
    assert out["kind"] == "published" and out["status"] == "unknown" and out["point"] is None
    assert out["citation"]["recordId"] == e["url"]


def test_config_file_shape():
    cfg = json.loads(published.CONFIG.read_text())["sources"]
    assert len(cfg) == 5
    for e in cfg:
        assert e["url"].startswith("https://") and e["retrieved"] and e["horizon"] and e["httpStatus"] == 200
