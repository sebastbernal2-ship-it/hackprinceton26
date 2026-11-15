"""Provider layer. Internal message format is Anthropic-style blocks:
  {"role": "user"|"assistant", "content": str | [ {"type":"text"|"tool_use"|"tool_result", ...} ]}
step() returns Turn. Providers: AnthropicProvider, OpenAICompatProvider (LOCAL_LLM_BASE_URL), FakeProvider (tests)."""
import json
import os
import re
import uuid
from dataclasses import dataclass, field

PLANNER_MODEL = "claude-sonnet-5-5"
SUBAGENT_MODEL = "claude-haiku-5-5"


_THINK = re.compile(r"<think>.*?</think>", re.S)
_TAG = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)


def repair_json(raw: str):
    """Parse a model's tool-call arguments. Fixes code fences, trailing commas, single quotes and a missing closing
    brace/bracket. Returns a dict or None (never guesses values)."""
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    cands = [s, re.sub(r",\s*([}\]])", r"\1", s)]
    t = cands[1]
    stack = []
    in_str = esc = False
    for ch in t:
        if in_str:
            esc = (ch == "\\") and not esc
            if ch == '"' and not esc:
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    if not in_str and stack:
        cands.append(t.rstrip(", ") + "".join(reversed(stack)))
    if "'" in s and '"' not in s:
        cands.append(cands[1].replace("'", '"'))
    for c in cands:
        try:
            v = json.loads(c)
        except ValueError:
            continue
        if isinstance(v, dict):
            return v
    return None


def _inline_calls(text: str):
    """Some templates emit <tool_call>{json}</tool_call> inside content instead of tool_calls."""
    calls = []
    for m in _TAG.finditer(text):
        d = repair_json(m.group(1))
        if d and isinstance(d.get("name"), str):
            a = d.get("arguments", {})
            a = repair_json(a) if isinstance(a, str) else a
            if isinstance(a, dict):
                calls.append({"id": f"call_{uuid.uuid4().hex[:8]}", "name": d["name"], "args": a})
    return (_TAG.sub("", text).strip() if calls else text), calls


@dataclass
class Turn:
    text: str = ""
    tool_calls: list = field(default_factory=list)  # [{"id","name","args"}]
    input_tokens: int = 0
    output_tokens: int = 0


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str, client=None):
        self.model = model
        if client is None:
            import anthropic
            client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY itself
        self.client = client

    def step(self, system, messages, tools, max_tokens=2000) -> Turn:
        r = self.client.messages.create(model=self.model, max_tokens=max_tokens, system=system, messages=messages,
                                        tools=tools)
        t = Turn(input_tokens=r.usage.input_tokens, output_tokens=r.usage.output_tokens)
        for b in r.content:
            if b.type == "text":
                t.text += b.text
            elif b.type == "tool_use":
                t.tool_calls.append({"id": b.id, "name": b.name, "args": dict(b.input)})
        return t


class OpenAICompatProvider:
    """Any OpenAI-compatible /v1/chat/completions server (llama.cpp, vLLM, ...)."""
    name = "local"

    def __init__(self, model=None, base_url=None, transport=None):
        import httpx
        self.base = (base_url or os.environ["LOCAL_LLM_BASE_URL"]).rstrip("/")
        self.model = model or os.environ.get("LOCAL_LLM_MODEL", "local")
        self.http = httpx.Client(timeout=300, transport=transport)

    @staticmethod
    def to_openai(system, messages, tools):
        msgs = [{"role": "system", "content": system}]
        for m in messages:
            c = m["content"]
            if isinstance(c, str):
                msgs.append({"role": m["role"], "content": c})
                continue
            text = "".join(b["text"] for b in c if b["type"] == "text")
            calls = [b for b in c if b["type"] == "tool_use"]
            if m["role"] == "assistant":
                o = {"role": "assistant", "content": text or None}
                if calls:
                    o["tool_calls"] = [{"id": b["id"], "type": "function",
                                        "function": {"name": b["name"], "arguments": json.dumps(b["input"])}} for b in calls]
                msgs.append(o)
            else:
                for b in c:
                    if b["type"] == "tool_result":
                        msgs.append({"role": "tool", "tool_call_id": b["tool_use_id"], "content": b["content"]})
                if text:
                    msgs.append({"role": "user", "content": text})
        fns = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                  "parameters": t["input_schema"]}} for t in tools]
        return msgs, fns

    MAX_RETRIES = 2  # bounded: 1 try + 2 retries per step

    def _post(self, body):
        r = self.http.post(f"{self.base}/chat/completions", json=body)
        r.raise_for_status()
        return r.json()

    def step(self, system, messages, tools, max_tokens=2000) -> Turn:
        """One model step. Hardened for small local models: thinking is off by default (LOCAL_LLM_THINK=1 turns it on,
        but then reasoning eats the token budget), malformed tool JSON is repaired, empty/truncated or unparseable
        replies are retried at most MAX_RETRIES times with the failure reported, never looped."""
        msgs, fns = self.to_openai(system, messages, tools)
        think = os.environ.get("LOCAL_LLM_THINK") == "1"
        total_in = total_out = 0
        budget = max_tokens
        problem = ""
        for attempt in range(self.MAX_RETRIES + 1):
            d = self._post({"model": self.model, "messages": msgs, "tools": fns, "max_tokens": budget,
                            "chat_template_kwargs": {"enable_thinking": think}})
            u = d.get("usage", {})
            total_in += u.get("prompt_tokens", 0)
            total_out += u.get("completion_tokens", 0)
            ch = d["choices"][0]
            msg = ch["message"]
            text = _THINK.sub("", msg.get("content") or "").strip()
            calls, bad = [], 0
            for c in msg.get("tool_calls") or []:
                raw = c["function"].get("arguments") or "{}"
                args = raw if isinstance(raw, dict) else repair_json(raw)
                if args is None:
                    bad += 1
                    continue
                calls.append({"id": c.get("id") or f"call_{uuid.uuid4().hex[:8]}", "name": c["function"]["name"], "args": args})
            if not calls and not bad:
                text, calls = _inline_calls(text)
            if bad:
                problem = f"{bad} tool call(s) with malformed arguments after {attempt + 1} attempt(s)"
            elif not calls and not text and ch.get("finish_reason") == "length":
                problem = "reply truncated before any content (token budget used up)"
                budget *= 2
            else:
                return Turn(text=text, tool_calls=calls, input_tokens=total_in, output_tokens=total_out)
        return Turn(text=f"[local model failure: {problem}]", input_tokens=total_in, output_tokens=total_out)


class FakeProvider:
    """Plays a list of Turns (or callables (system, messages)->Turn); records what it was sent. For tests."""
    name = "fake"

    def __init__(self, turns):
        self.turns = list(turns)
        self.seen = []

    def step(self, system, messages, tools, max_tokens=2000) -> Turn:
        self.seen.append(json.loads(json.dumps(messages, default=str)))
        t = self.turns.pop(0)
        return t(system, messages) if callable(t) else t


def provider_from_env(role: str):
    """role 'planner' | 'subagent'. Returns (provider, label) or (None, reason)."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicProvider(PLANNER_MODEL if role == "planner" else SUBAGENT_MODEL), "anthropic"
    if os.environ.get("LOCAL_LLM_BASE_URL"):
        return OpenAICompatProvider(), "local"
    return None, "no provider configured (set ANTHROPIC_API_KEY or LOCAL_LLM_BASE_URL)"
