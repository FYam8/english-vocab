from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
READINESS = SRC / "engine-extraction-readiness.json"
ENGINE = SRC / "20-engine-candidate.js"
V76_CORE = SRC / "35-v76-memory-runtime.js"

SYMBOL = "v76Clamp"
START = "function v76Clamp(x,lo,hi){return Math.max(lo,Math.min(hi,Number(x)))}\n"
END = "function v76StrongRecallType(type){"
TARGET_ANCHOR = "function v75WeightedWithoutReplacement(pool,count,scoreFn){\n"


def load_readiness() -> dict:
    return json.loads(READINESS.read_text(encoding="utf-8"))


def write_readiness(data: dict) -> None:
    READINESS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def first_validation_green(data: dict) -> bool:
    v = data.get("firstPromotionValidation", {})
    return (
        data.get("firstPromotionStatus") == "promoted"
        and isinstance(v.get("validatedHead"), str)
        and len(v["validatedHead"]) == 40
        and all(v.get(k) == "success" for k in [
            "branchTwoPass",
            "syntheticMergeTwoPass",
            "branchOwnership",
            "syntheticMergeOwnership",
        ])
    )


def validate_promoted(data: dict, engine: str, core: str) -> None:
    if data.get("secondPromotion") != SYMBOL or data.get("secondPromotionStatus") != "promoted":
        raise SystemExit("second promotion contract is not in promoted state")
    if START not in engine:
        raise SystemExit("second promoted helper missing from engine candidate")
    if START in core:
        raise SystemExit("second promoted helper still duplicated in v7.6 core")
    promoted = [x for x in data.get("promotedSchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(promoted) != 1:
        raise SystemExit("second promoted helper contract entry is missing or duplicated")
    item = promoted[0]
    if item.get("previousSource") != "35-v76-memory-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("second promoted helper ownership metadata changed unexpectedly")


def main() -> None:
    data = load_readiness()
    engine = ENGINE.read_text(encoding="utf-8")
    core = V76_CORE.read_text(encoding="utf-8")

    if not first_validation_green(data):
        raise SystemExit("refusing second promotion until the first helper has exact-head and synthetic-merge green validation")

    if data.get("secondPromotionStatus") == "promoted":
        validate_promoted(data, engine, core)
        print("Second common-engine helper promotion: ALREADY APPLIED")
        return

    if data.get("secondPromotion") != SYMBOL or data.get("secondPromotionStatus") != "pending":
        raise SystemExit("unexpected second-promotion contract state")

    ready = [x for x in data.get("readySchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(ready) != 1:
        raise SystemExit("second promotion must have exactly one ready-helper entry")
    item = ready[0]
    if item.get("source") != "35-v76-memory-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("second promotion source/target changed without review")

    if core.count(START) != 1 or core.count(END) != 1:
        raise SystemExit("reviewed v76Clamp source boundaries are not unique")
    if START in engine:
        raise SystemExit("v76Clamp already exists in engine candidate while contract says pending")
    if engine.count(TARGET_ANCHOR) != 1:
        raise SystemExit("engine insertion anchor for v76Clamp is not unique")

    start = core.index(START)
    end = core.index(END, start)
    block = core[start:end]
    if block != START:
        raise SystemExit("v76Clamp reviewed block changed; refusing automatic promotion")

    for token in data.get("blockedTokensForReadyHelpers", []):
        if token in block:
            raise SystemExit(f"refusing v76Clamp promotion with blocked Waseda token: {token}")
    if any(x in block for x in ["getProgress(", "schedulerScore(", "VOCAB", "state.", "session.", "priority", "studyLayer"]):
        raise SystemExit("refusing policy-coupled v76Clamp promotion")

    core_after = core[:start] + core[end:]
    engine_after = engine.replace(TARGET_ANCHOR, block + TARGET_ANCHOR, 1)
    if core_after.count(START) != 0 or engine_after.count(START) != 1:
        raise SystemExit("v76Clamp move did not produce a single canonical definition")

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
    data["secondPromotionStatus"] = "promoted"

    ENGINE.write_text(engine_after, encoding="utf-8")
    V76_CORE.write_text(core_after, encoding="utf-8")
    write_readiness(data)
    validate_promoted(data, engine_after, core_after)
    print("Second common-engine helper promotion: PASS")


if __name__ == "__main__":
    main()
