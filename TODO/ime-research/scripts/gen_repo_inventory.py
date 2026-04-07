#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
from pathlib import Path


def run_git(repo_dir: Path, args: list[str]) -> str:
    return subprocess.check_output(
        ["git", "-C", str(repo_dir), *args],
        text=True,
        encoding="utf-8",
        errors="replace",
    ).strip()


def detect_license_files(repo_dir: Path) -> str:
    patterns = [
        re.compile(r"^LICENSE(\..+)?$", re.IGNORECASE),
        re.compile(r"^COPYING(\..+)?$", re.IGNORECASE),
        re.compile(r"^NOTICE(\..+)?$", re.IGNORECASE),
    ]
    matches: list[str] = []
    for child in sorted(repo_dir.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_file():
            continue
        for pat in patterns:
            if pat.match(child.name):
                matches.append(child.name)
                break
    return ", ".join(matches)


def has_submodules(repo_dir: Path) -> bool:
    return (repo_dir / ".gitmodules").exists()


def submodules_initialized(repo_dir: Path) -> str:
    if not has_submodules(repo_dir):
        return ""
    try:
        status = run_git(repo_dir, ["submodule", "status", "--recursive"])
    except subprocess.CalledProcessError:
        return "unknown"
    if not status:
        return "unknown"
    # Per git docs: leading '-' means not initialized, '+' means checkout mismatch, 'U' conflict.
    bad = [line for line in status.splitlines() if line and line[0] in "-+U"]
    return "no" if bad else "yes"


def repo_row(repo_dir: Path) -> dict[str, str]:
    origin = ""
    try:
        origin = run_git(repo_dir, ["remote", "get-url", "origin"])
    except subprocess.CalledProcessError:
        origin = ""

    head = run_git(repo_dir, ["rev-parse", "HEAD"])
    last_commit = run_git(repo_dir, ["log", "-1", "--format=%cI"])

    branch = ""
    try:
        branch = run_git(repo_dir, ["symbolic-ref", "-q", "--short", "HEAD"])
    except subprocess.CalledProcessError:
        branch = "(detached)"

    return {
        "repo": repo_dir.name,
        "origin": origin,
        "head": head,
        "last_commit": last_commit,
        "branch": branch,
        "has_submodules": "yes" if has_submodules(repo_dir) else "no",
        "submodules_inited": submodules_initialized(repo_dir),
        "license_files": detect_license_files(repo_dir),
    }


def is_git_repo(path: Path) -> bool:
    git_dir = path / ".git"
    return git_dir.exists()


def to_markdown_table(rows: list[dict[str, str]], columns: list[str]) -> str:
    def esc(value: str) -> str:
        return value.replace("|", "\\|")

    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join(["---"] * len(columns)) + " |"
    lines = [header, sep]
    for row in rows:
        lines.append("| " + " | ".join(esc(row.get(col, "")) for col in columns) + " |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate IME repo inventory markdown.")
    parser.add_argument(
        "--repos-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "repos",
        help="Directory containing git repos (default: TODO/ime-research/repos).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "notes" / "20260320_repo_inventory.md",
        help="Output markdown path.",
    )
    args = parser.parse_args()

    repos_dir: Path = args.repos_dir.resolve()
    out_path: Path = args.out.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, str]] = []
    for child in sorted(repos_dir.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir():
            continue
        if not is_git_repo(child):
            continue
        try:
            rows.append(repo_row(child))
        except Exception as e:  # keep going; record minimal info
            rows.append(
                {
                    "repo": child.name,
                    "origin": "",
                    "head": "",
                    "last_commit": "",
                    "branch": "",
                    "has_submodules": "unknown",
                    "submodules_inited": "unknown",
                    "license_files": "",
                }
            )
            print(f"[warn] failed to inspect {child}: {e}")

    columns = [
        "repo",
        "origin",
        "branch",
        "head",
        "last_commit",
        "has_submodules",
        "submodules_inited",
        "license_files",
    ]

    generated_at = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    md = []
    md.append("# IME 仓库盘点清单\n")
    md.append(f"> 编码：UTF-8  \n")
    md.append(f"> 生成时间：{generated_at}  \n")
    md.append(f"> 扫描目录：`{repos_dir}`\n")
    md.append(to_markdown_table(rows, columns))

    out_path.write_text("\n".join(md), encoding="utf-8", newline="\n")
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

