from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
COMMON = ROOT / "src" / "common-engine"
POLICY = SRC / "31a-waseda-planning-policy.js"
PLANNING = SRC / "32-session-planning-runtime.js"
MANIFEST = SRC / "manifest.json"
VALIDATION = COMMON / "session-planning-contract-validation.json"
CONTRACT = COMMON / "challenge-session-composition-contract.json"
POLICY_NAME = "31a-waseda-planning-policy.js"

POLICY_INSERT = '''  isChallengeEntity(v){return (v.studyLayer||"core")==="challenge"},
  isFoundationLayerEligible(v){
    const layer=v.studyLayer||"core";
    return layer!=="reference"&&layer!=="challenge";
  },
  isFoundationStateEligible(p,t){
    const due=p.nextReview&&new Date(p.nextReview).getTime()<=t;
    const recent=p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t;
    return isWeakProgress(p)||due||recent;
  },
  requiredChallengeCount(desired){return Math.ceil(desired*.8)},
  foundationExceptionCap(desired){return Math.floor(desired*.2)}
'''

REPLACEMENTS = [
    (
        '  const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"&&(!y||v.years.includes(y)));',
        '  const challenge=VOCAB.filter(v=>WASEDA_PLANNING_POLICY.isChallengeEntity(v)&&(!y||v.years.includes(y)));',
    ),
    (
        '  const required=Math.ceil(desired*.8);',
        '  const required=WASEDA_PLANNING_POLICY.requiredChallengeCount(desired);',
    ),
    (
        '    const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;\n'
        '    if(y&&!v.years.includes(y))return false;\n'
        '    const p=getProgress(v.id);\n'
        '    const due=p.nextReview&&new Date(p.nextReview).getTime()<=t;\n'
        '    const recent=p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t;\n'
        '    return isWeakProgress(p)||due||recent;',
        '    if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;\n'
        '    if(y&&!v.years.includes(y))return false;\n'
        '    const p=getProgress(v.id);\n'
        '    return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);',
    ),
    (
        '  const exceptionCap=Math.floor(desired*.2);',
        '  const exceptionCap=WASEDA_PLANNING_POLICY.foundationExceptionCap(desired);',
    ),
    (
        'challengeCount:combined.filter(v=>(v.studyLayer||"core")==="challenge").length',
        'challengeCount:combined.filter(v=>WASEDA_PLANNING_POLICY.isChallengeEntity(v)).length',
    ),
]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_approval() -> None:
    validation = load_json(VALIDATION)
    contract = load_json(CONTRACT)
    final_boundary = validation.get("finalSessionOrchestrationBoundary", {})
    final_validated = final_boundary.get("status") == "validated-two-consecutive-clean-runs"
    if validation.get("allowFullPlanningRuntimeMutation") is not False and not final_validated:
        raise SystemExit("full planning runtime mutation requires the validated final session boundary")
    if validation.get("allowThirdPlanningAdapterGroupIntroduction") is not True:
        raise SystemExit("third planning adapter group is not approved")
    if validation.get("thirdApprovedGroup") != "challenge-session-composition-policy-adapter":
        raise SystemExit("unexpected third approved planning adapter group")
    approval = validation.get("thirdPlanningAdapterApprovalValidation") or {}
    for key in ["branchTwoPass", "syntheticMergeTwoPass", "branchOwnership", "syntheticMergeOwnership", "assemble"]:
        if approval.get(key) != "success":
            raise SystemExit(f"third planning adapter approval validation incomplete: {key}")
    if approval.get("validatedHead") != "f65efc3de9a51cae4c22478eca27ca52a5bec777":
        raise SystemExit("third planning adapter approval is not pinned to the reviewed contract head")
    if approval.get("productionMainUnchanged") is not True or approval.get("rikkyoRuntimeUnchanged") is not True:
        raise SystemExit("third planning adapter approval lost production/Rikkyo isolation")
    if contract.get("format") != "waseda-challenge-session-composition-policy-contract/v1":
        raise SystemExit("unexpected challenge-session composition contract format")
    if contract.get("status") != "contract-only-no-runtime-mutation":
        raise SystemExit("challenge-session contract status changed before runtime transform")
    if contract.get("exactBehavior", {}).get("mustNotCreateProgressForLayerOrYearExcludedEntities") is not True:
        raise SystemExit("critical getProgress ordering invariant is not approved")


def validate_applied(policy: str, planning: str, manifest: dict) -> None:
    for token in [
        'isChallengeEntity(v){return (v.studyLayer||"core")==="challenge"}',
        'isFoundationLayerEligible(v){',
        'return layer!=="reference"&&layer!=="challenge";',
        'isFoundationStateEligible(p,t){',
        'return isWeakProgress(p)||due||recent;',
        'requiredChallengeCount(desired){return Math.ceil(desired*.8)}',
        'foundationExceptionCap(desired){return Math.floor(desired*.2)}',
    ]:
        if token not in policy:
            raise SystemExit(f"Waseda challenge-session policy token missing: {token}")
    for old, new in REPLACEMENTS:
        if new not in planning:
            raise SystemExit(f"approved planning delegation missing: {new}")
        if old in planning:
            raise SystemExit(f"legacy planning policy remains duplicated: {old}")

    start = planning.index("function buildChallengeSessionPlan(year,requested){")
    end = planning.index("function buildSessionPlan(mode,year,size){")
    block = planning[start:end]
    layer_i = block.index("if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;")
    year_i = block.index('if(y&&!v.years.includes(y))return false;')
    progress_i = block.index("const p=getProgress(v.id);")
    state_i = block.index("return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);")
    if not (layer_i < year_i < progress_i < state_i):
        raise SystemExit("foundation filter ordering changed; excluded entities could acquire default progress")

    final_boundary = load_json(VALIDATION).get("finalSessionOrchestrationBoundary", {})
    if final_boundary.get("status") == "validated-two-consecutive-clean-runs":
        delegated = [
            'VOCABULARY_SESSION_ENGINE.buildPlan({',
            'isSpecialMode:m=>WASEDA_PLANNING_POLICY.isChallengeMode(m)',
            'VOCABULARY_SESSION_ENGINE.dueRetry',
            'VOCABULARY_SESSION_ENGINE.pickUnlimitedBase',
            'recentWindow:WASEDA_PLANNING_POLICY.unlimitedRecentWindow',
            'VOCABULARY_SESSION_ENGINE.nextItem({',
        ]
        for token in delegated:
            if token not in planning:
                raise SystemExit(f"final session orchestration delegation changed: {token}")
    else:
        for untouched in [
            'if(size===0)return {unlimited:true,candidatePoolIds:pool.map(v=>v.id),baseQueueIds:[],actualSessionSize:0};',
            'if(mode==="75")return Object.assign({unlimited:false,candidatePoolIds:[]},buildChallengeSessionPlan(year,size));',
            'return session.retryQueue.filter(r=>r.dueAfterTotal<=session.totalAnswered&&!session.blockedIds.has(r.wordId)).sort((a,b)=>a.dueAfterTotal-b.dueAfterTotal)[0]||null;',
            'if(session.mode==="75")pool=pool.filter(v=>(v.studyLayer||"core")==="challenge");',
            'const recent=new Set(session.recentIds.slice(-6));',
            'const due=v75DueRetry();',
        ]:
            if untouched not in planning:
                raise SystemExit(f"out-of-scope planning behavior changed: {untouched}")

    boundaries = manifest.get("boundaries", {})
    if boundaries.get("wasedaPlanningPolicyV75") != POLICY_NAME:
        raise SystemExit("Waseda planning policy manifest boundary missing")
    if boundaries.get("wasedaPlanningChallengeCompositionPolicyV75") != POLICY_NAME:
        raise SystemExit("Waseda challenge-session composition manifest boundary missing")


def main() -> None:
    require_approval()
    policy = POLICY.read_text(encoding="utf-8")
    planning = PLANNING.read_text(encoding="utf-8")
    manifest = load_json(MANIFEST)

    if "isChallengeEntity(v){" in policy:
        validate_applied(policy, planning, manifest)
        print("Waseda challenge-session composition adapter: ALREADY APPLIED")
        return

    if "challengeScore(v,p,t){" not in policy or "foundationReason(v,p,t){" not in policy:
        raise SystemExit("reviewed Waseda planning policy baseline is missing")
    if policy.count("\n});\n") != 1:
        raise SystemExit("Waseda planning policy object boundary is ambiguous")
    for old, new in REPLACEMENTS:
        if planning.count(old) != 1:
            raise SystemExit(f"reviewed planning source mismatch for: {old}")
        if new in planning:
            raise SystemExit(f"planning delegation already partially present: {new}")

    policy = policy.replace("\n});\n", ",\n" + POLICY_INSERT + "});\n", 1)
    for old, new in REPLACEMENTS:
        planning = planning.replace(old, new, 1)
    POLICY.write_text(policy, encoding="utf-8")
    PLANNING.write_text(planning, encoding="utf-8")

    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["wasedaPlanningChallengeCompositionPolicyV75"] = POLICY_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "31a-waseda-planning-policy.js also owns the exact Waseda challenge-session layer predicates and 80/20 composition ratios. "
        "32-session-planning-runtime.js keeps year filtering before getProgress, all selection orchestration, retry/queue behavior and reason attachment unchanged."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_json(MANIFEST, manifest)

    validate_applied(policy, planning, manifest)
    print("Waseda challenge-session composition adapter: PASS")


if __name__ == "__main__":
    main()
