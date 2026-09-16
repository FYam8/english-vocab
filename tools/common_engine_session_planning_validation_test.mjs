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
for (const required of [
  'weak > recentMistake > due > default precedence',
  'the four exact Japanese strings',
  'getProgress/now/isWeakProgress semantics',
  'all queue order and retry behavior',
  'all Waseda persistence and cloud contracts'
]) assert.ok(validation.firstApprovedGroupMustPreserve.includes(required), `missing first-group preservation rule: ${required}`);
for (const forbidden of [
  'moving the reason strings into the common engine',
  'changing challenge score or session composition in the first group',
  'changing retry gaps or queue order in the first group',
  'mutating FYam8/rikkyo-uk-vocab',
  'changing Waseda production main',
  'deploying either public app'
]) assert.ok(validation.forbidden.includes(forbidden), `missing first-group prohibition: ${forbidden}`);

assert.equal(contract.foundationReasonPolicy.mustRemainOutsideCommonEngine, true);
assert.deepEqual(contract.foundationReasonPolicy.precedence, ['weak','recentMistake','due','default']);
assert.equal(contract.status, 'contract-only-no-runtime-wiring');

const candidate = validation.firstPlanningAdapterCandidate || {};
assert.equal(candidate.runtimeHead, '44a277acdc3703147cfe1a30ee873597b286a3a7');
assert.equal(candidate.artifactSha256, '3cbd1e048d40ae59b4b8e2ac4ed6922b75a93b765bbe250001ecc2833d6447c0');
assert.equal(candidate.status, 'awaiting-exact-head-validation');
assert.equal(candidate.productionMainMustRemain, validation.wasedaProductionBaseline);
assert.equal(candidate.rikkyoRuntimeMustRemain, validation.rikkyoAuditedBaseline);

console.log('Waseda session-planning policy validation checkpoint: PASS');
