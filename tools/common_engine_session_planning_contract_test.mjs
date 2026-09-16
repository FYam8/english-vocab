import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const contract = JSON.parse(read('src/common-engine/session-planning-contract.json'));
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const session = read('src/waseda-bootstrap/31-waseda-session-runtime.js');
const policyPath = 'src/waseda-bootstrap/31a-waseda-planning-policy.js';
const policy = fs.existsSync(policyPath) ? read(policyPath) : '';
const planning = read('src/waseda-bootstrap/32-session-planning-runtime.js');
const validation = JSON.parse(read('src/common-engine/policy-contract-validation.json'));

assert.equal(contract.format, 'waseda-session-planning-policy-contract/v1');
assert.equal(contract.status, 'contract-only-no-runtime-wiring');
assert.equal(contract.reviewedSourceHead, '727783e9adc53c9caa55201bcee4817cd0c1373f');
assert.equal(contract.productionBaseline, '531d505c19a86eaa2c8bbc4b25179de8089ab585');
assert.equal(validation.nextBoundary?.name, 'session-planning-policy-adapter');
assert.equal(validation.nextBoundary?.allowRuntimeMutation, false);

assert.deepEqual(contract.baseSelectionPolicy.priorityScore, {S:90,A:48,B:24,C:8});
assert.deepEqual(contract.baseSelectionPolicy.levelScore, {'60':50,'70':24,'75':8});
assert.deepEqual(contract.baseSelectionPolicy.layerScore, {core:70,diagnostic:55,challenge:10,reference:0});
assert.deepEqual(contract.baseSelectionPolicy.masteryWeight, [80,110,65,25,4]);
for (const [key,value] of Object.entries({
  yearCountScale:8,sqrtFrequencyScale:4,dueBoost:115,recentMistakeBoost:80,weakBoost:95,
  prioritySUnderMastery3Boost:70,level60UnderMastery3Boost:55,directVocabUnderMastery3Boost:90,
  diagnosticUnattemptedBoost:75,diagnosticPassedSuppressionMultiplier:0.08,mode60Boost:40,
  mode70Boost:25,modeDiagnosticBoost:80,modeFrequentYearScale:10,mastery4NotDueSuppressionMultiplier:0.10,
  minimumScore:0.1
})) assert.equal(contract.baseSelectionPolicy[key], value, `base selection contract drifted: ${key}`);
assert.deepEqual(contract.baseSelectionPolicy.weightedWithoutReplacementJitter, {minMultiplier:0.92,range:0.16});

for (const snippet of [
  'const PRIORITY_SCORE={S:90,A:48,B:24,C:8};',
  'const LEVEL_SCORE={60:50,70:24,75:8};',
  'const LAYER_SCORE={core:70,diagnostic:55,challenge:10,reference:0};',
  'let score=PRIORITY_SCORE[v.priority]+LEVEL_SCORE[v.level]+LAYER_SCORE[layer]+v.yearCount*8+Math.sqrt(effectiveFrequency(v))*4;',
  'const masteryWeight=[80,110,65,25,4][p.mastery];',
  'if(due)score+=115;',
  'if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;',
  'if(isWeakProgress(p))score+=95;',
  'if(v.priority==="S"&&p.mastery<3)score+=70;',
  'if(v.level===60&&p.mastery<3)score+=55;',
  'if(v.directVocab&&p.mastery<3)score+=90;',
  'if(layer==="diagnostic"&&attemptCount(p)===0)score+=75;',
  'if(layer==="diagnostic"&&p.mastery>=2&&p.correct>=1&&!due)score*=0.08;',
  'if(mode==="60"&&v.level===60)score+=40;',
  'if(mode==="70"&&v.level<=70)score+=25;',
  'if(mode==="diagnostic")score+=80;',
  'if(mode==="frequent")score+=v.yearCount*10;',
  'if(p.mastery===4&&!due)score*=0.10;',
  'return Math.max(.1,score);',
  'Math.max(.1,scoreFn(v))*(.92+Math.random()*.16)'
]) assert.ok(engine.includes(snippet), `Waseda base selection policy drifted: ${snippet}`);

for (const snippet of [
  'if(layer==="reference")return false;',
  'if(mode==="recommended")',
  'if(mode==="60")return layer!=="challenge"&&v.level===60',
  'if(mode==="70")return layer!=="challenge"&&(v.level===60||v.level===70)',
  'if(mode==="diagnostic")return layer==="diagnostic"&&!diagPassed;',
  'if(mode==="75")return layer==="core"||layer==="diagnostic"||layer==="challenge";',
  'if(mode==="unlearned")return attemptCount(p)===0;',
  'if(mode==="weak")return isWeakProgress(p);',
  'if(mode==="review")return !!p.nextReview&&new Date(p.nextReview).getTime()<=t;',
  'if(mode==="frequent")return (v.yearCount>=3||effectiveFrequency(v)>=10)&&layer!=="challenge";',
  'if(mode==="random")return true;'
]) assert.ok(engine.includes(snippet), `Waseda mode eligibility drifted: ${snippet}`);

const scoreFormula = [
  'let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];',
  'if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;',
  'if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;',
  'if(isWeakProgress(p))score+=95;',
  'if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;'
];
assert.equal(contract.challengeScorePolicy.dueBoost,115);
assert.equal(contract.challengeScorePolicy.recentMistakeBoost,80);
assert.equal(contract.challengeScorePolicy.weakBoost,95);
assert.equal(contract.challengeScorePolicy.mastery4NotDueSuppressionMultiplier,0.12);
assert.equal(contract.challengeScorePolicy.memoryBoostOwnedBy,'WASEDA_MEMORY_POLICY.applyChallengeMemoryScore');
assert.equal(contract.challengeScorePolicy.schoolSpecific,true);
if (policy.includes('challengeScore(v,p,t){')) {
  for (const token of scoreFormula) {
    assert.ok(policy.includes(token), `Waseda challenge score adapter drifted: ${token}`);
    assert.ok(!planning.includes(token), `challenge score formula duplicated in planning runtime: ${token}`);
  }
  assert.ok(planning.includes('return WASEDA_PLANNING_POLICY.challengeScore(v,p,t);'));
} else {
  for (const token of scoreFormula) assert.ok(planning.includes(token), `Waseda challenge score policy drifted: ${token}`);
}

const reasons = contract.foundationReasonPolicy;
assert.deepEqual(reasons.precedence, ['weak','recentMistake','due','default']);
if (policy) {
  assert.ok(policy.includes('const WASEDA_PLANNING_POLICY=Object.freeze({'));
  assert.ok(policy.includes('foundationReason(v,p,t){'));
  for (const key of ['weak','recentMistake','due','default']) {
    assert.ok(policy.includes(reasons[key]), `Waseda foundation reason adapter drifted: ${key}`);
    assert.ok(!planning.includes(reasons[key]), `foundation reason duplicated in planning runtime: ${key}`);
  }
  assert.ok(planning.includes('return WASEDA_PLANNING_POLICY.foundationReason(v,p,t);'));
} else {
  for (const key of ['weak','recentMistake','due','default']) assert.ok(planning.includes(reasons[key]), `Waseda foundation reason drifted: ${key}`);
}
assert.equal(reasons.mustRemainOutsideCommonEngine,true);

assert.equal(contract.challengeSessionComposition.requiredChallengeFraction,0.8);
assert.equal(contract.challengeSessionComposition.foundationExceptionFractionCap,0.2);
const compositionAdapted = policy.includes('isChallengeEntity(v){');
if (compositionAdapted) {
  for (const snippet of [
    'isChallengeEntity(v){return (v.studyLayer||"core")==="challenge"}',
    'return layer!=="reference"&&layer!=="challenge";',
    'return isWeakProgress(p)||due||recent;',
    'requiredChallengeCount(desired){return Math.ceil(desired*.8)}',
    'foundationExceptionCap(desired){return Math.floor(desired*.2)}'
  ]) assert.ok(policy.includes(snippet), `Waseda challenge composition adapter drifted: ${snippet}`);
  for (const snippet of [
    'WASEDA_PLANNING_POLICY.isChallengeEntity(v)&&(!y||v.years.includes(y))',
    'const required=WASEDA_PLANNING_POLICY.requiredChallengeCount(desired);',
    'if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;',
    'if(y&&!v.years.includes(y))return false;',
    'const p=getProgress(v.id);',
    'return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);',
    'const exceptionCap=WASEDA_PLANNING_POLICY.foundationExceptionCap(desired);',
    'v=>schedulerScore(v,"recommended")',
    'const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);'
  ]) assert.ok(planning.includes(snippet), `Waseda challenge composition delegation drifted: ${snippet}`);
  const block=planning.slice(planning.indexOf('function buildChallengeSessionPlan(year,requested){'),planning.indexOf('function buildSessionPlan(mode,year,size){'));
  assert.ok(block.indexOf('if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;') < block.indexOf('if(y&&!v.years.includes(y))return false;'));
  assert.ok(block.indexOf('if(y&&!v.years.includes(y))return false;') < block.indexOf('const p=getProgress(v.id);'));
  assert.ok(block.indexOf('const p=getProgress(v.id);') < block.indexOf('return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);'));
} else {
  for (const snippet of [
    'const required=Math.ceil(desired*.8);',
    'const exceptionCap=Math.floor(desired*.2);',
    'const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"',
    'if(layer==="reference"||layer==="challenge")return false;',
    'return isWeakProgress(p)||due||recent;',
    'v=>schedulerScore(v,"recommended")',
    'const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);'
  ]) assert.ok(planning.includes(snippet), `Waseda challenge composition drifted: ${snippet}`);
}

assert.equal(contract.sessionPlanPolicy.unlimitedSentinelSize,0);
assert.equal(contract.sessionPlanPolicy.challengeMode,'75');
assert.equal(contract.sessionPlanPolicy.randomMode,'random');
for (const snippet of [
  'if(size===0)return {unlimited:true,candidatePoolIds:pool.map(v=>v.id),baseQueueIds:[],actualSessionSize:0};',
  'if(mode==="75")return Object.assign({unlimited:false,candidatePoolIds:[]},buildChallengeSessionPlan(year,size));',
  'mode==="random"?shuffle(pool).slice(0,n):v75WeightedWithoutReplacement(pool,n,v=>schedulerScore(v,mode))'
]) assert.ok(planning.includes(snippet), `Waseda session-plan policy drifted: ${snippet}`);

assert.equal(contract.retryPolicy.gapAnswersPrioritySOrLevel60,6);
assert.equal(contract.retryPolicy.gapAnswersOther,8);
for (const snippet of [
  'if(!pending.isRetry&&(session.retryCounts[v.id]||0)===0){',
  'const gap=(v.priority==="S"||v.level===60)?6:8;',
  'session.retryQueue.push({wordId:v.id,dueAfterTotal:session.totalAnswered+gap});',
  '}else if(pending.isRetry){',
  'session.blockedIds.add(v.id);'
]) assert.ok(session.includes(snippet), `Waseda retry scheduling policy drifted: ${snippet}`);
for (const snippet of [
  'r.dueAfterTotal<=session.totalAnswered&&!session.blockedIds.has(r.wordId)',
  '.sort((a,b)=>a.dueAfterTotal-b.dueAfterTotal)[0]||null;',
  'const recent=new Set(session.recentIds.slice(-6));',
  'if(session.mode==="75")pool=pool.filter(v=>(v.studyLayer||"core")==="challenge");',
  'const due=v75DueRetry();',
  'if(session.unlimited){',
  'if(session.baseCursor<session.baseQueueIds.length){',
  'A retry that has not reached its 6/8-answer spacing is deferred to nextReview.'
]) assert.ok(planning.includes(snippet), `Waseda queue/retry policy drifted: ${snippet}`);

assert.equal(contract.unlimitedQueuePolicy.recentExclusionWindow,6);
assert.deepEqual(contract.retryPolicy.nextItemPrecedence,['dueRetry','unlimitedBase','finiteBaseQueue','endSession']);
assert.ok(contract.commonEngineBoundary.wasedaAdapterMustOwn.includes('retry gap rules'));
for (const forbidden of ['mutating FYam8/rikkyo-uk-vocab','changing Waseda production main','deploying either public app']) {
  assert.ok(contract.forbiddenDuringContractStage.includes(forbidden), `missing planning contract prohibition: ${forbidden}`);
}

console.log('Waseda session-planning policy contract: PASS');
