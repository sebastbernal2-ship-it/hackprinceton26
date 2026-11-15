"""Train and export Foreground's restaurant 3-year survival model.

Usage:  python -X utf8 scripts/ml/train_survival.py      (after build_dataset.py)

Reads   data/ml/survival-dataset.csv, data/ml/survival-site-features.csv, data/ml/survival-dataset-meta.json
Writes  data/ml/survival-model.json   metrics, importances, calibration bins, model card
        data/ml/survival-sites.json   prediction + top factors for each demo site

Model: HistGradientBoostingClassifier + sigmoid (Platt) calibration fitted on property-grouped out-of-fold
scores. Baselines: the training base rate and a regularised logistic regression.
Evaluation: (a) time split, train on move-ins before 2019, test on 2019-2023; (b) 5-fold CV grouped by property.
Explanations: global = permutation importance (AUC drop on the time-split test set);
per prediction = Monte-Carlo Shapley values on the calibrated probability (sklearn ships no SHAP). Each site
row is compared with real tenancies from 2015 onwards, features are switched from the background row to the
site's values in random order, and the average change is the feature's effect. Effects are summed into
readable groups; they add up to (site probability - baseline probability).
"""
import json
import os
import warnings
from datetime import date

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, TargetEncoder

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
D = os.path.join(ROOT, "data", "ml")
df = pd.read_csv(os.path.join(D, "survival-dataset.csv"))
sites = pd.read_csv(os.path.join(D, "survival-site-features.csv"), dtype={"site_id": str})
meta = json.load(open(os.path.join(D, "survival-dataset-meta.json"), encoding="utf-8"))

TE = ["submarket"]  # high-cardinality: smoothed, cross-fitted target encoding
# Lease-record fields are NOT used by the shipped model. They are nominally "known at signing", but in the kit
# they measure how thoroughly a tenancy was researched, and research accumulates while a tenant stays:
# 78% of tenancies with a lease deal survive vs 49% without, 79% with lease type Direct vs 48% Unknown.
# That is outcome leakage through record completeness, so they are only used in an ablation below.
LEASE_RECORD_CAT = ["lease_type", "service_type", "space_type"]
LEASE_RECORD_NUM = ["has_lease_deal", "rent_psf_yr", "lease_term_months"]
CAT_ALL = ["market", "property_type", "property_subtype", "space_position"] + LEASE_RECORD_CAT
CAT = [c for c in CAT_ALL if c not in LEASE_RECORD_CAT]
NUM_ALL = [c for c in meta["features"] if c not in TE + CAT_ALL]
NUM = [c for c in NUM_ALL if c not in LEASE_RECORD_NUM]
FEATS = TE + CAT + NUM
ALL_FEATS = TE + CAT_ALL + NUM_ALL
for d_ in (df, sites):
    d_[TE + CAT_ALL] = d_[TE + CAT_ALL].astype(str)
    d_[NUM_ALL] = d_[NUM_ALL].astype(float)
X, y, groups = df[ALL_FEATS], df["survived3y"].values, df["property_id"].values
year = df["move_in"].str[:4].astype(int).values


def make_hgb(max_depth=3, max_iter=100, num=NUM, cat=CAT):
    pre = ColumnTransformer([
        ("te", TargetEncoder(target_type="binary", random_state=0), TE),
        ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1, min_frequency=15), cat),
        ("num", "passthrough", num)])
    clf = HistGradientBoostingClassifier(
        max_depth=max_depth, max_iter=max_iter, learning_rate=0.05, min_samples_leaf=20, l2_regularization=1.0,
        categorical_features=list(range(len(TE), len(TE) + len(cat))), random_state=0)
    return make_pipeline(pre, clf)


def make_lr():
    pre = ColumnTransformer([
        ("te", TargetEncoder(target_type="binary", random_state=0), TE),
        ("cat", OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=15, sparse_output=False), CAT),
        ("num", make_pipeline(SimpleImputer(strategy="median", add_indicator=True),), NUM)])
    return make_pipeline(pre, StandardScaler(), LogisticRegression(C=0.1, max_iter=2000))


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p)).reshape(-1, 1)


def oof_scores(make, X_, y_, g_):
    out = np.zeros(len(y_))
    for tr, te in GroupKFold(5).split(X_, y_, g_):
        out[te] = make().fit(X_.iloc[tr], y_[tr]).predict_proba(X_.iloc[te])[:, 1]
    return out


class Calibrated:
    """Model fitted on all rows + sigmoid calibration fitted on property-grouped out-of-fold scores."""

    def __init__(self, make, X_, y_, g_):
        self.oof = oof_scores(make, X_, y_, g_)
        self.cal = LogisticRegression(C=1e6).fit(logit(self.oof), y_)
        self.model = make().fit(X_, y_)

    def predict(self, X_):
        return self.cal.predict_proba(logit(self.model.predict_proba(X_)[:, 1]))[:, 1]


def scores(y_, p):
    return {"rocAuc": round(roc_auc_score(y_, p), 3), "prAuc": round(average_precision_score(y_, p), 3),
            "brier": round(brier_score_loss(y_, p), 4)}


def bins(y_, p, edges=(0, .5, .6, .7, .8, 1.0001)):
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            out.append({"lo": lo, "hi": min(hi, 1.0), "n": int(m.sum()),
                        "meanPredicted": round(float(p[m].mean()), 3), "observed": round(float(y_[m].mean()), 3)})
    return out


# ------------------------------------------------------------------ (a) time split
tr, te = year < 2019, year >= 2019
Xtr, ytr, gtr, Xte, yte = X[tr], y[tr], groups[tr], X[te], y[te]
grid = [(d_, n) for d_ in (2, 3) for n in (100, 200)]  # small grid, chosen on the training period only
grid_auc = {g: roc_auc_score(ytr, oof_scores(lambda g=g: make_hgb(*g), Xtr, ytr, gtr)) for g in grid}
best = max(grid_auc, key=grid_auc.get)
print("grid (grouped-CV AUC on train):", {str(k): round(v, 3) for k, v in grid_auc.items()}, "->", best)
hgb = lambda: make_hgb(*best)  # noqa: E731
NUM_NO_ERA = [c for c in NUM if c != "move_in_year"]

base_tr = ytr.mean()
m_hgb, m_lr = Calibrated(hgb, Xtr, ytr, gtr), Calibrated(make_lr, Xtr, ytr, gtr)
m_noera = Calibrated(lambda: make_hgb(*best, num=NUM_NO_ERA), Xtr, ytr, gtr)
m_leaky = Calibrated(lambda: make_hgb(*best, num=NUM_ALL, cat=CAT_ALL), Xtr, ytr, gtr)
p_hgb = m_hgb.predict(Xte)
time_split = {
    "train": {"period": "move-in before 2019", "n": int(tr.sum()), "baseRate": round(float(base_tr), 3)},
    "test": {"period": "move-in 2019 to 2023-11", "n": int(te.sum()), "baseRate": round(float(yte.mean()), 3)},
    "models": {
        "baseRate": {"rocAuc": 0.5, "prAuc": round(float(yte.mean()), 3),
                     "brier": round(brier_score_loss(yte, np.full(len(yte), base_tr)), 4)},
        "logistic": scores(yte, m_lr.predict(Xte)),
        "hgb": scores(yte, p_hgb),
        "hgbNoMoveInYear": scores(yte, m_noera.predict(Xte)),
        "hgbWithLeaseRecordFields": scores(yte, m_leaky.predict(Xte)),
    },
    "calibrationBins": bins(yte, p_hgb),
}
rng = np.random.default_rng(0)
boot = [roc_auc_score(yte[i], p_hgb[i]) for i in (rng.integers(0, len(yte), len(yte)) for _ in range(1000))
        if 0 < yte[i].mean() < 1]
time_split["models"]["hgb"]["rocAucCi95"] = [round(float(np.percentile(boot, 2.5)), 3), round(float(np.percentile(boot, 97.5)), 3)]
print("time split:", json.dumps(time_split["models"], indent=1))

# ------------------------------------------------------------------ (b) grouped CV on all rows (nested calibration)
cv_p = {"logistic": np.zeros(len(y)), "hgb": np.zeros(len(y)), "baseRate": np.zeros(len(y))}
for a, b in GroupKFold(5).split(X, y, groups):
    cv_p["hgb"][b] = Calibrated(hgb, X.iloc[a], y[a], groups[a]).predict(X.iloc[b])
    cv_p["logistic"][b] = Calibrated(make_lr, X.iloc[a], y[a], groups[a]).predict(X.iloc[b])
    cv_p["baseRate"][b] = y[a].mean()
grouped_cv = {"folds": 5, "groupedBy": "property", "n": len(y), "baseRate": round(float(y.mean()), 3),
              "models": {"baseRate": {"rocAuc": 0.5, "prAuc": round(float(y.mean()), 3),
                                      "brier": round(brier_score_loss(y, cv_p["baseRate"]), 4)},
                         "logistic": scores(y, cv_p["logistic"]), "hgb": scores(y, cv_p["hgb"])},
              "calibrationBins": bins(y, cv_p["hgb"])}
print("grouped CV:", json.dumps(grouped_cv["models"], indent=1))

# ------------------------------------------------------------------ feature groups + global importance
GROUPS = {
    "suite": ("History of this exact suite", ["suite_known", "prior_food_closed_suite", "prior_food_closed_5y_suite",
              "prior_any_closed_5y_suite", "predecessor_years", "suite_vacant_years", "second_gen_food_suite"]),
    "propertyFood": ("Food tenants at this property", ["prior_food_prop", "prior_food_closed_prop",
                     "prior_food_closed_5y_prop", "prior_food_short_closed_prop", "food_active_prop"]),
    "roster": ("Building tenant roster and turnover", ["tenants_active_bldg", "tenant_moveouts_3y_bldg", "record_depth_years"]),
    "area": ("Food and tenant density within 500 m", ["food_active_500m", "food_closed_3y_500m", "tenants_active_500m", "kit_properties_500m"]),
    "building": ("Building type, size and age", ["property_type", "property_subtype", "building_sf", "building_age",
                 "years_since_renov", "stories", "parking_ratio"]),
    "location": ("Market and submarket", ["market", "submarket"]),
    "space": ("Space size and position", ["sf_occupied", "sf_share_of_building", "space_position"]),
    "operator": ("Operator: chain or independent", ["tenant_known", "chain_locations", "is_chain", "operator_prior_sites"]),
    "era": ("Move-in year", ["move_in_year"]),
}
GROUP_OF = {f: g for g, (_, fs) in GROUPS.items() for f in fs}
assert set(GROUP_OF) == set(FEATS), set(FEATS) ^ set(GROUP_OF)

XteF = Xte[FEATS]
pi = permutation_importance(m_hgb.model, XteF, yte, scoring="roc_auc", n_repeats=30, random_state=0)
importance = sorted(({"feature": f, "group": GROUP_OF[f], "aucDrop": round(float(m), 4), "std": round(float(s), 4)}
                     for f, m, s in zip(FEATS, pi.importances_mean, pi.importances_std)), key=lambda r: -r["aucDrop"])
# group importance: permute all features of a group together
group_imp = []
base_auc = roc_auc_score(yte, m_hgb.model.predict_proba(Xte)[:, 1])
for g, (label, fs) in GROUPS.items():
    drops = []
    for _ in range(30):
        Xp = XteF.copy()
        Xp[fs] = Xp[fs].values[rng.permutation(len(Xp))]
        drops.append(base_auc - roc_auc_score(yte, m_hgb.model.predict_proba(Xp)[:, 1]))
    group_imp.append({"group": g, "label": label, "aucDrop": round(float(np.mean(drops)), 4), "std": round(float(np.std(drops)), 4)})
group_imp.sort(key=lambda r: -r["aucDrop"])
print("top features:", [(r["feature"], r["aucDrop"]) for r in importance[:10]])
print("groups:", [(r["group"], r["aucDrop"]) for r in group_imp])

# ------------------------------------------------------------------ final model (all labelled rows) + site predictions
final = Calibrated(hgb, X, y, groups)
DTYPES = X[FEATS].dtypes.to_dict()
bg = X.loc[year >= 2015, FEATS].reset_index(drop=True)  # background: recent real tenancies
N_ITER = 400


def shapley(x):
    """Monte-Carlo Shapley values of final.predict for one row against the background. x: Series."""
    b = bg.copy()
    b["move_in_year"] = x["move_in_year"]  # condition on the era: "a typical recent tenancy, if it opened now"
    base = float(final.predict(b).mean())
    r = np.random.default_rng(0)
    rows, order = [], []
    for _ in range(N_ITER):
        z = b.iloc[r.integers(len(b))].copy()
        perm = r.permutation(len(FEATS))
        rows.append(z.copy())
        for j in perm:
            z[FEATS[j]] = x[FEATS[j]]
            rows.append(z.copy())
        order.append(perm)
    p = final.predict(pd.DataFrame(rows)[FEATS].astype(DTYPES)).reshape(N_ITER, len(FEATS) + 1)
    phi = np.zeros(len(FEATS))
    for i, perm in enumerate(order):
        phi[perm] += np.diff(p[i])
    return base, phi / N_ITER


def n_(v):
    return 0 if pd.isna(v) else int(round(v))


def plural(n, one, many=None):
    return "%d %s" % (n, one if n == 1 else (many or one + "s"))


def describe(g, x):
    """Plain-language description of a factor group, from the site's own values."""
    if g == "suite":
        if not x["suite_known"]:
            return "No suite number, so no suite history"
        f5, a5 = n_(x["prior_food_closed_5y_suite"]), n_(x["prior_any_closed_5y_suite"])
        if f5:
            return "%s left this suite in the last 5 years" % plural(f5, "food tenant")
        if n_(x["prior_food_closed_suite"]):
            return "%s left this suite more than 5 years ago" % plural(n_(x["prior_food_closed_suite"]), "food tenant")
        if a5:
            return "%s (not food) left this suite in the last 5 years" % plural(a5, "tenant")
        return "No recorded tenant has left this suite"
    if g == "propertyFood":
        c5, act, short = n_(x["prior_food_closed_5y_prop"]), n_(x["food_active_prop"]), n_(x["prior_food_short_closed_prop"])
        if not n_(x["prior_food_prop"]):
            return "No food tenant on record at this property"
        return "%s here now; %s left in the last 5 years; %s ever closed within 3 years" % (
            plural(act, "food tenant"), c5, short)
    if g == "roster":
        return "%s in the building, %s in the last 3 years" % (plural(n_(x["tenants_active_bldg"]), "tenant"),
                                                              plural(n_(x["tenant_moveouts_3y_bldg"]), "move-out"))
    if g == "area":
        return "%s open within 500 m, %s closed there in 3 years" % (plural(n_(x["food_active_500m"]), "recorded food tenant"),
                                                                     n_(x["food_closed_3y_500m"]))
    if g == "building":
        t = {"GeneralRetail": "Retail", "Multifamily": "Apartment"}.get(x["property_type"], x["property_type"])
        age = "" if pd.isna(x["building_age"]) else ", %d years old" % x["building_age"]
        return "%s building, %s SF%s" % (t, format(n_(x["building_sf"]), ","), age)
    if g == "location":
        return "%s, submarket %s" % ({"LosAngeles": "Los Angeles"}.get(x["market"], x["market"]), x["submarket"])
    if g == "space":
        if pd.isna(x["sf_occupied"]):
            return "Space size not given"
        sh = x["sf_share_of_building"]
        share = "" if pd.isna(sh) else ", under 1% of the building" if sh < 0.01 else ", %.0f%% of the building" % min(100, 100 * sh)
        return "Space of %s SF%s" % (format(n_(x["sf_occupied"]), ","), share)
    if g == "operator":
        return "Independent operator with no other locations" if not x["is_chain"] else "Chain operator"
    return GROUPS[g][0]


def band(p):
    if p >= 0.75:
        return "strong", "Better odds than most"
    if p >= 0.62:
        return "typical", "About average odds"
    if p >= 0.5:
        return "weak", "Below-average odds"
    return "poor", "More likely to close than last"


# Groups with no measured out-of-time skill (permutation AUC drop <= 0): never shown as top factors.
NO_SKILL = {"suite", "area", "operator", "location"}
DISCLOSURE = "Trained on %d Houston/LA food tenancies; out-of-time AUC %.2f — a weak signal, use as context" % (
    len(y), time_split["models"]["hgb"]["rocAuc"])


def relative(p, base):
    """Calibration-aware band against the baseline. Scores above 80% survived ~74% out of time, so cap first."""
    shown = min(p, 0.75)
    rb = "above typical" if shown >= base + 0.05 else "below typical" if shown <= base - 0.05 else "typical"
    text = "about 3 in 4" if p > 0.8 else "about %d%%" % round(100 * shown)
    return round(shown, 3), rb, text


site_out = []
for _, s in sites.iterrows():
    x = s[FEATS]
    prob = float(final.predict(pd.DataFrame([x])[FEATS].astype(DTYPES))[0])
    base, phi = shapley(x)
    eff = {}
    for f, v in zip(FEATS, phi):
        eff[GROUP_OF[f]] = eff.get(GROUP_OF[f], 0.0) + v
    # Monte-Carlo error is spread so the factors add up exactly to (prob - base)
    resid = (prob - base) - sum(eff.values())
    tot = sum(abs(v) for v in eff.values()) or 1.0
    eff = {g: v + resid * abs(v) / tot for g, v in eff.items()}
    factors = sorted(({"group": g, "label": GROUPS[g][0], "text": describe(g, x), "effectPts": round(100 * v, 1),
                       "measuredSkill": g not in NO_SKILL}
                      for g, v in eff.items() if g != "era"), key=lambda r: -abs(r["effectPts"]))
    for f in factors:
        f["summary"] = "%s: %s%d pts" % (f["text"], "+" if f["effectPts"] >= 0 else "−", abs(round(f["effectPts"])))
    b_, bl = band(prob)
    shown, rb, ptext = relative(prob, base)
    site_out.append({"siteId": s["site_id"], "address": s["address"], "city": s["city"], "suite": s["suite"] if isinstance(s["suite"], str) else None,
                     "probability": round(prob, 3), "baselineProbability": round(base, 3), "band": b_, "bandLabel": bl,
                     "displayProbability": shown, "displayText": ptext, "relativeBand": rb,
                     "topFactors": [f for f in factors if f["measuredSkill"]][:3], "allFactors": factors})
    print(s["site_id"], s["address"], round(prob, 3), "base", round(base, 3), "|", rb, ptext, "|", " | ".join(f["summary"] for f in site_out[-1]["topFactors"]))

# ------------------------------------------------------------------ export
today = date.today().isoformat()
LIMITS = [
    "Small sample: %d tenancies on %d properties; the test set has %d rows, so every metric carries wide error bars." % (len(y), meta["properties"], int(te.sum())),
    "Overconfident at the top: on the 2019-2023 test set, tenancies scored above 80% survived 74% of the time. Read anything above 80% as roughly three in four.",
    "Weak signal: ranking skill is modest (see metrics). Treat the output as a nudge on the base rate, not a forecast.",
    "The label is 'still in this space after 3 years'. A restaurant that relocated or was bought out counts the same as one that failed.",
    "Recording bias: CoStar back-fills history. Older short-lived tenants are under-recorded, and about half of move-in dates are record start dates, not confirmed move-ins.",
    "No SIC/NAICS in the kit: food tenants are found by industry code 17 plus name and bio patterns, so some rows are not restaurants and some restaurants are missed.",
    "Kit coverage only: 3,339 properties in Houston and Los Angeles, mostly apartment and office buildings. 'Food tenants within 500 m' counts kit properties only, not the real street.",
    "Rent and lease terms are not used. Rent is filled on 12% of rows, and having a lease record at all is a marker of a tenant that stayed long enough to be researched (leakage), so the whole lease group was removed.",
    "Suite number is known on about 29% of rows, so suite history rests on few rows.",
    "Not in the data: cuisine, price point, operator experience or capital, sales, foot traffic, visibility, parking counts, reviews, competition outside the kit.",
    "The test period includes 2020. Predictions for 2026 move-ins extrapolate past the last labelled move-in (2023-11).",
]
model_json = {
    "name": "Foreground restaurant survival model", "version": "1.0", "trainedOn": today, "dataDate": meta["dataDate"],
    "target": "Probability that a food tenancy is still in the same space 3 years after move-in",
    "algorithm": "HistGradientBoostingClassifier (max_depth=%d, max_iter=%d, lr=0.05) + sigmoid calibration on property-grouped out-of-fold scores" % best,
    "dataset": {"rows": len(y), "survived": int(y.sum()), "notSurvived": int(len(y) - y.sum()), "baseRate": round(float(y.mean()), 3),
                "properties": meta["properties"], "byMarket": meta["byMarket"], "byMatchBasis": meta["byMatchBasis"],
                "moveInRange": [df["move_in"].min(), df["move_in"].max()], "exclusions": meta["exclusions"],
                "artifactStintsDropped": meta["artifactStintsDropped"], "features": FEATS, "featureFill": {f: meta["featureFill"][f] for f in FEATS},
                "excludedFeatures": {"fields": LEASE_RECORD_CAT + LEASE_RECORD_NUM,
                                     "reason": "Lease-record fields mark how thoroughly a tenancy was researched, which grows with survival (78% survive with a lease deal vs 49% without). Kept only as the hgbWithLeaseRecordFields ablation."}},
    "metrics": {"timeSplit": time_split, "groupedCv": grouped_cv},
    "calibration": {"method": "sigmoid", "bins": grouped_cv["calibrationBins"], "binsSource": "grouped CV, out-of-fold"},
    "featureImportance": {"method": "permutation importance, ROC-AUC drop on the time-split test set, 30 repeats",
                          "groups": group_imp, "features": importance},
    "explanations": {"method": "Monte-Carlo Shapley values on the calibrated probability, %d samples per site, background = tenancies that began 2015 or later with move-in year set to the site's; summed into factor groups" % N_ITER,
                     "groups": {g: {"label": l, "features": fs} for g, (l, fs) in GROUPS.items()}},
    "modelCard": {
        "data": "CoStar hackathon kit (Houston and Los Angeles): location-occupancy joined to company-detail and commercial-property.",
        "unit": "One food tenancy (renewals and suite moves by the same tenant in the same property merged).",
        "label": "1 if the tenant was still in place 3 years after move-in, else 0. Tenancies that began after %s are left out because their 3 years are not up." % meta["labelCutoff"],
        "features": "Only facts known at move-in: building, location, space, earlier food tenants in the suite and property, building roster, density within 500 m, chain or independent.",
        "intendedUse": "A rough, explained prior for a new food tenant in a listed space, shown next to the site evidence. Not for lending, underwriting or any decision about a named business.",
        "limits": LIMITS, "date": today,
    },
}
json.dump(model_json, open(os.path.join(D, "survival-model.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
json.dump({"generatedOn": today, "asOf": meta["dataDate"], "horizonYears": 3,
           "scenario": "A new independent food tenant moves into the featured space on the data date",
           "datasetBaseRate": round(float(y.mean()), 3), "disclosure": DISCLOSURE,
           "noSkillGroups": sorted(NO_SKILL),
           "factorNote": "Effects are percentage points against a typical food tenancy since 2015; all factors of a site add up to probability minus baselineProbability.",
           "sites": site_out},
          open(os.path.join(D, "survival-sites.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("wrote survival-model.json, survival-sites.json")
