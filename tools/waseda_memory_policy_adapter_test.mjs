import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const policy = read('src/waseda-bootstrap/34-waseda-memory-policy.js');
const memory = read('src/waseda-bootstrap/35-v76-memory-runtime.js');
const manifest = JSON.parse(read('src/waseda-bootstrap/manifest.json'));
const validation = JSON.parse(read('src/common-engine/policy-contract-validation.json'));

assert.equal(validation.approvedRuntimeBoundary, 'memory-scheduler-policy-adapter');
assert.equal(validation.allowWasedaAdapterIntroduction, true);
assert.equal(validation.allowRikkyoRuntimeMutation, false);
assert.equal(validation.allowProductionMainMutation, false);

assert.ok(policy.includes('const WASEDA_MEMORY_POLICY=Object.freeze({'));
assert.ok(policy.includes('if(s&&w)return .93;'));
assert.ok(policy.includes('if(s||w)return .92;'));
assert.ok(policy.includes('return .90;'));
assert.ok(policy.includes('retryCorrectIntervalDays:1'));
assert.ok(policy.includes('missIntervalMinutes:15'));
assert.ok(policy.includes('(v.studyLayer||"core")==="diagnostic"'));

assert.ok(memory.includes('return WASEDA_MEMORY_POLICY.targetRetention(v,p);'));
assert.ok(memory.includes('return WASEDA_MEMORY_POLICY.reviewIntervalDays(v,p,model);'));
assert.ok(memory.includes('if(WASEDA_MEMORY_POLICY.isDiagnosticFirstPass(v,p,ctx.attemptsBefore)){'));
assert.ok(memory.includes('pending.isRetry?WASEDA_MEMORY_POLICY.retryCorrectIntervalDays:v76ReviewIntervalDays(v,p,m)'));
assert.ok(memory.includes('WASEDA_MEMORY_POLICY.missIntervalMinutes*V76_MINUTE_MS/V76_DAY_MS'));
assert.ok(memory.includes('ctx.nowMs+WASEDA_MEMORY_POLICY.missIntervalMinutes*V76_MINUTE_MS'));

for (const forbidden of [
  'const s=v&&v.priority==="S",w=!!(p&&isWeakProgress(p));',
  'if((v.studyLayer||"core")==="diagnostic"&&ctx.attemptsBefore===0&&p.incorrect===0){',
  'pending.isRetry?1:v76ReviewIntervalDays(v,p,m)',
  '15*V76_MINUTE_MS/V76_DAY_MS',
  'ctx.nowMs+15*V76_MINUTE_MS'
]) {
  assert.ok(!memory.includes(forbidden), `Waseda policy remains duplicated in memory core: ${forbidden}`);
}

const order = manifest.assemblyOrder;
const policyIndex = order.indexOf('34-waseda-memory-policy.js');
const memoryIndex = order.indexOf('35-v76-memory-runtime.js');
assert.ok(policyIndex >= 0);
assert.equal(policyIndex + 1, memoryIndex);
assert.equal(manifest.boundaries.wasedaMemoryPolicyV76, '34-waseda-memory-policy.js');

const sandbox = {
  isWeakProgress: (p) => !!p?.weak,
  v76Clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x))),
  v76IntervalForTarget: (stabilityDays, targetRetention) => {
    const s = Math.max(.05, Number(stabilityDays) || .05);
    const t = Math.max(.80, Math.min(.97, Number(targetRetention)));
    return s * Math.log(t) / Math.log(.9);
  }
};
vm.createContext(sandbox);
vm.runInContext(`${policy}\nglobalThis.__policy=WASEDA_MEMORY_POLICY;`, sandbox);
const p = sandbox.__policy;
assert.equal(p.targetRetention({priority:'A'}, {weak:false}), .90);
assert.equal(p.targetRetention({priority:'S'}, {weak:false}), .92);
assert.equal(p.targetRetention({priority:'A'}, {weak:true}), .92);
assert.equal(p.targetRetention({priority:'S'}, {weak:true}), .93);
assert.equal(p.retryCorrectIntervalDays, 1);
assert.equal(p.missIntervalMinutes, 15);
assert.equal(p.isDiagnosticFirstPass({studyLayer:'diagnostic'}, {incorrect:0}, 0), true);
assert.equal(p.isDiagnosticFirstPass({studyLayer:'core'}, {incorrect:0}, 0), false);
assert.equal(p.isDiagnosticFirstPass({studyLayer:'diagnostic'}, {incorrect:1}, 0), false);
assert.equal(p.isDiagnosticFirstPass({studyLayer:'diagnostic'}, {incorrect:0}, 1), false);
const expected = sandbox.v76Clamp(sandbox.v76IntervalForTarget(10, .90), .75, 60);
assert.equal(p.reviewIntervalDays({priority:'A'}, {weak:false}, {stabilityDays:10}), expected);

console.log('Waseda memory policy adapter: PASS');
