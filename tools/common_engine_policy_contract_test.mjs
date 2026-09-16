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
assert.equal(contract.status, 'second-runtime-boundary-validated-next-contract-defined');
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
assert.deepEqual(waseda.memorySchedulerPolicy.reviewUrgencyBoost, {gapScale:900, floor:90});
assert.deepEqual(waseda.memorySchedulerPolicy.examUrgency, {windowDays:30, prioritySScale:80, weakScale:100, memoryGapScale:300});
assert.deepEqual(waseda.memorySchedulerPolicy.challengeMemoryBoost, {gapScale:700, floor:70});
assert.equal(waseda.memorySchedulerPolicy.mustRemainBehaviorallyIdenticalDuringAdapterIntroduction, true);

assert.ok(memory.includes('function v76TargetRetention(v,p){'));
assert.ok(memory.includes('function v76ReviewIntervalDays(v,p,model){'));
assert.ok(memory.includes('function v76UpdateMemoryAfterOutcome(v,p,pending,ctx){'));
assert.ok(fs.existsSync(policyPath), 'validated Waseda memory policy adapter must exist');
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

assert.ok(integration.includes('schedulerScore=function(v,mode){'));
assert.ok(integration.includes('const days=v76ExamDaysLeft();'));
for (const token of [
  'applyReviewUrgencyExtra(extra,v,p,m){',
  'if(r<target)extra+=(target-r)*900+90;',
  'applyExamUrgencyExtra(extra,v,p,m,days){',
  'if(v.priority==="S")extra+=80*urgency;',
  'if(isWeakProgress(p))extra+=100*urgency;',
  'extra+=Math.max(0,target-r)*300*urgency;',
  'applyChallengeMemoryScore(score,v,p,m){',
  'if(r<target)score+=(target-r)*700+70;'
]) assert.ok(policy.includes(token), `Waseda scoring policy formula missing: ${token}`);
assert.ok(integration.includes('extra=WASEDA_MEMORY_POLICY.applyReviewUrgencyExtra(extra,v,p,m);'));
assert.ok(integration.includes('extra=WASEDA_MEMORY_POLICY.applyExamUrgencyExtra(extra,v,p,m,days);'));
assert.ok(integration.includes('score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);'));
for (const token of [
  'if(r<target)extra+=(target-r)*900+90;',
  'if(v.priority==="S")extra+=80*urgency;',
  'if(isWeakProgress(p))extra+=100*urgency;',
  'extra+=Math.max(0,target-r)*300*urgency;',
  'if(r<target)score+=(target-r)*700+70;'
]) assert.ok(!integration.includes(token), `Waseda scoring policy remains duplicated in integration: ${token}`);

for (const symbol of ['v75ChallengeScore', 'v75FoundationReason', 'buildChallengeSessionPlan', 'buildSessionPlan', 'v75DueRetry', 'v75PickUnlimitedBase', 'v75NextSessionItem']) {
  assert.ok(planning.includes(symbol), `Waseda planning policy moved before its adapter contract: ${symbol}`);
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
assert.equal(first.status, 'introduced-and-exact-head-validated');
assert.equal(first.validatedHead, '7ccde7dd797dd931721c9dcd1befe6fdb380c6bc');
for (const symbol of ['v76TargetRetention', 'v76ReviewIntervalDays', 'v76UpdateMemoryAfterOutcome']) {
  assert.ok(first.scope.some((x) => x.includes(symbol)), `first runtime boundary missing reviewed symbol: ${symbol}`);
}

const second = contract.secondRuntimeBoundary;
assert.equal(second.name, 'memory-priority-scoring-policy-adapter');
assert.equal(second.status, 'introduced-and-exact-head-validated');
assert.equal(second.validatedHead, 'd2fec5e326564b5af46406fd3360887ad9ce5d9a');
assert.equal(second.artifactSha256, '5315e82069688b7bef265d2057e618f88afa1cdc2b31b051f7746ae8000d8463');
assert.deepEqual(second.exactCurrentValues, {
  reviewGapScale:900,
  reviewGapFloor:90,
  examWindowDays:30,
  examPrioritySScale:80,
  examWeakScale:100,
  examMemoryGapScale:300,
  challengeGapScale:700,
  challengeGapFloor:70
});
for (const token of ['schedulerScore', 'exam urgency', 'S-priority', 'weak-item', 'v75ChallengeScore']) {
  assert.ok(second.scope.some((x) => x.includes(token)), `second runtime boundary missing scope token: ${token}`);
}

const third = contract.thirdRuntimeBoundary;
assert.equal(third.name, 'session-planning-policy-adapter');
assert.equal(third.status, 'blocked-until-contract-exact-head-green');
for (const token of ['v75ChallengeScore', 'v75FoundationReason', 'buildChallengeSessionPlan', 'buildSessionPlan', 'v75DueRetry/v75PickUnlimitedBase/v75NextSessionItem']) {
  assert.ok(third.scope.some((x) => x.includes(token)), `third runtime boundary missing scope token: ${token}`);
}
assert.ok(third.forbiddenThirdStep.some((x) => x.includes('common engine')));
assert.ok(third.forbiddenThirdStep.some((x) => x.includes('Rikkyo')));
assert.ok(third.forbiddenThirdStep.some((x) => x.includes('deploying')));

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
