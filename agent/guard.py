"""Prompt-injection and citation guardrails. Tool results are data; every brief number must trace to a cited result."""
import json
import re

INJECTION = re.compile(
    r"(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|system)\b[^.\n]{0,40}\b(instruction|prompt|rule|message)s?"
    r"|\b(you (must|should|are now)|new instructions?|system prompt|developer message)\b"
    r"|\b(call|run|invoke|execute|use)\b[^.\n]{0,20}\b(save_brief|rerun_plan|make_checklist|tool)\b"
    r"|<\s*/?\s*(system|assistant|tool_use|instructions?)\s*>", re.I)
REDACTION = "[REDACTED: instruction-like text found inside tool data; treated as data and not followed]"


def sanitize(obj, hits: list | None = None, path: str = ""):
    """Return a copy of a JSON-like result with instruction-like strings replaced; hits gets (path, snippet)."""
    hits = hits if hits is not None else []
    if isinstance(obj, str):
        if INJECTION.search(obj):
            hits.append((path or "$", obj[:80]))
            return REDACTION
        return obj
    if isinstance(obj, dict):
        return {k: sanitize(v, hits, f"{path}.{k}") for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v, hits, f"{path}[{i}]") for i, v in enumerate(obj)]
    return obj


_NUM = re.compile(r"(?<![\w.])\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|%)?", re.I)


def numbers_in(text: str) -> list[tuple[float, int, str]]:
    """(value, decimals, suffix) for each numeric token. '250k' -> 250000."""
    out = []
    for m in _NUM.finditer(text):
        raw = m.group(1).replace(",", "")
        try:
            v = float(raw)
        except ValueError:
            continue
        suf = (m.group(2) or "").lower()
        dec = len(raw.split(".")[1]) if "." in raw else 0
        out.append((v * {"k": 1e3, "m": 1e6}.get(suf, 1), dec, suf))
    return out


def _flat_numbers(obj, acc: set):
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        acc.add(float(obj))
    elif isinstance(obj, str):
        for v, _, _ in numbers_in(obj):
            acc.add(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            _flat_numbers(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _flat_numbers(v, acc)


def supported(num: float, dec: int, pool: set) -> bool:
    tol = 0.5 * 10 ** -dec if dec else 0.5
    return any(abs(num - p) <= 1e-9 or round(p, dec) == num or (abs(num - p) <= tol and dec) for p in pool)


def check_claim(claim: dict, results: dict, goal: str = "") -> tuple[bool, str]:
    """A claim is {text, cites:[resultId]}. Ok only if it cites known results and every number in the text
    appears in them (rounded to the stated decimals, or as k/m shorthand within 0.5%).
    Numbers the owner typed in the goal are their own input and are allowed without a citation."""
    cites = claim.get("cites") or []
    if not cites:
        return False, "no citation"
    missing = [c for c in cites if c not in results]
    if missing:
        return False, f"unknown result id(s): {missing}"
    pool: set = set()
    for c in cites:
        _flat_numbers(results[c], pool)
    for c in ([goal] if goal else []):
        _flat_numbers(c, pool)
    for v, dec, suf in numbers_in(str(claim.get("text", ""))):
        if suf in ("k", "m"):
            ok = any(p and abs(v - p) / abs(p) <= 0.005 for p in pool)
        else:
            ok = supported(v, dec, pool)
        if not ok:
            return False, f"number {v:g} not found in cited results {cites}"
    return True, ""


def dumps(obj) -> str:
    return json.dumps(obj, default=str, sort_keys=True)
