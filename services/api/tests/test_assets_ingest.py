import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from app import assets_ingest_routes as routes  # noqa: E402
from app import assets_routes as catalog_routes  # noqa: E402
from app.main import app  # noqa: E402
from assets.ingest import from_scan, identify as ident  # noqa: E402
from assets.ingest.__main__ import main as cli_main  # noqa: E402
from assets.store import Store  # noqa: E402

client = TestClient(app)
JPG = b"\xff\xd8\xff\xe0fake"
GOOD = json.dumps([
    {"name": "Steel counter", "category": "counter", "dims_m": {"w": 1.8, "d": 0.7, "h": 0.9}, "confidence": 0.7,
     "style_tags": ["brushed steel"], "box_2d": [10, 20, 500, 600], "notes": "n"},
    {"name": "Odd thing", "category": "spaceship", "dims_m": {"w": -1, "d": "x", "h": None}, "confidence": 9}])


class Fake:
    def __init__(self, text=GOOD, boom=False):
        self.text, self.boom, self.calls = text, boom, []

    def identify(self, images, system, user_text):
        if self.boom:
            raise RuntimeError("api down")
        self.calls.append((len(images), user_text))
        return self.text


def img(tmp_path, name="a.jpg"):
    p = tmp_path / name
    p.write_bytes(JPG)
    return p


def test_live_proposals_are_draft_estimated(tmp_path):
    r = ident.identify([img(tmp_path)], Fake(), "prof1", reference_scale="door 2.03 m")
    assert r["mode"] == "live"
    a, b = r["proposals"]
    assert a["status"] == b["status"] == "draft" and a["dimsStatus"] == "estimated"
    assert a["category"] == "counter" and a["profileId"] == "prof1" and a["priceRef"] is None
    assert "reference scale" in a["provenance"]["notes"] and a["provenance"]["box_2d"] == [10, 20, 500, 600]
    assert b["category"] == "other" and b["dims"] == {"w": 0.0, "d": 0.0, "h": 0.0}
    assert b["provenance"]["confidence"] is None  # out-of-range confidence dropped


def test_explicit_measurement_only_for_single_item(tmp_path):
    one = json.dumps([json.loads(GOOD)[0]])
    r = ident.identify([img(tmp_path)], Fake(one), measured={"w": 2.0, "d": 0.6, "h": 0.85})
    a = r["proposals"][0]
    assert a["dimsStatus"] == "measured" and a["dims"]["w"] == 2.0 and "User-stated" in a["provenance"]["notes"]
    r2 = ident.identify([img(tmp_path)], Fake(), measured={"w": 2.0, "d": 0.6, "h": 0.85})
    assert all(p["dimsStatus"] == "estimated" for p in r2["proposals"])


@pytest.mark.parametrize("client_, imgs", [(None, True), (Fake(), False)])
def test_fixture_fallbacks_labelled(tmp_path, client_, imgs):
    r = ident.identify([img(tmp_path)] if imgs else [], client_)
    assert r["mode"] == "fixture" and r["notice"].startswith("SAMPLE DATA")
    assert all("sample" in p["tags"] and p["status"] == "draft" for p in r["proposals"])


@pytest.mark.parametrize("c", [Fake(boom=True), Fake("not json"), Fake(""), Fake('{"x": 1}')])
def test_failed_calls_are_visible_failures_not_samples(tmp_path, c):
    r = ident.identify([img(tmp_path)], c)
    assert r["mode"] == "failed" and r["proposals"] == [] and r["notice"].startswith("IDENTIFICATION FAILED")


def test_empty_array_is_live_nothing_found(tmp_path):
    r = ident.identify([img(tmp_path)], Fake("[]"))
    assert r["mode"] == "live" and r["proposals"] == []


def test_style_fields_inferred_and_sanitised(tmp_path):
    t = json.dumps([{"name": "Machine", "category": "other", "dims_m": {"w": 1, "d": 1, "h": 1}, "materials": ["steel", 5, ""], "colors": ["#AABBCC", "red", "#12"],
                     "finish": "matte", "style_tags": ["industrial"]}, {"name": "Plain", "category": "other"}])
    a, b = ident.identify([img(tmp_path)], Fake(t))["proposals"]
    assert a["style"] == {"materials": ["steel", "5"], "colors": ["#aabbcc"], "finish": "matte",
                          "styleTags": ["industrial"], "inferred": True}
    assert "style" not in b
    from assets.models import Asset
    Asset.model_validate(a)
    with pytest.raises(Exception):
        Asset.model_validate({**a, "style": {"colors": ["blue"]}})


def test_fixture_cannot_be_saved_as_asset(monkeypatch, tmp_path):
    monkeypatch.setattr(catalog_routes, "STORE", Store(tmp_path / "assets"))
    p = ident.load_fixture("cafe-demo")[0]
    r = client.post("/api/assets", json={**p, "status": "confirmed"})
    assert r.status_code == 422 and "cannot be saved" in r.text


def objects():
    return {"objects": [
        {"id": 1, "label": "kitchen counter", "source": "pano", "box": {"centre": [0, 0, 0.45], "size_lwh_m": [2.0, 0.7, 0.9], "yaw_deg": 30}},
        {"id": 2, "label": None, "box": {"size_lwh_m": [0.5, 0.5, 0.5]}},
        {"id": 3, "label": "chair", "box": {"size_lwh_m": [0.5, 0, 0.9]}},
        {"id": 4, "label": "chair", "box": {"size_lwh_m": [float("nan"), 1, 1]}},
        "junk"]}


def test_from_scan():
    r = from_scan.assets_from_objects(objects(), "p9", "roomA")
    a, b = r["assets"]
    assert a["category"] == "counter" and a["dims"] == {"w": 2.0, "d": 0.7, "h": 0.9}
    assert a["source"] == "extracted" and a["dimsStatus"] == "estimated" and a["status"] == "draft"
    assert "Estimated from reconstruction" in a["provenance"]["notes"] and a["profileId"] == "p9"
    assert b["category"] == "other" and "Unlabelled" in b["name"]
    assert [s[0] for s in r["skipped"]] == [3, 4, 4]
    with pytest.raises(ValueError):
        from_scan.assets_from_objects({"nope": 1})


def test_cli_scan_and_fixture(tmp_path, capsys):
    f = tmp_path / "objects.json"
    f.write_text(json.dumps(objects()))
    assert cli_main(["--scan", str(f), "--profile", "x"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert len(out["proposals"]) == 2 and out["scanSkipped"]


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    fake = Fake()
    monkeypatch.setattr(routes, "get_client", lambda: fake)
    return fake


def test_api_ingest_ok(api, tmp_path):
    r = client.post("/api/assets/ingest", files=[("image", ("../../evil.jpg", JPG, "image/jpeg"))],
                    data={"profileId": "chainA", "referenceScale": "door 2 m"})
    assert r.status_code == 200
    j = r.json()
    assert j["mode"] == "live" and j["proposals"][0]["profileId"] == "chainA" and api.calls[0][0] == 1
    stored = list((tmp_path / "up").rglob("*"))
    assert not any(p.is_file() for p in stored)
    assert j["proposals"][0]["imageRefs"] == []
    assert not any("evil" in p.name for p in stored)


def test_api_live_proposal_can_be_confirmed_and_loaded_from_profile(api, monkeypatch, tmp_path):
    monkeypatch.setattr(catalog_routes, "STORE", Store(tmp_path / "assets"))
    response = client.post(
        "/api/assets/ingest",
        files=[("image", ("machine.jpg", JPG, "image/jpeg"))],
        data={"profileId": "cafe-demo"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "live" and body["proposals"]
    proposal = body["proposals"][0]
    saved = client.post("/api/assets", json={**proposal, "status": "confirmed"})
    assert saved.status_code == 201, saved.text
    assert saved.json()["status"] == "confirmed"
    assert saved.json()["profileId"] == "cafe-demo"
    listed = client.get("/api/assets?profileId=cafe-demo")
    assert listed.status_code == 200
    assert any(asset["assetId"] == proposal["assetId"] for asset in listed.json())


def test_api_failed_identification_is_200_failed_no_proposals(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(routes, "get_client", lambda: Fake(boom=True))
    j = client.post("/api/assets/ingest", files=[("image", ("a.jpg", JPG, "image/jpeg"))]).json()
    assert j["mode"] == "failed" and j["proposals"] == [] and "FAILED" in j["notice"]
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_requires_image_and_labels_no_key_fixture(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(routes, "get_client", lambda: None)
    empty = client.post("/api/assets/ingest", data={"profileId": "p"})
    assert empty.status_code == 422 and "at least one image" in empty.json()["detail"]
    response = client.post("/api/assets/ingest", files=[("image", ("a.jpg", JPG, "image/jpeg"))], data={"profileId": "p"})
    assert response.status_code == 200
    j = response.json()
    assert j["mode"] == "fixture" and j["notice"].startswith("SAMPLE DATA")
    assert all("sample" in p["tags"] and p["imageRefs"] == [] for p in j["proposals"])
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_rejects(api, monkeypatch):
    post = lambda files, **d: client.post("/api/assets/ingest", files=files, data=d)  # noqa: E731
    assert post([("image", ("a.gif", JPG, "image/gif"))]).status_code == 415
    assert post([("image", ("a.jpg", b"GIF89a....", "image/jpeg"))]).status_code == 415
    assert post([("image", ("a.jpg", JPG * 1, "image/jpeg"))] * 7).status_code == 422
    monkeypatch.setattr(ident, "MAX_IMAGE_BYTES", 10)
    assert post([("image", ("a.jpg", JPG + b"x" * 20, "image/jpeg"))]).status_code == 413
    assert post([("image", ("a.jpg", JPG, "image/jpeg"))], measuredW="abc").status_code == 422
    assert not any(p.is_file() for p in (Path(routes.UPLOAD_DIR)).rglob("*"))


def test_api_cleans_temporary_images_when_identification_fails(api, monkeypatch, tmp_path):
    def fail(*args, **kwargs):
        raise RuntimeError("unexpected identify failure")

    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(ident, "identify", fail)
    with pytest.raises(RuntimeError, match="unexpected identify failure"):
        client.post("/api/assets/ingest", files=[("image", ("a.jpg", JPG, "image/jpeg"))])
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_rejects_bad_later_image_without_partial_temp_files(api, tmp_path):
    response = client.post("/api/assets/ingest", files=[
        ("image", ("first.jpg", JPG, "image/jpeg")),
        ("image", ("second.jpg", b"GIF89a....", "image/jpeg")),
    ])
    assert response.status_code == 415
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


# ---------------- OpenAI-compatible provider against a local stub server ----------------
import http.server  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402


class Stub:
    """Local OpenAI-compatible server. `plan` is a list of (status, body|callable) consumed per request; last repeats."""

    def __init__(self, plan):
        self.plan, self.requests = list(plan), []
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append((self.path, dict(self.headers), body))
                status, payload = outer.plan.pop(0) if len(outer.plan) > 1 else outer.plan[0]
                if callable(payload):
                    payload()
                    payload = ""
                data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_port}/v1"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


def chat(content):
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


@pytest.fixture
def stub():
    made = []

    def make(plan):
        s = Stub(plan)
        made.append(s)
        return s

    yield make
    for s in made:
        s.close()


def compat(s, **kw):
    kw.setdefault("backoff", 0)
    return ident.OpenAICompatIdentify(s.url, "qwen3-vl-32b", "k", **kw)


def test_openai_compat_success_request_shape(stub, tmp_path):
    s = stub([(200, chat(GOOD))])
    r = ident.identify([img(tmp_path)], compat(s), "p")
    assert r["mode"] == "live" and r["provider"] == "openai-compatible" and len(r["proposals"]) == 2
    assert r["proposals"][0]["provenance"]["origin"] == "vision:qwen3-vl-32b"
    path, headers, body = s.requests[0]
    assert path == "/v1/chat/completions" and headers["Authorization"] == "Bearer k" and body["model"] == "qwen3-vl-32b"
    assert body["response_format"]["type"] == "json_schema"
    parts = body["messages"][1]["content"]
    assert parts[0]["type"] == "image_url" and parts[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_openai_compat_accepts_object_wrapped_proposals(stub, tmp_path):
    s = stub([(200, chat(json.dumps({"proposals": json.loads(GOOD)})))])
    assert len(ident.identify([img(tmp_path)], compat(s))["proposals"]) == 2


def test_openai_compat_retries_5xx_then_succeeds(stub, tmp_path):
    s = stub([(500, {"error": "x"}), (200, chat(GOOD))])
    assert ident.identify([img(tmp_path)], compat(s))["mode"] == "live" and len(s.requests) == 2


def test_openai_compat_unsupported_schema_falls_back_once(stub, tmp_path):
    s = stub([(400, {"error": "response_format unsupported"}), (200, chat(GOOD))])
    assert ident.identify([img(tmp_path)], compat(s))["mode"] == "live"
    assert "response_format" not in s.requests[1][2]


@pytest.mark.parametrize("plan, n_req", [
    ([(500, {"error": "boom"})], 3),                    # persistent 500, bounded retries (retries=2 -> 3 attempts)
    ([(200, chat("this is not json"))], 1),             # malformed JSON
    ([(200, chat(""))], 1),                             # empty content
    ([(200, {"choices": []})], 1),                      # no choices
    ([(200, b"<html>gateway</html>")], 1),              # non-JSON HTTP body
    ([(401, {"error": "nope"})], 1),                    # auth error is not retried
])
def test_openai_compat_failures_are_visible(stub, tmp_path, plan, n_req):
    s = stub(plan)
    r = ident.identify([img(tmp_path)], compat(s))
    assert r["mode"] == "failed" and r["proposals"] == [] and r["notice"].startswith("IDENTIFICATION FAILED")
    assert len(s.requests) == n_req


def test_openai_compat_timeout_is_failure(stub, tmp_path):
    s = stub([(200, lambda: time.sleep(1.0))])
    r = ident.identify([img(tmp_path)], compat(s, timeout=0.2, retries=1))
    assert r["mode"] == "failed" and len(s.requests) == 2


def test_openai_compat_unreachable_is_failure(tmp_path):
    c = ident.OpenAICompatIdentify("http://127.0.0.1:9/v1", "m", retries=0, timeout=1)
    r = ident.identify([img(tmp_path)], c)
    assert r["mode"] == "failed" and r["proposals"] == []


def test_default_client_provider_order(monkeypatch):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: None)
    for k in ("VISION_BASE_URL", "VISION_MODEL", "VISION_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert ident.default_client() is None
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    assert ident.default_client().provider == "anthropic"
    monkeypatch.setenv("VISION_BASE_URL", "http://localhost:8000/v1")
    assert ident.default_client().provider == "anthropic"  # needs VISION_MODEL too
    monkeypatch.setenv("VISION_MODEL", "qwen")
    c = ident.default_client()
    assert c.provider == "openai-compatible" and c.model == "qwen"


# ---------------- video ----------------
cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")


def make_video(path, n=60, fps=20, size=(160, 120), fourcc="mp4v"):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, size)
    assert w.isOpened()
    rng = np.random.default_rng(0)
    for i in range(n):
        f = rng.integers(0, 255, (size[1], size[0], 3), dtype=np.uint8)
        cv2.putText(f, str(i), (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        w.write(f)
    w.release()
    return path.read_bytes()


def test_extract_video_frames(tmp_path):
    make_video(tmp_path / "v.mp4")
    out = tmp_path / "f"
    out.mkdir()
    paths, times = ident.extract_video_frames(tmp_path / "v.mp4", out)
    assert len(paths) == len(times) == 6 and times == sorted(times) and times[-1] > times[0] + 1.0
    assert all(p.read_bytes().startswith(b"\xff\xd8\xff") for p in paths)


def test_api_video_ok_provenance_and_cleanup(api, tmp_path):
    data = make_video(tmp_path / "v.mp4")
    r = client.post("/api/assets/ingest", files=[("image", ("clip.mp4", data, "video/mp4"))], data={"profileId": "cafe-demo"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "live" and j["source"] == "video" and len(j["frames"]) == 6 and api.calls[0][0] == 6
    a = j["proposals"][0]
    assert "extracted from video frames at t=" in a["provenance"]["notes"].lower() and a["imageRefs"] == []
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_video_failed_identification_is_visible_and_cleaned(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(routes, "get_client", lambda: Fake(boom=True))
    data = make_video(tmp_path / "v.mp4")
    j = client.post("/api/assets/ingest", files=[("image", ("clip.mp4", data, "video/mp4"))]).json()
    assert j["mode"] == "failed" and j["proposals"] == []
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_video_rejections_and_corrupt_cleanup(api, monkeypatch, tmp_path):
    post = lambda files: client.post("/api/assets/ingest", files=files)  # noqa: E731
    mp4 = make_video(tmp_path / "v.mp4")
    assert post([("image", ("a.mp4", b"\x00\x00\x00\x18ftypmp42" + b"junk" * 50, "video/mp4"))]).status_code == 422  # undecodable
    assert post([("image", ("a.mp4", b"not a video at all", "video/mp4"))]).status_code == 415
    assert post([("image", ("a.mov", JPG, "video/quicktime"))]).status_code == 415
    assert post([("image", ("a.mp4", mp4, "video/mp4")), ("image", ("b.jpg", JPG, "image/jpeg"))]).status_code == 422
    assert post([("image", ("a.mp4", mp4, "video/mp4"))] * 2).status_code == 422
    monkeypatch.setattr(ident, "MAX_VIDEO_BYTES", 100)
    assert post([("image", ("a.mp4", mp4, "video/mp4"))]).status_code == 413
    assert not any(p.is_file() for p in Path(routes.UPLOAD_DIR).rglob("*"))
