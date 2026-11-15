"""Asset contract (pydantic) + validation rules. JSON Schema lives in contracts/asset.schema.json."""
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parents[1]
FIN_CATALOG = ROOT / "data" / "financial" / "catalog.json"

Category = Literal["counter", "prep_table", "range", "oven", "fridge", "freezer_display", "sink", "hood", "dish",
                   "seating", "table", "storage", "other"]
Source = Literal["library", "uploaded", "extracted", "generated"]
VariantKind = Literal["base", "corner_l", "island", "wall_run", "scaled", "mirrored"]
DimsStatus = Literal["measured", "catalog", "estimated"]
Range = tuple[float, float]


@lru_cache(maxsize=1)
def financial_ids() -> frozenset[str]:
    d = json.loads(FIN_CATALOG.read_text())
    return frozenset(e["id"] for k in ("equipment", "reskinEquipment") for e in d.get(k, []))


class Dims(BaseModel):
    w: float
    d: float
    h: float

    @field_validator("w", "d", "h")
    @classmethod
    def positive(cls, v):
        if not v > 0:
            raise ValueError("dimension must be > 0")
        return v


class DimRanges(BaseModel):
    w: Range
    d: Range
    h: Range


class Size(Dims):
    label: str


class Clearance(BaseModel):
    front: float = Field(ge=0)
    sides: float = Field(ge=0)
    back: float = Field(ge=0)


class Model3D(BaseModel):
    uri: str
    format: Literal["glb", "obj", "box"]


class Provenance(BaseModel):
    origin: str
    retrievedAt: str | None = None
    notes: str = ""
    confidence: float | None = Field(default=None, ge=0, le=1)
    box_2d: list[float] | None = None


class Style(BaseModel):
    """Aesthetics read from photos by a vision model: always INFERRED (a guess from imagery), never a spec."""
    materials: list[str] = []
    colors: list[str] = []  # #rrggbb
    finish: str | None = None
    styleTags: list[str] = []
    inferred: bool = True

    @field_validator("colors")
    @classmethod
    def _hex(cls, v):
        for c in v:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", c):
                raise ValueError(f"colour {c!r} is not a #rrggbb hex value")
        return v


Pt = tuple[float, float]


def _orient(a: Pt, b: Pt, c: Pt) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_seg(a: Pt, b: Pt, p: Pt) -> bool:
    return min(a[0], b[0]) - 1e-12 <= p[0] <= max(a[0], b[0]) + 1e-12 and min(a[1], b[1]) - 1e-12 <= p[1] <= max(a[1], b[1]) + 1e-12


def segments_intersect(a: Pt, b: Pt, c: Pt, d: Pt) -> bool:
    o1, o2, o3, o4 = _orient(a, b, c), _orient(a, b, d), _orient(c, d, a), _orient(c, d, b)
    if ((o1 > 1e-12 and o2 < -1e-12) or (o1 < -1e-12 and o2 > 1e-12)) and \
       ((o3 > 1e-12 and o4 < -1e-12) or (o3 < -1e-12 and o4 > 1e-12)):
        return True
    return ((abs(o1) <= 1e-12 and _on_seg(a, b, c)) or (abs(o2) <= 1e-12 and _on_seg(a, b, d)) or
            (abs(o3) <= 1e-12 and _on_seg(c, d, a)) or (abs(o4) <= 1e-12 and _on_seg(c, d, b)))


def polygon_area(ring: list[Pt]) -> float:
    """Signed shoelace area of a closed ring (positive = counter-clockwise)."""
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)) / 2


def check_footprint(fp: list[Pt]) -> None:
    if len(fp) < 4:
        raise ValueError("footprint needs at least 3 distinct points plus the closing point")
    if tuple(fp[0]) != tuple(fp[-1]):
        raise ValueError("footprint must be closed (last point equals first)")
    n = len(fp) - 1  # edges
    if len({tuple(p) for p in fp[:-1]}) != n:
        raise ValueError("footprint has duplicate vertices")
    for i in range(n):  # adjacent edges must not fold back on themselves
        p0, p1, p2 = fp[i], fp[(i + 1) % n], fp[(i + 2) % n]
        if abs(_orient(p0, p1, p2)) <= 1e-12 and \
                (p1[0] - p0[0]) * (p2[0] - p1[0]) + (p1[1] - p0[1]) * (p2[1] - p1[1]) < 0:
            raise ValueError("footprint is self-intersecting (edge folds back)")
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if segments_intersect(fp[i], fp[i + 1], fp[j], fp[j + 1]):
                raise ValueError("footprint is self-intersecting")
    if abs(polygon_area(fp)) <= 1e-12:
        raise ValueError("footprint has zero area")


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assetId: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_.\-]+$")
    name: str
    category: Category
    source: Source
    parentAssetId: str | None = None
    variantKind: VariantKind | None = None
    dims: Dims
    dimsStatus: DimsStatus
    dimRanges: DimRanges | None = None
    allowedSizes: list[Size] | None = None
    footprint: list[Pt]
    clearance: Clearance
    clearanceBasis: str
    model: Model3D | None = None
    imageRefs: list[str] = []
    profileId: str | None = None
    tags: list[str] = []
    priceRef: str | None = None
    provenance: Provenance
    style: Style | None = None
    status: Literal["draft", "confirmed"] = "draft"

    @field_validator("footprint")
    @classmethod
    def _fp(cls, v):
        check_footprint(v)
        return v

    @model_validator(mode="after")
    def _rules(self):
        if self.dimRanges:
            for ax in "wdh":
                lo, hi = getattr(self.dimRanges, ax)
                if lo > hi or lo <= 0:
                    raise ValueError(f"dimRanges.{ax} must be 0 < min <= max")
                if not lo - 1e-9 <= getattr(self.dims, ax) <= hi + 1e-9:
                    raise ValueError(f"dimRanges.{ax} must bracket dims.{ax}")
        if self.dimsStatus == "measured" and self.source == "generated" and self.variantKind != "mirrored":
            raise ValueError("generated dims are derived, never 'measured'")
        if self.dimsStatus == "measured" and self.source == "extracted" and not self.provenance.notes:
            raise ValueError("measured dims from extraction need provenance.notes naming the measurement")
        if not self.clearanceBasis.strip():
            raise ValueError("clearanceBasis is required (clearances are labelled assumptions)")
        if self.variantKind not in (None, "base") and not self.parentAssetId:
            raise ValueError("a variant needs parentAssetId")
        if self.priceRef is not None and self.priceRef not in financial_ids():
            raise ValueError(f"priceRef {self.priceRef!r} is not in data/financial/catalog.json")
        xs, ys = [p[0] for p in self.footprint], [p[1] for p in self.footprint]
        if max(xs) - min(xs) > self.dims.w + 1e-6 or max(ys) - min(ys) > self.dims.d + 1e-6:
            raise ValueError("footprint extent exceeds dims.w/dims.d")
        return self
