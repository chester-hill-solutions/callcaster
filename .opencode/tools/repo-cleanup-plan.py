#!/usr/bin/env python3
"""Print a read-only Git cleanup inventory as JSON.

Run: python3 .opencode/tools/repo-cleanup-plan.py [checkout]
Requires Python 3 and Git. Fetch before use if current remote data is needed.
This tool never fetches, writes refs, reads .env, or deletes files.
An ancestry match is evidence only. Check worktree changes and merged PRs before
removal. Squash merges need GitHub PR head and merge-commit checks. Save a Git
bundle and a ref manifest first. Keep dirty worktrees and unmatched branch tips.
"""
import json
import subprocess
import sys

checkout = sys.argv[1] if len(sys.argv) > 1 else "."


def git(*args):
    return subprocess.check_output(
        ["git", "-C", checkout, *args], text=True
    ).strip()


bases = [
    ref for ref in ("origin/dev", "origin/master")
    if subprocess.run(
        ["git", "-C", checkout, "rev-parse", "--verify", ref],
        capture_output=True,
    ).returncode == 0
]
worktrees = []
for block in git("worktree", "list", "--porcelain").split("\n\n"):
    row = dict(line.partition(" ")[::2] for line in block.splitlines())
    status = subprocess.run(
        ["git", "-C", row["worktree"], "status", "--porcelain"],
        text=True, capture_output=True,
    )
    row["changes"] = status.stdout.splitlines()
    row["read_error"] = status.stderr.strip() or None
    worktrees.append(row)
branches = []
for line in git(
    "for-each-ref", "--format=%(refname:short)|%(objectname)|%(upstream:short)",
    "refs/heads",
).splitlines():
    name, sha, upstream = line.split("|")
    contained = [
        base for base in bases if subprocess.run(
            ["git", "-C", checkout, "merge-base", "--is-ancestor", sha, base],
            capture_output=True,
        ).returncode == 0
    ]
    branches.append({"name": name, "sha": sha, "upstream": upstream,
                     "ancestor_of": contained})
print(json.dumps({"checkout": git("rev-parse", "--show-toplevel"),
                  "head": git("rev-parse", "HEAD"),
                  "worktrees": worktrees, "branches": branches}, indent=2))
