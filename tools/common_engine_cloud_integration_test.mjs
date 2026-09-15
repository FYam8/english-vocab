import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.COMMON_ENGINE_CLOUD_TEST_URL || 'http://127.0.0.1:4175/index.html';
const PASS = process.env.COMMON_ENGINE_PASS || 'COMMON-ENGINE-CLOUD-INTEGRATION';
const API = 'https://waseda-cloud-integration.invalid';
const MAIN_KEY = 'waseshibu_vocab_state';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript(({ api }) => {
  window.__WASESHIBU_PROGRESS_API__ = api;
}, { api: API });

const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const calls = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.route(`${API}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  calls.push({ path: url.pathname, method: req.method(), body: req.postData() || '' });
  let payload = {};
  if (url.pathname === '/v1/register-anonymous') payload = { status: 'production', deviceCode: 'CI-ONLY' };
  else if (url.pathname === '/v1/control') payload = { status: 'production', deviceCode: 'CI-ONLY', collectionEnabled: true };
  else if (url.pathname === '/v1/events/batch') payload = { rejected: [] };
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(payload)
  });
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');

  const fixture = {
    schemaVersion: 7,
    dataVersion: '2019-2026-v7.6-memory-curve-scheduler',
    words: {
      w0164421600: {
        mastery: 3, correct: 6, incorrect: 1, streak: 2,
        lastStudied: '2026-09-14T10:00:00.000Z',
        nextReview: '2026-09-15T10:00:00.000Z',
        recentMistakeUntil: null, lastRating: 'got', evidence: 9,
        recentResults: [{ ok: true, type: 'choice', at: '2026-09-14T10:00:00.000Z', questionInstanceId: 'ci-q1' }]
      }
    },
    stats: { todayKey: '2026-09-15', todayCount: 4, totalAnswers: 7, totalSessions: 1 },
    settings: { mode: 'recommended', sessionSize: 20, year: 'all', accent: 'auto', voiceURI: '', theme: 'auto' }
  };
  const raw = JSON.stringify(fixture);
  await page.evaluate(({ key, rawState }) => localStorage.setItem(key, rawState), { key: MAIN_KEY, rawState: raw });
  calls.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const paths = new Set(calls.map((x) => x.path));
    if (['/v1/register-anonymous', '/v1/control', '/v1/progress/snapshot', '/v1/events/batch'].every((p) => paths.has(p))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const paths = new Set(calls.map((x) => x.path));
  for (const p of ['/v1/register-anonymous', '/v1/control', '/v1/progress/snapshot', '/v1/events/batch']) {
    assert.ok(paths.has(p), `real Waseda cloud adapter did not reach mocked ${p}`);
  }
  const register = calls.find((x) => x.path === '/v1/register-anonymous');
  assert.equal(register.method, 'POST');
  const snapshot = calls.find((x) => x.path === '/v1/progress/snapshot');
  assert.equal(snapshot.method, 'PUT');
  const batch = calls.find((x) => x.path === '/v1/events/batch');
  assert.equal(batch.method, 'POST');
  const batchBody = JSON.parse(batch.body || '{}');
  assert.ok(Array.isArray(batchBody.events) && batchBody.events.length > 0, 'cloud adapter queued no events from learner state');
  assert.ok(batchBody.events.every((e) => e.appId === 'vocab'), 'cloud adapter appId changed');
  assert.ok(batchBody.events.every((e) => !JSON.stringify(e).includes('recentResults')), 'raw recentResults leaked into cloud payload');

  const after = await page.evaluate((key) => localStorage.getItem(key), MAIN_KEY);
  assert.equal(after, raw, 'cloud adapter changed local learner state');
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
  console.log(`${PASS}: REAL WASEDA CLOUD ADAPTER INTEGRATION CLEAN`);
} finally {
  await browser.close();
}
