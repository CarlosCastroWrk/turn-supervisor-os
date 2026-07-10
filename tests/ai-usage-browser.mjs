import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createRealTurnProject } from '../src/lib/actions.ts';
import { seedData } from '../src/data/seed.ts';

const storageKey = 'turn-supervisor-os:v0.1';
const host = '127.0.0.1';
const port = 4185;
const baseUrl = `http://${host}:${port}`;
const screenshotDirectory = await mkdtemp(path.join(tmpdir(), 'pds-ai-usage-'));

const data = createRealTurnProject(JSON.parse(JSON.stringify(seedData)), {
  projectName: 'QA AI Meter Turn',
  propertyName: 'QA AI Meter Property',
  location: 'Austin, TX',
  startDate: '2026-08-01',
  endDate: '2026-08-14',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  buildingNames: ['Building A'],
  buildingCount: 1,
  floorsPerBuilding: 1,
  unitsPerFloor: 3,
  firstUnitNumber: 101,
  bedCount: 2,
  bathroomCount: 1,
  hasCommonArea: false,
  notes: 'Disposable AI usage UI QA.',
});

const projectId = data.activeProjectId;
data.aiUsageEvents = [
  ['ai_usage_frontier', 'gpt-5.5', 'override', 0.017765, 1087, 411, '2026-07-10T13:00:00.000Z'],
  ['ai_usage_complex', 'gpt-5.4-mini', 'complex', 0.00426675, 1087, 767, '2026-07-10T12:55:00.000Z'],
  ['ai_usage_fast', 'gpt-5.4-nano', 'fast', 0.00153365, 1087, 1053, '2026-07-10T12:50:00.000Z'],
].map(([id, model, modelClass, estimatedCostUsd, inputTokens, outputTokens, createdAt]) => ({
  id,
  projectId,
  task: 'capture',
  model,
  modelClass,
  routeReason: 'Disposable browser verification.',
  inputTokens,
  cachedInputTokens: 0,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
  estimatedCostUsd,
  pricingVersion: '2026-07-10',
  createdAt,
  updatedAt: createdAt,
}));

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const screenshots = {};

  for (const target of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'ipad', viewport: { width: 1024, height: 768 } },
    { name: 'iphone', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    await context.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: storageKey, value: JSON.stringify(data) },
    );
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);
    await page.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });

    const panel = page.locator('.ai-usage-panel');
    await panel.waitFor();
    const panelText = await panel.innerText();
    assert.match(panelText, /Estimated remaining\s+\$9\.98/);
    assert.match(panelText, /Estimated used\s+\$0\.0236/);
    assert.match(panelText, /Model calls\s+3/);
    assert.equal(await page.locator('.ai-usage-history li').count(), 3);
    await assertNoHorizontalOverflow(page, `${target.name} AI usage`);

    const screenshot = path.join(screenshotDirectory, `${target.name}-ai-usage.png`);
    await panel.screenshot({ path: screenshot });
    screenshots[target.name] = screenshot;

    const pricingOverlap = await page.evaluate(() => {
      const note = document.querySelector('.ai-pricing-note')?.getBoundingClientRect();
      const capture = document.querySelector('.floating-capture')?.getBoundingClientRect();
      if (!note || !capture) return false;
      return !(
        note.right <= capture.left ||
        note.left >= capture.right ||
        note.bottom <= capture.top ||
        note.top >= capture.bottom
      );
    });
    assert.equal(pricingOverlap, false, `${target.name} Capture button covered the AI pricing note.`);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const receiptOverlap = await page.evaluate(() => {
      const receipt = document.querySelector('.ai-usage-history li:last-child')?.getBoundingClientRect();
      const capture = document.querySelector('.floating-capture')?.getBoundingClientRect();
      const navigation = document.querySelector('.bottom-nav')?.getBoundingClientRect();
      if (!receipt) return true;
      const overlaps = (fixed) => fixed && !(
        receipt.right <= fixed.left ||
        receipt.left >= fixed.right ||
        receipt.bottom <= fixed.top ||
        receipt.top >= fixed.bottom
      );
      return Boolean(overlaps(capture) || overlaps(navigation));
    });
    assert.equal(receiptOverlap, false, `${target.name} fixed controls covered the final AI usage receipt.`);

    if (target.name === 'desktop') {
      await page.getByLabel('Turn AI budget', { exact: true }).fill('20');
      await page.getByLabel('Turn AI budget', { exact: true }).press('Tab');
      await page.waitForTimeout(650);
      const storedBudget = await page.evaluate((key) => {
        const stored = JSON.parse(window.localStorage.getItem(key));
        return stored.projects.find((project) => project.id === stored.activeProjectId)?.aiBudgetUsd;
      }, storageKey);
      assert.equal(storedBudget, 20);
    }

    assert.deepEqual(findings, [], `${target.name} AI usage runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  process.stdout.write(`${JSON.stringify({ screenshots })}\n`);
} finally {
  await browser?.close();
  await server.close();
}
