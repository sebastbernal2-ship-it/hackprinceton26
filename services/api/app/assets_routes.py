"""/api/assets: catalog listing, CRUD and parametric variants. (Ingest lives in its own router.)"""
import json
import sys
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from assets.models import Asset  # noqa: E402
from assets.store import Store  # noqa: E402
from assets.variants import make_variant, write_variant_model  # noqa: E402

router = APIRouter()
STORE = Store()  # tests replace this with a Store on a tmp dir


class VariantRequest(BaseModel):
    kind: str
    params: dict = {}
    profileId: str | None = None


def _e422(e: Exception):
    msg = e.errors(include_url=False, include_context=False) if isinstance(e, ValidationError) else str(e)
    raise HTTPException(status_code=422, detail=msg)


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
        if a.provenance.origin == "fixture" or a.assetId.startswith("fixture-"):
            raise HTTPException(status_code=422, detail="sample/fixture proposals are not identifications and cannot be saved")
        if STORE.find(a.assetId):
            raise HTTPException(status_code=409, detail="assetId already exists")
        STORE.save(a)
    except (ValidationError, ValueError) as e:
        _e422(e)
    return a.model_dump(mode="json")


@router.get("/api/assets/{assetId}")
def get_asset(assetId: str):
    try:
        f = STORE.find(assetId)
    except ValueError as e:
        _e422(e)
    if not f:
        raise HTTPException(status_code=404, detail="asset not found")
    return f[0].model_dump(mode="json")


@router.patch("/api/assets/{assetId}")
def patch_asset(assetId: str, patch: dict = Body(...)):
    try:
        f = STORE.find(assetId)
    except ValueError as e:
        _e422(e)
    if not f:
        raise HTTPException(status_code=404, detail="asset not found")
    cur, path = f
    if {"assetId", "profileId"} & patch.keys():
        raise HTTPException(status_code=422, detail="assetId and profileId cannot be patched")
    try:
        new = Asset.model_validate({**cur.model_dump(mode="json"), **patch})
    except ValidationError as e:
        _e422(e)
    path.write_text(json.dumps(new.model_dump(mode="json"), indent=2) + "\n")
    return new.model_dump(mode="json")


@router.post("/api/assets/{assetId}/variants", status_code=201)
def create_variant(assetId: str, req: VariantRequest):
    try:
        f = STORE.find(assetId)
    except ValueError as e:
        _e422(e)
    if not f:
        raise HTTPException(status_code=404, detail="asset not found")
    parent = f[0]
    # Never write generated files into the tracked library: no profile means the gitignored "scratch" profile.
    pid = req.profileId or parent.profileId or "scratch"
    try:
        v = make_variant(parent, req.kind, req.params)
        v = v.model_copy(update={"profileId": pid})
        md = STORE.models_dir(pid)
        v = write_variant_model(v, md, (md / f"{v.assetId}.glb").relative_to(STORE.library.parent.parent).as_posix())
        v = Asset.model_validate(v.model_dump())
        STORE.save(v)
    except (ValidationError, ValueError, KeyError) as e:
        _e422(e if not isinstance(e, KeyError) else ValueError(f"missing param {e}"))
    return v.model_dump(mode="json")
