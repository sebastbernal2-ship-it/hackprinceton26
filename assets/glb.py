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
