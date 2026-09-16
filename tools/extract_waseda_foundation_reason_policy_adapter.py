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

POLICY_NAME = "31a-waseda-planning-policy.js"
PLANNING_NAME = "32-session-planning-runtime.js"
SESSION_NAME = "31-waseda-session-runtime.js"

POLICY_CONTENT = '''/*
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
  }
});
'''

OLD_FUNCTION = '''function v75FoundationReason(v){
  const p=getProgress(v.id),t=now();
  if(isWeakProgress(p))return "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。";
  if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)return "挑戦前の基礎確認：最近間違えた重要語のため再確認します。";
  if(p.nextReview&&new Date(p.nextReview).getTime()<=t)return "挑戦前の基礎確認：復習期限を迎えた重要語です。";
  return "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。";
}
'''
NEW_FUNCTION = '''function v75FoundationReason(v){
  const p=getProgress(v.id),t=now();
  return WASEDA_PLANNING_POLICY.foundationReason(v,p,t);
}
'''

REASONS = [
    "挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。",
    "挑戦前の基礎確認：最近間違えた重要語のため再確認します。",
    "挑戦前の基礎確認：復習期限を迎えた重要語です。",
    "挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。",
]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_approval() -> None:
    validation = load_json(VALIDATION)
    if validation.get("format") != "waseda-session-planning-policy-validation/v1":
        raise SystemExit("unexpected session-planning validation format")
    if validation.get("validatedContractHead") != "ac052208a09ff27926ec785c6ba2d9c4286ad47e":
        raise SystemExit("session-planning contract is not pinned to the reviewed green head")
    for key in ["branchTwoPass", "syntheticMergeTwoPass", "branchOwnership", "syntheticMergeOwnership", "assemble"]:
        if validation.get(key) != "success":
            raise SystemExit(f"session-planning contract validation incomplete: {key}")
    if validation.get("allowFullPlanningRuntimeMutation") is not False:
        raise SystemExit("full planning runtime mutation must remain forbidden")
    if validation.get("allowFirstPlanningAdapterGroupIntroduction") is not True:
        raise SystemExit("first planning adapter group is not approved")
    if validation.get("firstApprovedGroup") != "foundation-reason-policy-adapter":
        raise SystemExit("unexpected first approved planning adapter group")
    forbidden = set(validation.get("forbidden", []))
    for required in [
        "mutating FYam8/rikkyo-uk-vocab",
        "changing Waseda production main",
        "deploying either public app",
    ]:
        if required not in forbidden:
            raise SystemExit(f"missing planning safety prohibition: {required}")


def validate_applied(policy: str, planning: str, manifest: dict) -> None:
    if "const WASEDA_PLANNING_POLICY=Object.freeze({" not in policy:
        raise SystemExit("Waseda planning policy adapter object missing")
    if "foundationReason(v,p,t){" not in policy:
        raise SystemExit("Waseda foundation reason policy method missing")
    for reason in REASONS:
        if policy.count(reason) != 1:
            raise SystemExit(f"Waseda foundation reason copy drifted or duplicated: {reason}")
        if reason in planning:
            raise SystemExit("Waseda learner-facing foundation reason copy remains duplicated in planning runtime")
    if NEW_FUNCTION not in planning:
        raise SystemExit("v75FoundationReason does not delegate to Waseda planning policy")
    if OLD_FUNCTION in planning:
        raise SystemExit("legacy v75FoundationReason policy remains in planning runtime")
    order = manifest.get("assemblyOrder", [])
    if order.count(POLICY_NAME) != 1 or order.count(SESSION_NAME) != 1 or order.count(PLANNING_NAME) != 1:
        raise SystemExit("Waseda planning policy assembly entries are missing or duplicated")
    if order.index(POLICY_NAME) != order.index(SESSION_NAME) + 1:
        raise SystemExit("Waseda planning policy must assemble immediately after session runtime")
    if order.index(PLANNING_NAME) != order.index(POLICY_NAME) + 1:
        raise SystemExit("Waseda planning policy must assemble immediately before planning runtime")
    if manifest.get("boundaries", {}).get("wasedaPlanningPolicyV75") != POLICY_NAME:
        raise SystemExit("Waseda planning policy manifest boundary is missing")


def main() -> None:
    require_approval()
    planning = PLANNING.read_text(encoding="utf-8")
    manifest = load_json(MANIFEST)

    if POLICY.exists():
        validate_applied(POLICY.read_text(encoding="utf-8"), planning, manifest)
        print("Waseda foundation-reason planning adapter: ALREADY APPLIED")
        return

    if planning.count(OLD_FUNCTION) != 1:
        raise SystemExit(f"expected exactly one reviewed v75FoundationReason body, found {planning.count(OLD_FUNCTION)}")
    planning = planning.replace(OLD_FUNCTION, NEW_FUNCTION, 1)
    POLICY.write_text(POLICY_CONTENT, encoding="utf-8")
    PLANNING.write_text(planning, encoding="utf-8")

    order = list(manifest.get("assemblyOrder", []))
    if POLICY_NAME in order:
        raise SystemExit("Waseda planning policy assembly entry already exists without source file")
    if order.count(SESSION_NAME) != 1 or order.count(PLANNING_NAME) != 1:
        raise SystemExit("expected exactly one Waseda session and planning runtime in assembly order")
    if order.index(PLANNING_NAME) != order.index(SESSION_NAME) + 1:
        raise SystemExit("unexpected Waseda v7.5 session/planning assembly adjacency before adapter insertion")
    order.insert(order.index(PLANNING_NAME), POLICY_NAME)
    manifest["assemblyOrder"] = order
    boundaries = dict(manifest.get("boundaries", {}))
    boundaries["wasedaPlanningPolicyV75"] = POLICY_NAME
    manifest["boundaries"] = boundaries
    notes = list(manifest.get("notes", []))
    note = (
        "31a-waseda-planning-policy.js owns the exact Waseda v7.5 foundation-reason precedence and Japanese learner-facing copy. "
        "32-session-planning-runtime.js delegates only v75FoundationReason to it; challenge scoring, session composition, retry spacing and queue order are unchanged."
    )
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    write_json(MANIFEST, manifest)

    validate_applied(POLICY_CONTENT, planning, manifest)
    print("Waseda foundation-reason planning adapter: PASS")


if __name__ == "__main__":
    main()
