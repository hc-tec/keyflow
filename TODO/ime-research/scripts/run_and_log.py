from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a command and write a UTF-8 log (tee).")
    parser.add_argument("--log", required=True, help="Path to log file (UTF-8).")
    parser.add_argument("--cwd", default=None, help="Working directory.")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command to run (pass after --).")
    args = parser.parse_args()

    if not args.command:
        print("error: missing command. Example: run_and_log.py --log out.log -- docker ps", file=sys.stderr)
        return 2

    if args.command[0] == "--":
        args.command = args.command[1:]

    log_path = Path(args.log)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    cwd = Path(args.cwd).resolve() if args.cwd else Path.cwd().resolve()
    started_at = dt.datetime.now().astimezone()
    started_perf = time.perf_counter()

    header = [
        "# run_and_log.py",
        f"- started_at: {started_at.strftime('%Y-%m-%dT%H:%M:%S%z')}",
        f"- cwd: {cwd}",
        f"- command: {' '.join(args.command)}",
        "",
        "--- output ---",
        "",
    ]

    with log_path.open("w", encoding="utf-8", newline="\n") as log_file:
        log_file.write("\n".join(header))
        log_file.flush()

        process = subprocess.Popen(
            args.command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=os.environ.copy(),
        )

        assert process.stdout is not None
        for line in process.stdout:
            sys.stdout.write(line)
            log_file.write(line)
            log_file.flush()

        exit_code = process.wait()

        duration_s = time.perf_counter() - started_perf
        ended_at = dt.datetime.now().astimezone()

        footer = [
            "",
            "--- end ---",
            f"- exit_code: {exit_code}",
            f"- ended_at: {ended_at.strftime('%Y-%m-%dT%H:%M:%S%z')}",
            f"- duration_seconds: {duration_s:.3f}",
            "",
        ]
        log_file.write("\n".join(footer))

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
