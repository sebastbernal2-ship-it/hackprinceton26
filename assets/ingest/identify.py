"""Identify equipment/furniture in images with a vision model and propose DRAFT Assets.

Same pattern as inspection/vision.py (Anthropic Messages API, key from env/.env, never printed). Every proposal is
status 'draft'; nothing is auto-confirmed. Dimensions are ALWAYS 'estimated' from imagery, except:
  - explicit full measurement supplied by the user (w, d, h) -> 'measured' (method: user-stated);
  - a reference scale (e.g. 'the door in frame is 2.03 m tall') only changes the notes: the numbers remain model estimates.
Provider order: OpenAI-compatible (VISION_BASE_URL + VISION_MODEL, optional VISION_API_KEY; e.g. a local vLLM server),
else Anthropic (ANTHROPIC_API_KEY), else no provider.
  - no provider / no images -> mode 'fixture': clearly labelled sample proposals (never real, the catalog refuses to save them);
  - a provider was configured but the call failed (HTTP error, timeout, malformed or empty output) -> mode 'failed',
    NO proposals and a failure notice. A failure is never dressed up as a successful extraction.
"""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Protocol

from .common import CATEGORIES, finite_pos, make_asset

MODEL_ID = "claude-sonnet-5-5"  # Anthropic default
MAX_VIDEO_BYTES = 60 * 1024 * 1024
VIDEO_EXTS = (".mp4", ".webm", ".mov")
IMAGE_EXTS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES = 6
MAX_VIDEO_FRAMES = MAX_IMAGES
FIXTURE = Path(__file__).parent / "fixtures" / "sample_proposals.json"

SYSTEM_PROMPT = f"""You identify RESTAURANT fit-out equipment and furniture in one or more photos of the SAME item(s).
Propose catalog entries. Rules:
- Report only items visibly present. Never invent. If none are identifiable return [].
- category must be one of: {', '.join(CATEGORIES)}.
- dims_m: your best-guess overall size in metres {{"w": width/length, "d": depth, "h": height}}, from visual proportions
  and any stated reference scale. These are ESTIMATES; use null for a dimension you cannot judge.
- confidence: your own 0-1 confidence in the identification and dims; NOT a calibrated probability.
- style_tags: short style notes visible in the image (e.g. "industrial", "rustic").
- materials: visible materials (e.g. "brushed steel", "butcher block"); colors: dominant colours as #rrggbb hex strings;
  finish: one short phrase (e.g. "matte", "polished"), or null. These are INFERRED from the photo; omit what you cannot see.
- box_2d: [ymin, xmin, ymax, xmax] on a 0-1000 grid for the item in the first image where it appears, or null.
- Do NOT give prices.
Return ONLY a JSON array of objects with keys: name, category, dims_m, confidence, style_tags, materials, colors, finish, box_2d, notes.
No prose, no code fences."""


class VisionError(RuntimeError):
    """A configured vision provider failed. Always surfaces as mode 'failed', never as samples."""


class IdentifyClient(Protocol):
    def identify(self, images: list[tuple[bytes, str]], system: str, user_text: str) -> str: ...


class AnthropicIdentify:
    provider = "anthropic"

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


_PROPOSAL_SCHEMA = {
    "type": "object", "required": ["proposals"], "additionalProperties": False,
    "properties": {"proposals": {"type": "array", "items": {
        "type": "object", "required": ["name", "category"],
        "properties": {
            "name": {"type": "string"}, "category": {"type": "string", "enum": list(CATEGORIES)},
            "dims_m": {"type": "object", "properties": {k: {"type": ["number", "null"]} for k in "wdh"}},
            "confidence": {"type": ["number", "null"]},
            "style_tags": {"type": "array", "items": {"type": "string"}},
            "materials": {"type": "array", "items": {"type": "string"}},
            "colors": {"type": "array", "items": {"type": "string"}},
            "finish": {"type": ["string", "null"]},
            "box_2d": {"type": ["array", "null"], "items": {"type": "number"}},
            "notes": {"type": ["string", "null"]}}}}},
}
_OBJECT_HINT = ' Wrap the array as {"proposals": [...]}.'


class OpenAICompatIdentify:
    """OpenAI-compatible /chat/completions client (vLLM, llama.cpp server, OpenAI...). Images go as data URIs.

    Retries (bounded) on timeouts, connection errors, HTTP 429/5xx. Any final failure raises VisionError."""
    provider = "openai-compatible"

    def __init__(self, base_url: str, model: str, api_key: str | None = None, timeout: float = 120.0,
                 retries: int = 2, backoff: float = 0.5, json_mode: str = "schema"):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model, self.key, self.timeout = model, api_key, timeout
        self.retries, self.backoff, self.json_mode = max(0, retries), backoff, json_mode

    def _post(self, body: dict) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            if attempt:
                time.sleep(self.backoff * 2 ** (attempt - 1))
            req = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:  # noqa: S310 (operator-configured URL)
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code in (400, 422):
                    raise VisionError(f"HTTP {e.code}") from e  # not retryable
                if e.code != 429 and e.code < 500:
                    raise VisionError(f"HTTP {e.code}") from e
                last = e
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                last = e
            except json.JSONDecodeError as e:
                raise VisionError("provider returned a non-JSON HTTP body") from e
        raise VisionError(f"provider unreachable or failing after {self.retries + 1} attempts: {type(last).__name__}")

    def identify(self, images, system, user_text):
        content = [{"type": "image_url", "image_url": {"url": f"data:{mt};base64,{base64.b64encode(b).decode()}"}}
                   for b, mt in images]
        content.append({"type": "text", "text": user_text + _OBJECT_HINT})
        body = {"model": self.model, "temperature": 0, "max_tokens": 2000,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
        modes = {"schema": {"type": "json_schema", "json_schema": {"name": "proposals", "schema": _PROPOSAL_SCHEMA}},
                 "object": {"type": "json_object"}}
        if self.json_mode in modes:
            body["response_format"] = modes[self.json_mode]
        try:
            data = self._post(body)
        except VisionError as e:
            if "response_format" not in body or not str(e).startswith(("HTTP 400", "HTTP 422")):
                raise
            body.pop("response_format")  # server does not support constrained output; ask in prose only
            data = self._post(body)
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise VisionError("provider response has no choices[0].message.content") from e
        if not isinstance(text, str) or not text.strip():
            raise VisionError("provider returned empty content")
        return text


def default_client() -> IdentifyClient | None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    base, model = os.environ.get("VISION_BASE_URL"), os.environ.get("VISION_MODEL")
    if base and model:
        def f(name, d):
            try:
                return float(os.environ.get(name, d))
            except ValueError:
                return d
        return OpenAICompatIdentify(base, model, os.environ.get("VISION_API_KEY") or None,
                                    timeout=f("VISION_TIMEOUT", 120.0), retries=int(f("VISION_RETRIES", 2)))
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        return AnthropicIdentify(key)
    except ImportError:
        return None


def parse_json_array(text: str) -> list | None:
    """The proposals array from model text (bare array, or an object with 'proposals'); None if unparseable."""
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip())
    m = re.search(r"\[.*\]", t, re.S)
    for cand in (t, m.group(0) if m else None):
        try:
            d = json.loads(cand) if cand else None
        except json.JSONDecodeError:
            continue
        if isinstance(d, dict) and isinstance(d.get("proposals"), list):
            return d["proposals"]
        if isinstance(d, list):
            return d
    return None


def _box(b):
    if isinstance(b, list) and len(b) == 4 and all(isinstance(v, (int, float)) and 0 <= v <= 1000 for v in b):
        return b
    return None


_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _strs(v, n, width=40):
    return [str(t).strip()[:width] for t in v if isinstance(t, (str, int, float)) and str(t).strip()][:n] if isinstance(v, list) else []


def _style(it: dict) -> dict | None:
    style = {"materials": _strs(it.get("materials"), 6), "colors": [c.lower() for c in _strs(it.get("colors"), 6, 7) if _HEX.match(c)],
             "finish": str(it["finish"]).strip()[:40] if isinstance(it.get("finish"), str) and it["finish"].strip() else None,
             "styleTags": _strs(it.get("style_tags"), 8), "inferred": True}
    return style if any(style[k] for k in ("materials", "colors", "finish", "styleTags")) else None


def proposals_from_model_text(text: str, profile_id=None, reference_scale: str | None = None,
                              measured: dict | None = None, image_names=(), origin: str | None = None,
                              source_note: str = "") -> list[dict]:
    """Raises ValueError when the text is not a parseable proposals array (an empty array is a valid 'nothing found')."""
    parsed = parse_json_array(text)
    if parsed is None:
        raise ValueError("model output was not a JSON array of proposals")
    items = [i for i in parsed if isinstance(i, dict) and i.get("name")]
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
                       dims_status=status, source="uploaded", origin=origin or f"vision:{MODEL_ID}", profile_id=profile_id,
                       tags=_strs(it.get("style_tags"), 8), image_refs=list(image_names),
                       notes=f"{method}. {source_note}Model note: {str(it.get('notes') or '')[:300]}")
        a["provenance"]["confidence"] = conf  # model's own number, not a probability
        a["provenance"]["box_2d"] = _box(it.get("box_2d"))
        st = _style(it)
        if st:
            a["style"] = st
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


def extract_video_frames(video: Path, out_dir: Path, count: int = MAX_VIDEO_FRAMES, long_side: int = 1280):
    """Sample up to `count` well-spread sharp frames (capture.frames, OpenCV only) -> (JPEG paths, times in seconds).
    Raises ValueError for an undecodable clip."""
    import cv2
    from capture.frames import sample_frames
    try:
        frames, idx, meta = sample_frames(video, count)
    except RuntimeError as e:
        raise ValueError(f"cannot decode video: {e}") from e
    fps = meta.fps or 30.0
    paths, times = [], []
    for n, (rgb, i) in enumerate(zip(frames, idx)):
        h, w = rgb.shape[:2]
        if max(h, w) > long_side:
            s = long_side / max(h, w)
            rgb = cv2.resize(rgb, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
        if not ok:
            continue
        p = out_dir / f"frame{n}.jpg"
        p.write_bytes(buf.tobytes())
        paths.append(p)
        times.append(round(i / fps, 2))
    if not paths:
        raise ValueError("cannot decode video: no frames")
    return paths, times


def identify(images: list[Path], client: IdentifyClient | None = None, profile_id: str | None = None,
             reference_scale: str | None = None, measured: dict | None = None,
             frame_times: list[float] | None = None) -> dict:
    """Return {proposals, mode, notice}. mode: 'live' (provider answered with a parseable array, possibly empty),
    'failed' (provider configured but the call/parse failed; proposals empty) or 'fixture' (no provider / no images)."""
    images = list(images)[:MAX_IMAGES]
    if client is None or not images:
        why = "no vision provider configured (set VISION_BASE_URL+VISION_MODEL, or ANTHROPIC_API_KEY)" if client is None else "no images supplied"
        return {"proposals": load_fixture(profile_id), "mode": "fixture",
                "notice": f"SAMPLE DATA ({why}): illustrative proposals, NOT identified from your images."}
    provider = getattr(client, "provider", "vision")
    model = getattr(client, "model", MODEL_ID)
    payload, names = [], []
    for p in images:
        if p.stat().st_size > MAX_IMAGE_BYTES:
            raise ValueError(f"{p.name} exceeds {MAX_IMAGE_BYTES} bytes")
        payload.append((p.read_bytes(), IMAGE_EXTS[p.suffix.lower()]))
        names.append(p.name)
    source_note = ""
    if frame_times:
        source_note = "Extracted from video frames at t=" + ", ".join(f"{t:g}s" for t in frame_times) + ". "
    user = "Identify the item(s) and return the JSON array specified."
    if reference_scale:
        user += f" Reference scale supplied by the user: {reference_scale}."
    try:
        text = client.identify(payload, SYSTEM_PROMPT, user)
        props = proposals_from_model_text(text, profile_id, reference_scale, measured,
                                          [] if frame_times else names, f"vision:{model}", source_note)
    except Exception as e:  # noqa: BLE001
        detail = str(e) if isinstance(e, (VisionError, ValueError)) else type(e).__name__
        return {"proposals": [], "mode": "failed", "provider": provider, "model": model,
                "notice": f"IDENTIFICATION FAILED ({provider} {model}: {detail[:200]}). No assets were extracted from your "
                          "media and nothing was invented; check the vision provider and try again."}
    what = f"{len(frame_times)} video frame(s)" if frame_times else f"{len(names)} image(s)"
    return {"proposals": props, "mode": "live", "provider": provider, "model": model,
            "notice": (f"Draft proposals from {what} ({provider}, {model}). Dimensions, materials, colours and finish are "
                       "inferred estimates unless marked measured; nothing is confirmed. Review before adding to the catalog.")}
