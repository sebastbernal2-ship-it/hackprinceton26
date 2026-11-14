#!/usr/bin/env python3
"""Build a report on one home in the CoStar kit.

Usage: python3 scripts/house_report.py <MLS listing id>

Pulls the house, its neighborhood and schools from the kit, then adds nearby crime
(Houston NIBRS), Matterport model details and Vexcel data when available. Writes the full result to reports/<listingId>.json.
"""

import base64
import csv
import datetime
import json
import math
import os
import random
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "costar-hackathon-kit-hackPrinceton"
CACHE = ROOT / ".cache"
REPORTS = ROOT / "reports"

HOUSTON_LAND_SQ_MI = 640.4
VIOLENT_NIBRS = {"09A", "09B", "11A", "11B", "11C", "11D", "120", "13A", "13B"}
PROPERTY_NIBRS = {"200", "220", "23A", "23B", "23C", "23D", "23E", "23F", "23G", "23H", "240", "250", "270", "280", "290"}

AREA_TYPES = {2: "county", 5: "neighborhood", 9: "city", 16: "zip", 19: "metro"}


def load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    # python.org builds on macOS ship without root certificates.
    if os.path.exists("/etc/ssl/cert.pem"):
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return ssl.create_default_context()


SSL_CONTEXT = ssl_context()


def http_get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "house-report/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
        return resp.read()


def http_post_json(url, payload, headers=None, timeout=60):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "house-report/1.0", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
        return json.loads(resp.read())


def find_record(path, record_id):
    with open(path) as f:
        for line in f:
            if f'"id": {record_id},' in line[:40] or f'"id":{record_id},' in line[:40]:
                return json.loads(line)
    with open(path) as f:
        for line in f:
            record = json.loads(line)
            if record.get("id") == record_id:
                return record
    return None


# ---------- CoStar kit ----------

def load_listing(listing_id):
    listing = find_record(KIT / "data/residential-listings.jsonl", listing_id)
    if listing is None:
        sys.exit(f"Listing {listing_id} is not in data/residential-listings.jsonl")
    features = find_record(KIT / "data/residential-listing-features.jsonl", listing_id)
    enums = json.loads((KIT / "schemas/enums.json").read_text())
    return listing, features, enums


def decode(enums, enum_name, value):
    if value is None:
        return None
    return enums.get(enum_name, {}).get(str(value), value)


def matterport_ids(listing_id):
    ids = []
    with open(KIT / "residential-listings.csv") as f:
        for row in csv.DictReader(f):
            if row["ListingId"] == str(listing_id) and row["MatterportModelId"]:
                ids.append(row["MatterportModelId"])
    return ids


def house_summary(listing, features, enums):
    prop = listing.get("property") or {}
    address = prop.get("address") or {}
    derived = (features or {}).get("derivedValues") or {}
    price_changes = [
        {"date": h["date"][:10], "from": h.get("oldValue"), "to": h.get("newValue")}
        for h in listing.get("history") or []
        if h.get("updateType") == 2
    ]
    sections = {s["subcategory"]: s["lines"] for s in (features or {}).get("sections") or [] if s.get("subcategory")}
    return {
        "listingId": listing["id"],
        "address": f'{address.get("fullStreetAddress")}, {address.get("city")}, {address.get("state")} {address.get("zip")}',
        "latitude": address.get("latitude"),
        "longitude": address.get("longitude"),
        "transaction": decode(enums, "TransactionType", listing.get("transactionType")),
        "mlsStatus": decode(enums, "ListingStatus2", listing.get("listingStatus")),
        "homesStatus": decode(enums, "ForSaleStatus", listing.get("forSaleStatus")),
        "currentPrice": listing.get("currentPrice"),
        "originalPrice": listing.get("originalPrice"),
        "listDate": (listing.get("listDate") or "")[:10],
        "daysOnMarket": listing.get("dom"),
        "priceChanges": price_changes,
        "homeType": derived.get("propertyType") or decode(enums, "ListingPropertyType", prop.get("propertyType")),
        "beds": prop.get("bedsMin"),
        "baths": prop.get("bathsMin"),
        "sqft": prop.get("sqftMin"),
        "lotAcres": prop.get("lotSizeAcresMin"),
        "yearBuilt": prop.get("yearBuilt"),
        "stories": derived.get("numberOfStories"),
        "annualTaxes": prop.get("taxes"),
        "highlights": [h["text"] for h in (features or {}).get("highlights") or []],
        "financialDetails": sections.get("Listing and Financial Details", []),
        "homesUrl": f'https://www.homes.com/property/{prop["url"]}' if prop.get("url") else None,
    }


def neighborhood(listing):
    prop = listing.get("property") or {}
    areas = (prop.get("address") or {}).get("areas") or []
    result = {}
    for area in areas:
        kind = AREA_TYPES.get(area.get("enterpriseEntityType"))
        if not kind or not area.get("name"):
            continue
        if kind not in result or area.get("isPreferred"):
            result[kind] = area["name"]
    result["subdivision"] = prop.get("subdivision")
    return result


def schools(features):
    for section in (features or {}).get("sections") or []:
        if section.get("subcategory") == "Schools":
            return section["lines"]
    return []


# ---------- Crime (Houston NIBRS) ----------

def haversine_mi(lat1, lon1, lat2, lon2):
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def houston_nibrs_csv(year):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"NIBRSPublicView{year}.csv"
    if not path.exists():
        url = f"https://www.houstontx.gov/police/cs/xls/NIBRSPublicView{year}.csv"
        print(f"Downloading {url} ...", file=sys.stderr)
        path.write_bytes(http_get(url, timeout=300))
    return path


def crime_nearby(lat, lon, city, radius_mi=0.5):
    if (city or "").lower() != "houston":
        return {"available": False, "note": "Crime data is only wired up for Houston homes."}
    year = datetime.date.today().year
    try:
        path = houston_nibrs_csv(year)
    except Exception as exc:
        return {"available": False, "note": f"Could not download Houston NIBRS data: {exc}"}

    city_total = 0
    nearby = Counter()
    nearby_total = violent = prop_crime = 0
    latest = ""
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                count = int(row.get("Offense Count") or 1)
            except ValueError:
                count = 1
            city_total += count
            latest = max(latest, row.get("Occurrence Date") or "")
            try:
                rlat, rlon = float(row["Map Latitude"]), float(row["Map Longitude"])
            except (TypeError, ValueError):
                continue
            if abs(rlat - lat) > 0.02 or abs(rlon - lon) > 0.02:
                continue
            if haversine_mi(lat, lon, rlat, rlon) > radius_mi:
                continue
            nearby_total += count
            nearby[row["NIBRS Description"]] += count
            code = row["NIBRS Class"]
            if code in VIOLENT_NIBRS:
                violent += count
            elif code in PROPERTY_NIBRS:
                prop_crime += count

    circle_sq_mi = math.pi * radius_mi ** 2
    local_density = nearby_total / circle_sq_mi
    city_density = city_total / HOUSTON_LAND_SQ_MI
    return {
        "available": True,
        "source": f"Houston Police Department NIBRS public data, {year} through {latest}",
        "radiusMiles": radius_mi,
        "incidents": nearby_total,
        "violent": violent,
        "property": prop_crime,
        "topOffenses": nearby.most_common(8),
        "incidentsPerSqMi": round(local_density, 1),
        "houstonIncidentsPerSqMi": round(city_density, 1),
        "vsHoustonAverage": round(local_density / city_density, 2) if city_density else None,
    }


# ---------- Matterport ----------

def matterport_model(model_id):
    tour_url = f"https://my.matterport.com/show/?m={model_id}"
    key, token = os.environ.get("MATTERPORT_API_KEY"), os.environ.get("MATTERPORT_API_TOKEN")
    if not (key and token):
        return {"id": model_id, "tourUrl": tour_url, "note": "No Matterport credentials in .env."}
    query = """query($id: ID!) { model(id: $id) {
        id name created
        address { address }
        floors { id label }
        rooms { tags dimensions { areaFloor units } }
    } }"""
    auth = base64.b64encode(f"{key}:{token}".encode()).decode()
    try:
        resp = http_post_json(
            "https://api.matterport.com/api/models/graph",
            {"query": query, "variables": {"id": model_id}},
            headers={"Authorization": f"Basic {auth}"},
        )
    except Exception as exc:
        return {"id": model_id, "tourUrl": tour_url, "note": f"Matterport request failed: {exc}"}
    model = (resp.get("data") or {}).get("model")
    if not model:
        return {"id": model_id, "tourUrl": tour_url, "note": f"Matterport returned no model: {resp.get('errors')}"}
    rooms = [
        {"type": ", ".join(t for t in r["tags"] if t not in ("furnished", "unfurnished")),
         "sqft": round(r["dimensions"]["areaFloor"])}
        for r in model.get("rooms") or []
        if r.get("tags") and r.get("dimensions")
    ]
    return {
        "id": model_id,
        "name": model.get("name"),
        "scanned": (model.get("created") or "")[:10],
        "address": (model.get("address") or {}).get("address"),
        "floors": len(model.get("floors") or []),
        "rooms": rooms,
        "tourUrl": tour_url,
    }


# ---------- Vexcel ----------

VEXCEL_API = "https://api.vexcelgroup.com/v2"
VEXCEL_LAYERS = "urban,urban-r,wide-area,urban-g"
OBLIQUE_DIRECTIONS = ["oblique-north", "oblique-south", "oblique-east", "oblique-west"]


def vexcel_request(method, path, params=None, body=None, timeout=300):
    """Return (status, bytes). Retries on 429 with exponential backoff."""
    url = f"{VEXCEL_API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"X-API-KEY": os.environ["VEXCEL_API_KEY"], "User-Agent": "house-report/1.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    for attempt in range(6):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 5:
                return err.code, err.read()
            time.sleep(min(2 ** attempt, 30) + random.random())


def geojson_to_wkt(geometry):
    if isinstance(geometry, str):
        return geometry

    def ring(points):
        return "(" + ", ".join(f"{x} {y}" for x, y, *_ in points) + ")"

    def polygon(rings):
        return "(" + ", ".join(ring(r) for r in rings) + ")"

    if geometry["type"] == "Polygon":
        return "POLYGON " + polygon(geometry["coordinates"])
    if geometry["type"] == "MultiPolygon":
        return "MULTIPOLYGON (" + ", ".join(polygon(p) for p in geometry["coordinates"]) + ")"
    raise ValueError(f"Unsupported geometry type {geometry['type']}")


def square_around(lat, lon, half_m):
    dlat = half_m / 111_320
    dlon = half_m / (111_320 * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


def summarize_structure(s):
    defects = {
        name: s.get(f"roof-defects.{name}.percent")
        for name in ("discoloration", "missing-material", "tarp", "debris", "patch", "structural-damage", "rust")
        if s.get(f"roof-defects.{name}.detected")
    }
    roof_objects = {
        name: s.get(f"roof-objects.{name}.count")
        for name in ("chimney", "skylight", "roof-vent", "ac-unit", "satellite-dish")
        if s.get(f"roof-objects.{name}.count")
    }
    return {
        "primary": bool(s.get("primary-structure")),
        "footprintSqft": round(s["footprint.area"]) if s.get("footprint.area") else None,
        "roofMaterial": s.get("roof-characteristics.material.class"),
        "roofShape": s.get("roof-characteristics.shape.value"),
        "roofCondition": s.get("roof-characteristics.condition.precise-value") or s.get("roof-characteristics.condition"),
        "roofTreeCoverPercent": s.get("roof-characteristics.tree-cover.percent"),
        "roofDefectsPercent": defects,
        "roofObjects": roof_objects,
        "solar": s.get("roof-objects.solar.value"),
        "groundElevationFt": s.get("ground-elevation.value"),
    }


def vexcel(lat, lon, out_dir):
    if not os.environ.get("VEXCEL_API_KEY"):
        return {"available": False, "note": "No VEXCEL_API_KEY in .env."}
    point = f"POINT({lon} {lat})"
    status, body = vexcel_request("GET", "property/extract", params={
        "wkt": point, "srid": 4326, "layer": VEXCEL_LAYERS, "latest": "true",
        "include": "precomputed", "unit-system": "imperial",
    })
    result = {"available": True, "images": []}
    if status == 404:
        result["note"] = "No Vexcel parcel at this point; imagery uses an 80 m square instead."
        parcel_wkt = square_around(lat, lon, 40)
    elif status != 200:
        return {"available": False, "note": f"Vexcel property/extract failed ({status}): {body[:200].decode(errors='replace')}"}
    else:
        parcel = json.loads(body)["features"][0]
        attrs = parcel["properties"]
        parcel_wkt = geojson_to_wkt(parcel["geometry"])
        result.update({
            "collection": attrs.get("metadata.collection"),
            "layer": attrs.get("metadata.layer-name"),
            "imageryDate": (attrs.get("metadata.ortho-date-estimate") or "")[:10],
            "structureCount": attrs.get("structure.count"),
            "lotTreeCoverPercent": attrs.get("parcel-tree-cover.percent"),
            "hardscapePercent": attrs.get("hardscapes.percent"),
            "detected": [
                name for name in ("pool", "deck", "trampoline", "playground", "sport-court", "enclosure", "vehicles")
                if attrs.get(f"{name}.detected")
            ],
            "structures": [summarize_structure(s) for s in attrs.get("structures") or []],
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    directions = oblique_directions(parcel_wkt)
    if not directions:
        result["obliqueNote"] = "No oblique (angled) imagery here; only the urban layer has obliques."

    detections = detect_objects(parcel_wkt, directions)
    result["objects"] = Counter(d["label"] for found in detections.values() for d in found)

    views = ["ortho"] + directions
    for view in views:
        oriented = view != "ortho"
        color = (lambda c: c.replace("rgb(", "").replace(")", "")) if oriented else (lambda c: c)
        drawing = [{"wkt": parcel_wkt, "outline-width": 4, "outline-color": color("rgb(255,204,0)")}]
        for d in detections.get(view, []):
            box_color = color(DETECTION_COLORS[DETECTION_LABELS.index(d["label"]) % len(DETECTION_COLORS)])
            drawing.append({"wkt": d["bbox"], "outline-color": box_color, "outline-width": 3,
                            "label": f'{d["label"]} {d["confidence"]:.2f}', "label-color": box_color, "label-size": 18})
        if oriented:
            for item in drawing:
                item.update({"fill-color": item["outline-color"], "transparency": 0})
            request = {"layer": "urban", "product-type": view, "rotation": "natural", "crop": "bbox",
                       "image-format": "jpeg/png"}
        else:
            request = {"layer": VEXCEL_LAYERS, "crop": "bounding_box", "image-format": "jpeg"}
        status, image = vexcel_request("POST", f'{"oriented" if oriented else "ortho"}/extract', body={
            "wkt": parcel_wkt, "srid": 4326, "buffer-meter": 10, "drawing": drawing, **request,
        })
        if status == 200:
            path = out_dir / f"{view}.jpg"
            path.write_bytes(image)
            result["images"].append(str(path.relative_to(ROOT)))

    result["amenities"] = nearby_amenities(lat, lon, out_dir)
    result["lookalikes"] = lookalike_lots(lat, lon, out_dir)
    return result


DETECTION_LABELS = ["tree", "fence", "shed", "carport", "car", "solar panel", "drainage channel"]
DETECTION_COLORS = ["rgb(80,255,80)", "rgb(255,64,255)", "rgb(0,229,255)", "rgb(255,120,0)",
                    "rgb(255,255,255)", "rgb(255,64,64)", "rgb(64,128,255)"]
AMENITY_QUERIES = ["park", "playground", "sports field", "swimming pool", "lake or pond"]


def oblique_directions(parcel_wkt):
    status, body = vexcel_request("GET", "oriented/collections", params={
        "wkt": parcel_wkt, "srid": 4326, "layer": "urban", "product-type": "oblique",
        "include": "product-type,collection,last-capture-date",
    })
    features = json.loads(body).get("features", []) if status == 200 else []
    newest = max((f["properties"]["last-capture-date"] for f in features), default=None)
    available = {f["properties"]["product-type"] for f in features if f["properties"]["last-capture-date"] == newest}
    return [d for d in OBLIQUE_DIRECTIONS if d in available]


def detect_objects(parcel_wkt, directions, threshold=0.4):
    """Run open-vocabulary detection on the ortho and each oblique. Returns {view: [detection]}."""
    images = [{"endpoint": "ortho/extract",
               "request": {"layer": VEXCEL_LAYERS, "srid": 4326, "wkt": parcel_wkt, "crop": "bounding_box"}}]
    for direction in directions:
        images.append({"endpoint": "oriented/extract",
                       "request": {"layer": "urban", "srid": 4326, "wkt": parcel_wkt, "product-type": direction,
                                   "rotation": "natural", "crop": "bbox"}})
    status, body = vexcel_request("POST", "elements/detect", body={
        "wkt": parcel_wkt, "srid": 4326, "buffer-meter": 0, "images": images,
        "model-input": {
            "elements": [{"label": l, "model": "sam3", "detection-threshold": threshold} for l in DETECTION_LABELS],
            "include": ["bbox", "confidence"],
        },
    })
    if status != 200:
        return {}
    response = json.loads(body)
    view_by_id = {got["image-id"]: (sent["request"].get("product-type") or "ortho")
                  for sent, got in zip(images, response.get("images", []))}
    by_view = {}
    for feat in response.get("features", []):
        label = feat["properties"]["label"]
        for d in feat["properties"]["detections"]:
            view = view_by_id.get(d["imageId"])
            if view:
                by_view.setdefault(view, []).append({"label": label, "confidence": d["confidence"], "bbox": d["bbox"]})
    return by_view


def tile_center(geometry):
    wkt = geojson_to_wkt(geometry)
    numbers = [float(n) for n in wkt.replace("(", " ").replace(")", " ").replace(",", " ").split()
               if n.lstrip("-").replace(".", "", 1).isdigit()]
    xs, ys = numbers[0::2], numbers[1::2]
    return (min(ys) + max(ys)) / 2, (min(xs) + max(xs)) / 2, wkt


def bearing_and_distance(lat, lon, to_lat, to_lon):
    north_m = (to_lat - lat) * 111_320
    east_m = (to_lon - lon) * 111_320 * math.cos(math.radians(lat))
    compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][round(math.degrees(math.atan2(east_m, north_m)) / 45) % 8]
    return round(math.hypot(east_m, north_m) / 1609.34, 2), compass


def embedding_search(lat, lon, half_m, count, **search):
    status, body = vexcel_request("POST", "embedding/extract", body={
        "wkt": square_around(lat, lon, half_m), "srid": 4326, "include": "score,geometry,collection",
        "total-records": count, "page-size": count, **search,
    })
    if status != 200:
        return []
    matches = []
    for feat in json.loads(body).get("features", []):
        tlat, tlon, wkt = tile_center(feat["geometry"])
        miles, compass = bearing_and_distance(lat, lon, tlat, tlon)
        matches.append({"score": round(feat["properties"]["score"], 3), "latitude": round(tlat, 6),
                        "longitude": round(tlon, 6), "miles": miles, "direction": compass, "wkt": wkt})
    return matches


def save_tile(match, path):
    status, image = vexcel_request("POST", "ortho/extract", body={
        "wkt": match["wkt"], "srid": 4326, "layer": VEXCEL_LAYERS, "crop": "bounding_box",
        "destination-dimensions": "400,400", "image-format": "jpeg",
    })
    if status == 200:
        path.write_bytes(image)
        return str(path.relative_to(ROOT))
    return None


def nearby_amenities(lat, lon, out_dir, half_m=1000):
    """Best embedding match for each amenity in a 2 km square around the home."""
    amenities = {}
    for query in AMENITY_QUERIES:
        matches = embedding_search(lat, lon, half_m, 1, **{"search-text": query})
        if matches:
            best = matches[0]
            best["image"] = save_tile(best, out_dir / f"amenity-{query.replace(' ', '-')}.jpg")
            amenities[query] = {k: v for k, v in best.items() if k != "wkt"}
    return amenities


def lookalike_lots(lat, lon, out_dir, half_m=3000, count=5):
    """Tiles in a 6 km square that look most like the home's own tile, skipping the home's own block."""
    matches = embedding_search(lat, lon, half_m, count * 4, **{"search-location": f"POINT({lon} {lat})"})
    matches = [m for m in matches if m["miles"] >= 0.25][:count]
    for i, match in enumerate(matches, 1):
        match["image"] = save_tile(match, out_dir / f"lookalike-{i}.jpg")
        del match["wkt"]
    return matches


# ---------- Report ----------

def money(value):
    return f"${value:,.0f}" if isinstance(value, (int, float)) else "n/a"


def print_report(report):
    h, n, c = report["house"], report["neighborhood"], report["crime"]
    line = "=" * 70
    print(line)
    print(h["address"])
    print(line)
    print(f'{h["transaction"]} | MLS {h["mlsStatus"]} | Homes.com {h["homesStatus"]}')
    print(f'Asking {money(h["currentPrice"])} (originally {money(h["originalPrice"])}), listed {h["listDate"]}, {h["daysOnMarket"]} days on market')
    for change in h["priceChanges"]:
        print(f'  {change["date"]}: price cut {money(change["from"])} -> {money(change["to"])}')
    print(f'{h["homeType"]}: {h["beds"]} bed, {h["baths"]} bath, {h["sqft"]:,} sqft, {h["lotAcres"]} acre lot, built {h["yearBuilt"]}')
    print(f'Annual taxes {money(h["annualTaxes"])}')
    if h["highlights"]:
        print("Highlights: " + "; ".join(h["highlights"]))
    for detail in h["financialDetails"]:
        print(f"  {detail}")

    print("\nNEIGHBORHOOD")
    for kind in ("neighborhood", "subdivision", "zip", "city", "county", "metro"):
        if n.get(kind):
            print(f"  {kind.title():13} {n[kind]}")

    print("\nASSIGNED SCHOOLS")
    for school in report["schools"] or ["(none listed)"]:
        print(f"  {school}")

    print("\nCRIME NEARBY")
    if c["available"]:
        print(f'  {c["incidents"]} incidents within {c["radiusMiles"]} mi ({c["violent"]} violent, {c["property"]} property)')
        print(f'  {c["incidentsPerSqMi"]} per sq mi vs {c["houstonIncidentsPerSqMi"]} Houston-wide ({c["vsHoustonAverage"]}x the city average)')
        for offense, count in c["topOffenses"]:
            print(f"    {count:4}  {offense}")
        print(f'  Source: {c["source"]}')
    else:
        print(f'  {c["note"]}')

    print("\nMATTERPORT 3D")
    for model in report["matterport"]:
        if model.get("name"):
            print(f'  {model["name"]} (scanned {model["scanned"]}, {model["floors"]} floor(s))')
            for room in model["rooms"]:
                print(f'    {room["type"]:28} {room["sqft"]:5} sqft')
        elif model.get("note"):
            print(f'  {model["note"]}')
        print(f'  Tour: {model["tourUrl"]}')

    print("\nVEXCEL AERIAL")
    v = report["vexcel"]
    if v.get("note"):
        print(f'  {v["note"]}')
    if v.get("collection"):
        print(f'  Imagery {v["collection"]} ({v["layer"]} layer), captured about {v["imageryDate"]}')
        print(f'  Lot: {v["lotTreeCoverPercent"]}% tree cover, {v["hardscapePercent"]}% hardscape, {v["structureCount"]} structure(s)')
        print(f'  Detected on lot: {", ".join(v["detected"]) or "no pool, deck, trampoline, playground or vehicles"}')
        for s in v["structures"]:
            label = "Main building" if s["primary"] else "Other building"
            print(f'  {label}: {s["footprintSqft"]:,} sqft roof footprint, {s["roofMaterial"]} {s["roofShape"]} roof, '
                  f'condition score {s["roofCondition"]}, solar {"yes" if s["solar"] else "no"}')
            if s["roofDefectsPercent"]:
                print("    Roof defects: " + ", ".join(f"{k} {p}%" for k, p in s["roofDefectsPercent"].items()))
            if s["roofObjects"]:
                print("    Roof objects: " + ", ".join(f"{n} {k}" for k, n in s["roofObjects"].items()))
            if s["groundElevationFt"] is not None:
                print(f'    Ground elevation {s["groundElevationFt"]:.0f} ft')
    if v.get("obliqueNote"):
        print(f'  {v["obliqueNote"]}')
    if v.get("available"):
        found = ", ".join(f"{label} x{n}" for label, n in v["objects"].items())
        print(f'  Objects detected (looked for {", ".join(DETECTION_LABELS)}): {found or "none"}')
    for image in v.get("images", []):
        print(f"  Saved {image}")

    if v.get("amenities"):
        print("\nNEARBY (Vexcel imagery search, best match within ~1.2 mi)")
        for query, m in v["amenities"].items():
            print(f'  {query:14} {m["miles"]:.2f} mi {m["direction"]:2}  score {m["score"]:.3f}  '
                  f'({m["latitude"]}, {m["longitude"]})')
    if v.get("lookalikes"):
        print("\nLOOK-ALIKE LOTS (Vexcel imagery that looks most like this one, within ~3.7 mi)")
        for i, m in enumerate(v["lookalikes"], 1):
            print(f'  #{i} {m["miles"]:.2f} mi {m["direction"]:2}  score {m["score"]:.3f}  ({m["latitude"]}, {m["longitude"]})')

    print("\nNOTES")
    print("  Crime counts are reported incidents this year within the radius, not an official crime rate.")
    print("  Texas does not disclose sale prices, so only asking prices are shown.")
    print("  The kit names the assigned schools but has no school ratings.")
    if h["homesUrl"]:
        print(f'  Listing: {h["homesUrl"]}')


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        sys.exit("Usage: python3 scripts/house_report.py <MLS listing id>")
    listing_id = int(sys.argv[1])
    load_env()

    listing, features, enums = load_listing(listing_id)
    house = house_summary(listing, features, enums)
    city = ((listing.get("property") or {}).get("address") or {}).get("city")
    lat, lon = house["latitude"], house["longitude"]

    report = {
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "house": house,
        "neighborhood": neighborhood(listing),
        "schools": schools(features),
        "crime": crime_nearby(lat, lon, city),
        "matterport": [matterport_model(m) for m in matterport_ids(listing_id)],
        "vexcel": vexcel(lat, lon, REPORTS / str(listing_id)),
    }

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / f"{listing_id}.json").write_text(json.dumps(report, indent=2))
    print_report(report)
    print(f"\nFull data saved to reports/{listing_id}.json")


if __name__ == "__main__":
    main()
