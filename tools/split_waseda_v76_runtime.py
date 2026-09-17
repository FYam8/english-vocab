from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
CORE = SRC / "35-v76-memory-runtime.js"
INTEGRATION = SRC / "36-v76-engine-integration.js"
UI = SRC / "37-v76-waseda-ui-runtime.js"
MANIFEST = SRC / "manifest.json"

CORE_NAME = "35-v76-memory-runtime.js"
INTEGRATION_NAME = "36-v76-engine-integration.js"
UI_NAME = "37-v76-waseda-ui-runtime.js"

V76_START = b"/* V76_MEMORY_CURVE_SCHEDULER_START */\n"
V76_END = b"/* V76_MEMORY_CURVE_SCHEDULER_END */\n"
INTEGRATION_ANCHOR = b"v75ApplyMainOutcome=function(v,pending){\n"
UI_ANCHOR = b"function v76MemoryDetailHTML(v,p){\n"


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def write_manifest(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def reviewed_cut(raw: bytes, anchor: bytes) -> int:
    i = raw.index(anchor)
    if i >= 2 and raw[i - 2:i] == b"\n\n":
        return i - 1
    return i


def starts_at_reviewed_boundary(part: bytes, anchor: bytes) -> bool:
    return part.startswith(anchor) or part.startswith(b"\n" + anchor)


def validate_split() -> None:
    if not INTEGRATION.is_file() or not UI.is_file():
        raise SystemExit("v7.6 runtime sub-split is partial")
    core = CORE.read_bytes()
    integration = INTEGRATION.read_bytes()
    ui = UI.read_bytes()
    combined = core + integration + ui
    if not combined.startswith(V76_START) or not combined.endswith(V76_END):
        raise SystemExit("combined v7.6 runtime lost reviewed scheduler markers")
    if INTEGRATION_ANCHOR in core or UI_ANCHOR in core:
        raise SystemExit("v7.6 core still contains a moved integration/UI boundary")
    if not starts_at_reviewed_boundary(integration, INTEGRATION_ANCHOR):
        raise SystemExit("36-v76-engine-integration.js boundary is invalid")
    if not starts_at_reviewed_boundary(ui, UI_ANCHOR):
        raise SystemExit("37-v76-waseda-ui-runtime.js boundary is invalid")
    if UI_ANCHOR in integration:
        raise SystemExit("v7.6 integration overlaps UI boundary")
    if core.endswith(b"\n\n") or integration.endswith(b"\n\n"):
        raise SystemExit("v7.6 split source part ends with an extra blank line")

    manifest = load_manifest()
    order = manifest.get("assemblyOrder", [])
    expected = [CORE_NAME, INTEGRATION_NAME, UI_NAME]
    try:
        i = order.index(CORE_NAME)
    except ValueError as exc:
        raise SystemExit("35-v76-memory-runtime.js missing from assembly order") from exc
    if order[i:i + 3] != expected:
        raise SystemExit("v7.6 sub-split assembly order is not canonical")


def split_once() -> None:
    if INTEGRATION.exists() or UI.exists():
        validate_split()
        print("Waseda v7.6 runtime split: ALREADY APPLIED")
        return

    raw = CORE.read_bytes()
    if not raw.startswith(V76_START) or not raw.endswith(V76_END):
        raise SystemExit("35-v76-memory-runtime.js is not the reviewed complete v7.6 block")
    for label, anchor in [("integration", INTEGRATION_ANCHOR), ("ui", UI_ANCHOR)]:
        if raw.count(anchor) != 1:
            raise SystemExit(f"Reviewed v7.6 {label} split anchor is not unique")

    integration_anchor_i = raw.index(INTEGRATION_ANCHOR)
    ui_anchor_i = raw.index(UI_ANCHOR)
    if not (0 < integration_anchor_i < ui_anchor_i < len(raw)):
        raise SystemExit("Reviewed v7.6 split anchors are not in the expected order")

    integration_i = reviewed_cut(raw, INTEGRATION_ANCHOR)
    ui_i = reviewed_cut(raw, UI_ANCHOR)
    if not (0 < integration_i < ui_i < len(raw)):
        raise SystemExit("Reviewed v7.6 split cuts are not in the expected order")

    core = raw[:integration_i]
    integration = raw[integration_i:ui_i]
    ui = raw[ui_i:]
    if core + integration + ui != raw:
        raise SystemExit("Mechanical v7.6 split changed source bytes")

    CORE.write_bytes(core)
    INTEGRATION.write_bytes(integration)
    UI.write_bytes(ui)

    manifest = load_manifest()
    order = list(manifest.get("assemblyOrder", []))
    if order.count(CORE_NAME) != 1:
        raise SystemExit("Expected exactly one 35-v76-memory-runtime.js in assembly order")
    i = order.index(CORE_NAME)
    order[i:i + 1] = [CORE_NAME, INTEGRATION_NAME, UI_NAME]
    manifest["assemblyOrder"] = order
    boundaries = dict(manifest.get("boundaries", {}))
    boundaries.pop("memorySchedulerV76", None)
    boundaries["memorySchedulerCoreV76"] = CORE_NAME
    boundaries["memorySchedulerIntegrationV76"] = INTEGRATION_NAME
    boundaries["memorySchedulerWasedaUiV76"] = UI_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "35/36/37 are a byte-preserving decomposition of the reviewed v7.6 block into scheduler core, "
        "engine integration overrides, and Waseda UI/settings integration. No scheduler semantics are changed by this split."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_manifest(manifest)
    validate_split()
    print("Waseda v7.6 runtime split: PASS (byte-preserving)")


if __name__ == "__main__":
    split_once()
