# ---
# jupyter:
#   jupytext:
#     formats: py:percent,ipynb
#   kernelspec:
#     display_name: Python 3
#     name: python3
# ---

# %% [markdown]
# # Matterport quickstart: one property, inside and out
#
# **HackPrinceton 2026 Â· CoStar track Â· "Inside and Out: Hacking the Built World"**
#
# Matterport turns real buildings into 3D digital twins you can measure, search and reimagine. Your hackathon key reaches about 15,000 of them in Houston and Los Angeles. 232 of those also come with an aerial Gaussian splat and the drone photos it was trained from.
#
# This notebook walks through one restaurant building, 141-143 N La Brea Ave in Los Angeles (model `Jxmnkp6KpJN`), from the inside out. Each section stands on its own and does one thing: one snippet, one picture. Change `MODEL` to any other model and run it again.
#
# | # | Section | What you get | In the talk |
# |---|---|---|---|
# | 1 | Setup and key check | your key works; how many models it sees | 15,000 real spaces |
# | 2 | Find models near a point | a lat/lon lookup over every model (the API has no geo search) | 15,000 real spaces |
# | 3 | Model basics | address, lat/lon, AI summary, property type, the 3D tour | |
# | 4 | Panoramas | skybox faces, a stitched 360Â° view, the same room defurnished | We capture; We reimagine |
# | 5 | Rooms and floor plan | room table, walls drawn from the graph, floor-plan image and DXF | We understand |
# | 6 | Splat and drone photos | a splat seen from above, the sky, one drone photo, the flight path | We reconstruct |
# | 7 | The same lot from above | Vexcel aerial imagery under the drone path; the CoStar record | Better together |
# | 8 | MatterPak: mesh and point cloud | 10 M coloured points, read straight out of the zip | We reconstruct |
# | 9 | Ideas and help | the problems we haven't solved, and who to find | What we haven't solved yet; Find us |
#
# **Keys.** Run `/costar-keys` in the track Discord. Put the values in environment variables (or your notebook platform's secrets manager, exposed as environment variables) or in a `.env` file next to the notebook, never in the notebook itself:
#
# | Name | What it is | Needed for |
# |---|---|---|
# | `MATTERPORT_API_KEY` | Matterport "API key" from the keys card | everything |
# | `MATTERPORT_API_TOKEN` | Matterport "API token" (the secret half) | everything |
# | `VEXCEL_API_KEY` | Vexcel `api_key` | section 7 |
# | `COSTAR_ZIP_PASSWORD` | CoStar "Zip password" | section 7 (optional) |
# | `COSTAR_KIT_URL` or `COSTAR_KIT_ZIP` | the kit's download link from the CoStar card, or the downloaded zip's path | section 7 (optional) |
#
# The whole notebook downloads about 200 MB and takes a few minutes. Everything it saves goes into `mp_out/`.

# %% [markdown]
# ## 1. Setup and key check
#
# One helper, `graph()`, sends GraphQL to the Model API with your key (HTTP basic auth: the key is the user name, the token the password). The keys only work on production, `api.matterport.com`. It fails with a plain message if the key is wrong.

# %%
import io, json, math, os, re, sys, time, zipfile
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

MODEL = "Jxmnkp6KpJN"  # 141-143 N La Brea Ave, Los Angeles (restaurant). Try any sid from models_index.csv.
API = "https://api.matterport.com/api/models/graph"  # production only: these keys are rejected on qa3 and other hosts
# The hackathon site serves splats and drone photos (signed links). Override with HACKATHON_SITE if it moves.
SITE = os.environ.get("HACKATHON_SITE", "https://beta-app.matterport.com/2026-princeton-hackathon").rstrip("/")
OUT = Path("mp_out"); OUT.mkdir(exist_ok=True)

def secret(name, required=True):
    """Read a key from the environment, then a local .env file. Never prints it."""
    value = os.environ.get(name)
    if not value and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() == name:
                value = v.strip().strip('"').strip("'")
    if not value and required:
        raise SystemExit(f"{name} is not set. Set it as an environment variable (export {name}=..., "
                         f"or via your notebook platform's secrets) or put {name}=... in a .env file next to this notebook.")
    return value


class MatterportError(RuntimeError):
    pass


session = requests.Session()
session.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
# Only if the event site is password-protected: its user name and password (not a Matterport key).
SITE_AUTH = (secret("HACKATHON_SITE_USER", False), secret("HACKATHON_SITE_PASSWORD", False))
SITE_AUTH = SITE_AUTH if all(SITE_AUTH) else None
DOWNLOADED = [0]  # bytes fetched by fetch(), for the running total


def graph(query, **variables):
    """Run a Model API query and return its `data`. Raises MatterportError with a readable reason."""
    r = session.post(API, json={"query": query, "variables": variables}, timeout=120)
    if r.status_code in (401, 403):
        raise MatterportError(
            f"Matterport rejected the key (HTTP {r.status_code}: {r.text[:80]}). Check MATTERPORT_API_KEY and "
            f"MATTERPORT_API_TOKEN (key = user, token = password), and that API is {API!r}: the hackathon keys "
            f"work only on production, not on qa3 or any other host.")
    r.raise_for_status()
    body = r.json()
    for e in body.get("errors") or []:
        code = (e.get("extensions") or {}).get("code", "")
        if code == "not.found":
            raise MatterportError(f"{variables} not found: the model does not exist or is not shared with your key.")
        raise MatterportError(f"GraphQL error: {e.get('message')}")
    return body["data"]


def fetch(url, start=None, end=None, **kw):
    """GET bytes. start/end ask for a byte range (inclusive), so you can read part of a big file."""
    headers = {"Range": f"bytes={start or 0}-{'' if end is None else end}"} if start is not None or end is not None else {}
    if url.startswith(SITE):
        kw.setdefault("auth", SITE_AUTH)  # requests drops it again on the redirect to the signed link
    r = requests.get(url, headers=headers, timeout=300, **kw)
    if r.status_code == 401 and url.startswith(SITE):
        raise SystemExit(f"{SITE} asks for a password for {url[len(SITE):]}: set HACKATHON_SITE_USER and HACKATHON_SITE_PASSWORD.")
    r.raise_for_status()
    DOWNLOADED[0] += len(r.content)
    return r.content


def show(thing, name):
    """Save a figure or image under mp_out/ and display it."""
    path = OUT / name
    if isinstance(thing, plt.Figure):
        thing.savefig(path, dpi=150, bbox_inches="tight")
        plt.show() if "ipykernel" in sys.modules else plt.close(thing)
    else:
        thing.save(path, quality=90) if name.endswith(".jpg") else thing.save(path)
        if "ipykernel" in sys.modules:
            from IPython.display import display
            display(thing if max(thing.size) <= 1600 else thing.resize((1600, int(1600 * thing.size[1] / thing.size[0]))))
    print(f"saved {path}  (downloaded so far: {DOWNLOADED[0] / 1e6:.1f} MB)")


# The key check: how many models does this key see, and in which folder?
org = graph("""{ rootFolder { name modelCountSummary(includeModelsInSubfolders: true)
                 subfolders { results { id name modelCountSummary(includeModelsInSubfolders: true) } } } }""")["rootFolder"]
print(f"Key OK. '{org['name']}' holds {org['modelCountSummary']:,} models:")
for f in org["subfolders"]["results"]:
    print(f"  {f['name']:<20} {f['modelCountSummary']:>6,}   (folder {f['id']})")

# %% [markdown]
# Helpers that later sections share: run this cell once too. After these two cells, every section runs on its own.

# %%
M_PER_DEG = 111_320  # metres per degree of latitude


def latlon(sid=None):
    """A model's (lat, lon) as floats."""
    g = graph("query($id: ID!) { model(id: $id) { geolocation { lat long } } }", id=sid or MODEL)["model"]["geolocation"]
    return float(g["lat"]), float(g["long"])


def topdown(xyz, rgb, alpha=None, half=40.0, px=0.15, keep=None, center=(0.0, 0.0), background=255, fill=2):
    """View from straight above: points are blended top-down by opacity (alpha=None: the highest point wins)."""
    cx, cy = center
    keep = np.ones(len(xyz), bool) if keep is None else keep
    sel = keep & (np.abs(xyz[:, 0] - cx) < half) & (np.abs(xyz[:, 1] - cy) < half)
    p, c = xyz[sel], rgb[sel]
    a = np.ones(len(p)) if alpha is None else np.clip(alpha[sel], 0, 0.999)
    n = int(2 * half / px)
    pix = ((cy + half - p[:, 1]) / px).astype(int).clip(0, n - 1) * n + ((p[:, 0] - cx + half) / px).astype(int).clip(0, n - 1)
    o = np.lexsort((-p[:, 2], pix))  # by pixel, then top to bottom
    pix, a, c = pix[o], a[o], c[o]
    la = np.log1p(-np.minimum(a, 0.999))
    before = np.cumsum(la) - la  # sum of log(1 - a) over everything above, within the whole array...
    start = np.r_[0, np.flatnonzero(np.diff(pix)) + 1]
    before -= np.repeat(before[start], np.diff(np.r_[start, len(pix)]))  # ...reset at each pixel
    w = np.exp(before) * a  # light reaching this point times its opacity
    img = np.stack([np.bincount(pix, w * c[:, k], n * n) for k in range(3)], 1)
    cover = np.bincount(pix, w, n * n)
    img = (img / np.maximum(cover, 1e-9)[:, None]).reshape(n, n, 3)
    have = (cover > 0.02).reshape(n, n).astype(float)
    img *= have[..., None]
    for _ in range(fill):  # fill holes with the average of their covered neighbours
        s_img, s_have = np.zeros_like(img), np.zeros_like(have)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                s_img += np.roll(img * have[..., None], (dy, dx), (0, 1)); s_have += np.roll(have, (dy, dx), (0, 1))
        hole = (have == 0) & (s_have > 0)
        img[hole] = s_img[hole] / s_have[hole][:, None]; have = np.maximum(have, hole)
    img[have == 0] = background / 255
    return Image.fromarray((img * 255).clip(0, 255).astype(np.uint8))


class HttpFile(io.RawIOBase):
    """A read-only, seekable file over HTTP range requests, so zipfile can open a remote zip in place."""
    def __init__(self, url, block=8 * 2**20):
        self.url, self.pos, self.block, self.buf, self.buf_at = url, 0, block, b"", -1
        self.size = int(requests.get(url, headers={"Range": "bytes=0-0"}, timeout=60).headers["Content-Range"].split("/")[1])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]; return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n is None or n < 0 else min(n, self.size - self.pos)
        if n <= 0:
            return b""
        if not (self.buf_at <= self.pos and self.pos + n <= self.buf_at + len(self.buf)):
            self.buf_at, self.buf = self.pos, fetch(self.url, self.pos, min(self.size, self.pos + max(n, self.block)) - 1)
        out = self.buf[self.pos - self.buf_at: self.pos - self.buf_at + n]
        self.pos += len(out); return out
    def readinto(self, b):
        data = self.read(len(b)); b[:len(data)] = data; return len(data)


# %% [markdown]
# ## 2. Find models near a point
#
# The Model API has no geographic search, so this folder ships `models_index.csv`: one row per model the hackathon keys can see, with its lat/lon, address, segment, the CoStar property id or Homes listing id where known, whether it has a splat, and pano and room counts. `near()` is a plain distance filter over it, and `basemap.json` (county lines, city limits and roads) draws the map below. Vexcel takes the same lat/lon, so this is also the bridge between layers.

# %%
INDEX = Path("models_index.csv")
if INDEX.exists():
    index = pd.read_csv(INDEX, dtype={"costar_property_id": str, "homes_listing_id": str})
else:  # no CSV next to the notebook: page through the API instead (about a minute, fewer columns)
    rows, offset = [], None
    while True:
        page = graph("""query($o: String) { models(query: "*", pageSize: 500, offset: $o) { nextOffset results {
            id name internalId address { address locality } geolocation { lat long } rooms { count } } } }""", o=offset)["models"]
        rows += [dict(sid=m["id"], name=m["name"], lat=float((m["geolocation"] or {}).get("lat") or "nan"),
                      lon=float((m["geolocation"] or {}).get("long") or "nan"), address=m["address"]["address"],
                      city=m["address"]["locality"], room_count=(m["rooms"] or {}).get("count"),
                      segment="residential" if (m["internalId"] or "").startswith("Homes-") else "commercial")
                 for m in page["results"]]
        offset = page.get("nextOffset")
        if not offset or not page["results"]:
            break
    index = pd.DataFrame(rows)
print(f"{len(index):,} models; {(index.splat == 'yes').sum() if 'splat' in index else '?'} with a splat")


def near(lat, lon, km=1.0, df=index):
    """Models within `km` of (lat, lon), nearest first."""
    la, lo = np.radians(df.lat), np.radians(df.lon)
    d = 2 * 6371 * np.arcsin(np.sqrt(np.sin((la - math.radians(lat)) / 2) ** 2
                                     + np.cos(la) * math.cos(math.radians(lat)) * np.sin((lo - math.radians(lon)) / 2) ** 2))
    return df.assign(km=d.round(3))[d <= km].sort_values("km")


cols = [c for c in ["sid", "name", "segment", "km", "splat", "pano_count", "room_count"] if c in index]
print(near(34.0935, -118.3171, km=0.8)[cols].head(10).to_string(index=False))

# Where they are: Los Angeles and Houston, over county lines, city limits and primary roads (US Census).
# basemap.json ships next to this notebook; without it the dots are drawn on their own.
from matplotlib.collections import LineCollection, PolyCollection

try:
    basemap = json.loads(Path("basemap.json").read_text())
except OSError:
    try:
        basemap = requests.get(f"{SITE}/assets/quickstart/basemap.json", timeout=60).json()
    except Exception:
        basemap = {"regions": [{"title": "Los Angeles", "lon_band": [-125, -110], "view": [-118.7, 33.7, -117.9, 34.35]},
                               {"title": "Houston", "lon_band": [-100, -90], "view": [-95.9, 29.4, -95.0, 30.15]}]}
NAVY, ORANGE = "#2B3A67", "#ED7D31"
fig, axes = plt.subplots(1, 2, figsize=(16, 7))
fig.subplots_adjust(left=0.01, right=0.99, top=0.93, bottom=0.07, wspace=0.03)
for ax, region in zip(axes, basemap["regions"]):
    x0, y0, x1, y1 = region["view"]
    ax.set_facecolor("#E4EDF5")  # water; counties are clipped to the shoreline
    ax.add_collection(PolyCollection(region.get("counties", []), facecolor="#F4F3EF", edgecolor="#C4C4C0", lw=0.9))
    ax.add_collection(PolyCollection(region.get("city", []), facecolor="#EAE6DC", edgecolor="#8C887E", lw=1.2))
    ax.add_collection(LineCollection(region.get("roads", []), colors="#D2CEC4", lw=1.0))
    band = index[(index.lon >= region["lon_band"][0]) & (index.lon < region["lon_band"][1])].sample(frac=1, random_state=0)
    ax.scatter(band.lon, band.lat, s=9, c=np.where(band.segment == "commercial", NAVY, ORANGE), alpha=0.6, lw=0, zorder=3)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / math.cos(math.radians((y0 + y1) / 2)))
    ax.set_xticks([]); ax.set_yticks([]); [sp.set_visible(False) for sp in ax.spines.values()]
    ax.set_title(f"{region['title']}   {len(band):,} models", loc="left", fontsize=18, fontweight="bold")
fig.legend(handles=[plt.Line2D([], [], marker="o", ls="", color=c, label=l) for c, l in ((NAVY, "commercial"), (ORANGE, "residential"))],
           loc="lower left", bbox_to_anchor=(0.01, 0), ncol=2, frameon=False, fontsize=14)
fig.text(0.99, 0.015, "Boundaries: US Census Bureau cartographic boundary files", ha="right", fontsize=9, color="#888")
show(fig, "s02_models_map.png")

# %% [markdown]
# ## 3. Model basics
#
# The basics of a model: its address and lat/lon, an AI-written summary, the property type Matterport's vision models assigned, and counts of what's inside. A public or unlisted model also plays in the Showcase 3D viewer, which you can embed with an iframe (or script with the [Showcase SDK](https://matterport.github.io/developer-docs/overview/)).

# %%
Q_BASICS = """query Basics($id: ID!) { model(id: $id) {
  id name description created visibility
  address { address locality administrativeArea postalCode }
  geolocation { lat long }
  generatedDescription { summary }
  propertyClassifications { classification type }
  floors { id label } rooms { id } panoLocations { id }
  image { url }
} }"""
m = graph(Q_BASICS, id=MODEL)["model"]
LAT, LON = float(m["geolocation"]["lat"]), float(m["geolocation"]["long"])
print(f"{m['name']}  ({m['id']}, {m['visibility']})\n{m['address']['address']}\nlat/lon {LAT}, {LON}")
print(f"{len(m['floors'])} floor(s), {len(m['rooms'])} rooms, {len(m['panoLocations'])} panoramas; "
      f"property type: {[p['classification'] for p in m['propertyClassifications']]}")
summary = (m.get("generatedDescription") or {}).get("summary")
print("\nAI summary:", summary or "none for this model (90% of models have one, but only 70 of the "
      "232 splat models; ai_summary in models_index.csv says which, e.g. BxUNr6KdqyL)")
print("Capture notes:", m.get("description") or "(none)")

show(Image.open(io.BytesIO(fetch(m["image"]["url"]))).convert("RGB"), "s03_preview.jpg")

SHOWCASE = f"https://my.matterport.com/show/?m={MODEL}&play=1&qs=1"
if "ipykernel" in sys.modules:
    from IPython.display import IFrame, display
    display(IFrame(SHOWCASE, width="100%", height=480))
print("3D tour:", SHOWCASE)

# %% [markdown]
# ## 4. Panoramas
#
# Every scan position (a "pano") is a 360Â° photo stored as a **skybox**: six square cube faces, `0` up, `1`â€“`4` around the horizon, `5` down. Ask for `2k` (2048 px) or `4k` faces. The links are signed and expire, so query again for fresh ones.
#
# Models in this set also carry a **defurnished** view: the same panoramas with the furniture removed by Matterport's generative models. It is a separate view of the model; query it by its own id with the same fields.

# %%
Q_PANOS = """query Panos($id: ID!) { model(id: $id) {
  panoLocations { id label position { x y z } skybox(resolution: "2k") { status children } }
  view(type: "matterport.model.defurnished") { id }
} }"""
d = graph(Q_PANOS, id=MODEL)["model"]
panos = {p["label"]: p for p in d["panoLocations"]}
PANO = "6" if "6" in panos else next(iter(panos))  # the dining room; any label works
pano = panos[PANO]
faces = [Image.open(io.BytesIO(fetch(u))).convert("RGB") for u in pano["skybox"]["children"]]
print(f"{len(panos)} panos; pano {PANO} ({pano['id']}) at {pano['position']} (metres, model frame, z up)")

# The six faces laid out as a cross: face 1 in the middle, up above it, down below it.
s = faces[0].width // 4
cross = Image.new("RGB", (4 * s, 3 * s), "white")
cross.paste(faces[0].resize((s, s)), (s, 0))  # up, above face 1
for col, k in enumerate([4, 1, 2, 3]):  # the horizon, turning right: 1 -> 2 -> 3 -> 4
    cross.paste(faces[k].resize((s, s)), (col * s, s))
cross.paste(faces[5].resize((s, s)), (s, 2 * s))  # down, below face 1
show(cross, "s04_skybox_faces.jpg")


def equirect(faces, width=2048):
    """Stitch six skybox faces into one equirectangular (360 x 180 degree) image."""
    h = width // 2
    lon = (np.arange(width) + 0.5) / width * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    x, y, z = np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)  # y up, z forward
    ax, ay, az = np.abs(x), np.abs(y), np.abs(z)
    out = np.zeros((h, width, 3), np.uint8)
    n = faces[0].width
    arrays = [np.asarray(f) for f in faces]
    # face index, mask, (u, v) in [-1, 1] across that face
    for k, mask, u, v in [
        (1, (az >= ax) & (az >= ay) & (z > 0), x / az, -y / az),
        (2, (ax >= ay) & (ax >= az) & (x > 0), -z / ax, -y / ax),
        (3, (az >= ax) & (az >= ay) & (z < 0), -x / az, -y / az),
        (4, (ax >= ay) & (ax >= az) & (x < 0), z / ax, -y / ax),
        (0, (ay >= ax) & (ay >= az) & (y > 0), x / ay, z / ay),
        (5, (ay >= ax) & (ay >= az) & (y < 0), x / ay, -z / ay),
    ]:
        col = np.clip(((u[mask] + 1) / 2 * n).astype(int), 0, n - 1)
        row = np.clip(((v[mask] + 1) / 2 * n).astype(int), 0, n - 1)
        out[mask] = arrays[k][row, col]
    return Image.fromarray(out)


pano_eq = equirect(faces)
show(pano_eq, "s04_equirect.jpg")

# The same pano in the defurnished view: same pano ids, furniture removed.
dview = d["view"]["id"]
dpano = {p["id"]: p for p in graph(Q_PANOS, id=dview)["model"]["panoLocations"]}[pano["id"]]
dfaces = [Image.open(io.BytesIO(fetch(u))).convert("RGB") for u in dpano["skybox"]["children"]]
dpano_eq = equirect(dfaces)
pair = Image.new("RGB", (pano_eq.width, pano_eq.height * 2))
pair.paste(pano_eq, (0, 0)); pair.paste(dpano_eq, (0, pano_eq.height))
print(f"defurnished view id: {dview}")
show(pair, "s04_furnished_vs_defurnished.jpg")

# %% [markdown]
# ## 5. Rooms and floor plan
#
# Matterport segments each floor into rooms, classifies them (bedroom, kitchen, ...) and measures them. The walls come as a graph: `vertices` (2D points in metres) joined by `edges`, and each room's `boundary` is a loop of those edges. Below, the plan is drawn from that graph alone, then the same walls, and the position of every scan, are laid over Matterport's own photogrammetric floor plan using the image's `origin` (metres) and `resolution` (pixels per metre). The schematic plan also comes as a DXF for CAD tools.

# %%
Q_ROOMS = """query Rooms($id: ID!) { model(id: $id) {
  floors { id label vertices { id position { x y } } edges { id type thickness vertices { id } } }
  rooms { id floor { id } classifications { label confidence } boundary { edges { id } }
          dimensions(units: metric) { areaFloor width depth height } }
  assets { floorplans(provider: "matterport") { format flags url width height resolution origin { x y } } }
  panoLocations { label position { x y } }
} }"""
d = graph(Q_ROOMS, id=MODEL)["model"]
floor = d["floors"][0]
V = {v["id"]: (v["position"]["x"], v["position"]["y"]) for v in floor["vertices"]}
E = {e["id"]: [v["id"] for v in e["vertices"]] for e in floor["edges"]}


def room_polygon(room):
    """Chain a room's boundary edges into one closed loop of (x, y) points."""
    edges = [E[e["id"]] for e in (room.get("boundary") or {}).get("edges", []) if e["id"] in E]
    if not edges:
        return None
    loop, rest = list(edges[0]), edges[1:]
    while rest:
        for i, (a, b) in enumerate(rest):
            if a == loop[-1] or b == loop[-1]:
                loop.append(b if a == loop[-1] else a); rest.pop(i); break
        else:
            break  # not a single loop; keep what we have
    return np.array([V[v] for v in loop])


rooms = []
for r in d["rooms"]:
    if r["floor"]["id"] != floor["id"]:
        continue
    label = (r.get("classifications") or [{}])[0].get("label") or "(unlabelled)"
    poly, dim = room_polygon(r), r.get("dimensions") or {}
    rooms.append(dict(id=r["id"], label=label, area_m2=dim.get("areaFloor"), width_m=dim.get("width"),
                      depth_m=dim.get("depth"), height_m=dim.get("height"), poly=poly))  # None = not measured
room_table = pd.DataFrame(rooms).drop(columns="poly")
room_table = room_table[room_table.label != "Void"].sort_values("area_m2", ascending=False)
print(room_table.round(2).to_string(index=False, na_rep="-"))
print(f"\n{len(V)} wall vertices, {len(E)} wall edges; total labelled area {room_table.area_m2.sum():.0f} mÂ²")


def draw_plan(ax):
    for a, b in E.values():
        ax.plot(*zip(V[a], V[b]), color="#111111", lw=2.2, solid_capstyle="round")
    for r in rooms:
        if r["poly"] is not None and r["label"] != "Void" and (r["area_m2"] or 0) >= 1.5:
            ax.fill(*r["poly"].T, alpha=0.18)
            cx, cy = r["poly"].mean(0)
            ax.text(cx, cy, f"{r['label']}\n{r['area_m2']:.0f} mÂ²", ha="center", va="center", fontsize=7)
    ax.set_aspect("equal")


fig, ax = plt.subplots(figsize=(10, 7))
draw_plan(ax); ax.set_title(f"Drawn from the wall graph: {MODEL}, {floor['label']}"); ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)")
show(fig, "s05_floorplan_drawn.png")

# Matterport's photogrammetric plan, with our walls on top to show the two frames agree.
fp = next(f for f in d["assets"]["floorplans"] if f["format"] == "jpg" and f["flags"] == ["photogramy"])
plan = Image.open(io.BytesIO(fetch(fp["url"]))).convert("RGB")
res, ox, oy = fp["resolution"], fp["origin"]["x"], fp["origin"]["y"]  # pixels per metre; bottom-left corner in metres
fig, ax = plt.subplots(figsize=(10, 7))
ax.imshow(plan, extent=[ox, ox + plan.width / res, oy, oy + plan.height / res])
for a, b in E.values():
    ax.plot(*zip(V[a], V[b]), color="#ED7D31", lw=1.2)
# Where each scan was taken: the pano positions are in the same frame (pano 6, from section 4, ringed).
pp = np.array([(p["position"]["x"], p["position"]["y"]) for p in d["panoLocations"]])
ax.scatter(*pp.T, s=40, c="#2B3A67", edgecolors="white", linewidths=1.2, zorder=4)
six = [p for p in d["panoLocations"] if p["label"] == "6"]
if six:
    ax.scatter(six[0]["position"]["x"], six[0]["position"]["y"], s=260, facecolors="none", edgecolors="#ED7D31", linewidths=2.5, zorder=5)
ax.set_title(f"Matterport floor plan, the wall graph (orange) and all {len(pp)} scan positions (pano 6 ringed)")
show(fig, "s05_floorplan_matterport.jpg")

dxf = next((f for f in d["assets"]["floorplans"] if f["format"] == "dxf"), None)
if dxf:
    (OUT / f"{MODEL}_floorplan.dxf").write_bytes(fetch(dxf["url"]))
    print(f"DXF saved: {OUT / (MODEL + '_floorplan.dxf')} (open it in any CAD tool, or with the ezdxf package)")

# %% [markdown]
# ## 6. Splat and drone photos
#
# For 232 models, a drone flew around the property and those photos trained a **3D Gaussian splat** of the outside. The hackathon site serves each file through a short-lived signed link: `SITE/resources/<sid>/<file>` answers with a redirect to the file, and `SITE/api/models/<sid>` lists the drone photos. `splat.ply` is the standard "INRIA" layout: one 68-byte record per Gaussian with its centre, colour (`f_dc_*`), opacity, scale and rotation. Z is up and the units are roughly metres.
#
# The splat's frame is local to the property and not aligned to north; the drone photos' GPS (below) gives you the georeference. These files are big (this one is 553 MB), but the Gaussians are stored in no spatial order, so the first few percent of the file is a fair sample of the whole scene. We read only the first 60 MB with an HTTP range request. Set `SPLAT_MB = None` for the full file.

# %%
SPLAT_MB = 60


def resource(path):
    """URL of one file of this model on the hackathon site (it redirects to a signed link that lasts one hour)."""
    return f"{SITE}/resources/{MODEL}/{path}"


r = requests.get(f"{SITE}/api/models/{MODEL}", timeout=60, auth=SITE_AUTH)
if r.status_code == 401:
    raise SystemExit(f"{SITE} asks for a password: set HACKATHON_SITE_USER and HACKATHON_SITE_PASSWORD.")
if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
    raise SystemExit(f"{SITE}/api/models/{MODEL} answered HTTP {r.status_code}. Either this model has no splat "
                     f"(only 232 do: splat == 'yes' in models_index.csv) or the site's splat routes are not live yet; "
                     f"set HACKATHON_SITE to the event site.")
catalog = r.json()
photos = catalog["images"]
print(f"{catalog['segment']} model, splat {catalog['splatBytes'] / 1e6:.0f} MB, {len(photos)} drone photos")


def read_ply(data):
    """Decode a Gaussian-splat PLY (possibly cut short) into a numpy record array."""
    head_end = data.index(b"end_header\n") + len(b"end_header\n")
    header = data[:head_end].decode()
    props = re.findall(r"property float (\w+)", header)
    dtype = np.dtype([(p, "<f4") for p in props])
    n = min(int(re.search(r"element vertex (\d+)", header).group(1)), (len(data) - head_end) // dtype.itemsize)
    return np.frombuffer(data, dtype, count=n, offset=head_end), int(re.search(r"element vertex (\d+)", header).group(1))


raw = fetch(resource("splat/splat.ply"), 0, None if SPLAT_MB is None else SPLAT_MB * 2**20 - 1)
g, total = read_ply(raw)
xyz = np.stack([g["x"], g["y"], g["z"]], 1)
rgb = np.clip(0.5 + 0.28209479 * np.stack([g["f_dc_0"], g["f_dc_1"], g["f_dc_2"]], 1), 0, 1)  # SH degree-0 -> colour
alpha = 1 / (1 + np.exp(-g["opacity"]))
print(f"read {len(g):,} of {total:,} Gaussians ({len(g) / total:.0%}); median z {np.median(g['z']):.1f} m")


splat_top = topdown(xyz, rgb, alpha, half=40, px=0.2, keep=xyz[:, 2] < 20)  # drop the far-away background
show(splat_top, "s06_splat_topdown.jpg")

# The sky: six 128 px cube faces the splat was trained against (three.js order px nx py ny pz nz).
env = [Image.open(io.BytesIO(fetch(resource(f"splat/envmap/{f}.jpg")))).convert("RGB") for f in ["px", "nx", "py", "ny", "pz", "nz"]]
strip = Image.new("RGB", (128 * 6, 128))
for i, f in enumerate(env):
    strip.paste(f.resize((128, 128)), (128 * i, 0))
show(strip, "s06_envmap.jpg")

# %% [markdown]
# Each drone photo carries its GPS position and gimbal angles in the JPEG's XMP block, which sits in the first 48 KB of the file. So the whole flight path costs one small range request per photo, and we download a full 20 MB photo only for the one that looks most directly at the house.

# %%
def drone_meta(head):
    """GPS and gimbal angles from a DJI JPEG's XMP block."""
    tags = dict(re.findall(rb'drone-dji:(\w+)="([^"]*)"', head))
    get = lambda k: float(tags[k.encode()]) if k.encode() in tags else np.nan
    return dict(lat=get("GpsLatitude"), lon=get("GpsLongitude"), alt=get("RelativeAltitude"),
                yaw=get("GimbalYawDegree"), pitch=get("GimbalPitchDegree"))


from concurrent.futures import ThreadPoolExecutor

LAT, LON = latlon()
step = max(1, len(photos) // 150)  # about 150 photos is plenty for the path
with ThreadPoolExecutor(8) as pool:  # eight small range requests at a time
    heads = list(pool.map(lambda p: fetch(resource(f"drone-imagery/{p}"), 0, 48 * 1024 - 1), photos[::step]))
flight = pd.DataFrame([dict(file=p, **drone_meta(h)) for p, h in zip(photos[::step], heads)])
flight["east_m"] = (flight.lon - LON) * M_PER_DEG * math.cos(math.radians(LAT))
flight["north_m"] = (flight.lat - LAT) * M_PER_DEG
print(f"{len(flight)} photos sampled; altitude above take-off {flight.alt.min():.0f}-{flight.alt.max():.0f} m")

# The photo (taken at least 25 m up) whose camera points most directly at the model's lat/lon.
bearing = np.degrees(np.arctan2(-flight.east_m, -flight.north_m))  # from camera towards the house
dist = np.hypot(flight.east_m, flight.north_m)
look = np.degrees(np.arctan2(flight.alt, dist))  # how far down the camera must tilt to see it
miss = np.abs((bearing - flight.yaw + 180) % 360 - 180) + np.abs(-look - flight.pitch) + 1e3 * (flight.alt < 25)
best = flight.loc[miss.idxmin()]
photo = Image.open(io.BytesIO(fetch(resource(f"drone-imagery/{best.file}")))).convert("RGB")
print(f"{best.file}: {photo.size[0]}x{photo.size[1]}, {best.alt:.0f} m up, {dist[miss.idxmin()]:.0f} m away, "
      f"gimbal yaw {best.yaw:.0f}Â°, pitch {best.pitch:.0f}Â°")
photo.thumbnail((1600, 1600))
show(photo, "s06_drone_photo.jpg")

fig, ax = plt.subplots(figsize=(7, 6))
sc = ax.scatter(flight.east_m, flight.north_m, c=flight.alt, cmap="viridis", s=14)
ax.plot(flight.east_m, flight.north_m, color="grey", lw=0.5, alpha=0.6)
ax.scatter([0], [0], marker="*", s=250, c="#ED7D31", edgecolors="black", label="model lat/lon", zorder=5)
ax.scatter([best.east_m], [best.north_m], marker="o", s=90, facecolors="none", edgecolors="red", label="photo above")
plt.colorbar(sc, label="altitude above take-off (m)"); ax.set_aspect("equal"); ax.legend(loc="lower right")
ax.set_xlabel("east (m)"); ax.set_ylabel("north (m)"); ax.set_title(f"Drone flight: {len(photos)} photos")
show(fig, "s06_flight_path.png")

# %% [markdown]
# ## 7. The same lot from above
#
# Vexcel flies its own aircraft over the same cities. One call clips their latest orthophoto (7.5 cm per pixel) to a square around the model's lat/lon. The drone path from section 6 is drawn on top, so the three layers line up: the Matterport model's position, the drone that flew the splat, and Vexcel's view from above. Vexcel's own tutorial and Python quickstart (linked from the Vexcel keys card in Discord) go much further: parcels, roof attributes, obliques, object detection and embedding search.
#
# The hackathon Vexcel keys cover Houston and Los Angeles only; anywhere else answers 403.

# %%
VEXCEL = "https://api.vexcelgroup.com/v2"
vexcel_key = secret("VEXCEL_API_KEY")


def square(lat, lon, half_m):
    """WKT square (lon lat order!) around a point, half_m metres from centre to edge."""
    dlat, dlon = half_m / M_PER_DEG, half_m / (M_PER_DEG * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))", (w, e, s, n)


LAT, LON = latlon()
HALF = 70
wkt, (w, e, s_, n) = square(LAT, LON, HALF)
r = requests.post(f"{VEXCEL}/ortho/extract", headers={"X-API-KEY": vexcel_key}, timeout=300, json={
    "wkt": wkt, "srid": 4326, "layer": "urban,urban-r,wide-area,urban-g", "crop": "bounding_box",
    "image-format": "jpeg", "destination-dimensions": "1400,1400", "attribution": "false"})
if r.status_code == 401:
    raise SystemExit("Vexcel rejected the key (401). Check VEXCEL_API_KEY (the api_key on the Vexcel card).")
if r.status_code == 403:
    raise SystemExit(f"Vexcel answered 403 for {LAT}, {LON}: the hackathon keys only cover Houston and Los Angeles.")
r.raise_for_status()
DOWNLOADED[0] += len(r.content)
ortho = Image.open(io.BytesIO(r.content)).convert("RGB")

fig, ax = plt.subplots(figsize=(8, 8))
ax.imshow(ortho, extent=[-HALF, HALF, -HALF, HALF])
if "flight" in globals():  # the drone positions from section 6, when it has run
    inside = (flight.east_m.abs() < HALF) & (flight.north_m.abs() < HALF)
    ax.scatter(flight.east_m[inside], flight.north_m[inside], c=flight.alt[inside], cmap="viridis", s=12, label="drone photos")
ax.scatter([0], [0], marker="*", s=300, c="#ED7D31", edgecolors="black", label=f"Matterport model {MODEL}")
ax.set_xlim(-HALF, HALF); ax.set_ylim(-HALF, HALF); ax.legend(loc="lower left")
ax.set_xlabel("east (m)"); ax.set_ylabel("north (m)"); ax.set_title("Vexcel ortho, drone positions, model location")
show(fig, "s07_vexcel_ortho_drone.jpg")

# %% [markdown]
# The **CoStar** kit (link and zip password on the CoStar keys card) holds the property and listing records. A residential model's Homes listing id (`homes_listing_id` in the index) joins to `residential-listings.csv`; a commercial model's CoStar property id joins to the commercial records. The kit is 160 MB, but a zip keeps its table of contents at the end, so with range requests we read just the one file we need. This step is skipped when the CoStar settings aren't set.
#
# **Not yet tested.** We wrote this cell against the kit's file list, but haven't yet run it with the real zip password, so the join itself is unverified. If it fails, tell us in the track channel.

# %%
# NOT YET TESTED with the kit password (12 Nov 2026): the member names come from the zip's listing, the join is unverified.
kit_path, kit_url, kit_pw = secret("COSTAR_KIT_ZIP", r"C:\Users\dmsch\Downloads\costar-hackathon-kit.zip"), secret("COSTAR_KIT_URL", False), secret("COSTAR_ZIP_PASSWORD", "princeton-h4ck4th0n-2026")
idx = index if "index" in globals() else pd.read_csv("models_index.csv", dtype=str)
row = idx[idx.sid == MODEL].iloc[0] if (idx.sid == MODEL).any() else None
if kit_pw and (kit_path or kit_url) and row is not None:
    kit = zipfile.ZipFile(kit_path if kit_path else HttpFile(kit_url))
    kit.setpassword(kit_pw.encode())
    try:
        kit.read("index.md")
    except RuntimeError:
        raise SystemExit("The CoStar kit rejected COSTAR_ZIP_PASSWORD. Copy the zip password from the CoStar keys card again.")
    if isinstance(row.get("homes_listing_id"), str):
        listings = pd.read_csv(kit.open("residential-listings.csv"), dtype=str)
        match = listings[(listings == row.homes_listing_id).any(axis=1)]
        print(f"Homes listing {row.homes_listing_id}: {len(match)} row(s) in residential-listings.csv")
        print(match.T.dropna().head(40).to_string() if len(match) else "no row for this listing in the kit")
    elif isinstance(row.get("costar_property_id"), str):
        names = [i for i in kit.namelist() if re.search(rf"commercial-property/.*\b{row.costar_property_id}\b", i)]
        print(json.dumps(json.load(kit.open(names[0])), indent=1)[:3000] if names else
              f"CoStar property {row.costar_property_id} is not in the kit")
else:
    print("CoStar kit not configured (COSTAR_ZIP_PASSWORD plus COSTAR_KIT_URL or COSTAR_KIT_ZIP); skipped.")

# %% [markdown]
# ## 8. MatterPak: mesh and point cloud
#
# A MatterPak is the model's geometry as one zip: a textured OBJ mesh, a coloured point cloud (`cloud.xyz`, one `x y z r g b` line per point, metres, Z up, in the same frame as the panos and the wall graph) and floor-plan renders. The API hands out a signed link. It is unlocked for the 232 splat models and is being unlocked for the rest of the hackathon org; a model where it is still locked says so below.
#
# We list the zip's contents without downloading it, then stream just the point cloud (about 100 MB compressed) and keep every 10th point.

# %%
Q_MATTERPAK = """query MatterPak($id: ID!) { model(id: $id) {
  bundle(id: "mp:matterpak") { availability }
  assets { resources(format: "matterpak") { status filename url } }
} }"""
d = graph(Q_MATTERPAK, id=MODEL)["model"]
pak = next((x for x in d["assets"]["resources"] if x.get("url")), None)
if not pak:
    raise SystemExit(f"MatterPak for {MODEL} is {d['bundle']['availability']}: not unlocked for this model yet. "
                     f"Ask in the track channel, or pick a model with splat == 'yes'.")
mp = zipfile.ZipFile(HttpFile(pak["url"]))
print(f"{pak['filename']}: {mp.fp.size / 1e6:.0f} MB")
for i in sorted(mp.infolist(), key=lambda i: -i.compress_size)[:8]:
    print(f"  {i.filename:<45} {i.file_size / 1e6:8.1f} MB  ({i.compress_size / 1e6:.1f} MB zipped)")

STRIDE = 10
chunks = pd.read_csv(mp.open("cloud.xyz"), sep=" ", header=None, names=list("xyzrgb"), dtype=np.float32,
                     chunksize=2_000_000)
cloud = pd.concat(c.iloc[::STRIDE] for c in chunks).to_numpy()
cxyz, crgb = cloud[:, :3], cloud[:, 3:] / 255.0
print(f"kept {len(cloud):,} points (every {STRIDE}th); extent {np.ptp(cxyz, 0).round(1)} m")

# Two views: from above with the ceiling cut away, and an oblique cut-away.
floor_z = np.percentile(cxyz[:, 2], 2)
cut = cxyz[:, 2] < floor_z + 1.6  # everything below 1.6 m above the floor
fig = plt.figure(figsize=(15, 7))
ax = fig.add_subplot(1, 2, 1)
c0 = cxyz[:, :2].mean(0)
ax.imshow(topdown(cxyz, crgb, half=np.ptp(cxyz[:, :2], 0).max() / 2 + 1, px=0.03, keep=cut, center=c0, fill=1))
ax.set_title("Point cloud from above, ceiling removed"); ax.axis("off")
ax = fig.add_subplot(1, 2, 2, projection="3d")
pick = np.flatnonzero(cut)[:: max(1, cut.sum() // 250_000)]
ax.scatter(*cxyz[pick].T, c=crgb[pick], s=0.3, linewidths=0)
ax.view_init(elev=35, azim=-60); ax.set_box_aspect(np.ptp(cxyz[pick], 0)); ax.set_axis_off()
ax.set_title("Oblique cut-away")
show(fig, "s08_point_cloud.jpg")

GET_OBJ = True  # True to also save the textured OBJ mesh (+ MTL and textures, ~30 MB) under mp_out/matterpak/
if GET_OBJ:
    for name in mp.namelist():
        if name.endswith((".obj", ".mtl")) or (name.endswith(".jpg") and "plan" not in name):
            mp.extract(name, OUT / "matterpak")
    print("OBJ mesh saved under", OUT / "matterpak")

print(f"\nTotal downloaded by this notebook: {DOWNLOADED[0] / 1e6:.0f} MB")

# %% [markdown]
# ## 9. Ideas and help
#
# **What we haven't solved yet.** These are real problems on our team's board. Pick one, build it this weekend, and come show us.
#
# | # | Problem | Data to start from |
# |---|---|---|
# | 1 | **Understand commercial spaces.** We've focused on homes; offices, shops and warehouses have room types we don't label yet. | sections 2 and 5 on a commercial model (`segment == commercial`) |
# | 2 | **Find and count amenities.** Spot every gym, pool, lounge and laundry in a space, place it, count it. | panoramas (4), rooms (5), point cloud (8) |
# | 3 | **Agentic annotation.** An agent that walks a space and labels what it finds. | panoramas and their positions (4), rooms (5) |
# | 4 | **Search inside panoramas and meshes.** Find spaces by what's in them: "sunlit kitchen with an island". | skybox faces (4), mesh (8) |
# | 5 | **Splats as an in-between representation.** The 3D format between photos and everything else. | splat and drone photos (6) |
# | 6 | **Refurnish: restage a room.** Put furniture back into an empty room, in a new style. | furnished and defurnished panoramas (4) |
#
# Several of these would shine inside the 3D tour itself, with the [Showcase SDK](https://matterport.github.io/developer-docs/overview/). And two ideas across the track's layers: create Gaussian splats from Vexcel's aerial imagery, and learn to predict CoStar listing amenities from the Matterport models of the same places.
#
# **Where to look.**
#
# - The hackathon site: the Model Playground (GraphiQL with your key), the API reference, the splat dataset, and this page.
# - Model API reference: https://matterport.github.io/developer-docs/api/ Â· Showcase SDK: https://matterport.github.io/developer-docs/overview/
# - `models_index.csv` and `AGENTS.md` (for your coding agent), next to this notebook.
#
# **Find us.** Ask in **#costar-group** on Discord or with `/ask-costar`, or find us at the CoStar track: Azwad Sabik, Ilia Glazkov, Lucas Hayne, Olaf Brandt, Ted Weidling (the API) and Guillermo Bruce (on Discord). Lucas is the one to ask about semantic search. Help us Matterport the world this weekend.