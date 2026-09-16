import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = 'src/waseda-bootstrap';
const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const readiness = JSON.parse(read(`${ROOT}/engine-extraction-readiness.json`));

assert.equal(readiness.format, 'waseda-vocab-engine-extraction-readiness/v1');
assert.ok(Array.isArray(readiness.readySchoolNeutralHelpers));
assert.ok(Array.isArray(readiness.promotedSchoolNeutralHelpers));
assert.ok(Array.isArray(readiness.policyInjectionRequired) && readiness.policyInjectionRequired.length > 0);
assert.ok(Array.isArray(readiness.blockedTokensForReadyHelpers));
assert.ok(['pending', 'promoted'].includes(readiness.firstPromotionStatus));
assert.ok(['pending', 'promoted'].includes(readiness.secondPromotionStatus));
assert.ok(['pending', 'promoted'].includes(readiness.thirdPromotionStatus));
const validation = readiness.promotionValidation || {};
assert.equal(validation.requireExactBranchHead, true, 'helper promotion must require exact branch-head validation');
assert.equal(validation.requireSyntheticMerge, true, 'helper promotion must require synthetic-merge validation');
assert.equal(validation.requireTwoPassCompatibility, true, 'helper promotion must require two-pass compatibility');
assert.equal(validation.requireOwnershipGuard, true, 'helper promotion must require ownership guard');
assert.equal(validation.allowNextPromotionBeforeGreen, false, 'next helper promotion must remain blocked before all gates are green');

function functionBlock(source, symbol) {
  const marker = `function ${symbol}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing function ${symbol}`);
  const brace = source.indexOf('{', start + marker.length);
  assert.ok(brace >= 0, `missing function body for ${symbol}`);
  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`unterminated function body for ${symbol}`);
}

function assertSchoolNeutral(block, symbol) {
  for (const token of readiness.blockedTokensForReadyHelpers) {
    assert.ok(!block.includes(token), `${symbol} is not school-neutral yet; blocked token: ${token}`);
  }
}

function assertValidationComplete(name, record) {
  assert.match(String(record.validatedHead || ''), /^[0-9a-f]{40}$/, `${name} must record the exact validated head`);
  for (const key of ['branchTwoPass', 'syntheticMergeTwoPass', 'branchOwnership', 'syntheticMergeOwnership']) {
    assert.equal(record[key], 'success', `${name} validation incomplete: ${key}`);
  }
}

for (const item of readiness.readySchoolNeutralHelpers) {
  assert.equal(typeof item.symbol, 'string');
  assert.ok(exists(`${ROOT}/${item.source}`), `ready-helper source missing: ${item.source}`);
  assert.ok(exists(`${ROOT}/${item.target}`), `ready-helper target missing: ${item.target}`);
  const source = read(`${ROOT}/${item.source}`);
  const block = functionBlock(source, item.symbol);
  assertSchoolNeutral(block, item.symbol);
}
for (const item of readiness.promotedSchoolNeutralHelpers) {
  assert.equal(typeof item.symbol, 'string');
  assert.equal(item.promotionType, 'definition-move-only; name and function body unchanged', `promoted helper changed promotion type: ${item.symbol}`);
  assert.ok(exists(`${ROOT}/${item.target}`), `promoted-helper target missing: ${item.target}`);
  const target = read(`${ROOT}/${item.target}`);
  const block = functionBlock(target, item.symbol);
  assertSchoolNeutral(block, item.symbol);
  if (item.previousSource) {
    assert.ok(exists(`${ROOT}/${item.previousSource}`), `promoted-helper previous source missing: ${item.previousSource}`);
    assert.ok(!read(`${ROOT}/${item.previousSource}`).includes(`function ${item.symbol}(`), `promoted helper still duplicated in ${item.previousSource}: ${item.symbol}`);
  }
}

const runtimeFiles = [
  '20-engine-candidate.js',
  '30-compat-runtime.js',
  '31-waseda-session-runtime.js',
  '32-session-planning-runtime.js',
  '33-v75-ui-runtime.js',
  '35-v76-memory-runtime.js',
  '36-v76-engine-integration.js',
  '37-v76-waseda-ui-runtime.js'
].filter((name) => exists(`${ROOT}/${name}`));
const allRuntime = runtimeFiles.map((name) => read(`${ROOT}/${name}`)).join('\n');
const persistence = read(`${ROOT}/15-waseda-persistence.js`);

for (const item of readiness.policyInjectionRequired) {
  assert.ok(allRuntime.includes(item.symbol), `policy-coupled symbol missing from reviewed runtime: ${item.symbol}`);
}
for (const symbol of readiness.wasedaOwned) {
  assert.ok((persistence + '\n' + allRuntime).includes(symbol), `Waseda-owned symbol missing: ${symbol}`);
}

assert.equal(readiness.firstPromotion, 'v75WeightedWithoutReplacement', 'first semantic promotion changed without explicit review');
if (readiness.firstPromotionStatus === 'pending') {
  const readySymbols = new Set(readiness.readySchoolNeutralHelpers.map((x) => x.symbol));
  assert.ok(readySymbols.has(readiness.firstPromotion), 'pending firstPromotion must remain classified as ready');
  const first = readiness.readySchoolNeutralHelpers.find((x) => x.symbol === readiness.firstPromotion);
  assert.equal(first.source, '32-session-planning-runtime.js');
  assert.equal(first.target, '20-engine-candidate.js');
  const firstBlock = functionBlock(read(`${ROOT}/${first.source}`), first.symbol);
  assert.ok(firstBlock.includes('weightedChoice('), 'first promotion lost generic weightedChoice dependency');
  for (const forbidden of ['getProgress(', 'schedulerScore(', 'VOCAB', 'state.', 'session.', 'priority', 'studyLayer']) {
    assert.ok(!firstBlock.includes(forbidden), `first promotion unexpectedly depends on Waseda policy: ${forbidden}`);
  }
  assert.ok(!read(`${ROOT}/${first.target}`).includes(`function ${first.symbol}(`), 'pending first promotion already moved');
} else {
  const promoted = readiness.promotedSchoolNeutralHelpers.find((x) => x.symbol === readiness.firstPromotion);
  assert.ok(promoted, 'promoted firstPromotion must be recorded in promotedSchoolNeutralHelpers');
  assert.equal(promoted.previousSource, '32-session-planning-runtime.js');
  assert.equal(promoted.target, '20-engine-candidate.js');
  const block = functionBlock(read(`${ROOT}/${promoted.target}`), promoted.symbol);
  assert.ok(block.includes('weightedChoice('), 'promoted first helper lost generic weightedChoice dependency');
  for (const forbidden of ['getProgress(', 'schedulerScore(', 'VOCAB', 'state.', 'session.', 'priority', 'studyLayer']) {
    assert.ok(!block.includes(forbidden), `promoted first helper unexpectedly depends on Waseda policy: ${forbidden}`);
  }
  assert.ok(!read(`${ROOT}/${promoted.previousSource}`).includes(`function ${promoted.symbol}(`), 'promoted first helper remains duplicated in policy source');
}
assertValidationComplete('first promotion', readiness.firstPromotionValidation || {});

assert.equal(readiness.secondPromotion, 'v76Clamp', 'second promotion changed without explicit review');
if (readiness.secondPromotionStatus === 'pending') {
  const second = readiness.readySchoolNeutralHelpers.find((x) => x.symbol === readiness.secondPromotion);
  assert.ok(second, 'pending secondPromotion must remain classified as ready');
  assert.equal(second.source, '35-v76-memory-runtime.js');
  assert.equal(second.target, '20-engine-candidate.js');
  const block = functionBlock(read(`${ROOT}/${second.source}`), second.symbol);
  assertSchoolNeutral(block, second.symbol);
  assert.ok(!read(`${ROOT}/${second.target}`).includes(`function ${second.symbol}(`), 'pending second promotion already moved');
} else {
  const promoted = readiness.promotedSchoolNeutralHelpers.find((x) => x.symbol === readiness.secondPromotion);
  assert.ok(promoted, 'promoted secondPromotion must be recorded');
  assert.equal(promoted.previousSource, '35-v76-memory-runtime.js');
  assert.equal(promoted.target, '20-engine-candidate.js');
  assert.equal(promoted.promotionType, 'definition-move-only; name and function body unchanged');
  const block = functionBlock(read(`${ROOT}/${promoted.target}`), promoted.symbol);
  assert.equal(block, 'function v76Clamp(x,lo,hi){return Math.max(lo,Math.min(hi,Number(x)))}', 'promoted v76Clamp body changed');
  assertSchoolNeutral(block, promoted.symbol);
  assert.ok(!read(`${ROOT}/${promoted.previousSource}`).includes(`function ${promoted.symbol}(`), 'promoted second helper remains duplicated in v7.6 source');
}
assertValidationComplete('second promotion', readiness.secondPromotionValidation || {});

assert.equal(readiness.thirdPromotion, 'v76SeedStability', 'third promotion changed without explicit review');
if (readiness.thirdPromotionStatus === 'pending') {
  const third = readiness.readySchoolNeutralHelpers.find((x) => x.symbol === readiness.thirdPromotion);
  assert.ok(third, 'pending thirdPromotion must remain classified as ready');
  assert.equal(third.source, '35-v76-memory-runtime.js');
  assert.equal(third.target, '20-engine-candidate.js');
  const block = functionBlock(read(`${ROOT}/${third.source}`), third.symbol);
  assert.equal(block, 'function v76SeedStability(mastery){const i=Math.max(0,Math.min(4,Math.round(Number(mastery)||0)));return [0.75,1.5,4,14,30][i]}', 'pending v76SeedStability body changed');
  assertSchoolNeutral(block, third.symbol);
  assert.ok(!read(`${ROOT}/${third.target}`).includes(`function ${third.symbol}(`), 'pending third promotion already moved');
} else {
  const promoted = readiness.promotedSchoolNeutralHelpers.find((x) => x.symbol === readiness.thirdPromotion);
  assert.ok(promoted, 'promoted thirdPromotion must be recorded');
  assert.equal(promoted.previousSource, '35-v76-memory-runtime.js');
  assert.equal(promoted.target, '20-engine-candidate.js');
  assert.equal(promoted.promotionType, 'definition-move-only; name and function body unchanged');
  const block = functionBlock(read(`${ROOT}/${promoted.target}`), promoted.symbol);
  assert.equal(block, 'function v76SeedStability(mastery){const i=Math.max(0,Math.min(4,Math.round(Number(mastery)||0)));return [0.75,1.5,4,14,30][i]}', 'promoted v76SeedStability body changed');
  assertSchoolNeutral(block, promoted.symbol);
  assert.ok(!read(`${ROOT}/${promoted.previousSource}`).includes(`function ${promoted.symbol}(`), 'promoted third helper remains duplicated in v7.6 source');
}

console.log('Common-engine extraction readiness classification: PASS');
