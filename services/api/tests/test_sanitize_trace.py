import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from agent.sanitize_trace import ADDRESS, sanitize  # noqa: E402

TRACE = [
    {"type": "tool_call", "mode": "LIVE", "args": {"listingId": 123456, "goal": "Italian under $250000"}},
    {"type": "tool_result", "result": {"address": "100 Main St", "listingId": 123456, "p50": 68746, "low": 59954,
                                       "note": "see 200 Oak Rd and listing 654321; budget 250000"}},
    {"type": "final", "text": "Candidates 123456 and 654321 at 100 Main St; build-out 77990."},
]


def test_addresses_and_listing_ids_are_masked_numbers_are_kept():
    out = sanitize(TRACE)
    text = json.dumps(out)
    assert not ADDRESS.search(text)
    for real in ("123456", "654321", "Main St", "Oak Rd"):
        assert real not in text
    for kept in ("68746", "59954", "250000", "77990"):
        assert kept in text
    assert len(out) == len(TRACE)


def test_ids_map_consistently_and_pseudo_ids_are_in_a_reserved_range():
    out = sanitize(TRACE)
    a = out[0]["args"]["listingId"]
    assert out[1]["result"]["listingId"] == a
    assert 900000 < a < 900100
    assert f"{a}" in out[2]["text"]


def test_idempotent_and_does_not_mutate_the_input():
    once = sanitize(TRACE)
    assert sanitize(once) == once
    assert TRACE[0]["args"]["listingId"] == 123456


def test_ids_inside_embedded_json_text_and_id_lists_are_masked():
    ev = [{"type": "tool_call", "args": {"listingIds": [123456, 654321]}},
          {"type": "tool_result", "summary": json.dumps({"findings": [], "listingId": 123456, "mode": "none", "p50": 68746.5})}]
    out = sanitize(ev)
    text = json.dumps(out)
    assert "123456" not in text and "654321" not in text
    assert "68746.5" in text
    ids = out[0]["args"]["listingIds"]
    assert all(900000 < i < 900100 for i in ids)
    assert str(ids[0]) in out[1]["summary"]
