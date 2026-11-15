#!/usr/bin/env python3
"""Push a directory of reconstruction files into the team MongoDB catalog.

    python tools/catalog_push.py DIR [--profile ID] [--dry-run] [--max-mb 50]

Needs Python 3.9+ and `pip install pymongo`. The connection string is read from the MONGODB_URI environment
variable ONLY (never an argument, never printed). MONGODB_DB optionally names the database (default "catalog").

What it does with each file under DIR (recursively):
  .glb .obj           -> GridFS bucket `models`; a draft Asset is created (dims from the mesh bounding box,
                         dimsStatus "estimated", provenance origin "mesh bounding box") unless an asset JSON
                         in DIR already points at that file
  .ply                -> GridFS bucket `files` (raw scan; no draft asset)
  .png .jpg .jpeg .webp -> GridFS bucket `images`
  .json               -> Asset document when it has "assetId" (validated), otherwise GridFS bucket `files`
Refused: other extensions, files over --max-mb, secret-looking files (.env, keys, tokens, connection strings).
Resumable: blobs are content-addressed (sha256) and existing assets are never overwritten, so re-running after an
interruption only uploads what is missing.
"""
import argparse
import hashlib
import json
import os
import posixpath
import re
import struct
import sys
from pathlib import Path

MESH = {".glb", ".obj"}
IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED = MESH | IMAGE | {".ply", ".json"}
SECRET_NAMES = re.compile(r"(^\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.keystore$|^id_(rsa|ed25519|ecdsa|dsa)|credential|secret|token|\.npmrc$|\.netrc$)", re.I)
SECRET_CONTENT = re.compile(rb"(mongodb(\+srv)?://[^\s\"']*:[^\s\"']*@|BEGIN [A-Z ]*PRIVATE KEY|MONGODB_URI\s*=|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_\-]{20,})")
ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")
REQUIRED = ("assetId", "name", "category", "source", "dims", "dimsStatus", "footprint", "clearance", "clearanceBasis", "provenance")
CATEGORIES = {"counter", "prep_table", "range", "oven", "fridge", "freezer_display", "sink", "hood", "dish", "seating", "table", "storage", "other"}
MIME = {".glb": "model/gltf-binary", ".obj": "text/plain", ".ply": "application/octet-stream", ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json"}


# --- mesh bounds ----------------------------------------------------------------------------------------------
def glb_bounds(data: bytes):
    """Union of POSITION accessor min/max over all meshes (node transforms ignored). Returns (min3, max3) or None."""
    if len(data) < 20:
        return None
    magic, ver, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or ver != 2 or total > len(data):
        return None
    jl, jt = struct.unpack_from("<II", data, 12)
    if jt != 0x4E4F534A:
        return None
    doc = json.loads(data[20:20 + jl])
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    found = False
    for m in doc.get("meshes", []):
        for p in m.get("primitives", []):
            ai = p.get("attributes", {}).get("POSITION")
            acc = doc.get("accessors", [])[ai] if ai is not None else None
            if acc and "min" in acc and "max" in acc:
                found = True
                lo = [min(a, b) for a, b in zip(lo, acc["min"])]
                hi = [max(a, b) for a, b in zip(hi, acc["max"])]
    return (lo, hi) if found else None


def obj_bounds(data: bytes):
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    found = False
    for line in data.decode("utf-8", "replace").splitlines():
        if line.startswith("v "):
            try:
                xyz = [float(t) for t in line.split()[1:4]]
            except ValueError:
                continue
            if len(xyz) == 3:
                found = True
                lo = [min(a, b) for a, b in zip(lo, xyz)]
                hi = [max(a, b) for a, b in zip(hi, xyz)]
    return (lo, hi) if found else None


def slug(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_.\-]+", "_", s).strip("._-").lower()
    return s or "asset"


def draft_asset(stem: str, ext: str, data: bytes, uri: str, profile, rel: str):
    """Draft Asset dict for a bare mesh, or (None, reason). glTF is Y-up: w=x, d=z, h=y (units assumed metres)."""
    b = glb_bounds(data) if ext == ".glb" else obj_bounds(data)
    if not b:
        return None, "no mesh bounds found"
    ext3 = [h - l for l, h in zip(*b)]
    w, h, d = (round(max(ext3[i], 0.001), 4) for i in (0, 1, 2))  # x, y (up), z
    return {
        "assetId": slug(stem), "name": re.sub(r"[_\-]+", " ", stem).strip().title() or stem,
        "category": "other", "source": "uploaded", "parentAssetId": None, "variantKind": "base",
        "dims": {"w": w, "d": d, "h": h}, "dimsStatus": "estimated",
        "footprint": [[0.0, 0.0], [w, 0.0], [w, d], [0.0, d], [0.0, 0.0]],
        "clearance": {"front": 0.6, "sides": 0.05, "back": 0.05},
        "clearanceBasis": "assumed default for an unreviewed upload; confirm before layout use",
        "model": {"uri": uri, "format": ext[1:]}, "imageRefs": [], "profileId": profile, "tags": [],
        "provenance": {"origin": "mesh bounding box", "notes": f"bounding box of {rel}; metres and Y-up assumed", "confidence": 0.3},
        "status": "draft",
    }, None


# --- asset JSON validation --------------------------------------------------------------------------------------
def validate_asset(doc: dict) -> list:
    """Full pydantic validation when run inside the repo; structural checks otherwise."""
    errs = []
    try:
        repo = Path(__file__).resolve().parents[1]
        if (repo / "assets" / "models.py").is_file():
            sys.path.insert(0, str(repo))
            from assets.models import Asset  # type: ignore
            try:
                Asset.model_validate(doc)
                return []
            except Exception as e:  # pydantic ValidationError
                return [str(e).splitlines()[0] if str(e) else "invalid asset"]
    except ImportError:
        pass
    for k in REQUIRED:
        if k not in doc:
            errs.append(f"missing {k}")
    if errs:
        return errs
    if not isinstance(doc["assetId"], str) or not ID_RE.match(doc["assetId"]):
        errs.append("assetId has unsafe characters")
    if doc["category"] not in CATEGORIES:
        errs.append(f"unknown category {doc['category']!r}")
    dims = doc["dims"]
    if not (isinstance(dims, dict) and all(isinstance(dims.get(k), (int, float)) and dims[k] > 0 for k in "wdh")):
        errs.append("dims.w/d/h must be positive numbers")
    fp = doc["footprint"]
    if not (isinstance(fp, list) and len(fp) >= 4 and fp[0] == fp[-1]):
        errs.append("footprint must be a closed ring")
    if doc["dimsStatus"] not in ("measured", "catalog", "estimated"):
        errs.append("bad dimsStatus")
    return errs


# --- scanning ---------------------------------------------------------------------------------------------------
def scan(root: Path, max_bytes: int):
    """Return (accepted[list of Path], refused[list of (rel, reason)])."""
    ok, bad = [], []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            bad.append((rel, "symlink"))
        elif SECRET_NAMES.search(p.name):
            bad.append((rel, "looks like a secret/credential file"))
        elif p.suffix.lower() not in ALLOWED:
            bad.append((rel, f"extension {p.suffix or '(none)'} not allowed"))
        elif p.stat().st_size > max_bytes:
            bad.append((rel, f"over the {max_bytes // (1 << 20)} MB cap ({p.stat().st_size / (1 << 20):.1f} MB)"))
        elif p.suffix.lower() in (".json", ".obj") and SECRET_CONTENT.search(p.read_bytes()[:1 << 20]):
            bad.append((rel, "content looks like a secret/connection string"))
        else:
            ok.append(p)
    return ok, bad


class Sink:
    """Where uploads go. Real: MongoDB. Dry run: counts only."""

    def __init__(self, db, dry: bool):
        self.dry, self.db, self.fs = dry, db, {}
        if db is not None:
            import gridfs
            for b in ("models", "images", "files"):
                self.fs[b] = gridfs.GridFS(db, collection=b)

    def blob(self, bucket: str, data: bytes, name: str, sha: str):
        """True when the blob is new (uploaded unless dry run), False when already present."""
        if self.db is not None and self.fs[bucket].exists(sha):
            return False
        if not self.dry:
            self.fs[bucket].put(data, _id=sha, filename=name)
        return True

    def asset(self, doc: dict):
        """True when inserted, False when an asset with that id already exists."""
        if self.db is not None and self.db["assets"].find_one({"assetId": doc["assetId"]}, {"_id": 1}):
            return False
        if not self.dry:
            self.db["assets"].insert_one(dict(doc))
        return True


def run(root: Path, profile, dry: bool, max_mb: float, db) -> dict:
    root = root.resolve()
    ok, bad = scan(root, int(max_mb * (1 << 20)))
    s = dict(uploaded=0, already_present=0, refused=len(bad), assets_created=0, assets_existing=0, assets_invalid=0, blobs={})
    sink = Sink(db, dry)
    log = []
    by_name = {}  # basename -> (bucket, uri)
    pending_assets = []  # (rel, doc)
    used_ids = set()

    def up(bucket, p, data):
        sha = hashlib.sha256(data).hexdigest()
        name = slug(p.stem) + p.suffix.lower()
        new = sink.blob(bucket, data, name, sha)
        s["uploaded" if new else "already_present"] += 1
        s["blobs"][bucket] = s["blobs"].get(bucket, 0) + 1
        return f"gridfs://{sha}/{name}"

    json_assets, others = [], []
    for p in ok:
        (json_assets if p.suffix.lower() == ".json" else others).append(p)
    # Files are indexed by RELATIVE path: the same basename in two folders must stay two different files.
    by_rel: dict = {}
    by_base: dict = {}

    def add(rel, entry):
        by_rel[rel] = entry
        by_base.setdefault(Path(rel).name, []).append(rel)

    def resolve(ref, json_rel):
        """Relative path of the file a reference points to: beside the JSON first, then from the root, then a UNIQUE basename."""
        if not isinstance(ref, str) or not ref or "://" in ref:
            return None
        for cand in (posixpath.normpath(posixpath.join(posixpath.dirname(json_rel), ref)), posixpath.normpath(ref)):
            if cand in by_rel:
                return cand
        same = by_base.get(Path(ref).name, [])
        if len(same) == 1:
            return same[0]
        if len(same) > 1:
            log.append(f"AMBIGUOUS {json_rel}: '{ref}' matches {len(same)} files; left unlinked (use a path relative to the JSON)")
        return None

    # pass 1: meshes, images, ply
    for p in others:
        ext, data, rel = p.suffix.lower(), p.read_bytes(), p.relative_to(root).as_posix()
        bucket = "models" if ext in MESH else "images" if ext in IMAGE else "files"
        add(rel, (bucket, up(bucket, p, data), ext, data, rel))
    # pass 2: json
    referenced = set()
    for p in json_assets:
        rel = p.relative_to(root).as_posix()
        data = p.read_bytes()
        try:
            doc = json.loads(data)
        except ValueError as e:
            log.append(f"REFUSED {rel}: invalid JSON ({e.__class__.__name__})")
            s["refused"] += 1
            continue
        if not (isinstance(doc, dict) and "assetId" in doc):
            add(rel, ("files", up("files", p, data), ".json", data, rel))
            continue
        if profile:
            doc["profileId"] = profile
        m = doc.get("model")
        if isinstance(m, dict):
            hit_rel = resolve(m.get("uri"), rel)
            if hit_rel and by_rel[hit_rel][0] == "models":
                m["uri"] = by_rel[hit_rel][1]
                referenced.add(hit_rel)
        refs = []
        for r in doc.get("imageRefs", []):
            hit_rel = resolve(r, rel)
            refs.append(by_rel[hit_rel][1] if hit_rel else r)
        doc["imageRefs"] = refs
        errs = validate_asset(doc)
        if errs:
            s["assets_invalid"] += 1
            log.append(f"INVALID {rel}: {'; '.join(errs)[:200]}")
            continue
        used_ids.add(doc["assetId"])
        pending_assets.append((rel, doc))
    # pass 3: draft assets for bare meshes
    for rel, (bucket, uri, ext, data, _r) in sorted(by_rel.items()):
        if bucket != "models" or rel in referenced:
            continue
        stem = Path(rel).stem
        doc, why = draft_asset(stem, ext, data, uri, profile, rel)
        if doc is None:
            s["assets_invalid"] += 1
            log.append(f"NO DRAFT {rel}: {why}")
            continue
        if doc["assetId"] in used_ids:
            doc["assetId"] += "_" + uri.split("/")[2][:6]
        errs = validate_asset(doc)
        if errs:
            s["assets_invalid"] += 1
            log.append(f"NO DRAFT {rel}: {'; '.join(errs)[:200]}")
            continue
        used_ids.add(doc["assetId"])
        folder = Path(rel).parent
        doc["imageRefs"] = [v[1] for k, v in by_rel.items() if v[0] == "images" and Path(k).stem == stem and Path(k).parent == folder]
        pending_assets.append((rel, doc))
    for rel, doc in pending_assets:
        created = sink.asset(doc)
        s["assets_created" if created else "assets_existing"] += 1
    s["log"] = log + [f"REFUSED {r}: {why}" for r, why in bad]
    return s


def main(argv=None, db=None) -> int:
    ap = argparse.ArgumentParser(description="Push reconstruction files to the team MongoDB catalog (needs MONGODB_URI in the environment).")
    ap.add_argument("directory", type=Path)
    ap.add_argument("--profile", help="profileId to attach the assets to (default: shared library)")
    ap.add_argument("--dry-run", action="store_true", help="validate and report only; upload nothing")
    ap.add_argument("--max-mb", type=float, default=50.0, help="per-file size cap in MB (default 50)")
    a = ap.parse_args(argv)
    if not a.directory.is_dir():
        print(f"not a directory: {a.directory}", file=sys.stderr)
        return 2
    if a.profile and not ID_RE.match(a.profile):
        print("--profile may only contain letters, digits, _ . -", file=sys.stderr)
        return 2
    if db is None and not (a.dry_run and not os.environ.get("MONGODB_URI")):
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            print("MONGODB_URI is not set. Set it in your shell (see docs/data/catalog-mongodb.md); it is never passed as an argument.", file=sys.stderr)
            return 2
        try:
            from pymongo import MongoClient
        except ImportError:
            print("pymongo is missing: pip install pymongo", file=sys.stderr)
            return 2
        try:
            client = MongoClient(uri, serverSelectionTimeoutMS=10000)
            client.admin.command("ping")
            db = client[os.environ.get("MONGODB_DB", "catalog")]
        except Exception as e:  # message may echo the host; never the URI itself
            print(f"could not connect to MongoDB ({e.__class__.__name__}). Check MONGODB_URI and Atlas network access.", file=sys.stderr)
            return 1
    s = run(a.directory, a.profile, a.dry_run, a.max_mb, db)
    for line in s.pop("log"):
        print(line)
    tag = " (dry run, nothing uploaded)" if a.dry_run else ""
    print(f"summary{tag}: " + ", ".join(f"{k}={v}" for k, v in s.items()))
    return 1 if s["refused"] or s["assets_invalid"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
