from pathlib import Path

from .identify import IMAGE_EXTS


def list_images(path) -> list[Path]:
    p = Path(path)
    if not p.is_dir():
        return []
    return sorted(f for f in p.rglob("*") if f.suffix.lower() in IMAGE_EXTS and f.is_file() and not f.is_symlink())
