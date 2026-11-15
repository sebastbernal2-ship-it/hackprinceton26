"""File-backed catalog: assets/library/*.json (committed seed) and assets/profiles/<profileId>/*.json (gitignored)."""
import json
import os
import re
from pathlib import Path
from typing import Iterator, Protocol

from .models import Asset

ROOT = Path(__file__).resolve().parent
_SAFE = re.compile(r"^[A-Za-z0-9_.\-]+$")
MODEL_EXTS = {".glb": "model/gltf-binary", ".obj": "text/plain"}
IMAGE_EXTS = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg"}


class ModelBlob:
    """A model file ready to stream: chunks, filename, media type, size."""

    def __init__(self, chunks: Iterator[bytes], filename: str, media_type: str, size: int | None = None):
        self.chunks, self.filename, self.media_type, self.size = chunks, filename, media_type, size


class CatalogStore(Protocol):
    """What the API needs from a catalog backend (FileStore or MongoStore)."""

    def list(self, profile_id: str | None = None, category: str | None = None) -> list[Asset]: ...
    def get(self, asset_id: str, profile_id: str | None = None) -> Asset | None: ...
    def find_asset(self, asset_id: str) -> Asset | None: ...
    def save(self, a: Asset): ...  # create (or overwrite) one asset
    def replace(self, a: Asset) -> None: ...  # overwrite an existing asset in place
    def put_model(self, a: Asset, data: bytes, ext: str = ".glb") -> str: ...  # store a blob, return its model.uri
    def open_model(self, a: Asset) -> ModelBlob | None: ...


def get_store() -> "CatalogStore":
    """MongoStore when MONGODB_URI is set (the value is never read here beyond handing it to pymongo), else FileStore."""
    if os.environ.get("MONGODB_URI"):
        from .mongo_store import MongoStore
        return MongoStore.from_env()
    return FileStore()


class FileStore:
    def __init__(self, root: Path = ROOT):
        self.library = root / "library"
        self.profiles = root / "profiles"

    def _load_dir(self, d: Path) -> list[Asset]:
        if not d.is_dir():
            return []
        return [Asset.model_validate_json(f.read_text()) for f in sorted(d.glob("*.json"))]

    def list(self, profile_id: str | None = None, category: str | None = None) -> list[Asset]:
        """Profile assets first (when profile_id given), then the library; optional category filter."""
        out: list[Asset] = []
        if profile_id:
            self._check(profile_id)
            out += self._load_dir(self.profiles / profile_id)
        out += self._load_dir(self.library)
        return [a for a in out if category is None or a.category == category]

    def get(self, asset_id: str, profile_id: str | None = None) -> Asset | None:
        self._check(asset_id)
        return next((a for a in self.list(profile_id) if a.assetId == asset_id), None)

    def find(self, asset_id: str) -> tuple[Asset, Path] | None:
        """Locate an asset by id in the library or any profile directory."""
        self._check(asset_id)
        dirs = [self.library] + (sorted(p for p in self.profiles.iterdir() if p.is_dir()) if self.profiles.is_dir() else [])
        for d in dirs:
            f = d / f"{asset_id}.json"
            if f.is_file():
                return Asset.model_validate_json(f.read_text()), f
        return None

    def save(self, a: Asset) -> Path:
        """Profile assets go to profiles/<profileId>/; assets without a profile are library seeds."""
        self._check(a.assetId)
        d = self.library if a.profileId is None else self.profiles / self._check(a.profileId)
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{a.assetId}.json"
        f.write_text(json.dumps(a.model_dump(mode="json"), indent=2) + "\n")
        return f

    def models_dir(self, profile_id: str | None) -> Path:
        return (self.profiles / self._check(profile_id) if profile_id else self.library) / "models"

    @staticmethod
    def _check(s: str) -> str:
        if not _SAFE.match(s) or s in (".", ".."):
            raise ValueError(f"unsafe id {s!r}")
        return s

    # --- CatalogStore interface -------------------------------------------------------------------------------
    def find_asset(self, asset_id: str) -> Asset | None:
        f = self.find(asset_id)
        return f[0] if f else None

    def replace(self, a: Asset) -> None:
        f = self.find(a.assetId)
        if not f:
            raise KeyError(a.assetId)
        f[1].write_text(json.dumps(a.model_dump(mode="json"), indent=2) + "\n")

    def put_model(self, a: Asset, data: bytes, ext: str = ".glb") -> str:
        """Write the blob under the asset's models dir; returns the repo-relative uri."""
        if ext not in MODEL_EXTS:
            raise ValueError(f"unsupported model extension {ext!r}")
        d = self.models_dir(a.profileId)
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{self._check(a.assetId)}{ext}"
        f.write_bytes(data)
        return f.relative_to(self.library.parent.parent).as_posix()

    def put_image(self, a: Asset, data: bytes, ext: str) -> str:
        """Write an illustration beside the asset's models; returns the repo-relative uri (not a model: never opened as one)."""
        if ext not in IMAGE_EXTS:
            raise ValueError(f"unsupported image extension {ext!r}")
        d = self.models_dir(a.profileId).parent / "images"
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{self._check(a.assetId)}{ext}"
        f.write_bytes(data)
        return f.relative_to(self.library.parent.parent).as_posix()

    def open_image(self, a: Asset) -> ModelBlob | None:
        root = self.library.parent.resolve()
        for ref in a.imageRefs:
            f = (root.parent / ref).resolve()
            if f.is_relative_to(root) and f.suffix.lower() in IMAGE_EXTS and f.is_file():
                return ModelBlob(_file_chunks(f), f.name, IMAGE_EXTS[f.suffix.lower()], f.stat().st_size)
        return None

    def open_model(self, a: Asset) -> ModelBlob | None:
        """Resolve model.uri to a file strictly inside this store's root; None when absent or unsafe."""
        if not a.model or a.model.format == "box":
            return None
        root = self.library.parent.resolve()
        try:
            f = (root.parent / a.model.uri).resolve()
        except (OSError, ValueError):
            return None
        if not f.is_relative_to(root) or f.suffix.lower() not in MODEL_EXTS or not f.is_file():
            return None
        return ModelBlob(_file_chunks(f), f.name, MODEL_EXTS[f.suffix.lower()], f.stat().st_size)


def _file_chunks(f: Path, n: int = 1 << 16) -> Iterator[bytes]:
    with f.open("rb") as fh:
        while chunk := fh.read(n):
            yield chunk


Store = FileStore  # historical name; existing callers and tests keep working
