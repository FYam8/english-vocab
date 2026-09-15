from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
INDEX = ROOT / "index.html"
MANIFEST = SRC / "manifest.json"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def assemble() -> bytes:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("format") != "waseda-vocab-byte-split/v1":
        raise SystemExit("Unsupported Waseda source manifest format")

    parts: list[bytes] = []
    for name in manifest["assemblyOrder"]:
        content = (SRC / name).read_bytes()
        expected = manifest["parts"][name]
        if len(content) != expected["bytes"]:
            raise SystemExit(f"Byte length mismatch for {name}")
        if sha256(content) != expected["sha256"]:
            raise SystemExit(f"SHA-256 mismatch for {name}")
        parts.append(content)
    return b"".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Require assembled bytes to equal index.html")
    parser.add_argument("--write", action="store_true", help="Replace index.html with assembled bytes")
    args = parser.parse_args()
    if not args.check and not args.write:
        parser.error("choose --check or --write")

    rebuilt = assemble()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if sha256(rebuilt) != manifest["sourceSha256"]:
        raise SystemExit("Assembled source does not match the bootstrapped production SHA-256")

    if args.check:
        current = INDEX.read_bytes()
        if current != rebuilt:
            raise SystemExit("index.html differs from deterministic Waseda source assembly")
        print("Waseda deterministic assembly: BYTE-EXACT PASS")

    if args.write:
        INDEX.write_bytes(rebuilt)
        print(f"Wrote {len(rebuilt)} bytes to index.html")


if __name__ == "__main__":
    main()
