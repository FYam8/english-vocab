import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const common=fs.readFileSync('src/common-engine/session-orchestration.js','utf8');
const policySource=fs.readFileSync('src/waseda-bootstrap/31a-waseda-planning-policy.js','utf8');
const planning=fs.readFileSync('src/waseda-bootstrap/32-session-planning-runtime.js','utf8');
assert.ok(policySource.includes('retryGap(v){return v.priority==="S"||v.level===60?6:8}'));
assert.ok(policySource.includes('unlimitedRecentWindow:6'));
assert.ok(planning.includes('VOCABULARY_SESSION_ENGINE.buildPlan'));
assert.ok(planning.includes('VOCABULARY_SESSION_ENGINE.dueRetry'));
assert.ok(planning.includes('VOCABULARY_SESSION_ENGINE.pickUnlimitedBase'));
assert.ok(planning.includes('VOCABULARY_SESSION_ENGINE.nextItem'));

const policyBlock=policySource.match(/const WASEDA_PLANNING_POLICY=Object\.freeze\(\{[\s\S]*?\n\}\);/)?.[0];
assert.ok(policyBlock);
const context={
  PRIORITY_SCORE:{S:90,A:48,B:24,C:8},effectiveFrequency:v=>v.frequency||0,isWeakProgress:p=>!!p.weak
};
vm.createContext(context);
vm.runInContext(`${common}\n${policyBlock}\nglobalThis.engine=VOCABULARY_SESSION_ENGINE;globalThis.policy=WASEDA_PLANNING_POLICY;`,context);
const {engine,policy}=context;
for(const [word,gap] of [[{priority:'S',level:75},6],[{priority:'A',level:60},6],[{priority:'A',level:70},8]]){
  assert.equal(policy.retryGap(word),gap);
}

function legacyDueRetry(state){
  return state.retryQueue.filter(r=>r.dueAfterTotal<=state.totalAnswered&&!state.blockedIds.has(r.wordId)).sort((a,b)=>a.dueAfterTotal-b.dueAfterTotal)[0]||null;
}
for(const totalAnswered of [0,3,6,8,20]){
  const state={totalAnswered,blockedIds:new Set(['blocked']),retryQueue:[
    {wordId:'eight',dueAfterTotal:8},{wordId:'blocked',dueAfterTotal:1},{wordId:'six',dueAfterTotal:6}
  ]};
  const legacy=legacyDueRetry(state);
  const adapted=engine.dueRetry(state.retryQueue,state.totalAnswered,id=>state.blockedIds.has(id));
  assert.equal(adapted?.wordId,legacy?.wordId,`due retry changed at total ${totalAnswered}`);
}

const entities=[{id:'a',studyLayer:'challenge'},{id:'b',studyLayer:'challenge'},{id:'c',studyLayer:'core'}];
const byId=new Map(entities.map(v=>[v.id,v]));
function legacyUnlimited(state){
  let pool=state.candidatePoolIds.map(id=>byId.get(id)).filter(Boolean).filter(v=>!state.blockedIds.has(v.id));
  if(state.mode==='75')pool=pool.filter(v=>(v.studyLayer||'core')==='challenge');
  if(!pool.length)return null;
  const recent=new Set(state.recentIds.slice(-6));
  let candidates=pool.filter(v=>!recent.has(v.id));if(!candidates.length)candidates=pool;
  return candidates[0];
}
for(const state of [
  {mode:'75',candidatePoolIds:['a','b','c'],blockedIds:new Set(),recentIds:['a']},
  {mode:'recommended',candidatePoolIds:['a','b','c'],blockedIds:new Set(['b']),recentIds:['a']},
  {mode:'random',candidatePoolIds:['a'],blockedIds:new Set(),recentIds:['a']}
]){
  const adapted=engine.pickUnlimitedBase({candidateIds:state.candidatePoolIds,resolve:id=>byId.get(id),
    isBlocked:id=>state.blockedIds.has(id),getId:v=>v.id,
    restrictPool:(pool,mode)=>policy.isChallengeMode(mode)?pool.filter(v=>policy.isChallengeEntity(v)):pool,
    mode:state.mode,recentIds:state.recentIds,recentWindow:policy.unlimitedRecentWindow,score:()=>1,
    weightedChoice:candidates=>candidates[0]});
  assert.equal(adapted?.id,legacyUnlimited(state)?.id,`unlimited selection changed in ${state.mode}`);
}

console.log('Waseda session orchestration parity: PASS');
