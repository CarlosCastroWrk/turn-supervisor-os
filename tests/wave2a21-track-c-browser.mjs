import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4241;
const baseUrl = `http://${host}:${port}`;
const viewports = [
  { height: 700, name: 'iPhone-320', width: 320 },
  { height: 844, name: 'iPhone-390', width: 390 },
  { height: 932, name: 'iPhone-430', width: 430 },
  { height: 768, name: 'iPad-landscape', width: 1024 },
  { height: 900, name: 'Mac', width: 1440 },
];

const createPage = async (browser, viewport, colorScheme = 'light') => {
  const context = await browser.newContext({
    colorScheme,
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();
  const findings = [];
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  return { context, findings, page };
};

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

const assertNoOverflow = async (page, label) => {
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
  cacheDir: '/private/tmp/pds-wave2a21-track-c-vite',
  configLoader: 'runner',
  envFile: false,
  logLevel: 'error',
  root: process.cwd(),
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const { context, findings, page } = await createPage(browser, viewport);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();

    const homeControl = page.getByRole('button', {
      name: 'Open Home — Turn OS Supervisor',
    });
    assert.equal(await homeControl.count(), 1);

    await primaryNavigation(page)
      .getByRole('button', { exact: true, name: 'TurnBoard' })
      .click();
    await page.locator('[data-testid="track-c-field-ops"]').waitFor();
    assert.equal(
      await page.getByRole('navigation', { name: 'Track C field operations' }).count(),
      0,
      `${viewport.name} rendered a second Field Operations navigator.`,
    );
    assert.equal(
      await page.locator('[data-navigation-owner="host"]').count(),
      1,
    );
    await assertNoOverflow(page, `${viewport.name} TurnBoard`);
    if (viewport.name === 'iPhone-390') {
      await page.screenshot({
        fullPage: true,
        path: '/private/tmp/turn-os-wave2a21-track-c-turnboard-390.png',
      });
    }

    await homeControl.click();
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');

    assert.deepEqual(
      findings,
      [],
      `${viewport.name} runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  {
    const { context, findings, page } = await createPage(
      browser,
      { height: 844, width: 390 },
      'dark',
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();

    const plus = page.getByRole('button', { name: 'Open central Plus menu' });
    await plus.focus();
    await plus.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
    await dialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(
      await dialog.getByRole('button', { name: /^Note(?:\s|$)/u }).isEnabled(),
      true,
    );
    assert.equal(await page.getByText('Field Copilot', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Create Assignment', { exact: true }).count(), 0);
    await page.screenshot({
      fullPage: true,
      path: '/private/tmp/turn-os-wave2a21-track-c-plus-390.png',
    });

    await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await plus.evaluate((element) => document.activeElement === element), true);
    await plus.press('Enter');
    await page.getByRole('dialog', { name: 'Add to Turn OS' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();

    assert.equal(
      await page.locator('[data-testid="launch-command-center-shell"]').getAttribute('data-theme'),
      'dark',
    );
    await assertNoOverflow(page, 'iPhone-390 dark Plus');
    assert.deepEqual(findings, [], `dark-mode runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Wave 2A.2.1 Track C browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
