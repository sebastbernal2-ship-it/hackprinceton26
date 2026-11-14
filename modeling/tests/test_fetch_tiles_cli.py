import os
import subprocess
import sys

HERE = os.path.dirname(__file__)


def test_help_works_without_keys():
    env = {k: v for k, v in os.environ.items() if not k.startswith("MATTERPORT_")}
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "..", "fetch_tiles.py"), "--help"],
                       capture_output=True, text=True, env=env, cwd=HERE, timeout=60)
    assert r.returncode == 0, r.stderr
    assert "--max-tiles" in r.stdout
