from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
COMMON = ROOT / "src" / "common-engine"
POLICY = SRC / "31a-waseda-planning-policy.js"
PLANNING = SRC / "32-session-planning-runtime.js"
INTEGRATION = SRC / "36-v76-engine-integration.js"
MANIFEST = SRC / "manifest.json"
VALIDATION = COMMON / "session-planning-contract-validation.json"

APPROVAL_CHECKPOINT = "84eae4f7c5bd4767b7c78050771abe9744225770"
POLICY_NAME = "31a-waseda-planning-policy.js"

OLD_POLICY_TAIL = '''  foundationReason(v,p,t){
    if(isWeakProgress(p))return "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。";
    if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)return "挑戦前の基礎確認：最近間違えた重要語のため再確認します。";
    if(p.nextReview&&new Date(p.nextReview).getTime()<=t)return "挑戦前の基礎確認：復習期限を迎えた重要語です。";
    return "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。";
  }
});
'''
NEW_POLICY_TAIL = '''  foundationReason(v,p,t){
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

OLD_CHALLENGE = '''function v75ChallengeScore(v){
  const p=getProgress(v.id),t=now();
  let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];
  if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;
  if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;
  if(isWeakProgress(p))score+=95;
  if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;
  return score;
}
'''
NEW_CHALLENGE = '''function v75ChallengeScore(v){
  const p=getProgress(v.id),t=now();
  return WASEDA_PLANNING_POLICY.challengeScore(v,p,t);
}
'''


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_checkpoint_ancestor() -> None:
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", APPROVAL_CHECKPOINT, "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit("challenge-score adapter requires the exact green approval checkpoint as an ancestor")


def require_approval() -> None:
    require_checkpoint_ancestor()
    validation = load_json(VALIDATION)
    if validation.get("allowFullPlanningRuntimeMutation") is not False:
        raise SystemExit("full planning runtime mutation must remain forbidden")
    if validation.get("allowSecondPlanningAdapterGroupIntroduction") is not True:
        raise SystemExit("second Waseda planning adapter group is not approved")
    if validation.get("secondApprovedGroup") != "challenge-score-base-policy-adapter":
        raise SystemExit("unexpected second approved Waseda planning adapter group")
    approval = validation.get("secondPlanningAdapterApprovalValidation", {})
    if approval.get("validatedHead") != "32c2724e60f764a59fa8136a789d27efa7188846":
        raise SystemExit("challenge-score boundary approval is not pinned to the reviewed head")
    for key in ["branchTwoPass", "syntheticMergeTwoPass", "branchOwnership", "syntheticMergeOwnership", "assemble"]:
        if approval.get(key) != "success":
            raise SystemExit(f"challenge-score boundary approval incomplete: {key}")
    if approval.get("productionMainUnchanged") is not True or approval.get("rikkyoRuntimeUnchanged") is not True:
        raise SystemExit("challenge-score boundary must preserve production main and Rikkyo runtime")
    if approval.get("approvedGroup") != "challenge-score-base-policy-adapter":
        raise SystemExit("challenge-score boundary approval group mismatch")


def validate_applied(policy: str, planning: str, integration: str, manifest: dict) -> None:
    if "challengeScore(v,p,t){" not in policy:
        raise SystemExit("Waseda challenge-score policy method missing")
    for required in [
        'let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];',
        'if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;',
        'if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;',
        'if(isWeakProgress(p))score+=95;',
        'if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;',
    ]:
        if required not in policy:
            raise SystemExit(f"Waseda challenge-score formula drifted: {required}")
        if required in planning:
            raise SystemExit(f"Waseda challenge-score formula remains duplicated in planning runtime: {required}")
    if NEW_CHALLENGE not in planning:
        raise SystemExit("v75ChallengeScore does not delegate to Waseda planning policy")
    if OLD_CHALLENGE in planning:
        raise SystemExit("legacy v75ChallengeScore formula remains in planning runtime")
    # The v7.6 memory boost must remain a later wrapper around this exact base score.
    for required in [
        'const v75ChallengeScoreForV76=v75ChallengeScore;',
        'let score=v75ChallengeScoreForV76(v);',
        'score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);',
    ]:
        if required not in integration:
            raise SystemExit(f"v7.6 challenge-memory wrapper changed during base-score extraction: {required}")
    if manifest.get("boundaries", {}).get("wasedaPlanningPolicyV75") != POLICY_NAME:
        raise SystemExit("Waseda planning-policy manifest boundary missing")
    if manifest.get("boundaries", {}).get("wasedaChallengeScorePolicyV75") != POLICY_NAME:
        raise SystemExit("Waseda challenge-score manifest boundary missing")


def main() -> None:
    require_approval()
    policy = POLICY.read_text(encoding="utf-8")
    planning = PLANNING.read_text(encoding="utf-8")
    integration = INTEGRATION.read_text(encoding="utf-8")
    manifest = load_json(MANIFEST)

    already = "challengeScore(v,p,t){" in policy
    if already:
        validate_applied(policy, planning, integration, manifest)
        print("Waseda challenge-score planning adapter: ALREADY APPLIED")
        return

    if policy.count(OLD_POLICY_TAIL) != 1:
        raise SystemExit(f"expected exactly one reviewed Waseda planning-policy tail, found {policy.count(OLD_POLICY_TAIL)}")
    if planning.count(OLD_CHALLENGE) != 1:
        raise SystemExit(f"expected exactly one reviewed v75ChallengeScore body, found {planning.count(OLD_CHALLENGE)}")

    policy = policy.replace(OLD_POLICY_TAIL, NEW_POLICY_TAIL, 1)
    planning = planning.replace(OLD_CHALLENGE, NEW_CHALLENGE, 1)
    POLICY.write_text(policy, encoding="utf-8")
    PLANNING.write_text(planning, encoding="utf-8")

    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["wasedaChallengeScorePolicyV75"] = POLICY_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "31a-waseda-planning-policy.js also owns the exact Waseda v7.5 challenge base-score formula. "
        "32-session-planning-runtime.js delegates only v75ChallengeScore to it; challenge-session composition, retry spacing and queue order are unchanged, and the later v7.6 memory boost remains in 36-v76-engine-integration.js."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_json(MANIFEST, manifest)

    validate_applied(policy, planning, integration, manifest)
    print("Waseda challenge-score planning adapter: PASS")


if __name__ == "__main__":
    main()
