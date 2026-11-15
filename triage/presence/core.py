"""Day/night presence index within a radius of a site. Not foot traffic, not a 24-hour clock.

Two points only: a DAY side (employees at current tenant locations) and a NIGHT side (residents + hotel guests),
both counted from CoStar kit buildings only. The kit covers just the Matterport property list, so every number is a
kit-listed count (a lower bound on the real neighbourhood), and the shape label is about the kit-listed mix.
"""
from __future__ import annotations

import math

RADII_MILES = (0.25, 0.5)
PROPERTY_TYPE_MULTIFAMILY, PROPERTY_TYPE_HOSPITALITY = 11, 1
# Assumptions (labelled in every response). Not observed.
RESIDENTS_PER_UNIT = {"low": 1.5, "expected": 2.0, "high": 2.5}
GUESTS_PER_OCCUPIED_ROOM = 1.5
HOTEL_OCCUPANCY_FALLBACK = 0.65  # used only where the kit gives no averageOccupancyPercent
HOTEL_OCCUPANCY_RANGE = (0.5, 0.8)  # low/high band when the fallback applies
DAY_HEAVY_MIN_SHARE, NIGHT_HEAVY_MAX_SHARE = 0.65, 0.35  # day share thresholds; a labelling convention
INDUSTRY = {1: "Accountants", 2: "Transportation", 3: "Engineers/Architects", 4: "Real estate", 5: "Manufacturing",
            6: "Retail/Wholesale", 7: "Financial institutions", 8: "Computers/Data", 9: "Public administration",
            10: "Ag/Mining/Utilities/Construction", 11: "Information", 12: "Professional/Scientific/Technical",
            13: "Personal services", 14: "Insurance", 15: "Health care", 16: "Law firms", 17: "Accommodation/Food",
            18: "Admin/Support", 19: "Agriculture", 20: "Arts/Entertainment/Recreation", 21: "Education",
            22: "Management of companies", 23: "Mining/Oil/Gas", 24: "Rental/Leasing", 25: "Utilities"}


def haversine_miles(la1, lo1, la2, lo2) -> float:
    p1, p2 = math.radians(la1), math.radians(la2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(a))


def assumptions() -> list[str]:
    r = RESIDENTS_PER_UNIT
    return [
        f"Residents per apartment unit is an ASSUMPTION: {r['low']} / {r['expected']} / {r['high']} (low/expected/high); the kit has unit counts, not residents.",
        f"Hotel guests = rooms x occupancy x {GUESTS_PER_OCCUPIED_ROOM} guests per occupied room (assumption). Occupancy is the kit's averageOccupancyPercent where present, otherwise "
        f"{HOTEL_OCCUPANCY_FALLBACK} (band {HOTEL_OCCUPANCY_RANGE[0]}-{HOTEL_OCCUPANCY_RANGE[1]}, assumption).",
        "Daytime workers = numEmployees summed over distinct CURRENT tenant locations (open occupancy) in kit buildings; numEmployees is CoStar-researched and missing on some locations (fill rate reported); missing is unknown, not zero, so the worker count is a lower bound.",
        "Distance is great-circle from the site's coordinates to each kit building's primary-address coordinates; a building counts wholly if its point is inside the radius.",
        "The kit lists only Matterport-covered properties, not every building nearby: all counts are kit-listed lower bounds, and the shape label describes the kit-listed mix only.",
        f"Shape label from day share = workers / (workers + night population) at expected assumptions: day-heavy >= {DAY_HEAVY_MIN_SHARE}, night-heavy <= {NIGHT_HEAVY_MAX_SHARE}, else mixed; thresholds are a labelling convention. 'unknown' if either side has no observed count.",
        "This is a presence index (who is registered to be in kit buildings by day versus by night). It is NOT foot traffic, not a 24-hour clock, and not a demand forecast.",
    ]


def presence(site_lat: float, site_lon: float, buildings: list[dict]) -> dict:
    """buildings: {id, lat, lon, ptype, units, rooms, occ_pct (0-100|None), tenants:[{loc, employees|None, industry}]}"""
    out = {}
    for rad in RADII_MILES:
        inside = [b for b in buildings if b.get("lat") is not None and b.get("lon") is not None
                  and haversine_miles(site_lat, site_lon, b["lat"], b["lon"]) <= rad]
        seen, workers, loc_n, loc_emp, by_ind = set(), 0, 0, 0, {}
        for b in inside:
            for t in b.get("tenants", []):
                if t["loc"] in seen:
                    continue
                seen.add(t["loc"])
                loc_n += 1
                if t.get("employees") is not None:
                    loc_emp += 1
                    workers += t["employees"]
                    nm = INDUSTRY.get(t.get("industry"), "Unknown industry")
                    by_ind[nm] = by_ind.get(nm, 0) + t["employees"]
        apts = [b for b in inside if b.get("ptype") == PROPERTY_TYPE_MULTIFAMILY]
        apt_units = sum(b["units"] for b in apts if b.get("units"))
        apt_known = sum(1 for b in apts if b.get("units"))
        hotels = [b for b in inside if b.get("ptype") == PROPERTY_TYPE_HOSPITALITY]
        rooms = sum(b["rooms"] for b in hotels if b.get("rooms"))
        guest = {"low": 0.0, "expected": 0.0, "high": 0.0}
        for b in hotels:
            if not b.get("rooms"):
                continue
            if b.get("occ_pct"):
                o = (b["occ_pct"] / 100,) * 3
            else:
                o = (HOTEL_OCCUPANCY_RANGE[0], HOTEL_OCCUPANCY_FALLBACK, HOTEL_OCCUPANCY_RANGE[1])
            for k, ov in zip(("low", "expected", "high"), o):
                guest[k] += b["rooms"] * ov * GUESTS_PER_OCCUPIED_ROOM
        residents = {k: apt_units * v for k, v in RESIDENTS_PER_UNIT.items()}
        night = {k: residents[k] + guest[k] for k in residents}
        day_obs, night_obs = loc_emp > 0, (apt_units + rooms) > 0
        if day_obs and night_obs:
            share = workers / (workers + night["expected"])
            shape = "day-heavy" if share >= DAY_HEAVY_MIN_SHARE else "night-heavy" if share <= NIGHT_HEAVY_MAX_SHARE else "mixed"
        else:
            share, shape = None, "unknown"
        out[f"{rad}mi"] = {
            "radiusMiles": rad, "kitBuildingsInRadius": len(inside),
            "day": {"workers": workers if day_obs else None, "status": "observed (kit-listed lower bound)" if day_obs else "unknown",
                    "tenantLocations": loc_n, "locationsWithEmployeeCount": loc_emp,
                    "employeeFillRate": round(loc_emp / loc_n, 3) if loc_n else None,
                    "byIndustry": dict(sorted(by_ind.items(), key=lambda kv: -kv[1]))},
            "night": {"status": "derived from kit units/rooms with assumed factors" if night_obs else "unknown",
                      "apartmentBuildings": len(apts), "apartmentBuildingsWithUnitCount": apt_known, "apartmentUnits": apt_units if apts else None,
                      "residents": {k: round(v) for k, v in residents.items()} if apts and apt_units else None,
                      "hotels": len(hotels), "hotelRooms": rooms if hotels else None,
                      "hotelGuests": {k: round(v) for k, v in guest.items()} if rooms else None,
                      "nightPopulation": {k: round(v) for k, v in night.items()} if night_obs else None},
            "dayShare": round(share, 3) if share is not None else None, "shape": shape,
        }
    return {"radii": out, "assumptions": assumptions(),
            "notAFootTrafficMeasure": "Presence index of kit-listed buildings; not foot traffic and not a 24-hour clock."}
