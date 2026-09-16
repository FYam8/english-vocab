from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
PRELUDE = SRC / "30-compat-runtime.js"
SESSION = SRC / "31-waseda-session-runtime.js"
PLANNING = SRC / "32-session-planning-runtime.js"
UI = SRC / "33-v75-ui-runtime.js"
MANIFEST = SRC / "manifest.json"

PRELUDE_NAME = "30-compat-runtime.js"
SESSION_NAME = "31-waseda-session-runtime.js"
PLANNING_NAME = "32-session-planning-runtime.js"
UI_NAME = "33-v75-ui-runtime.js"

SESSION_ANCHOR = b"function v75SerializeCurrentQuestion(){\n"
PLANNING_ANCHOR = b"function v75WeightedWithoutReplacement(pool,count,scoreFn){\n"
UI_ANCHOR = b"const v74ChooseType=chooseType;\n"


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def write_manifest(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def reviewed_cut(raw: bytes, anchor: bytes) -> int:
    """Cut before the single separator newline when the reviewed source has a blank line.

    This keeps the previous source part from ending with an extra blank line (git diff --check)
    while preserving the concatenated byte stream exactly. The separator newline becomes the
    first byte of the next part.
    """
    i = raw.index(anchor)
    if i >= 2 and raw[i - 2:i] == b"\n\n":
        return i - 1
    return i


def starts_at_reviewed_boundary(part: bytes, anchor: bytes) -> bool:
    return part.startswith(anchor) or part.startswith(b"\n" + anchor)


def validate_split() -> None:
    if not SESSION.is_file() or not PLANNING.is_file() or not UI.is_file():
        raise SystemExit("v7.5 compatibility split is partial")
    prelude = PRELUDE.read_bytes()
    session = SESSION.read_bytes()
    planning = PLANNING.read_bytes()
    ui = UI.read_bytes()
    if SESSION_ANCHOR in prelude or PLANNING_ANCHOR in prelude or UI_ANCHOR in prelude:
        raise SystemExit("v7.5 prelude still contains a moved runtime boundary")
    if not starts_at_reviewed_boundary(session, SESSION_ANCHOR):
        raise SystemExit("31-waseda-session-runtime.js boundary is invalid")
    if not starts_at_reviewed_boundary(planning, PLANNING_ANCHOR):
        raise SystemExit("32-session-planning-runtime.js boundary is invalid")
    if not starts_at_reviewed_boundary(ui, UI_ANCHOR):
        raise SystemExit("33-v75-ui-runtime.js boundary is invalid")
    if prelude.endswith(b"\n\n") or session.endswith(b"\n\n") or planning.endswith(b"\n\n"):
        raise SystemExit("split source part ends with an extra blank line")
    if PLANNING_ANCHOR in session or UI_ANCHOR in session:
        raise SystemExit("session runtime overlaps a later v7.5 boundary")
    if UI_ANCHOR in planning:
        raise SystemExit("planning runtime overlaps the v7.5 UI boundary")

    manifest = load_manifest()
    order = manifest.get("assemblyOrder", [])
    expected = [PRELUDE_NAME, SESSION_NAME, PLANNING_NAME, UI_NAME]
    try:
        i = order.index(PRELUDE_NAME)
    except ValueError as exc:
        raise SystemExit("30-compat-runtime.js missing from assembly order") from exc
    if order[i:i + 4] != expected:
        raise SystemExit("v7.5 split assembly order is not canonical")


def split_once() -> None:
    if SESSION.exists() or PLANNING.exists() or UI.exists():
        validate_split()
        print("Waseda v7.5 runtime split: ALREADY APPLIED")
        return

    raw = PRELUDE.read_bytes()
    for label, anchor in [
        ("session", SESSION_ANCHOR),
        ("planning", PLANNING_ANCHOR),
        ("ui", UI_ANCHOR),
    ]:
        if raw.count(anchor) != 1:
            raise SystemExit(f"Reviewed v7.5 {label} split anchor is not unique")

    session_anchor_i = raw.index(SESSION_ANCHOR)
    planning_anchor_i = raw.index(PLANNING_ANCHOR)
    ui_anchor_i = raw.index(UI_ANCHOR)
    if not (0 < session_anchor_i < planning_anchor_i < ui_anchor_i < len(raw)):
        raise SystemExit("Reviewed v7.5 split anchors are not in the expected order")

    session_i = reviewed_cut(raw, SESSION_ANCHOR)
    planning_i = reviewed_cut(raw, PLANNING_ANCHOR)
    ui_i = reviewed_cut(raw, UI_ANCHOR)
    if not (0 < session_i < planning_i < ui_i < len(raw)):
        raise SystemExit("Reviewed v7.5 split cuts are not in the expected order")

    prelude = raw[:session_i]
    session = raw[session_i:planning_i]
    planning = raw[planning_i:ui_i]
    ui = raw[ui_i:]
    if prelude + session + planning + ui != raw:
        raise SystemExit("Mechanical v7.5 split changed source bytes")

    PRELUDE.write_bytes(prelude)
    SESSION.write_bytes(session)
    PLANNING.write_bytes(planning)
    UI.write_bytes(ui)

    manifest = load_manifest()
    order = list(manifest.get("assemblyOrder", []))
    if order.count(PRELUDE_NAME) != 1:
        raise SystemExit("Expected exactly one 30-compat-runtime.js in assembly order")
    i = order.index(PRELUDE_NAME)
    order[i:i + 1] = [PRELUDE_NAME, SESSION_NAME, PLANNING_NAME, UI_NAME]
    manifest["assemblyOrder"] = order
    boundaries = dict(manifest.get("boundaries", {}))
    boundaries.pop("compatibilityRuntimeV75", None)
    boundaries["compatibilityRuntimeV75Prelude"] = PRELUDE_NAME
    boundaries["wasedaSessionRuntimeV75"] = SESSION_NAME
    boundaries["sessionPlanningRuntimeV75"] = PLANNING_NAME
    boundaries["uiRuntimeV75"] = UI_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    stale = "30-compat-runtime.js contains the existing v7.5/v7.6 compatibility/runtime overrides and will be decomposed only under parity tests."
    if stale in notes:
        notes.remove(stale)
    note = (
        "30/31/32/33 are a byte-preserving decomposition of the reviewed v7.5 compatibility runtime into prelude, "
        "Waseda session state, session planning, and UI/question behavior. Ownership is descriptive only; runtime order is unchanged."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_manifest(manifest)
    validate_split()
    print("Waseda v7.5 runtime split: PASS (byte-preserving)")


if __name__ == "__main__":
    split_once()
