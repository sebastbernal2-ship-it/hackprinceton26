"""A tiny synthetic CoStar-kit-shaped folder (jsonl) for tests: no real data, deterministic."""
import json
import random
from pathlib import Path

NAMES = ["Bean Cafe", "Corner Coffee", "Rose Bakery", "Taco Place", "Pizza Hut", "Steak House Grill", "Sports Bar", "Juice Bar", "Sandwich Deli", "Thai Kitchen",
         "Zzz Holdings", "Mystery Spot"]


def write_kit(d: Path, n_props: int = 14, n_food: int = 170, seed: int = 1) -> Path:
    rng = random.Random(seed)
    d.mkdir(parents=True, exist_ok=True)
    props, comps, occs = [], [], []
    for i in range(1, n_props + 1):
        props.append({"id": 1000 + i, "primaryAddress": {"latitude": 29.70 + 0.01 * (i % 5), "longitude": -95.50 + 0.012 * (i // 5), "researchMarketId": 14},
                      "propertyType": 6 if i % 3 else 11, "buildingClass": 1 + i % 3, "constructionEvents": [{"eventType": 2, "year": 1970 + 3 * i}]})
    cid = 1
    for _ in range(n_food):
        pid = 1000 + rng.randint(1, n_props)
        start = 2012 + rng.random() * 13
        dur = rng.expovariate(1 / 3.0)
        end = start + dur
        open_ = end > 2026.8
        sy, sm = int(start), 1 + int((start % 1) * 11)
        ey, em = int(end), 1 + int((end % 1) * 11)
        comps.append({"id": cid, "profile": {"industryType": 17, "companyName": rng.choice(NAMES)}, "numEmployees": rng.randint(2, 30)})
        occs.append({"propertyId": pid, "tenantLocationId": cid, "fromDate": f"{sy}-{sm:02d}-01T12:00:00-04:00",
                     "toDate": None if open_ else f"{ey}-{em:02d}-01T12:00:00-04:00",
                     "expirationReason": 0 if open_ else rng.choice([4, 10, 10, 7]), "spaces": [{"squareFeetOccupied": rng.choice([900, 1500, 2500])}]})
        cid += 1
    for _ in range(40):  # non-food tenants (retail / office)
        pid = 1000 + rng.randint(1, n_props)
        comps.append({"id": cid, "profile": {"industryType": rng.choice([6, 12, 15]), "companyName": "Other"}, "numEmployees": rng.randint(1, 60)})
        occs.append({"propertyId": pid, "tenantLocationId": cid, "fromDate": "2014-01-01T12:00:00-04:00", "toDate": None, "expirationReason": 0, "spaces": []})
        cid += 1
    for name, rows in (("commercial-property", props), ("company-detail", comps), ("location-occupancy", occs)):
        (d / f"{name}.jsonl").write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    return d
