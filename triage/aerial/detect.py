"""OWLv2 open-vocabulary detection on aerial tiles. Raw detections (all scores >= 0.05) go to
data/derived/triage/aerial/raw_detections.json (gitignored). Weights cached in .cache/hf (gitignored)."""
import json, os, sys
from pathlib import Path
import numpy as np, torch
from PIL import Image
from transformers import Owlv2Processor, Owlv2ForObjectDetection

ROOT = Path(os.environ.get("HP_ROOT", str(Path(__file__).resolve().parents[2])))
IMG = ROOT / "data/derived/triage/aerial/images"
OUT = ROOT / "data/derived/triage/aerial/raw_detections.json"
MODEL = "google/owlv2-base-patch16-ensemble"
QUERIES = {"vehicle": "a car seen from above", "rooftop_unit": "a rooftop air conditioning unit",
           "dock": "a loading dock door"}
TILE, STRIDE = 800, 600


def nms(dets, thr=0.4):
    dets = sorted(dets, key=lambda d: -d["score"]); keep = []
    for d in dets:
        ok = True
        for k in keep:
            if k["cls"] != d["cls"]: continue
            ix = max(0, min(d["box"][2], k["box"][2]) - max(d["box"][0], k["box"][0]))
            iy = max(0, min(d["box"][3], k["box"][3]) - max(d["box"][1], k["box"][1]))
            inter = ix * iy
            a = lambda b: (b[2] - b[0]) * (b[3] - b[1])
            if inter / (a(d["box"]) + a(k["box"]) - inter + 1e-9) > thr: ok = False; break
        if ok: keep.append(d)
    return keep


def main():
    proc = Owlv2Processor.from_pretrained(MODEL, cache_dir=os.environ.get("HF_HOME"))
    model = Owlv2ForObjectDetection.from_pretrained(MODEL, torch_dtype=torch.float16).cuda().eval()
    names = list(QUERIES); texts = [list(QUERIES.values())]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    res = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for p in sorted(IMG.glob("*.jpg")):
        pid = p.stem
        if pid in res: continue
        im = Image.open(p).convert("RGB"); W, H = im.size; dets = []
        for y in range(0, H - TILE + 1, STRIDE):
            for x in range(0, W - TILE + 1, STRIDE):
                tile = im.crop((x, y, x + TILE, y + TILE))
                inp = proc(text=texts, images=tile, return_tensors="pt").to("cuda")
                inp["pixel_values"] = inp["pixel_values"].half()
                with torch.no_grad(): out = model(**inp)
                r = proc.post_process_object_detection(out, threshold=0.05, target_sizes=torch.tensor([[960 * TILE / 800 * 0 + max(TILE, TILE)] * 2]).cuda())[0] if False else None
                # OWLv2 pads to square; tile is square so target size = tile size
                r = proc.post_process_grounded_object_detection(out, threshold=0.05, target_sizes=[(TILE, TILE)])[0] if hasattr(proc, "post_process_grounded_object_detection") else proc.post_process_object_detection(out, threshold=0.05, target_sizes=torch.tensor([[TILE, TILE]]).cuda())[0]
                for s, l, b in zip(r["scores"].tolist(), r["labels"].tolist(), r["boxes"].tolist()):
                    li = l if isinstance(l, int) else names.index(l) if l in names else 0
                    dets.append({"cls": names[li], "score": round(s, 4),
                                 "box": [round(b[0] + x), round(b[1] + y), round(b[2] + x), round(b[3] + y)]})
        res[pid] = nms(dets)
        OUT.write_text(json.dumps(res), encoding="utf-8")
        print(pid, len(res[pid]), flush=True)


if __name__ == "__main__":
    main()
