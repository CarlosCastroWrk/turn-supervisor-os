import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4212;
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

const assertLaunchShell = async (page, label) => {
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
  assert.equal(
    await page.getByRole('link', { name: 'Skip to main content', exact: true }).count(),
    1,
    `${label} did not expose one skip link.`,
  );
  assert.equal(
    await page.getByRole('main').count(),
    1,
    `${label} exposed nested or missing main landmarks.`,
  );
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-lcc-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} rendered no critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no box.`);
    assert.ok(
      box.height >= 43.5 && box.width >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertSingleCapture = async (page, label) => {
  await page.locator('.capture-workspace[role="dialog"]').waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} mounted multiple Capture owners.`);
  assert.equal(await page.getByRole('dialog').count(), 1, `${label} exposed multiple dialogs.`);
  assert.equal(await page.locator('.lcc-root').getAttribute('aria-hidden'), 'true');
  assert.notEqual(await page.locator('.lcc-root').getAttribute('inert'), null);
};

const server = await createServer({
  cacheDir: '/private/tmp/pds-launch-wave2a-vite',
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
    await assertLaunchShell(page, `${target.name} Home`);
    await assertNoHorizontalOverflow(page, `${target.name} Home`);
    await assertCriticalTargets(page, `${target.name} Home`);
    for (const action of ['Import work', 'Assign crews', 'Start walk', 'End day']) {
      assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), 1);
    }
    assert.equal(await page.getByText('Daily goal', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Daily goal not configured', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('progressbar').count(), 0);

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} TurnBoard`);
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 1);
    assert.ok(await page.getByText('Paint', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Clean', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Assignment unknown', { exact: true }).count() > 0);
    assert.equal(await page.getByRole('button', { name: /Open assignment proposal/u }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Done', exact: true }).count(), 0);
    await page.waitForFunction(() =>
      document.activeElement?.id === 'launch-command-center-main'
      && document.title === 'TurnBoard · Turn OS');
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'Activity', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} Activity`);

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} More`);

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} legacy Review`);
    await assertNoHorizontalOverflow(page, `${target.name} legacy Review`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const { context: interactionContext, page } = await createCleanPage(
    browser,
    { width: 390, height: 844 },
  );
  const findings = attachRuntimeChecks(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('region', { name: 'Home command center' }).waitFor();
  assert.equal(await page.title(), 'Home · Turn OS');

  await page.getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();
  const firstUnitButton = page.getByRole('button', { name: /^Open Unit /u }).first();
  await firstUnitButton.click();
  await page.waitForFunction(() =>
    document.activeElement?.id === 'w1r-unit-detail-title');
  await page.getByRole('button', { name: 'Personal notes & photos', exact: true }).click();
  await page.getByLabel('Quick note', { exact: true }).waitFor();
  assert.match(await page.evaluate(() => window.location.hash), /^#\/unit\//u);
  await page.getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();

  await page.goto(`${baseUrl}/#/units?status=Blocked`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'TURNBOARD', exact: true }).waitFor();
  await page.locator('.turnboard-filters > summary').click();
  const personalStatusFilter = page
    .locator('.turnboard-filters label.field')
    .filter({ hasText: 'Personal status' })
    .locator('select');
  assert.equal(await personalStatusFilter.inputValue(), 'Blocked');
  assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 0);
  assert.equal(await page.evaluate(() => window.location.hash), '#/units?status=Blocked');
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('region', { name: 'Home command center' }).waitFor();

  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.location.hash), '#/search');
  const searchFontSize = await page.getByRole('searchbox').evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize));
  assert.ok(searchFontSize >= 16, `Search input font-size was ${searchFontSize}px.`);
  await page.getByRole('searchbox').fill('Unit 10');
  assert.ok(await page.getByRole('button', { name: /Unit 10/ }).count() > 0);
  await assertNoHorizontalOverflow(page, 'iPhone Search');
  await page.getByRole('button', { name: 'Back from Search' }).click();
  await page.getByRole('region', { name: 'Home command center' }).waitFor();

  await page.getByRole('button', { name: /Open notifications/ }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.location.hash), '#/notifications');
  await assertNoHorizontalOverflow(page, 'iPhone Notifications');
  await page.getByRole('button', { name: 'Back from Notifications' }).click();

  await page.getByRole('button', { name: 'Open central add menu', exact: true }).click();
  await assertSingleCapture(page, 'central Add');
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'lcc-central-plus');

  await page.getByRole('button', { name: 'Open Turn OS Intelligence', exact: true }).click();
  await assertSingleCapture(page, 'intelligence');
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'lcc-intelligence');

  await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
  await assertSingleCapture(page, 'legacy copilot route');
  assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.getByRole('region', { name: 'Home command center' }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);

  assert.deepEqual(findings, [], `iPhone interaction runtime findings:\n${findings.join('\n')}`);
  await interactionContext.close();

  console.log('Launch Wave 2A integration browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
