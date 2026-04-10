"""Apply Doc reference + Next run prompt to DB Integration Pipeline (batch PATCH).
Requires: AIRTABLE_PAT or AIRTABLE_API_KEY in the environment (Personal Access Token).

Usage (repo root):
  python docs/database/runs/apply-airtable-doc-links.py

Uses docs/database/runs/_airtable_update_batches.json (generated alongside this workflow).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_ID = "appDbIOVX38X6U8Sf"
TABLE_ID = "tblknpuhcvbttvwYi"


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        key, _, val = s.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    _load_dotenv(repo_root / ".env")

    token = os.environ.get("AIRTABLE_PAT") or os.environ.get("AIRTABLE_API_KEY")
    if not token:
        print("Set AIRTABLE_PAT (or AIRTABLE_API_KEY) and re-run.", file=sys.stderr)
        sys.exit(1)

    root = Path(__file__).resolve().parent
    batches_path = root / "_airtable_update_batches.json"
    batches: list[list[dict]] = json.loads(batches_path.read_text(encoding="utf-8"))

    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}"
    for i, records in enumerate(batches):
        body = json.dumps({"records": records}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="PATCH",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
            raise SystemExit(f"Batch {i + 1}/{len(batches)} failed: {e}") from e
        print(f"Batch {i + 1}/{len(batches)} OK ({len(records)} records)")


if __name__ == "__main__":
    main()
