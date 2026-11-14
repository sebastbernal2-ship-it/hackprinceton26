"""Competing-risks metrics. All inputs are numpy arrays; etype in {0 censored, 1 failure, 2 other exit}."""
from __future__ import annotations

import numpy as np
from lifelines.utils import concordance_index

G_FLOOR = 0.05


def aj_cif(time, etype, t, cause=1) -> float:
    """Aalen-Johansen cumulative incidence of `cause` by time t."""
    time, etype = np.asarray(time, float), np.asarray(etype)
    s, cif = 1.0, 0.0
    for u in np.unique(time[(etype > 0) & (time <= t)]):
        n = np.sum(time >= u)
        d_all = np.sum((time == u) & (etype > 0))
        d_c = np.sum((time == u) & (etype == cause))
        cif += s * d_c / n
        s *= 1 - d_all / n
    return float(cif)


class Censoring:
    """Kaplan-Meier of the censoring distribution; G(t-) evaluated by lookup."""

    def __init__(self, time, etype):
        time, cens = np.asarray(time, float), (np.asarray(etype) == 0)
        self.t = np.unique(time[cens])
        s, vals = 1.0, []
        for u in self.t:
            n = np.sum(time >= u)
            s *= 1 - np.sum((time == u) & cens) / n
            vals.append(s)
        self.s = np.array(vals)

    def minus(self, x):
        x = np.asarray(x, float)
        idx = np.searchsorted(self.t, x, side="left") - 1  # last censoring time strictly < x
        g = np.where(idx >= 0, self.s[np.clip(idx, 0, None)] if len(self.s) else 1.0, 1.0)
        return np.maximum(g, G_FLOOR)

    def at(self, x):
        x = np.asarray(x, float)
        idx = np.searchsorted(self.t, x, side="right") - 1
        g = np.where(idx >= 0, self.s[np.clip(idx, 0, None)] if len(self.s) else 1.0, 1.0)
        return np.maximum(g, G_FLOOR)


def ipcw(time, etype, t, cens: Censoring):
    time, etype = np.asarray(time, float), np.asarray(etype)
    w = np.zeros(len(time))
    known = (time <= t) & (etype > 0)
    w[known] = 1.0 / cens.minus(time[known])
    after = time > t
    w[after] = 1.0 / cens.at(t)
    y = ((time <= t) & (etype == 1)).astype(float)
    return w, y


def brier(time, etype, cif_t, t, cens=None) -> float:
    cens = cens or Censoring(time, etype)
    w, y = ipcw(time, etype, t, cens)
    return float(np.sum(w * (y - cif_t) ** 2) / len(time))


def auc_t(time, etype, cif_t, t, cens=None) -> float:
    cens = cens or Censoring(time, etype)
    w, y = ipcw(time, etype, t, cens)
    cases, ctrl = (y == 1), (y == 0) & (w > 0)
    if cases.sum() == 0 or ctrl.sum() == 0:
        return float("nan")
    fc, fo, wc, wo = cif_t[cases], cif_t[ctrl], w[cases], w[ctrl]
    cmp = (fc[:, None] > fo[None, :]) + 0.5 * (fc[:, None] == fo[None, :])
    return float((wc[:, None] * wo[None, :] * cmp).sum() / (wc.sum() * wo.sum()))


def c_index(time, etype, risk) -> float:
    """Harrell C for cause-specific failure; other exits and open spells treated as censored."""
    if np.sum(np.asarray(etype) == 1) == 0:
        return float("nan")
    return float(concordance_index(time, -np.asarray(risk), (np.asarray(etype) == 1).astype(int)))


def horizon_support(time, etype, t, min_events=5, min_g=0.2):
    """A horizon is evaluated only if follow-up reaches it. Returns (ok, reason)."""
    cens = Censoring(time, etype)
    n_ev = int(np.sum((np.asarray(time) <= t) & (np.asarray(etype) == 1)))
    g = float(cens.at(t))
    if n_ev < min_events:
        return False, f"only {n_ev} failures by {t}y (<{min_events})"
    if g < min_g:
        return False, f"censoring survival {g:.2f} at {t}y (<{min_g}); follow-up too short"
    return True, ""


def evaluate(time, etype, cif: dict, risk, horizons=(1, 2, 3), baseline: dict | None = None) -> dict:
    """cif: {t: predicted CIF array}. baseline: {t: scalar marginal CIF}. Returns plain dict."""
    time, etype = np.asarray(time, float), np.asarray(etype)
    out = {"n": int(len(time)), "n_failures": int((etype == 1).sum()), "c_index": c_index(time, etype, risk), "horizons": {}}
    cens = Censoring(time, etype)
    for t in horizons:
        ok, why = horizon_support(time, etype, t)
        h = {"valid": ok, "reason": why}
        if ok:
            b = brier(time, etype, cif[t], t, cens)
            h.update(auc=auc_t(time, etype, cif[t], t, cens), brier=b)
            if baseline is not None:
                bb = brier(time, etype, np.full(len(time), baseline[t]), t, cens)
                h.update(brier_baseline=bb, brier_skill=1 - b / bb if bb > 0 else float("nan"))
            h.update(calibration=calibration(time, etype, cif[t], t))
        out["horizons"][t] = h
    return out


def calibration(time, etype, pred, t, n_bins=3) -> dict:
    pred = np.asarray(pred)
    qs = np.quantile(pred, np.linspace(0, 1, n_bins + 1))
    bins = []
    for lo, hi in zip(qs[:-1], qs[1:]):
        m = (pred >= lo) & (pred <= hi) if hi == qs[-1] else (pred >= lo) & (pred < hi)
        if m.sum() < 5:
            continue
        bins.append({"n": int(m.sum()), "mean_predicted": float(pred[m].mean()), "observed_aj_cif": aj_cif(time[m], etype[m], t)})
    obs = aj_cif(time, etype, t)
    return {"bins": bins, "mean_predicted": float(pred.mean()), "observed_aj_cif": obs, "in_the_large_gap": float(pred.mean() - obs)}
