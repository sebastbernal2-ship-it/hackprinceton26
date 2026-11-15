"""scene_agent.py against a fake OpenAI endpoint: request shape, tool-call translation, and soft failures."""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scene_agent  # noqa: E402


def serve(status, reply, seen):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            seen.append((self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(reply).encode())

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_port}/v1/chat/completions"


MSGS = [{"role": "user", "content": [{"type": "image", "source": {"media_type": "image/jpeg", "data": "AAAA"}}, {"type": "text", "text": "clear the room"}]}]


def test_tool_call_round_trip(monkeypatch):
    seen = []
    reply = {"model": "m", "choices": [{"finish_reason": "tool_calls", "message": {"content": None, "tool_calls": [
        {"id": "call_1", "type": "function", "function": {"name": "clear_room", "arguments": "{}"}}]}}]}
    srv, url = serve(200, reply, seen)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(scene_agent, "URL", url)
    status, out = scene_agent.handle({"messages": MSGS})
    srv.shutdown()
    assert status == 200 and out["stop_reason"] == "tool_use"
    assert out["content"] == [{"type": "tool_use", "id": "call_1", "name": "clear_room", "input": {}}]
    auth, req = seen[0]
    assert auth == "Bearer sk-test" and req["tools"][0]["type"] == "function"
    assert req["messages"][0]["role"] == "system" and req["messages"][1]["content"][0]["type"] == "image_url"
    # the next turn: assistant tool call + tool result must translate to valid OpenAI messages
    follow = MSGS + [{"role": "assistant", "content": out["content"]}, {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call_1", "content": "cleared 3 pieces"}]}]
    msgs = scene_agent._to_openai(follow)
    assert msgs[2]["tool_calls"][0]["id"] == "call_1" and msgs[3] == {"role": "tool", "tool_call_id": "call_1", "content": "cleared 3 pieces"}


def test_quota_and_missing_key_fail_soft(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert scene_agent.handle({"messages": MSGS})[0] == 503
    seen = []
    srv, url = serve(429, {"error": {"code": "insufficient_quota", "message": "no credits"}}, seen)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(scene_agent, "URL", url)
    status, out = scene_agent.handle({"messages": MSGS})
    srv.shutdown()
    assert status == 429 and "sk-test" not in json.dumps(out)
