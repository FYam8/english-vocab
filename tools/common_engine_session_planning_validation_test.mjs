import fs from 'node:fs';
import assert from 'node:assert/strict';

const contract = JSON.parse(fs.readFileSync('src/common-engine/session-planning-contract.json','utf8'));
const validation = JSON.parse(fs.readFileSync('src/common-engine/session-planning-contract-validation.json','utf8'));

assert.equal(validation.format, 'waseda-session-planning-policy-validation/v1');
assert.equal(validation.contractPath, 'src/common-engine/session-planning-contract.json');
assert.equal(validation.validatedContractHead, 'ac052208a09ff27926ec785c6ba2d9c4286ad47e');
for (const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble']) {
  assert.equal(validation[key], 'success', `session-planning contract validation incomplete: ${key}`);
}
assert.equal(validation.wasedaProductionBaseline, contract.productionBaseline);
assert.equal(validation.rikkyoAuditedBaseline, '06eb47656bf0066af5cfe2072a53cfcdd42e5232');
assert.equal(validation.runtimeSourcesUnchangedDuringContractValidation, true);
assert.equal(validation.allowFullPlanningRuntimeMutation, false);
assert.equal(validation.allowFirstPlanningAdapterGroupIntroduction, true);
assert.equal(validation.firstApprovedGroup, 'foundation-reason-policy-adapter');
assert.equal(validation.firstApprovedGroupScope.length, 1);
assert.ok(validation.firstApprovedGroupScope[0].includes('v75FoundationReason'));

const first = validation.firstPlanningAdapterValidation || {};
assert.equal(first.validatedHead, '728da033e8e815ebb8585c97966de9c253e334a9');
assert.equal(first.runtimeTransformHead, '44a277acdc3703147cfe1a30ee873597b286a3a7');
for (const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble']) {
  assert.equal(first[key], 'success', `foundation-reason adapter validation incomplete: ${key}`);
}
assert.equal(first.artifactSha256, '3cbd1e048d40ae59b4b8e2ac4ed6922b75a93b765bbe250001ecc2833d6447c0');
assert.equal(first.productionMainUnchanged, true);
assert.equal(first.rikkyoRuntimeUnchanged, true);
assert.equal(first.validatedGroup, 'foundation-reason-policy-adapter');

assert.equal(validation.allowSecondPlanningAdapterGroupIntroduction, true);
assert.equal(validation.secondApprovedGroup, 'challenge-score-base-policy-adapter');
assert.equal(validation.secondApprovedGroupScope.length, 1);
assert.ok(validation.secondApprovedGroupScope[0].includes('v75ChallengeScore'));
for (const required of [
  'PRIORITY_SCORE lookup with fallback 0',
  'yearCount x8 plus sqrt(effectiveFrequency) x4 plus mastery weights [80,110,65,25,4]',
  'due +115, recent mistake +80, weak +95',
  'mastery 4 and not due multiplier 0.12',
  'getProgress/now/effectiveFrequency/isWeakProgress semantics',
  'the later v7.6 WASEDA_MEMORY_POLICY challenge-memory boost',
  'all session composition, queue and retry behavior',
  'all Waseda persistence and cloud contracts'
]) assert.ok(validation.secondApprovedGroupMustPreserve.includes(required), `missing second-group preservation rule: ${required}`);
for (const forbidden of [
  'moving Waseda priority/mastery/challenge score constants into the common engine',
  'changing challenge session composition in the second group',
  'changing foundation-reason strings or precedence in the second group',
  'changing retry gaps or queue order in the second group',
  'mutating FYam8/rikkyo-uk-vocab',
  'changing Waseda production main',
  'deploying either public app'
]) assert.ok(validation.forbidden.includes(forbidden), `missing second-group prohibition: ${forbidden}`);

assert.equal(contract.foundationReasonPolicy.mustRemainOutsideCommonEngine, true);
assert.deepEqual(contract.foundationReasonPolicy.precedence, ['weak','recentMistake','due','default']);
assert.equal(contract.challengeScorePolicy.schoolSpecific, true);
assert.equal(contract.challengeScorePolicy.memoryBoostOwnedBy, 'WASEDA_MEMORY_POLICY.applyChallengeMemoryScore');
assert.equal(contract.status, 'contract-only-no-runtime-wiring');

console.log('Waseda session-planning policy validation checkpoint: PASS');
