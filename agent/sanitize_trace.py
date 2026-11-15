"""Mask property identifiers in a recorded agent trace so it can be committed and shown publicly.

Masks street addresses and listing/property ids (consistently, to ids in the reserved range 900001+). Everything else is
kept as recorded, including dollar figures, counts, statuses and wording, so the replay still shows what the agent did.
The unmasked recording stays local (gitignored) and is preferred when present.

Usage: python -m agent.sanitize_trace in.json out.json
"""
import json
import re
import sys
from pathlib import Path

SUFFIX = r"(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Hwy|Highway|Ct|Court|Pl|Place|Fwy|Freeway)"
ADDRESS = re.compile(rf"\b\d{{1,5}} (?:[NSEW]\.? )?[A-Z0-9][A-Za-z0-9.'-]*(?: [A-Z0-9][A-Za-z0-9.'-]*){{0,3}} {SUFFIX}\b")
_ID_KEYS = {"listingId", "propertyId", "listing_id", "property_id"}
_ID_LIST_KEYS = {"listingIds", "propertyIds", "listing_ids", "property_ids"}
_ID_TEXT = re.compile(r"(?i)\b(?:listing|property)(?:\s*id)?[\s:#=\"']*(\d{5,8})\b")
BASE = 900001


def _collect_ids(node, found: list):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in _ID_KEYS and isinstance(v, (int, str)) and str(v).isdigit():
                found.append(str(v))
            if k in _ID_LIST_KEYS and isinstance(v, list):
                found.extend(str(x) for x in v if isinstance(x, (int, str)) and str(x).isdigit())
            _collect_ids(v, found)
    elif isinstance(node, list):
        for v in node:
            _collect_ids(v, found)
    elif isinstance(node, str):
        found.extend(m.group(1) for m in _ID_TEXT.finditer(node))


def sanitize(events: list) -> list:
    found: list = []
    _collect_ids(events, found)
    mapping: dict = {}
    for i in found:
        if BASE <= int(i) < BASE + 1000:
            continue  # already a pseudo id
        mapping.setdefault(i, str(BASE + len(mapping)))
    addresses: dict = {}

    def mask_str(s: str) -> str:
        s = ADDRESS.sub(lambda m: addresses.setdefault(m.group(0), f"[address {chr(65 + len(addresses) % 26)} masked]"), s)
        for real, fake in mapping.items():
            s = re.sub(rf"(?<!\d)(?<!\d[.,]){re.escape(real)}(?!\d)(?![.,]\d)", fake, s)
        return s

    def walk(n):
        if isinstance(n, dict):
            def one(k, v):
                if k in _ID_KEYS and isinstance(v, int) and str(v) in mapping:
                    return int(mapping[str(v)])
                if k in _ID_KEYS and isinstance(v, str):
                    return mapping.get(v, v)
                if k in _ID_LIST_KEYS and isinstance(v, list):
                    return [int(mapping[str(x)]) if isinstance(x, int) and str(x) in mapping else mapping.get(str(x), x) if isinstance(x, str) else x for x in v]
                return walk(v)
            return {k: one(k, v) for k, v in n.items()}
        if isinstance(n, list):
            return [walk(v) for v in n]
        if isinstance(n, str):
            return mask_str(n)
        return n

    out = walk(json.loads(json.dumps(events)))
    if out and isinstance(out[0], dict):
        out[0] = {**out[0], "sanitized": True}
    return out


if __name__ == "__main__":
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    res = sanitize(json.loads(src.read_text()))
    dst.write_text(json.dumps(res, indent=1) + "\n")
    print(f"{len(res)} events written to {dst}")
