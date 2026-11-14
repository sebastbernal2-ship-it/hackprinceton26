import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from finance import loan, model, nessie  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def simple(**kw):
    base = dict(seats=10, turns={"x": 1.0}, open_days_per_month=20, avg_check=(10, 10, 10), cogs_pct=(.3, .3, .3),
                labor_burden=0, fixed_labor_hours=0, labor_hours_per_cover=0, other_opex_fixed=0, other_opex_pct=0,
                rent_monthly=500, rent_status="estimated", utilities_monthly=(100, 100, 100), buildout=(0, 0, 0),
                ramp_start=1.0, equity=1000, loan_principal=0, pre_open_months=0, presence_index=0.5, presence_sd=0.0,
                seasonality_sd=0.0)
    base.update(kw)
    return model.Inputs(**base)


def test_amortization_hand_computed():
    # 120,000 at 12%/yr for 12 months: r=0.01, pmt = 120000*0.01/(1-1.01^-12) = 10661.85
    assert loan.payment(120_000, 0.12, 12) == pytest.approx(10661.85, abs=0.01)
    assert loan.payment(12_000, 0.0, 12) == 1000.0
    rows = loan.schedule(120_000, 0.12, 12)
    assert rows[0]["interest"] == pytest.approx(1200.0)          # 1% of 120,000
    assert rows[0]["principal"] == pytest.approx(9461.85, abs=0.01)
    assert rows[-1]["balance"] == pytest.approx(0.0, abs=1e-6)
    assert sum(r["interest"] for r in rows) == pytest.approx(12 * 10661.85 - 120_000, abs=0.2)


def test_deterministic_path_hand_computed():
    inp = simple()
    # sales 10 seats*1 turn*20 days*$10 = 2000; cogs 600; rent 500; util 100 -> 800/mo; 1000 + 36*800 = 29,800
    c = model._det(inp, model._loan_terms(inp), 0.0)
    assert c["sales"][0, 0] == 2000 and c["ebitda"][0, 0] == 800
    assert c["cash"][0, -1] == pytest.approx(29_800)


def test_unknown_blocks_not_zero():
    r = model.simulate(simple(rent_monthly=None))
    assert r["status"] == "blocked" and "rent_monthly" in r["unknownInputs"][0]
    assert model.simulate(simple(buildout=None))["status"] == "blocked"


def test_seed_deterministic_and_shortfall_direction():
    kw = dict(presence_sd=0.15, seasonality_sd=0.08, avg_check=(8, 10, 14))
    a = model.simulate(simple(**kw), seed=7, n=2000, sensitivity=False)
    b = model.simulate(simple(**kw), seed=7, n=2000, sensitivity=False)
    assert a["pCashShortfall"] == b["pCashShortfall"] and a["minCash"] == b["minCash"]
    hot = model.simulate(simple(rent_monthly=2000, **kw), seed=7, n=2000, sensitivity=False)
    assert hot["pCashShortfall"] > a["pCashShortfall"]
    assert a["label"] == "scenario analysis, not a forecast"


def test_flip_bisection_hand_computed():
    # cash0 = -0 ; monthly ebitda = 20*10*check*0.7 - 600 -> never negative min cash iff check >= 600/(200*.7)=4.2857
    inp = simple(equity=0, avg_check=(10, 10, 10))
    f = model.flip(inp, model._loan_terms(inp), 0.0)
    assert f["check"]["flipValue"] == pytest.approx(600 / 140, abs=1e-6)


def test_full_run_dscr_and_loan():
    inp = simple(buildout=(90_000, 100_000, 130_000), loan_principal=None, equity=40_000, rent_monthly=3000,
                 utilities_monthly=(300, 400, 600), avg_check=(14, 18, 24), seats=60, turns={"l": 1, "d": 1.2},
                 fixed_labor_hours=900, labor_hours_per_cover=0.1, other_opex_fixed=1500, other_opex_pct=0.04,
                 labor_burden=0.12, ramp_start=0.5, ramp_months=(3, 6, 12), presence_sd=.15, seasonality_sd=.08,
                 pre_open_months=3)
    r = model.simulate(inp, seed=1, n=3000)
    assert r["loan"]["principal"] == 90_000.0            # 100k expected * (1 - 10% SBA-style equity)
    assert r["loan"]["monthlyPayment"] == pytest.approx(loan.payment(90_000, .105, 120), abs=0.01)
    assert 0 <= r["pCashShortfall"] <= 1 and r["sensitivity"]["drivers"]


def test_sandbox_trail_tagged_and_balanced():
    inp = simple(buildout=(1, 1, 1), loan_principal=5000.0)
    p = model.representative_path(inp, seed=3, n=200)
    sb = nessie.LocalSandbox()
    res = nessie.post_trail(sb, p, inp.open_days_per_month, months=3)
    assert res["months"] == 3 and len(sb.t["loans"]) == 1 and len(sb.t["bills"]) == 6
    assert all(r["simulated"] for t in sb.t.values() for r in t)
    for t in ("deposits", "purchases", "bills"):
        assert all("SIMULATED" in (r.get("description") or r.get("nickname")) for r in sb.t[t])
    dep_month1 = sum(d["amount"] for d in sb.t["deposits"] if d["description"].endswith("daily sales") and d["transaction_date"].startswith("2027-01"))
    assert dep_month1 == pytest.approx(float(p["sales"][0]), abs=0.1)


def test_api_simulate_and_ledger():
    body = {"monthlyRentAssumption": 6000, "city": "Houston", "state": "TX", "nDraws": 500, "seed": 2,
            "buildout": [90000, 100000, 130000]}
    r = client.post("/api/finance/simulate", json=body).json()
    assert r["status"] == "simulated" and r["ledger"]["backend"] == "local-sandbox"
    led = client.get(f"/api/finance/ledger/{r['runId']}?table=deposits&limit=5").json()
    assert led["total"] > 500 and led["records"][0]["simulated"] is True
    assert client.get("/api/finance/ledger/nope").status_code == 404
    unk = client.post("/api/finance/simulate", json={"nDraws": 500}).json()
    assert unk["status"] == "blocked"


def test_opening_deficit_counts_as_shortfall():
    # build-out far exceeds equity, so the restaurant cannot fund its opening even though month 1 is very profitable
    inp = simple(buildout=(50000, 50000, 50000), equity=1000, loan_principal=0.0, avg_check=(2000, 2000, 2000))
    r = model.simulate(inp, seed=1, n=200, sensitivity=False)
    assert r["status"] == "simulated"
    assert r["pCashShortfall"] == 1.0
    assert r["minCash"]["p50"] < 0


def test_ledger_reconciles_to_the_simulated_cash_path():
    inp = simple(buildout=(10000, 10000, 10000), equity=20000, loan_principal=5000.0, other_opex_fixed=300,
                 other_opex_pct=0.02, pre_open_months=2)
    p = model.representative_path(inp, seed=5, n=200)
    sb = nessie.LocalSandbox()
    nessie.post_trail(sb, p, inp.open_days_per_month)
    balance = sum(d["amount"] for d in sb.t["deposits"]) - sum(x["amount"] for x in sb.t["purchases"])
    assert balance == pytest.approx(float(p["cash"][-1]), abs=15.0)
