import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.COMMON_ENGINE_TEST_URL || 'http://127.0.0.1:4173/index.html';
const PASS = process.env.COMMON_ENGINE_PASS || 'COMMON-ENGINE-PERSISTENCE';
const MAIN_KEY = 'waseshibu_vocab_state';
const ACTIVE_KEY = 'waseshibu_vocab_active_session_v1';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  const wordId = await page.evaluate(() => {
    const v = VOCAB.find((x) => (x.studyLayer || 'core') !== 'reference');
    if (!v) throw new Error('no learnable vocabulary item');
    return v.id;
  });

  const now = new Date().toISOString();
  const fixture = {
    schemaVersion: 7,
    dataVersion: '2019-2026-v7.5-user-test-remediation',
    words: {
      [wordId]: {
        mastery: 2,
        correct: 2,
        incorrect: 1,
        streak: 1,
        lastStudied: now,
        nextReview: now,
        recentMistakeUntil: null,
        lastRating: 'got',
        evidence: 5,
        recentResults: [{ ok: true, type: 'choice', at: now }]
      }
    },
    stats: { todayKey: '2000-01-01', todayCount: 3, totalAnswers: 7, totalSessions: 2 },
    settings: { mode: 'recommended', sessionSize: 20, year: 'all', accent: 'auto', voiceURI: '', theme: 'auto' }
  };
  const rawFixture = JSON.stringify(fixture);

  await page.evaluate(({ key, active, raw }) => {
    localStorage.setItem(key, raw);
    localStorage.setItem(active, JSON.stringify({ marker: 'existing-session-fixture' }));
  }, { key: MAIN_KEY, active: ACTIVE_KEY, raw: rawFixture });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');

  const boot = await page.evaluate(({ key, active, id }) => ({
    raw: localStorage.getItem(key),
    active: localStorage.getItem(active),
    schema: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
    loadedWord: state.words[id],
    settings: state.settings,
    stats: state.stats
  }), { key: MAIN_KEY, active: ACTIVE_KEY, id: wordId });

  assert.equal(boot.raw, rawFixture, 'opening current app rewrote existing learner state before an action');
  assert.equal(boot.schema, 7);
  assert.equal(boot.storageKey, MAIN_KEY);
  assert.ok(boot.active?.includes('existing-session-fixture'), 'active-session namespace was cleared or replaced on boot');
  assert.equal(boot.loadedWord.correct, 2);
  assert.equal(boot.loadedWord.incorrect, 1);
  assert.equal(boot.settings.mode, 'recommended');
  assert.equal(boot.settings.sessionSize, 20);
  assert.equal(boot.stats.totalAnswers, 7);

  const after = await page.evaluate(({ key, id }) => {
    const v = VOCAB_BY_ID.get(id);
    if (!v) throw new Error(`missing vocabulary id ${id}`);
    const beforeTotal = Number(state.stats.totalAnswers) || 0;
    v75ApplyMainOutcome(v, {
      questionInstanceId: `common-contract-${crypto.randomUUID()}`,
      wordId: id,
      outcome: 'got',
      qType: 'choice',
      isRetry: false
    });
    const saved = JSON.parse(localStorage.getItem(key));
    return { saved, beforeTotal };
  }, { key: MAIN_KEY, id: wordId });

  const saved = after.saved;
  const row = saved.words[wordId];
  assert.equal(saved.schemaVersion, 7, 'schema contract changed');
  assert.equal(saved.settings.mode, 'recommended', 'settings.mode contract changed');
  assert.equal(saved.settings.sessionSize, 20, 'settings.sessionSize contract changed');
  assert.ok(typeof saved.stats.todayKey === 'string', 'stats.todayKey missing');
  assert.ok(Number.isFinite(Number(saved.stats.todayCount)), 'stats.todayCount missing');
  assert.equal(saved.stats.totalAnswers, after.beforeTotal + 1, 'answer did not persist totalAnswers');
  assert.ok(row && typeof row === 'object', 'word state missing after answer');
  for (const field of ['correct', 'incorrect', 'mastery']) {
    assert.ok(Number.isFinite(Number(row[field])), `cloud-readable word field missing: ${field}`);
  }
  assert.ok(typeof row.lastStudied === 'string' && row.lastStudied.length > 0, 'lastStudied missing');
  assert.ok(typeof row.nextReview === 'string' && row.nextReview.length > 0, 'nextReview missing');

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
  console.log(`${PASS}: WASEDA PERSISTENCE CONTRACT CLEAN`);
} finally {
  await browser.close();
}
