import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const policySource = read('src/waseda-bootstrap/34-waseda-memory-policy.js');
const integration = read('src/waseda-bootstrap/36-v76-engine-integration.js');
const manifest = JSON.parse(read('src/waseda-bootstrap/manifest.json'));
const validation = JSON.parse(read('src/common-engine/policy-contract-validation.json'));

assert.equal(validation.allowWasedaScoringAdapterIntroduction, true);
assert.equal(validation.allowRikkyoRuntimeMutation, false);
assert.equal(validation.allowProductionMainMutation, false);
assert.equal(validation.wasedaMemoryScoringPolicyContractValidation?.approvedBoundary, 'memory-priority-scoring-policy-adapter');

for (const token of [
  'applyReviewUrgencyExtra(extra,v,p,m){',
  'if(r<target)extra+=(target-r)*900+90;',
  'applyExamUrgencyExtra(extra,v,p,m,days){',
  'if(days!=null&&days>=0&&days<=30){',
  'if(v.priority==="S")extra+=80*urgency;',
  'if(isWeakProgress(p))extra+=100*urgency;',
  'extra+=Math.max(0,target-r)*300*urgency;',
  'applyChallengeMemoryScore(score,v,p,m){',
  'if(r<target)score+=(target-r)*700+70;'
]) assert.ok(policySource.includes(token), `Waseda scoring policy token missing: ${token}`);

assert.ok(integration.includes('const base=v75SchedulerScoreForV76(v,mode);'));
assert.ok(integration.includes('if(mode==="random")return base;'));
assert.ok(integration.includes('extra=WASEDA_MEMORY_POLICY.applyReviewUrgencyExtra(extra,v,p,m);'));
assert.ok(integration.includes('const days=v76ExamDaysLeft();'));
assert.ok(integration.includes('extra=WASEDA_MEMORY_POLICY.applyExamUrgencyExtra(extra,v,p,m,days);'));
assert.ok(integration.includes('let score=v75ChallengeScoreForV76(v);'));
assert.ok(integration.includes('score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);'));
for (const token of [
  'if(r<target)extra+=(target-r)*900+90;',
  'if(v.priority==="S")extra+=80*urgency;',
  'if(isWeakProgress(p))extra+=100*urgency;',
  'extra+=Math.max(0,target-r)*300*urgency;',
  'if(r<target)score+=(target-r)*700+70;'
]) assert.ok(!integration.includes(token), `Waseda scoring formula still duplicated in integration: ${token}`);

for (const forbidden of ['localStorage', 'waseshibu_vocab_state', 'progress-sync', 'rikkyo-uk-vocab']) {
  assert.ok(!policySource.includes(forbidden), `scoring policy acquired forbidden persistence/cross-school token: ${forbidden}`);
}
assert.equal(manifest.boundaries?.wasedaMemoryScoringPolicyV76, '34-waseda-memory-policy.js');

const context = {
  V76_MEMORY_MODEL_VERSION: 1,
  isWeakProgress: (p) => !!p?.weak,
  v76Clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x))),
  v76IntervalForTarget: (stabilityDays, targetRetention) => {
    const s = Math.max(.05, Number(stabilityDays) || .05);
    const t = Math.max(.80, Math.min(.97, Number(targetRetention)));
    return s * Math.log(t) / Math.log(.9);
  },
  v76Retrievability: (model) => Number(model?.r),
};
context.v76TargetRetention = (v, p) => context.__policy.targetRetention(v, p);
vm.createContext(context);
vm.runInContext(`${policySource}\nglobalThis.__policy=WASEDA_MEMORY_POLICY;`, context);
const policy = context.__policy;
assert.ok(policy && typeof policy.applyReviewUrgencyExtra === 'function');

function legacyTarget(v, p) {
  const s = v && v.priority === 'S', w = !!(p && p.weak);
  if (s && w) return .93;
  if (s || w) return .92;
  return .90;
}
function legacySchedulerExtra(v, p, m, days) {
  let extra = 0;
  if (m && Number(m.version) === 1) {
    const r = Number(m.r), target = legacyTarget(v, p);
    if (r < target) extra += (target - r) * 900 + 90;
  }
  if (days != null && days >= 0 && days <= 30) {
    const urgency = (30 - days) / 30;
    if (v.priority === 'S') extra += 80 * urgency;
    if (p?.weak) extra += 100 * urgency;
    if (m) {
      const r = Number(m.r), target = legacyTarget(v, p);
      extra += Math.max(0, target - r) * 300 * urgency;
    }
  }
  return extra;
}
function adapterSchedulerExtra(v, p, m, days) {
  let extra = 0;
  extra = policy.applyReviewUrgencyExtra(extra, v, p, m);
  extra = policy.applyExamUrgencyExtra(extra, v, p, m, days);
  return extra;
}
function legacyChallengeScore(base, v, p, m) {
  let score = base;
  if (m) {
    const r = Number(m.r), target = legacyTarget(v, p);
    if (r < target) score += (target - r) * 700 + 70;
  }
  return score;
}

const cases = [
  [{priority:'S'}, {weak:true}, {version:1,r:.70}, 0],
  [{priority:'S'}, {weak:false}, {version:1,r:.88}, 15],
  [{priority:'A'}, {weak:true}, {version:1,r:.91}, 29.5],
  [{priority:'B'}, {weak:false}, {version:1,r:.95}, 30],
  [{priority:'S'}, {weak:true}, {version:2,r:.60}, 10],
  [{priority:'A'}, {weak:false}, null, null],
  [{priority:'S'}, {weak:false}, {version:1,r:.50}, -1],
  [{priority:'S'}, {weak:false}, {version:1,r:.50}, 31]
];
for (const [v,p,m,days] of cases) {
  const legacy = legacySchedulerExtra(v,p,m,days);
  const adapted = adapterSchedulerExtra(v,p,m,days);
  assert.equal(adapted, legacy, `scheduler scoring changed for ${JSON.stringify({v,p,m,days})}`);
  const base = 123.456;
  assert.equal(policy.applyChallengeMemoryScore(base,v,p,m), legacyChallengeScore(base,v,p,m), `challenge scoring changed for ${JSON.stringify({v,p,m})}`);
}

console.log('Waseda memory scoring policy adapter: PASS');
