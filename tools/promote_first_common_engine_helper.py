from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
READINESS = SRC / "engine-extraction-readiness.json"
ENGINE = SRC / "20-engine-candidate.js"
PLANNING = SRC / "32-session-planning-runtime.js"

SYMBOL = "v75WeightedWithoutReplacement"
START = "function v75WeightedWithoutReplacement(pool,count,scoreFn){\n"
END = "function v75ChallengeScore(v){\n"
TARGET_ANCHOR = "function chooseNext(){\n"


def load_readiness() -> dict:
    return json.loads(READINESS.read_text(encoding="utf-8"))


def write_readiness(data: dict) -> None:
    READINESS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_promoted(data: dict, engine: str, planning: str) -> None:
    if data.get("firstPromotion") != SYMBOL or data.get("firstPromotionStatus") != "promoted":
        raise SystemExit("first promotion contract is not in promoted state")
    if START not in engine:
        raise SystemExit("promoted helper missing from engine candidate")
    if START in planning:
        raise SystemExit("promoted helper still duplicated in session-planning runtime")
    promoted = [x for x in data.get("promotedSchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(promoted) != 1:
        raise SystemExit("promoted helper contract entry is missing or duplicated")
    item = promoted[0]
    if item.get("previousSource") != "32-session-planning-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("promoted helper ownership metadata changed unexpectedly")


def main() -> None:
    data = load_readiness()
    engine = ENGINE.read_text(encoding="utf-8")
    planning = PLANNING.read_text(encoding="utf-8")

    if data.get("firstPromotionStatus") == "promoted":
        validate_promoted(data, engine, planning)
        print("First common-engine helper promotion: ALREADY APPLIED")
        return

    if data.get("firstPromotion") != SYMBOL or data.get("firstPromotionStatus") != "pending":
        raise SystemExit("unexpected first-promotion contract state")

    ready = [x for x in data.get("readySchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(ready) != 1:
        raise SystemExit("first promotion must have exactly one ready-helper entry")
    item = ready[0]
    if item.get("source") != "32-session-planning-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("first promotion source/target changed without review")

    if planning.count(START) != 1 or planning.count(END) != 1:
        raise SystemExit("reviewed first-helper source boundaries are not unique")
    if START in engine:
        raise SystemExit("first helper is already present in engine candidate while contract says pending")
    if engine.count(TARGET_ANCHOR) != 1:
        raise SystemExit("engine insertion anchor is not unique")

    start = planning.index(START)
    end = planning.index(END, start)
    block = planning[start:end]
    if not block.endswith("\n"):
        raise SystemExit("reviewed helper block does not end at a line boundary")

    for token in data.get("blockedTokensForReadyHelpers", []):
        if token in block:
            raise SystemExit(f"refusing to promote helper with blocked Waseda token: {token}")
    for forbidden in ["getProgress(", "schedulerScore(", "VOCAB", "state.", "session.", "priority", "studyLayer"]:
        if forbidden in block:
            raise SystemExit(f"refusing to promote policy-coupled helper: {forbidden}")
    if "weightedChoice(" not in block:
        raise SystemExit("first helper lost its reviewed generic dependency")

    planning_after = planning[:start] + planning[end:]
    engine_after = engine.replace(TARGET_ANCHOR, block + TARGET_ANCHOR, 1)

    if planning_after.count(START) != 0 or engine_after.count(START) != 1:
        raise SystemExit("first helper move did not produce a single canonical definition")

    data["readySchoolNeutralHelpers"] = [x for x in data.get("readySchoolNeutralHelpers", []) if x.get("symbol") != SYMBOL]
    promoted = list(data.get("promotedSchoolNeutralHelpers", []))
    promoted.append({
        "symbol": SYMBOL,
        "previousSource": item["source"],
        "target": item["target"],
        "reason": item["reason"],
        "promotionType": "definition-move-only; name and function body unchanged"
    })
    data["promotedSchoolNeutralHelpers"] = promoted
    data["firstPromotionStatus"] = "promoted"

    ENGINE.write_text(engine_after, encoding="utf-8")
    PLANNING.write_text(planning_after, encoding="utf-8")
    write_readiness(data)
    validate_promoted(data, engine_after, planning_after)
    print("First common-engine helper promotion: PASS")


if __name__ == "__main__":
    main()
