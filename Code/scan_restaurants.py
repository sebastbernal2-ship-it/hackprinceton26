"""Find CoStar-kit commercial models that are restaurants and check which ones the pipeline can use.
usage: python scan_restaurants.py <repo root> <out.json>"""
import csv, json, os, re, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT, OUT = sys.argv[1], sys.argv[2]
KIT = os.path.join(ROOT, "Code", "costar_kit")
for line in open(os.path.join(ROOT, ".env")):
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.strip().split("=", 1); os.environ.setdefault(k, v.strip("\"'"))
AUTH = (os.environ["MATTERPORT_API_KEY"], os.environ["MATTERPORT_API_TOKEN"])

FOOD_SUB = {7: "Bar", 12: "FastFood", 18: "Restaurant", 126: "FoodCourt", 147: "QuickService"}
ITALIAN = re.compile(r"ital|pizz|tratt|ristor|osteria|pasta|enoteca|cucina|nonna|mamma|bella|napoli|roma|sicil|tuscan|toscan|vino", re.I)

def jl(name):
    with open(os.path.join(KIT, "data", name + ".jsonl"), encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)

props = {p["id"]: p for p in jl("commercial-property")}
companies = {c["id"]: c for c in jl("company-detail")}
tenants = defaultdict(list)            # current food tenants per property
for o in jl("location-occupancy"):
    if o.get("toDate") is not None:
        continue
    c = companies.get(o.get("tenantLocationId"))
    ind = (c or {}).get("profile") and c["profile"].get("industryType")
    if ind == 17 or (c is None and o.get("industryType") == 17):
        tenants[o["propertyId"]].append((c or {}).get("name") or "(unknown food tenant)")

models = defaultdict(list)
for r in csv.DictReader(open(os.path.join(KIT, "commercial-properties.csv"), encoding="utf-8")):
    if r["MatterportModelId"]:
        models[int(r["PropertyId"])].append(r)

cands = []
for pid, rows in models.items():
    p = props.get(pid, {})
    sub = FOOD_SUB.get(p.get("propertySubtype"))
    t = tenants.get(pid, [])
    if not sub and not t:
        continue
    for r in rows:
        cands.append({"propertyId": pid, "model": r["MatterportModelId"], "address": f'{r["Address"]}, {r["City"]} {r["State"]}',
                      "subtype": sub, "food_tenants": sorted(set(t))[:8],
                      "italian": any(ITALIAN.search(x) for x in t), "building_sf": p.get("rentableBuildingAreaSquareFeet")})
print(f"{len(cands)} candidate models on {len({c['propertyId'] for c in cands})} properties", flush=True)

Q = """query($id: ID!) { model(id: $id) { id name visibility
  floors { id } rooms { classifications { label } }
  views: view(type: "matterport.model.defurnished") { id }
  assets { meshes { format resolution } } } }"""

def check(c):
    try:
        r = requests.post("https://api.matterport.com/api/models/graph", json={"query": Q, "variables": {"id": c["model"]}},
                          auth=AUTH, timeout=60)
        b = r.json()
        m = (b.get("data") or {}).get("model")
        if not m:
            c["error"] = str(b.get("errors"))[:150]; return c
        c.update(name=m["name"], floors=len(m["floors"] or []), rooms=len(m["rooms"] or []),
                 room_labels=sorted({cl["label"] for rm in m["rooms"] or [] for cl in rm["classifications"] or []}),
                 defurnished=(m.get("views") or {}).get("id"), meshes=len((m.get("assets") or {}).get("meshes") or []))
    except Exception as e:
        c["error"] = str(e)[:150]
    return c

with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(check, cands))
json.dump(res, open(OUT, "w"), indent=1)
ok = [c for c in res if c.get("defurnished") and c.get("meshes")]
print(f"usable (defurnished + mesh): {len(ok)} / {len(res)}; errors: {sum('error' in c for c in res)}")
