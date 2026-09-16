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

OLD_POLICY = '''/*
 * Waseda-only session planning policy adapter.
 * First reviewed group: foundation-reason precedence and exact learner-facing copy.
 * Do not move these strings or Waseda-specific predicates into the common engine.
 */
const WASEDA_PLANNING_POLICY=Object.freeze({
  foundationReason(v,p,t){
    if(isWeakProgress(p))return "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。";
    if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)return "挑戦前の基礎確認：最近間違えた重要語のため再確認します。";
    if(p.nextReview&&new Date(p.nextReview).getTime()<=t)return "挑戦前の基礎確認：復習期限を迎えた重要語です。";
    return "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。";
  },
  challengeScore(v,p,t){
    let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];
    if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;
    if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;
    if(isWeakProgress(p))score+=95;
    if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;
    return score;
  }
});
'''

NEW_POLICY = '''/*
 * Waseda-only session planning policy adapter.
 * Reviewed groups:
 * - foundation-reason precedence and exact learner-facing copy
 * - challenge-score base policy
 * - challenge-session composition policy
 * Do not move Waseda-specific strings, weights, ratios, thresholds, or predicates into the common engine.
 */
const WASEDA_PLANNING_POLICY=Object.freeze({
  foundationReason(v,p,t){
    if(isWeakProgress(p))return "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。";
    if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)return "挑戦前の基礎確認：最近間違えた重要語のため再確認します。";
    if(p.nextReview&&new Date(p.nextReview).getTime()<=t)return "挑戦前の基礎確認：復習期限を迎えた重要語です。";
    return "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。";
  },
  challengeScore(v,p,t){
    let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];
    if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;
    if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;
    if(isWeakProgress(p))score+=95;
    if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;
    return score;
  },
  isChallengeEntity(v){return (v.studyLayer||"core")==="challenge"},
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
});
'''

OLD_BLOCK = '''function buildChallengeSessionPlan(year,requested){
  const y=year==="all"?null:Number(year),t=now();
  const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"&&(!y||v.years.includes(y)));
  if(!challenge.length)return {baseQueueIds:[],actualSessionSize:0,challengeCount:0,baseReasons:{}};
  const desired=requested||challenge.length;
  const required=Math.ceil(desired*.8);
  if(challenge.length<required){
    const n=Math.min(desired,challenge.length);
    const picked=v75WeightedWithoutReplacement(challenge,n,v75ChallengeScore);
    return {baseQueueIds:picked.map(v=>v.id),actualSessionSize:picked.length,challengeCount:picked.length,baseReasons:{}};
  }
  const nonChallenge=VOCAB.filter(v=>{
    const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;
    if(y&&!v.years.includes(y))return false;
    const p=getProgress(v.id);
    const due=p.nextReview&&new Date(p.nextReview).getTime()<=t;
    const recent=p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t;
    return isWeakProgress(p)||due||recent;
  });
  const exceptionCap=Math.floor(desired*.2);
  const exceptions=v75WeightedWithoutReplacement(nonChallenge,Math.min(exceptionCap,nonChallenge.length),v=>schedulerScore(v,"recommended"));
  const challengeN=Math.min(challenge.length,desired-exceptions.length);
  const challengePicked=v75WeightedWithoutReplacement(challenge,challengeN,v75ChallengeScore);
  const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);
  const baseReasons={};exceptions.forEach(v=>baseReasons[v.id]=v75FoundationReason(v));
  return {baseQueueIds:combined.map(v=>v.id),actualSessionSize:combined.length,challengeCount:combined.filter(v=>(v.studyLayer||"core")==="challenge").length,baseReasons};
}
'''

NEW_BLOCK = '''function buildChallengeSessionPlan(year,requested){
  const y=year==="all"?null:Number(year),t=now();
  const challenge=VOCAB.filter(v=>WASEDA_PLANNING_POLICY.isChallengeEntity(v)&&(!y||v.years.includes(y)));
  if(!challenge.length)return {baseQueueIds:[],actualSessionSize:0,challengeCount:0,baseReasons:{}};
  const desired=requested||challenge.length;
  const required=WASEDA_PLANNING_POLICY.requiredChallengeCount(desired);
  if(challenge.length<required){
    const n=Math.min(desired,challenge.length);
    const picked=v75WeightedWithoutReplacement(challenge,n,v75ChallengeScore);
    return {baseQueueIds:picked.map(v=>v.id),actualSessionSize:picked.length,challengeCount:picked.length,baseReasons:{}};
  }
  const nonChallenge=VOCAB.filter(v=>{
    if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;
    if(y&&!v.years.includes(y))return false;
    const p=getProgress(v.id);
    return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);
  });
  const exceptionCap=WASEDA_PLANNING_POLICY.foundationExceptionCap(desired);
  const exceptions=v75WeightedWithoutReplacement(nonChallenge,Math.min(exceptionCap,nonChallenge.length),v=>schedulerScore(v,"recommended"));
  const challengeN=Math.min(challenge.length,desired-exceptions.length);
  const challengePicked=v75WeightedWithoutReplacement(challenge,challengeN,v75ChallengeScore);
  const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);
  const baseReasons={};exceptions.forEach(v=>baseReasons[v.id]=v75FoundationReason(v));
  return {baseQueueIds:combined.map(v=>v.id),actualSessionSize:combined.length,challengeCount:combined.filter(v=>WASEDA_PLANNING_POLICY.isChallengeEntity(v)).length,baseReasons};
}
'''


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_approval() -> None:
    validation = load_json(VALIDATION)
    contract = load_json(CONTRACT)
    if validation.get("allowFullPlanningRuntimeMutation") is not False:
        raise SystemExit("full planning runtime mutation must remain forbidden")
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
        "isChallengeEntity(v){return (v.studyLayer||\"core\")==\"challenge\"}",
        "isFoundationLayerEligible(v){",
        "return layer!==\"reference\"&&layer!==\"challenge\";",
        "isFoundationStateEligible(p,t){",
        "return isWeakProgress(p)||due||recent;",
        "requiredChallengeCount(desired){return Math.ceil(desired*.8)}",
        "foundationExceptionCap(desired){return Math.floor(desired*.2)}",
    ]:
        if token not in policy:
            raise SystemExit(f"Waseda challenge-session policy token missing: {token}")
    if NEW_BLOCK not in planning:
        raise SystemExit("buildChallengeSessionPlan does not match the approved adapter transform")
    if OLD_BLOCK in planning:
        raise SystemExit("legacy challenge-session composition remains in planning runtime")

    block = planning[planning.index("function buildChallengeSessionPlan(year,requested){"):planning.index("function buildSessionPlan(mode,year,size){")]
    layer_i = block.index("if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;")
    year_i = block.index('if(y&&!v.years.includes(y))return false;')
    progress_i = block.index("const p=getProgress(v.id);")
    state_i = block.index("return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);")
    if not (layer_i < year_i < progress_i < state_i):
        raise SystemExit("foundation filter ordering changed; excluded entities could acquire default progress")

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

    if policy != OLD_POLICY:
        raise SystemExit("Waseda planning policy changed outside the reviewed third-group baseline")
    if planning.count(OLD_BLOCK) != 1:
        raise SystemExit(f"expected exactly one reviewed buildChallengeSessionPlan block, found {planning.count(OLD_BLOCK)}")

    POLICY.write_text(NEW_POLICY, encoding="utf-8")
    PLANNING.write_text(planning.replace(OLD_BLOCK, NEW_BLOCK, 1), encoding="utf-8")

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

    validate_applied(NEW_POLICY, PLANNING.read_text(encoding="utf-8"), manifest)
    print("Waseda challenge-session composition adapter: PASS")


if __name__ == "__main__":
    main()
