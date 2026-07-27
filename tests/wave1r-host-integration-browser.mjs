import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4210;
const baseUrl = `http://${host}:${port}`;
const viewports = [
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
  { name: 'iPad landscape', viewport: { width: 1024, height: 768 } },
  { name: 'Mac', viewport: { width: 1440, height: 900 } },
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

const createCleanPage = async (browser, viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  return { context, page };
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

const assertUnifiedShell = async (page, label) => {
  assert.equal(
    await page.locator('[data-testid="launch-command-center-shell"]').count(),
    1,
    `${label} did not render exactly one launch shell.`,
  );
  assert.equal(await page.locator('.app-shell').count(), 0, `${label} exposed the legacy shell.`);
  assert.deepEqual(
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button').allTextContents(),
    ['Home', 'TurnBoard', 'Add', 'Activity', 'More'],
  );
};

const assertSingleCapture = async (page, label) => {
  await page.locator('.capture-workspace[role="dialog"]').waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} mounted multiple Capture owners.`);
  assert.equal(await page.getByRole('dialog').count(), 1, `${label} exposed multiple dialogs.`);
  assert.equal(
    await page.locator('main .page-title h1').filter({ hasText: 'Capture' }).count(),
    0,
    `${label} rendered a route-level Capture page under the overlay.`,
  );
};

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave1r-host-integration-vite',
  configLoader: 'runner',
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of viewports) {
    const { context, page } = await createCleanPage(browser, target.viewport);
    const findings = attachRuntimeChecks(page);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('region', { name: 'Home command center' }).waitFor();
    await assertUnifiedShell(page, `${target.name} Home`);
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} Home`);

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertUnifiedShell(page, `${target.name} TurnBoard`);
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 1);
    assert.equal(
      await page.locator('[data-testid="wave1r-shell"]')
        .getByRole('navigation', { name: 'Primary' })
        .count(),
      0,
      `${target.name} exposed a second BoardFirst primary navigation.`,
    );
    assert.ok(await page.getByText('Paint', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Clean', { exact: true }).count() > 0);
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);

    await page.getByRole('button', { name: 'Open Unit 101', exact: true }).click();
    await page.getByRole('heading', { name: 'Unit 101', exact: true }).waitFor();
    const detailTabs = page.getByRole('tablist', { name: 'Unit 101 detail' });
    assert.equal(await detailTabs.getByRole('tab', { name: 'Paint', exact: true }).count(), 1);
    assert.equal(await detailTabs.getByRole('tab', { name: 'Clean', exact: true }).count(), 1);
    await assertNoHorizontalOverflow(page, `${target.name} Unit 101`);

    await page.goBack();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await page.goForward();
    await page.getByRole('heading', { name: 'Unit 101', exact: true }).waitFor();

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    await assertUnifiedShell(page, `${target.name} legacy Review`);
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} legacy Review`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const { context, page } = await createCleanPage(browser, { width: 390, height: 844 });
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  assert.equal(await page.locator('[data-unit-id="unit_101"]').count(), 1);
  assert.equal(
    await page
      .locator('[data-unit-id="unit_101"]')
      .getByRole('button', { name: /^Unit 101 (Paint|Clean) / })
      .count(),
    0,
    'Identity-only AppData unexpectedly produced section-level operational truth.',
  );

  await page.getByRole('button', { name: 'Open central add menu', exact: true }).click();
  await assertSingleCapture(page, 'embedded TurnBoard central Add');
  assert.equal(await page.locator('.lcc-root').getAttribute('aria-hidden'), 'true');
  assert.notEqual(await page.locator('.lcc-root').getAttribute('inert'), null);
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'lcc-central-plus');
  assert.equal(await page.evaluate(() => window.location.hash), '#/units');

  assert.deepEqual(findings, [], `Host interaction runtime findings:\n${findings.join('\n')}`);
  await context.close();

  console.log('Wave 1R unified-host integration browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
