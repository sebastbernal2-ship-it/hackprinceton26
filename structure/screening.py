"""Structural screening PRIOR from kit fields + public hazard layers. Not an engineering assessment.

Every threshold below carries a source label: 'observed-source' (value comes straight from a cited API/field) or
'assumption' (screening convention chosen here, to be verified). Unknown inputs yield unknown flags, never defaults.
"""
from __future__ import annotations

NOTICE = ("Screening prior from public kit fields and hazard layers; NOT an engineering assessment or a seismic/flood "
          "evaluation. Tiers rank where to look first, not whether a building is safe. Verify with a licensed structural "
          "engineer. Unknown inputs stay unknown.")
SEV = {"low": 0, "moderate": 1, "elevated": 2}
URM_MATERIALS = {"Masonry", "Brownstone", "Limestone"}

# (threshold id, value, source label, note)
THRESHOLDS = {
    "la_urm_year": (1934, "assumption", "pre-1934 masonry = unreinforced-masonry era in LA (LA URM ordinance era; verify with LADBS)"),
    "la_ductile_year": (1977, "assumption", "pre-1977 reinforced concrete / pre-1978 wood soft-story era screening cutoff (LA soft-story and non-ductile concrete programs; verify)"),
    "la_northridge_year": (1995, "assumption", "pre-1995 steel moment frame = pre-Northridge connection era (verify)"),
    "tx_premodern_year": (1980, "assumption", "Houston has no single statewide era cutoff; pre-1980 treated as pre-modern wind/flood design (verify with city permits)"),
    "sdc_elevated": ("D", "observed-source", "ASCE 7 Seismic Design Category returned by USGS design-maps service (D/E/F = elevated)"),
    "sdc_moderate": ("C", "observed-source", "ASCE 7 SDC C = moderate"),
    "flood_sfha": ("A*/V*", "observed-source", "FEMA NFHL zone prefix A or V = Special Flood Hazard Area (1% annual chance)"),
    "flood_shaded_x": ("X (shaded) / 0.2%", "observed-source", "FEMA moderate hazard"),
}


def region(city: str | None, state: str | None) -> str | None:
    c, s = (city or "").lower(), (state or "").upper()
    if "los angeles" in c and s in ("CA", ""):
        return "LA"
    if "houston" in c and s in ("TX", ""):
        return "HOU"
    return None


def _flag(fid, lens, sev, text, evidence, thr=None, status="derived"):
    t = THRESHOLDS.get(thr) if thr else None
    return {"id": fid, "lens": lens, "severity": sev, "text": text, "evidence": evidence, "status": status,
            "threshold": None if not t else {"id": thr, "value": t[0], "source": t[1], "note": t[2]}}


def seismic_flags(p: dict, reg: str | None) -> list[dict]:
    out = []
    u = p.get("usgs") or {}
    sdc = u.get("sdc")
    if sdc:
        sev = "elevated" if sdc in ("D", "E", "F") else "moderate" if sdc == "C" else "low"
        out.append(_flag("usgs_sdc", "seismic", sev, f"USGS ASCE7-22 Seismic Design Category {sdc} (site class D default)",
                         {"sds": u.get("sds"), "sd1": u.get("sd1"), "pgam": u.get("pgam"), "siteClass": u.get("siteClass")},
                         "sdc_elevated" if sev == "elevated" else "sdc_moderate", "observed"))
    y, m, st = p.get("yearBuilt"), p.get("material"), p.get("stories")
    if reg == "LA":
        if y is None or m is None:
            out.append(_flag("la_era", "seismic", None, "Code-era flag not evaluable: year built or frame material unknown", {"yearBuilt": y, "material": m}))
        else:
            ev = {"yearBuilt": y, "material": m, "stories": st}
            if m in URM_MATERIALS and y < THRESHOLDS["la_urm_year"][0]:
                out.append(_flag("la_urm", "seismic", "elevated", "Pre-1934 masonry: possible unreinforced masonry (reinforcement not in kit)", ev, "la_urm_year"))
            if m == "WoodFrame" and y < THRESHOLDS["la_ductile_year"][0] and (st or 0) >= 2:
                out.append(_flag("la_softstory", "seismic", "elevated", "Pre-1978 multi-story wood frame: soft-story candidate (ground-floor openings not in kit)", ev, "la_ductile_year"))
            if m == "ReinforcedConcrete" and y < THRESHOLDS["la_ductile_year"][0]:
                out.append(_flag("la_nonductile", "seismic", "elevated", "Pre-1977 reinforced concrete: possible non-ductile detailing", ev, "la_ductile_year"))
            if m == "Steel" and y < THRESHOLDS["la_northridge_year"][0]:
                out.append(_flag("la_prenorthridge", "seismic", "moderate", "Pre-1995 steel: possible pre-Northridge connection era", ev, "la_northridge_year"))
    return out


def flood_flags(p: dict, reg: str | None) -> list[dict]:
    out = []
    f = p.get("fema") or {}
    z = f.get("zone")
    if z:
        sfha = z.startswith(("A", "V"))
        sev = "elevated" if sfha else "low"
        out.append(_flag("fema_zone", "flood", sev, f"FEMA NFHL zone {z}" + (" (Special Flood Hazard Area)" if sfha else ""),
                         {"zone": z, "staticBfeFt": f.get("bfeFt"), "elevationFtNAVD88": p.get("elevationFt")}, "flood_sfha" if sfha else None, "observed"))
    else:
        out.append(_flag("fema_zone", "flood", None, "FEMA zone unknown (no NFHL polygon or endpoint unreachable)", {"error": f.get("error")}))
    if reg == "HOU":
        y = p.get("yearBuilt")
        if y is not None and y < THRESHOLDS["tx_premodern_year"][0]:
            out.append(_flag("hou_premodern", "flood_wind", "moderate", "Pre-1980 build: pre-modern wind/flood design era (assumed cutoff)", {"yearBuilt": y}, "tx_premodern_year"))
        out.append(_flag("hou_clay", "geotechnical", "moderate", "Houston area: expansive-clay and subsidence prior (regional prior, parcel soils and subsidence unknown; no reachable public subsidence layer found)", {"parcelSoils": None, "subsidence": None}, None, "assumption"))
    return out


def screen(p: dict, city: str | None = None, state: str | None = None) -> dict:
    reg = region(city or p.get("city"), state or p.get("state"))
    flags = seismic_flags(p, reg) + flood_flags(p, reg)
    by = {}
    for f in flags:
        if f["severity"] is not None:
            by[f["lens"]] = max(by.get(f["lens"], "low"), f["severity"], key=SEV.get)
    overall = max(by.values(), key=SEV.get) if by else "unknown"
    inputs = {k: p.get(k) is not None for k in ("yearBuilt", "material", "stories", "grossSqFt", "buildingClass")}
    return {"region": reg, "tier": overall, "tierByLens": by, "flags": flags, "inputsPresent": inputs,
            "unknowns": [k for k, v in inputs.items() if not v], "tierRule": "tier = highest severity among evaluated flags; unknown flags never lower it",
            "thresholds": {k: {"value": v[0], "source": v[1], "note": v[2]} for k, v in THRESHOLDS.items()}, "notice": NOTICE}


def fill_rates(props: dict) -> dict:
    n = len(props)
    keys = ("yearBuilt", "material", "stories", "grossSqFt", "buildingClass", "heightFt")
    r = {k: sum(1 for p in props.values() if p.get(k) is not None) for k in keys}
    r["femaZone"] = sum(1 for p in props.values() if (p.get("fema") or {}).get("zone"))
    r["usgsSdc"] = sum(1 for p in props.values() if (p.get("usgs") or {}).get("sdc"))
    r["elevation"] = sum(1 for p in props.values() if p.get("elevationFt") is not None)
    return {"n": n, "filled": r}
