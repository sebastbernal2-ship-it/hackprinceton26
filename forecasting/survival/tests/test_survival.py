"""Synthetic-data tests only; never reads the CoStar kit."""
import json
from datetime import date

import numpy as np
import pandas as pd
import pytest

from forecasting.survival import metrics as M
from forecasting.survival.data import build_spells, spell_from_records, split_by_start_year
from forecasting.survival.train import run

ASOF = date(2026, 11, 9)


def occ(frm="2018-01-01T12:00:00-05:00", to=None, reason=0, **kw):
    r = {"propertyId": 1, "fromDate": frm, "toDate": to, "expirationReason": reason, "leaseType": 1, "tenantLocationId": 5,
         "spaces": [{"squareFeetOccupied": 1000.0}]}
    r.update(kw)
    return r


CO = {"id": 5, "numEmployees": 10, "businessStatus": 2, "profile": {"industryType": 17}}
PROP = {"id": 1, "propertyType": 5, "buildingClass": 1, "primaryAddress": {"researchMarketId": 14}}


def test_outcome_coding():
    f = lambda **k: spell_from_records(occ(**k), CO, PROP, ASOF)
    assert f(to="2020-01-01T12:00:00-05:00", reason=4)["etype"] == 1
    assert f(to="2020-01-01T12:00:00-05:00", reason=10)["etype"] == 2  # unknown new address is NOT failure
    assert f(to="2020-01-01T12:00:00-05:00", reason=7)["etype"] == 2
    assert f()["etype"] == 0
    assert f(to="2027-06-30T12:00:00-05:00", reason=4)["etype"] == 0  # future end is not an observation
    assert f(frm="2011-12-31T12:00:00-05:00") is None
    assert f(frm="2027-01-01T12:00:00-05:00") is None
    assert "businessStatus" not in f() and "business_status" not in f()


def test_build_spells_filters_and_joins(tmp_path):
    w = lambda n, rows: (tmp_path / n).write_text("\n".join(json.dumps(r) for r in rows))
    w("location-occupancy.jsonl", [occ(to="2020-01-01T12:00:00-05:00", reason=4), occ(tenantLocationId=6), occ(tenantLocationId=None), occ(propertyId=9)])
    w("company-detail.jsonl", [CO, {"id": 6, "profile": {"industryType": 12}}])
    w("commercial-property.jsonl", [PROP])
    df = build_spells(tmp_path, ASOF)
    assert len(df) == 1 and df.etype.iloc[0] == 1 and df.market.iloc[0] == "Houston"


def test_split_by_start_year():
    df = pd.DataFrame({"start_year": [2011, 2012, 2020, 2021, 2023, 2024, 2026]})
    s = split_by_start_year(df)
    assert [len(s[k]) for k in ("train", "val", "test")] == [2, 2, 2]


def test_aj_cif_no_competing_equals_km_complement():
    t = np.array([1.0, 2.0, 3.0, 4.0])
    e = np.array([1, 0, 1, 0])
    assert M.aj_cif(t, e, 3.5) == pytest.approx(1 - (3 / 4) * (1 / 2))  # KM: 1-(3/4)(1-1/2)
    # competing event removes risk without counting as failure
    assert M.aj_cif(np.array([1.0, 2.0]), np.array([2, 1]), 5) == pytest.approx(0.5 * 1.0)


def test_c_index_and_horizon_support():
    t = np.array([1.0, 2, 3, 4, 5, 6])
    e = np.array([1, 1, 1, 1, 0, 0])
    assert M.c_index(t, e, -t) == pytest.approx(1.0)
    assert not M.horizon_support(t, e, 2)[0]
    assert M.horizon_support(t, e, 4, min_events=4)[0]


def synth(n=2500, signal=1.5, seed=0):
    rng = np.random.default_rng(seed)
    sy = rng.integers(2012, 2027, n)
    la = rng.integers(0, 2, n)
    base = 0.25 * np.exp(signal * la)
    tf = rng.exponential(1 / base)
    to = rng.exponential(1 / 0.3, n)
    tc = (2026.85 - sy) * rng.uniform(0.5, 1.0, n)
    t = np.minimum.reduce([tf, to, tc])
    e = np.where(t == tf, 1, np.where(t == to, 2, 0))
    return pd.DataFrame({"propertyId": rng.integers(0, n // 2, n), "start_year": sy, "years": np.maximum(t, 1e-3), "etype": e,
                         "market_id": np.where(la == 1, 20, 14), "market": np.where(la == 1, "Los Angeles", "Houston"),
                         "property_type": rng.choice([5, 11, 6], n), "building_class": rng.choice([1, 2, 3], n),
                         "sqft": rng.uniform(500, 5000, n), "lease_type": 1, "employees": rng.integers(1, 50, n).astype(float)})


def test_signal_passes_gate_and_emits_valid_labelled_cards(tmp_path):
    r = run(tmp_path / "nokit", tmp_path / "out", asof=ASOF, n_boot=60, n_boot_cards=30, spells=synth(signal=1.5))
    assert r["gate"]["passed"], r["gate"]
    cards = json.loads((tmp_path / "out" / "cards.json").read_text())
    assert cards and r["cards_emitted"] == len(cards)
    from app.models import ProjectionCard  # authoritative contract validator
    for c in cards:
        pc = ProjectionCard(**c)
        assert not pc.hidden and pc.status == "estimated" and pc.lower <= pc.point <= pc.upper
        assert "exploratory descriptive market prior" in c["scenario"] and "per-site" in c["scenario"]
    m = json.loads((tmp_path / "out" / "manifest.json").read_text())
    assert len(m["manifest_hash"]) == 64


def test_no_signal_emits_nothing_and_removes_stale_cards(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "cards.json").write_text("[]")  # stale
    r = run(tmp_path / "nokit", out, asof=ASOF, n_boot=60, n_boot_cards=30, spells=synth(signal=0.0, seed=3))
    assert not r["gate"]["passed"] and r["cards_emitted"] == 0
    assert not (out / "cards.json").exists()


def test_manifest_hash_is_deterministic(tmp_path):
    h = [run(tmp_path / "k", tmp_path / f"o{i}", asof=ASOF, n_boot=20, n_boot_cards=10, spells=synth(n=800))["manifest_hash"] for i in range(2)]
    assert h[0] == h[1]
