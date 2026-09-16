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

console.log('Common-engine extraction readiness classification: PASS');
