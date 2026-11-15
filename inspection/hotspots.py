"""Gemini defect-hotspot provider (second provider beside the Anthropic path in vision.py).

Call pattern ported from the user's Deja-View integrations/guide/gemini.mjs + prompts.mjs: JSON-schema
response, box_2d [ymin,xmin,ymax,xmax] on a 0-1000 grid, low media resolution, low thinking, fallback model on
429/503, mock mode when there is no key. Humor/voice prompts dropped; this is a dry restaurant defect prompt.
Keys by env name only: GEMINI_API_KEY. Models via MODEL_SPATIAL / MODEL_FAST (defaults below).
Findings are model OBSERVATIONS of what is visible in one captured image, never confirmed defects.
"""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from typing import Protocol

from .schema import CATEGORIES, coerce_finding

IMAGE_EXTS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
DEFAULT_MODELS = {"primary": "gemini-3.8-flash", "fallback": "gemini-3.5-flash-lite"}  # Deja-View's spatial/fast
MAX_HOTSPOTS = 8
BUSY = re.compile(r"\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|high demand", re.I)

DEFECT_SYSTEM = f"""You assist a prospective RESTAURANT tenant doing a pre-lease walkthrough. You see ONE image of a
real, captured interior. Identify up to {MAX_HOTSPOTS} visible conditions that imply repair or maintenance cost or
architectural/operational inefficiency for a restaurant: water stains, ceiling damage, cracked or uneven floors,
old or undersized electrical panels, exposed wiring, HVAC age or venting, missing grease hood/exhaust provisions,
plumbing and floor drains, wall and finish condition, egress or accessibility obstructions, awkward layout.
Rules:
- Report ONLY what is visible in this image. Never infer surfaces or rooms that are not shown. If nothing is
  visible, return an empty list.
- An image cannot prove hidden defects (behind walls, above ceilings, under floors). Say what is visible
  (evidence_visible) and what an on-site inspector must verify (inspector_must_verify).
- box_2d is [ymin, xmin, ymax, xmax] on a 0 to 1000 grid, origin top-left, tight around the visible evidence.
- label: 1 to 5 words, factual. severity: low, medium, high, or unknown if the image does not support a rating.
- category is one of: {", ".join(sorted(CATEGORIES))}.
Return JSON with key "hotspots": a list of objects with label, box_2d, category, severity, evidence_visible,
inspector_must_verify. Plain, neutral wording."""

HOTSPOTS_SCHEMA = {"type": "object", "properties": {"hotspots": {"type": "array", "items": {
    "type": "object", "properties": {
        "label": {"type": "string"}, "box_2d": {"type": "array", "items": {"type": "integer"}},
        "category": {"type": "string", "enum": sorted(CATEGORIES)},
        "severity": {"type": "string", "enum": ["low", "medium", "high", "unknown"]},
        "evidence_visible": {"type": "string"}, "inspector_must_verify": {"type": "string"}},
    "required": ["label", "box_2d", "category", "severity", "evidence_visible", "inspector_must_verify"]}}},
    "required": ["hotspots"]}


class JsonVisionClient(Protocol):
    def generate_json(self, model: str, system: str, text: str, image: bytes, mime: str, schema: dict,
                      low_res: bool) -> dict: ...


class GeminiClient:
    """google-genai wrapper; the SDK is imported on first call so mock mode and tests need no SDK."""

    def __init__(self, api_key: str):
        self._key, self._c = api_key, None

    def generate_json(self, model, system, text, image, mime, schema, low_res=True):
        if self._c is None:
            from google import genai
            self._c = genai.Client(api_key=self._key)
        from google.genai import types
        cfg = types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json", response_schema=schema,
            temperature=0.3, max_output_tokens=2000,
            media_resolution="MEDIA_RESOLUTION_LOW" if low_res else "MEDIA_RESOLUTION_MEDIUM",
            thinking_config=types.ThinkingConfig(thinking_level="low"))
        r = self._c.models.generate_content(
            model=model, config=cfg,
            contents=[types.Content(role="user", parts=[types.Part(text=text),
                                                        types.Part.from_bytes(data=image, mime_type=mime)])])
        return parse_json(r.text)


def parse_json(text: str):
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "").strip(), flags=re.I)
    return json.loads(t)


def default_gemini_client() -> GeminiClient | None:
    """GeminiClient when GEMINI_API_KEY is set (env or .env; never printed), else None = mock mode."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    key = os.environ.get("GEMINI_API_KEY")
    return GeminiClient(key) if key else None


def _models() -> tuple[str, str]:
    return (os.environ.get("MODEL_SPATIAL") or DEFAULT_MODELS["primary"],
            os.environ.get("MODEL_FAST") or DEFAULT_MODELS["fallback"])


def _call(client, image, mime, low_res, models) -> dict:
    primary, fallback = models
    args = (DEFECT_SYSTEM, "Identify defect hotspots in this restaurant space image.", image, mime,
            HOTSPOTS_SCHEMA, low_res)
    try:
        return client.generate_json(primary, *args)
    except Exception as e:  # only a busy/used-up model hands over; anything else is a real error
        if not BUSY.search(str(e)) or fallback == primary:
            raise
        return client.generate_json(fallback, *args)


def box_to_region(box) -> dict | None:
    """[ymin,xmin,ymax,xmax] on 0-1000 -> normalized {x,y,w,h}; None when malformed or empty."""
    if not (isinstance(box, (list, tuple)) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)):
        return None
    y0, x0, y1, x1 = (min(1000.0, max(0.0, float(v))) / 1000 for v in box)
    if y1 <= y0 or x1 <= x0:
        return None
    return {"x": x0, "y": y0, "w": round(x1 - x0, 6), "h": round(y1 - y0, 6)}


def hotspot_to_finding(h: dict, fid: str, image_name: str) -> dict | None:
    raw = {"category": h.get("category"), "title": str(h.get("label", "")).strip(),
           "description": h.get("evidence_visible", ""), "severity": h.get("severity"),
           "modelConfidence": 0.0, "region": box_to_region(h.get("box_2d")), "canConfirmFromImagery": False,
           "verificationStep": h.get("inspector_must_verify", "")}
    f = coerce_finding(raw, fid, "panorama", image_name)
    if f and f["evidence"]["region"] is None:
        return None  # a pin needs a box; a boxless item cannot be anchored
    return f


def detect_defects(image: Path, client: JsonVisionClient | None = None, low_res: bool = True, prefix: str = "gem",
                   models: tuple[str, str] | None = None) -> dict:
    """Return {findings, mode: 'live'|'mock', notice}. client None -> mock mode (one clearly labelled stub)."""
    image = Path(image)
    if client is None:
        stub = {"label": "MOCK defect", "box_2d": [400, 400, 600, 600], "category": "other", "severity": "unknown",
                "evidence_visible": "MOCK: no GEMINI_API_KEY; not an observation of this image.",
                "inspector_must_verify": "Mock output; run with a key."}
        return {"findings": [hotspot_to_finding(stub, f"{prefix}-1", image.name)], "mode": "mock",
                "notice": "MOCK MODE (no GEMINI_API_KEY): synthetic stub, NOT from this property."}
    mime = IMAGE_EXTS[image.suffix.lower()]
    res = _call(client, image.read_bytes(), mime, low_res, models or _models())
    items = res.get("hotspots") if isinstance(res, dict) else None
    findings = []
    for h in (items if isinstance(items, list) else [])[:MAX_HOTSPOTS]:
        f = hotspot_to_finding(h, f"{prefix}-{len(findings) + 1}", image.name) if isinstance(h, dict) else None
        if f:
            findings.append(f)
    return {"findings": findings, "mode": "live",
            "notice": "Model observations from one image; not confirmed defects. An on-site inspector must verify."}
