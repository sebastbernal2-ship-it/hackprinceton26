"""Attach cost catalog item ids to findings via category_cost_map.json (unmapped stays empty)."""
import json
from pathlib import Path

MAP_PATH = Path(__file__).parent / "category_cost_map.json"


def load_map(path: Path = MAP_PATH) -> dict[str, list[str]]:
    return {k: v for k, v in json.loads(path.read_text()).items() if not k.startswith("_") and isinstance(v, list)}


def link_costs(findings: list[dict], mapping: dict[str, list[str]] | None = None) -> list[dict]:
    mapping = load_map() if mapping is None else mapping
    for f in findings:
        f["costLineItemIds"] = list(mapping.get(f["category"], []))
    return findings
