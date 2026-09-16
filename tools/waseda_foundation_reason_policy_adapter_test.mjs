import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const policyPath = 'src/waseda-bootstrap/31a-waseda-planning-policy.js';
const planning = read('src/waseda-bootstrap/32-session-planning-runtime.js');
const manifest = JSON.parse(read('src/waseda-bootstrap/manifest.json'));
const validation = JSON.parse(read('src/common-engine/session-planning-contract-validation.json'));

assert.equal(validation.allowFirstPlanningAdapterGroupIntroduction, true);
assert.equal(validation.allowFullPlanningRuntimeMutation, false);
assert.equal(validation.firstApprovedGroup, 'foundation-reason-policy-adapter');
assert.ok(fs.existsSync(policyPath), 'Waseda planning policy adapter source missing');
const policySource = read(policyPath);

const reasons = {
  weak: '挑戦前の基礎確認：最近の正誤履歴で苦手判定となっている重要語です。',
  recentMistake: '挑戦前の基礎確認：最近間違えた重要語のため再確認します。',
  due: '挑戦前の基礎確認：復習期限を迎えた重要語です。',
  default: '挑戦前の基礎確認：75点挑戦を支える基礎語を再確認します。'
};
for (const reason of Object.values(reasons)) {
  assert.equal(policySource.split(reason).length - 1, 1, `foundation reason must appear exactly once in Waseda policy: ${reason}`);
  assert.ok(!planning.includes(reason), `foundation reason must not remain duplicated in planning runtime: ${reason}`);
}
assert.ok(policySource.includes('const WASEDA_PLANNING_POLICY=Object.freeze({'));
assert.ok(policySource.includes('foundationReason(v,p,t){'));
assert.ok(planning.includes('function v75FoundationReason(v){'));
assert.ok(planning.includes('return WASEDA_PLANNING_POLICY.foundationReason(v,p,t);'));

for (const forbidden of ['localStorage', 'waseshibu_vocab_state', 'progress-sync', 'rikkyo-uk-vocab']) {
  assert.ok(!policySource.includes(forbidden), `planning policy acquired forbidden persistence/cross-school token: ${forbidden}`);
}

const order = manifest.assemblyOrder;
assert.equal(order[order.indexOf('31-waseda-session-runtime.js') + 1], '31a-waseda-planning-policy.js');
assert.equal(order[order.indexOf('31a-waseda-planning-policy.js') + 1], '32-session-planning-runtime.js');
assert.equal(manifest.boundaries?.wasedaPlanningPolicyV75, '31a-waseda-planning-policy.js');

const context = { isWeakProgress: (p) => !!p?.weak, Date };
vm.createContext(context);
vm.runInContext(`${policySource}\nglobalThis.__policy=WASEDA_PLANNING_POLICY;`, context);
const policy = context.__policy;
assert.ok(policy && typeof policy.foundationReason === 'function');
const t = Date.parse('2026-09-16T12:00:00Z');
const past = '2026-09-15T12:00:00Z';
const future = '2026-09-17T12:00:00Z';

assert.equal(policy.foundationReason({}, {weak:true,recentMistakeUntil:future,nextReview:past}, t), reasons.weak, 'weak must have highest precedence');
assert.equal(policy.foundationReason({}, {weak:false,recentMistakeUntil:future,nextReview:past}, t), reasons.recentMistake, 'recent mistake must precede due');
assert.equal(policy.foundationReason({}, {weak:false,recentMistakeUntil:past,nextReview:past}, t), reasons.due, 'due reason changed');
assert.equal(policy.foundationReason({}, {weak:false,recentMistakeUntil:past,nextReview:future}, t), reasons.default, 'default reason changed');
assert.equal(policy.foundationReason({}, {weak:false,recentMistakeUntil:null,nextReview:null}, t), reasons.default, 'empty-state default reason changed');

console.log('Waseda foundation-reason planning adapter: PASS');
