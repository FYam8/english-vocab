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
assert.equal(contract.secondRuntimeBoundary.status, 'introduced-and-exact-head-validated');
assert.equal(contract.secondRuntimeBoundary.validatedHead, 'd2fec5e326564b5af46406fd3360887ad9ce5d9a');
assert.equal(contract.thirdRuntimeBoundary.status, 'blocked-until-contract-exact-head-green');
assert.equal(contract.thirdRuntimeBoundary.name, 'session-planning-policy-adapter');
assert.equal(contract.gates.runtimeWiringAllowedBeforeContractGreen, false);

const adapter = validation.wasedaMemoryPolicyAdapterValidation || {};
assert.equal(adapter.validatedHead, '7ccde7dd797dd931721c9dcd1befe6fdb380c6bc');
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(adapter[key], 'success', `Waseda memory-policy adapter validation incomplete: ${key}`);
}
assert.equal(adapter.artifactSha256, '520e3f324f25f9d5f07e348eb618f2b62fa6bddc2f890e33704b5ac9719a07a5');
assert.equal(adapter.productionMainUnchanged, true);
assert.equal(adapter.rikkyoRuntimeUnchanged, true);

const scoringContract = validation.wasedaMemoryScoringPolicyContractValidation || {};
assert.equal(scoringContract.validatedHead, '2141d56b248e745540d16e3ccaa56eca9968c5c8');
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(scoringContract[key], 'success', `Waseda memory-scoring contract validation incomplete: ${key}`);
}
assert.equal(scoringContract.approvedBoundary, contract.secondRuntimeBoundary.name);
assert.equal(scoringContract.artifactSha256BeforeScoringAdapter, '520e3f324f25f9d5f07e348eb618f2b62fa6bddc2f890e33704b5ac9719a07a5');
assert.equal(scoringContract.productionMainUnchanged, true);
assert.equal(scoringContract.rikkyoRuntimeUnchanged, true);

const scoringAdapter = validation.wasedaMemoryScoringPolicyAdapterValidation || {};
assert.equal(scoringAdapter.validatedHead, 'd2fec5e326564b5af46406fd3360887ad9ce5d9a');
assert.equal(scoringAdapter.runtimeTransformHead, '460e2b78d6c6800d4beef6956e8e6104c122edca');
for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
  assert.equal(scoringAdapter[key], 'success', `Waseda memory-scoring adapter validation incomplete: ${key}`);
}
assert.equal(scoringAdapter.validatedBoundary, contract.secondRuntimeBoundary.name);
assert.equal(scoringAdapter.artifactSha256, '5315e82069688b7bef265d2057e618f88afa1cdc2b31b051f7746ae8000d8463');
assert.equal(scoringAdapter.productionMainUnchanged, true);
assert.equal(scoringAdapter.rikkyoRuntimeUnchanged, true);

assert.equal(validation.nextBoundary?.name, contract.thirdRuntimeBoundary.name);
assert.equal(validation.nextBoundary?.status, 'validated-runtime-wiring');
assert.equal(validation.nextBoundary?.allowRuntimeMutation, true);

console.log('Common-engine policy validation checkpoint: PASS');
