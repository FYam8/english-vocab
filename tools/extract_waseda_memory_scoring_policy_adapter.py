from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
COMMON = ROOT / "src" / "common-engine"
POLICY = SRC / "34-waseda-memory-policy.js"
INTEGRATION = SRC / "36-v76-engine-integration.js"
MANIFEST = SRC / "manifest.json"
CONTRACT = COMMON / "policy-contract.json"
VALIDATION = COMMON / "policy-contract-validation.json"

POLICY_NAME = "34-waseda-memory-policy.js"

INSERT_AFTER = '''  isDiagnosticFirstPass(v,p,attemptsBefore){
    return (v.studyLayer||"core")==="diagnostic"&&attemptsBefore===0&&p.incorrect===0;
  },
'''
SCORING_METHODS = '''  applyReviewUrgencyExtra(extra,v,p,m){
    if(m&&Number(m.version)===V76_MEMORY_MODEL_VERSION){
      const r=v76Retrievability(m),target=v76TargetRetention(v,p);
      if(r<target)extra+=(target-r)*900+90;
    }
    return extra;
  },
  applyExamUrgencyExtra(extra,v,p,m,days){
    if(days!=null&&days>=0&&days<=30){
      const urgency=(30-days)/30;
      if(v.priority==="S")extra+=80*urgency;
      if(isWeakProgress(p))extra+=100*urgency;
      if(m){
        const r=v76Retrievability(m),target=v76TargetRetention(v,p);
        extra+=Math.max(0,target-r)*300*urgency;
      }
    }
    return extra;
  },
  applyChallengeMemoryScore(score,v,p,m){
    if(m){
      const r=v76Retrievability(m),target=v76TargetRetention(v,p);
      if(r<target)score+=(target-r)*700+70;
    }
    return score;
  },
'''

OLD_SCHEDULER = '''  const p=getProgress(v.id),m=p.memoryModel;
  let extra=0;
  if(m&&Number(m.version)===V76_MEMORY_MODEL_VERSION){
    const r=v76Retrievability(m),target=v76TargetRetention(v,p);
    if(r<target)extra+=(target-r)*900+90;
  }
  const days=v76ExamDaysLeft();
  if(days!=null&&days>=0&&days<=30){
    const urgency=(30-days)/30;
    if(v.priority==="S")extra+=80*urgency;
    if(isWeakProgress(p))extra+=100*urgency;
    if(m){
      const r=v76Retrievability(m),target=v76TargetRetention(v,p);
      extra+=Math.max(0,target-r)*300*urgency;
    }
  }
  return base+extra;
'''
NEW_SCHEDULER = '''  const p=getProgress(v.id),m=p.memoryModel;
  let extra=0;
  extra=WASEDA_MEMORY_POLICY.applyReviewUrgencyExtra(extra,v,p,m);
  const days=v76ExamDaysLeft();
  extra=WASEDA_MEMORY_POLICY.applyExamUrgencyExtra(extra,v,p,m,days);
  return base+extra;
'''

OLD_CHALLENGE = '''  const p=getProgress(v.id),m=p.memoryModel;
  if(m){
    const r=v76Retrievability(m),target=v76TargetRetention(v,p);
    if(r<target)score+=(target-r)*700+70;
  }
  return score;
'''
NEW_CHALLENGE = '''  const p=getProgress(v.id),m=p.memoryModel;
  score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);
  return score;
'''


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_approval() -> None:
    contract = load_json(CONTRACT)
    validation = load_json(VALIDATION)
    second = contract.get("secondRuntimeBoundary", {})
    if second.get("name") != "memory-priority-scoring-policy-adapter":
        raise SystemExit("unexpected second runtime policy boundary")
    if validation.get("allowWasedaScoringAdapterIntroduction") is not True:
        raise SystemExit("Waseda memory scoring adapter introduction is not approved")
    if validation.get("allowRikkyoRuntimeMutation") is not False:
        raise SystemExit("Rikkyo runtime mutation must remain forbidden in this step")
    if validation.get("allowProductionMainMutation") is not False:
        raise SystemExit("production main mutation must remain forbidden in this step")
    approved = validation.get("wasedaMemoryScoringPolicyContractValidation", {})
    if approved.get("approvedBoundary") != "memory-priority-scoring-policy-adapter":
        raise SystemExit("memory scoring boundary is not approved")
    if approved.get("validatedHead") != "2141d56b248e745540d16e3ccaa56eca9968c5c8":
        raise SystemExit("memory scoring boundary approval is not pinned to the reviewed contract head")
    for key in ["branchTwoPass", "syntheticMergeTwoPass", "branchOwnership", "syntheticMergeOwnership"]:
        if approved.get(key) != "success":
            raise SystemExit(f"memory scoring boundary validation is incomplete: {key}")
    if approved.get("productionMainUnchanged") is not True or approved.get("rikkyoRuntimeUnchanged") is not True:
        raise SystemExit("memory scoring approval must preserve production main and Rikkyo runtime")


def replace_exact_once(text: str, old: str, new: str, label: str) -> str:
    if new in text and old not in text:
        return text
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one reviewed source form, found {text.count(old)}")
    return text.replace(old, new, 1)


def validate_applied(policy: str, integration: str, manifest: dict) -> None:
    for required in [
        "applyReviewUrgencyExtra(extra,v,p,m){",
        "if(r<target)extra+=(target-r)*900+90;",
        "applyExamUrgencyExtra(extra,v,p,m,days){",
        'if(v.priority==="S")extra+=80*urgency;',
        "if(isWeakProgress(p))extra+=100*urgency;",
        "extra+=Math.max(0,target-r)*300*urgency;",
        "applyChallengeMemoryScore(score,v,p,m){",
        "if(r<target)score+=(target-r)*700+70;",
    ]:
        if required not in policy:
            raise SystemExit(f"Waseda memory scoring policy missing reviewed formula: {required}")
    for required in [
        "extra=WASEDA_MEMORY_POLICY.applyReviewUrgencyExtra(extra,v,p,m);",
        "extra=WASEDA_MEMORY_POLICY.applyExamUrgencyExtra(extra,v,p,m,days);",
        "score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);",
    ]:
        if required not in integration:
            raise SystemExit(f"Waseda v7.6 integration missing scoring delegation: {required}")
    for forbidden in [
        "if(r<target)extra+=(target-r)*900+90;",
        'if(v.priority==="S")extra+=80*urgency;',
        "if(isWeakProgress(p))extra+=100*urgency;",
        "extra+=Math.max(0,target-r)*300*urgency;",
        "if(r<target)score+=(target-r)*700+70;",
    ]:
        if forbidden in integration:
            raise SystemExit(f"Waseda scoring formula remains duplicated in integration: {forbidden}")
    if manifest.get("boundaries", {}).get("wasedaMemoryScoringPolicyV76") != POLICY_NAME:
        raise SystemExit("Waseda memory scoring policy manifest boundary is missing")


def main() -> None:
    require_approval()
    policy = POLICY.read_text(encoding="utf-8")
    integration = INTEGRATION.read_text(encoding="utf-8")
    manifest = load_json(MANIFEST)

    already = "applyReviewUrgencyExtra(extra,v,p,m){" in policy
    if already:
        validate_applied(policy, integration, manifest)
        print("Waseda memory scoring policy adapter: ALREADY APPLIED")
        return

    if policy.count(INSERT_AFTER) != 1:
        raise SystemExit("expected exactly one reviewed insertion point in Waseda memory policy")
    policy = policy.replace(INSERT_AFTER, INSERT_AFTER + SCORING_METHODS, 1)
    integration = replace_exact_once(integration, OLD_SCHEDULER, NEW_SCHEDULER, "scheduler scoring override")
    integration = replace_exact_once(integration, OLD_CHALLENGE, NEW_CHALLENGE, "challenge memory scoring override")

    POLICY.write_text(policy, encoding="utf-8")
    INTEGRATION.write_text(integration, encoding="utf-8")

    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["wasedaMemoryScoringPolicyV76"] = POLICY_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "34-waseda-memory-policy.js also owns the exact current v7.6 review-gap, exam-urgency "
        "and challenge-memory scoring formulas. 36-v76-engine-integration.js delegates to those "
        "Waseda-only methods while preserving base score calculation and evaluation order."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_json(MANIFEST, manifest)

    validate_applied(policy, integration, manifest)
    print("Waseda memory scoring policy adapter: PASS")


if __name__ == "__main__":
    main()
