import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const readIfExists = (path) => fs.existsSync(path) ? read(path) : '';
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ownership = JSON.parse(read('src/waseda-bootstrap/compat-ownership.json'));
const persistence = read('src/waseda-bootstrap/15-waseda-persistence.js');
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const compatV75 = read('src/waseda-bootstrap/30-compat-runtime.js');
const compatV76 = readIfExists('src/waseda-bootstrap/35-v76-memory-runtime.js');
const compatTail = readIfExists('src/waseda-bootstrap/40-runtime-bootstrap-tail.js');
const compat = compatV75 + compatV76 + compatTail;
const executableEngine = stripComments(engine);
const executableCompat = stripComments(compat);

assert.equal(ownership.format, 'waseda-vocab-compat-ownership/v1');

for (const symbol of ownership.wasedaPersistenceOwned) {
  assert.ok(persistence.includes(symbol), `missing Waseda persistence-owned symbol: ${symbol}`);
}
for (const symbol of ownership.wasedaSessionOwned) {
  assert.ok(compat.includes(symbol), `missing Waseda session-owned symbol: ${symbol}`);
}
for (const symbol of ownership.sharedEngineCandidates) {
  assert.ok(compat.includes(symbol), `missing shared-engine candidate symbol: ${symbol}`);
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
assert.ok(compatV75.includes('const V75_ACTIVE_SESSION_KEY=WASEDA_APP_CONFIG.activeSessionKey;'), 'active-session key must come from Waseda config');
assert.ok(compatV75.includes('const V75_SESSION_FORMAT_VERSION=WASEDA_APP_CONFIG.activeSessionFormatVersion;'), 'active-session format must come from Waseda config');
assert.ok(compatV75.includes('wasedaStorageSet(V75_ACTIVE_SESSION_KEY'), 'active-session writes must use Waseda storage adapter');
assert.ok(compatV75.includes('wasedaStorageGet(V75_ACTIVE_SESSION_KEY)'), 'active-session reads must use Waseda storage adapter');
assert.ok(compatV75.includes('wasedaStorageRemove(V75_ACTIVE_SESSION_KEY)'), 'active-session deletes must use Waseda storage adapter');

if (compatV76 || compatTail) {
  assert.ok(compatV76 && compatTail, 'compatibility runtime split must create both v7.6 and bootstrap-tail parts');
  assert.ok(!compatV75.includes('/* V76_MEMORY_CURVE_SCHEDULER_START */'), 'v7.6 scheduler must not remain in v7.5 compatibility part');
  assert.ok(compatV76.startsWith('/* V76_MEMORY_CURVE_SCHEDULER_START */\n'), 'v7.6 part must begin at reviewed scheduler marker');
  assert.ok(compatV76.endsWith('/* V76_MEMORY_CURVE_SCHEDULER_END */\n'), 'v7.6 part must end at reviewed scheduler marker');
  assert.ok(compatTail.startsWith('/* V75_USER_TEST_REMEDIATION_END */\n'), 'bootstrap tail must begin at reviewed v7.5 end marker');
  assert.ok(compatTail.includes('window.speakWord=speakWord;window.closeSheet=closeSheet;'), 'bootstrap tail lost global exports');
  assert.ok(compatTail.includes('init();'), 'bootstrap tail lost application init');
}

console.log('Waseda compatibility ownership boundary: PASS');
