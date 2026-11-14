#!/usr/bin/env python3
"""PreToolUse hook: refuse to stage or commit sponsor data, secrets, or local pilot files.

Reads the tool call JSON on stdin. Exit 2 blocks the call and shows stderr to Claude.
Blocks: `git add -f`, and any `git commit`/`git add` while forbidden paths are staged.
"""
import json, re, subprocess, sys

FORBIDDEN = re.compile(
    r"(^|/)\.env($|\.(?!example$|sample$|template$))"
    r"|^data/(raw|normalized|derived)/"
    r"|^data/registry/(sites|sources)\.csv$"
    r"|^costar-hackathon-kit"
    r"|^reports/"
    r"|\.jsonl$"
)

def main():
    try:
        cmd = (json.load(sys.stdin).get("tool_input") or {}).get("command", "")
    except Exception:
        return 0
    if not re.search(r"\bgit\s+(-C\s+\S+\s+)?(add|commit)\b", cmd):
        return 0
    if re.search(r"\bgit\s+(-C\s+\S+\s+)?add\b[^;&|]*(\s-f\b|\s--force\b)", cmd):
        print("Blocked: `git add -f` bypasses .gitignore, which protects sponsor data and secrets.", file=sys.stderr)
        return 2
    staged = subprocess.run(["git", "diff", "--cached", "--name-only"], capture_output=True, text=True).stdout.split("\n")
    bad = [f for f in staged if f and FORBIDDEN.search(f)]
    if bad:
        print("Blocked: forbidden paths are staged (sponsor data, secrets, or local pilot files):\n  " + "\n  ".join(bad[:10]) + "\nUnstage them with `git restore --staged <path>`.", file=sys.stderr)
        return 2
    return 0

sys.exit(main())
