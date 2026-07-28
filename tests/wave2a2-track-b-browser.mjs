import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4226;
const baseUrl = `http://${host}:${port}/src/features/wave2a2-track-b/preview.html`;
const screenshotDir = '/private/tmp/turn-os-wave2a2-track-b';
const viewports = [
  { name: 'iPhone-320', viewport: { width: 320, height: 700 } },
  { name: 'iPhone-390', viewport: { width: 390, height: 844 } },
  { name: 'iPhone-430', viewport: { width: 430, height: 932 } },
  { name: 'iPad-landscape', viewport: { width: 1024, height: 768 } },
  { name: 'Mac', viewport: { width: 1440, height: 900 } },
];

const createCleanPage = async (browser, viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const findings = [];
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  return { context, findings, page };
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

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-track-b-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} exposed no declared critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} critical target ${index} had no box.`);
    assert.ok(
      box.width >= 43.5 && box.height >= 43.5,
      `${label} critical target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertVisibleInputsAtLeast16 = async (page, label) => {
  const controls = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):visible, textarea:visible',
  );
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const fontSize = await controls.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize));
    assert.ok(fontSize >= 16, `${label} control ${index} used ${fontSize}px text.`);
  }
};

const load = async (page, scenario) => {
  const startedAt = performance.now();
  await page.goto(`${baseUrl}?scenario=${scenario}`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="track-b-home"], [data-testid="track-b-rollover"]').waitFor();
  return performance.now() - startedAt;
};

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a2-track-b-vite',
  configLoader: 'runner',
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;
const timings = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of viewports) {
    const { context, findings, page } = await createCleanPage(browser, target.viewport);
    const loadMs = await load(page, 'active');
    timings.push({ loadMs, target: target.name });

    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.getByText('500 Units in property roster', { exact: true }).waitFor();
    assert.equal(await page.getByText('112 sections', { exact: true }).count(), 1);
    const progress = page.getByRole('progressbar', {
      name: '48 of 112 released sections inspected by Los',
    });
    assert.equal(await progress.getAttribute('aria-valuenow'), '48');
    assert.equal(await progress.getAttribute('aria-valuemax'), '112');
    await assertNoHorizontalOverflow(page, `${target.name} active Home`);
    await assertCriticalTargets(page, `${target.name} active Home`);
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await page.screenshot({
      fullPage: true,
      path: `${screenshotDir}/active-home-${target.name}.png`,
    });
    if (target.name === 'iPhone-390') {
      await page.screenshot({
        fullPage: false,
        path: `${screenshotDir}/active-home-iPhone-390-viewport.png`,
      });
    }
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(browser, { width: 390, height: 844 });
    await load(page, 'active');
    const expectedCounts = {
      Callbacks: 6,
      'Ready to walk': 34,
      Waiting: 8,
      Working: 16,
    };

    for (const [label, count] of Object.entries(expectedCounts)) {
      const trigger = page.getByRole('button').filter({ hasText: label });
      assert.equal(await trigger.count(), 1, `${label} did not expose one Home filter.`);
      assert.match(await trigger.innerText(), new RegExp(`\\b${count}\\b`, 'u'));
      const startedAt = performance.now();
      await trigger.click();
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
      const records = page.locator('.w2a2b-record-list article');
      assert.equal(await records.count(), count);
      timings.push({ queueMs: performance.now() - startedAt, target: `queue-${label}` });
      await assertNoHorizontalOverflow(page, `${label} queue`);
      await page.getByRole('button', { name: `Back from ${label}`, exact: true }).click();
      await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    }
    assert.deepEqual(findings, [], `queue runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(browser, { width: 390, height: 844 });
    await load(page, 'not-started');
    await page.getByRole('button', { name: 'Start Day', exact: true }).click();
    await page.getByRole('heading', { name: 'Start Day', exact: true }).waitFor();

    for (let step = 1; step <= 9; step += 1) {
      await page.getByText(`Step ${step} of 10`, { exact: true }).waitFor();
      await assertNoHorizontalOverflow(page, `Start Day step ${step}`);
      await assertCriticalTargets(page, `Start Day step ${step}`);
      await assertVisibleInputsAtLeast16(page, `Start Day step ${step}`);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }

    await page.getByText('Step 10 of 10', { exact: true }).waitFor();
    await page.getByText('I reviewed the Start Day details.', { exact: true }).click();
    await page.getByRole('button', { name: 'Start Day', exact: true }).click();
    await page.getByText('Active', { exact: true }).waitFor();
    await page.getByText('112 sections', { exact: true }).waitFor();
    assert.deepEqual(findings, [], `Start Day runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(browser, { width: 390, height: 844 });
    await load(page, 'active');
    await page.getByRole('button', { name: 'End day', exact: true }).click();
    await page.getByRole('heading', { name: 'End Day', exact: true }).waitFor();
    await page.getByText('Unresolved work stays unresolved', { exact: true }).waitFor();
    await page.getByText('Reviewed', { exact: true }).click();
    await page.getByRole('radio', { name: 'Yes', exact: true }).click();
    await page.getByLabel('End-of-day property check-in Optional').fill('Synthetic check-in.');
    await page.getByText(
      'I reviewed the summary and want to close this personal Day Session.',
      { exact: true },
    ).click();
    await page.getByRole('button', { name: 'Close Day Session', exact: true }).click();
    await page.getByText('Closed', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('Import today’s released work', { exact: true }).count(),
      1,
      'closed Day Session must not continue presenting an active Today’s Task',
    );
    assert.deepEqual(findings, [], `End Day runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(browser, { width: 320, height: 700 });
    await load(page, 'no-release');
    assert.equal(await page.getByText('Import today’s released work', { exact: true }).count(), 1);
    await page.getByRole('button', { name: /Import today.s released work/u }).click();
    await page.getByText(
      'Import handoff requested. Integration owns the source-first import route.',
      { exact: true },
    ).waitFor();
    await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
    await page.getByRole('button', { name: 'Start Day', exact: true }).click();
    for (let step = 1; step <= 4; step += 1) {
      await page.getByText(`Step ${step} of 10`, { exact: true }).waitFor();
      if (step === 3) {
        await page.getByLabel('Property contact').fill('Synthetic property contact');
      }
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page.getByText('Step 5 of 10', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: /Import today.s released work/u }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(),
      true,
    );
    await assertNoHorizontalOverflow(page, 'no-release Home');
    assert.deepEqual(findings, [], `no-release runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(browser, { width: 390, height: 844 });
    await load(page, 'rollover');
    await page.getByRole('heading', { name: 'Review the date change', exact: true }).waitFor();
    for (const label of ['Resume', 'Review and close', 'Reopen as correction']) {
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${label}\\b`, 'u') }).count(), 1);
    }
    await assertNoHorizontalOverflow(page, 'date rollover');
    await assertCriticalTargets(page, 'date rollover');
    await page.getByRole('button', { name: /^Resume\b/u }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    assert.deepEqual(findings, [], `rollover runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const slowestLoad = Math.max(...timings.filter((item) => item.loadMs).map((item) => item.loadMs));
  const slowestQueue = Math.max(...timings.filter((item) => item.queueMs).map((item) => item.queueMs));
  assert.ok(slowestLoad < 5_000, `slowest preview load was ${slowestLoad.toFixed(1)}ms`);
  assert.ok(slowestQueue < 1_000, `slowest queue open was ${slowestQueue.toFixed(1)}ms`);
  console.log(`Track B browser performance: ${JSON.stringify(timings)}`);
  console.log(`Wave 2A.2 Track B screenshots: ${screenshotDir}`);
} finally {
  await browser?.close();
  await server.close();
}
