import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const ownership = JSON.parse(read('src/waseda-bootstrap/compat-ownership.json'));
const persistence = read('src/waseda-bootstrap/15-waseda-persistence.js');
const engine = read('src/waseda-bootstrap/20-engine-candidate.js');
const compat = read('src/waseda-bootstrap/30-compat-runtime.js');

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
  assert.ok(!engine.includes(forbidden), `engine candidate bypasses Waseda boundary: ${forbidden}`);
}
for (const forbidden of ownership.forbiddenInCompatibilityRuntime) {
  assert.ok(!compat.includes(forbidden), `compat runtime bypasses Waseda boundary: ${forbidden}`);
}

assert.ok(engine.includes('function migrate(raw){return wasedaMigrateState(raw)}'), 'engine candidate must delegate historical migration to Waseda adapter');
assert.ok(compat.includes('const V75_ACTIVE_SESSION_KEY=WASEDA_APP_CONFIG.activeSessionKey;'), 'active-session key must come from Waseda config');
assert.ok(compat.includes('const V75_SESSION_FORMAT_VERSION=WASEDA_APP_CONFIG.activeSessionFormatVersion;'), 'active-session format must come from Waseda config');
assert.ok(compat.includes('wasedaStorageSet(V75_ACTIVE_SESSION_KEY'), 'active-session writes must use Waseda storage adapter');
assert.ok(compat.includes('wasedaStorageGet(V75_ACTIVE_SESSION_KEY)'), 'active-session reads must use Waseda storage adapter');
assert.ok(compat.includes('wasedaStorageRemove(V75_ACTIVE_SESSION_KEY)'), 'active-session deletes must use Waseda storage adapter');

console.log('Waseda compatibility ownership boundary: PASS');
