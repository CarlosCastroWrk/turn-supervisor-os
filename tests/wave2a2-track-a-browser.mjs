import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4227;
const baseUrl = `http://${host}:${port}`;
const screenshotDir = '/private/tmp/turn-os-wave2a2-track-a';
const viewports = [
  { name: 'iPhone-320', viewport: { width: 320, height: 700 } },
  { name: 'iPhone-390', viewport: { width: 390, height: 844 } },
  { name: 'iPhone-430', viewport: { width: 430, height: 932 } },
  { name: 'iPad-landscape', viewport: { width: 1024, height: 768 } },
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
  const targets = page.locator('[data-w2a2-critical-target="true"]:visible');
  assert.ok(await targets.count() > 0, `${label} exposed no shell targets.`);
  for (let index = 0; index < await targets.count(); index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no visible box.`);
    assert.ok(
      box.width >= 43.5 && box.height >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertInputsAtLeast16 = async (page, label) => {
  const inputs = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):visible, '
    + 'select:visible, textarea:visible',
  );
  for (let index = 0; index < await inputs.count(); index += 1) {
    const size = await inputs.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize));
    assert.ok(size >= 16, `${label} input ${index} used ${size}px.`);
  }
};

const primaryNavigation = (page) => page.getByRole('navigation', { name: 'Primary' });

const createCleanPage = async (browser, options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const findings = attachRuntimeChecks(page);
  await page.addInitScript(() => {
    const marker = 'turn-os-wave2a2-track-a-clean-start';
    if (!window.sessionStorage.getItem(marker)) {
      window.localStorage.clear();
      window.sessionStorage.setItem(marker, 'true');
    }
  });
  return { context, findings, page };
};

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a2-track-a-vite',
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

  for (const target of viewports) {
    const { context, findings, page } = await createCleanPage(browser, {
      colorScheme: 'light',
      viewport: target.viewport,
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

    assert.equal(await page.locator('[data-wave2a2-shell="true"]').count(), 1);
    assert.equal(await page.locator('.lcc-shell').count(), 0);
    assert.equal(await page.locator('.app-shell').count(), 0);
    assert.equal(await page.getByRole('main').count(), 1);
    assert.deepEqual(
      await primaryNavigation(page).getByRole('button').allTextContents(),
      ['Home', 'TurnBoard', 'Plus', 'Activity', 'More'],
    );
    assert.equal(
      await page.getByRole('button', {
        name: 'Turn OS Intelligence unavailable until a later reviewed release',
      }).isDisabled(),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.turnTheme),
      'light',
    );
    assert.equal(
      await page.locator('meta[name="theme-color"]').getAttribute('content'),
      '#f2f4f7',
    );
    await assertNoHorizontalOverflow(page, `${target.name} Home`);
    await assertCriticalTargets(page, `${target.name} Home`);

    await primaryNavigation(page)
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.ok(await page.locator('[data-testid="wave1r-unit-row"]').count() > 0);
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);

    await primaryNavigation(page)
      .getByRole('button', { name: 'Activity', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Activity`);

    await primaryNavigation(page)
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    assert.equal(await page.getByRole('radiogroup', { name: 'Theme' }).count(), 1);
    await assertNoHorizontalOverflow(page, `${target.name} More`);

    assert.deepEqual(findings, [], `${target.name} findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const { context, findings, page } = await createCleanPage(browser, {
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await primaryNavigation(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.turnTheme),
    'dark',
  );
  assert.equal(
    await page.locator('meta[name="theme-color"]').getAttribute('content'),
    '#000000',
  );
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.turnThemePreference),
    'dark',
  );
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-more-dark.png`,
    fullPage: false,
  });

  await primaryNavigation(page).getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-home-dark.png`,
    fullPage: false,
  });

  await primaryNavigation(page)
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  assert.equal(await page.locator('.w2a2-standalone-route').count(), 1);
  assert.equal(await page.locator('[data-wave2a2-shell="true"]').count(), 0);
  await assertInputsAtLeast16(page, 'Search');
  await assertNoHorizontalOverflow(page, 'Search');
  await page.getByRole('button', { name: 'Back from Search', exact: true }).click();
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.location.hash), '#/units');

  await page.getByRole('button', { name: /Open notifications/u }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  assert.equal(await page.locator('.w2a2-standalone-route').count(), 1);
  await page.getByRole('button', { name: 'Back from Notifications', exact: true }).click();
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();

  await primaryNavigation(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: /Open profile for/u }).click();
  await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();

  await primaryNavigation(page).getByRole('button', { name: 'Open central Plus menu' }).click();
  await page.getByRole('dialog', { name: 'Add to Turn OS' }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.turnTheme),
    'light',
  );
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-more-light.png`,
    fullPage: false,
  });

  assert.deepEqual(findings, [], `iPhone interaction findings:\n${findings.join('\n')}`);
  await context.close();

  const scrollCheck = await createCleanPage(browser, {
    colorScheme: 'light',
    viewport: { width: 390, height: 568 },
  });
  await scrollCheck.page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await scrollCheck.page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  const listPosition = await scrollCheck.page.locator('.w1r-unit-list').evaluate((element) => {
    const nextPosition = Math.min(120, element.scrollHeight - element.clientHeight);
    element.scrollTop = nextPosition;
    return element.scrollTop;
  });
  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();
  await scrollCheck.page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  await scrollCheck.page.waitForTimeout(50);
  const restoredPosition = await scrollCheck.page
    .locator('.w1r-unit-list')
    .evaluate((element) => element.scrollTop);
  if (listPosition > 0) {
    assert.ok(
      Math.abs(restoredPosition - listPosition) <= 2,
      `TurnBoard restored ${restoredPosition}px instead of ${listPosition}px.`,
    );
  } else {
    assert.equal(
      restoredPosition,
      0,
      'A fitting real-data list should return without synthetic scroll movement.',
    );
  }
  assert.deepEqual(
    scrollCheck.findings,
    [],
    `Scroll-history findings:\n${scrollCheck.findings.join('\n')}`,
  );
  await scrollCheck.context.close();

  const systemDark = await createCleanPage(browser, {
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  await systemDark.page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(
    await systemDark.page.evaluate(() => document.documentElement.dataset.turnTheme),
    'dark',
  );
  assert.equal(
    await systemDark.page.evaluate(() => document.documentElement.dataset.turnReducedMotion),
    'true',
  );
  const routeAnimation = await systemDark.page.locator('.w2a2-route-surface').evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  assert.ok(
    routeAnimation === '0s'
      || routeAnimation === '1e-06s'
      || routeAnimation === '0.000001s',
    `Reduced-motion route animation remained ${routeAnimation}.`,
  );
  assert.deepEqual(
    systemDark.findings,
    [],
    `System dark findings:\n${systemDark.findings.join('\n')}`,
  );
  await systemDark.context.close();

  console.log(`Wave 2A.2 Track A browser gate passed. Screenshots: ${screenshotDir}`);
} finally {
  await browser?.close();
  await server.close();
}
