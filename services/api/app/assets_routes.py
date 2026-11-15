"""/api/assets: catalog listing, CRUD and parametric variants. (Ingest lives in its own router.)"""
import sys
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from assets.glb import extrude_glb  # noqa: E402
from assets.models import Asset, Model3D  # noqa: E402
from assets.store import get_store  # noqa: E402
from assets.variants import make_variant  # noqa: E402

router = APIRouter()
STORE = get_store()  # FileStore, or MongoStore when MONGODB_URI is set; tests replace this


class VariantRequest(BaseModel):
    kind: str
    params: dict = {}
    profileId: str | None = None


def _e422(e: Exception):
    msg = e.errors(include_url=False, include_context=False) if isinstance(e, ValidationError) else str(e)
    raise HTTPException(status_code=422, detail=msg)


def _find(asset_id: str) -> Asset:
    try:
        a = STORE.find_asset(asset_id)
    except ValueError as e:
        _e422(e)
    if not a:
        raise HTTPException(status_code=404, detail="asset not found")
    return a


@router.get("/api/assets")
def list_assets(profileId: str | None = None, category: str | None = None):
    try:
        return [a.model_dump(mode="json") for a in STORE.list(profileId, category)]
    except ValueError as e:
        _e422(e)


# Declared before /{assetId}: POST /api/assets/ingest belongs to another router, and path order matters there.
@router.post("/api/assets", status_code=201)
def create_asset(body: dict = Body(...)):
    try:
        a = Asset.model_validate(body)
        if STORE.find_asset(a.assetId):
            raise HTTPException(status_code=409, detail="assetId already exists")
        STORE.save(a)
    except (ValidationError, ValueError) as e:
        _e422(e)
    return a.model_dump(mode="json")


@router.get("/api/assets/{assetId}")
def get_asset(assetId: str):
    cur = _find(assetId)
    return cur.model_dump(mode="json")


@router.get("/api/assets/{assetId}/model")
def get_model(assetId: str):
    """Stream the asset's GLB/OBJ from whichever backend holds it."""
    blob = STORE.open_model(_find(assetId))
    if blob is None:
        raise HTTPException(status_code=404, detail="model not found")
    headers = {"Content-Disposition": f'inline; filename="{blob.filename}"', "X-Content-Type-Options": "nosniff"}
    if blob.size is not None:
        headers["Content-Length"] = str(blob.size)
    return StreamingResponse(blob.chunks, media_type=blob.media_type, headers=headers)


@router.patch("/api/assets/{assetId}")
def patch_asset(assetId: str, patch: dict = Body(...)):
    cur = _find(assetId)
    if {"assetId", "profileId"} & patch.keys():
        raise HTTPException(status_code=422, detail="assetId and profileId cannot be patched")
    try:
        new = Asset.model_validate({**cur.model_dump(mode="json"), **patch})
    except ValidationError as e:
        _e422(e)
    STORE.replace(new)
    return new.model_dump(mode="json")


@router.post("/api/assets/{assetId}/variants", status_code=201)
def create_variant(assetId: str, req: VariantRequest):
    cur = _find(assetId)
    parent = cur
    # Never write generated files into the tracked library: no profile means the gitignored "scratch" profile.
    pid = req.profileId or parent.profileId or "scratch"
    try:
        v = make_variant(parent, req.kind, req.params)
        v = v.model_copy(update={"profileId": pid})
        v = v.model_copy(update={"model": Model3D(uri=STORE.put_model(v, extrude_glb(v.footprint, v.dims.h)), format="glb")})
        v = Asset.model_validate(v.model_dump())
        STORE.save(v)
    except (ValidationError, ValueError, KeyError) as e:
        _e422(e if not isinstance(e, KeyError) else ValueError(f"missing param {e}"))
    return v.model_dump(mode="json")
