from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
COMMON = ROOT / "src" / "common-engine"
POLICY = SRC / "34-waseda-memory-policy.js"
MEMORY = SRC / "35-v76-memory-runtime.js"
MANIFEST = SRC / "manifest.json"
CONTRACT = COMMON / "policy-contract.json"
VALIDATION = COMMON / "policy-contract-validation.json"

POLICY_NAME = "34-waseda-memory-policy.js"
MEMORY_NAME = "35-v76-memory-runtime.js"

POLICY_CONTENT = '''/*
 * Waseda-only memory scheduling policy adapter.
 * These values and predicates are extracted from the reviewed v7.6 runtime
 * without changing learner state, persistence identifiers or scheduler outputs.
 */
const WASEDA_MEMORY_POLICY=Object.freeze({
  targetRetention(v,p){
    const s=v&&v.priority==="S",w=!!(p&&isWeakProgress(p));
    if(s&&w)return .93;
    if(s||w)return .92;
    return .90;
  },
  reviewIntervalDays(v,p,model){
    return v76Clamp(v76IntervalForTarget(model.stabilityDays,WASEDA_MEMORY_POLICY.targetRetention(v,p)),.75,60);
  },
  isDiagnosticFirstPass(v,p,attemptsBefore){
    return (v.studyLayer||"core")==="diagnostic"&&attemptsBefore===0&&p.incorrect===0;
  },
  retryCorrectIntervalDays:1,
  missIntervalMinutes:15
});
'''

OLD_TARGET = '''function v76TargetRetention(v,p){
  const s=v&&v.priority==="S",w=!!(p&&isWeakProgress(p));
  if(s&&w)return .93;
  if(s||w)return .92;
  return .90;
}
'''
NEW_TARGET = '''function v76TargetRetention(v,p){
  return WASEDA_MEMORY_POLICY.targetRetention(v,p);
}
'''
OLD_INTERVAL = '''function v76ReviewIntervalDays(v,p,model){
  return v76Clamp(v76IntervalForTarget(model.stabilityDays,v76TargetRetention(v,p)),.75,60);
}
'''
NEW_INTERVAL = '''function v76ReviewIntervalDays(v,p,model){
  return WASEDA_MEMORY_POLICY.reviewIntervalDays(v,p,model);
}
'''
OLD_DIAGNOSTIC = 'if((v.studyLayer||"core")==="diagnostic"&&ctx.attemptsBefore===0&&p.incorrect===0){'
NEW_DIAGNOSTIC = 'if(WASEDA_MEMORY_POLICY.isDiagnosticFirstPass(v,p,ctx.attemptsBefore)){'
OLD_RETRY = 'const days=pending.isRetry?1:v76ReviewIntervalDays(v,p,m);'
NEW_RETRY = 'const days=pending.isRetry?WASEDA_MEMORY_POLICY.retryCorrectIntervalDays:v76ReviewIntervalDays(v,p,m);'
OLD_MISS = '''m.lastIntervalDays=15*V76_MINUTE_MS/V76_DAY_MS;
    p.nextReview=new Date(ctx.nowMs+15*V76_MINUTE_MS).toISOString();'''
NEW_MISS = '''m.lastIntervalDays=WASEDA_MEMORY_POLICY.missIntervalMinutes*V76_MINUTE_MS/V76_DAY_MS;
    p.nextReview=new Date(ctx.nowMs+WASEDA_MEMORY_POLICY.missIntervalMinutes*V76_MINUTE_MS).toISOString();'''


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_policy_approval() -> None:
    contract = load_json(CONTRACT)
    validation = load_json(VALIDATION)
    if contract.get("firstRuntimeBoundary", {}).get("name") != "memory-scheduler-policy-adapter":
        raise SystemExit("unexpected first runtime policy boundary")
    if validation.get("approvedRuntimeBoundary") != "memory-scheduler-policy-adapter":
        raise SystemExit("memory scheduler policy adapter is not approved")
    if validation.get("allowWasedaAdapterIntroduction") is not True:
        raise SystemExit("Waseda adapter introduction is not approved")
    if validation.get("allowRikkyoRuntimeMutation") is not False:
        raise SystemExit("Rikkyo runtime mutation must remain forbidden in this step")
    if validation.get("allowProductionMainMutation") is not False:
        raise SystemExit("production main mutation must remain forbidden in this step")
    for key in ["branchTwoPass", "syntheticMergeTwoPass", "branchOwnership", "syntheticMergeOwnership"]:
        if validation.get(key) != "success":
            raise SystemExit(f"policy contract validation is incomplete: {key}")


def replace_exact_once(text: str, old: str, new: str, label: str) -> str:
    if new in text and old not in text:
        return text
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one reviewed source form, found {text.count(old)}")
    return text.replace(old, new, 1)


def validate_applied(memory: str, manifest: dict) -> None:
    policy = POLICY.read_text(encoding="utf-8") if POLICY.is_file() else ""
    if policy != POLICY_CONTENT:
        raise SystemExit("Waseda memory policy adapter content drifted")
    for required in [NEW_TARGET, NEW_INTERVAL, NEW_DIAGNOSTIC, NEW_RETRY, NEW_MISS]:
        if required not in memory:
            raise SystemExit(f"Waseda memory runtime missing policy delegation: {required[:80]}")
    for forbidden in [OLD_TARGET, OLD_INTERVAL, OLD_DIAGNOSTIC, OLD_RETRY, OLD_MISS]:
        if forbidden in memory:
            raise SystemExit("Waseda memory policy remains duplicated in runtime core")
    order = manifest.get("assemblyOrder", [])
    if order.count(POLICY_NAME) != 1 or order.count(MEMORY_NAME) != 1:
        raise SystemExit("Waseda memory policy/runtime assembly entries are missing or duplicated")
    if order.index(POLICY_NAME) + 1 != order.index(MEMORY_NAME):
        raise SystemExit("Waseda memory policy must assemble immediately before v7.6 memory runtime")
    if manifest.get("boundaries", {}).get("wasedaMemoryPolicyV76") != POLICY_NAME:
        raise SystemExit("Waseda memory policy manifest boundary is missing")


def main() -> None:
    require_policy_approval()
    memory = MEMORY.read_text(encoding="utf-8")
    manifest = load_json(MANIFEST)

    if POLICY.exists():
        validate_applied(memory, manifest)
        print("Waseda memory policy adapter: ALREADY APPLIED")
        return

    memory = replace_exact_once(memory, OLD_TARGET, NEW_TARGET, "target retention")
    memory = replace_exact_once(memory, OLD_INTERVAL, NEW_INTERVAL, "review interval")
    memory = replace_exact_once(memory, OLD_DIAGNOSTIC, NEW_DIAGNOSTIC, "diagnostic first pass")
    memory = replace_exact_once(memory, OLD_RETRY, NEW_RETRY, "retry correct interval")
    memory = replace_exact_once(memory, OLD_MISS, NEW_MISS, "miss interval")

    POLICY.write_text(POLICY_CONTENT, encoding="utf-8")
    MEMORY.write_text(memory, encoding="utf-8")

    order = list(manifest.get("assemblyOrder", []))
    if POLICY_NAME in order:
        raise SystemExit("Waseda memory policy assembly entry already exists without source file")
    if order.count(MEMORY_NAME) != 1:
        raise SystemExit("expected exactly one v7.6 memory runtime assembly entry")
    order.insert(order.index(MEMORY_NAME), POLICY_NAME)
    manifest["assemblyOrder"] = order
    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["wasedaMemoryPolicyV76"] = POLICY_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "34-waseda-memory-policy.js owns the current Waseda target-retention, review-interval, "
        "diagnostic-first-pass and retry/miss interval policy. 35-v76-memory-runtime.js delegates "
        "to it without changing learner persistence or scheduler outputs."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_json(MANIFEST, manifest)
    validate_applied(memory, manifest)
    print("Waseda memory policy adapter: PASS")


if __name__ == "__main__":
    main()
