"""Provider-pluggable vision analysis of interior images for restaurant-fit-out repair/inefficiency risks.

Findings are model OBSERVATIONS from imagery, never confirmed defects. modelConfidence is the model's own
stated number, not a calibrated probability. Hidden defects cannot be proven from images; every finding
carries a verificationStep for an on-site inspector.
"""
import base64
import json
import os
import re
from pathlib import Path
from typing import Callable, Protocol

from .schema import coerce_finding

MODEL_ID = "claude-sonnet-5-5"
IMAGE_EXTS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
FIXTURE = Path(__file__).parent / "fixtures" / "sample_findings.json"

SYSTEM_PROMPT = """You are a cautious pre-lease walkthrough assistant for a prospective RESTAURANT tenant.
You see ONE interior image (a panorama or a view cropped from one). List visible things that could cause
repair/maintenance cost or operational inefficiency for a restaurant: water stains, ceiling tile damage,
cracked or uneven flooring, an old/undersized electrical panel, exposed wiring, HVAC age/venting, signs of
missing or absent grease hood/exhaust infrastructure, plumbing and floor drains, wall/finish condition,
accessibility or egress obstructions, and architectural/layout inefficiencies.
Rules:
- Report ONLY what is visibly supported by the image. Never invent items. If nothing is visible, return [].
- An image cannot prove hidden defects (behind walls, above ceilings, under floors). For each finding say
  what an on-site inspector must verify and whether imagery alone could confirm it (canConfirmFromImagery).
- severity is "low", "medium" or "high" only if the image supports it; otherwise "unknown".
- modelConfidence is your own 0-1 confidence that the observation is correct; it is NOT a probability.
- category must be one of: plumbing, electrical, hvac, flooring, ceiling_water_damage, walls_finishes,
  structural, kitchen_infrastructure, egress_accessibility, layout_inefficiency, other.
- region is the approximate normalized box {"x","y","w","h"} (0-1, origin top-left) or null.
Return ONLY a JSON array of objects with keys: category, title, description, severity, modelConfidence,
region, canConfirmFromImagery, verificationStep. No prose, no code fences."""


class VisionClient(Protocol):
    def analyze(self, image_bytes: bytes, media_type: str, system: str) -> str: ...


class AnthropicClient:
    def __init__(self, api_key: str, model: str = MODEL_ID):
        import anthropic
        self._c = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def analyze(self, image_bytes: bytes, media_type: str, system: str) -> str:
        msg = self._c.messages.create(
            model=self.model, max_tokens=2000, system=system,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                             "data": base64.b64encode(image_bytes).decode()}},
                {"type": "text", "text": "List the findings as the JSON array specified."}]}])
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def default_client() -> VisionClient | None:
    """AnthropicClient if ANTHROPIC_API_KEY is set (env or .env, never printed) and the SDK imports."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        return AnthropicClient(key)
    except ImportError:
        return None


def list_images(path: str | Path) -> list[Path]:
    p = Path(path)
    if not p.is_dir():
        return []
    return sorted(f for f in p.rglob("*") if f.suffix.lower() in IMAGE_EXTS and f.is_file())


def parse_findings_json(text: str) -> list[dict]:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        data = json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", t, re.S)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    return data if isinstance(data, list) else []


def analyze_image(client: VisionClient, image: Path, prefix: str = "vis") -> list[dict]:
    if image.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError(f"{image.name} exceeds {MAX_IMAGE_BYTES} bytes; crop/downscale it first")
    text = client.analyze(image.read_bytes(), IMAGE_EXTS[image.suffix.lower()], SYSTEM_PROMPT)
    out = []
    for i, raw in enumerate(parse_findings_json(text)):
        f = coerce_finding(raw, f"{prefix}-{i + 1}", "panorama", image.name)
        if f:
            out.append(f)
    return out


def load_fixture() -> list[dict]:
    return json.loads(FIXTURE.read_text())["findings"]


def run_vision(images: list[Path], client: VisionClient | None = None, max_images: int = 6,
               on_error: Callable[[Path, Exception], None] | None = None) -> dict:
    """Return {findings, mode, notice}. mode 'live' only if a client analyzed >=1 image; else 'fixture'."""
    images = list(images)[:max_images]
    if client is None or not images:
        why = "no ANTHROPIC_API_KEY/SDK" if client is None else "no images available"
        return {"findings": load_fixture(), "mode": "fixture",
                "notice": f"SAMPLE DATA ({why}): synthetic illustrative findings, NOT from this property."}
    findings, ok = [], 0
    for n, img in enumerate(images, 1):
        try:
            findings += analyze_image(client, img, prefix=f"vis{n}")
            ok += 1
        except Exception as e:  # keep going; one bad image must not sink the run
            if on_error:
                on_error(img, e)
    if ok == 0:
        return {"findings": load_fixture(), "mode": "fixture",
                "notice": "SAMPLE DATA (all image analyses failed): synthetic findings, NOT from this property."}
    return {"findings": findings, "mode": "live",
            "notice": f"Model observations from {ok}/{len(images)} images ({MODEL_ID}). Not confirmed defects; "
                      "an on-site inspector must verify each item. modelConfidence is not a probability."}
