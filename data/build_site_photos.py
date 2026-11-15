#!/usr/bin/env python3
"""Preview photos for the shortlist: resized copies of the Vexcel aerial crops already fetched by triage/aerial/fetch.py.

Writes data/derived/site-photos/<propertyId>/aerial.jpg (what services/api/app/loader.py serves at /api/site-photos/<id>/aerial.jpg).
These are AERIAL views of the property, not interior photos; the UI labels them as such. Local and gitignored (sponsor imagery).

    python data/build_site_photos.py [--data-root .] [--width 900]
"""
import argparse
from pathlib import Path


def resize_to(src: Path, dst: Path, width: int) -> tuple[int, int]:
    from PIL import Image
    with Image.open(src) as im:
        im = im.convert("RGB")
        h = round(im.height * width / im.width)
        im.resize((width, h), Image.LANCZOS).save(dst, "JPEG", quality=84, optimize=True)
        return width, h


def build(images_dir: Path, out_dir: Path, width: int = 900) -> list[str]:
    done = []
    for src in sorted(Path(images_dir).glob("*.jpg")):
        pid = src.stem
        if not pid.isdigit():
            continue
        d = Path(out_dir) / pid
        d.mkdir(parents=True, exist_ok=True)
        resize_to(src, d / "aerial.jpg", width)
        done.append(pid)
    return done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=".")
    ap.add_argument("--width", type=int, default=900)
    a = ap.parse_args()
    root = Path(a.data_root)
    ids = build(root / "data/derived/triage/aerial/images", root / "data/derived/site-photos", a.width)
    print(f"{len(ids)} aerial previews written to {root / 'data/derived/site-photos'}")


if __name__ == "__main__":
    main()
