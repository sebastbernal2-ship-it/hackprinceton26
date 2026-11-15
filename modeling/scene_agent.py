#!/usr/bin/env python3
r"""
scene_agent.py - the model side of walk.html's "ask Fio to rearrange the room" (OpenAI function calling).

Fio's local command reader (fio_commands.js) handles plain commands in the browser with no model at all. This module is the
optional enhancement for freer phrasing: walk.html runs the agent loop in the browser, because the scene (furniture,
collisions, floors) lives there. It sends the conversation to POST /api/agent, executes the tool calls the model makes against
the 3D scene (the same sceneTools the local commands use), and sends the results back. This module makes the Chat Completions
call (REST, no SDK). The key, model, system prompt and tool definitions stay on this side, so the browser can only ask scene
questions, never use the key for anything else.

Served by the Next app's app/api/agent/route.ts (and run_all.py's serve step). Credentials: OPENAI_API_KEY in the environment
(or .env); OPENAI_MODEL overrides the model. A missing key, 401, 429 / no credits, or a network error comes back as an error
status, and the caller falls back to the local answerer without showing a failure.

The browser keeps the conversation as simple content blocks (text, image, tool_use, tool_result); this module translates them to
OpenAI messages and back.
"""
import json, os, urllib.error, urllib.request

MODEL = os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"
URL = os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1/chat/completions"
MAX_TURN_MESSAGES = 120                    # a conversation longer than this must be restarted from the page

SYSTEM = """You are Fio. You rearrange a real, 3D-scanned building while the user walks through it in first person (walk.html).
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
- "Clear the room" means clear_room (the pieces shrink away; undo restores them). The catalogue has sofas, armchairs, chairs, stools,
  tables, cabinets and shelves, no kitchen equipment: say so instead of inventing an id.
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
    _tool("clear_room", "Remove every piece standing on the user's floor level with a shrink-away transition, leaving an empty room.", {}),
    _tool("restore_object", "Put a piece back exactly where it was scanned (undoes moves and removal of that piece).",
          {"id": _id}),
    _tool("list_catalog", "List catalogue furniture that can be added (id, name, category, size in metres).",
          {"category": {"type": ["string", "null"], "description": "Sofas, Armchairs, Chairs, Tables, Storage, Outdoor; null = all"}}),
    _tool("add_from_catalog", "Add a new catalogue item at (x, y) facing yaw_deg. Returns its new id.",
          {"catalog_id": {"type": "string"}, "x": _num, "y": _num, "yaw_deg": _num}),
    _tool("get_view", "Take a new screenshot of the user's view with piece ids drawn on it, to check your changes.", {}),
]


OPENAI_TOOLS = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "strict": True,
                                                   "parameters": t["input_schema"]}} for t in TOOLS]


def _data_url(src):
    return f"data:{src['media_type']};base64,{src['data']}"


def _to_openai(messages):
    """Browser content blocks -> OpenAI chat messages. Tool results may carry screenshots; OpenAI tool messages are text only,
    so images ride in a user message right after the tool messages."""
    out = [{"role": "system", "content": SYSTEM}]
    for m in messages:
        blocks = m["content"] if isinstance(m["content"], list) else [{"type": "text", "text": str(m["content"])}]
        if m["role"] == "assistant":
            text = "\n".join(b["text"] for b in blocks if b.get("type") == "text")
            calls = [{"id": b["id"], "type": "function", "function": {"name": b["name"], "arguments": json.dumps(b.get("input") or {})}}
                     for b in blocks if b.get("type") == "tool_use"]
            msg = {"role": "assistant", "content": text or None}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
            continue
        parts, images = [], []
        for b in blocks:
            t = b.get("type")
            if t == "text":
                parts.append({"type": "text", "text": b["text"]})
            elif t == "image":
                parts.append({"type": "image_url", "image_url": {"url": _data_url(b["source"])}})
            elif t == "tool_result":
                c = b.get("content")
                items = c if isinstance(c, list) else [{"type": "text", "text": "" if c is None else str(c)}]
                text = "\n".join(i["text"] for i in items if i.get("type") == "text")
                images += [{"type": "image_url", "image_url": {"url": _data_url(i["source"])}} for i in items if i.get("type") == "image"]
                out.append({"role": "tool", "tool_call_id": b["tool_use_id"], "content": ("Error: " + text) if b.get("is_error") else (text or "ok")})
        if images:
            out.append({"role": "user", "content": [{"type": "text", "text": "Screenshot from get_view:"}] + images})
        if parts:
            out.append({"role": "user", "content": parts})
    return out


def _from_openai(d):
    """Chat Completions response -> browser content blocks + stop_reason."""
    choices = d.get("choices") or []
    if not choices:
        return [], "refusal"
    ch = choices[0]
    msg = ch.get("message") or {}
    content = []
    if msg.get("content"):
        content.append({"type": "text", "text": msg["content"]})
    for c in msg.get("tool_calls") or []:
        try:
            args = json.loads(c["function"].get("arguments") or "{}")
        except ValueError:
            args = {}
        content.append({"type": "tool_use", "id": c["id"], "name": c["function"]["name"], "input": args})
    fr = ch.get("finish_reason")
    stop = ("tool_use" if any(b["type"] == "tool_use" for b in content) else "max_tokens" if fr == "length"
            else "refusal" if fr == "content_filter" or msg.get("refusal") else "end_turn")
    return content, stop


def handle(body):
    """One OpenAI call for walk.html's agent loop. body = {"messages": [...]}; returns (status, JSON-able dict)."""
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages or len(messages) > MAX_TURN_MESSAGES:
        return 400, {"error": "messages must be a non-empty list (start a new chat if it got too long)"}
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return 503, {"error": "No OpenAI key: set OPENAI_API_KEY and restart the server"}
    req = {"model": MODEL, "messages": _to_openai(messages), "tools": OPENAI_TOOLS, "tool_choice": "auto", "max_tokens": 2000}
    r = urllib.request.Request(URL, data=json.dumps(req).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                               method="POST")
    try:
        with urllib.request.urlopen(r, timeout=120) as f:
            d = json.loads(f.read())
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error", {})
            msg = err.get("message", "")
        except Exception:                                          # noqa: BLE001
            msg = ""
        if e.code in (401, 403):
            return 401, {"error": "The OpenAI API key was rejected - check OPENAI_API_KEY"}
        if e.code == 429:                                          # rate limit or insufficient_quota: the caller falls back to local logic
            return 429, {"error": "The OpenAI account is rate limited or out of credits"}
        return 502, {"error": f"OpenAI API error {e.code}: {msg[:200]}"}
    except (urllib.error.URLError, TimeoutError) as e:
        return 502, {"error": f"Could not reach the OpenAI API ({e})"}
    content, stop = _from_openai(d)
    return 200, {"content": content, "stop_reason": stop, "model": d.get("model", MODEL), "usage": d.get("usage")}


if __name__ == "__main__":
    print(json.dumps([t["name"] for t in TOOLS]))
