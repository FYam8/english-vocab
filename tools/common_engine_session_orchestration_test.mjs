import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source=fs.readFileSync('src/common-engine/session-orchestration.js','utf8');
for(const forbidden of ['"75"','"60"','"70"','priority==="S"','challenge','waseshibu','localStorage','日本語']){
  assert.ok(!source.includes(forbidden),`common orchestration contains school-specific token: ${forbidden}`);
}
const context={};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__engine=VOCABULARY_SESSION_ENGINE;`,context);
const engine=context.__engine;
const plain=value=>JSON.parse(JSON.stringify(value));

const items=[{id:'a',kind:'base'},{id:'b',kind:'special'},{id:'c',kind:'base'}];
const shared={
  mode:'weighted',year:'all',pool:items,unlimitedSize:0,getId:item=>item.id,
  isSpecialMode:mode=>mode==='special',buildSpecialPlan:()=>({baseQueueIds:['b'],actualSessionSize:1}),
  isRandomMode:mode=>mode==='random',shuffle:values=>values.slice().reverse(),
  weightedWithoutReplacement:(values,n)=>values.slice(0,n),score:()=>1,isSpecialEntity:item=>item.kind==='special'
};
assert.deepEqual(plain(engine.buildPlan({...shared,size:0})),{
  unlimited:true,candidatePoolIds:['a','b','c'],baseQueueIds:[],actualSessionSize:0
});
assert.deepEqual(plain(engine.buildPlan({...shared,size:2})),{
  unlimited:false,candidatePoolIds:[],baseQueueIds:['a','b'],actualSessionSize:2,specialCount:1,baseReasons:{}
});
assert.deepEqual(engine.buildPlan({...shared,mode:'random',size:2}).baseQueueIds,['c','b']);
assert.deepEqual(plain(engine.buildPlan({...shared,mode:'special',size:2})),{
  unlimited:false,candidatePoolIds:[],baseQueueIds:['b'],actualSessionSize:1
});

const queue=[{wordId:'late',dueAfterTotal:8},{wordId:'blocked',dueAfterTotal:3},{wordId:'first',dueAfterTotal:3}];
assert.equal(engine.dueRetry(queue,7,id=>id==='blocked').wordId,'first');
assert.equal(engine.dueRetry(queue,2,()=>false),null);

const byId=new Map(items.map(item=>[item.id,item]));
let selectedCandidates=[];
const picked=engine.pickUnlimitedBase({
  candidateIds:['a','b','c'],resolve:id=>byId.get(id),isBlocked:id=>id==='c',getId:item=>item.id,
  restrictPool:pool=>pool,mode:'weighted',recentIds:['x','a'],recentWindow:2,score:item=>item.id==='b'?5:1,
  weightedChoice:(candidates)=>{selectedCandidates=candidates.map(item=>item.id);return candidates[0]}
});
assert.deepEqual(selectedCandidates,['b']);
assert.equal(picked.id,'b');

const state={retryQueue:[{wordId:'b',dueAfterTotal:1}],retryCounts:{},totalAnswered:1,unlimited:false,
  generatedBaseIds:[],baseCursor:0,baseQueueIds:['a'],baseReasons:{a:'reason'}};
let result=engine.nextItem({state,dueRetry:()=>state.retryQueue[0],pickUnlimitedBase:()=>null,resolve:id=>byId.get(id),getId:item=>item.id});
assert.equal(result.v.id,'b');assert.equal(result.isRetry,true);assert.equal(state.retryCounts.b,1);
result=engine.nextItem({state,dueRetry:()=>null,pickUnlimitedBase:()=>null,resolve:id=>byId.get(id),getId:item=>item.id});
assert.deepEqual({id:result.v.id,isRetry:result.isRetry,reason:result.reason},{id:'a',isRetry:false,reason:'reason'});
assert.equal(engine.nextItem({state,dueRetry:()=>null,pickUnlimitedBase:()=>null,resolve:id=>byId.get(id),getId:item=>item.id}),null);

console.log('Common session orchestration: PASS');
