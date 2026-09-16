import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const policySource = read('src/waseda-bootstrap/31a-waseda-planning-policy.js');
const planning = read('src/waseda-bootstrap/32-session-planning-runtime.js');
const manifest = JSON.parse(read('src/waseda-bootstrap/manifest.json'));
const validation = JSON.parse(read('src/common-engine/session-planning-contract-validation.json'));
const contract = JSON.parse(read('src/common-engine/challenge-session-composition-contract.json'));

assert.equal(validation.allowThirdPlanningAdapterGroupIntroduction, true);
assert.equal(validation.thirdApprovedGroup, 'challenge-session-composition-policy-adapter');
assert.equal(validation.allowFullPlanningRuntimeMutation, false);
assert.equal(contract.format, 'waseda-challenge-session-composition-policy-contract/v1');
assert.equal(contract.exactBehavior.mustNotCreateProgressForLayerOrYearExcludedEntities, true);

for (const token of [
  'isChallengeEntity(v){return (v.studyLayer||"core")==="challenge"}',
  'isFoundationLayerEligible(v){',
  'return layer!=="reference"&&layer!=="challenge";',
  'isFoundationStateEligible(p,t){',
  'return isWeakProgress(p)||due||recent;',
  'requiredChallengeCount(desired){return Math.ceil(desired*.8)}',
  'foundationExceptionCap(desired){return Math.floor(desired*.2)}'
]) assert.ok(policySource.includes(token), `Waseda challenge-session policy token missing: ${token}`);

for (const token of [
  'WASEDA_PLANNING_POLICY.isChallengeEntity(v)&&(!y||v.years.includes(y))',
  'const required=WASEDA_PLANNING_POLICY.requiredChallengeCount(desired);',
  'if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;',
  'return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);',
  'const exceptionCap=WASEDA_PLANNING_POLICY.foundationExceptionCap(desired);',
  'combined.filter(v=>WASEDA_PLANNING_POLICY.isChallengeEntity(v)).length'
]) assert.ok(planning.includes(token), `Waseda challenge-session delegation missing: ${token}`);

for (const forbidden of [
  'const required=Math.ceil(desired*.8);',
  'const exceptionCap=Math.floor(desired*.2);',
  'const layer=v.studyLayer||"core";if(layer==="reference"||layer==="challenge")return false;',
  'return isWeakProgress(p)||due||recent;'
]) assert.ok(!planning.includes(forbidden), `challenge-session policy remains duplicated in planning runtime: ${forbidden}`);

const start = planning.indexOf('function buildChallengeSessionPlan(year,requested){');
const end = planning.indexOf('function buildSessionPlan(mode,year,size){');
assert.ok(start >= 0 && end > start);
const block = planning.slice(start,end);
const layerI = block.indexOf('if(!WASEDA_PLANNING_POLICY.isFoundationLayerEligible(v))return false;');
const yearI = block.indexOf('if(y&&!v.years.includes(y))return false;');
const progressI = block.indexOf('const p=getProgress(v.id);');
const stateI = block.indexOf('return WASEDA_PLANNING_POLICY.isFoundationStateEligible(p,t);');
assert.ok(layerI >= 0 && layerI < yearI && yearI < progressI && progressI < stateI,
  'foundation evaluation order changed; excluded entities may acquire default progress');

for (const untouched of [
  'function buildSessionPlan(mode,year,size){',
  'if(size===0)return {unlimited:true,candidatePoolIds:pool.map(v=>v.id),baseQueueIds:[],actualSessionSize:0};',
  'if(mode==="75")return Object.assign({unlimited:false,candidatePoolIds:[]},buildChallengeSessionPlan(year,size));',
  'function v75DueRetry(){',
  'r.dueAfterTotal<=session.totalAnswered&&!session.blockedIds.has(r.wordId)',
  'function v75PickUnlimitedBase(){',
  'if(session.mode==="75")pool=pool.filter(v=>(v.studyLayer||"core")==="challenge");',
  'const recent=new Set(session.recentIds.slice(-6));',
  'function v75NextSessionItem(){',
  'const due=v75DueRetry();'
]) assert.ok(planning.includes(untouched), `out-of-scope queue/planning behavior changed: ${untouched}`);

assert.equal(manifest.boundaries?.wasedaPlanningChallengeCompositionPolicyV75, '31a-waseda-planning-policy.js');
for (const forbidden of ['localStorage','waseshibu_vocab_state','progress-sync','rikkyo-uk-vocab']) {
  assert.ok(!policySource.includes(forbidden), `planning policy acquired forbidden persistence/cross-school token: ${forbidden}`);
}

const context = {
  Date,
  Math,
  PRIORITY_SCORE:{S:90,A:48,B:24,C:8},
  effectiveFrequency:(v)=>Number(v?.frequency)||0,
  isWeakProgress:(p)=>!!p?.weak
};
vm.createContext(context);
vm.runInContext(`${policySource}\nglobalThis.__policy=WASEDA_PLANNING_POLICY;`, context);
const policy = context.__policy;
assert.ok(policy);

for (const [v,expected] of [
  [{studyLayer:'challenge'},true],
  [{studyLayer:'core'},false],
  [{},false]
]) assert.equal(policy.isChallengeEntity(v),expected);
for (const [v,expected] of [
  [{studyLayer:'core'},true],
  [{studyLayer:'diagnostic'},true],
  [{studyLayer:'reference'},false],
  [{studyLayer:'challenge'},false],
  [{},true]
]) assert.equal(policy.isFoundationLayerEligible(v),expected);
for (let desired=0; desired<=25; desired++) {
  assert.equal(policy.requiredChallengeCount(desired),Math.ceil(desired*.8));
  assert.equal(policy.foundationExceptionCap(desired),Math.floor(desired*.2));
}
const t=Date.parse('2026-09-16T12:00:00Z');
assert.equal(policy.isFoundationStateEligible({weak:true,nextReview:null,recentMistakeUntil:null},t),true);
assert.equal(policy.isFoundationStateEligible({weak:false,nextReview:'2026-09-15T12:00:00Z',recentMistakeUntil:null},t),true);
assert.equal(policy.isFoundationStateEligible({weak:false,nextReview:null,recentMistakeUntil:'2026-09-17T12:00:00Z'},t),true);
assert.equal(policy.isFoundationStateEligible({weak:false,nextReview:'2026-09-17T12:00:00Z',recentMistakeUntil:'2026-09-15T12:00:00Z'},t),false);

// Execute only the reviewed buildChallengeSessionPlan block with deterministic stubs.
const touched=[];
const progressById={
  foundationWeak:{weak:true,nextReview:null,recentMistakeUntil:null},
  foundationDue:{weak:false,nextReview:'2026-09-15T12:00:00Z',recentMistakeUntil:null},
  foundationClean:{weak:false,nextReview:null,recentMistakeUntil:null}
};
const runtimeContext={
  WASEDA_PLANNING_POLICY:policy,
  Date,
  Math,
  VOCAB:[
    {id:'c1',studyLayer:'challenge',years:[2026]},
    {id:'c2',studyLayer:'challenge',years:[2026]},
    {id:'c3',studyLayer:'challenge',years:[2026]},
    {id:'c4',studyLayer:'challenge',years:[2026]},
    {id:'foundationWeak',studyLayer:'core',years:[2026]},
    {id:'foundationDue',studyLayer:'diagnostic',years:[2026]},
    {id:'foundationClean',studyLayer:'core',years:[2026]},
    {id:'excludedReference',studyLayer:'reference',years:[2026]},
    {id:'excludedChallenge',studyLayer:'challenge',years:[2025]},
    {id:'excludedYear',studyLayer:'core',years:[2025]}
  ],
  now:()=>t,
  getProgress:(id)=>{touched.push(id);return progressById[id]||{weak:false,nextReview:null,recentMistakeUntil:null};},
  v75WeightedWithoutReplacement:(pool,count)=>pool.slice(0,count),
  v75ChallengeScore:()=>1,
  schedulerScore:()=>1,
  shuffle:(xs)=>xs,
  v75FoundationReason:(v)=>`reason:${v.id}`
};
vm.createContext(runtimeContext);
vm.runInContext(`${block}\nglobalThis.__build=buildChallengeSessionPlan;`, runtimeContext);
const result=runtimeContext.__build('2026',5);
assert.deepEqual(Array.from(result.baseQueueIds),['c1','c2','c3','c4','foundationWeak']);
assert.equal(result.challengeCount,4);
assert.equal(result.baseReasons.foundationWeak,'reason:foundationWeak');
assert.deepEqual(touched,['foundationWeak','foundationDue','foundationClean'],
  'getProgress must run only after layer/year filters; excluded entities must not gain default progress');

console.log('Waseda challenge-session composition adapter: PASS');
