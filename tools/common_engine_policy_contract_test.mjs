import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const contract = JSON.parse(read('src/common-engine/policy-contract.json'));
const readiness = JSON.parse(read('src/waseda-bootstrap/engine-extraction-readiness.json'));
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const planning = read('src/waseda-bootstrap/32-session-planning-runtime.js');
const policyPath = 'src/waseda-bootstrap/34-waseda-memory-policy.js';
const memory = read('src/waseda-bootstrap/35-v76-memory-runtime.js');
const integration = read('src/waseda-bootstrap/36-v76-engine-integration.js');
const persistence = read('src/waseda-bootstrap/15-waseda-persistence.js');

assert.equal(contract.format, 'common-vocab-engine-policy-contract/v1');
assert.equal(contract.status, 'contract-only-no-runtime-wiring');
assert.equal(contract.masterRepository, 'FYam8/english-vocab');
assert.equal(contract.engineCandidateStatus, 'mixed-not-exportable');
assert.equal(readiness.pureHelperExtractionStatus, 'complete');
assert.equal(readiness.nextPhase, 'policy-injection-contract');
assert.equal(readiness.readySchoolNeutralHelpers.length, 0, 'pure-helper extraction must be closed before policy wiring');
assert.equal(readiness.fifthPromotionStatus, 'promoted');

const scheduler = contract.interfaces.memorySchedulerAdapter;
assert.equal(scheduler.schedulerStateIsOpaqueToEngine, true);
for (const method of ['getDueAt', 'isDue', 'applyOutcome', 'urgencyScore']) {
  assert.ok(scheduler.requiredMethods.includes(method), `scheduler adapter method missing: ${method}`);
}
assert.ok(scheduler.engineMustNotInterpret.includes('Waseda memoryModel object'));
assert.ok(scheduler.engineMustNotInterpret.includes('Rikkyo ts-fsrs Card object'));

const entity = contract.interfaces.entityAdapter;
for (const method of ['getStableId', 'isQuizEligible', 'getQuestionCapabilities']) {
  assert.ok(entity.requiredCapabilities.includes(method), `entity adapter capability missing: ${method}`);
}
for (const field of ['priority', 'level', 'studyLayer', 'yearCount', 'frequency']) {
  assert.ok(entity.engineMustNotRequireRawFields.includes(field), `raw school field must not be required by engine: ${field}`);
}

const waseda = contract.wasedaCurrentMapping;
assert.equal(waseda.memorySchedulerPolicy.retention.default, 0.90);
assert.equal(waseda.memorySchedulerPolicy.retention.prioritySOrWeak, 0.92);
assert.equal(waseda.memorySchedulerPolicy.retention.prioritySAndWeak, 0.93);
assert.deepEqual(waseda.memorySchedulerPolicy.reviewIntervalBoundsDays, [0.75, 60]);
assert.equal(waseda.memorySchedulerPolicy.retryCorrectIntervalDays, 1);
assert.equal(waseda.memorySchedulerPolicy.missIntervalMinutes, 15);
assert.equal(waseda.memorySchedulerPolicy.mustRemainBehaviorallyIdenticalDuringAdapterIntroduction, true);

assert.ok(memory.includes('function v76TargetRetention(v,p){'));
assert.ok(memory.includes('function v76ReviewIntervalDays(v,p,model){'));
assert.ok(memory.includes('function v76UpdateMemoryAfterOutcome(v,p,pending,ctx){'));

if (fs.existsSync(policyPath)) {
  const policy = read(policyPath);
  assert.ok(policy.includes('const WASEDA_MEMORY_POLICY=Object.freeze({'));
  assert.ok(policy.includes('if(s&&w)return .93;'));
  assert.ok(policy.includes('if(s||w)return .92;'));
  assert.ok(policy.includes('return .90;'));
  assert.ok(policy.includes('v76Clamp(v76IntervalForTarget(model.stabilityDays,WASEDA_MEMORY_POLICY.targetRetention(v,p)),.75,60)'));
  assert.ok(policy.includes('retryCorrectIntervalDays:1'));
  assert.ok(policy.includes('missIntervalMinutes:15'));
  assert.ok(memory.includes('return WASEDA_MEMORY_POLICY.targetRetention(v,p);'));
  assert.ok(memory.includes('return WASEDA_MEMORY_POLICY.reviewIntervalDays(v,p,model);'));
  assert.ok(memory.includes('if(WASEDA_MEMORY_POLICY.isDiagnosticFirstPass(v,p,ctx.attemptsBefore)){'));
  assert.ok(memory.includes('pending.isRetry?WASEDA_MEMORY_POLICY.retryCorrectIntervalDays:v76ReviewIntervalDays(v,p,m)'));
  assert.ok(!memory.includes('if(s&&w)return .93;'));
  assert.ok(!memory.includes('if(s||w)return .92;'));
  assert.ok(!memory.includes('v76Clamp(v76IntervalForTarget(model.stabilityDays,v76TargetRetention(v,p)),.75,60)'));
} else {
  assert.ok(memory.includes('if(s&&w)return .93;'));
  assert.ok(memory.includes('if(s||w)return .92;'));
  assert.ok(memory.includes('return .90;'));
  assert.ok(memory.includes('v76Clamp(v76IntervalForTarget(model.stabilityDays,v76TargetRetention(v,p)),.75,60)'));
}

assert.ok(integration.includes('schedulerScore=function(v,mode){'));
assert.ok(integration.includes('const days=v76ExamDaysLeft();'));
assert.ok(integration.includes('if(v.priority==="S")extra+=80*urgency;'));

for (const symbol of ['v75ChallengeScore', 'v75FoundationReason', 'buildChallengeSessionPlan', 'buildSessionPlan', 'v75DueRetry', 'v75PickUnlimitedBase', 'v75NextSessionItem']) {
  assert.ok(planning.includes(symbol), `Waseda planning policy moved before adapter contract: ${symbol}`);
}
assert.ok(planning.includes('75点挑戦を支える基礎語'));
assert.ok(planning.includes('if(mode==="75")'));
assert.ok(planning.includes('(v.studyLayer||"core")==="challenge"'));

const rikkyo = contract.rikkyoAuditedMapping;
assert.equal(rikkyo.repository, 'FYam8/rikkyo-uk-vocab');
assert.equal(rikkyo.auditedCommit, '06eb47656bf0066af5cfe2072a53cfcdd42e5232');
assert.equal(rikkyo.scheduler.algorithm, 'FSRS-6');
assert.equal(rikkyo.scheduler.package, 'ts-fsrs');
assert.equal(rikkyo.scheduler.packageVersion, '5.4.2');
assert.equal(rikkyo.scheduler.desiredRetention, 0.9);
assert.equal(rikkyo.scheduler.enableFuzz, false);
assert.equal(rikkyo.scheduler.enableShortTerm, false);
assert.equal(rikkyo.scheduler.mustNotBeReplacedByWasedaMemoryModel, true);
assert.equal(rikkyo.learningIdentity, 'stableId x skillKey');
assert.deepEqual(rikkyo.skillKeys, ['meaningRecognition', 'formProduction']);
assert.deepEqual(rikkyo.lanes, ['learning', 'relearning', 'provisional', 'review', 'acquisition']);
assert.equal(rikkyo.persistenceMustRemainSchoolSpecific, true);

const first = contract.firstRuntimeBoundary;
assert.equal(first.name, 'memory-scheduler-policy-adapter');
assert.equal(first.status, 'blocked-until-contract-exact-head-green');
for (const symbol of ['v76TargetRetention', 'v76ReviewIntervalDays', 'v76UpdateMemoryAfterOutcome']) {
  assert.ok(first.scope.some((x) => x.includes(symbol)), `first runtime boundary missing reviewed symbol: ${symbol}`);
}
for (const forbidden of ['waseshibu_', 'rikkyo-uk-vocab', 'direct localStorage access', 'cross-school export acceptance']) {
  assert.ok(contract.forbiddenCommonEngineAssumptions.includes(forbidden), `forbidden engine assumption missing: ${forbidden}`);
}

assert.ok(persistence.includes('storageKey:"waseshibu_vocab_state"'));
assert.ok(persistence.includes('activeSessionKey:"waseshibu_vocab_active_session_v1"'));
assert.ok(!engine.includes('function v76TargetRetention('), 'policy-coupled target retention must not be promoted into the common engine');
assert.ok(!engine.includes('function v76UpdateMemoryAfterOutcome('), 'policy-coupled memory update must not be promoted into the common engine');
assert.equal(contract.gates.runtimeWiringAllowedBeforeContractGreen, false);
assert.equal(contract.gates.requireWasedaProductionMainUnchanged, true);

console.log('Common-engine policy contract: PASS');
