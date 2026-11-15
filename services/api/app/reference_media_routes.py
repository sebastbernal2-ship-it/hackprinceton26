"""Reference media for a profile (photos or video of a reference restaurant), saved to a gitignored local folder.

POST /api/reference-media (multipart: files[], profileId)  -> saves each file under REFERENCE_MEDIA_DIR/<profileId>/ with a
server-generated name, streaming to disk (videos can be large). GET /api/reference-media?profileId= lists what is saved.
The files stay local (data/derived is gitignored); nothing here identifies objects, it only stores the media for review/extraction.
"""
import os
import re
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter()
ROOT = Path(__file__).resolve().parents[3]
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
MAX_FILES = 20
_PROFILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_KIND = {".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image", ".heic": "image",
         ".mp4": "video", ".mov": "video", ".webm": "video", ".m4v": "video"}
_MAGIC = {".jpg": [b"\xff\xd8\xff"], ".jpeg": [b"\xff\xd8\xff"], ".png": [b"\x89PNG\r\n\x1a\n"], ".webp": [b"RIFF"],
          ".heic": [], ".mp4": [], ".m4v": [], ".mov": [], ".webm": [b"\x1a\x45\xdf\xa3"]}


def _root() -> Path:
    return Path(os.environ.get("REFERENCE_MEDIA_DIR") or ROOT / "data" / "derived" / "reference-media")


def _head_ok(ext: str, head: bytes) -> bool:
    if ext in (".mp4", ".m4v", ".mov", ".heic"):
        return b"ftyp" in head[:16] or b"moov" in head[:16] or b"wide" in head[:16] or b"mdat" in head[:16]
    return any(head.startswith(m) for m in _MAGIC[ext]) and (ext != ".webp" or head[8:12] == b"WEBP")


@router.post("/api/reference-media")
async def upload(files: list[UploadFile] = File(default=[]), profileId: str = Form("cafe-demo")):
    if not _PROFILE.match(profileId or ""):
        raise HTTPException(status_code=422, detail="profileId must be 1-64 letters, digits, dot, dash or underscore")
    if not files:
        raise HTTPException(status_code=422, detail="upload at least one photo or video")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail=f"at most {MAX_FILES} files per upload")
    folder = _root() / profileId
    folder.mkdir(parents=True, exist_ok=True)
    saved, written = [], []
    try:
        for f in files:
            ext = Path(f.filename or "").suffix.lower()
            kind = _KIND.get(ext)
            if kind is None:
                raise HTTPException(status_code=415, detail=f"{ext or 'file'} is not a supported photo or video type")
            head = await f.read(64)
            if not _head_ok(ext, head):
                raise HTTPException(status_code=415, detail="file content does not match its type")
            limit = MAX_IMAGE_BYTES if kind == "image" else MAX_VIDEO_BYTES
            name = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}{ext}"
            path = folder / name
            written.append(path)
            size = len(head)
            with path.open("wb") as out:
                out.write(head)
                while chunk := await f.read(1024 * 1024):
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(status_code=413, detail=f"{kind} exceeds {limit // (1024 * 1024)} MB")
                    out.write(chunk)
            saved.append({"name": name, "kind": kind, "bytes": size, "profileId": profileId})
    except BaseException:
        for p in written:  # a rejected batch leaves nothing behind
            p.unlink(missing_ok=True)
        raise
    return {"saved": saved, "profileId": profileId, "note": "Saved locally for review; nothing has been identified yet."}


@router.get("/api/reference-media")
def listing(profileId: str = "cafe-demo"):
    if not _PROFILE.match(profileId or ""):
        raise HTTPException(status_code=422, detail="bad profileId")
    folder = _root() / profileId
    files = []
    if folder.is_dir():
        for p in sorted(folder.iterdir()):
            if p.is_file() and p.suffix.lower() in _KIND:
                files.append({"name": p.name, "kind": _KIND[p.suffix.lower()], "bytes": p.stat().st_size})
    return {"profileId": profileId, "files": files}
