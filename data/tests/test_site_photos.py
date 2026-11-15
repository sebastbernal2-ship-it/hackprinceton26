import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "data"))
import build_site_photos as B  # noqa: E402


def test_builds_resized_aerial_preview_per_property_and_skips_other_files(tmp_path):
    src, out = tmp_path / "images", tmp_path / "photos"
    src.mkdir()
    Image.new("RGB", (2000, 2000), (10, 120, 30)).save(src / "123.jpg")
    (src / "123.meta.json").write_text("{}")  # metadata beside the image must be ignored
    (src / "notes.jpg").write_bytes(b"not a property id")
    done = B.build(src, out, 900)
    assert done == ["123"]
    with Image.open(out / "123" / "aerial.jpg") as im:
        assert im.size == (900, 900) and im.format == "JPEG"
    assert not (out / "notes").exists()
