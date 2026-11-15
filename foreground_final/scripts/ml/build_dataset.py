"""Build the restaurant-survival training set from the CoStar hackathon kit.

Usage (kit is read-only input):
    python -X utf8 -I scripts/ml/build_dataset.py [kit_dir]

Writes
    data/ml/survival-dataset.csv         one row per labelled food tenancy (stint)
    data/ml/survival-site-features.csv   one row per demo site (data/sites/*.json), same features,
                                         for a NEW independent food tenant moving in on the data date
    data/ml/survival-dataset-meta.json   counts, exclusions, feature list

Unit of analysis: a food "stint" = consecutive occupancy records of the same tenant in the same property
(renewals and suite moves create new records; gap <= 120 days merges them), as in scripts/spikes/sites/notes.md.

Label: survived3y = 1 when the stint lasted >= 3 years (still open, or moved out >= 3 years after move-in).
Right-censoring: only stints that began on or before DATA_DATE - 3 years are kept, so every kept row has a
fully observed 3-year window. (Dropping only the *open* young stints and keeping young closed ones would
bias the label towards failure, so both are dropped.)

Every feature is computed from information dated strictly before the move-in day (or fixed at lease signing).
Standard library only; streams the JSONL files.
"""
import csv
import collections
import glob
import json
import math
import os
import re
import sys
from datetime import date

KIT = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/admin/Downloads/costar-hackathon-kit (3)"
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "data", "ml")
SITES = os.path.join(ROOT, "data", "sites")

DATA_DATE = date(2026, 11, 9)  # kit as-of date (index.md: sold window ends 2026-11-09)
HORIZON_Y = 3.0
RADIUS_M = 500.0
MARKET = {14: "Houston", 20: "LosAngeles"}
E = json.load(open(KIT + "/schemas/enums.json", encoding="utf-8"))


def dec(en, v):
    return E[en].get(str(v), str(v)) if v is not None else None


# ---------------------------------------------------------------- food classification (same rules as
# scripts/spikes/sites/build.py, see notes.md section 4)
FOOD_WORDS = r"""restaurant restaurante cafe café coffee espresso grill grille kitchen pizza pizzeria taco tacos
taqueria burger burgers sushi bistro bakery bakehouse deli delicatessen bbq barbecue barbeque cantina ramen pho thai
boba juice smoothie donut donuts doughnut creamery gelato yogurt froyo wings wingstop steakhouse tavern pub brewery
brewing brewpub taproom cocktail eatery diner noodle noodles dumpling poke sandwich sandwiches subs bagel bagels crepe
creperie teahouse cuisine catering trattoria osteria ristorante chophouse oyster seafood crawfish cajun burrito kebab
shawarma falafel hibachi teriyaki chicken smokehouse cupcake cupcakes patisserie chocolatier starbucks subway chipotle
mcdonalds panera jamba dunkin dominos whataburger sweetgreen cava quiznos potbelly philz salata freebirds pappadeaux
pappasitos pappas landrys yoshinoya pinkberry yogurtland nekter sharetea crumbl urth schlotzskys pieology fuddruckers
chilis applebees ihop dennys benihana nobu trimana lemonade tea donburi curry bao gyro gyros tapas grillhouse wok
pastry sweets dessert desserts tortas pupuseria mariscos pollo carnitas birria cocina comida kolache kolaches bodega
market grocery liquor wine beer spirits cellar lounge bar saloon nightclub"""
FOOD_PHRASES = [r"ice cream", r"steak house", r"wine bar", r"sports bar", r"bar & grill", r"bar and grill",
                r"food hall", r"tea house", r"tex-mex", r"fried chicken", r"bar-b-q", r"mcdonald'?s", r"domino'?s",
                r"papa john'?s", r"pizza hut", r"taco bell", r"wendy'?s", r"chick-fil-a", r"shake shack",
                r"jersey mike'?s", r"jimmy john'?s", r"einstein bros", r"peet'?s", r"coffee bean", r"blue bottle",
                r"torchy'?s", r"landry'?s", r"el pollo loco", r"in-n-out", r"panda express", r"baskin.robbins",
                r"cold stone", r"tropical smoothie", r"smoothie king", r"kung fu tea", r"tiff'?s treats",
                r"insomnia cookies", r"mendocino farms", r"tender greens", r"veggie grill", r"le pain quotidien",
                r"corner bakery", r"la madeleine", r"mod pizza", r"blaze pizza", r"buffalo wild wings",
                r"waffle house", r"olive garden", r"cheesecake factory", r"p\.?f\.? chang'?s", r"fogo de chao",
                r"ruth'?s chris", r"morton'?s", r"capital grille", r"mastro'?s", r"five guys", r"dairy queen",
                r"carl'?s jr", r"jack in the box", r"del taco", r"raising cane'?s", r"popeyes", r"kfc"]
WEAK = set("market grocery liquor wine beer spirits cellar lounge bar saloon nightclub tea lemonade subs wings "
           "chicken sweets kitchen catering juice bodega curry thai".split())
_words = FOOD_WORDS.split()
STRONG_RE = re.compile(r"\b(" + "|".join([w for w in _words if w not in WEAK] + FOOD_PHRASES) + r")\b", re.I)
WEAK_RE = re.compile(r"\b(" + "|".join(sorted(WEAK)) + r")\b", re.I)
HOTEL_RE = re.compile(r"\b(hotel|motel|inn|suites|resort|lodging|hostel|marriott|hilton|hyatt|best western|"
                      r"sheraton|westin|residence inn|courtyard by)\b", re.I)
NOT_FOOD_RE = re.compile(
    r"\b(kitchens? (design|cabinet\w*|bath)|kitchens? & bath|bar association|law|attorneys?|dental|llp|"
    r"capital partners|insurance|realty|publish\w*|public\w*|management|consult\w*|software|staffing|"
    r"studios?|productions?|records|media|architects?|marketing|market research|capital markets|"
    r"markets group|financial|bank|mortgage|salon|barber\w*|spa|fitness|yoga|pilates|cleaners|"
    r"pharmacy|medical|clinic|church|school|academy|foundation|association|engineering|energy|"
    r"technolog\w*|design|interiors|gallery|boutique|apparel|jewel\w*|nails?|investments?|housing|"
    r"entertainment|development|hospitality|computer|business|fitness|group|holdings|massage|"
    r"beauty|tax|exam|course|tube|grooming|wax\w*)\b", re.I)
BIO_RE = re.compile(r"\b(restaurant|menu|cuisine|dining|food|coffee|bakery|bar|eatery|catering|sandwich\w*|pizza)\b", re.I)


def classify(o, comp):
    """-> (name, [match basis], company). Empty basis = not food."""
    c = comp.get(o.get("tenantLocationId")) if o.get("tenantLocationId") else None
    if c is None:
        if o.get("industryType") == 17:
            return "Unknown tenant (Accommodation/Food industry)", ["occupancy.industryType=17"], None
        return None, [], None
    names = c["names"]
    if c["businessType"] == 27 or c["businessSubtype"] == 82 or HOTEL_RE.search(names):
        return c["name"], [], c
    basis = []
    notfood = bool(NOT_FOOD_RE.search(names))
    if c["industryType"] == 17 and not notfood:
        basis.append("profile.industryType=17")
    if STRONG_RE.search(names):
        basis.append("name-regex")
    if basis and BIO_RE.search(c["bio"]):
        basis.append("bio-regex")
    if not basis and WEAK_RE.search(names) and not notfood:
        basis = ["name-regex-weak"]
    if basis == ["name-regex"] and notfood:
        basis = ["name-regex-weak"]
    return c["name"], basis, c


# ---------------------------------------------------------------- helpers
def pdate(s):
    if not s:
        return None
    try:
        return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
    except ValueError:
        return None


def yrs(a, b):
    return (b - a).days / 365.25


def norm_name(n):
    return re.sub(r"[^a-z0-9]", "", (n or "").lower())


def norm_suite(x):
    x = re.sub(r"^(suite|ste|unit|#)\s*", "", (x or "").strip(), flags=re.I)
    return re.sub(r"[^A-Z0-9]", "", x.upper()) or None


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


def rent_psf_yr(ld, sf):
    """Normalised $/SF/yr from a lease deal: contract rent first, asking rent second. -> (value, flavor)."""
    if not ld:
        return None, None
    ra = ld.get("rateActual")
    if ra and ra > 0 and ld.get("rateAmountType", 0) == 0 and ld.get("rateBasis") in (1, 2):
        return ra * (12 if ld["rateBasis"] == 1 else 1), "contract"
    for k, mult in (("rateActualPerYear", 1), ("rateActualPerMonth", 12)):
        if ld.get(k) and sf:
            return ld[k] * mult / sf, "contract"
    ar = ld.get("askingRate") or {}
    lo, hi = ar.get("rateLow") or 0, ar.get("rateHigh") or 0
    if lo > 0 and ar.get("rateBasis") in (1, 2):
        return (lo + (hi or lo)) / 2 * (12 if ar["rateBasis"] == 1 else 1), "asking"
    return None, None


def lease_term_months(ld):
    if not ld or not ld.get("leaseTerm"):
        return None
    t, u = ld["leaseTerm"], ld.get("leaseTermType")
    return t * 12 if u == 1 else t if u == 2 else t / 30.4 if u == 3 else None


# ---------------------------------------------------------------- 1. properties
print("reading properties ...", flush=True)
props = {}
for line in open(KIT + "/data/commercial-property.jsonl", encoding="utf-8"):
    r = json.loads(line)
    a = r.get("primaryAddress") or {}
    yb = [e.get("year") for e in r.get("constructionEvents") or [] if e.get("eventType") == 2 and e.get("year")]
    yr = [e.get("year") for e in r.get("constructionEvents") or [] if e.get("eventType") == 4 and e.get("year")]
    props[r["id"]] = {
        "market": MARKET.get(a.get("researchMarketId"), "Other"),
        "submarket": r.get("primarySubmarketId"),
        "lat": a.get("latitude"), "lng": a.get("longitude"),
        "propertyType": dec("PropertyType", r.get("propertyType")),
        "propertySubtype": dec("PropertySubtype", r.get("propertySubtype")),
        "buildingSf": r.get("rentableBuildingAreaSquareFeet") or r.get("grossBuildingAreaSquareFeet"),
        "yearBuilt": min(yb) if yb else None,
        "renovYears": sorted(yr),
        "stories": r.get("numStoriesAboveGrade"),
        "parkingRatio": r.get("parkingRatio"),
        "buildingClass": r.get("buildingClass"),
    }

# neighbours within RADIUS_M (other kit properties only)
print("neighbour index ...", flush=True)
geo = [(pid, p["lat"], p["lng"]) for pid, p in props.items() if p["lat"] and p["lng"]]
grid = collections.defaultdict(list)
CELL = 0.01  # ~1.1 km of latitude
for pid, la, lo in geo:
    grid[(int(la / CELL), int(lo / CELL))].append((pid, la, lo))
neigh = collections.defaultdict(list)
for pid, la, lo in geo:
    gx, gy = int(la / CELL), int(lo / CELL)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q, la2, lo2 in grid.get((gx + dx, gy + dy), ()):
                if q != pid and haversine_m(la, lo, la2, lo2) <= RADIUS_M:
                    neigh[pid].append(q)

# ---------------------------------------------------------------- 2. companies
print("reading companies ...", flush=True)
comp = {}
name_count = collections.Counter()
for line in open(KIT + "/data/company-detail.jsonl", encoding="utf-8"):
    r = json.loads(line)
    p = r.get("profile") or {}
    brands = [b.get("locationName") for b in r.get("brandProfiles") or []]
    cname = p.get("companyName") or r.get("name")
    comp[r["id"]] = {
        "name": r.get("name"), "companyKey": norm_name(cname),
        "names": " | ".join(x for x in [r.get("name"), p.get("companyName")] + brands if x),
        "industryType": p.get("industryType"), "businessType": p.get("businessType"),
        "businessSubtype": p.get("businessSubtype"), "bio": p.get("locationBio") or "",
        "officeType": r.get("officeType"), "hasBrand": bool(brands),
    }
    if comp[r["id"]]["companyKey"]:
        name_count[comp[r["id"]]["companyKey"]] += 1

# ---------------------------------------------------------------- 3. occupancies
print("reading occupancies ...", flush=True)
occ = collections.defaultdict(list)  # pid -> list of normalised records (all industries)
basis_counter = collections.Counter()
for line in open(KIT + "/data/location-occupancy.jsonl", encoding="utf-8"):
    r = json.loads(line)
    pid = r["propertyId"]
    if pid not in props:
        continue
    start = pdate(r.get("moveInDate")) or pdate(r.get("fromDate"))
    end = pdate(r.get("toDate"))
    if end and end > DATA_DATE:  # a scheduled future move-out: still in place on the data date
        end = None
    name, basis, c = classify(r, comp)
    sp = r.get("spaces") or []
    sf = sum((s.get("squareFeetOccupied") or 0) for s in sp) or None
    ld = r.get("leaseDeal")
    rent, flavor = rent_psf_yr(ld, sf)
    occ[pid].append({
        "id": r["id"], "start": start, "end": end, "name": name, "basis": basis, "comp": c,
        "food": bool(basis) and basis != ["name-regex-weak"],
        "moveInSource": "moveInDate" if r.get("moveInDate") else "fromDate",
        "suites": set(filter(None, (norm_suite(s.get("suite")) for s in sp))),
        "sf": sf, "position": max((s.get("spacePosition") or 0) for s in sp) if sp else 0,
        "reason": r.get("expirationReason") if end else None,
        "leaseType": r.get("leaseType"), "ld": ld, "rent": rent, "rentFlavor": flavor,
        "term": lease_term_months(ld),
    })
    if basis:
        basis_counter[", ".join(basis)] += 1

# ---------------------------------------------------------------- 4. food stints per property
stints = collections.defaultdict(list)
artifacts = 0
for pid, recs in occ.items():
    food = sorted((o for o in recs if o["food"] and o["start"]), key=lambda o: o["start"])
    cur = []
    for f in food:
        key = norm_name(f["name"])
        prev = None
        if not key.startswith("unknowntenant"):
            prev = next((t for t in reversed(cur) if t["key"] == key), None)
        if prev and (prev["end"] is None or (f["start"] - prev["end"]).days <= 120):
            if prev["end"] is not None and (f["end"] is None or f["end"] > prev["end"]):
                prev["end"], prev["reason"] = f["end"], f["reason"]
            prev["records"].append(f["id"])
        else:
            cur.append({"key": key, "pid": pid, "first": f, "start": f["start"], "end": f["end"],
                        "reason": f["reason"], "records": [f["id"]], "suites": f["suites"]})
    for t in cur:
        if t["end"] is not None and yrs(t["start"], t["end"]) <= 0.05:  # a day or two: data artifact
            artifacts += 1
            continue
        stints[pid].append(t)

# kit-wide timeline of each operator (company name) for "experienced operator" features
operator_starts = collections.defaultdict(list)
for pid, ts in stints.items():
    for t in ts:
        c = t["first"]["comp"]
        if c and c["companyKey"]:
            operator_starts[c["companyKey"]].append((t["start"], pid))


# ---------------------------------------------------------------- 5. features as of a move-in day
def features(pid, t0, suite, sf, self_stint, tenant, lease):
    """All inputs are known on or before move-in day t0. `self_stint` is excluded from every count."""
    p = props[pid]
    recs = occ.get(pid, [])
    self_ids = set(self_stint["records"]) if self_stint else set()
    others = [o for o in recs if o["id"] not in self_ids and o["start"]]
    food_st = [s for s in stints.get(pid, []) if s is not self_stint]

    def active(o):
        return o["start"] < t0 and (o["end"] is None or o["end"] >= t0)

    def ended_within(o, years):
        return o["end"] is not None and o["end"] < t0 and yrs(o["end"], t0) <= years

    prior_food = [s for s in food_st if s["start"] < t0]
    closed_food = [s for s in prior_food if s["end"] is not None and s["end"] < t0]
    short_closed = [s for s in closed_food if yrs(s["start"], s["end"]) < HORIZON_Y]
    started_before = [o for o in others if o["start"] < t0]
    first_rec = min((o["start"] for o in started_before), default=None)

    f = {
        "market": p["market"],
        "submarket": str(p["submarket"]) if p["submarket"] else "unknown",
        "property_type": p["propertyType"] or "Unknown",
        "property_subtype": p["propertySubtype"] or "Unknown",
        "building_sf": p["buildingSf"],
        "building_age": (t0.year - p["yearBuilt"]) if p["yearBuilt"] else None,
        # years since the last renovation completed before move-in (None when never renovated)
        "years_since_renov": next((t0.year - y for y in reversed(p["renovYears"]) if y <= t0.year), None),
        "stories": p["stories"],
        "parking_ratio": p["parkingRatio"],
        "sf_occupied": sf,
        "sf_share_of_building": (sf / p["buildingSf"]) if sf and p["buildingSf"] else None,
        "move_in_year": t0.year + (t0.timetuple().tm_yday - 1) / 365.25,
        # --- food history of the property before move-in
        "prior_food_prop": len(prior_food),
        "prior_food_closed_prop": len(closed_food),
        "prior_food_closed_5y_prop": sum(1 for s in closed_food if yrs(s["end"], t0) <= 5),
        "prior_food_short_closed_prop": len(short_closed),
        "food_active_prop": sum(1 for s in prior_food if s["end"] is None or s["end"] >= t0),
        # --- building roster before move-in (any industry)
        "tenants_active_bldg": sum(1 for o in others if active(o)),
        "tenant_moveouts_3y_bldg": sum(1 for o in others if ended_within(o, 3)),
        "record_depth_years": yrs(first_rec, t0) if first_rec else 0.0,
    }
    # --- the exact suite before move-in
    f["suite_known"] = int(bool(suite))
    if suite:
        s_food = [s for s in closed_food if suite in s["suites"]]
        s_any = [o for o in others if suite in o["suites"] and o["end"] is not None and o["end"] < t0]
        f["prior_food_closed_suite"] = len(s_food)
        f["prior_food_closed_5y_suite"] = sum(1 for s in s_food if yrs(s["end"], t0) <= 5)
        f["prior_any_closed_5y_suite"] = sum(1 for o in s_any if yrs(o["end"], t0) <= 5)
        last = max(s_any, key=lambda o: o["end"], default=None)
        f["predecessor_years"] = yrs(last["start"], last["end"]) if last else None
        f["suite_vacant_years"] = yrs(last["end"], t0) if last else None
        f["second_gen_food_suite"] = int(bool(last and last["food"]))
    else:
        for k in ("prior_food_closed_suite", "prior_food_closed_5y_suite", "prior_any_closed_5y_suite",
                  "predecessor_years", "suite_vacant_years", "second_gen_food_suite"):
            f[k] = None
    # --- density within RADIUS_M (other kit properties only)
    n_food = n_food_closed = n_ten = 0
    for q in neigh.get(pid, ()):
        for s in stints.get(q, ()):
            if s["start"] < t0 and (s["end"] is None or s["end"] >= t0):
                n_food += 1
            elif s["end"] is not None and s["end"] < t0 and yrs(s["end"], t0) <= 3:
                n_food_closed += 1
        n_ten += sum(1 for o in occ.get(q, ()) if o["start"] and active(o))
    f["food_active_500m"] = n_food
    f["food_closed_3y_500m"] = n_food_closed
    f["tenants_active_500m"] = n_ten
    f["kit_properties_500m"] = len(neigh.get(pid, ()))
    # --- tenant
    f.update(tenant)
    # --- lease terms fixed at signing
    f.update(lease)
    return f


def tenant_features(c, t0, pid):
    if c is None:
        return {"tenant_known": 0, "chain_locations": None, "is_chain": 0, "operator_prior_sites": 0}
    n = name_count.get(c["companyKey"], 1)
    prior = sum(1 for (d0, q) in operator_starts.get(c["companyKey"], ()) if d0 < t0 and q != pid)
    return {"tenant_known": 1, "chain_locations": n,
            "is_chain": int(n >= 2 or c["hasBrand"] or c["officeType"] == 4),
            "operator_prior_sites": prior}


def lease_features(o):
    ld = o["ld"]
    return {
        "lease_type": dec("LeaseType", o["leaseType"]) or "Unknown",
        "has_lease_deal": int(bool(ld)),
        "rent_psf_yr": o["rent"],
        "lease_term_months": o["term"],
        "service_type": dec("ServiceType", ld.get("serviceType")) if ld and ld.get("serviceType") else "Unknown",
        "space_type": dec("SpaceType", ld.get("spaceType")) if ld and ld.get("spaceType") else "Unknown",
        "space_position": dec("SpacePosition", o["position"]) or "Unknown",
    }


# ---------------------------------------------------------------- 6. labelled rows
CUTOFF = date(DATA_DATE.year - 3, DATA_DATE.month, DATA_DATE.day)
rows, excl = [], collections.Counter()
for pid, ts in stints.items():
    if props[pid]["market"] == "Other":
        excl["not Houston/LA"] += len(ts)
        continue
    for t in ts:
        if t["start"] > CUTOFF:
            excl["censored: began < 3y before data date (open)" if t["end"] is None
                 else "censored: began < 3y before data date (closed)"] += 1
            continue
        if t["start"].year < 1990:
            excl["move-in before 1990"] += 1
            continue
        dur = yrs(t["start"], t["end"] or DATA_DATE)
        survived = int(t["end"] is None or dur >= HORIZON_Y)
        o = t["first"]
        suite = sorted(o["suites"])[0] if o["suites"] else None
        f = features(pid, t["start"], suite, o["sf"], t, tenant_features(o["comp"], t["start"], pid), lease_features(o))
        meta = {
            "stint_id": o["id"], "property_id": pid, "tenant_name": o["name"],
            "match_basis": ", ".join(o["basis"]), "move_in": t["start"].isoformat(),
            "move_in_source": o["moveInSource"], "move_out": t["end"].isoformat() if t["end"] else "",
            "duration_years": round(dur, 2), "end_reason": dec("LocationOccupancyExpirationReason", t["reason"]) or "",
            "rent_flavor": o["rentFlavor"] or "", "n_records": len(t["records"]), "survived3y": survived,
        }
        rows.append({**meta, **f})

rows.sort(key=lambda r: (r["move_in"], r["stint_id"]))
META_COLS = ["stint_id", "property_id", "tenant_name", "match_basis", "move_in", "move_in_source", "move_out",
             "duration_years", "end_reason", "rent_flavor", "n_records", "survived3y"]
FEATS = [k for k in rows[0] if k not in META_COLS]
os.makedirs(OUT, exist_ok=True)


def write_csv(path, rws, cols):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rws:
            w.writerow({k: ("" if r.get(k) is None else (round(r[k], 4) if isinstance(r[k], float) else r[k])) for k in cols})


write_csv(os.path.join(OUT, "survival-dataset.csv"), rows, META_COLS + FEATS)

# ---------------------------------------------------------------- 7. the demo sites: a new independent food
# tenant moving into the featured space on the data date
site_rows = []
for path in sorted(glob.glob(os.path.join(SITES, "*.json"))):
    s = json.load(open(path, encoding="utf-8"))
    pid = int(s["id"])
    sp = s["space"]
    if pid not in props:
        print("WARNING: site", pid, "not in kit properties")
        continue
    lease = {
        "lease_type": "Direct", "has_lease_deal": 1,
        "rent_psf_yr": sp.get("rentPerSfYr") or None,  # asking rent (the training rent is mostly asking too)
        "lease_term_months": None,
        "service_type": {"NNN": "TripleNet", "FSG": "FullService", "MG": "ModifiedGross"}.get(sp.get("serviceType") or "", "Unknown"),
        "space_type": sp.get("spaceType") if sp.get("spaceType") in ("Relet", "New", "Sublet") else "Unknown",
        "space_position": "Unknown",
    }
    tenant = {"tenant_known": 1, "chain_locations": 1, "is_chain": 0, "operator_prior_sites": 0}
    f = features(pid, DATA_DATE, norm_suite(sp.get("suite")), sp.get("sf"), None, tenant, lease)
    site_rows.append({"site_id": s["id"], "address": s["address"], "city": s["city"], "suite": sp.get("suite") or "", **f})
write_csv(os.path.join(OUT, "survival-site-features.csv"), site_rows, ["site_id", "address", "city", "suite"] + FEATS)

# ---------------------------------------------------------------- 8. meta
n = len(rows)
pos = sum(r["survived3y"] for r in rows)
by_year = collections.OrderedDict()
for r in rows:
    y = r["move_in"][:4]
    a = by_year.setdefault(y, [0, 0])
    a[0] += 1
    a[1] += r["survived3y"]
meta = {
    "dataDate": DATA_DATE.isoformat(), "labelCutoff": CUTOFF.isoformat(), "horizonYears": HORIZON_Y,
    "rows": n, "survived": pos, "notSurvived": n - pos, "baseRate": round(pos / n, 4),
    "properties": len(set(r["property_id"] for r in rows)),
    "byMarket": dict(collections.Counter(r["market"] for r in rows)),
    "byMatchBasis": dict(collections.Counter(r["match_basis"] for r in rows)),
    "byMoveInSource": dict(collections.Counter(r["move_in_source"] for r in rows)),
    "byEndReasonWithin3y": dict(collections.Counter(r["end_reason"] or "Unknown" for r in rows if not r["survived3y"])),
    "byMoveInYear": {y: {"n": a[0], "survived": a[1]} for y, a in by_year.items()},
    "exclusions": dict(excl), "artifactStintsDropped": artifacts,
    "foodOccupancyRecordsByBasis": dict(basis_counter),
    "featureFill": {k: round(sum(1 for r in rows if r.get(k) is not None) / n, 3) for k in FEATS},
    "features": FEATS, "sites": len(site_rows),
}
json.dump(meta, open(os.path.join(OUT, "survival-dataset-meta.json"), "w", encoding="utf-8"), indent=1)
print(json.dumps({k: meta[k] for k in ("rows", "survived", "notSurvived", "baseRate", "properties", "byMarket",
                                       "byMatchBasis", "byMoveInSource", "byEndReasonWithin3y", "exclusions",
                                       "artifactStintsDropped", "sites")}, indent=1))
print("by year:", {y: "%d/%d" % (a[1], a[0]) for y, a in by_year.items()})
print("fill:", meta["featureFill"])
