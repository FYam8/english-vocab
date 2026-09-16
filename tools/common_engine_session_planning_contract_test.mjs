import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const contract = JSON.parse(read('src/common-engine/session-planning-contract.json'));
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const session = read('src/waseda-bootstrap/31-waseda-session-runtime.js');
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
assert.equal(contract.baseSelectionPolicy.yearCountScale, 8);
assert.equal(contract.baseSelectionPolicy.sqrtFrequencyScale, 4);
assert.equal(contract.baseSelectionPolicy.dueBoost, 115);
assert.equal(contract.baseSelectionPolicy.recentMistakeBoost, 80);
assert.equal(contract.baseSelectionPolicy.weakBoost, 95);
assert.equal(contract.baseSelectionPolicy.prioritySUnderMastery3Boost, 70);
assert.equal(contract.baseSelectionPolicy.level60UnderMastery3Boost, 55);
assert.equal(contract.baseSelectionPolicy.directVocabUnderMastery3Boost, 90);
assert.equal(contract.baseSelectionPolicy.diagnosticUnattemptedBoost, 75);
assert.equal(contract.baseSelectionPolicy.diagnosticPassedSuppressionMultiplier, 0.08);
assert.equal(contract.baseSelectionPolicy.mode60Boost, 40);
assert.equal(contract.baseSelectionPolicy.mode70Boost, 25);
assert.equal(contract.baseSelectionPolicy.modeDiagnosticBoost, 80);
assert.equal(contract.baseSelectionPolicy.modeFrequentYearScale, 10);
assert.equal(contract.baseSelectionPolicy.mastery4NotDueSuppressionMultiplier, 0.10);
assert.equal(contract.baseSelectionPolicy.minimumScore, 0.1);
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

assert.deepEqual(contract.challengeScorePolicy, {
  formulaBase:'priorityScore + yearCount*8 + sqrt(effectiveFrequency)*4 + masteryWeight',
  dueBoost:115,
  recentMistakeBoost:80,
  weakBoost:95,
  mastery4NotDueSuppressionMultiplier:0.12,
  memoryBoostOwnedBy:'WASEDA_MEMORY_POLICY.applyChallengeMemoryScore',
  schoolSpecific:true
});
for (const snippet of [
  'let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];',
  'score+=115;',
  'score+=80;',
  'score+=95;',
  'score*=.12;'
]) assert.ok(planning.includes(snippet), `Waseda challenge score policy drifted: ${snippet}`);

const reasons = contract.foundationReasonPolicy;
assert.deepEqual(reasons.precedence, ['weak','recentMistake','due','default']);
for (const key of ['weak','recentMistake','due','default']) assert.ok(planning.includes(reasons[key]), `Waseda foundation reason drifted: ${key}`);
assert.equal(reasons.mustRemainOutsideCommonEngine, true);

assert.equal(contract.challengeSessionComposition.requiredChallengeFraction, 0.8);
assert.equal(contract.challengeSessionComposition.foundationExceptionFractionCap, 0.2);
for (const snippet of [
  'const required=Math.ceil(desired*.8);',
  'const exceptionCap=Math.floor(desired*.2);',
  'const challenge=VOCAB.filter(v=>(v.studyLayer||"core")==="challenge"',
  'if(layer==="reference"||layer==="challenge")return false;',
  'return isWeakProgress(p)||due||recent;',
  'v=>schedulerScore(v,"recommended")',
  'const combined=shuffle([...challengePicked,...exceptions]).slice(0,desired);'
]) assert.ok(planning.includes(snippet), `Waseda challenge composition drifted: ${snippet}`);

assert.equal(contract.sessionPlanPolicy.unlimitedSentinelSize, 0);
assert.equal(contract.sessionPlanPolicy.challengeMode, '75');
assert.equal(contract.sessionPlanPolicy.randomMode, 'random');
for (const snippet of [
  'if(size===0)return {unlimited:true,candidatePoolIds:pool.map(v=>v.id),baseQueueIds:[],actualSessionSize:0};',
  'if(mode==="75")return Object.assign({unlimited:false,candidatePoolIds:[]},buildChallengeSessionPlan(year,size));',
  'mode==="random"?shuffle(pool).slice(0,n):v75WeightedWithoutReplacement(pool,n,v=>schedulerScore(v,mode))'
]) assert.ok(planning.includes(snippet), `Waseda session-plan policy drifted: ${snippet}`);

assert.equal(contract.retryPolicy.gapAnswersPrioritySOrLevel60, 6);
assert.equal(contract.retryPolicy.gapAnswersOther, 8);
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

assert.equal(contract.unlimitedQueuePolicy.recentExclusionWindow, 6);
assert.deepEqual(contract.retryPolicy.nextItemPrecedence, ['dueRetry','unlimitedBase','finiteBaseQueue','endSession']);
assert.equal(contract.commonEngineBoundary.wasedaAdapterMustOwn.includes('retry gap rules'), true);
assert.equal(contract.forbiddenDuringContractStage.includes('mutating FYam8/rikkyo-uk-vocab'), true);
assert.equal(contract.forbiddenDuringContractStage.includes('changing Waseda production main'), true);
assert.equal(contract.forbiddenDuringContractStage.includes('deploying either public app'), true);

console.log('Waseda session-planning policy contract: PASS');
