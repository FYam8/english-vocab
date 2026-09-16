import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const readIfExists = (path) => fs.existsSync(path) ? read(path) : '';
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const startsAtReviewedBoundary = (text, marker) => text.startsWith(marker) || text.startsWith(`\n${marker}`);

const ownership = JSON.parse(read('src/waseda-bootstrap/compat-ownership.json'));
const readiness = JSON.parse(read('src/waseda-bootstrap/engine-extraction-readiness.json'));
const persistence = read('src/waseda-bootstrap/15-waseda-persistence.js');
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const v75Prelude = read('src/waseda-bootstrap/30-compat-runtime.js');
const v75Session = readIfExists('src/waseda-bootstrap/31-waseda-session-runtime.js');
const v75Planning = readIfExists('src/waseda-bootstrap/32-session-planning-runtime.js');
const v75Ui = readIfExists('src/waseda-bootstrap/33-v75-ui-runtime.js');
const compatV75 = v75Prelude + v75Session + v75Planning + v75Ui;
const v76Core = readIfExists('src/waseda-bootstrap/35-v76-memory-runtime.js');
const v76Integration = readIfExists('src/waseda-bootstrap/36-v76-engine-integration.js');
const v76Ui = readIfExists('src/waseda-bootstrap/37-v76-waseda-ui-runtime.js');
const compatV76 = v76Core + v76Integration + v76Ui;
const compatTail = readIfExists('src/waseda-bootstrap/40-runtime-bootstrap-tail.js');
const compat = compatV75 + compatV76 + compatTail;
const engineAndCompat = engine + compat;
const executableEngine = stripComments(engine);
const executableCompat = stripComments(compat);

assert.equal(ownership.format, 'waseda-vocab-compat-ownership/v1');
assert.equal(readiness.format, 'waseda-vocab-engine-extraction-readiness/v1');

for (const symbol of ownership.wasedaPersistenceOwned) {
  assert.ok(persistence.includes(symbol), `missing Waseda persistence-owned symbol: ${symbol}`);
}
for (const symbol of ownership.wasedaSessionOwned) {
  assert.ok(compat.includes(symbol), `missing Waseda session-owned symbol: ${symbol}`);
}
for (const symbol of ownership.sharedEngineCandidates) {
  assert.ok(engineAndCompat.includes(symbol), `missing shared-engine candidate symbol: ${symbol}`);
}
for (const symbol of ownership.wasedaUiOrContentPolicy) {
  assert.ok(compat.includes(symbol), `missing Waseda UI/content policy symbol: ${symbol}`);
}
for (const identifier of ownership.rawPersistenceIdentifiers) {
  assert.ok(persistence.includes(identifier), `raw persistence identifier must remain owned by Waseda adapter: ${identifier}`);
}
for (const forbidden of ownership.forbiddenInEngineCandidate) {
  assert.ok(!executableEngine.includes(forbidden), `engine candidate bypasses Waseda boundary: ${forbidden}`);
}
for (const forbidden of ownership.forbiddenInCompatibilityRuntime) {
  assert.ok(!executableCompat.includes(forbidden), `compat runtime bypasses Waseda boundary: ${forbidden}`);
}

assert.ok(engine.includes('function migrate(raw){return wasedaMigrateState(raw)}'), 'engine candidate must delegate historical migration to Waseda adapter');
assert.ok(v75Prelude.includes('const V75_ACTIVE_SESSION_KEY=WASEDA_APP_CONFIG.activeSessionKey;'), 'active-session key must come from Waseda config');
assert.ok(v75Prelude.includes('const V75_SESSION_FORMAT_VERSION=WASEDA_APP_CONFIG.activeSessionFormatVersion;'), 'active-session format must come from Waseda config');
assert.ok(compatV75.includes('wasedaStorageSet(V75_ACTIVE_SESSION_KEY'), 'active-session writes must use Waseda storage adapter');
assert.ok(compatV75.includes('wasedaStorageGet(V75_ACTIVE_SESSION_KEY)'), 'active-session reads must use Waseda storage adapter');
assert.ok(compatV75.includes('wasedaStorageRemove(V75_ACTIVE_SESSION_KEY)'), 'active-session deletes must use Waseda storage adapter');

if (v75Session || v75Planning || v75Ui) {
  assert.ok(v75Session && v75Planning && v75Ui, 'v7.5 runtime split must create session, planning, and UI parts together');
  assert.ok(!v75Prelude.includes('function v75SerializeCurrentQuestion(){'), 'session serialization must not remain in v7.5 prelude');
  assert.ok(startsAtReviewedBoundary(v75Session, 'function v75SerializeCurrentQuestion(){\n'), 'session runtime must begin at reviewed serialization boundary');
  if (readiness.firstPromotionStatus === 'pending') {
    assert.ok(startsAtReviewedBoundary(v75Planning, 'function v75WeightedWithoutReplacement(pool,count,scoreFn){\n'), 'planning runtime must begin at reviewed weighted-selection boundary before promotion');
  } else {
    assert.ok(startsAtReviewedBoundary(v75Planning, 'function v75ChallengeScore(v){\n'), 'planning runtime must begin at reviewed challenge-policy boundary after first promotion');
    assert.ok(engine.includes('function v75WeightedWithoutReplacement(pool,count,scoreFn){'), 'promoted generic weighted helper missing from engine candidate');
  }
  assert.ok(startsAtReviewedBoundary(v75Ui, 'const v74ChooseType=chooseType;\n'), 'v7.5 UI runtime must begin at reviewed question-behavior boundary');
  assert.ok(v75Session.includes('persistActiveSession=function(){'), 'session runtime lost persistence behavior');
  assert.ok(v75Planning.includes('function buildSessionPlan(mode,year,size){'), 'planning runtime lost session planning behavior');
}

if (v76Integration || v76Ui) {
  assert.ok(v76Integration && v76Ui, 'v7.6 sub-split must create integration and UI parts together');
  assert.ok(!v76Core.includes('v75ApplyMainOutcome=function(v,pending){'), 'v7.6 integration override must not remain in scheduler core');
  assert.ok(startsAtReviewedBoundary(v76Integration, 'v75ApplyMainOutcome=function(v,pending){\n'), 'v7.6 integration must begin at reviewed outcome boundary');
  assert.ok(startsAtReviewedBoundary(v76Ui, 'function v76MemoryDetailHTML(v,p){\n'), 'v7.6 UI must begin at reviewed UI boundary');
  assert.ok(v76Integration.includes('const v75SchedulerScoreForV76=schedulerScore;'), 'v7.6 integration lost scheduler override');
  assert.ok(v76Ui.includes('function v76EnsureMemorySettings(){'), 'v7.6 UI split lost memory settings integration');
}

if (compatV76 || compatTail) {
  assert.ok(compatV76 && compatTail, 'compatibility runtime split must preserve v7.6 and bootstrap-tail parts');
  assert.ok(!compatV75.includes('/* V76_MEMORY_CURVE_SCHEDULER_START */'), 'v7.6 scheduler must not remain in v7.5 compatibility parts');
  assert.ok(compatV76.startsWith('/* V76_MEMORY_CURVE_SCHEDULER_START */\n'), 'combined v7.6 runtime must begin at reviewed scheduler marker');
  assert.ok(compatV76.endsWith('/* V76_MEMORY_CURVE_SCHEDULER_END */\n'), 'combined v7.6 runtime must end at reviewed scheduler marker');
  assert.ok(compatTail.startsWith('/* V75_USER_TEST_REMEDIATION_END */\n'), 'bootstrap tail must begin at reviewed v7.5 end marker');
  assert.ok(compatTail.includes('window.speakWord=speakWord;window.closeSheet=closeSheet;'), 'bootstrap tail lost global exports');
  assert.ok(compatTail.includes('init();'), 'bootstrap tail lost application init');
}

console.log('Waseda compatibility ownership boundary: PASS');
