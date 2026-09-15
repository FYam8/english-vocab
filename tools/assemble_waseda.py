from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
INDEX = ROOT / "index.html"
MANIFEST = SRC / "manifest.json"
FORMAT_V1 = "waseda-vocab-byte-split/v1"
FORMAT_V2 = "waseda-vocab-source-assembly/v2"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("format") not in {FORMAT_V1, FORMAT_V2}:
        raise SystemExit(f"Unsupported Waseda source manifest format: {manifest.get('format')}")
    return manifest


def read_parts(manifest: dict, verify_recorded_hashes: bool) -> tuple[list[tuple[str, bytes]], bytes]:
    parts: list[tuple[str, bytes]] = []
    for name in manifest["assemblyOrder"]:
        path = SRC / name
        if not path.is_file():
            raise SystemExit(f"Missing Waseda source part: {name}")
        content = path.read_bytes()
        if verify_recorded_hashes:
            expected = manifest.get("parts", {}).get(name)
            if not expected:
                raise SystemExit(f"Missing manifest metadata for {name}")
            if len(content) != expected["bytes"]:
                raise SystemExit(f"Byte length mismatch for {name}")
            if sha256(content) != expected["sha256"]:
                raise SystemExit(f"SHA-256 mismatch for {name}")
        parts.append((name, content))
    return parts, b"".join(content for _, content in parts)


def refresh_manifest(manifest: dict, parts: list[tuple[str, bytes]], rebuilt: bytes) -> dict:
    baseline_blob = manifest.get("baselineSourceGitBlobSha") or manifest.get("sourceGitBlobSha")
    baseline_sha = manifest.get("baselineSourceSha256") or manifest.get("sourceSha256")
    if not baseline_blob or not baseline_sha:
        raise SystemExit("Cannot preserve production baseline identity while refreshing manifest")

    next_manifest = dict(manifest)
    next_manifest["format"] = FORMAT_V2
    next_manifest["baselineSourceGitBlobSha"] = baseline_blob
    next_manifest["baselineSourceSha256"] = baseline_sha
    next_manifest["artifactSha256"] = sha256(rebuilt)
    next_manifest["parts"] = {
        name: {"bytes": len(content), "sha256": sha256(content)}
        for name, content in parts
    }
    next_manifest.pop("sourceGitBlobSha", None)
    next_manifest.pop("sourceSha256", None)
    return next_manifest


def write_manifest(manifest: dict) -> None:
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Require source manifest and index.html to match")
    parser.add_argument("--write", action="store_true", help="Assemble index.html from current split sources and refresh manifest")
    args = parser.parse_args()
    if args.check == args.write:
        parser.error("choose exactly one of --check or --write")

    manifest = load_manifest()

    if args.check:
        parts, rebuilt = read_parts(manifest, verify_recorded_hashes=True)
        expected_artifact = manifest.get("artifactSha256") or manifest.get("sourceSha256")
        if not expected_artifact or sha256(rebuilt) != expected_artifact:
            raise SystemExit("Assembled artifact SHA-256 does not match the source manifest")
        current = INDEX.read_bytes()
        if current != rebuilt:
            raise SystemExit("index.html differs from deterministic Waseda source assembly")
        print(f"Waseda deterministic assembly: PASS ({len(parts)} parts, {len(rebuilt)} bytes)")
        return

    parts, rebuilt = read_parts(manifest, verify_recorded_hashes=False)
    INDEX.write_bytes(rebuilt)
    next_manifest = refresh_manifest(manifest, parts, rebuilt)
    write_manifest(next_manifest)
    print(f"Wrote {len(rebuilt)} bytes to index.html from {len(parts)} source parts")
    print(f"artifact sha256: {next_manifest['artifactSha256']}")


if __name__ == "__main__":
    main()
