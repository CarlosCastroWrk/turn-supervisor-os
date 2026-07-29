import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4194;
const baseUrl = `http://${host}:${port}`;

const targets = [
  { name: 'Mac', viewport: { width: 1440, height: 960 } },
  { name: 'iPad landscape', viewport: { width: 1180, height: 820 } },
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
];

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
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
  cacheDir: '/private/tmp/pds-wave2a1-command-entry-vite',
  configLoader: 'runner',
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), 'index.html')],
  },
  root: process.cwd(),
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Review', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('region', { name: 'Turn OS command bar' }).count(),
      0,
      `${target.name} exposed the superseded persistent command bar.`,
    );

    await page.getByRole('button', { name: 'Open central Plus menu', exact: true }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
    await addDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1, `${target.name} stacked Add dialogs.`);
    assert.equal(
      await page.locator('.capture-workspace').count(),
      0,
      `${target.name} opened legacy Capture from the primary Plus.`,
    );
    await addDialog.getByRole('button', { name: 'Close Add to Turn OS', exact: true }).click();
    await addDialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
      const main = document.getElementById('launch-command-center-main');
      return document.activeElement === main && Boolean(main?.getClientRects().length);
    });

    await page.getByRole('button', { name: 'Open Search', exact: true }).click();
    const search = page.getByRole('searchbox');
    await search.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'search');
    assert.ok(
      Number.parseFloat(await search.evaluate((element) => getComputedStyle(element).fontSize)) >= 16,
      `${target.name} Search could trigger iPhone input zoom.`,
    );
    await search.fill('Unit 20');
    assert.ok(
      await page.getByRole('button', { name: /^Unit 20/u }).count() > 0,
      `${target.name} Search did not return matching Units.`,
    );
    assert.equal(
      await page.evaluate(() => window.location.hash),
      '#/search',
      `${target.name} Search navigated without an explicit result selection.`,
    );
    assert.equal(await page.getByRole('dialog').count(), 0, `${target.name} Search opened a dialog.`);
    await page.getByRole('button', { name: /^Unit 202\b/u }).click();
    await page.getByRole('heading', { name: 'Unit 202', exact: true }).waitFor();
    assert.match(
      await page.evaluate(() => window.location.hash),
      /^#\/units\//u,
      `${target.name} explicit Unit selection did not open the Unit workspace.`,
    );
    assert.equal(
      await page.getByRole('region', { name: 'Turn OS command bar' }).count(),
      0,
      `${target.name} Unit workspace restored the superseded command bar.`,
    );
    assert.equal(await page.getByRole('dialog').count(), 0, `${target.name} Unit selection opened Capture.`);
    await assertNoHorizontalOverflow(page, `${target.name} Unit search`);

    await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
    const captureDialog = page.locator('.capture-workspace[role="dialog"]');
    await captureDialog.waitFor();
    assert.equal(await page.locator('.capture-workspace').count(), 1, `${target.name} mounted multiple Capture owners.`);
    assert.equal(await page.getByRole('dialog').count(), 1, `${target.name} exposed multiple Capture dialogs.`);
    assert.equal(
      await page.evaluate(() => window.location.hash),
      '#/dashboard',
      `${target.name} legacy Capture route did not normalize to Home.`,
    );
    await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
    await captureDialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, `${target.name} needed more than one Close.`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Native command-entry gate passed on Mac, iPad landscape, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
