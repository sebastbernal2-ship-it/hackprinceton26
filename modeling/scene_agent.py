#!/usr/bin/env python3
r"""
scene_agent.py - the Gemini side of walk.html's "ask the AI to rearrange the room".

walk.html runs the agent loop in the browser, because the scene (furniture, collisions, floors) lives there: it sends
the conversation to POST /api/agent, executes the tool calls the model makes against the 3D scene, and sends the results
back. This module makes the actual Gemini API call (REST, no SDK). The API key, model, system prompt and tool definitions stay
on this side, so the browser can only ask scene questions, never use the key for anything else.

Served by run_all.py's serve step (http://localhost:8000/api/agent). Credentials: GEMINI_API_KEY (or GOOGLE_API_KEY) in
.env (run_all.py loads it); GEMINI_MODEL overrides the model.

The browser keeps the conversation as simple content blocks (text, image, tool_use, tool_result); this module translates
them to Gemini `contents` and back. Each model turn also carries a {"type": "gemini_parts"} block with Gemini's raw parts,
which the browser echoes back unchanged so thought signatures are replayed exactly.
"""
import json, os, urllib.error, urllib.request

MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
BASE_URL = os.environ.get("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
MAX_TURN_MESSAGES = 120                    # a conversation longer than this must be restarted from the page

SYSTEM = """You rearrange a real, 3D-scanned building while the user walks through it in first person (walk.html).
You change the scene only through the tools; every change happens live in front of the user and can be undone with Ctrl+Z.

The scene
- Coordinates are metres in the scan's frame: x = east, y = north, z = up. Yaw is in degrees, counter-clockwise from east
  (0 = facing east, 90 = north). Each piece's (x, y) is the centre of its footprint.
- Scanned pieces have numeric ids and were cut automatically from the scan. Their labels are rough guesses (a styling chair
  may be called "cabinet", a floor patch "coffee table"), so trust the numbered screenshot over the label when they disagree.
  Their orientation is the scan's, so "front" of a scanned piece is not known; reason about it from the image.
- Catalogue items (ids like "added-3") are real furniture models the user (or you) added from the catalogue.
- Pieces only move on the floor plane; tools keep them standing on the floor automatically.
- Every user turn comes with a screenshot of what the user sees, with the id of each nearby piece drawn on it, and a text
  summary: where the user stands and faces, and the pieces around them with positions and sizes. "Left", "right", "in front"
  and "behind" in the user's words mean as seen from where they stand unless they say otherwise.

How to work
- Act; don't ask for confirmation unless the request is truly ambiguous (several equally likely pieces). Prefer the
  relational tools (place_next_to, move_relative, push_against_wall, rotate_object face_*) over raw coordinates.
- Every change returns a check: whether the piece fits (no overlap with walls or other furniture), what blocks it, and the
  clearance to the nearest wall. If it does not fit, fix it (move it a little, turn it, pick another spot) before moving on.
  Keep walkways at least 0.9 m wide where people walk.
- For layout requests ("make this a cafe", "seat 8 people", "clear a path to the window") plan the whole layout first, then
  place pieces; add catalogue items with add_from_catalog when the room needs furniture it does not have (list_catalog shows
  what exists). Remove only what the request implies.
- When you are done, call get_view if you want to check the result, then answer in one or two plain sentences saying what you
  changed. Mention anything you could not do."""

_num = {"type": "number"}
_nnum = {"type": ["number", "null"]}
_id = {"type": "string", "description": "piece id from the scene summary / screenshot (e.g. \"12\" or \"added-3\")"}


def _tool(name, desc, props, required=None):
    return {"name": name, "description": desc, "strict": True,
            "input_schema": {"type": "object", "properties": props, "required": required or list(props),
                             "additionalProperties": False}}


TOOLS = [
    _tool("describe_scene", "List the pieces around the user (or around a point) with ids, labels, positions, sizes, rooms, "
          "and which were moved, removed or added. Use it after the user walks somewhere new or to see further away.",
          {"radius_m": {"type": "number", "description": "search radius, 1-30 m"},
           "x": {**_nnum, "description": "centre x, null = the user's position"},
           "y": {**_nnum, "description": "centre y, null = the user's position"}}),
    _tool("move_object", "Move a piece to an absolute position (x, y) and optionally set its yaw.",
          {"id": _id, "x": _num, "y": _num, "yaw_deg": {**_nnum, "description": "null keeps the current yaw"}}),
    _tool("move_relative", "Move a piece relative to the user's current view: forward = away from the user along their "
          "line of sight, right = to the user's right. Also turns it by turn_deg (counter-clockwise, seen from above).",
          {"id": _id, "forward_m": _num, "right_m": _num, "turn_deg": _num}),
    _tool("place_next_to", "Put a piece beside another piece (the anchor), with a gap between their edges. Sides are as "
          "seen from where the user stands.",
          {"id": _id, "anchor_id": _id,
           "side": {"type": "string", "enum": ["left", "right", "in_front", "behind"]},
           "gap_m": {"type": "number", "description": "space between the two pieces' edges, e.g. 0.1"},
           "face": {"type": "string", "enum": ["keep", "same_as_anchor", "toward_anchor", "away_from_anchor", "toward_user"]}}),
    _tool("push_against_wall", "Slide a piece in a direction until it meets a wall or another piece, stopping gap_m short.",
          {"id": _id,
           "direction": {"type": "string", "enum": ["forward", "back", "left", "right", "north", "south", "east", "west"],
                         "description": "forward/back/left/right are relative to the user's view"},
           "gap_m": _num}),
    _tool("rotate_object", "Turn a piece. mode: set = absolute yaw_deg; by = turn by degrees (counter-clockwise); "
          "face_object = turn so its yaw points at target_id; face_user = turn toward the user.",
          {"id": _id, "mode": {"type": "string", "enum": ["set", "by", "face_object", "face_user"]},
           "degrees": {**_nnum, "description": "for set / by"},
           "target_id": {"type": ["string", "null"], "description": "for face_object"}}),
    _tool("remove_object", "Remove a piece from the scene (the floor and wall behind it are filled in).", {"id": _id}),
    _tool("restore_object", "Put a piece back exactly where it was scanned (undoes moves and removal of that piece).",
          {"id": _id}),
    _tool("list_catalog", "List catalogue furniture that can be added (id, name, category, size in metres).",
          {"category": {"type": ["string", "null"], "description": "Sofas, Armchairs, Chairs, Tables, Storage, Outdoor; null = all"}}),
    _tool("add_from_catalog", "Add a new catalogue item at (x, y) facing yaw_deg. Returns its new id.",
          {"catalog_id": {"type": "string"}, "x": _num, "y": _num, "yaw_deg": _num}),
    _tool("get_view", "Take a new screenshot of the user's view with piece ids drawn on it, to check your changes.", {}),
]


def _schema(s):
    """JSON schema -> Gemini's OpenAPI-subset schema (nullable instead of type lists, no additionalProperties)."""
    if not isinstance(s, dict):
        return s
    out = {}
    for k, v in s.items():
        if k in ("additionalProperties", "strict"):
            continue
        if k == "type" and isinstance(v, list):
            out["type"] = next(t for t in v if t != "null")
            if "null" in v:
                out["nullable"] = True
        elif k == "properties":
            out[k] = {n: _schema(p) for n, p in v.items()}
        elif k == "items":
            out[k] = _schema(v)
        else:
            out[k] = v
    return out


GEMINI_TOOLS = [{"functionDeclarations": [
    {"name": t["name"], "description": t["description"],
     **({"parameters": _schema(t["input_schema"])} if t["input_schema"]["properties"] else {})} for t in TOOLS]}]


def _to_gemini(messages):
    """Browser content blocks -> Gemini contents."""
    names, contents = {}, []
    for m in messages:
        blocks = m["content"] if isinstance(m["content"], list) else [{"type": "text", "text": str(m["content"])}]
        if m["role"] == "assistant":
            raw = next((b["parts"] for b in blocks if b.get("type") == "gemini_parts"), None)
            for b in blocks:
                if b.get("type") == "tool_use":
                    names[b["id"]] = b["name"]
            parts = raw or ([{"text": b["text"]} for b in blocks if b.get("type") == "text"] +
                            [{"functionCall": {"name": b["name"], "args": b.get("input") or {}}}
                             for b in blocks if b.get("type") == "tool_use"])
            contents.append({"role": "model", "parts": parts or [{"text": ""}]})
            continue
        parts, images = [], []
        for b in blocks:
            t = b.get("type")
            if t == "text":
                parts.append({"text": b["text"]})
            elif t == "image":
                parts.append({"inlineData": {"mimeType": b["source"]["media_type"], "data": b["source"]["data"]}})
            elif t == "tool_result":
                c = b.get("content")
                items = c if isinstance(c, list) else [{"type": "text", "text": "" if c is None else str(c)}]
                text = "\n".join(i["text"] for i in items if i.get("type") == "text")
                images += [{"inlineData": {"mimeType": i["source"]["media_type"], "data": i["source"]["data"]}}
                           for i in items if i.get("type") == "image"]       # screenshots ride after the responses
                parts.append({"functionResponse": {"name": names.get(b["tool_use_id"], "unknown"),
                                                   "response": {"error": text} if b.get("is_error") else {"result": text}}})
        contents.append({"role": "user", "parts": parts + images})
    return contents


def _from_gemini(d, turn):
    """Gemini response -> browser content blocks + stop_reason."""
    cands = d.get("candidates") or []
    if not cands:
        return [], "refusal"                                       # prompt blocked
    cand = cands[0]
    parts = (cand.get("content") or {}).get("parts") or []
    content, calls = [{"type": "gemini_parts", "parts": parts}], 0
    for k, p in enumerate(parts):
        if p.get("thought"):
            continue
        if "functionCall" in p:
            calls += 1
            content.append({"type": "tool_use", "id": f"call_{turn}_{k}", "name": p["functionCall"]["name"],
                            "input": p["functionCall"].get("args") or {}})
        elif p.get("text"):
            content.append({"type": "text", "text": p["text"]})
    fr = cand.get("finishReason")
    stop = ("tool_use" if calls else "max_tokens" if fr == "MAX_TOKENS"
            else "refusal" if fr in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII") else "end_turn")
    return content, stop


def handle(body):
    """One Gemini call for walk.html's agent loop. body = {"messages": [...]}; returns (status, JSON-able dict)."""
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages or len(messages) > MAX_TURN_MESSAGES:
        return 400, {"error": "messages must be a non-empty list (start a new chat if it got too long)"}
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return 503, {"error": "No Gemini key: put GEMINI_API_KEY=... in .env and restart the server"}
    req = {"systemInstruction": {"parts": [{"text": SYSTEM}]}, "contents": _to_gemini(messages), "tools": GEMINI_TOOLS,
           "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}}, "generationConfig": {"maxOutputTokens": 16000}}
    r = urllib.request.Request(f"{BASE_URL}/models/{MODEL}:generateContent", data=json.dumps(req).encode(),
                               headers={"Content-Type": "application/json", "x-goog-api-key": key}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=180) as f:
            d = json.loads(f.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {}).get("message", "")
        except Exception:                                          # noqa: BLE001
            msg = ""
        if e.code in (401, 403):
            return 401, {"error": f"The Gemini API key was rejected - check GEMINI_API_KEY in .env ({msg})"}
        if e.code == 429:
            return 429, {"error": f"Rate limited by the Gemini API - wait a moment and try again ({msg})"}
        return 502, {"error": f"Gemini API error {e.code}: {msg}"}
    except (urllib.error.URLError, TimeoutError) as e:
        return 502, {"error": f"Could not reach the Gemini API ({e})"}
    content, stop = _from_gemini(d, len(messages))
    return 200, {"content": content, "stop_reason": stop, "model": d.get("modelVersion", MODEL),
                 "usage": d.get("usageMetadata")}


if __name__ == "__main__":
    print(json.dumps([t["name"] for t in TOOLS]))
