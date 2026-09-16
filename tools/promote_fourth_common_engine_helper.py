from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
READINESS = SRC / "engine-extraction-readiness.json"
ENGINE = SRC / "20-engine-candidate.js"
V76_CORE = SRC / "35-v76-memory-runtime.js"

SYMBOL = "v76IntervalForTarget"
BLOCK = (
    "function v76IntervalForTarget(stabilityDays,targetRetention){\n"
    "  const s=Math.max(.05,Number(stabilityDays)||.05);\n"
    "  const t=v76Clamp(targetRetention,.80,.97);\n"
    "  return s*Math.log(t)/Math.log(.9);\n"
    "}\n"
)
TARGET_ANCHOR = "function v75WeightedWithoutReplacement(pool,count,scoreFn){\n"


def load_readiness() -> dict:
    return json.loads(READINESS.read_text(encoding="utf-8"))


def write_readiness(data: dict) -> None:
    READINESS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def third_validation_green(data: dict) -> bool:
    v = data.get("thirdPromotionValidation", {})
    return (
        data.get("thirdPromotionStatus") == "promoted"
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
    if data.get("fourthPromotion") != SYMBOL or data.get("fourthPromotionStatus") != "promoted":
        raise SystemExit("fourth promotion contract is not in promoted state")
    if BLOCK not in engine:
        raise SystemExit("fourth promoted helper missing from engine candidate")
    if BLOCK in core:
        raise SystemExit("fourth promoted helper still duplicated in v7.6 core")
    promoted = [x for x in data.get("promotedSchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(promoted) != 1:
        raise SystemExit("fourth promoted helper contract entry is missing or duplicated")
    item = promoted[0]
    if item.get("previousSource") != "35-v76-memory-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("fourth promoted helper ownership metadata changed unexpectedly")


def main() -> None:
    data = load_readiness()
    engine = ENGINE.read_text(encoding="utf-8")
    core = V76_CORE.read_text(encoding="utf-8")

    if not third_validation_green(data):
        raise SystemExit("refusing fourth promotion until the third helper has exact-head and synthetic-merge green validation")

    if data.get("fourthPromotionStatus") == "promoted":
        validate_promoted(data, engine, core)
        print("Fourth common-engine helper promotion: ALREADY APPLIED")
        return

    if data.get("fourthPromotion") != SYMBOL or data.get("fourthPromotionStatus") != "pending":
        raise SystemExit("unexpected fourth-promotion contract state")

    ready = [x for x in data.get("readySchoolNeutralHelpers", []) if x.get("symbol") == SYMBOL]
    if len(ready) != 1:
        raise SystemExit("fourth promotion must have exactly one ready-helper entry")
    item = ready[0]
    if item.get("source") != "35-v76-memory-runtime.js" or item.get("target") != "20-engine-candidate.js":
        raise SystemExit("fourth promotion source/target changed without review")

    if core.count(BLOCK) != 1:
        raise SystemExit("reviewed v76IntervalForTarget block is not unique")
    if BLOCK in engine:
        raise SystemExit("v76IntervalForTarget already exists in engine candidate while contract says pending")
    if engine.count(TARGET_ANCHOR) != 1:
        raise SystemExit("engine insertion anchor for v76IntervalForTarget is not unique")

    for token in data.get("blockedTokensForReadyHelpers", []):
        if token in BLOCK:
            raise SystemExit(f"refusing v76IntervalForTarget promotion with blocked Waseda token: {token}")
    if any(x in BLOCK for x in ["getProgress(", "schedulerScore(", "VOCAB", "state.", "session.", "priority", "studyLayer"]):
        raise SystemExit("refusing policy-coupled v76IntervalForTarget promotion")

    core_after = core.replace(BLOCK, "", 1)
    engine_after = engine.replace(TARGET_ANCHOR, BLOCK + TARGET_ANCHOR, 1)
    if core_after.count(BLOCK) != 0 or engine_after.count(BLOCK) != 1:
        raise SystemExit("v76IntervalForTarget move did not produce a single canonical definition")

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
    data["fourthPromotionStatus"] = "promoted"

    ENGINE.write_text(engine_after, encoding="utf-8")
    V76_CORE.write_text(core_after, encoding="utf-8")
    write_readiness(data)
    validate_promoted(data, engine_after, core_after)
    print("Fourth common-engine helper promotion: PASS")


if __name__ == "__main__":
    main()
