import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.COMMON_ENGINE_TEST_URL || 'http://127.0.0.1:4173/index.html';
const PASS = process.env.COMMON_ENGINE_PASS || 'COMMON-ENGINE-LEGACY-MIGRATION';
const MAIN_KEY = 'waseshibu_vocab_state';
const ACTIVE_KEY = 'waseshibu_vocab_active_session_v1';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

async function bootFixture(fixture) {
  const raw = JSON.stringify(fixture);
  await page.evaluate(({ key, active, rawState }) => {
    localStorage.setItem(key, rawState);
    localStorage.removeItem(active);
  }, { key: MAIN_KEY, active: ACTIVE_KEY, rawState: raw });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  const beforeSave = await page.evaluate(({ key }) => ({
    raw: localStorage.getItem(key),
    schema: SCHEMA_VERSION,
    state: JSON.parse(JSON.stringify(state))
  }), { key: MAIN_KEY });
  assert.equal(beforeSave.raw, raw, `schema ${fixture.schemaVersion} was destructively rewritten on boot`);
  assert.equal(beforeSave.schema, 7, 'runtime schema contract changed');
  await page.evaluate(() => saveState());
  const afterSave = await page.evaluate(({ key }) => JSON.parse(localStorage.getItem(key)), { key: MAIN_KEY });
  return { beforeSave: beforeSave.state, afterSave };
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  const ids = await page.evaluate(() => {
    const first = VOCAB.find((x) => (x.studyLayer || 'core') !== 'reference');
    if (!first) throw new Error('no learnable vocabulary item');
    return { first: first.id, accordingTo: 'p0431020501' };
  });
  const commonProgress = {
    mastery: 3,
    correct: 4,
    incorrect: 1,
    streak: 2,
    lastStudied: '2026-08-20T10:00:00.000Z',
    nextReview: '2026-09-20T10:00:00.000Z'
  };

  const fixtures = [
    {
      schemaVersion: 1,
      progress: { [ids.first]: { ...commonProgress } },
      stats: { total: 9 },
      settings: { mode: '70' }
    },
    {
      schemaVersion: 2,
      words: { [ids.first]: { ...commonProgress } },
      stats: { total: 10 },
      settings: { mode: '60' }
    },
    {
      schemaVersion: 3,
      words: { [ids.first]: { ...commonProgress } },
      stats: { totalAnswers: 11 },
      settings: { mode: 'recommended' }
    },
    {
      schemaVersion: 4,
      words: { [ids.first]: { ...commonProgress, evidence: 6, recentResults: [] } },
      stats: { totalAnswers: 12 },
      settings: { mode: 'review' }
    },
    {
      schemaVersion: 5,
      words: { [ids.first]: { ...commonProgress, mastery: 2, evidence: 6, recentResults: [] } },
      stats: { totalAnswers: 13 },
      settings: { mode: 'weak' }
    }
  ];

  for (const fixture of fixtures) {
    const { beforeSave, afterSave } = await bootFixture(fixture);
    assert.equal(beforeSave.schemaVersion, 7, `schema ${fixture.schemaVersion} did not migrate in memory`);
    assert.equal(afterSave.schemaVersion, 7, `schema ${fixture.schemaVersion} did not persist as v7 after an explicit save`);
    assert.ok(afterSave.words[ids.first], `schema ${fixture.schemaVersion} lost studied word`);
    assert.equal(afterSave.words[ids.first].correct, commonProgress.correct, `schema ${fixture.schemaVersion} changed correct count`);
    assert.equal(afterSave.words[ids.first].incorrect, commonProgress.incorrect, `schema ${fixture.schemaVersion} changed incorrect count`);
    assert.equal(afterSave.settings.mode, fixture.settings.mode, `schema ${fixture.schemaVersion} changed learning mode`);
  }

  const oldId = 'w3186341920';
  const schema6 = {
    schemaVersion: 6,
    dataVersion: 'legacy-v6-fixture',
    words: {
      [oldId]: {
        mastery: 2, correct: 5, incorrect: 1, streak: 1, evidence: 6,
        lastStudied: '2026-08-20T10:00:00.000Z', nextReview: null,
        recentMistakeUntil: null, lastRating: 'got', recentResults: []
      },
      [ids.accordingTo]: {
        mastery: 3, correct: 2, incorrect: 4, streak: 2, evidence: 8,
        lastStudied: '2026-08-25T10:00:00.000Z', nextReview: null,
        recentMistakeUntil: null, lastRating: 'miss', recentResults: []
      }
    },
    stats: { totalAnswers: 14 },
    settings: { mode: 'recommended' }
  };
  const { beforeSave: migrated6, afterSave: saved6 } = await bootFixture(schema6);
  assert.equal(migrated6.schemaVersion, 7);
  assert.ok(!migrated6.words[oldId], 'v6 historical according ID was not retired in memory');
  assert.ok(migrated6.words[ids.accordingTo], 'v6 historical according ID was not merged into according to');
  assert.equal(migrated6.words[ids.accordingTo].correct, 5, 'v6 ID merge reduced correct count');
  assert.equal(migrated6.words[ids.accordingTo].incorrect, 4, 'v6 ID merge reduced incorrect count');
  assert.equal(migrated6.words[ids.accordingTo].mastery, 3, 'v6 ID merge reduced mastery');
  assert.equal(migrated6.words[ids.accordingTo].evidence, 8, 'v6 ID merge reduced evidence');
  assert.ok(!saved6.words[oldId], 'retired v6 ID reappeared after save');
  assert.equal(saved6.words[ids.accordingTo].correct, 5);
  assert.equal(saved6.words[ids.accordingTo].incorrect, 4);

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
  console.log(`${PASS}: WASEDA LEGACY MIGRATIONS V1-V6 CLEAN`);
} finally {
  await browser.close();
}
