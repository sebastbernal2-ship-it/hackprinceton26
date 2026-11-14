import re
from typing import Optional

from .models import Exchange

MAX_QUESTIONS = 3
FIRST_QUESTION = "What are you looking for?"

_FOLLOW_UPS = [
    ("Which city, Houston or Los Angeles?", lambda s: bool(re.search(r"\bhouston\b|\blos angeles\b|\bL\.?A\.?\b", s, re.I))),
    ("What is your budget for the build-out?", lambda s: bool(re.search(r"\$\s?\d|\b\d+(\.\d+)?\s?(k|grand|thousand|million)\b|\bbudget\b", s, re.I))),
    ("How many seats are you planning for?", lambda s: bool(re.search(r"\b\d+[\s-]*(seats?|seater|covers|guests|people)\b", s, re.I))),
    ("Anything the space must have?", lambda s: False),
]


def next_question(history: list[Exchange]) -> Optional[str]:
    if not history:
        return FIRST_QUESTION
    if len(history) >= MAX_QUESTIONS:
        return None
    said = " ".join(e.answer for e in history)
    asked = {e.question for e in history}
    for q, covered in _FOLLOW_UPS:
        if q not in asked and not covered(said):
            return q
    return None


_FURNITURE = [
    ("table", "Dining table", r"\b(dining\s*)?tables?\b|\bbooths?\b"),
    ("chair", "Chair", r"\bchairs?\b|\bseats?\b|\bstools?\b"),
    ("sofa", "Sofa", r"\bsofas?\b|\bcouches?\b|\blounges?\b"),
    ("counter", "Service counter", r"\bcounters?\b|\bbar\b|\bhost\s*stand\b|\bkitchen\b"),
    ("wall", "Interior wall", r"\bwalls?\b|\bpartition\b|\bdivider\b"),
]
_CYCLE = ["table", "chair", "sofa", "counter", "wall"]
_LABEL = {k: l for k, l, _ in _FURNITURE}


def tour_agent(message: str, placed_count: int) -> tuple[str, dict]:
    lower = message.strip().lower()
    named = next(((k, l) for k, l, p in _FURNITURE if re.search(p, message, re.I)), None)
    if re.search(r"\b(move|shift|slide|nudge|push)\b", lower) and placed_count > 0:
        direction = (
            "right" if re.search(r"\bright\b", lower)
            else "left" if re.search(r"\bleft\b", lower)
            else "back" if re.search(r"\b(back|backward|away)\b", lower)
            else "forward"
        )
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b", lower)
        meters = float(m.group(1)) if m else 1.0
        return f"Moving the last piece {direction} {meters:g} m.", {"type": "move", "direction": direction, "meters": meters}
    if not message.strip():
        return "Tell me what to place or move.", {"type": "clarify", "question": "What should I place in the room?"}
    kind = named[0] if named else _CYCLE[placed_count % len(_CYCLE)]
    label = named[1] if named else _LABEL[kind]
    return f"Placing a {label.lower()} in the room.", {"type": "add", "kind": kind, "label": label}
