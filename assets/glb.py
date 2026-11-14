"""Pure-python glTF 2.0 (.glb) writer: extrude a footprint polygon to a height. No external model."""
import json
import struct
from pathlib import Path

from .models import polygon_area

Pt = tuple[float, float]


def triangulate(ring: list[Pt]) -> list[tuple[int, int, int]]:
    """Ear clipping on an open ring (no repeated closing point); returns CCW triangles as index triples."""
    idx = list(range(len(ring)))
    if polygon_area(ring + [ring[0]]) < 0:
        idx.reverse()

    def cross(a, b, c):
        return (ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0])

    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12

    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            a, b, c = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            if cross(a, b, c) <= 1e-12:
                continue
            if any(inside(p, a, b, c) for p in idx if p not in (a, b, c)):
                continue
            tris.append((a, b, c))
            idx.pop(k)
            break
        else:
            raise ValueError("could not triangulate footprint")
    tris.append((idx[0], idx[1], idx[2]))
    return tris


def extrude_glb(footprint: list[Pt], height: float) -> bytes:
    """Closed footprint (x,y metres) -> binary glTF. x->X, footprint y->Z, height->Y (glTF is Y-up)."""
    ring = [tuple(p) for p in footprint[:-1]]
    n = len(ring)
    tris = triangulate(ring)  # CCW seen from +height (z-up) == outward normal up
    pos: list[tuple[float, float, float]] = []
    ind: list[int] = []
    # bottom (0..n-1) and top (n..2n-1) rings
    for x, y in ring:
        pos.append((x, 0.0, y))
    for x, y in ring:
        pos.append((x, height, y))
    ccw = polygon_area(ring + [ring[0]]) > 0
    for a, b, c in tris:
        ind += [n + a, n + b, n + c]  # top, outward (+height) in the footprint frame
        ind += [c, b, a]
    # side walls
    for i in range(n):
        j = (i + 1) % n
        if ccw:
            ind += [i, j, n + j, i, n + j, n + i]
        else:
            ind += [j, i, n + i, j, n + i, n + j]
    # In X/Z with Y up, mapping footprint y->Z flips handedness; reverse all windings for outward faces.
    ind = [t for k in range(0, len(ind), 3) for t in (ind[k], ind[k + 2], ind[k + 1])]
    pb = b"".join(struct.pack("<3f", *p) for p in pos)
    ib = b"".join(struct.pack("<I", i) for i in ind)
    mn = [min(p[k] for p in pos) for k in range(3)]
    mx = [max(p[k] for p in pos) for k in range(3)]
    doc = {
        "asset": {"version": "2.0", "generator": "pi-assets procedural extrude"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "buffers": [{"byteLength": len(pb) + len(ib)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(pb), "target": 34962},
                        {"buffer": 0, "byteOffset": len(pb), "byteLength": len(ib), "target": 34963}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mn, "max": mx},
                      {"bufferView": 1, "componentType": 5125, "count": len(ind), "type": "SCALAR"}],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bin_ = pb + ib
    bin_ += b"\0" * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def write_glb(path: Path, footprint: list[Pt], height: float) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(extrude_glb(footprint, height))
    return path


def parse_glb(data: bytes) -> dict:
    """Minimal parser used by tests: returns the JSON chunk plus byte lengths."""
    magic, ver, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or ver != 2 or total != len(data):
        raise ValueError("not a valid GLB")
    jl, jt = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20:20 + jl])
    bl, bt = struct.unpack_from("<II", data, 20 + jl)
    if jt != 0x4E4F534A or bt != 0x004E4942:
        raise ValueError("bad chunk types")
    return {"json": doc, "bin": data[28 + jl:28 + jl + bl]}


# ---------------------------------------------------------------------------------------------------------------
# Multi-part, multi-material GLB (procedural visual models) and palette restyle. Visual only: not scans.
# ---------------------------------------------------------------------------------------------------------------
import math  # noqa: E402
import re  # noqa: E402


def hex_to_rgba(h: str, a: float = 1.0) -> list[float]:
    """'#RRGGBB' (sRGB) -> glTF linear baseColorFactor [r,g,b,a]."""
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", h):
        raise ValueError(f"bad hex colour {h!r}")
    lin = lambda c: ((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92  # noqa: E731
    return [round(lin(int(h[i:i + 2], 16)), 6) for i in (1, 3, 5)] + [a]


def circle_ring(cx: float, cy: float, r: float, n: int = 24) -> list[Pt]:
    """Closed CCW regular n-gon ring (first point repeated at the end)."""
    pts = [(round(cx + r * math.cos(2 * math.pi * k / n), 6), round(cy + r * math.sin(2 * math.pi * k / n), 6)) for k in range(n)]
    return pts + [pts[0]]


def _prism(ring: list[Pt], y0: float, y1: float, base: int):
    """Vertices + outward-wound indices for a prism of a closed footprint between heights y0 and y1."""
    r = [tuple(p) for p in ring[:-1]]
    n = len(r)
    tris = triangulate(r)
    pos = [(x, y0, y) for x, y in r] + [(x, y1, y) for x, y in r]
    ccw = polygon_area(r + [r[0]]) > 0
    ind = []
    for a, b, c in tris:
        ind += [n + a, n + b, n + c, c, b, a]
    for i in range(n):
        j = (i + 1) % n
        ind += [i, j, n + j, i, n + j, n + i] if ccw else [j, i, n + i, j, n + i, n + j]
    ind = [t for k in range(0, len(ind), 3) for t in (ind[k], ind[k + 2], ind[k + 1])]
    return pos, [i + base for i in ind]


def glb_from_parts(parts: list[dict], generator: str = "pi-assets procedural parts") -> bytes:
    """parts: [{'ring': closed footprint, 'y0': m, 'y1': m, 'material': str, 'color': '#RRGGBB'}].
    One glTF primitive and one named material per distinct material name (first colour wins)."""
    if not parts:
        raise ValueError("no parts")
    mats: dict[str, str] = {}
    prims: dict[str, tuple[list, list]] = {}
    for p in parts:
        if not p["y1"] > p["y0"]:
            raise ValueError("part needs y1 > y0")
        m = p["material"]
        mats.setdefault(m, p["color"])
        pos, ind = prims.setdefault(m, ([], []))
        pp, ii = _prism(p["ring"], p["y0"], p["y1"], len(pos))
        pos += pp
        ind += ii
    pb = ib = b""
    views, accs, primitives = [], [], []
    names = list(mats)
    for mi, name in enumerate(names):
        pos, ind = prims[name]
        pbytes = b"".join(struct.pack("<3f", *q) for q in pos)
        ibytes = b"".join(struct.pack("<I", i) for i in ind)
        off = len(pb) + len(ib)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(pbytes), "target": 34962})
        views.append({"buffer": 0, "byteOffset": off + len(pbytes), "byteLength": len(ibytes), "target": 34963})
        mn = [min(q[k] for q in pos) for k in range(3)]
        mx = [max(q[k] for q in pos) for k in range(3)]
        accs.append({"bufferView": 2 * mi, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mn, "max": mx})
        accs.append({"bufferView": 2 * mi + 1, "componentType": 5125, "count": len(ind), "type": "SCALAR"})
        primitives.append({"attributes": {"POSITION": 2 * mi}, "indices": 2 * mi + 1, "mode": 4, "material": mi})
        pb += pbytes + ibytes  # (pb carries both; ib stays empty so offsets stay contiguous)
    doc = {"asset": {"version": "2.0", "generator": generator}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
           "meshes": [{"primitives": primitives}],
           "materials": [{"name": n, "pbrMetallicRoughness": {"baseColorFactor": hex_to_rgba(mats[n]), "metallicFactor": 0.0,
                                                               "roughnessFactor": 0.8}} for n in names],
           "buffers": [{"byteLength": len(pb)}], "bufferViews": views, "accessors": accs}
    return _pack(doc, pb)


def _pack(doc: dict, bin_: bytes) -> bytes:
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bin_ += b"\0" * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def restyle_glb(data: bytes, palette: dict[str, str]) -> tuple[bytes, dict[str, str]]:
    """Recolour a GLB's materials. palette maps a case-insensitive substring of a material NAME to '#RRGGBB'
    (the longest matching key wins). Matched materials get that baseColorFactor and lose their colour/normal/
    metal-rough textures (a retexture to flat colour). Geometry and binary data are untouched.
    Returns (new glb, {materialName: hex applied}). Materials with no matching key are left as they were."""
    parsed = parse_glb(data)
    doc, bin_ = parsed["json"], parsed["bin"]
    applied: dict[str, str] = {}
    keys = sorted(palette, key=len, reverse=True)
    for m in doc.get("materials", []):
        name = (m.get("name") or "").lower()
        k = next((k for k in keys if k.lower() in name), None)
        if k is None:
            continue
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = hex_to_rgba(palette[k])
        for t in ("baseColorTexture", "metallicRoughnessTexture"):
            pbr.pop(t, None)
        m.pop("normalTexture", None)
        applied[m.get("name", "")] = palette[k]
    return _pack(doc, bin_), applied
