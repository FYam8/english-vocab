import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const contract = JSON.parse(read('src/common-engine/policy-contract.json'));
const validation = JSON.parse(read('src/common-engine/policy-contract-validation.json'));

assert.equal(validation.format, 'common-vocab-engine-policy-validation/v1');
assert.equal(validation.contractPath, 'src/common-engine/policy-contract.json');
assert.match(validation.validatedContractHead, /^[0-9a-f]{40}$/);
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(validation[key], 'success', `policy contract validation incomplete: ${key}`);
}
assert.equal(validation.wasedaProductionBaseline, '531d505c19a86eaa2c8bbc4b25179de8089ab585');
assert.equal(validation.rikkyoAuditedBaseline, contract.rikkyoAuditedMapping.auditedCommit);
assert.equal(validation.approvedRuntimeBoundary, contract.firstRuntimeBoundary.name);
assert.equal(validation.allowWasedaAdapterIntroduction, true);
assert.equal(validation.allowWasedaScoringAdapterIntroduction, true);
assert.equal(validation.allowRikkyoRuntimeMutation, false);
assert.equal(validation.allowProductionMainMutation, false);
assert.equal(validation.allowSharedRuntimeArtifactRelease, false);
assert.equal(contract.firstRuntimeBoundary.status, 'introduced-and-exact-head-validated');
assert.equal(contract.firstRuntimeBoundary.validatedHead, '7ccde7dd797dd931721c9dcd1befe6fdb380c6bc');
assert.equal(contract.secondRuntimeBoundary.status, 'blocked-until-contract-exact-head-green');
assert.equal(contract.secondRuntimeBoundary.name, 'memory-priority-scoring-policy-adapter');
assert.equal(contract.gates.runtimeWiringAllowedBeforeContractGreen, false);

const adapter = validation.wasedaMemoryPolicyAdapterValidation || {};
assert.equal(adapter.validatedHead, '7ccde7dd797dd931721c9dcd1befe6fdb380c6bc');
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(adapter[key], 'success', `Waseda memory-policy adapter validation incomplete: ${key}`);
}
assert.match(adapter.artifactSha256 || '', /^[0-9a-f]{64}$/);
assert.equal(adapter.artifactSha256, '520e3f324f25f9d5f07e348eb618f2b62fa6bddc2f890e33704b5ac9719a07a5');
assert.equal(adapter.productionMainUnchanged, true);
assert.equal(adapter.rikkyoRuntimeUnchanged, true);

const scoring = validation.wasedaMemoryScoringPolicyContractValidation || {};
assert.equal(scoring.validatedHead, '2141d56b248e745540d16e3ccaa56eca9968c5c8');
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(scoring[key], 'success', `Waseda memory-scoring boundary validation incomplete: ${key}`);
}
assert.equal(scoring.approvedBoundary, contract.secondRuntimeBoundary.name);
assert.match(scoring.artifactSha256BeforeScoringAdapter || '', /^[0-9a-f]{64}$/);
assert.equal(scoring.artifactSha256BeforeScoringAdapter, '520e3f324f25f9d5f07e348eb618f2b62fa6bddc2f890e33704b5ac9719a07a5');
assert.equal(scoring.productionMainUnchanged, true);
assert.equal(scoring.rikkyoRuntimeUnchanged, true);

console.log('Common-engine policy validation checkpoint: PASS');
