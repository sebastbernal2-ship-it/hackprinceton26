"""Build the fair-rent training set from the CoStar hackathon kit.

Usage (kit is read-only input):
    python -X utf8 -I scripts/ml/build_rent_dataset.py [kit_dir]

Writes
    data/ml/rent-dataset.csv       one row per lease space with a usable rate (listing spaces + lease deals)
    data/ml/rent-dataset-meta.json counts, exclusions, NNN-adjustment estimate, outlier rule, feature list

Rows
  * source = listing : spaces[] of active for-lease listings (forLeaseSummary.spaces), asking rent.
  * source = deal    : leaseDeal of a location-occupancy record, contract rent (rateActual) when present,
                       else the deal's quoted asking rent. rent_flavor says which.
  Spaces with rate 0 = "no rate" are dropped. Spaces with a dateOffMarket, executive suites and coworking
  listings are dropped (not leasable retail-like space / flexible office).

Normalisation
  1. $/SF/yr = rate x 12 when rateBasis == 1 (monthly), else rate (per-space basis, not per city). Rates that are
     not per square foot (rateAmountType != 0 on deals, askingRateMeasurementType != 1) are dropped.
  2. Mid-point of rateLow/rateHigh when both are quoted.
  3. Service type -> NNN-equivalent. Groups: NNN (TripleNet, Net, DoubleNet are treated as NNN-like), GROSS
     (FullService, ModifiedGross, IndustrialGross, PlusCleaning/Electric/Utilities, FullServiceGrossNoPass: the
     landlord covers taxes, insurance and (most) operating costs) and UNKNOWN (0, Negotiable, ToBeDetermined).
     The gap is ESTIMATED FROM THE DATA: OLS of log(rent) on the service group, controlling for submarket
     (fixed effects), use, log SF, property type, and era. The GROSS coefficient b gives
     nnn_equivalent = gross_rent x exp(-b)  (a ratio, because the gap scales with rent level in the data).
     Rows with UNKNOWN service are not used as training rows (they cannot be placed on the NNN basis).
  4. Outliers: after NNN conversion, drop rows outside [$3, $250]/SF/yr, then drop rows whose log rent is more than
     3.5 robust sigmas (1.4826 x MAD) from the median of their (market, use class) cell.

Standard library + numpy/pandas; streams the JSONL files.
"""
import collections
import json
import math
import os
import re
import sys
from datetime import date

import numpy as np
import pandas as pd

KIT = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/admin/Downloads/costar-hackathon-kit (3)"
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "data", "ml")
DATA_DATE = date(2026, 11, 9)
MARKET = {14: "Houston", 20: "LosAngeles"}
E = json.load(open(KIT + "/schemas/enums.json", encoding="utf-8"))
KW = re.compile(r"restaurant|kitchen|hood|grease|vented|cafe|coffee|food|bar\b|patio|second.gen|2nd.gen|dining|drive.thru", re.I)

NNN_LIKE = {13, 10, 12}
GROSS_LIKE = {7, 9, 8, 1, 2, 4, 6, 19}
GROUND = {21, 22, 23, 24, 151, 152}
BELOW = {18, 19, 20, 16, 17}


def dec(en, v):
    return E[en].get(str(v), str(v)) if v is not None else None


def svc_group(st):
    if st in NNN_LIKE:
        return "NNN"
    if st in GROSS_LIKE:
        return "GROSS"
    return "UNKNOWN"


def pdate(s):
    if not s:
        return None
    try:
        return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
    except ValueError:
        return None


def floor_feats(fn):
    """-> (floor_class, floor_no). ground = ground/first/lobby/plaza; below; upper."""
    if not fn:
        return None, np.nan
    if fn in GROUND:
        return "ground", 1.0
    if fn in BELOW:
        return "below", 0.0
    if fn == 26:
        return "upper", 2.0
    if fn == 25:
        return "upper", 2.0
    if 27 <= fn <= 149:
        return "upper", float(fn - 24)  # ThirdFloor(27) -> 3
    if fn == 150:
        return "upper", 30.0
    return None, np.nan


# ---------------------------------------------------------------- properties
print("reading properties ...", flush=True)
props = {}
for line in open(KIT + "/data/commercial-property.jsonl", encoding="utf-8"):
    r = json.loads(line)
    a = r.get("primaryAddress") or {}
    yb = [e.get("year") for e in r.get("constructionEvents") or [] if e.get("eventType") == 2 and e.get("year")]
    props[r["id"]] = {
        "market": MARKET.get(a.get("researchMarketId"), "Other"),
        "city": a.get("city"),
        "submarket": r.get("primarySubmarketId"),
        "lat": a.get("latitude"), "lng": a.get("longitude"),
        "property_type": dec("PropertyType", r.get("propertyType")),
        "property_subtype": dec("PropertySubtype", r.get("propertySubtype")),
        "building_sf": r.get("rentableBuildingAreaSquareFeet") or r.get("grossBuildingAreaSquareFeet"),
        "year_built": min(yb) if yb else None,
        "stories": r.get("numStoriesAboveGrade"),
        "building_class": r.get("buildingClass"),
        "address": " ".join(str(x) for x in [a.get("streetNumber"), a.get("streetName"), a.get("streetType")] if x),
    }
print(len(props), "properties")

# ---------------------------------------------------------------- listing spaces
print("reading listings ...", flush=True)
drops = collections.Counter()
rows = []
avail_all = collections.defaultdict(dict)  # pid -> space id -> sf (every available space, any use, any rate)
for line in open(KIT + "/data/commercial-listing-summary.jsonl", encoding="utf-8"):
    L = json.loads(line)
    fl = L.get("forLeaseSummary")
    if not fl or L.get("listingStatus") != 1:
        continue
    if L.get("listingType") == 21:
        drops["coworking listing"] += 1
        continue
    meas = fl.get("askingRateMeasurementType")
    for s in fl.get("spaces") or []:
        pid = s.get("propertyId") or L.get("propertyId")
        if pid not in props or s.get("dateOffMarket"):
            drops["off market / unknown property"] += 1
            continue
        sf = s.get("squareFeetMax") or s.get("squareFeetMin")
        if sf:
            avail_all[pid][s["id"]] = sf
        if s.get("isExecutiveSuite"):
            drops["executive suite"] += 1
            continue
        lo, hi = s.get("rateLow") or 0, s.get("rateHigh") or 0
        if lo <= 0 and hi <= 0:
            drops["listing: no rate (0)"] += 1
            continue
        if meas not in (1, None, 0) or s.get("monetaryUnit") not in (1, 0, None):
            drops["listing: rate not per SF / not USD"] += 1
            continue
        if not sf or sf <= 0:
            drops["listing: no SF"] += 1
            continue
        rate = (lo + hi) / 2 if lo > 0 and hi > 0 else max(lo, hi)
        raw = rate * (12 if s.get("rateBasis") == 1 else 1)
        fcls, fno = floor_feats(s.get("floorName"))
        notes = " ".join(n.get("value") or "" for n in s.get("notes") or [])
        rows.append({
            "source": "listing", "rent_flavor": "listing_ask", "record_id": s["id"], "property_id": pid,
            "suite": s.get("suite"), "rent_raw_psf_yr": raw, "service_type": s.get("serviceType") or 0,
            "space_use": dec("SpaceUse", s.get("spaceUse")), "space_type": dec("SpaceType", s.get("spaceType")),
            "space_sf": sf, "floor_class": fcls, "floor_no": fno,
            "date": pdate(s.get("dateOnMarket")) or pdate(L.get("createdDate")),
            "rest_kw": int(bool(KW.search(notes))), "listing_type": L.get("listingType"),
            "is_pending": int(bool(s.get("isLeasePending"))),
        })
print(len(rows), "listing rows with a rate; drops:", dict(drops))
# a space can appear in several listings: keep the most recently listed
tmp = pd.DataFrame(rows)
tmp = tmp.sort_values("date").drop_duplicates("record_id", keep="last")
rows = tmp.to_dict("records")
print(len(rows), "after de-duplicating space ids")

# ---------------------------------------------------------------- lease deals + current occupancy
print("reading occupancies ...", flush=True)
cur_tenants = collections.Counter()
cur_sf = collections.Counter()
ndeal = collections.Counter()
for line in open(KIT + "/data/location-occupancy.jsonl", encoding="utf-8"):
    r = json.loads(line)
    pid = r["propertyId"]
    if pid not in props:
        continue
    sp = r.get("spaces") or []
    sf = sum((s.get("squareFeetOccupied") or 0) for s in sp) or None
    if not r.get("toDate"):
        cur_tenants[pid] += 1
        cur_sf[pid] += sf or 0
    ld = r.get("leaseDeal")
    if not ld:
        continue
    ndeal["deals"] += 1
    if ld.get("monetaryUnit") not in (1, 0, None):
        drops["deal: not USD"] += 1
        continue
    raw = flavor = None
    ra = ld.get("rateActual")
    if ra and ra > 0 and ld.get("rateAmountType", 0) == 0 and ld.get("rateBasis") in (1, 2):
        raw, flavor = ra * (12 if ld["rateBasis"] == 1 else 1), "deal_contract"
    elif sf and sf > 0:
        for k, mult in (("rateActualPerYear", 1), ("rateActualPerMonth", 12)):
            if ld.get(k):
                raw, flavor = ld[k] * mult / sf, "deal_contract"
                break
    if raw is None:
        ar = ld.get("askingRate") or {}
        lo, hi = ar.get("rateLow") or 0, ar.get("rateHigh") or 0
        if max(lo, hi) > 0 and ar.get("rateBasis") in (1, 2):
            rate = (lo + hi) / 2 if lo > 0 and hi > 0 else max(lo, hi)
            raw, flavor = rate * (12 if ar["rateBasis"] == 1 else 1), "deal_ask"
    if raw is None:
        drops["deal: no rate"] += 1
        continue
    if not sf or sf <= 0:
        drops["deal: no SF"] += 1
        continue
    d = pdate(ld.get("signDate")) or pdate(ld.get("commencementDate")) or pdate(r.get("moveInDate")) or pdate(r.get("fromDate"))
    rows.append({
        "source": "deal", "rent_flavor": flavor, "record_id": r["id"], "property_id": pid,
        "suite": (sp[0].get("suite") if sp else None), "rent_raw_psf_yr": raw, "service_type": ld.get("serviceType") or 0,
        "space_use": dec("SpaceUse", ld.get("spaceUse")), "space_type": dec("SpaceType", ld.get("spaceType")),
        "space_sf": sf, "floor_class": None, "floor_no": np.nan, "date": d, "rest_kw": 0, "listing_type": 0, "is_pending": 0,
    })
print(ndeal["deals"], "lease deals;", len(rows), "total rows with a rate")

df = pd.DataFrame(rows)
df = df[df["date"].notna()].copy()
df["date"] = pd.to_datetime(df["date"])
df["year_frac"] = df["date"].dt.year + (df["date"].dt.dayofyear - 1) / 365.25
for k in ("market", "city", "submarket", "lat", "lng", "property_type", "property_subtype", "building_sf", "year_built",
          "stories", "building_class", "address"):
    df[k] = df["property_id"].map(lambda p, k=k: props[p][k])
df = df[df["market"].isin(["Houston", "LosAngeles"]) & df["lat"].notna()].copy()

# use class
def use_class(r):
    u = r["space_use"]
    if u in ("Retail", "OfficeRetail"):
        return "retail"
    if u == "Unknown":
        return "retail" if r["property_type"] == "GeneralRetail" else "unknown"
    if u in ("Office", "OfficeMedical", "Medical"):
        return "office"
    return "industrial"  # Flex, Industrial


df["use_class"] = df.apply(use_class, axis=1)
print("use classes (rows):", df["use_class"].value_counts().to_dict())
df = df[df["use_class"].isin(["retail", "office"])].copy()
df["is_retail_use"] = (df["use_class"] == "retail").astype(int)

# building-level features
df["age"] = df["year_frac"] - df["year_built"]
df.loc[(df["age"] < 0) | (df["age"] > 200), "age"] = np.nan
df["ground"] = np.where(df["floor_class"] == "ground", 1.0, np.where(df["floor_class"].isin(["upper", "below"]), 0.0, np.nan))
bsf = df["building_sf"].replace(0, np.nan)
df["sf_share_of_building"] = (df["space_sf"] / bsf).clip(upper=1.5)
df["other_avail_sf"] = [sum(v for k, v in avail_all[p].items() if k != rid) for p, rid in zip(df["property_id"], df["record_id"])]
df.loc[df["source"] == "deal", "other_avail_sf"] = [sum(avail_all[p].values()) for p in df.loc[df["source"] == "deal", "property_id"]]
df["other_avail_share"] = (df["other_avail_sf"] / bsf).clip(upper=1.5)
df["other_avail_n"] = [len([k for k in avail_all[p] if k != rid]) for p, rid in zip(df["property_id"], df["record_id"])]
df["cur_tenants"] = df["property_id"].map(lambda p: cur_tenants[p])
df["cur_occupied_share"] = (df["property_id"].map(lambda p: cur_sf[p]) / bsf).clip(upper=1.5)
df["svc_group"] = df["service_type"].map(svc_group)

# ---------------------------------------------------------------- featured demo spaces (kept even if filtered below)
import glob
site_space = {}
for f in glob.glob(os.path.join(ROOT, "data", "sites", "*.json")):
    sj = json.load(open(f, encoding="utf-8"))
    site_space[sj["space"]["spaceId"]] = sj["id"]
site_rows = df[(df["source"] == "listing") & df["record_id"].isin(site_space)].copy()
site_rows["site_id"] = site_rows["record_id"].map(site_space)
site_rows["date"] = site_rows["date"].dt.strftime("%Y-%m-%d")
print("featured spaces found in the listing rows:", len(site_rows), "of", len(site_space))

# ---------------------------------------------------------------- NNN-equivalent adjustment
raw = df["rent_raw_psf_yr"]
df = df[(raw >= 3) & (raw <= 250)].copy()
est = df[df["svc_group"] != "UNKNOWN"].copy()
est["lr"] = np.log(est["rent_raw_psf_yr"])


def ols_gap(d, label):
    """log(rent) ~ GROSS + submarket FE + use + log SF + property type + year. Returns dict for the GROSS coef."""
    X = pd.DataFrame({"gross": (d["svc_group"] == "GROSS").astype(float).values}, index=d.index)
    X["logsf"] = np.log(d["space_sf"].clip(lower=100)).values
    X["year"] = (d["year_frac"] - 2020).values
    X["retail"] = d["is_retail_use"].values.astype(float)
    X["deal"] = (d["source"] == "deal").astype(float).values
    X["upper"] = (d["ground"] == 0).astype(float).values
    for col in ("submarket", "property_type"):
        dm = pd.get_dummies(d[col].astype(str), prefix=col, drop_first=True).astype(float)
        dm.index = d.index
        X = pd.concat([X, dm], axis=1)
    X.insert(0, "const", 1.0)
    keep = X.columns[(X != 0).any(axis=0)]
    A = X[keep].values
    y = d["lr"].values
    beta, *_ = np.linalg.lstsq(A, y, rcond=None)
    res = y - A @ beta
    dof = max(len(y) - A.shape[1], 1)
    s2 = (res @ res) / dof
    cov = s2 * np.linalg.pinv(A.T @ A)
    i = list(keep).index("gross")
    se = math.sqrt(cov[i, i])
    return {"label": label, "n": int(len(d)), "n_gross": int((d["svc_group"] == "GROSS").sum()),
            "n_nnn": int((d["svc_group"] == "NNN").sum()), "coef_log": float(beta[i]), "se": float(se),
            "ratio_gross_over_nnn": float(math.exp(beta[i])), "ci95_ratio": [float(math.exp(beta[i] - 1.96 * se)), float(math.exp(beta[i] + 1.96 * se))]}


gaps = {
    "all_uses": ols_gap(est, "all uses"),
    "retail_use": ols_gap(est[est["is_retail_use"] == 1], "retail-use only"),
    "office_use": ols_gap(est[est["is_retail_use"] == 0], "office only"),
}
# raw medians for context
meds = est.groupby(["is_retail_use", "svc_group"])["rent_raw_psf_yr"].agg(["count", "median"]).reset_index().to_dict("records")
print("NNN gap estimates:", json.dumps(gaps, indent=1))
# Which estimate to apply. Economics says a gross rent is HIGHER than the NNN rent for the same space (the landlord
# bundles taxes/insurance/CAM). The retail-use-only regression in this kit gives the opposite sign (gross-quoted
# retail spaces are cheaper than NNN-quoted ones, even within the same building): that is a mix/quality effect
# (gross is quoted on small, low-end and office-like ground-floor retail), not a service-type effect, so it is
# reported but NOT applied. The all-uses estimate (submarket fixed effects, 15k rows) has the right sign and a tight
# interval, and is applied. The model also receives svc_group as a feature so that any leftover retail-specific
# service effect is learned rather than assumed; predictions are always made for the NNN basis.
g_ret, g_all = gaps["retail_use"], gaps["all_uses"]
chosen, chosen_key = (g_ret, "retail_use") if g_ret["coef_log"] > 0 and g_ret["n_gross"] >= 40 and g_ret["se"] < 0.12 else (g_all, "all_uses")
b = chosen["coef_log"]
print("chosen:", chosen_key, "ratio", chosen["ratio_gross_over_nnn"])
n_unknown_service = int((df["svc_group"] == "UNKNOWN").sum())

df = df[df["svc_group"] != "UNKNOWN"].copy()
df["rent_nnn_psf_yr"] = np.where(df["svc_group"] == "GROSS", df["rent_raw_psf_yr"] * math.exp(-b), df["rent_raw_psf_yr"])

# ---------------------------------------------------------------- outlier rule
df["lr_nnn"] = np.log(df["rent_nnn_psf_yr"])
cell = df.groupby(["market", "use_class"])["lr_nnn"]
med = cell.transform("median")
mad = cell.transform(lambda s: 1.4826 * np.median(np.abs(s - np.median(s))))
z = (df["lr_nnn"] - med) / mad
out = z.abs() > 3.5
print("outliers dropped:", int(out.sum()))
n_before = len(df)
df = df[~out].copy()

df["target_log"] = np.log(df["rent_nnn_psf_yr"])
df["date"] = df["date"].dt.strftime("%Y-%m-%d")
cols = ["source", "rent_flavor", "record_id", "property_id", "address", "suite", "market", "city", "submarket", "property_type",
        "property_subtype", "use_class", "is_retail_use", "space_type", "space_sf", "floor_class", "floor_no", "ground", "date",
        "year_frac", "lat", "lng", "building_sf", "year_built", "age", "stories", "building_class", "sf_share_of_building",
        "other_avail_sf", "other_avail_share", "other_avail_n", "cur_tenants", "cur_occupied_share", "rest_kw", "is_pending",
        "service_type", "svc_group", "rent_raw_psf_yr", "rent_nnn_psf_yr"]
site_rows[["site_id"] + [c for c in cols if c in site_rows.columns]].to_csv(os.path.join(OUT, "rent-site-rows.csv"), index=False)
df[cols].to_csv(os.path.join(OUT, "rent-dataset.csv"), index=False)

meta = {
    "builtOn": str(date.today()), "dataDate": str(DATA_DATE), "rows": int(len(df)),
    "properties": int(df["property_id"].nunique()),
    "bySource": df["source"].value_counts().to_dict(), "byFlavor": df["rent_flavor"].value_counts().to_dict(),
    "byUse": df["use_class"].value_counts().to_dict(), "byMarket": df["market"].value_counts().to_dict(),
    "byServiceGroup": df["svc_group"].value_counts().to_dict(),
    "retailRows": int(df["is_retail_use"].sum()),
    "dropCounts": dict(drops), "outliersDropped": int(out.sum()), "rowsBeforeOutlierRule": int(n_before),
    "outlierRule": "after NNN conversion: keep $3..$250/SF/yr; drop |log rent - median| > 3.5 x 1.4826 x MAD within (market, use class)",
    "nnnAdjustment": {"chosen": chosen_key, "grossToNnnFactor": math.exp(-b), "grossOverNnnRatio": math.exp(b),
                      "estimates": gaps, "rawMedians": meds,
                      "groups": {"NNN": sorted(NNN_LIKE), "GROSS": sorted(GROSS_LIKE), "UNKNOWN": "0, Negotiable(11), ToBeDetermined(14), others"},
                      "unknownServiceRowsDropped": n_unknown_service,
                      "retailOnlyEstimateNotApplied": "retail-only gross/NNN ratio is below 1 (mix effect); see comments in build script"},
    "dateRange": [df["date"].min(), df["date"].max()],
}
json.dump(meta, open(os.path.join(OUT, "rent-dataset-meta.json"), "w", encoding="utf-8"), indent=1, default=str)
print(json.dumps({k: meta[k] for k in ("rows", "properties", "bySource", "byFlavor", "byUse", "byMarket", "byServiceGroup", "retailRows", "dateRange")}, indent=1))
