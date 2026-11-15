"""Provider layer. Internal message format is Anthropic-style blocks:
  {"role": "user"|"assistant", "content": str | [ {"type":"text"|"tool_use"|"tool_result", ...} ]}
step() returns Turn. Providers: AnthropicProvider, OpenAICompatProvider (LOCAL_LLM_BASE_URL), FakeProvider (tests)."""
import json
import os
from dataclasses import dataclass, field

PLANNER_MODEL = "claude-sonnet-5-5"
SUBAGENT_MODEL = "claude-haiku-5-5"


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

    def step(self, system, messages, tools, max_tokens=2000) -> Turn:
        msgs, fns = self.to_openai(system, messages, tools)
        r = self.http.post(f"{self.base}/chat/completions",
                           json={"model": self.model, "messages": msgs, "tools": fns, "max_tokens": max_tokens})
        r.raise_for_status()
        d = r.json()
        msg = d["choices"][0]["message"]
        t = Turn(text=msg.get("content") or "", input_tokens=d.get("usage", {}).get("prompt_tokens", 0),
                 output_tokens=d.get("usage", {}).get("completion_tokens", 0))
        for c in msg.get("tool_calls") or []:
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
            except ValueError:
                args = {}
            t.tool_calls.append({"id": c["id"], "name": c["function"]["name"], "args": args})
        return t


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
