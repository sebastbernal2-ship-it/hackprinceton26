"""Deterministic "generate asset" drafts: a small rules table gives category, dims, clearance and an estimated-price
reference; the illustration is a local SVG (an optional image model may replace it, see services/api assets_generate_routes).
Everything here is an assumption labelled as such; nothing is read from a spec sheet."""
import math
import re
from html import escape

from .models import Asset, Provenance
from .variants import rect

IN = 0.0254
# keywords -> (label, category, (w, d, h) m, (front, sides, back) clearance m, priceRef or None, tags, kind of drawing)
RULES: list[tuple[tuple[str, ...], str, str, tuple[float, float, float], tuple[float, float, float], str | None, list[str], str]] = [
    (("prep table", "work table", "bakery table", "workbench"), "Prep table", "prep_table", (1.829, 0.762, 0.914), (1.0, 0.0, 0.0), "bakery_work_table_72", ["kitchen"], "slab"),
    (("stool",), "Stool", "seating", (0.432, 0.432, 0.762), (0.45, 0.05, 0.05), "chair_dining", ["dining"], "round"),
    (("chair",), "Dining chair", "seating", (0.457, 0.508, 0.864), (0.45, 0.1, 0.1), "chair_dining", ["dining"], "chair"),
    (("booth", "banquette", "bench", "sofa"), "Booth seating", "seating", (1.524, 0.762, 1.067), (0.6, 0.0, 0.0), None, ["dining"], "slab"),
    (("espresso",), "Espresso machine", "other", (0.762, 0.559, 0.508), (0.9, 0.1, 0.1), "espresso_machine_2group", ["front_of_house", "coffee"], "machine"),
    (("grinder",), "Coffee grinder", "other", (0.229, 0.381, 0.61), (0.7, 0.05, 0.05), "coffee_grinder_on_demand", ["front_of_house", "coffee"], "machine"),
    (("pastry", "bakery", "bake case", "cake", "display case", "display cabinet", "vitrine"), "Pastry display case", "freezer_display", (1.219, 0.711, 1.219), (1.0, 0.1, 0.1), "bakery_display_case_48", ["front_of_house", "bakery"], "case"),
    (("gelato", "ice cream"), "Gelato display case", "freezer_display", (1.245, 0.889, 1.321), (1.0, 0.1, 0.1), "gelato_display_case", ["front_of_house", "gelato"], "case"),
    (("refrigerator", "fridge", "reach-in", "reach in", "cooler"), "Reach-in refrigerator", "fridge", (1.372, 0.813, 2.108), (1.0, 0.0, 0.1), "reach_in_refrigerator", ["kitchen", "cold"], "tall"),
    (("convection", "oven"), "Convection oven", "oven", (1.016, 1.041, 1.448), (1.0, 0.15, 0.15), "convection_oven_full", ["kitchen", "cooking"], "tall"),
    (("range", "stove", "cooktop"), "Gas range", "range", (0.914, 0.787, 0.914), (1.0, 0.15, 0.15), "range_6_burner", ["kitchen", "cooking"], "range"),
    (("hand sink", "handwash"), "Hand sink", "sink", (0.432, 0.381, 0.356), (0.6, 0.0, 0.0), "hand_sink", ["kitchen", "sink"], "sink"),
    (("sink",), "Three-compartment sink", "sink", (2.134, 0.686, 1.118), (1.0, 0.0, 0.0), "three_compartment_sink", ["kitchen", "sink"], "sink"),
    (("dishwasher", "dish machine"), "Dishwasher station", "dish", (1.524, 0.762, 0.914), (1.0, 0.0, 0.0), "dishwasher", ["kitchen", "ware_wash"], "tall"),
    (("ice machine",), "Ice machine", "other", (0.762, 0.61, 1.0), (0.9, 0.1, 0.1), "ice_machine", ["kitchen", "cold"], "tall"),
    (("hood",), "Exhaust hood", "hood", (3.048, 1.219, 0.61), (0.0, 0.0, 0.0), "type_i_hood", ["kitchen", "overhead"], "range"),
    (("shelf", "shelving", "rack"), "Storage rack", "storage", (1.219, 0.457, 1.829), (0.9, 0.0, 0.0), None, ["kitchen", "storage"], "tall"),
    (("host", "podium"), "Host stand", "other", (0.61, 0.508, 1.067), (0.9, 0.3, 0.3), None, ["front_of_house"], "tall"),
    (("counter", "bar"), "Service counter", "counter", (1.829, 0.61, 1.067), (0.9, 0.0, 0.0), None, ["front_of_house"], "slab"),
    (("table",), "Cafe table", "table", (0.762, 0.762, 0.762), (0.6, 0.3, 0.3), "table_2top_30", ["dining"], "table"),
]
GENERIC = ("Generic item", "other", (0.9, 0.6, 0.9), (0.9, 0.1, 0.1), None, [], "slab")
_LEN = re.compile(r"(\d+(?:\.\d+)?)\s*(inch(?:es)?|in|\"|cm|mm|m|ft|feet|')(?![a-z])", re.I)
_MAT = ("marble", "wood", "oak", "walnut", "steel", "stainless", "brass", "glass", "black", "white", "copper")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "item"


def parse_length(text: str) -> float | None:
    """First explicit length in the prompt, metres ("72 inch", "120 cm"); None when absent or out of 0.2 to 6 m."""
    m = _LEN.search(text)
    if not m:
        return None
    u = m.group(2).lower()
    v = float(m.group(1)) * (IN if u in ("in", "inch", "inches", '"') else 0.01 if u == "cm" else 0.001 if u == "mm"
                              else 0.3048 if u in ("ft", "feet", "'") else 1.0)
    return round(v, 4) if 0.2 <= v <= 6 else None


def circle(d: float, n: int = 16) -> list[list[float]]:
    r = d / 2
    pts = [[round(r + r * math.cos(2 * math.pi * i / n), 4), round(r + r * math.sin(2 * math.pi * i / n), 4)] for i in range(n)]
    return pts + [pts[0]]


def match_rule(prompt: str):
    p = prompt.lower()
    for rule in RULES:
        if any(k in p for k in rule[0]):
            return rule
    return None


def draft(prompt: str, profile_id: str, exists=lambda _id: False) -> tuple[Asset, bool]:
    """A draft Asset for the prompt and whether a rule matched. Deterministic: same prompt, same draft."""
    prompt = " ".join(prompt.split())
    rule = match_rule(prompt)
    _, label, cat, (w, d, h), clr, ref, tags, kind = (None, *GENERIC) if rule is None else rule
    p = prompt.lower()
    round_ = "round" in p and cat in ("table", "other", "counter")
    length = parse_length(prompt)
    if length and not round_:
        w = length
    if round_:
        w = d = length or (0.9 if cat == "table" else w)
        kind = "table"
    fp = circle(w) if round_ else rect(w, d)
    name = prompt[:1].upper() + prompt[1:60]
    base = f"gen-{slug(prompt)}"
    aid, n = base, 2
    while exists(aid):
        aid, n = f"{base}-{n}", n + 1
    notes = (f"Generated from the text \"{prompt}\". Matched rule: {label}." if rule else
             f"Generated from the text \"{prompt}\". No rule matched: generic placeholder size, no price.")
    a = Asset(
        assetId=aid, name=name, category=cat, source="generated", dims=dict(w=round(w, 4), d=round(d, 4), h=h), dimsStatus="estimated",
        footprint=fp, clearance=dict(front=clr[0], sides=clr[1], back=clr[2]),
        clearanceBasis=("ASSUMPTION (not a code determination): clearances from a small local rules table "
                        f"({clr[0]} m front, {clr[1]} m sides, {clr[2]} m back); confirm with the spec sheet and local authority."),
        tags=[*tags, "generated"], priceRef=ref, profileId=profile_id,
        provenance=Provenance(origin="generated asset: local rules table + illustration (estimated, not measured)", notes=notes),
        status="draft")
    return a, rule is not None


def svg_illustration(a: Asset, kind: str | None = None) -> str:
    """Clean flat front-view illustration, deterministic. Colour comes from material words in the name, else category."""
    rule = match_rule(a.name)
    kind = kind or (rule[7] if rule else "slab")
    if "round" in a.name.lower() and a.category == "table":
        kind = "table"
    p = a.name.lower()
    pal = {"marble": "#e8e6e1", "wood": "#b98a5a", "oak": "#c79a62", "walnut": "#7a5232", "steel": "#c3c9cf", "stainless": "#c3c9cf",
           "brass": "#c9a24a", "glass": "#cfe3ea", "black": "#33363b", "white": "#f1f1ee", "copper": "#b8683f"}
    body = next((v for k, v in pal.items() if k in p), {"freezer_display": "#e6eef1", "fridge": "#c3c9cf", "oven": "#b7bcc2", "range": "#b7bcc2",
              "sink": "#c3c9cf", "table": "#d8c3a0", "seating": "#b98a5a"}.get(a.category, "#d6d2c8"))
    edge, dark = "#3a3a38", "#4b4b48"
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-label="{escape(a.name)}">',
         '<rect width="320" height="240" fill="#f6f3ec"/><ellipse cx="160" cy="206" rx="110" ry="9" fill="#000" opacity=".12"/>']
    st = f'stroke="{edge}" stroke-width="3" stroke-linejoin="round"'
    if kind == "table":
        s += [f'<ellipse cx="160" cy="98" rx="104" ry="26" fill="{body}" {st}/>', f'<rect x="150" y="122" width="20" height="70" fill="{dark}"/>',
              f'<ellipse cx="160" cy="196" rx="52" ry="9" fill="{dark}"/>']
    elif kind == "case":
        s += [f'<rect x="50" y="70" width="220" height="116" rx="8" fill="#dfeef3" {st}/>', f'<rect x="60" y="80" width="200" height="96" fill="#fff" opacity=".55"/>',
              f'<rect x="60" y="126" width="200" height="4" fill="{edge}"/>', f'<rect x="50" y="176" width="220" height="22" fill="{body}" {st}/>']
        s += [f'<circle cx="{82 + i * 34}" cy="{112 if i % 2 else 158}" r="11" fill="#d9a066" {st}/>' for i in range(6)]
    elif kind == "machine":
        s += [f'<rect x="60" y="86" width="200" height="104" rx="10" fill="{body}" {st}/>', f'<rect x="60" y="60" width="200" height="30" rx="8" fill="{dark}"/>']
        s += [f'<rect x="{100 + i * 70}" y="130" width="30" height="40" fill="{dark}"/><rect x="{106 + i * 70}" y="150" width="18" height="20" fill="#f6f3ec"/>' for i in range(2)]
    elif kind == "tall":
        s += [f'<rect x="96" y="30" width="128" height="164" rx="8" fill="{body}" {st}/>', f'<rect x="106" y="42" width="108" height="140" fill="#fff" opacity=".35"/>',
              f'<rect x="158" y="40" width="4" height="146" fill="{edge}"/>', '<rect x="148" y="104" width="4" height="28" fill="#333"/><rect x="168" y="104" width="4" height="28" fill="#333"/>']
    elif kind == "range":
        s += [f'<rect x="60" y="100" width="200" height="92" rx="6" fill="{body}" {st}/>', f'<rect x="76" y="124" width="168" height="56" fill="{dark}" opacity=".35"/>']
        s += [f'<circle cx="{92 + i * 45}" cy="92" r="12" fill="{dark}"/>' for i in range(4)]
    elif kind == "sink":
        s += [f'<rect x="50" y="100" width="220" height="92" fill="{body}" {st}/>', f'<rect x="64" y="108" width="192" height="24" rx="6" fill="{dark}" opacity=".4"/>',
              f'<path d="M160 100V66h28" fill="none" {st}/>']
    elif kind == "chair":
        s += [f'<rect x="112" y="40" width="96" height="70" rx="8" fill="{body}" {st}/>', f'<rect x="104" y="110" width="112" height="20" rx="6" fill="{body}" {st}/>',
              f'<rect x="112" y="130" width="10" height="62" fill="{dark}"/><rect x="198" y="130" width="10" height="62" fill="{dark}"/>']
    elif kind == "round":
        s += [f'<ellipse cx="160" cy="120" rx="52" ry="14" fill="{body}" {st}/>', f'<rect x="154" y="132" width="12" height="60" fill="{dark}"/><ellipse cx="160" cy="196" rx="36" ry="7" fill="{dark}"/>']
    else:  # slab: counter, prep table, booth, storage
        s += [f'<rect x="40" y="86" width="240" height="22" rx="4" fill="{body}" {st}/>', f'<rect x="52" y="108" width="216" height="84" fill="{body}" opacity=".7" {st}/>',
              f'<rect x="64" y="120" width="92" height="60" fill="#fff" opacity=".4"/><rect x="164" y="120" width="92" height="60" fill="#fff" opacity=".4"/>']
    s.append(f'<text x="160" y="228" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#6b6a63">Illustration, not a photo or measured model</text></svg>')
    return "".join(s)
