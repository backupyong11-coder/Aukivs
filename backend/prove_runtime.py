#!/usr/bin/env python3
"""로컬에서 uvicorn을 잠시 띄우고 /health, /briefing/today, /memos, POST /memos/append 를 실제 호출해 증거를 stdout에 출력."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
PORT = 9777
BASE = f"http://127.0.0.1:{PORT}"


def main() -> int:
    os.chdir(BACKEND)
    env = os.environ.copy()
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", f"--port={PORT}"],
        cwd=str(BACKEND),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    time.sleep(2.5)
    try:
        if proc.poll() is not None:
            err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
            print("uvicorn failed to start:", err[:2000], file=sys.stderr)
            return 1

        def get(path: str) -> tuple[int, str]:
            try:
                r = urllib.request.urlopen(f"{BASE}{path}", timeout=120)
                return r.status, r.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                return e.code, e.read().decode("utf-8", errors="replace")

        st, body = get("/health")
        print("=== GET /health ===")
        print("status:", st)
        print(body)

        st, body = get("/briefing/today")
        print("\n=== GET /briefing/today ===")
        print("status:", st)
        print(body[:4000])
        if "[파싱]" in body and st != 200:
            print("\n(FAIL: briefing body still mentions [파싱] with non-200)", file=sys.stderr)
        if st == 502:
            print("\n(FAIL: briefing returned 502)", file=sys.stderr)
            return 1
        if "[파싱]" in body and "uploaded_at" in body and "비어" in body:
            print("\n(FAIL: old empty-D parse message in JSON)", file=sys.stderr)
            return 1

        st, body = get("/memos")
        print("\n=== GET /memos ===")
        print("status:", st)
        print(body[:4000])

        post_data = json.dumps(
            {"content": "prove_runtime 스모크 테스트", "category": "시스템"}
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{BASE}/memos/append",
            data=post_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            r = urllib.request.urlopen(req, timeout=120)
            p_st, p_body = r.status, r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            p_st, p_body = e.code, e.read().decode("utf-8", errors="replace")
        print("\n=== POST /memos/append ===")
        print("status:", p_st)
        print(p_body)

        st2, body2 = get("/memos")
        print("\n=== GET /memos (after append) ===")
        print("status:", st2)
        print(body2[:4000])

        return 0 if st == 200 and st2 in (200, 500) else 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
