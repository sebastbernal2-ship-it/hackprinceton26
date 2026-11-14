import json
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(DATA))


def jsonl(name):
    """Load a synthetic fixture stored as a JSON array (the .jsonl extension is gitignored)."""
    return json.loads((FIXTURES / name.replace(".jsonl", ".json")).read_text())
