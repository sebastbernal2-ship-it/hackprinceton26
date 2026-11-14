"""Signage and visibility factor adapter.

fetch(site) -> raw: site frontage from the local CoStar kit plus a cached
reachability/identity check of the ordinance sources cited in rules.json.
observations(site, raw) -> list of factor-card dicts (contracts/factor-card.schema.json).

Principles: recorded frontage is not sightline; a derived sign allowance is a
rule applied to a recorded number, not a permit; missing frontage is unknown.
"""
import hashlib
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

FACTOR_ID = "signage_visibility"
HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent.parent
RULES = json.loads((HERE / "rules.json").read_text())
DEFAULT_COSTAR = DATA / "raw/costar/full-kit/data/commercial-property.jsonl"
DEFAULT_CACHE = DATA / "derived" / FACTOR_ID / "cache"
SOURCE_TTL_S = 7 * 24 * 3600
UA = "factor-adapter/0.1 (signage_visibility; research)"
COSTAR_ASOF = "unknown (CoStar kit records carry no per-record date)"
COSTAR_SRC = "CoStar full kit commercial-property propertyRetail.frontage (local, licensed)"


def _http_get(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type"), r.read(65536)


def _check_source(url, cache_dir, http_get, timeout, retries, refresh, now):
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    path = cache_dir / f"source-{key}.json"
    if not refresh and path.exists():
        cached = json.loads(path.read_text())
        if now - cached["checkedEpoch"] < SOURCE_TTL_S:
            return cached
    result = {"url": url, "status": None, "contentType": None, "headSha256": None, "error": None}
    for attempt in range(retries + 1):
        try:
            status, ctype, body = http_get(url, timeout)
            result.update(status=status, contentType=ctype, headSha256=hashlib.sha256(body).hexdigest(), error=None)
            break
        except urllib.error.HTTPError as e:
            result.update(status=e.code, error=f"HTTP {e.code}")
            if e.code < 500:
                break  # 4xx will not improve on retry
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            result["error"] = type(e).__name__
        if attempt < retries:
            time.sleep(min(2 ** attempt, 4))
    result["checkedEpoch"] = now
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result))
    return result


_INDEX = {}


def _frontage_index(path):
    """One pass over the CoStar jsonl keeping only {id: frontage list}."""
    path = str(path)
    if path not in _INDEX:
        idx = {}
        with open(path) as f:
            for line in f:
                d = json.loads(line)
                idx[str(d["id"])] = (d.get("propertyRetail") or {}).get("frontage") or []
        _INDEX[path] = idx
    return _INDEX[path]


def fetch(site, *, costar_path=None, cache_dir=None, http_get=None, timeout=15, retries=2,
          refresh=False, check_sources=True, now=None):
    """site: dict with property_id, city, state, latitude, longitude."""
    cache_dir = pathlib.Path(cache_dir or DEFAULT_CACHE)
    costar_path = pathlib.Path(costar_path or os.environ.get("COSTAR_PROPERTY_JSONL") or DEFAULT_COSTAR)
    now = time.time() if now is None else now
    pid = str(site["property_id"])
    idx = _frontage_index(costar_path)
    raw = {"propertyId": pid, "costarRecordFound": pid in idx, "frontage": idx.get(pid, []), "sourceChecks": []}
    city = site.get("city")
    if check_sources and city in RULES["cities"]:
        c = RULES["cities"][city]
        urls = [c["primarySource"]["url"]] + [s["url"] for s in c["secondarySources"]]
        for u in urls:
            raw["sourceChecks"].append(
                _check_source(u, cache_dir, http_get or _http_get, timeout, retries, refresh, now))
    return raw


def _feet(seg):
    """(feet, which field). frontageInFeet preferred; footprint.distanceFeet is a fallback."""
    v = seg.get("frontageInFeet")
    if v is not None:
        return float(v), "frontageInFeet"
    v = (seg.get("footprint") or {}).get("distanceFeet")
    if v is not None:
        return float(v), "footprint.distanceFeet"
    return None, None


def pick_frontage(segments):
    """Return (feet, how) for the frontage used by rules, or (None, reason).

    Uses the segment flagged primary; if none flagged and exactly one segment
    exists, that one. Never guesses among several unflagged segments."""
    segs = [s for s in segments if _feet(s)[0] is not None]
    if not segs:
        return None, "no frontage length recorded"
    primary = [s for s in segs if s.get("isPrimaryFrontage")]
    if len(primary) == 1:
        return _feet(primary[0])[0], "primary-flagged segment (%s)" % _feet(primary[0])[1]
    if not primary and len(segs) == 1:
        return _feet(segs[0])[0], "single unflagged segment (%s)" % _feet(segs[0])[1]
    return None, "ambiguous: %d segments, %d flagged primary" % (len(segs), len(primary))


def _fmt(x):
    return str(int(x)) if float(x).is_integer() else f"{x:.1f}"


def _obs(status, value, unit, source, record, asof, geo, lim):
    return {"factorId": FACTOR_ID, "status": status, "value": value, "unit": unit, "source": source,
            "recordId": record, "asOf": asof, "geography": geo, "limitations": lim}


def observations(site, raw):
    pid = str(site["property_id"])
    city = site.get("city")
    geo = f"{city}, {site.get('state')} ({site['latitude']}, {site['longitude']})"
    out = []
    segs = raw.get("frontage") or []
    feet, how = pick_frontage(segs)
    base_lim = ("Recorded frontage length is a CoStar attribute, not sightline, street exposure or sign rights; "
                "segment-to-legal-'street frontage' mapping is not verified.")
    if not raw.get("costarRecordFound"):
        out.append(_obs("unknown", "unknown", "ft", COSTAR_SRC, f"costar:{pid}#frontage", COSTAR_ASOF, geo,
                        "Property id not found in the local CoStar kit; absence is not evidence of no frontage."))
    elif not segs:
        out.append(_obs("unknown", "unknown", "ft", COSTAR_SRC, f"costar:{pid}#frontage", COSTAR_ASOF, geo,
                        "CoStar record has no propertyRetail.frontage entries; missing is not zero."))
    else:
        total = sum(_feet(s)[0] for s in segs if _feet(s)[0] is not None)
        n_prim = sum(1 for s in segs if s.get("isPrimaryFrontage"))
        if feet is not None:
            out.append(_obs("observed", _fmt(feet), "ft", COSTAR_SRC, f"costar:{pid}#frontage", COSTAR_ASOF, geo,
                            f"Selected {how}; {len(segs)} segment(s) recorded, {_fmt(total)} ft summed. " + base_lim))
        else:
            out.append(_obs("unknown", "unknown", "ft", COSTAR_SRC, f"costar:{pid}#frontage", COSTAR_ASOF, geo,
                            f"{how}; {len(segs)} segment(s), {n_prim} flagged primary. " + base_lim))
    rules = {r["id"]: r for r in RULES["cities"].get(city, {}).get("rules", [])}
    cite = RULES["cities"].get(city, {}).get("primarySource", {})
    if city == "Los Angeles":
        src = f"LAMC 14.4.8-14.4.9 via {cite['url']} (read on mirror, see rules.json)"
        asof = f"code text read {RULES['retrievedOn']}; edition unknown"
        lim = ("Rule applied to CoStar frontage; not a permit determination. Overlays (Hollywood Signage SUD, HPOZ, "
               "specific plans) not checked. Official host not read directly.")
        if feet is None:
            for rid, unit in (("LA-14.4.8-A", "sq ft"), ("LA-14.4.9-A", "eligibility")):
                out.append(_obs("unknown", "unknown", unit, src, f"{pid}|{rid}", asof, geo,
                                "Needs a usable frontage length. " + lim))
        else:
            cap = rules["LA-14.4.8-A"]["limits"]["combinedSqFtPerFtFrontage"] * feet
            out.append(_obs("derived", _fmt(cap), "sq ft combined sign area ceiling", src, f"{pid}|LA-14.4.8-A", asof,
                            geo, "4 sq ft x selected frontage. A ceiling across all sign types, not an expected or "
                                 "approved sign. " + lim))
            minf = rules["LA-14.4.9-A"]["limits"]["minFrontageFt"]
            if feet >= minf:
                p = rules["LA-14.4.9-B"]["limits"]
                pc = min(p["baseSqFt"] + p["sqFtPerFtFrontage"] * feet, p["maxSqFt"])
                val = f"frontage >= {minf} ft; projecting sign area ceiling {_fmt(pc)} sq ft per direction"
            else:
                val = f"frontage < {minf} ft; projecting signs not permitted on that frontage"
            out.append(_obs("derived", val, "projecting-sign eligibility", src, f"{pid}|LA-14.4.9", asof, geo,
                            "14.4.9 A-B applied to selected frontage only. " + lim))
        out.append(_obs("unknown", "unknown", "overlay", "LA Hollywood Signage SUD / HPOZ not queried",
                        f"{pid}|LA-overlay", "unknown", geo,
                        "No overlay lookup performed; unknown is not 'no overlay'."))
    elif city == "Houston":
        src = f"Houston Sign Code ch. 46 s.4611 via {cite['url']}"
        asof = f"code current through Ord. 2020-669 eff. {cite['asOf']}"
        out.append(_obs("unknown", "unknown", "sq ft sign allowance", src, f"{pid}|HOU-T4611", asof, geo,
                        "Houston limits depend on right-of-way category (local/major/freeway/scenic-historic) and "
                        "wall area, neither is in the data; frontage does not set sign area."))
        out.append(_obs("unknown", "unknown", "overlay", "Houston s.4610 scenic/historical ROW list not queried",
                        f"{pid}|HOU-4610", "unknown", geo,
                        "No scenic/historical ROW or district lookup performed; unknown is not 'none'."))
    else:
        out.append(_obs("unknown", "unknown", "sign rules", "no rules recorded for this city", f"{pid}|rules",
                        "unknown", geo, "City not covered by rules.json."))
    out.append(_obs("unknown", "unknown", "sightline", "no imagery or field source", f"{pid}|visibility", "unknown", geo,
                    "Storefront visibility, obstruction and customer recognition are not observed; Vexcel imagery "
                    "access and human-verified labels are required."))
    return out
