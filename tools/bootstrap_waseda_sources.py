from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUT = ROOT / "src" / "waseda-bootstrap"
BASELINE_BLOB_SHA = "bb77a0c54153502e25bccb1ed89ca33b29b45c83"

DATA_START = b"const VOCAB="
RUNTIME_START = b"const SCHEMA_VERSION=7;"
SUFFIX_START = b"\n</script>\n<script src=\"progress-sync.js?v=vocab-cloud2\"></script>"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(path: Path) -> str:
    return subprocess.check_output(
        ["git", "hash-object", str(path.relative_to(ROOT))],
        cwd=ROOT,
        text=True,
    ).strip()


def main() -> None:
    raw = INDEX.read_bytes()
    actual_blob = git_blob_sha(INDEX)
    if actual_blob != BASELINE_BLOB_SHA:
        raise SystemExit(
            "Refusing mechanical bootstrap because index.html no longer matches the reviewed "
            f"production blob. expected={BASELINE_BLOB_SHA} actual={actual_blob}"
        )

    data_at = raw.index(DATA_START)
    runtime_at = raw.index(RUNTIME_START, data_at)
    suffix_at = raw.index(SUFFIX_START, runtime_at)

    parts = {
        "00-shell-prefix.html": raw[:data_at],
        "10-waseda-data.js": raw[data_at:runtime_at],
        "20-legacy-runtime.js": raw[runtime_at:suffix_at],
        "90-shell-suffix.html": raw[suffix_at:],
    }

    rebuilt = b"".join(parts.values())
    if rebuilt != raw:
        raise SystemExit("Mechanical split is not byte-exact; refusing to write sources")

    OUT.mkdir(parents=True, exist_ok=True)
    for name, content in parts.items():
        (OUT / name).write_bytes(content)

    manifest = {
        "format": "waseda-vocab-byte-split/v1",
        "source": "index.html",
        "sourceGitBlobSha": actual_blob,
        "sourceSha256": sha256(raw),
        "assemblyOrder": list(parts.keys()),
        "parts": {
            name: {"bytes": len(content), "sha256": sha256(content)}
            for name, content in parts.items()
        },
        "notes": [
            "This is a mechanical bootstrap only; no behavior or persistence semantics change.",
            "20-legacy-runtime.js is intentionally not yet claimed to be school-neutral.",
            "The next refactor step moves code across engine/adapter boundaries under parity tests.",
        ],
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Waseda source bootstrap: {len(raw)} bytes split byte-exactly into {len(parts)} parts")
    print(f"index git blob: {actual_blob}")
    print(f"index sha256:   {manifest['sourceSha256']}")


if __name__ == "__main__":
    main()
