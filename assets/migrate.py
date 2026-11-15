"""Move the catalog between the file store and MongoDB.

    python -m assets.migrate --to mongo [--dry-run]            # library + local profiles -> Mongo (idempotent upserts)
    python -m assets.migrate --from mongo [--out DIR] [--dry-run]   # Mongo -> file layout under DIR (backup)

Connection comes from MONGODB_URI (+ optional MONGODB_DB); it is never printed. Model files are uploaded to GridFS
(content-addressed, so reruns upload nothing new) and model.uri is rewritten to gridfs://<sha256>/<name>.
"""
import argparse
import sys
from pathlib import Path

from .models import Asset, Model3D
from .mongo_store import GRIDFS_URI, MongoStore
from .store import FileStore


def _file_assets(fs: FileStore) -> list[Asset]:
    out = fs._load_dir(fs.library)
    if fs.profiles.is_dir():
        for d in sorted(p for p in fs.profiles.iterdir() if p.is_dir()):
            out += fs._load_dir(d)
    return out


def push(fs: FileStore, ms: MongoStore, dry_run: bool = False) -> dict:
    n = dict(assets=0, models_uploaded=0, models_missing=0, library=0, profile=0)
    for a in _file_assets(fs):
        n["assets"] += 1
        n["profile" if a.profileId else "library"] += 1
        if a.model and a.model.format != "box":
            blob = fs.open_model(a)
            if blob is None:
                n["models_missing"] += 1
            else:
                if dry_run:
                    n["models_uploaded"] += 1
                else:
                    data = b"".join(blob.chunks)
                    uri = ms.put_blob(data, blob.filename)
                    n["models_uploaded"] += 1
                    a = a.model_copy(update={"model": Model3D(uri=uri, format=a.model.format)})
        if not dry_run:
            ms.save(a)
    return n


def pull(ms: MongoStore, out: Path, dry_run: bool = False) -> dict:
    fs = FileStore(out)
    n = dict(assets=0, models_written=0, models_missing=0)
    ids = sorted(d["assetId"] for d in ms.col.find({}, {"assetId": 1}))
    for aid in ids:
        a = ms.find_asset(aid)
        n["assets"] += 1
        if a.model and GRIDFS_URI.match(a.model.uri):
            blob = ms.open_model(a)
            if blob is None:
                n["models_missing"] += 1
            else:
                n["models_written"] += 1
                if not dry_run:
                    ext = "." + blob.filename.rsplit(".", 1)[-1].lower()
                    a = a.model_copy(update={"model": Model3D(uri=fs.put_model(a, b"".join(blob.chunks), ext), format=a.model.format)})
        if not dry_run:
            fs.save(a)
    return n


def main(argv: list[str] | None = None, file_store: FileStore | None = None, mongo_store: MongoStore | None = None) -> int:
    ap = argparse.ArgumentParser(prog="assets.migrate")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--to", choices=["mongo"], help="push the file catalog into MongoDB")
    g.add_argument("--from", dest="src", choices=["mongo"], help="export MongoDB back to a file layout")
    ap.add_argument("--dry-run", action="store_true", help="count only; write nothing")
    ap.add_argument("--out", default="catalog_backup", help="export directory for --from (default ./catalog_backup)")
    a = ap.parse_args(argv)
    import os
    if mongo_store is None:
        if not os.environ.get("MONGODB_URI"):
            print("MONGODB_URI is not set (export it in your shell; do not pass it as an argument)", file=sys.stderr)
            return 2
        mongo_store = MongoStore.from_env()
    tag = " (dry run)" if a.dry_run else ""
    if a.to:
        counts = push(file_store or FileStore(), mongo_store, a.dry_run)
    else:
        counts = pull(mongo_store, Path(a.out), a.dry_run)
    print(("push" if a.to else "export") + tag + ": " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
