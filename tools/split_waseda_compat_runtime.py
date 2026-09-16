from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
COMPAT = SRC / "30-compat-runtime.js"
V76 = SRC / "35-v76-memory-runtime.js"
TAIL = SRC / "40-runtime-bootstrap-tail.js"
MANIFEST = SRC / "manifest.json"

V76_START = b"/* V76_MEMORY_CURVE_SCHEDULER_START */\n"
V76_END = b"/* V76_MEMORY_CURVE_SCHEDULER_END */\n"
V75_END = b"/* V75_USER_TEST_REMEDIATION_END */\n"
LEGACY_NAME = "30-compat-runtime.js"
V76_NAME = "35-v76-memory-runtime.js"
TAIL_NAME = "40-runtime-bootstrap-tail.js"


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def write_manifest(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_split() -> None:
    if not V76.is_file() or not TAIL.is_file():
        raise SystemExit("Compatibility split is partial; both v7.6 and bootstrap-tail files must exist")
    compat = COMPAT.read_bytes()
    v76 = V76.read_bytes()
    tail = TAIL.read_bytes()
    if V76_START in compat or V76_END in compat:
        raise SystemExit("v7.6 runtime still present in 30-compat-runtime.js")
    if not v76.startswith(V76_START) or not v76.endswith(V76_END):
        raise SystemExit("35-v76-memory-runtime.js boundaries are invalid")
    if not tail.startswith(V75_END):
        raise SystemExit("40-runtime-bootstrap-tail.js does not begin at the reviewed v7.5 tail boundary")
    manifest = load_manifest()
    order = manifest.get("assemblyOrder", [])
    expected = [LEGACY_NAME, V76_NAME, TAIL_NAME]
    try:
        i = order.index(LEGACY_NAME)
    except ValueError as exc:
        raise SystemExit("30-compat-runtime.js missing from assembly order") from exc
    if order[i:i + 3] != expected:
        raise SystemExit("Compatibility split assembly order is not canonical")


def split_once() -> None:
    if V76.exists() or TAIL.exists():
        validate_split()
        print("Waseda compatibility runtime split: ALREADY APPLIED")
        return

    raw = COMPAT.read_bytes()
    if raw.count(V76_START) != 1 or raw.count(V76_END) != 1 or raw.count(V75_END) != 1:
        raise SystemExit("Reviewed compatibility split markers are not unique")

    start = raw.index(V76_START)
    end = raw.index(V76_END, start) + len(V76_END)
    if end <= start:
        raise SystemExit("Invalid v7.6 runtime marker ordering")

    compat = raw[:start]
    v76 = raw[start:end]
    tail = raw[end:]
    if not tail.startswith(V75_END):
        raise SystemExit("Unexpected content between v7.6 end and v7.5 compatibility tail")
    if compat + v76 + tail != raw:
        raise SystemExit("Mechanical compatibility split changed source bytes")

    COMPAT.write_bytes(compat)
    V76.write_bytes(v76)
    TAIL.write_bytes(tail)

    manifest = load_manifest()
    order = list(manifest.get("assemblyOrder", []))
    if order.count(LEGACY_NAME) != 1:
        raise SystemExit("Expected exactly one 30-compat-runtime.js in assembly order")
    i = order.index(LEGACY_NAME)
    order[i:i + 1] = [LEGACY_NAME, V76_NAME, TAIL_NAME]
    manifest["assemblyOrder"] = order
    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["compatibilityRuntimeV75"] = LEGACY_NAME
    boundaries["memorySchedulerV76"] = V76_NAME
    boundaries["runtimeBootstrapTail"] = TAIL_NAME
    boundaries.pop("compatibilityRuntime", None)
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "30/35/40 are a byte-preserving mechanical decomposition of the reviewed compatibility runtime: "
        "v7.5 compatibility, v7.6 memory scheduler, then bootstrap tail. No runtime semantics are changed by this split."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_manifest(manifest)
    validate_split()
    print("Waseda compatibility runtime split: PASS (byte-preserving)")


if __name__ == "__main__":
    split_once()
