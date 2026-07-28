import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4219;
const baseUrl = `http://${host}:${port}`;
const screenshotDir = '/private/tmp/turn-os-wave2a1-final';
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
  page.setDefaultTimeout(30_000);
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

const assertLaunchShell = async (page, label) => {
  assert.equal(
    await page.locator('[data-testid="launch-command-center-shell"]').count(),
    1,
    `${label} did not render exactly one command shell.`,
  );
  assert.equal(await page.locator('.app-shell').count(), 0, `${label} exposed the legacy app shell.`);
  assert.equal(await page.getByRole('main').count(), 1, `${label} did not expose one main landmark.`);
  assert.deepEqual(
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button').allTextContents(),
    ['Home', 'TurnBoard', 'Add', 'Activity', 'More'],
  );
};

const assertVisibleFormControlsAtLeast16 = async (page, label) => {
  const controls = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):visible, '
    + 'textarea:visible, select:visible',
  );
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const fontSize = await controls.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize));
    assert.ok(fontSize >= 16, `${label} control ${index} used ${fontSize}px text.`);
  }
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator(
    '[data-lcc-critical-target="true"]:visible, '
    + '[data-track-c-critical-target="true"]:visible, '
    + '[data-w1r-critical-target="true"]:visible',
  );
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

const primaryNavigation = (page) => page.getByRole('navigation', { name: 'Primary' });

const settleNativeTransition = async (page) => {
  const transition = page.locator('.w2a1-a-page-transition');
  if (await transition.count() === 0) return;
  await transition.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)));
};

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a1-integration-vite-final',
  configLoader: 'runner',
  root: process.cwd(),
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), 'index.html')],
  },
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of viewports) {
    const { context, findings, page } = await createCleanPage(browser, target.viewport);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} Home`);
    await assertNoHorizontalOverflow(page, `${target.name} Home`);
    await assertCriticalTargets(page, `${target.name} Home`);

    await primaryNavigation(page)
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertLaunchShell(page, `${target.name} TurnBoard`);
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);
    assert.ok(await page.locator('[data-testid="wave1r-unit-row"]').count() > 0);
    assert.ok(await page.getByText('Paint', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Clean', { exact: true }).count() > 0);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const { context, findings, page } = await createCleanPage(browser, { width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  for (const action of ['Import work', 'Assign crews', 'Start walk', 'End day']) {
    assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), 1);
  }
  for (const summary of ['Working', 'Waiting', 'Callbacks', 'Ready to walk']) {
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${summary}\\b`, 'u') }).count(), 1);
  }

  const goalTrigger = page.locator('.w2a1-a-goal-row');
  await page.getByRole('button', { name: /Set today.s goal/u }).click();
  const goalDialog = page.getByRole('dialog', { name: /Set today.s goal/u });
  await goalDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.notEqual(await page.locator('.w2a1-a-home').getAttribute('inert'), null);
  await goalDialog.locator('label').filter({ hasText: 'Metric' }).locator('select')
    .selectOption('units');
  await goalDialog.locator('label').filter({ hasText: 'Milestone' }).locator('select')
    .selectOption('ready-to-walk');
  await goalDialog.locator('label').filter({ hasText: 'Target' }).locator('input')
    .fill('3');
  await goalDialog.getByRole('button', { name: 'Save goal', exact: true }).click();
  await goalDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: /of 3 units ready to walk/u }).count(), 1);
  assert.equal(await goalTrigger.evaluate((element) => document.activeElement === element), true);

  const readySummary = page.getByRole('button', { name: /^Ready to walk\b/u });
  const readyCount = Number.parseInt(
    (await readySummary.locator('.w2a1-a-row-value').innerText()).trim(),
    10,
  );
  await readySummary.click();
  await page.getByRole('heading', { name: 'Ready to walk', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard?summary=ready-to-walk');
  if (readyCount === 0) {
    await page.getByRole('heading', { name: 'No Units are ready to walk.', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Unit /u }).count(), 0);
  } else {
    assert.equal(
      await page.locator('.w2a1-a-detail-page__scroll .w2a1-a-inset-row').count(),
      readyCount,
    );
  }
  await page.getByRole('button', { name: 'Back from Ready to walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.location.hash), '#/search');
  assert.equal(await page.locator('[data-testid="launch-command-center-shell"]').count(), 0);
  const search = page.getByRole('searchbox');
  await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'search');
  await search.fill('Unit');
  assert.ok(await page.getByRole('button', { name: /^Unit /u }).count() > 0);
  await assertVisibleFormControlsAtLeast16(page, 'Search');
  await settleNativeTransition(page);
  await assertNoHorizontalOverflow(page, 'Search');
  await page.screenshot({ path: `${screenshotDir}/search-390.png`, fullPage: true });
  await page.getByRole('button', { name: 'Back from Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await page.getByRole('button', { name: /Open notifications/u }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('tablist', { name: 'Notification filters' }).count(), 1);
  const allTab = page.getByRole('tab', { name: 'All', exact: true });
  await allTab.focus();
  await allTab.press('ArrowRight');
  assert.equal(
    await page.getByRole('tab', { name: 'Inspections', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  await settleNativeTransition(page);
  await assertNoHorizontalOverflow(page, 'Notifications');
  await page.getByRole('button', { name: 'Back from Notifications', exact: true }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await primaryNavigation(page)
    .getByRole('button', { name: 'Open central add menu', exact: true })
    .click();
  const addDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
  await addDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(await page.locator('.capture-workspace').count(), 0);
  const nativeFileInputs = addDialog.locator('input[type="file"]');
  assert.equal(await nativeFileInputs.count(), 3);
  for (let index = 0; index < await nativeFileInputs.count(); index += 1) {
    assert.equal(await nativeFileInputs.nth(index).getAttribute('aria-hidden'), 'true');
    assert.equal(await nativeFileInputs.nth(index).getAttribute('tabindex'), '-1');
  }
  await page.screenshot({ path: `${screenshotDir}/plus-390.png`, fullPage: true });
  await addDialog.getByRole('button', { name: /^Note\b/u }).click();
  const noteDialog = page.getByRole('dialog', { name: 'New Note' });
  await noteDialog.waitFor();
  const exactNote = 'Unit walk reminder — exact personal wording.';
  await noteDialog.getByLabel('Note', { exact: true }).fill(exactNote);
  await assertVisibleFormControlsAtLeast16(page, 'New Note');
  await noteDialog.getByRole('button', { name: 'Save Note', exact: true }).click();
  await noteDialog.waitFor({ state: 'hidden' });

  await primaryNavigation(page).getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
  const noteActivity = page.locator('.w1r-activity-list__open').filter({ hasText: exactNote });
  assert.equal(await noteActivity.count(), 1);
  await noteActivity.click();
  const activityDialog = page.getByRole('dialog', { name: 'Personal Note' });
  await activityDialog.waitFor();
  await activityDialog.getByText(exactNote, { exact: true }).waitFor();
  await activityDialog.getByRole('button', { name: 'Close Personal Note', exact: true }).click();
  await activityDialog.waitFor({ state: 'hidden' });
  assert.equal(await noteActivity.evaluate((element) => document.activeElement === element), true);

  await primaryNavigation(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}/more-390.png`, fullPage: true });
  await page.getByRole('button', { name: /Open profile for/u }).click();
  await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
  await page.getByText('Paper remains authoritative', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();

  await page.getByRole('button', { name: /^Crews\b/u }).click();
  await page.getByRole('heading', { name: 'Crews', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add crew', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Add Crew', exact: true }).waitFor();
  await assertVisibleFormControlsAtLeast16(page, 'Add Crew');
  await page.getByLabel('Name').fill('Synthetic Paint Crew');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('heading', { name: 'Crews', exact: true }).waitFor();

  await page.goto(`${baseUrl}/#/assignments`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Import work', exact: true }).waitFor();
  await assertLaunchShell(page, 'Import work');
  await assertNoHorizontalOverflow(page, 'Import work');
  assert.equal(
    await page.locator('.lcc-unified-tool-content .page-title:visible').count(),
    0,
    'Import work exposed a second legacy page title.',
  );

  await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
  await page.locator('.capture-workspace[role="dialog"]').waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1);
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);

  await page.screenshot({ path: `${screenshotDir}/home-390.png`, fullPage: true });
  await assertNoHorizontalOverflow(page, 'Final Home');
  assert.deepEqual(findings, [], `iPhone integration findings:\n${findings.join('\n')}`);
  await context.close();

  console.log(`Wave 2A.1 integrated browser gate passed. Screenshots: ${screenshotDir}`);
} finally {
  await browser?.close();
  await server.close();
}
