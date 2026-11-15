import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def test_text_file_calls_specify_encoding():
    files = list((ROOT / 'data').glob('*.py'))
    files += list((ROOT / 'triage').rglob('*.py'))
    files += list((ROOT / 'structure').rglob('*.py'))
    missing = []
    for path in files:
        tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.id if isinstance(func, ast.Name) else func.attr if isinstance(func, ast.Attribute) else ''
            if name not in {'open', 'read_text', 'write_text'}:
                continue
            if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == 'Image':
                continue
            mode = next((k.value for k in node.keywords if k.arg == 'mode'), None)
            if mode is None and name == 'open' and len(node.args) > (1 if isinstance(func, ast.Name) else 0):
                mode = node.args[1 if isinstance(func, ast.Name) else 0]
            if isinstance(mode, ast.Constant) and isinstance(mode.value, str) and 'b' in mode.value:
                continue
            if not any(k.arg == 'encoding' for k in node.keywords):
                missing.append(f'{path.relative_to(ROOT)}:{node.lineno}')
    assert not missing, '\n'.join(missing)


def test_reconcile_creates_output_directory(tmp_path, monkeypatch):
    from triage.reconcile import run
    monkeypatch.setattr(run, 'load_inputs', lambda root: ({}, {}, []))
    monkeypatch.setattr(sys, 'argv', ['run', '--data-root', str(tmp_path)])
    run.main()
    assert (tmp_path / 'data/derived/triage/results.json').read_text(encoding='utf-8') == '[]'
