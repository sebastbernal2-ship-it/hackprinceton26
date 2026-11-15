"""Score raw OWLv2 detections against hand labels (count level). Writes triage/aerial/validation.json."""
import json, os, statistics as st
from pathlib import Path
ROOT = Path(os.environ.get("HP_ROOT", str(Path(__file__).resolve().parents[2])))
HERE = Path(__file__).parent
raw = json.loads((ROOT / "data/derived/triage/aerial/raw_detections.json").read_text(encoding="utf-8"))
labels = json.loads((HERE / "labels.json").read_text(encoding="utf-8"))["labels"]
CLS = {"vehicle": "vehicles", "rooftop_unit": "rooftop_units"}
THR = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]

def count(pid, cls, t): return sum(1 for d in raw[pid] if d["cls"] == cls and d["score"] >= t)

def score(pids, cls, key, t):
    ps = [p for p in pids if labels[p][key] is not None]
    pr = [count(p, cls, t) for p in ps]; tr = [labels[p][key] for p in ps]
    mae = st.mean(abs(a - b) for a, b in zip(pr, tr))
    tp = sum(min(a, b) for a, b in zip(pr, tr))
    return {"n": len(ps), "threshold": t, "mae": round(mae, 2), "mean_true": round(st.mean(tr), 1),
            "bias": round(st.mean(a - b for a, b in zip(pr, tr)), 2),
            "count_precision": round(tp / max(1, sum(pr)), 2), "count_recall": round(tp / max(1, sum(tr)), 2)}

pids = sorted(labels); out = {"n_labelled": len(pids), "classes": {}}
for cls, key in CLS.items():
    sweep = [score(pids, cls, key, t) for t in THR]
    # 2-fold cross-validated threshold choice: tune on one half, score on the other
    a, b = pids[::2], pids[1::2]; cv = []
    for tune, test in ((a, b), (b, a)):
        best = min(THR, key=lambda t: score(tune, cls, key, t)["mae"]); cv.append(score(test, cls, key, best))
    cvmae = round(st.mean(c["mae"] for c in cv), 2)
    out["classes"][cls] = {"sweep_all": sweep, "cv_folds": cv, "cv_mae": cvmae}
    print(cls, "cv_mae", cvmae, "best sweep", min(sweep, key=lambda s: s["mae"]))
(HERE / "validation.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
