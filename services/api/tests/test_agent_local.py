"""Local OpenAI-compatible model hardening: thinking off, JSON repair, bounded retry, goal numbers, recording metadata."""
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from agent import guard, runner  # noqa: E402
from agent.fixture_env import ScriptedEnv  # noqa: E402
from agent.providers import OpenAICompatProvider, repair_json  # noqa: E402
from agent.scripted import ScriptedInspector, ScriptedPlanner  # noqa: E402

TOOLS = [{"name": "shortlist", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
MSGS = [{"role": "user", "content": "GOAL"}]


def provider(responses, bodies=None):
    it = iter(responses)

    def handler(req):
        if bodies is not None:
            bodies.append(json.loads(req.content))
        return httpx.Response(200, json=next(it))
    return OpenAICompatProvider("m", "http://x/v1", httpx.MockTransport(handler))


def resp(msg, finish="stop", pt=5, ct=7):
    return {"choices": [{"message": msg, "finish_reason": finish}], "usage": {"prompt_tokens": pt, "completion_tokens": ct}}


def call(args, cid="c1"):
    return {"id": cid, "type": "function", "function": {"name": "shortlist", "arguments": args}}


def test_repair_json():
    assert repair_json('{"a": 1,}') == {"a": 1}
    assert repair_json('```json\n{"a": [1, 2,]}\n```') == {"a": [1, 2]}
    assert repair_json('{"a": "x", "b": 2') == {"a": "x", "b": 2}
    assert repair_json("{'a': 1}") == {"a": 1}
    assert repair_json("not json") is None and repair_json("[1]") is None


def test_thinking_disabled_by_default_and_flag_sent():
    bodies = []
    provider([resp({"content": "hi"})], bodies).step("s", MSGS, TOOLS)
    assert bodies[0]["chat_template_kwargs"] == {"enable_thinking": False}


def test_malformed_arguments_repaired_without_extra_call():
    bodies = []
    t = provider([resp({"content": "", "tool_calls": [call('{"goal": "g",}')]})], bodies).step("s", MSGS, TOOLS)
    assert t.tool_calls[0]["args"] == {"goal": "g"} and len(bodies) == 1


def test_unrepairable_arguments_retry_then_give_up_bounded():
    bodies = []
    bad = resp({"content": "", "tool_calls": [call("<<garbage")]})
    t = provider([bad, bad, bad, bad], bodies).step("s", MSGS, TOOLS)
    assert len(bodies) == 3  # 1 try + 2 retries, bounded
    assert t.tool_calls == [] and "malformed" in t.text and t.input_tokens == 15 and t.output_tokens == 21


def test_retry_succeeds_and_tokens_accumulate():
    t = provider([resp({"content": "", "tool_calls": [call("<<garbage")]}),
                  resp({"content": "", "tool_calls": [call('{"goal":"g"}')]})]).step("s", MSGS, TOOLS)
    assert t.tool_calls[0]["args"] == {"goal": "g"} and t.input_tokens == 10


def test_truncated_empty_reply_retries_with_more_tokens():
    bodies = []
    t = provider([resp({"content": "", "reasoning_content": "thinking..."}, finish="length"),
                  resp({"content": "ok"})], bodies).step("s", MSGS, TOOLS, 100)
    assert t.text == "ok" and bodies[1]["max_tokens"] == 200


def test_inline_tool_call_tags_and_think_blocks():
    txt = '<think>hm</think>sure <tool_call>{"name": "shortlist", "arguments": {"goal": "g"}}</tool_call>'
    t = provider([resp({"content": txt})]).step("s", MSGS, TOOLS)
    assert t.text == "sure" and t.tool_calls[0]["name"] == "shortlist" and t.tool_calls[0]["args"] == {"goal": "g"}


def test_missing_tool_call_id_is_synthesised():
    c = call("{}")
    del c["id"]
    t = provider([resp({"content": "", "tool_calls": [c]})]).step("s", MSGS, TOOLS)
    assert t.tool_calls[0]["id"]


def test_goal_numbers_are_allowed_in_claims_but_others_are_not():
    res = {"r1": {"p": 0.18}}
    g = "Italian in Houston, 40 seats, under 250k"
    assert guard.check_claim({"text": "fits 40 seats and 250k", "cites": ["r1"]}, res, goal=g)[0]
    assert not guard.check_claim({"text": "fits 40 seats and 300k", "cites": ["r1"]}, res, goal=g)[0]
    assert not guard.check_claim({"text": "fits 40 seats", "cites": ["r1"]}, res)[0]


def test_events_carry_model_and_recording_date(tmp_path):
    r = runner.Run("g", ScriptedEnv(), ScriptedPlanner(), ScriptedInspector(), mode="SCRIPTED", derived_dir=tmp_path)
    evs = r.run()
    assert all("model" in e and len(e["date"]) == 10 for e in evs)


def test_model_cannot_call_a_listing_strong_when_evidence_is_missing(tmp_path):
    """Numbers can check out while the verdict is unsupported: no inspection run + unpriced cost lines caps 'strong'."""
    from agent.providers import FakeProvider, Turn
    env = ScriptedEnv({"inspection_findings": {"mode": "none", "findings": [], "notice": "No inspection has been run"},
                       "costs": {"totals": {"low": 1}, "excludedLineIds": ["a", "b"]},
                       "assess": {"pOverBudget": 0.1, "unknownInputs": {"monthly_rent": "missing"}}})
    calls = [{"id": str(i), "name": n, "args": {}} for i, n in enumerate(["property_facts", "inspection_findings", "costs", "assess"])]
    sub = FakeProvider([Turn(tool_calls=calls),
                        lambda s, m: Turn(tool_calls=[{"id": "v", "name": "submit_verdict", "args": {
                            "verdict": "strong", "headline": "Great site", "cites": ["r1", "r2", "r3", "r4"]}}])])
    plan = FakeProvider([Turn(tool_calls=[{"id": "p", "name": "inspect_sites", "args": {"listingIds": [9001]}}]), Turn()])
    r = runner.Run("g", env, plan, sub, mode="LIVE", derived_dir=tmp_path)
    r.run()
    v = r.verdicts[9001]
    assert v["verdict"] == "workable" and v["verdictCapped"]
    text = " ".join(v["unknowns"])
    assert "no inspection" in text and "2 cost line" in text and "monthly_rent" in text


def test_citing_inspect_sites_cannot_launder_model_written_numbers(tmp_path):
    """inspect_sites returns model-written verdict text; a claim citing it may only use numbers from the evidence it cites."""
    from agent.providers import FakeProvider, Turn
    sub = FakeProvider([Turn(tool_calls=[{"id": "1", "name": "assess", "args": {}}]),
                        Turn(tool_calls=[{"id": "v", "name": "submit_verdict", "args": {
                            "verdict": "risky", "headline": "p over budget 0.18", "cites": ["r1"]}}])])
    claims = [{"text": "p over budget 0.18", "cites": ["r2"]}, {"text": "model invented 777", "cites": ["r2"]}]
    plan = FakeProvider([Turn(tool_calls=[{"id": "p", "name": "inspect_sites", "args": {"listingIds": [9001]}}]),
                         lambda s, m: Turn(tool_calls=[{"id": "b", "name": "save_brief", "args": {"claims": claims}}])])
    r = runner.Run("g", ScriptedEnv(), plan, sub, mode="LIVE", derived_dir=tmp_path)
    evs = r.run()
    brief = evs[-1]["brief"]
    assert [c["text"] for c in brief["claims"]] == ["p over budget 0.18"]
    assert [c["text"] for c in brief["rejectedClaims"]] == ["model invented 777"]


def test_replay_info_preserves_recording_metadata(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    evs = [{"type": "plan", "mode": "LIVE", "provider": "local", "model": "qwen-x", "date": "2026-11-15", "items": ["a"]},
           {"type": "final", "mode": "LIVE", "provider": "local", "model": "qwen-x", "date": "2026-11-15", "brief": {"mode": "LIVE"}}]
    (tmp_path / "agent").mkdir()
    (tmp_path / "agent" / "replay.json").write_text(json.dumps(evs))
    monkeypatch.setenv("DERIVED_DIR", str(tmp_path))
    body = TestClient(app).get("/api/agent/replay").text
    info = json.loads([ln for ln in body.splitlines() if ln.startswith("data:")][0][5:])
    assert info["source"] == "local-recorded-run"
    assert info["recordedFrom"] == {"originalMode": "LIVE", "provider": "local", "model": "qwen-x", "date": "2026-11-15"}
    assert "recorded" in info["note"].lower() and "not a live run" in info["note"].lower()


def test_briefs_are_saved_under_derived_dir_env(tmp_path, monkeypatch):
    monkeypatch.setenv("DERIVED_DIR", str(tmp_path))
    r = runner.Run("g", ScriptedEnv(), ScriptedPlanner(), ScriptedInspector(), mode="SCRIPTED")
    r.run()
    assert (tmp_path / "agent" / "briefs" / f"{r.run_id}.json").is_file()
