"""k-nearest-neighbour peer model over food-service tenancy spells.

Question answered: for a target site and concept, how did the nearest comparable food businesses in the CoStar kit fare?
It is NOT a per-site success forecast. The kit lists only Matterport-covered buildings, so peers are sparse (see docs/models/business-knn.md).

Distance (documented, standardised, mixed). For target t and peer j:
    d2(t, j) = (D_mi / h)^2                          great-circle distance in miles over a bandwidth h (the geographic term)
             + w_kind  * (1 - s_kind)^2             s_kind = similarity of j's kind to the target concept (kinds.CONCEPT_SIMILARITY)
             + w_size  * (ln(sqft_j / sqft_t))^2     size ratio (term is 0 when either size is unknown)
             + w_class * ((class_t - class_j) / 3)^2 building class A..F ordinal (0 when unknown)
             + w_age   * ((year_t - year_j) / 50)^2  building age (0 when unknown)
             + w_ptype * [property type differs]
Peers in another market are excluded outright. Neighbours are the k smallest d2; each gets kernel weight exp(-d2/2).
Outcome statistics are weighted Kaplan-Meier (any tenancy end) and weighted Aalen-Johansen (clear closure, CoStar reason 4, with
other exits as a competing risk), shrunk toward the market prior by m pseudo-neighbours. Weights are learned/selected by cross-validation.
"""
from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass, field
from datetime import date

import numpy as np

from forecasting.peers import kinds
from forecasting.peers.data import CLASS_ORDINAL, haversine_miles

DAYS = 365.25
HORIZONS = (1.0, 2.0, 3.0, 5.0)
KIND_INDEX = {k: i for i, k in enumerate(kinds.KINDS)}
# concept used when a spell is itself the target (evaluation only): what kind of business is this?
KIND_TO_CONCEPT = {"cafe_coffee": "cafe", "bakery": "bakery", "dessert_drink": "cafe", "bar": "bar", "quick_service": "quick_service",
                   "full_service": "restaurant", "unclassified_food": None, "non_restaurant": None}
MIN_NEFF_AT_RISK = 3.0  # fewer effective at-risk neighbours at a horizon than this: the horizon is "not evaluable" and the prior is used


@dataclass(frozen=True)
class Params:
    k: int = 20
    h_miles: float = 2.0
    w_kind: float = 1.0
    w_size: float = 0.0
    w_class: float = 0.0
    w_age: float = 0.0
    w_ptype: float = 0.0
    shrink_m: float = 5.0

    def metric_dict(self) -> dict:
        return asdict(self)


@dataclass
class Target:
    lat: float
    lon: float
    market: str
    concept: str | None = "cafe"
    sqft: float | None = None
    bclass: str | None = None
    year_built: int | None = None
    ptype: int | None = None
    start_day: float | None = None  # evaluation only: the as-of day (ordinal) at which the target spell starts
    property_id: int | None = None
    kind: str | None = None  # evaluation only: the target spell's own kind


class SpellTable:
    """Column store of peer spells (numpy). Built from the dicts produced by data.load_kit / loaded from the artifact."""

    def __init__(self, spells: list[dict]):
        self.spells = spells
        n = len(spells)
        f = lambda key, default=np.nan: np.array([default if s.get(key) is None else s[key] for s in spells], dtype=float)  # noqa: E731
        self.n = n
        self.lat, self.lon = f("lat"), f("lon")
        self.market = np.array([s["market"] for s in spells], dtype=object)
        self.kind = np.array([KIND_INDEX[s["kind"]] for s in spells], dtype=int)
        self.sqft = f("sqft")
        self.cls = np.array([CLASS_ORDINAL.get(s.get("bclass"), np.nan) for s in spells], dtype=float)
        self.year = f("yearBuilt")
        self.ptype = f("ptype")
        self.start = np.array([_day(s["start"]) for s in spells], dtype=float)
        self.end = np.array([_day(s["end"]) if s.get("end") else np.nan for s in spells], dtype=float)
        self.etype = np.array([s["etype"] for s in spells], dtype=int)
        self.prop = np.array([s["propertyId"] for s in spells], dtype=int)
        self.demo = np.array([bool(s.get("demo")) for s in spells], dtype=bool)
        self.ids = [s["id"] for s in spells]
        self.years = np.array([s["years"] for s in spells], dtype=float)
        self._coslat = np.cos(np.radians(self.lat))


def _day(d) -> float:
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return float(d.toordinal())


# ------------------------------------------------------------------ distance
def components(t: Target, tab: SpellTable) -> dict[str, np.ndarray]:
    """Per-peer standardised distance components (before weights). Missing features contribute 0 (an unknown is not a difference)."""
    p1, p2 = np.radians(t.lat), np.radians(tab.lat)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(tab.lon - t.lon) / 2) ** 2
    geo = 3958.8 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    sim = np.array([kinds.similarity(t.concept, k) if t.concept else np.nan for k in kinds.KINDS])[tab.kind]
    kind_c = np.where(np.isnan(sim), 0.0, (1.0 - sim) ** 2)
    size = np.zeros(tab.n)
    if t.sqft and t.sqft > 0:
        with np.errstate(invalid="ignore", divide="ignore"):
            size = np.nan_to_num(np.log(tab.sqft / t.sqft) ** 2, nan=0.0, posinf=0.0, neginf=0.0)
    cls = np.zeros(tab.n)
    if t.bclass in CLASS_ORDINAL:
        cls = np.nan_to_num(((CLASS_ORDINAL[t.bclass] - tab.cls) / 3.0) ** 2, nan=0.0)
    age = np.zeros(tab.n)
    if t.year_built:
        age = np.nan_to_num(((t.year_built - tab.year) / 50.0) ** 2, nan=0.0)
    pt = np.zeros(tab.n)
    if t.ptype is not None:
        pt = np.where(np.isnan(tab.ptype), 0.0, (tab.ptype != t.ptype).astype(float))
    return {"geo_mi": geo, "kind_sim": sim, "kind": kind_c, "size": size, "class": cls, "age": age, "ptype": pt}


def combine(c: dict[str, np.ndarray], p: Params) -> np.ndarray:
    return (c["geo_mi"] / p.h_miles) ** 2 + p.w_kind * c["kind"] + p.w_size * c["size"] + p.w_class * c["class"] + p.w_age * c["age"] + p.w_ptype * c["ptype"]


# ------------------------------------------------------------------ weighted survival
def weighted_curves(dur: np.ndarray, ev: np.ndarray, w: np.ndarray, horizon: float) -> dict:
    """Weighted Kaplan-Meier (event = any end) and Aalen-Johansen (cause 1 = clear closure) up to `horizon` years.
    dur years, ev in {0 censored, 1 closure, 2 other exit}, w >= 0. Returns survival, closure cif, n_eff at risk at the horizon."""
    order = np.argsort(dur, kind="stable")
    d, e, ww = dur[order], ev[order], w[order]
    total = ww.sum()
    s, cif, i, n = 1.0, 0.0, 0, len(d)
    atrisk = total
    while i < n and d[i] <= horizon:
        t = d[i]
        d1 = d2 = c = 0.0
        while i < n and d[i] == t:
            d1 += ww[i] * (e[i] == 1)
            d2 += ww[i] * (e[i] == 2)
            c += ww[i] * (e[i] == 0)
            i += 1
        if atrisk > 1e-12:
            cif += s * d1 / atrisk
            s *= 1.0 - (d1 + d2) / atrisk
        atrisk -= d1 + d2 + c
    wr = w[dur >= horizon]
    n_eff = float(wr.sum() ** 2 / (wr ** 2).sum()) if wr.size and (wr ** 2).sum() > 0 else 0.0
    return {"survival": float(s), "closure": float(cif), "nEffAtRisk": n_eff, "atRiskShare": float(wr.sum() / total) if total > 0 else 0.0}


def km_median(dur: np.ndarray, ev: np.ndarray, w: np.ndarray) -> float | None:
    """Weighted Kaplan-Meier median time to tenancy end; None when the curve never reaches 0.5 (median not reached)."""
    order = np.argsort(dur, kind="stable")
    d, e, ww = dur[order], ev[order], w[order]
    s, i, n, atrisk = 1.0, 0, len(d), ww.sum()
    while i < n:
        t = d[i]
        ends = cen = 0.0
        while i < n and d[i] == t:
            ends += ww[i] * (e[i] != 0)
            cen += ww[i] * (e[i] == 0)
            i += 1
        if atrisk > 1e-12:
            s *= 1.0 - ends / atrisk
        if s <= 0.5:
            return float(t)
        atrisk -= ends + cen
    return None


def weighted_median(x: np.ndarray, w: np.ndarray) -> float | None:
    if x.size == 0 or w.sum() <= 0:
        return None
    o = np.argsort(x)
    cw = np.cumsum(w[o]) / w.sum()
    return float(x[o][np.searchsorted(cw, 0.5)])


# ------------------------------------------------------------------ as-of observation
def observed(tab: SpellTable, as_of_day: float | None, asof_global: float) -> tuple[np.ndarray, np.ndarray]:
    """(duration years, event code) of every spell as known at `as_of_day`: spells that ended later are censored at that day.
    as_of_day None = the data window end (what is observed today)."""
    if as_of_day is None:
        return tab.years.copy(), tab.etype.copy()
    ended = ~np.isnan(tab.end) & (tab.end <= as_of_day) & (tab.etype != 0)
    stop = np.where(ended, tab.end, as_of_day)
    return np.maximum((stop - tab.start) / DAYS, 1e-6), np.where(ended, tab.etype, 0)


# ------------------------------------------------------------------ prior
def prior(tab: SpellTable, dur, ev, mask: np.ndarray) -> dict:
    """Unweighted market prior over the masked spells: survival and closure incidence at each horizon."""
    out = {}
    w = mask.astype(float)
    for h in HORIZONS:
        out[h] = weighted_curves(dur[mask], ev[mask], w[mask], h) if mask.any() else {"survival": float("nan"), "closure": float("nan"), "nEffAtRisk": 0.0, "atRiskShare": 0.0}
    return out


# ------------------------------------------------------------------ prediction
def neighbours(t: Target, tab: SpellTable, p: Params, candidate: np.ndarray, comps: dict | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
    """(indices of the k nearest candidates, normalised kernel weights, components). Peers in another market are excluded."""
    c = comps or components(t, tab)
    d2 = combine(c, p)
    ok = candidate & (tab.market == t.market)
    idx = np.flatnonzero(ok)
    if idx.size == 0:
        return idx, np.array([]), c
    top = idx[np.argsort(d2[idx], kind="stable")[: p.k]]
    w = np.exp(-(d2[top] - d2[top].min()) / 2.0)  # relative to the nearest, so a far-away nearest peer does not underflow to zero weight
    return top, w / w.sum(), c


def estimate(dur: np.ndarray, ev: np.ndarray, w: np.ndarray, prior_stats: dict, m: float) -> dict:
    """Shrunk outcome statistics at each horizon from the neighbours' (dur, ev, w) and the market prior."""
    out = {}
    for h in HORIZONS:
        c = weighted_curves(dur, ev, w, h)
        pr = prior_stats[h]
        ok = c["nEffAtRisk"] >= MIN_NEFF_AT_RISK
        n = c["nEffAtRisk"] if ok else 0.0
        den = n + m
        if den <= 0:
            surv, clo = (pr["survival"], pr["closure"])
        else:
            surv = (n * c["survival"] + m * pr["survival"]) / den if ok else pr["survival"]
            clo = (n * c["closure"] + m * pr["closure"]) / den if ok else pr["closure"]
        out[h] = {"survival": surv, "closure": clo, "nEff": c["nEffAtRisk"], "evaluable": bool(ok)}
    return out


def predict(t: Target, tab: SpellTable, p: Params, as_of_day: float | None = None, exclude: np.ndarray | None = None,
            reps: int = 0, seed: int = 11, asof_global: float | None = None, _cache: dict | None = None) -> dict:
    """Outcome statistics for a target from its k nearest peers. as_of_day: only peers that started before it, with outcomes as known then
    (evaluation / no-leak mode). exclude: boolean mask of spells that must not be used (the target itself, optionally its building)."""
    cand = np.ones(tab.n, dtype=bool)
    if as_of_day is not None:
        cand &= tab.start < as_of_day
    if exclude is not None:
        cand &= ~exclude
    dur, ev = observed(tab, as_of_day, asof_global or 0.0)
    cache = _cache if _cache is not None else {}
    if "prior" not in cache:  # independent of the parameters: reused across a tuning sweep
        cache.setdefault("comps", components(t, tab))
        cache["prior"] = prior(tab, dur, ev, cand & (tab.market == t.market))
    idx, w, comps = neighbours(t, tab, p, cand, cache["comps"])
    pri = cache["prior"]
    if idx.size == 0:
        return {"neighbours": [], "prior": pri, "estimate": None, "n": 0}
    est = estimate(dur[idx], ev[idx], w, pri, p.shrink_m)
    done = ev[idx] != 0
    med_done = weighted_median(dur[idx][done], w[done]) if done.any() else None
    out = {"idx": idx, "w": w, "dist": comps["geo_mi"][idx], "estimate": est, "prior": pri, "n": int(idx.size),
           "nEff": float(1.0 / (w ** 2).sum()), "medianCompleted": med_done, "kmMedian": km_median(dur[idx], ev[idx], w),
           "shareOpen": float(w[ev[idx] == 0].sum()) if as_of_day is None else None}
    if reps:
        rng = random.Random(seed)
        groups: dict = {}
        for j, i in enumerate(idx):
            groups.setdefault(int(tab.prop[i]), []).append(j)
        keys = list(groups)
        boots = {h: ([], []) for h in HORIZONS}
        med_b, open_b = [], []
        for _ in range(reps):
            js = np.array([j for k_ in (rng.choice(keys) for _ in keys) for j in groups[k_]])
            wb = w[js] / w[js].sum()
            eb = estimate(dur[idx][js], ev[idx][js], wb, pri, p.shrink_m)
            for h in HORIZONS:
                boots[h][0].append(eb[h]["survival"])
                boots[h][1].append(eb[h]["closure"])
            done_b = ev[idx][js] != 0
            med_b.append(weighted_median(dur[idx][js][done_b], wb[done_b]) if done_b.any() else np.nan)
            open_b.append(float(wb[ev[idx][js] == 0].sum()))
        q = lambda a: (float(np.nanpercentile(a, 5)), float(np.nanpercentile(a, 95)))  # noqa: E731
        out["ci"] = {h: {"survival": q(boots[h][0]), "closure": q(boots[h][1])} for h in HORIZONS}
        out["ciMedianCompleted"] = q(med_b) if not np.all(np.isnan(med_b)) else None
        out["ciShareOpen"] = q(open_b)
    return out


# ------------------------------------------------------------------ evaluation
def labels(tab: SpellTable, horizon: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(evaluable, y_closure, y_end) for 'closed / ended within horizon years of starting', from today's observed outcomes.
    A spell still open with less than `horizon` years of follow-up is NOT evaluable (not labelled 0). Other exits count as
    not-closed for y_closure (a competing outcome), as ended for y_end."""
    ended_in = (tab.etype != 0) & (tab.years <= horizon)
    followed = tab.years >= horizon
    ev = ended_in | followed
    y_end = ended_in.astype(float)
    y_clo = ((tab.etype == 1) & (tab.years <= horizon)).astype(float)
    return ev, y_clo, y_end


def brier(p: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def auc(p: np.ndarray, y: np.ndarray) -> float | None:
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return None
    ranks = _rank(np.concatenate([pos, neg]))
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def _rank(x: np.ndarray) -> np.ndarray:
    order = np.argsort(x, kind="stable")
    r = np.empty(len(x))
    r[order] = np.arange(1, len(x) + 1)
    for v in np.unique(x):  # average ranks over ties
        m = x == v
        if m.sum() > 1:
            r[m] = r[m].mean()
    return r


def target_for_spell(tab: SpellTable, i: int) -> Target:
    s = tab.spells[i]
    return Target(lat=s["lat"], lon=s["lon"], market=s["market"], concept=KIND_TO_CONCEPT.get(s["kind"]), sqft=s.get("sqft"), bclass=s.get("bclass"),
                  year_built=s.get("yearBuilt"), ptype=s.get("ptype"), start_day=tab.start[i], property_id=s["propertyId"], kind=s["kind"])


def loo_predictions(tab: SpellTable, targets: np.ndarray, p: Params, same_building: bool = True, as_of: bool = True,
                    horizon: float = 2.0, cache: dict | None = None, block_miles: float = 0.0) -> dict:
    """Leave-one-out predictions for the target spells (indices). as_of=True is the no-leak protocol: peers that started before the target,
    with their outcomes censored at the target's start. same_building=False also removes the target's building (a site in a building the
    kit has no food history for). Returns arrays aligned with `targets`: kNN and prior-only predictions of closure and ended within horizon."""
    out = {"knn_close": [], "knn_end": [], "prior_close": [], "prior_end": [], "glob_close": [], "glob_end": [], "med_pred": [], "med_glob": [], "n": []}
    for i in targets:
        t = target_for_spell(tab, i)
        ex = np.zeros(tab.n, dtype=bool)
        ex[i] = True
        if not same_building:
            ex |= tab.prop == tab.prop[i]
        ci = cache.setdefault(int(i), {}) if cache is not None else None
        if block_miles:  # spatial block: also remove every peer within block_miles (a site with no kit peers nearby)
            if ci is not None and "comps" not in ci:
                ci["comps"] = components(t, tab)
            geo = ci["comps"]["geo_mi"] if ci is not None else components(t, tab)["geo_mi"]
            ex |= geo < block_miles
        r = predict(t, tab, p, as_of_day=tab.start[i] if as_of else None, exclude=ex, _cache=ci)
        if ci is not None and "glob" in ci:
            glob = ci["glob"]
        else:
            glob = _global_prior(tab, ex, tab.start[i] if as_of else None, horizon)
            if ci is not None:
                ci["glob"] = glob
        if r.get("estimate") is None:
            out["knn_close"].append(np.nan); out["knn_end"].append(np.nan)
            out["prior_close"].append(glob[0]); out["prior_end"].append(glob[1])
            out["med_pred"].append(np.nan); out["n"].append(0)
        else:
            e = r["estimate"][horizon]
            pr = r["prior"][horizon]
            out["knn_close"].append(e["closure"]); out["knn_end"].append(1.0 - e["survival"])
            out["prior_close"].append(pr["closure"]); out["prior_end"].append(1.0 - pr["survival"])
            out["med_pred"].append(np.nan if r["medianCompleted"] is None else r["medianCompleted"]); out["n"].append(r["n"])
        out["glob_close"].append(glob[0]); out["glob_end"].append(glob[1]); out["med_glob"].append(glob[2])
    return {k: np.array(v, dtype=float) for k, v in out.items()}


def _global_prior(tab: SpellTable, exclude: np.ndarray, as_of_day: float | None, horizon: float) -> tuple[float, float, float]:
    cand = ~exclude
    if as_of_day is not None:
        cand &= tab.start < as_of_day
    dur, ev = observed(tab, as_of_day, 0.0)
    if not cand.any():
        return float("nan"), float("nan"), float("nan")
    c = weighted_curves(dur[cand], ev[cand], np.ones(int(cand.sum())), horizon)
    done = cand & (ev != 0)
    med = float(np.median(dur[done])) if done.any() else float("nan")
    return c["closure"], 1.0 - c["survival"], med


def evaluate_split(tab: SpellTable, target_idx: np.ndarray, p: Params, **kw) -> dict:
    """Scores for one set of targets: Brier/AUC for closed-within-2y and ended-within-2y vs. the market prior and the global prior;
    MAE of completed tenure vs the global median of completed tenures. NaN predictions (no peers yet) fall back to the global prior."""
    ev, y_clo, y_end = labels(tab, 2.0)
    keep = np.array([i for i in target_idx if ev[i]], dtype=int)
    r = loo_predictions(tab, keep, p, **kw)
    glob_c, glob_e = r["glob_close"], r["glob_end"]
    ok = ~np.isnan(glob_c)
    keep, ok_r = keep[ok], {k: v[ok] for k, v in r.items()}
    knn_c = np.where(np.isnan(ok_r["knn_close"]), ok_r["glob_close"], ok_r["knn_close"])
    knn_e = np.where(np.isnan(ok_r["knn_end"]), ok_r["glob_end"], ok_r["knn_end"])
    mkt_c = np.where(np.isnan(ok_r["prior_close"]), ok_r["glob_close"], ok_r["prior_close"])
    mkt_e = np.where(np.isnan(ok_r["prior_end"]), ok_r["glob_end"], ok_r["prior_end"])
    yc, ye = y_clo[keep], y_end[keep]
    done = tab.etype[keep] != 0
    mae = {}
    if done.any():
        truth = tab.years[keep][done]
        pred = np.where(np.isnan(ok_r["med_pred"][done]), ok_r["med_glob"][done], ok_r["med_pred"][done])
        gl = np.where(np.isnan(ok_r["med_glob"][done]), np.nanmedian(truth), ok_r["med_glob"][done])
        mae = {"knn": float(np.mean(np.abs(pred - truth))), "globalMedian": float(np.mean(np.abs(gl - truth))), "n": int(done.sum())}
    return {"n": int(len(keep)), "nClosed2y": int(yc.sum()), "nEnded2y": int(ye.sum()),
            "constantOracleBrier": {"closure2y": float(yc.mean() * (1 - yc.mean())), "ended2y": float(ye.mean() * (1 - ye.mean())),
                                    "note": "Brier of predicting this window's own base rate for every target: unattainable in practice, a floor for 'no skill'"},
            "closure2y": {"brier": {"knn": brier(knn_c, yc), "marketPrior": brier(mkt_c, yc), "globalPrior": brier(ok_r["glob_close"], yc)},
                          "auc": {"knn": auc(knn_c, yc), "marketPrior": auc(mkt_c, yc)}},
            "ended2y": {"brier": {"knn": brier(knn_e, ye), "marketPrior": brier(mkt_e, ye), "globalPrior": brier(ok_r["glob_end"], ye)},
                        "auc": {"knn": auc(knn_e, ye), "marketPrior": auc(mkt_e, ye)}},
            "tenureMAE": mae, "keep": keep, "pred": {"closure": knn_c, "ended": knn_e, "marketClosure": mkt_c, "marketEnded": mkt_e, "yc": yc, "ye": ye},
            "medianPeersUsed": float(np.median(ok_r["n"])) if len(ok_r["n"]) else 0.0}


def cluster_bootstrap_delta(tab: SpellTable, ev_res: dict, reps: int = 400, seed: int = 5) -> dict:
    """95% cluster (building) bootstrap CI of Brier(knn) - Brier(marketPrior) (negative = kNN better) and of the kNN AUC. Both outcomes."""
    keep = ev_res["keep"]
    props = tab.prop[keep]
    uniq = np.unique(props)
    by = {u: np.flatnonzero(props == u) for u in uniq}
    rng = np.random.default_rng(seed)
    out = {}
    for name, (pk, pm, y) in {"closure2y": (ev_res["pred"]["closure"], ev_res["pred"]["marketClosure"], ev_res["pred"]["yc"]),
                              "ended2y": (ev_res["pred"]["ended"], ev_res["pred"]["marketEnded"], ev_res["pred"]["ye"])}.items():
        ds, aucs = [], []
        for _ in range(reps):
            js = np.concatenate([by[u] for u in rng.choice(uniq, len(uniq))])
            ds.append(brier(pk[js], y[js]) - brier(pm[js], y[js]))
            a_ = auc(pk[js], y[js])
            if a_ is not None:
                aucs.append(a_)
        d0 = brier(pk, y) - brier(pm, y)
        out[name] = {"delta": float(d0), "low": float(np.percentile(ds, 2.5)), "high": float(np.percentile(ds, 97.5)),
                     "aucKnn": auc(pk, y), "aucLow": float(np.percentile(aucs, 2.5)) if aucs else None,
                     "aucHigh": float(np.percentile(aucs, 97.5)) if aucs else None}
    return out


def reliability(p: np.ndarray, y: np.ndarray, bins: int = 3) -> list[dict]:
    """Predicted vs observed rate in `bins` quantile groups of the prediction."""
    if len(p) < bins * 5:
        return []
    order = np.argsort(p, kind="stable")
    out = []
    for g in np.array_split(order, bins):
        out.append({"n": int(len(g)), "meanPredicted": float(p[g].mean()), "observed": float(y[g].mean())})
    return out


# ------------------------------------------------------------------ tuning
GRID = {"h_miles": (0.5, 1.0, 2.0, 4.0, 8.0), "w_kind": (0.0, 0.5, 2.0), "w_size": (0.0, 0.25, 1.0), "w_class": (0.0, 0.5), "w_age": (0.0, 0.5),
        "w_ptype": (0.0, 0.5, 2.0), "k": (3, 5, 10, 20, 40, 80), "shrink_m": (0.0, 5.0, 20.0)}


def random_configs(n: int, seed: int = 3) -> list[Params]:
    """The grid corners that matter as ablations plus n random draws; always includes 'pure spatial' and 'pure kind'."""
    rng = random.Random(seed)
    base = [Params(k=k, h_miles=2.0, w_kind=0.0, shrink_m=5.0) for k in GRID["k"]]  # spatial only (ablation)
    base += [Params(k=k, h_miles=1e6, w_kind=2.0, shrink_m=5.0) for k in GRID["k"]]  # kind only: geography off (ablation)
    draws = [Params(**{key: rng.choice(vals) for key, vals in GRID.items()}) for _ in range(n)]
    seen, out = set(), []
    for p in base + draws:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def objective(res: dict) -> float:
    """Selection objective on the tuning window: closure Brier + ended Brier (lower is better)."""
    return res["closure2y"]["brier"]["knn"] + res["ended2y"]["brier"]["knn"]


def tune(tab: SpellTable, tune_idx: np.ndarray, configs: list[Params], **kw) -> list[dict]:
    rows = []
    cache: dict = {}
    for p in configs:
        r = evaluate_split(tab, tune_idx, p, cache=cache, **kw)
        rows.append({"params": p, "objective": objective(r), "closure": r["closure2y"]["brier"]["knn"], "ended": r["ended2y"]["brier"]["knn"],
                     "closureMarket": r["closure2y"]["brier"]["marketPrior"], "endedMarket": r["ended2y"]["brier"]["marketPrior"]})
    rows.sort(key=lambda x: x["objective"])
    return rows
