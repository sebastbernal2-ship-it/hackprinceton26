"""Train and export Foreground's fair-rent model (asking rent, $/SF/yr, NNN-equivalent).

Usage:  python -X utf8 scripts/ml/train_rent.py [--quick]      (after build_rent_dataset.py)

Reads   data/ml/rent-dataset.csv, rent-site-rows.csv, rent-dataset-meta.json, data/sites/*.json
Writes  data/ml/rent-model.json   metrics, baselines, intervals, importances, NNN adjustment, model card fields
        data/ml/rent-sites.json   fair rent + 80% interval + gap + band + comparable spaces for each demo site

Model: HistGradientBoostingRegressor on log(NNN-equivalent rent), trained on retail-use AND office spaces (office
rows carry an is_retail_use flag), submarket target-encoded with internal cross-fitting.
Neighbour features (median rent of the k nearest retail comps, of nearby office buildings) are computed against the
TRAINING rows only and never include the row's own building, for training rows and test rows alike.
Intervals: split-conformal on out-of-fold log residuals (80% = 10th..90th percentile of signed residuals), also
compared with quantile gradient boosting. Coverage is measured on held-out folds with the calibration done inside
each training fold (nested), so it is an honest empirical number.
Evaluation (retail-use rows only, the target population):
  (a) 5-fold CV grouped by property (no building in both train and test)
  (b) time check: train on rows dated before 2024, test on retail rows dated 2024 onwards
Baselines: submarket median, kNN comps median (k=8, own building excluded), market median.
"""
import json
import math
import os
import sys
import time
import warnings

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold
from sklearn.neighbors import BallTree
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OrdinalEncoder, TargetEncoder

warnings.filterwarnings("ignore")
QUICK = "--quick" in sys.argv
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
D = os.path.join(ROOT, "data", "ml")
DATA_DATE_FRAC = 2026.0 + (313 - 1) / 365.25  # 2026-11-09
t0 = time.time()

df = pd.read_csv(os.path.join(D, "rent-dataset.csv"), low_memory=False)
site_rows = pd.read_csv(os.path.join(D, "rent-site-rows.csv"), low_memory=False)
meta = json.load(open(os.path.join(D, "rent-dataset-meta.json"), encoding="utf-8"))
FACTOR = meta["nnnAdjustment"]["grossToNnnFactor"]
site_rows["rent_nnn_psf_yr"] = np.where(site_rows["svc_group"] == "GROSS", site_rows["rent_raw_psf_yr"] * FACTOR, site_rows["rent_raw_psf_yr"])
for d_ in (df, site_rows):
    d_["submarket"] = d_["submarket"].astype(str)
    d_["log_building_sf"] = np.log(d_["building_sf"].replace(0, np.nan))
    d_["log_space_sf"] = np.log(d_["space_sf"].clip(lower=50))
df["y"] = np.log(df["rent_nnn_psf_yr"])
df = df.reset_index(drop=True)
RET = (df["is_retail_use"] == 1).values

TE = ["submarket"]
CAT = ["market", "property_type", "property_subtype", "space_type", "floor_class", "rent_flavor", "svc_group"]
NUM_BASE = ["is_retail_use", "log_building_sf", "log_space_sf", "age", "year_built", "stories", "sf_share_of_building", "floor_no", "ground",
            "year_frac", "lat", "lng", "rest_kw", "other_avail_share", "other_avail_n", "cur_tenants", "cur_occupied_share"]
KNN = ["r_knn_med", "r_knn_dist", "r_knn_d1", "r_knn_size_med", "r_knn_n1km", "o_knn_med", "o_knn_dist"]
GROUPS = {
    "Location (lat/lng, market, submarket)": ["lat", "lng", "market", "submarket"],
    "Nearby comps (kNN rents)": KNN,
    "Space size": ["log_space_sf", "sf_share_of_building"],
    "Building (type, size, age, stories)": ["property_type", "property_subtype", "log_building_sf", "age", "year_built", "stories"],
    "Space attributes (floor, new/relet/sublet, restaurant words)": ["floor_class", "floor_no", "ground", "space_type", "rest_kw"],
    "Era (date on market / signed)": ["year_frac"],
    "Building vacancy proxies": ["other_avail_share", "other_avail_n", "cur_tenants", "cur_occupied_share"],
    "Rent basis (use, source, service type)": ["is_retail_use", "rent_flavor", "svc_group"],
}


# ---------------------------------------------------------------- neighbour features (train pool only)
def _rad(a):
    return np.radians(np.c_[a["lat"].values, a["lng"].values].astype(float))


def knn_features(q, pool, K=8, kq=60):
    """Median rent of the K nearest retail comps / nearby office buildings among `pool`, never the query's own building."""
    out = pd.DataFrame(np.nan, index=q.index, columns=KNN)
    qpid = q["property_id"].values
    qsf = q["space_sf"].values
    # --- retail comps: spaces
    pr = pool[pool["is_retail_use"] == 1]
    tree = BallTree(_rad(pr), metric="haversine")
    dist, idx = tree.query(_rad(q), k=min(kq, len(pr)))
    dist = dist * 6371.0
    ppid, prent, psf = pr["property_id"].values, pr["rent_nnn_psf_yr"].values, pr["space_sf"].values
    cols = np.full((len(q), 5), np.nan)
    for i in range(len(q)):
        m = ppid[idx[i]] != qpid[i]
        ii, dd = idx[i][m], dist[i][m]
        if len(ii) == 0:
            continue
        k = ii[:K]
        cols[i, 0] = np.median(prent[k])
        cols[i, 1] = dd[:K].mean()
        cols[i, 2] = dd[0]
        sm = (psf[ii] >= qsf[i] / 2) & (psf[ii] <= qsf[i] * 2)
        if sm.sum() >= 2:
            cols[i, 3] = np.median(prent[ii][sm][:K])
        cols[i, 4] = (dd <= 1.0).sum()
    out[KNN[:5]] = cols
    # --- office buildings: one row per property (median rent), so towers with hundreds of deals count once
    po = pool[pool["is_retail_use"] == 0].groupby("property_id").agg(lat=("lat", "first"), lng=("lng", "first"), r=("rent_nnn_psf_yr", "median")).reset_index()
    if len(po) > K:
        tree = BallTree(_rad(po), metric="haversine")
        dist, idx = tree.query(_rad(q), k=K + 1)
        dist = dist * 6371.0
        opid, orent = po["property_id"].values, po["r"].values
        oc = np.full((len(q), 2), np.nan)
        for i in range(len(q)):
            m = opid[idx[i]] != qpid[i]
            ii, dd = idx[i][m][:K], dist[i][m][:K]
            oc[i] = (np.median(orent[ii]), dd.mean())
        out[KNN[5:]] = oc
    return out


def design(q, pool):
    X = q[TE + CAT + NUM_BASE].copy()
    kf = knn_features(q, pool)
    for c in KNN:
        X[c] = kf[c].values
    return X


FEATS = TE + CAT + NUM_BASE + KNN


def make_model(params, quantile=None):
    pre = ColumnTransformer([
        ("te", TargetEncoder(target_type="continuous", random_state=0, smooth="auto"), TE),
        ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1, encoded_missing_value=-2, min_frequency=20), CAT),
        ("num", "passthrough", NUM_BASE + KNN)])
    kw = dict(max_depth=params["depth"], max_iter=params["iters"], learning_rate=params["lr"], min_samples_leaf=params["leaf"],
              l2_regularization=1.0, categorical_features=list(range(len(TE), len(TE) + len(CAT))), random_state=0)
    if quantile is not None:
        kw.update(loss="quantile", quantile=quantile)
    return make_pipeline(pre, HistGradientBoostingRegressor(**kw))


def fit_predict(train, test, params, office_weight=1.0, quantiles=False):
    """Train on `train`, predict log rent for `test`. Returns (pred, models, Xtest)."""
    Xtr, Xte = design(train, train), design(test, train)
    w = np.where(train["is_retail_use"].values == 1, 1.0, office_weight)
    keep = w > 0
    m = make_model(params)
    m.fit(Xtr[keep], train["y"].values[keep], histgradientboostingregressor__sample_weight=w[keep])
    res = {"pred": m.predict(Xte), "model": m, "X": Xte}
    if quantiles:
        for qn in (0.1, 0.9):
            mq = make_model(params, quantile=qn)
            mq.fit(Xtr[keep], train["y"].values[keep], histgradientboostingregressor__sample_weight=w[keep])
            res[f"q{qn}"] = mq.predict(Xte)
    return res


# ---------------------------------------------------------------- metrics
def metrics(y_true, y_pred):
    e = y_pred - y_true
    ape = np.abs(e) / y_true
    ss = ((y_true - y_true.mean()) ** 2).sum()
    return {"n": int(len(y_true)), "mae": float(np.abs(e).mean()), "mape": float(ape.mean()), "medianApe": float(np.median(ape)),
            "r2": float(1 - (e ** 2).sum() / ss), "rmseLog": float(np.sqrt(np.mean((np.log(y_pred) - np.log(y_true)) ** 2))), "bias": float(e.mean())}


def cluster_boot(y, preds, groups, fns, B=300, seed=0):
    """Property-cluster bootstrap 95% CIs for metric functions fn(y, pred)."""
    rng = np.random.default_rng(seed)
    ug, inv = np.unique(groups, return_inverse=True)
    members = [np.where(inv == g)[0] for g in range(len(ug))]
    out = {k: [] for k in fns}
    for _ in range(B):
        pick = rng.integers(0, len(ug), len(ug))
        ii = np.concatenate([members[g] for g in pick])
        for k, f in fns.items():
            out[k].append(f(y[ii], preds[ii], ii))
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in out.items()}


def folds(idx_rows, n_splits, seed=0):
    """Grouped folds by property; groups shuffled so folds are balanced."""
    g = df["property_id"].values[idx_rows]
    ug = np.unique(g)
    rng = np.random.default_rng(seed)
    rng.shuffle(ug)
    assign = {p: i % n_splits for i, p in enumerate(ug)}
    f = np.array([assign[p] for p in g])
    return [(idx_rows[f != k], idx_rows[f == k]) for k in range(n_splits)]


def conformal_q(resid, markets=None, by_market=False, lo=0.10, hi=0.90):
    if by_market and markets is not None:
        out = {}
        for m in np.unique(markets):
            r = resid[markets == m]
            out[m] = (float(np.quantile(r, lo)), float(np.quantile(r, hi))) if len(r) >= 100 else None
        gl = (float(np.quantile(resid, lo)), float(np.quantile(resid, hi)))
        return {m: (v or gl) for m, v in out.items()} | {"_all": gl}
    gl = (float(np.quantile(resid, lo)), float(np.quantile(resid, hi)))
    return {"_all": gl}


def apply_q(pred_log, markets, q):
    lo = np.array([q.get(m, q["_all"])[0] for m in markets])
    hi = np.array([q.get(m, q["_all"])[1] for m in markets])
    return np.exp(pred_log + lo), np.exp(pred_log + hi)


# ---------------------------------------------------------------- baselines
def baseline_preds(train, test):
    """submarket median, market median, kNN-comps median: from retail TRAINING rows (nnn rent)."""
    tr = train[train["is_retail_use"] == 1]
    mkt = tr.groupby("market")["rent_nnn_psf_yr"].median()
    sm = tr.groupby("submarket").agg(n=("rent_nnn_psf_yr", "size"), npr=("property_id", "nunique"), med=("rent_nnn_psf_yr", "median"))
    # a submarket median needs >=3 spaces on >=2 buildings; otherwise fall back to the market median
    sm = sm[(sm["n"] >= 3) & (sm["npr"] >= 2)]["med"]
    p_mkt = test["market"].map(mkt).values
    p_sm = test["submarket"].map(sm).fillna(test["market"].map(mkt)).values
    kf = knn_features(test, train)
    p_knn = kf["r_knn_med"].fillna(pd.Series(p_mkt, index=test.index)).values
    return {"marketMedian": p_mkt, "submarketMedian": p_sm, "knnCompsMedian": p_knn}


GRID = [
    {"depth": 4, "iters": 250, "lr": 0.05, "leaf": 20},
    {"depth": 6, "iters": 300, "lr": 0.05, "leaf": 20},
    {"depth": 3, "iters": 400, "lr": 0.05, "leaf": 30},
]
OFFICE_W = [0.0, 0.3, 1.0]
if QUICK:
    GRID, OFFICE_W = GRID[:1], [1.0]
ALL = np.arange(len(df))

# ---------------------------------------------------------------- 1. config search (grouped CV, retail rows scored)
print(f"[{time.time()-t0:.0f}s] rows {len(df)}, retail {RET.sum()}, properties {df.property_id.nunique()}", flush=True)
fo = folds(ALL, 5)
cfg_scores = []
oof_store = {}
CONFIGS = [(0, 0.0), (0, 0.3), (0, 1.0), (1, 0.3), (2, 0.3)] if not QUICK else [(0, 1.0)]
for gi, ow in CONFIGS:
    params = GRID[gi]
    if True:
        pred = np.full(len(df), np.nan)
        for tr_i, te_i in fo:
            te_r = te_i[RET[te_i]]
            pred[te_r] = fit_predict(df.iloc[tr_i], df.iloc[te_r], params, ow)["pred"]
        s = metrics(df["rent_nnn_psf_yr"].values[RET], np.exp(pred[RET]))
        cfg_scores.append({"grid": gi, "params": params, "officeWeight": ow, **s})
        oof_store[(gi, ow)] = pred
        print(f"[{time.time()-t0:.0f}s] cfg {gi} office_w={ow}: MAE {s['mae']:.2f} medAPE {s['medianApe']:.3f} R2 {s['r2']:.3f} rmseLog {s['rmseLog']:.3f}", flush=True)
best = min(cfg_scores, key=lambda s: s["rmseLog"])
BEST, BEST_OW = GRID[best["grid"]], best["officeWeight"]
print("best config:", BEST, "office weight", BEST_OW, flush=True)

# ---------------------------------------------------------------- 2. nested grouped CV with intervals, baselines, importances
yr_all = df["rent_nnn_psf_yr"].values
oof = np.full(len(df), np.nan)
oof_lo = np.full(len(df), np.nan)
oof_hi = np.full(len(df), np.nan)
oof_lo_g = np.full(len(df), np.nan)
oof_hi_g = np.full(len(df), np.nan)
oof_qlo = np.full(len(df), np.nan)
oof_qhi = np.full(len(df), np.nan)
base_oof = {k: np.full(len(df), np.nan) for k in ("marketMedian", "submarketMedian", "knnCompsMedian")}
fold_models = []
oof_resid_retail = []
for k, (tr_i, te_i) in enumerate(fo):
    te_r = te_i[RET[te_i]]
    tr = df.iloc[tr_i]
    res = fit_predict(tr, df.iloc[te_r], BEST, BEST_OW, quantiles=True)
    oof[te_r] = res["pred"]
    oof_qlo[te_r], oof_qhi[te_r] = np.exp(res["q0.1"]), np.exp(res["q0.9"])
    fold_models.append((res["model"], res["X"], te_r))
    # inner grouped CV on the training part -> out-of-fold residuals on its retail rows -> conformal quantiles
    tr_idx = np.arange(len(tr))
    g = tr["property_id"].values
    inner_pred = np.full(len(tr), np.nan)
    ug = np.unique(g)
    rng = np.random.default_rng(100 + k)
    rng.shuffle(ug)
    amap = {p: i % 4 for i, p in enumerate(ug)}
    fa = np.array([amap[p] for p in g])
    for j in range(4):
        itr, ite = tr_idx[fa != j], tr_idx[(fa == j) & (tr["is_retail_use"].values == 1)]
        inner_pred[ite] = fit_predict(tr.iloc[itr], tr.iloc[ite], BEST, BEST_OW)["pred"]
    rm = tr["is_retail_use"].values == 1
    resid = tr["y"].values[rm] - inner_pred[rm]
    qg = conformal_q(resid)
    qm = conformal_q(resid, tr["market"].values[rm], by_market=True)
    oof_lo_g[te_r], oof_hi_g[te_r] = apply_q(res["pred"], df["market"].values[te_r], qg)
    oof_lo[te_r], oof_hi[te_r] = apply_q(res["pred"], df["market"].values[te_r], qm)
    bp = baseline_preds(tr, df.iloc[te_r])
    for b_, v in bp.items():
        base_oof[b_][te_r] = v
    print(f"[{time.time()-t0:.0f}s] outer fold {k} done", flush=True)

yr = yr_all[RET]
grp = df["property_id"].values[RET]
mk = df["market"].values[RET]
p_model = np.exp(oof[RET])
cv = {"model": metrics(yr, p_model)}
for b_ in base_oof:
    cv[b_] = metrics(yr, base_oof[b_][RET])
cis = cluster_boot(yr, p_model, grp, {
    "mae": lambda y, p, ii: np.abs(p - y).mean(),
    "medianApe": lambda y, p, ii: np.median(np.abs(p - y) / y),
    "r2": lambda y, p, ii: 1 - ((p - y) ** 2).sum() / ((y - y.mean()) ** 2).sum(),
})
best_base = min(("submarketMedian", "knnCompsMedian"), key=lambda b_: cv[b_]["mae"])
pb = base_oof[best_base][RET]
ci_diff = cluster_boot(yr, p_model, grp, {"maeDiffVsBestBaseline": lambda y, p, ii: np.abs(p - y).mean() - np.abs(pb[ii] - y).mean()})
cv["modelCi95"] = cis
cv["bestBaseline"] = best_base
cv.update(ci_diff)
# NNN-quoted retail rows only: ground truth needs no service-type adjustment
nnn_q = (df["svc_group"].values[RET] == "NNN")
cv["modelNnnQuotedOnly"] = metrics(yr[nnn_q], p_model[nnn_q])
cv["submarketMedianNnnQuotedOnly"] = metrics(yr[nnn_q], base_oof["submarketMedian"][RET][nnn_q])
cv["listingsOnly"] = metrics(yr[df["source"].values[RET] == "listing"], p_model[df["source"].values[RET] == "listing"])
cv["listingsOnlySubmarketMedian"] = metrics(yr[df["source"].values[RET] == "listing"], base_oof["submarketMedian"][RET][df["source"].values[RET] == "listing"])
cv["byMarket"] = {m: {"model": metrics(yr[mk == m], p_model[mk == m]), "submarketMedian": metrics(yr[mk == m], base_oof["submarketMedian"][RET][mk == m])} for m in np.unique(mk)}


def cover(lo, hi):
    lo_, hi_ = lo[RET], hi[RET]
    ins = (yr >= lo_) & (yr <= hi_)
    return {"coverage": float(ins.mean()), "medianWidthPct": float(np.median((hi_ - lo_) / p_model)),
            "byMarket": {m: float(ins[mk == m].mean()) for m in np.unique(mk)}}


cv["intervals"] = {"conformalGlobal": cover(oof_lo_g, oof_hi_g), "conformalByMarket": cover(oof_lo, oof_hi), "quantileGbm": cover(oof_qlo, oof_qhi)}
print(json.dumps({k: cv[k] for k in ("model", "marketMedian", "submarketMedian", "knnCompsMedian", "intervals")}, indent=1), flush=True)
use_by_market = abs(cv["intervals"]["conformalByMarket"]["coverage"] - 0.8) <= abs(cv["intervals"]["conformalGlobal"]["coverage"] - 0.8) + 0.005
interval_kind = "conformalByMarket" if use_by_market else "conformalGlobal"

# ---------------------------------------------------------------- 3. time-based check
CUT = 2024.0
tr_t = df[df["year_frac"] < CUT]
te_t = df[(df["year_frac"] >= CUT) & RET]
res_t = fit_predict(tr_t, te_t, BEST, BEST_OW, quantiles=True)
g = tr_t["property_id"].values
ug = np.unique(g)
rng = np.random.default_rng(7)
rng.shuffle(ug)
amap = {p: i % 4 for i, p in enumerate(ug)}
fa = np.array([amap[p] for p in g])
inner = np.full(len(tr_t), np.nan)
ti = np.arange(len(tr_t))
for j in range(4):
    itr, ite = ti[fa != j], ti[(fa == j) & (tr_t["is_retail_use"].values == 1)]
    inner[ite] = fit_predict(tr_t.iloc[itr], tr_t.iloc[ite], BEST, BEST_OW)["pred"]
rm = tr_t["is_retail_use"].values == 1
resid_t = tr_t["y"].values[rm] - inner[rm]
qt = conformal_q(resid_t, tr_t["market"].values[rm], by_market=use_by_market)
lo_t, hi_t = apply_q(res_t["pred"], te_t["market"].values, qt)
yt = te_t["rent_nnn_psf_yr"].values
bt = baseline_preds(tr_t, te_t)
ins_t = (yt >= lo_t) & (yt <= hi_t)
ins_q = (yt >= np.exp(res_t["q0.1"])) & (yt <= np.exp(res_t["q0.9"]))
time_check = {
    "split": "train on all rows dated before 2024-01-01, test on retail-use rows dated 2024-01-01 onwards",
    "train": {"n": int(len(tr_t)), "retailN": int(rm.sum())}, "test": {"n": int(len(te_t))},
    "model": metrics(yt, np.exp(res_t["pred"])),
    **{b_: metrics(yt, v) for b_, v in bt.items()},
    "interval": {"kind": interval_kind, "coverage": float(ins_t.mean()), "medianWidthPct": float(np.median((hi_t - lo_t) / np.exp(res_t["pred"]))),
                 "quantileGbmCoverage": float(ins_q.mean())},
}
# same model without the era feature: does it generalise forward without knowing the date?
print("time check:", json.dumps({k: time_check[k] for k in ("model", "marketMedian", "submarketMedian", "knnCompsMedian", "interval")}, indent=1), flush=True)

# ---------------------------------------------------------------- 4. importances (permutation on out-of-fold test folds)
def perm_importance(cols, reps=3):
    base, drops = [], []
    rng = np.random.default_rng(0)
    for model, X, te_r in fold_models:
        y = df["y"].values[te_r]
        base.append(np.sqrt(np.mean((model.predict(X) - y) ** 2)))
        d = []
        for _ in range(reps):
            Xp = X.copy()
            perm = rng.permutation(len(X))
            for c in cols:
                Xp[c] = X[c].values[perm]
            d.append(np.sqrt(np.mean((model.predict(Xp) - y) ** 2)) - base[-1])
        drops.append(np.mean(d))
    return float(np.mean(drops)), float(np.std(drops))


imp_groups = []
for gname, cols in GROUPS.items():
    m_, s_ = perm_importance(cols)
    imp_groups.append({"group": gname, "rmseLogIncrease": m_, "std": s_, "features": cols})
imp_feats = []
for c in FEATS:
    m_, s_ = perm_importance([c], reps=2)
    imp_feats.append({"feature": c, "rmseLogIncrease": m_, "std": s_})
imp_groups.sort(key=lambda r: -r["rmseLogIncrease"])
imp_feats.sort(key=lambda r: -r["rmseLogIncrease"])
print("importances:", [(r["group"][:30], round(r["rmseLogIncrease"], 3)) for r in imp_groups], flush=True)

# ---------------------------------------------------------------- 6. calibration of interval + residual quantiles for shipping
resid_all = (df["y"].values - oof)[RET]
q_ship = conformal_q(resid_all, mk, by_market=use_by_market)
print("shipping interval offsets (log):", q_ship, flush=True)

# ---------------------------------------------------------------- 7. demo sites (leave the site's building out of training and pool)
sites_out = {}
asof = DATA_DATE_FRAC
retail_pool_all = df[df["is_retail_use"] == 1]
for _, srow in site_rows.iterrows():
    sid = str(srow["site_id"])
    sj = json.load(open(os.path.join(ROOT, "data", "sites", f"{sid}.json"), encoding="utf-8"))
    sp = sj["space"]
    q = pd.DataFrame([srow]).copy()
    q["year_frac"] = asof
    q["rent_flavor"], q["svc_group"] = "listing_ask", "NNN"
    q["y"] = np.nan
    q["submarket"] = q["submarket"].astype(str)
    for c in ("log_building_sf", "log_space_sf"):
        q[c] = {"log_building_sf": np.log(srow["building_sf"]) if srow["building_sf"] else np.nan, "log_space_sf": np.log(max(srow["space_sf"], 50))}[c]
    train = df[df["property_id"] != srow["property_id"]]
    res = fit_predict(train, q, BEST, BEST_OW)
    mu = float(res["pred"][0])
    lo_, hi_ = apply_q(np.array([mu]), q["market"].values, q_ship)
    fair, lo_v, hi_v = float(np.exp(mu)), float(lo_[0]), float(hi_[0])
    asking_q = float(sp["rentPerSfYr"]) if sp.get("rentPerSfYr") else None
    asking_nnn = float(srow["rent_nnn_psf_yr"])
    bpred = baseline_preds(train, q)
    # comparable spaces: nearest retail-use spaces dated 2019+, similar size, other buildings, one per building
    cand = retail_pool_all[(retail_pool_all["property_id"] != srow["property_id"]) & (retail_pool_all["year_frac"] >= 2019.0)].copy()
    rad = np.radians
    lat0, lng0 = rad(srow["lat"]), rad(srow["lng"])
    la, ln = rad(cand["lat"].values), rad(cand["lng"].values)
    a = np.sin((la - lat0) / 2) ** 2 + np.cos(lat0) * np.cos(la) * np.sin((ln - lng0) / 2) ** 2
    cand["dist_km"] = 2 * 6371.0 * np.arcsin(np.sqrt(a))
    ratio = cand["space_sf"] / srow["space_sf"]
    cand["size_ok"] = (ratio >= 0.4) & (ratio <= 2.5)
    cand = cand.sort_values(["size_ok", "dist_km"], ascending=[False, True])
    cand = cand[cand["size_ok"]]
    cand = cand.sort_values("dist_km").drop_duplicates("property_id").head(5)
    comps = [{"propertyId": int(r["property_id"]), "address": r["address"], "suite": (None if pd.isna(r["suite"]) else str(r["suite"])), "sf": float(r["space_sf"]),
              "rentPerSfYr": round(float(r["rent_raw_psf_yr"]), 2), "serviceType": r["svc_group"], "rentNnnEquivPerSfYr": round(float(r["rent_nnn_psf_yr"]), 2),
              "distanceKm": round(float(r["dist_km"]), 2), "date": r["date"], "source": ("listing" if r["source"] == "listing" else "lease deal (" + r["rent_flavor"].replace("deal_", "") + ")")}
             for _, r in cand.iterrows()]
    gap_psf = asking_nnn - fair
    if asking_nnn > hi_v:
        band = "above market"
    elif asking_nnn < lo_v:
        band = "below market"
    else:
        band = "in line"
    sites_out[sid] = {
        "siteId": sid, "address": sj["address"], "city": sj["city"], "suite": sp.get("suite"), "spaceId": sp["spaceId"], "sf": sp["sf"],
        "fairRentPerSfYr": round(fair, 2), "intervalLowPerSfYr": round(lo_v, 2), "intervalHighPerSfYr": round(hi_v, 2), "intervalLevel": 0.8,
        "askingRentPerSfYr": asking_q, "askingServiceType": sp.get("serviceType"), "askingNnnEquivPerSfYr": round(asking_nnn, 2),
        "gapPerSfYr": round(gap_psf, 2), "gapPerYr": round(gap_psf * sp["sf"]), "gapPct": round(gap_psf / fair, 3),
        "fairRentPerYr": round(fair * sp["sf"]), "intervalLowPerYr": round(lo_v * sp["sf"]), "intervalHighPerYr": round(hi_v * sp["sf"]),
        "band": band,
        "baselines": {"submarketMedianPerSfYr": round(float(bpred["submarketMedian"][0]), 2), "knnCompsMedianPerSfYr": round(float(bpred["knnCompsMedian"][0]), 2)},
        "comps": comps,
        "basisUncertain": bool(sp.get("serviceType") not in (None, "NNN")),
        "notes": ("Quoted on a gross basis (" + str(sp.get("serviceType")) + "). The asking rent was converted to NNN with the data-derived factor, but in this kit gross-quoted retail spaces are cheaper than NNN-quoted ones even in the same building, so the conversion probably overstates the gap: treat the verdict as unreliable. Prediction trained without this building." if sp.get("serviceType") not in (None, "NNN") else "Prediction trained without this building."),
    }
    print(f"site {sid} {sj['address'][:28]:28s} asking {asking_nnn:6.2f}  fair {fair:6.2f} [{lo_v:6.2f}, {hi_v:6.2f}]  {band}  baselines sub {bpred['submarketMedian'][0]:.1f} knn {bpred['knnCompsMedian'][0]:.1f}", flush=True)

# ---------------------------------------------------------------- 8. export
MODEL_CARD = {
    "data": "CoStar hackathon kit, Houston and Los Angeles: active for-lease listing spaces with a rate, plus lease deals with a rent (contract or quoted asking), retail-use and office spaces.",
    "unit": "asking rent, $/SF/yr, NNN-equivalent",
    "features": "market, submarket (target-encoded), property type and subtype, building SF, age, stories, space SF and share of building, floor, relet/new/sublet, era, lat/lng, rents of nearby retail comps and office buildings (training rows only, own building excluded), restaurant words, vacancy proxies, rent basis (source, service type)",
    "intendedUse": "A rough fair-asking-rent range beside a listing's ask, to size a negotiation. Not an appraisal, not a forecast of what a lease will settle at, not for lending.",
    "limits": [
        "Asking rents, not achieved rents: concessions, free rent and tenant-improvement allowances are not in the data.",
        "NNN-equivalent conversion for gross rents uses one data-derived factor; retail-only data points the other way (mix effect), so retail gross conversions are uncertain.",
        "Only 1,196 retail-use rows on about 360 buildings; much of the training data is office rent, which carries a use flag.",
        "Most rows are lease-deal records whose rate is the quoted asking rent at signing; their dates are signing dates, not today's market.",
        "Houston and Los Angeles only; 12 demo sites cannot validate a model.",
        "No photos, frontage, visibility, co-tenancy, traffic counts or build-out condition.",
        "Intervals are calibrated on held-out buildings; individual spaces can fall well outside them.",
    ],
    "date": str(pd.Timestamp.today().date()),
}
nnn = meta["nnnAdjustment"]
model_json = {
    "name": "Foreground fair-rent model", "version": "1.0", "trainedOn": str(pd.Timestamp.today().date()), "dataDate": meta["dataDate"],
    "target": "asking rent, $/SF/yr, NNN-equivalent, for a retail / restaurant-suitable space",
    "algorithm": f"HistGradientBoostingRegressor on log rent (depth {BEST['depth']}, {BEST['iters']} trees, lr {BEST['lr']}, min leaf {BEST['leaf']}); submarket target-encoded with cross-fitting; office rows weight {BEST_OW}; 80% interval by split-conformal on out-of-fold residuals" + (" per market" if use_by_market else ""),
    "dataset": {"rows": meta["rows"], "retailRows": meta["retailRows"], "properties": meta["properties"], "retailProperties": int(df[RET]["property_id"].nunique()),
                "bySource": meta["bySource"], "byFlavor": meta["byFlavor"], "byUse": meta["byUse"], "byMarket": meta["byMarket"],
                "retailByMarket": df[RET]["market"].value_counts().to_dict(), "retailBySource": df[RET]["source"].value_counts().to_dict(),
                "dateRange": meta["dateRange"], "features": FEATS, "outliersDropped": meta["outliersDropped"], "outlierRule": meta["outlierRule"],
                "dropCounts": meta["dropCounts"], "unknownServiceRowsDropped": nnn["unknownServiceRowsDropped"]},
    "nnnAdjustment": {"grossToNnnFactor": nnn["grossToNnnFactor"], "grossOverNnnRatio": nnn["grossOverNnnRatio"], "applied": nnn["chosen"],
                      "estimates": nnn["estimates"], "method": "OLS of log(rent) on gross-vs-NNN service group with submarket fixed effects, use, log SF, property type, era; NNN-equivalent = gross x factor",
                      "note": "The retail-only estimate has the wrong sign (gross-quoted retail is cheaper, a mix effect) and is reported but not applied; the model also sees service type as a feature."},
    "chosenConfig": {"params": BEST, "officeWeight": BEST_OW, "search": cfg_scores},
    "metrics": {"groupedCv": {"folds": 5, "scope": "retail-use rows, no building in both train and test", **cv}, "timeSplit": time_check},
    "intervals": {"level": 0.8, "kind": interval_kind, "logOffsets": {k: list(v) for k, v in q_ship.items()},
                  "groupedCvCoverage": cv["intervals"], "timeSplitCoverage": time_check["interval"]},
    "featureImportance": {"method": "permutation on out-of-fold test folds, increase in RMSE of log rent (higher = more important)", "groups": imp_groups, "features": imp_feats},
}
model_json["modelCard"] = MODEL_CARD
json.dump(model_json, open(os.path.join(D, "rent-model.json"), "w", encoding="utf-8"), indent=1, default=float)
json.dump({"model": "fair-rent v1.0", "dataDate": meta["dataDate"], "intervalLevel": 0.8, "sites": sites_out}, open(os.path.join(D, "rent-sites.json"), "w", encoding="utf-8"), indent=1)
print(f"[{time.time()-t0:.0f}s] done")
