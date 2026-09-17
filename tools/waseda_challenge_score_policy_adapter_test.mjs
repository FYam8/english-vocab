import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const policySource = read('src/waseda-bootstrap/31a-waseda-planning-policy.js');
const planning = read('src/waseda-bootstrap/32-session-planning-runtime.js');
const integration = read('src/waseda-bootstrap/36-v76-engine-integration.js');
const manifest = JSON.parse(read('src/waseda-bootstrap/manifest.json'));
const validation = JSON.parse(read('src/common-engine/session-planning-contract-validation.json'));

assert.equal(validation.allowSecondPlanningAdapterGroupIntroduction, true);
assert.equal(validation.secondApprovedGroup, 'challenge-score-base-policy-adapter');
assert.equal(validation.allowFullPlanningRuntimeMutation, true);
assert.ok(policySource.includes('challengeScore(v,p,t){'));
assert.ok(planning.includes('return WASEDA_PLANNING_POLICY.challengeScore(v,p,t);'));
assert.equal(manifest.boundaries?.wasedaChallengeScorePolicyV75, '31a-waseda-planning-policy.js');

const formulaTokens = [
  'let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(effectiveFrequency(v))*4+[80,110,65,25,4][p.mastery];',
  'if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;',
  'if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;',
  'if(isWeakProgress(p))score+=95;',
  'if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;'
];
for (const token of formulaTokens) {
  assert.ok(policySource.includes(token), `challenge score formula missing from Waseda adapter: ${token}`);
  assert.ok(!planning.includes(token), `challenge score formula remains duplicated in planning runtime: ${token}`);
}

for (const required of [
  'const v75ChallengeScoreForV76=v75ChallengeScore;',
  'let score=v75ChallengeScoreForV76(v);',
  'score=WASEDA_MEMORY_POLICY.applyChallengeMemoryScore(score,v,p,m);'
]) assert.ok(integration.includes(required), `v7.6 challenge-memory wrapper changed: ${required}`);

for (const forbidden of ['localStorage', 'waseshibu_vocab_state', 'progress-sync', 'rikkyo-uk-vocab']) {
  assert.ok(!policySource.includes(forbidden), `planning policy acquired forbidden persistence/cross-school token: ${forbidden}`);
}

const PRIORITY_SCORE = {S:90,A:48,B:24,C:8};
const context = {
  PRIORITY_SCORE,
  Date,
  Math,
  effectiveFrequency: (v) => Number(v.frequency ?? 0),
  isWeakProgress: (p) => !!p?.weak,
};
vm.createContext(context);
vm.runInContext(`${policySource}\nglobalThis.__policy=WASEDA_PLANNING_POLICY;`, context);
const policy = context.__policy;
assert.ok(policy && typeof policy.challengeScore === 'function');

function legacy(v,p,t){
  let score=(PRIORITY_SCORE[v.priority]||0)+(v.yearCount||0)*8+Math.sqrt(Number(v.frequency ?? 0))*4+[80,110,65,25,4][p.mastery];
  if(p.nextReview&&new Date(p.nextReview).getTime()<=t)score+=115;
  if(p.recentMistakeUntil&&new Date(p.recentMistakeUntil).getTime()>t)score+=80;
  if(p.weak)score+=95;
  if(p.mastery===4&&!(p.nextReview&&new Date(p.nextReview).getTime()<=t))score*=.12;
  return score;
}

const now = Date.parse('2026-09-16T12:00:00Z');
const past = '2026-09-15T12:00:00Z';
const future = '2026-09-17T12:00:00Z';
const cases = [
  [{priority:'S',yearCount:8,frequency:100},{mastery:0,nextReview:past,recentMistakeUntil:future,weak:true}],
  [{priority:'A',yearCount:4,frequency:25},{mastery:1,nextReview:past,recentMistakeUntil:past,weak:false}],
  [{priority:'B',yearCount:2,frequency:9},{mastery:2,nextReview:future,recentMistakeUntil:future,weak:false}],
  [{priority:'C',yearCount:1,frequency:1},{mastery:3,nextReview:null,recentMistakeUntil:null,weak:true}],
  [{priority:'S',yearCount:6,frequency:64},{mastery:4,nextReview:future,recentMistakeUntil:null,weak:false}],
  [{priority:'Z',yearCount:0,frequency:0},{mastery:4,nextReview:past,recentMistakeUntil:null,weak:false}]
];
for (const [v,p] of cases) {
  const expected = legacy(v,p,now);
  const actual = policy.challengeScore(v,p,now);
  assert.equal(actual, expected, `challenge base score changed for ${JSON.stringify({v,p})}`);
}

console.log('Waseda challenge-score planning adapter: PASS');
