import sys
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from assets.ingest import identify as ident  # noqa: E402

router = APIRouter()
UPLOAD_DIR = _ROOT / "assets" / "ingest" / ".uploads"  # gitignored
MAX_FILES = ident.MAX_IMAGES
_MAGIC = {".jpg": (b"\xff\xd8\xff",), ".jpeg": (b"\xff\xd8\xff",), ".png": (b"\x89PNG\r\n\x1a\n",),
          ".webp": (b"RIFF",)}


def get_client():
    return ident.default_client()


def _num(v):
    if v in (None, ""):
        return None
    try:
        return float(v)
    except ValueError:
        raise HTTPException(status_code=422, detail="measured dimensions must be numbers in metres")


@router.post("/api/assets/ingest")
async def ingest(image: list[UploadFile] = File(default=[]), referenceScale: str | None = Form(None),
                 profileId: str | None = Form(None), measuredW: str | None = Form(None),
                 measuredD: str | None = Form(None), measuredH: str | None = Form(None)):
    if not image:
        raise HTTPException(status_code=422, detail="upload at least one image")
    if len(image) > MAX_FILES:
        raise HTTPException(status_code=422, detail=f"at most {MAX_FILES} images")
    if profileId is not None and len(profileId) > 128:
        raise HTTPException(status_code=422, detail="profileId too long")

    exts = [Path(f.filename or "").suffix.lower() for f in image]
    is_video = any(e in ident.VIDEO_EXTS for e in exts)
    if is_video and len(image) != 1:
        raise HTTPException(status_code=422, detail="upload either one video or up to 6 images, not a mix")

    # Validate the whole batch before writing anything, so a bad later file leaves no partial upload behind.
    payloads: list[tuple[str, bytes]] = []
    for f, ext in zip(image, exts):
        # client filename is used only to pick an allowed extension; stored name is server-generated (no traversal)
        if is_video:
            data = await f.read(ident.MAX_VIDEO_BYTES + 1)
            if len(data) > ident.MAX_VIDEO_BYTES:
                raise HTTPException(status_code=413, detail=f"video exceeds {ident.MAX_VIDEO_BYTES // (1024 * 1024)} MB")
            ok = data[:4] == b"\x1a\x45\xdf\xa3" if ext == ".webm" else data[4:8] == b"ftyp"
            if not ok:
                raise HTTPException(status_code=415, detail="file content does not match its video type")
            payloads.append((ext, data))
            continue
        if ext not in ident.IMAGE_EXTS:
            raise HTTPException(status_code=415, detail="only .jpg, .jpeg, .png, .webp images or .mp4, .webm, .mov video are accepted")
        data = await f.read(ident.MAX_IMAGE_BYTES + 1)
        if len(data) > ident.MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail=f"image exceeds {ident.MAX_IMAGE_BYTES} bytes")
        if not any(data.startswith(m) for m in _MAGIC[ext]) or (ext == ".webp" and data[8:12] != b"WEBP"):
            raise HTTPException(status_code=415, detail="file content does not match its image type")
        payloads.append((ext, data))

    measured = {k: _num(v) for k, v in (("w", measuredW), ("d", measuredD), ("h", measuredH)) if v not in (None, "")}
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="batch-", dir=UPLOAD_DIR) as temp_dir:  # removed on success AND failure
        paths: list[Path] = []
        frame_times = None
        if is_video:
            ext, data = payloads[0]
            video = Path(temp_dir) / f"clip{ext}"
            video.write_bytes(data)
            frames_dir = Path(temp_dir) / "frames"
            frames_dir.mkdir()
            try:
                paths, frame_times = ident.extract_video_frames(video, frames_dir)
            except ImportError:
                raise HTTPException(status_code=503, detail="video upload needs opencv-python-headless on the server")
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
        else:
            for ext, data in payloads:
                path = Path(temp_dir) / f"{len(paths)}{ext}"
                path.write_bytes(data)
                paths.append(path)
        result = ident.identify(paths, get_client(), profileId, referenceScale, measured or None, frame_times)
    if frame_times:
        result["source"] = "video"
        result["frames"] = [{"t": t} for t in frame_times]
    # The request images are deliberately temporary and are not served later; do not return dangling file references.
    for proposal in result.get("proposals", []):
        proposal["imageRefs"] = []
    return result
