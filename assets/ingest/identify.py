"""Identify equipment/furniture in images with a vision model and propose DRAFT Assets.

Same pattern as inspection/vision.py (Anthropic Messages API, key from env/.env, never printed). Every proposal is
status 'draft'; nothing is auto-confirmed. Dimensions are ALWAYS 'estimated' from imagery, except:
  - explicit full measurement supplied by the user (w, d, h) -> 'measured' (method: user-stated);
  - a reference scale (e.g. 'the door in frame is 2.03 m tall') only changes the notes: the numbers remain model estimates.
No key / no images / all calls failed -> mode 'fixture' with clearly labelled sample proposals (not real).
"""
import base64
import json
import os
import re
from pathlib import Path
from typing import Protocol

from .common import CATEGORIES, finite_pos, make_asset

MODEL_ID = "claude-sonnet-5-5"
IMAGE_EXTS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES = 6
FIXTURE = Path(__file__).parent / "fixtures" / "sample_proposals.json"

SYSTEM_PROMPT = f"""You identify RESTAURANT fit-out equipment and furniture in one or more photos of the SAME item(s).
Propose catalog entries. Rules:
- Report only items visibly present. Never invent. If none are identifiable return [].
- category must be one of: {', '.join(CATEGORIES)}.
- dims_m: your best-guess overall size in metres {{"w": width/length, "d": depth, "h": height}}, from visual proportions
  and any stated reference scale. These are ESTIMATES; use null for a dimension you cannot judge.
- confidence: your own 0-1 confidence in the identification and dims; NOT a calibrated probability.
- style_tags: short material/style notes visible in the image (e.g. "brushed steel", "butcher block").
- box_2d: [ymin, xmin, ymax, xmax] on a 0-1000 grid for the item in the first image where it appears, or null.
- Do NOT give prices.
Return ONLY a JSON array of objects with keys: name, category, dims_m, confidence, style_tags, box_2d, notes.
No prose, no code fences."""


class IdentifyClient(Protocol):
    def identify(self, images: list[tuple[bytes, str]], system: str, user_text: str) -> str: ...


class AnthropicIdentify:
    def __init__(self, api_key: str, model: str = MODEL_ID):
        import anthropic
        self._c = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def identify(self, images, system, user_text):
        content = [{"type": "image", "source": {"type": "base64", "media_type": mt,
                                                "data": base64.b64encode(b).decode()}} for b, mt in images]
        content.append({"type": "text", "text": user_text})
        msg = self._c.messages.create(model=self.model, max_tokens=2000, system=system,
                                      messages=[{"role": "user", "content": content}])
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def default_client() -> IdentifyClient | None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        return AnthropicIdentify(key)
    except ImportError:
        return None


def parse_json_array(text: str) -> list:
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip())
    m = re.search(r"\[.*\]", t, re.S)
    for cand in (t, m.group(0) if m else None):
        try:
            d = json.loads(cand) if cand else None
        except json.JSONDecodeError:
            continue
        if isinstance(d, list):
            return d
    return []


def _box(b):
    if isinstance(b, list) and len(b) == 4 and all(isinstance(v, (int, float)) and 0 <= v <= 1000 for v in b):
        return b
    return None


def proposals_from_model_text(text: str, profile_id=None, reference_scale: str | None = None,
                              measured: dict | None = None, image_names=()) -> list[dict]:
    items = [i for i in parse_json_array(text) if isinstance(i, dict) and i.get("name")]
    out = []
    for it in items:
        dd = it.get("dims_m") if isinstance(it.get("dims_m"), dict) else {}
        dims = tuple(finite_pos(dd.get(k)) for k in ("w", "d", "h"))
        status, method = "estimated", "Visual estimate from image(s) by a vision model"
        if reference_scale:
            method += f"; user-supplied reference scale: {reference_scale!r} (still an estimate, not a measurement)"
        if len(items) == 1 and measured and all(finite_pos(measured.get(k)) for k in "wdh"):
            dims, status, method = tuple(float(measured[k]) for k in "wdh"), "measured", "User-stated explicit measurement"
        if None in dims:  # unjudged dimension: keep honest zeros, flagged
            method += "; one or more dimensions could not be judged (0.0 = unknown)"
            dims = tuple(d or 0.0 for d in dims)
        conf = it.get("confidence")
        conf = float(conf) if isinstance(conf, (int, float)) and 0 <= conf <= 1 else None
        a = make_asset(name=str(it["name"])[:80], category=str(it.get("category", "other")), dims=dims,
                       dims_status=status, source="uploaded", origin=f"vision:{MODEL_ID}", profile_id=profile_id,
                       tags=[str(t)[:40] for t in (it.get("style_tags") or [])][:8], image_refs=list(image_names),
                       notes=f"{method}. Model note: {str(it.get('notes') or '')[:300]}")
        a["provenance"]["confidence"] = conf  # model's own number, not a probability
        a["provenance"]["box_2d"] = _box(it.get("box_2d"))
        out.append(a)
    return out


def load_fixture(profile_id=None) -> list[dict]:
    items = json.loads(FIXTURE.read_text())["proposals"]
    out = []
    for it in items:
        a = make_asset(name=it["name"], category=it["category"], dims=tuple(it["dims_m"]), dims_status="estimated",
                       source="uploaded", origin="fixture", profile_id=profile_id, tags=["sample"] + it["tags"],
                       notes="SAMPLE DATA: illustrative fixture, not identified from any real image.",
                       asset_id=f"fixture-{it['id']}")
        out.append(a)
    return out


def identify(images: list[Path], client: IdentifyClient | None = None, profile_id: str | None = None,
             reference_scale: str | None = None, measured: dict | None = None) -> dict:
    """Return {proposals, mode, notice}. mode 'live' only if the client returned >=1 parseable proposal."""
    images = list(images)[:MAX_IMAGES]
    if client is None or not images:
        why = "no ANTHROPIC_API_KEY/SDK" if client is None else "no images supplied"
        return {"proposals": load_fixture(profile_id), "mode": "fixture",
                "notice": f"SAMPLE DATA ({why}): illustrative proposals, NOT identified from your images."}
    payload, names = [], []
    for p in images:
        if p.stat().st_size > MAX_IMAGE_BYTES:
            raise ValueError(f"{p.name} exceeds {MAX_IMAGE_BYTES} bytes")
        payload.append((p.read_bytes(), IMAGE_EXTS[p.suffix.lower()]))
        names.append(p.name)
    user = "Identify the item(s) and return the JSON array specified."
    if reference_scale:
        user += f" Reference scale supplied by the user: {reference_scale}."
    try:
        text = client.identify(payload, SYSTEM_PROMPT, user)
        props = proposals_from_model_text(text, profile_id, reference_scale, measured, names)
    except Exception as e:  # noqa: BLE001
        return {"proposals": load_fixture(profile_id), "mode": "fixture",
                "notice": f"SAMPLE DATA (vision call failed: {type(e).__name__}): illustrative proposals, NOT from your images."}
    return {"proposals": props, "mode": "live",
            "notice": (f"Draft proposals from {len(names)} image(s) ({MODEL_ID}). Dimensions are estimates unless marked "
                       "measured; nothing is confirmed. Review before adding to the catalog.")}
