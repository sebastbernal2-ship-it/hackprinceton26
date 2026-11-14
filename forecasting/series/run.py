"""CLI: `python -m forecasting.series.run fetch` then `... run`. Writes data/derived/series/cards.json (ignored)
and prints aggregate counts only."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from . import published, sources as S
from .cards import finalize
from .core import Spec, make_card

ROOT = Path(__file__).resolve().parents[2]
HOUSTON_FILE = Path("/home/vorte/code/hackprinceton/data/raw/houston-police/NIBRSPublicView2026.csv")
MONTHLY = dict(season=12, horizon=12, min_train=48, inner_min=24, step=3)


def cite(source, record, as_of, geo, limits):
    return {"source": source, "recordId": record, "asOf": as_of, "geography": geo, "limitations": limits}


def card_for(y, spec, window, **kw):
    card, reason = make_card(y, spec, window=window, **kw)
    return finalize(card, reason), reason


def next_month(m, k):
    y, mo = int(m[:4]), int(m[5:])
    t = y * 12 + mo - 1 + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def run_all():
    out, notes = [], []
    # LA crime
    raw = S.load("la_crime_monthly.json")
    if raw:
        months, vals = S.to_monthly_array(S.parse_la_crime(raw))
        months, vals, dropped = S.drop_incomplete_tail(months, vals)
        if dropped:
            notes.append(f"LA crime: dropped final month {dropped} as incomplete (reporting lag)")
        h = 12
        c, r = card_for(vals, Spec("la_crime", transform="log", **MONTHLY), (months[0], months[-1]),
                        metric="LAPD reported crime incidents, monthly count (context only; not scored or compared across cities)",
                        unit="incidents/month", scenario="status quo: historical pattern continues",
                        horizon_text=f"{h} months ahead ({next_month(months[-1], h)})", geography="City of Los Angeles (LAPD)",
                        citation=cite("LA Open Data: Crime Data from 2010 to 2019 and 2020 to 2024 (Socrata 63jg-8b9z, 2nrs-mtv8)",
                                      "63jg-8b9z+2nrs-mtv8 monthly counts by date_occ", raw["retrieved"], "City of Los Angeles",
                                      "Reported incidents by occurrence date; 2024 data have a records-system transition and lag; not a rate."))
        out.append(("la_crime", c, r))
    # Houston NIBRS
    if HOUSTON_FILE.exists():
        months, vals = S.houston_monthly(HOUSTON_FILE)
        if len(vals) < 24:
            notes.append(f"Houston NIBRS: skipped, only {len(vals)} months ({months[0]} to {months[-1]}); need >=24")
        else:
            notes.append("Houston NIBRS: >=24 months present but no run configured")
    else:
        notes.append("Houston NIBRS: local file absent, skipped")
    # BLS wages
    raw = S.load("bls_wages.json")
    if raw:
        for area, sid in S.BLS_SERIES.items():
            if sid not in raw["data"]:
                notes.append(f"BLS {area}: not fetched (API limit); skipped")
                continue
            months, vals = S.to_monthly_array(S.parse_bls(raw["data"][sid]))
            c, r = card_for(vals, Spec("wage_" + sid, transform="log", **MONTHLY), (months[0], months[-1]),
                            metric=f"Average hourly earnings, all employees, total private ({area})", unit="USD/hour",
                            scenario="status quo: historical pattern continues",
                            horizon_text=f"12 months ahead ({next_month(months[-1], 12)})", geography=area,
                            citation=cite("BLS Current Employment Statistics (public API v1)", sid, raw["retrieved"], area,
                                          "Not seasonally adjusted; latest months preliminary; metro area average, not site or occupation specific."))
            out.append((sid, c, r))
    # Climate
    raw = S.load("climate_daily.json")
    if raw:
        for city, d in raw["data"].items():
            months, vals = S.to_monthly_array(S.parse_climate(d))
            c, r = card_for(vals, Spec("climate_" + city, transform="none", step=6, **{k: v for k, v in MONTHLY.items() if k != "step"}),
                            (months[0], months[-1]), metric=f"Monthly mean air temperature, 2 m ({city})", unit="deg C",
                            scenario="status quo: historical seasonality and linear trend continue (not a climate-model scenario)",
                            horizon_text=f"12 months ahead ({next_month(months[-1], 12)})", geography=f"{city} grid cell",
                            citation=cite("Open-Meteo Historical Weather API (ERA5 reanalysis)", f"daily temperature_2m_mean {city}",
                                          raw["retrieved"], f"{city} point grid cell", "Reanalysis, not station observation; grid-cell mean."))
            out.append(("climate_" + city, c, r))
    # TxDOT AADT
    raw = S.load("txdot_aadt_harris.json")
    if raw:
        spec_kw = dict(season=1, horizon=1, min_train=6, inner_min=5, step=1, models=("loglin", "ets"), min_loglin_points=5)
        for a in raw["data"]:
            s = S.aadt_series(a)
            if not s or len(s[1]) < 5:
                continue
            y0, vals = s
            c, r = card_for(vals, Spec("aadt", transform="log", **spec_kw), (str(y0), str(y0 + len(vals) - 1)),
                            metric=f"AADT at TxDOT station {a['TRFC_STATN_ID']}", unit="vehicles/day",
                            scenario="status quo: historical log-linear trend continues",
                            horizon_text=f"1 year ahead ({y0 + len(vals)})", geography=f"Harris County TX, station {a['TRFC_STATN_ID']}",
                            citation=cite("TxDOT AADT Annuals (Public View) ArcGIS feature layer", str(a["TRFC_STATN_ID"]),
                                          raw["retrieved"], "Harris County, TX",
                                          "Modeled annual average daily volume on a state-system road, not footfall; gaps are missing, not zero."))
            out.append(("aadt:" + str(a["TRFC_STATN_ID"]), c, r))
    return out, notes


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "run"
    if cmd == "fetch":
        S.fetch_la_crime(); S.fetch_bls(); S.fetch_climate(); S.fetch_txdot()
        print("fetched to data/raw/series")
    elif cmd == "published":
        print(len(published.fetch_all()), "sources written")
    else:
        out, notes = run_all()
        cards = [c for _, c, _ in out] + published.published_cards()
        dest = ROOT / "data" / "derived" / "series"
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "cards.json").write_text(json.dumps({"generated": date.today().isoformat(), "cards": cards}))
        fitted = [x for x in out if x[1]["status"] == "estimated"]
        print(f"series cards: {len(out)}; estimated: {len(fitted)}; unknown: {len(out) - len(fitted)}; published cite-only: {len(cards) - len(out)}")
        for sid, c, r in out:
            if not sid.startswith("aadt:"):
                print(f"  {sid}: {c['status']}" + (f" ({r})" if r else "") + "  " + c["method"].split("Rolling-origin")[1][:200] if "Rolling-origin" in c["method"] else sid)
        for n in notes:
            print("  note:", n)


if __name__ == "__main__":
    main(sys.argv)
