"""File-backed catalog: assets/library/*.json (committed seed) and assets/profiles/<profileId>/*.json (gitignored)."""
import json
import re
from pathlib import Path

from .models import Asset

ROOT = Path(__file__).resolve().parent
_SAFE = re.compile(r"^[A-Za-z0-9_.\-]+$")


class Store:
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
