import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const CURRENT = process.env.COMMON_ENGINE_TEST_URL || 'http://127.0.0.1:4173/index.html';
const BASELINE = process.env.COMMON_ENGINE_BASELINE_URL || 'http://127.0.0.1:4174/index.html';
const PASS = process.env.COMMON_ENGINE_PASS || 'COMMON-ENGINE-BASELINE-PARITY';
const FIXED_NOW = '2026-09-15T12:00:00.000Z';

const browser = await chromium.launch({ headless: true });

async function snapshot(url) {
  const context = await browser.newContext();
  await context.addInitScript(({ fixedNow }) => {
    const NativeDate = Date;
    const fixedMs = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedMs])); }
      static now() { return fixedMs; }
    }
    globalThis.Date = FixedDate;
    let seed = 0x13579bdf;
    globalThis.__resetParityRandom = () => { seed = 0x13579bdf; };
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }, { fixedNow: FIXED_NOW });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');

  const result = await page.evaluate(() => {
    const ids = VOCAB.slice(0, 40).map((v) => v.id);
    const dataset = VOCAB.map((v) => [
      v.id, v.word, v.meaning, v.priority, v.level, v.studyLayer || 'core',
      v.surfaceFrequency ?? v.frequency ?? 0, v.yearCount, v.years
    ]);
    const pools = {};
    for (const mode of ['recommended', '60', '70', 'diagnostic', '75', 'unlearned', 'weak', 'review', 'frequent', 'random']) {
      pools[mode] = filterPool(mode, 'all').map((v) => v.id);
    }
    const yearly = {};
    for (const year of META.years) yearly[year] = filterPool('recommended', String(year)).map((v) => v.id);

    __resetParityRandom();
    const plans = {
      recommended20: buildSessionPlan('recommended', 'all', 20),
      target6020: buildSessionPlan('60', 'all', 20),
      challenge20: buildSessionPlan('75', 'all', 20),
      random20: buildSessionPlan('random', 'all', 20)
    };

    const oldId = 'w3186341920';
    const newId = 'p0431020501';
    const migrationFixture = {
      schemaVersion: 6,
      dataVersion: 'baseline-parity-v6',
      words: {
        [oldId]: {
          mastery: 2, correct: 5, incorrect: 1, streak: 1, evidence: 6,
          lastStudied: '2026-08-20T10:00:00.000Z', nextReview: null,
          recentMistakeUntil: null, lastRating: 'got', recentResults: []
        },
        [newId]: {
          mastery: 3, correct: 2, incorrect: 4, streak: 2, evidence: 8,
          lastStudied: '2026-08-25T10:00:00.000Z', nextReview: null,
          recentMistakeUntil: null, lastRating: 'miss', recentResults: []
        }
      },
      stats: { todayKey: '2026-09-15', todayCount: 3, totalAnswers: 14, totalSessions: 2 },
      settings: { mode: 'recommended', sessionSize: 20, year: 'all', accent: 'auto', voiceURI: '', theme: 'auto' }
    };
    const migrated = migrate(JSON.parse(JSON.stringify(migrationFixture)));
    const migratedSummary = {
      schemaVersion: migrated.schemaVersion,
      dataVersion: migrated.dataVersion,
      oldPresent: !!migrated.words[oldId],
      merged: migrated.words[newId],
      stats: migrated.stats,
      settings: migrated.settings
    };

    const memorySamples = ids.slice(0, 8).map((id) => {
      const v = VOCAB_BY_ID.get(id);
      const p = Object.assign(defaultProgress(), {
        mastery: 2, correct: 4, incorrect: 1, streak: 2, evidence: 7,
        lastStudied: '2026-09-10T12:00:00.000Z',
        nextReview: '2026-09-14T12:00:00.000Z',
        recentResults: [
          { ok: true, type: 'choice', at: '2026-09-08T12:00:00.000Z' },
          { ok: false, type: 'reverse', at: '2026-09-09T12:00:00.000Z' },
          { ok: true, type: 'cloze', at: '2026-09-10T12:00:00.000Z' }
        ]
      });
      const model = typeof v76InferMemoryModel === 'function' ? v76InferMemoryModel(p) : null;
      return {
        id,
        weak: isWeakProgress(p),
        mastery: masteryFromEvidence(p),
        scoreRecommended: schedulerScore(v, 'recommended'),
        targetRetention: model && typeof v76TargetRetention === 'function' ? v76TargetRetention(v, p) : null,
        model
      };
    });

    return {
      schema: SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      meta: {
        dataVersion: META.dataVersion,
        years: META.years,
        registeredTotal: META.registeredTotal,
        learnableTotal: META.learnableTotal,
        layerCounts: META.layerCounts,
        priorityCounts: META.priorityCounts,
        levelCounts: META.levelCounts
      },
      constants: {
        masterLabel: MASTER_LABEL,
        modeOptions: MODE_OPTIONS,
        layerLabel: LAYER_LABEL,
        layerScore: LAYER_SCORE,
        priorityScore: PRIORITY_SCORE,
        levelScore: LEVEL_SCORE,
        categoryJp: CATEGORY_JP
      },
      dataset,
      pools,
      yearly,
      plans,
      migratedSummary,
      memorySamples
    };
  });

  assert.deepEqual(pageErrors, [], `${url} page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `${url} console errors: ${consoleErrors.join(' | ')}`);
  await context.close();
  return result;
}

try {
  const baseline = await snapshot(BASELINE);
  const current = await snapshot(CURRENT);
  assert.deepEqual(current, baseline, 'refactored Waseda behavior snapshot diverged from production baseline');
  console.log(`${PASS}: WASEDA BASELINE DIFFERENTIAL PARITY CLEAN`);
} finally {
  await browser.close();
}
