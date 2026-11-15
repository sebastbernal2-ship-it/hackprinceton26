"""MongoDB catalog: collection `assets` (Asset documents) + GridFS bucket `models` (GLB/OBJ blobs).

Blobs are content-addressed (GridFS _id = sha256 hex), so re-uploading the same bytes is a no-op.
model.uri for stored blobs is gridfs://<sha256>/<filename>.
"""
import hashlib
import os
import re
from typing import Iterator

from .models import Asset
from .store import MODEL_EXTS, ModelBlob, _SAFE

GRIDFS_URI = re.compile(r"^gridfs://([0-9a-f]{64})/([A-Za-z0-9_.\-]+)$")
DEFAULT_DB = "catalog"


class MongoStore:
    def __init__(self, db, bucket: str = "models"):
        import gridfs
        self.db = db
        self.col = db["assets"]
        self.fs = gridfs.GridFS(db, collection=bucket)
        self._indexed = False

    @classmethod
    def from_env(cls) -> "MongoStore":
        from pymongo import MongoClient
        client = MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=8000)
        return cls(client[os.environ.get("MONGODB_DB", DEFAULT_DB)])

    def ensure_indexes(self) -> None:
        if not self._indexed:
            self.col.create_index("assetId", unique=True)
            self.col.create_index("profileId")
            self.col.create_index("category")
            self._indexed = True

    @staticmethod
    def _check(s: str) -> str:
        if not _SAFE.match(s) or s in (".", ".."):
            raise ValueError(f"unsafe id {s!r}")
        return s

    @staticmethod
    def _asset(doc: dict) -> Asset:
        doc = {k: v for k, v in doc.items() if k != "_id"}
        return Asset.model_validate(doc)

    def _docs(self, profile_id: str | None) -> list[Asset]:
        # profileId null (or absent) is the shared library
        return [self._asset(d) for d in self.col.find({"profileId": profile_id}).sort("assetId", 1)]

    def list(self, profile_id: str | None = None, category: str | None = None) -> list[Asset]:
        self.ensure_indexes()
        out: list[Asset] = []
        if profile_id:
            out += self._docs(self._check(profile_id))
        out += self._docs(None)
        return [a for a in out if category is None or a.category == category]

    def get(self, asset_id: str, profile_id: str | None = None) -> Asset | None:
        self._check(asset_id)
        return next((a for a in self.list(profile_id) if a.assetId == asset_id), None)

    def find_asset(self, asset_id: str) -> Asset | None:
        self.ensure_indexes()
        d = self.col.find_one({"assetId": self._check(asset_id)})
        return self._asset(d) if d else None

    def save(self, a: Asset) -> None:
        """Upsert by assetId (the API checks for duplicates before calling)."""
        self.ensure_indexes()
        self._check(a.assetId)
        if a.profileId is not None:
            self._check(a.profileId)
        self.col.replace_one({"assetId": a.assetId}, a.model_dump(mode="json"), upsert=True)

    def replace(self, a: Asset) -> None:
        self.ensure_indexes()
        if not self.col.replace_one({"assetId": a.assetId}, a.model_dump(mode="json")).matched_count:
            raise KeyError(a.assetId)

    def put_blob(self, data: bytes, filename: str) -> str:
        name = self._check(filename)
        sha = hashlib.sha256(data).hexdigest()
        if not self.fs.exists(sha):
            self.fs.put(data, _id=sha, filename=name)
        return f"gridfs://{sha}/{name}"

    def put_model(self, a: Asset, data: bytes, ext: str = ".glb") -> str:
        if ext not in MODEL_EXTS:
            raise ValueError(f"unsupported model extension {ext!r}")
        return self.put_blob(data, f"{self._check(a.assetId)}{ext}")

    def open_model(self, a: Asset) -> ModelBlob | None:
        if not a.model or a.model.format == "box":
            return None
        m = GRIDFS_URI.match(a.model.uri)
        if not m or not self.fs.exists(m.group(1)):
            return None
        ext = "." + m.group(2).rsplit(".", 1)[-1].lower()
        if ext not in MODEL_EXTS:
            return None
        f = self.fs.get(m.group(1))
        return ModelBlob(_gridfs_chunks(f), m.group(2), MODEL_EXTS[ext], f.length)


def _gridfs_chunks(f, n: int = 1 << 16) -> Iterator[bytes]:
    try:
        while chunk := f.read(n):
            yield chunk
    finally:
        f.close()
