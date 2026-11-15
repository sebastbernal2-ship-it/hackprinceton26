import json
import types

import run_factor_adapters as r


def test_run_tags_property_id_skips_failures_and_writes_json(tmp_path):
    def fetch(site):
        if site["property_id"] == "bad":
            raise RuntimeError("network")
        return {}

    mod = types.SimpleNamespace(fetch=fetch, observations=lambda s, raw: [{"factorId": "x", "status": "unknown", "value": ""}])
    n, bad = r.run(mod, [{"property_id": "a"}, {"property_id": "bad"}], tmp_path / "x")
    assert (n, bad) == (1, 1)
    assert json.loads((tmp_path / "x/observations.json").read_text())[0]["propertyId"] == "a"


def test_pace_sleeps_between_sites_and_counts_failure_reasons(tmp_path):
    def fetch(site):
        raise ValueError("x")

    mod = types.SimpleNamespace(fetch=fetch, observations=lambda s, raw: [])
    sleeps, reasons = [], __import__("collections").Counter()
    n, bad = r.run(mod, [{"property_id": "a"}, {"property_id": "b"}, {"property_id": "c"}], tmp_path / "y",
                   pace=1.5, sleep=sleeps.append, reasons=reasons)
    assert (n, bad) == (0, 3)
    assert sleeps == [1.5, 1.5]
    assert reasons == {"ValueError": 3}
