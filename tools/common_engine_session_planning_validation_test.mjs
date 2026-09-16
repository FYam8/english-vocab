import fs from 'node:fs';
import assert from 'node:assert/strict';

const contract = JSON.parse(fs.readFileSync('src/common-engine/session-planning-contract.json','utf8'));
const thirdContract = JSON.parse(fs.readFileSync('src/common-engine/challenge-session-composition-contract.json','utf8'));
const validation = JSON.parse(fs.readFileSync('src/common-engine/session-planning-contract-validation.json','utf8'));
const policy = fs.readFileSync('src/waseda-bootstrap/31a-waseda-planning-policy.js','utf8');
const planning = fs.readFileSync('src/waseda-bootstrap/32-session-planning-runtime.js','utf8');

assert.equal(validation.format, 'waseda-session-planning-policy-validation/v1');
assert.equal(validation.contractPath, 'src/common-engine/session-planning-contract.json');
assert.equal(validation.validatedContractHead, 'ac052208a09ff27926ec785c6ba2d9c4286ad47e');
for (const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble']) assert.equal(validation[key], 'success');
assert.equal(validation.wasedaProductionBaseline, contract.productionBaseline);
assert.equal(validation.rikkyoAuditedBaseline, '06eb47656bf0066af5cfe2072a53cfcdd42e5232');
assert.equal(validation.runtimeSourcesUnchangedDuringContractValidation, true);
assert.equal(validation.allowFullPlanningRuntimeMutation, false);

const first=validation.firstPlanningAdapterValidation||{};
assert.equal(validation.allowFirstPlanningAdapterGroupIntroduction,true);
assert.equal(validation.firstApprovedGroup,'foundation-reason-policy-adapter');
assert.equal(first.validatedHead,'728da033e8e815ebb8585c97966de9c253e334a9');
assert.equal(first.runtimeTransformHead,'44a277acdc3703147cfe1a30ee873597b286a3a7');
for(const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble'])assert.equal(first[key],'success');
assert.equal(first.artifactSha256,'3cbd1e048d40ae59b4b8e2ac4ed6922b75a93b765bbe250001ecc2833d6447c0');
assert.equal(first.productionMainUnchanged,true);assert.equal(first.rikkyoRuntimeUnchanged,true);

const secondApproval=validation.secondPlanningAdapterApprovalValidation||{};
assert.equal(validation.allowSecondPlanningAdapterGroupIntroduction,true);
assert.equal(validation.secondApprovedGroup,'challenge-score-base-policy-adapter');
assert.equal(secondApproval.validatedHead,'32c2724e60f764a59fa8136a789d27efa7188846');
for(const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble'])assert.equal(secondApproval[key],'success');
const secondRuntime=validation.secondPlanningAdapterRuntimeValidation||{};
assert.equal(secondRuntime.validatedHead,'ebbeb439937e3f90bb79a041d7f27d7ddf0e94d1');
assert.equal(secondRuntime.runtimeTransformHead,'261c1ae713810578b523cbcf7fb53239d9b3b027');
assert.equal(secondRuntime.artifactSha256,'16655e85045d1b83e2caea23ed4a0a6aafe8af50e86f199ecab6506b5268206d');
for(const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble'])assert.equal(secondRuntime[key],'success');
assert.equal(secondRuntime.productionMainUnchanged,true);assert.equal(secondRuntime.rikkyoRuntimeUnchanged,true);

assert.equal(validation.allowThirdPlanningAdapterGroupIntroduction,true);
assert.equal(validation.thirdApprovedGroup,'challenge-session-composition-policy-adapter');
assert.equal(validation.thirdContractPath,'src/common-engine/challenge-session-composition-contract.json');
assert.equal(validation.thirdContractStatus,'validated-contract-runtime-mutation-limited-to-approved-methods');
const thirdApproval=validation.thirdPlanningAdapterApprovalValidation||{};
assert.equal(thirdApproval.validatedHead,'f65efc3de9a51cae4c22478eca27ca52a5bec777');
for(const key of ['branchTwoPass','syntheticMergeTwoPass','branchOwnership','syntheticMergeOwnership','assemble'])assert.equal(thirdApproval[key],'success');
assert.equal(thirdApproval.productionMainUnchanged,true);assert.equal(thirdApproval.rikkyoRuntimeUnchanged,true);
assert.equal(thirdApproval.approvedGroup,'challenge-session-composition-policy-adapter');

assert.equal(thirdContract.format,'waseda-challenge-session-composition-policy-contract/v1');
assert.equal(thirdContract.status,'contract-only-no-runtime-mutation');
assert.equal(thirdContract.productionBaseline,validation.wasedaProductionBaseline);
assert.equal(thirdContract.reviewedPlanningRuntimeHead,'ebbeb439937e3f90bb79a041d7f27d7ddf0e94d1');
assert.deepEqual(thirdContract.exactBehavior.foundationFilterEvaluationOrder,[
  'layer eligibility','year eligibility','getProgress(v.id)','derive due and recent-mistake flags','weak OR due OR recent-mistake state eligibility'
]);
assert.equal(thirdContract.exactBehavior.getProgressMayCreateDefaultProgress,true);
assert.equal(thirdContract.exactBehavior.mustNotCreateProgressForLayerOrYearExcludedEntities,true);
assert.deepEqual(thirdContract.adapterDesign.allowedMethods,[
  'isChallengeEntity(v)','isFoundationLayerEligible(v)','isFoundationStateEligible(p,t)','requiredChallengeCount(desired)','foundationExceptionCap(desired)'
]);

const start=planning.indexOf('function buildChallengeSessionPlan(year,requested){');
const end=planning.indexOf('function buildSessionPlan(mode,year,size){');
assert.ok(start>=0&&end>start,'reviewed buildChallengeSessionPlan block missing');
const block=planning.slice(start,end);
const adapted=policy.includes('isChallengeEntity(v){');
if(adapted){
  for(const snippet of [
    'WASEDA_PLANNING_POLICY.isChallengeEntity(v)&&(!y||v.years.includes(y))',
    'const required=WASEDA_PLANNING_POLICY.requiredChallengeCount(desired);',
    'if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;',
    'if(y&&!v.years.includes(y))return false;',
    'const p=getProgress(v.id);',
    'return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);',
    'const exceptionCap=WASEDA_PLANNING_POLICY.foundationExceptionCap(desired);',
    'const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);'
  ])assert.ok(block.includes(snippet),`adapted third-boundary behavior drifted: ${snippet}`);
  const layerI=block.indexOf('if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;');
  const yearI=block.indexOf('if(y&&!v.years.includes(y))return false;');
  const progressI=block.indexOf('const p=getProgress(v.id);');
  const stateI=block.indexOf('return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);');
  assert.ok(layerI>=0&&layerI<yearI&&yearI<progressI&&progressI<stateI,'adapted foundation filter ordering changed');
}else{
  for(const snippet of [
    'const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"&&(!y||v.years.includes(y)));',
    'const desired=requested||challenge.length;',
    'const required=Math.ceil(desired*.8);',
    'if(challenge.length<required){',
    'const n=Math.min(desired,challenge.length);',
    'const picked=v75WeightedWithoutReplacement(challenge,n,v75ChallengeScore);',
    'const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;',
    'if(y&&!v.years.includes(y))return false;',
    'const p=getProgress(v.id);',
    'return isWeakProgress(p)||due||recent;',
    'const exceptionCap=Math.floor(desired*.2);',
    'v=>schedulerScore(v,"recommended")',
    'const challengeN=Math.min(challenge.length,desired-exceptions.length);',
    'const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);',
    'exceptions.forEach(v=>baseReasons[v.id]=v75FoundationReason(v));'
  ])assert.ok(block.includes(snippet),`legacy third-boundary behavior drifted: ${snippet}`);
  const layerI=block.indexOf('const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;');
  const yearI=block.indexOf('if(y&&!v.years.includes(y))return false;');
  const progressI=block.indexOf('const p=getProgress(v.id);');
  const dueI=block.indexOf('const due=p.nextReview&&new Date(p.nextReview).getTime()<=t;');
  const stateI=block.indexOf('return isWeakProgress(p)||due||recent;');
  assert.ok(layerI>=0&&layerI<yearI&&yearI<progressI&&progressI<dueI&&dueI<stateI,'legacy foundation filter ordering changed');
}

for(const forbidden of ['mutating FYam8/rikkyo-uk-vocab','changing Waseda production main','deploying either public app'])assert.ok(validation.forbidden.includes(forbidden));
assert.equal(contract.foundationReasonPolicy.mustRemainOutsideCommonEngine,true);
assert.equal(contract.challengeScorePolicy.schoolSpecific,true);
assert.equal(contract.challengeScorePolicy.memoryBoostOwnedBy,'WASEDA_MEMORY_POLICY.applyChallengeMemoryScore');
assert.equal(contract.status,'contract-only-no-runtime-wiring');
if(validation.thirdTransformPreparation){
  assert.equal(validation.thirdTransformPreparation.status,'prepared-no-runtime-mutation');
  assert.equal(validation.thirdTransformPreparation.transformScript,'tools/extract_waseda_challenge_session_composition_policy_adapter.py');
  assert.equal(validation.thirdTransformPreparation.adapterTest,'tools/waseda_challenge_session_composition_policy_adapter_test.mjs');
}

console.log('Waseda session-planning policy validation checkpoint: PASS');
