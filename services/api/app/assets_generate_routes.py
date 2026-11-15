"""POST /api/assets/generate: text -> a draft catalog asset (rules table dims/clearance, estimated price ref, illustration).

The illustration is a deterministic local SVG. When OPENAI_API_KEY is set (read here, server side only, never returned
or logged) an image model draws it instead; any failure falls back to the SVG and says so in `notice`."""
import base64
import os
import sys
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from assets.generate import draft, svg_illustration  # noqa: E402
from . import assets_routes  # noqa: E402

router = APIRouter()
GENERATED_PROFILE = "generated"
OPENAI_URL = "https://api.openai.com/v1/images/generations"


class GenerateRequest(BaseModel):
    prompt: str
    profileId: str | None = None
    useImageModel: bool = True


def openai_image(prompt: str, key: str) -> bytes:
    """One image from the OpenAI images API as webp bytes. Raises RuntimeError with a key-free message."""
    body = {"model": os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1"), "size": "1024x1024", "quality": "low", "n": 1,
            "output_format": "webp", "output_compression": 80,
            "prompt": f"Clean product catalog illustration of {prompt}, single object, front three-quarter view, centred, plain light background, soft shadow, no text, no people."}
    try:
        r = httpx.post(OPENAI_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=90)
    except httpx.HTTPError as e:
        raise RuntimeError(f"image service unreachable ({type(e).__name__})") from None
    if r.status_code != 200:
        try:
            code = r.json()["error"]["code"]
        except (KeyError, TypeError, ValueError):
            code = None
        raise RuntimeError(f"image service answered {r.status_code}" + (f", {code}" if isinstance(code, str) and code.replace("_", "").isalnum() else ""))
    try:
        return base64.b64decode(r.json()["data"][0]["b64_json"], validate=True)
    except (KeyError, IndexError, ValueError, TypeError):
        raise RuntimeError("image service returned no image") from None


@router.post("/api/assets/generate", status_code=201)
def generate_asset(req: GenerateRequest):
    prompt = " ".join(req.prompt.split())
    if not 3 <= len(prompt) <= 80 or not prompt.isprintable():
        raise HTTPException(status_code=422, detail="describe the item in 3 to 80 characters, e.g. \"espresso machine\"")
    store = assets_routes.STORE
    pid = req.profileId or GENERATED_PROFILE
    try:
        asset, matched = draft(prompt, pid, lambda i: store.find_asset(i) is not None)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    notices = [] if matched else ["No sizing rule matched this item, so it uses a generic placeholder size and has no price. Edit the dimensions before relying on it."]
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    mode, data, ext = "svg", None, ".svg"
    if req.useImageModel and key:
        try:
            data, ext, mode = openai_image(prompt, key), ".webp", "openai"
        except RuntimeError as e:
            notices.append(f"Image model failed ({e}); showing the local illustration instead.")
    elif req.useImageModel:
        notices.append("No image model configured (OPENAI_API_KEY not set); showing the local illustration.")
    if data is None:
        data = svg_illustration(asset).encode()
    ref = store.put_image(asset, data, ext)
    asset = asset.model_copy(update={"imageRefs": [ref]})
    store.save(asset)
    return {"asset": asset.model_dump(mode="json"), "imageMode": mode, "notice": " ".join(notices),
            "priceNote": ("Estimated demo price: priced as catalog item " + asset.priceRef) if asset.priceRef else "No price: no similar catalog item."}


@router.get("/api/assets/{assetId}/image")
def get_image(assetId: str):
    blob = assets_routes.STORE.open_image(assets_routes._find(assetId))
    if blob is None:
        raise HTTPException(status_code=404, detail="image not found")
    return StreamingResponse(blob.chunks, media_type=blob.media_type, headers={
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"})
