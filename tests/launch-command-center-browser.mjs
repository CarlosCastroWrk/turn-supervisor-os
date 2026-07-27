import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4211;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/launch-command-center/preview.html';
const dependencyRoot = process.env.PDS_DEPENDENCY_ROOT ?? process.cwd();
const playwrightRoot = process.env.PDS_PLAYWRIGHT_ROOT ?? dependencyRoot;
const viteRoot = process.env.PDS_VITE_ROOT ?? dependencyRoot;
const uiDependencyRoot = process.env.PDS_UI_DEPENDENCY_ROOT ?? viteRoot;
const playwrightRequire = createRequire(resolve(playwrightRoot, 'package.json'));
const viteRequire = createRequire(resolve(viteRoot, 'package.json'));
const uiRequire = createRequire(resolve(uiDependencyRoot, 'package.json'));
const playwrightEntry = resolve(dirname(playwrightRequire.resolve('playwright')), 'index.mjs');
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/launch-command-center-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), 'src/features/launch-command-center/preview.html')],
  },
  resolve: {
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: uiRequire.resolve('react/jsx-dev-runtime') },
      { find: 'react/jsx-runtime', replacement: uiRequire.resolve('react/jsx-runtime') },
      { find: 'react-dom/client', replacement: uiRequire.resolve('react-dom/client') },
      { find: 'lucide-react', replacement: uiRequire.resolve('lucide-react') },
      { find: 'react', replacement: uiRequire.resolve('react') },
    ],
  },
  server: { host, port, strictPort: true },
});

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
    `${label} overflowed: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
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

const assertInputFontSize = async (page, selector, label) => {
  const size = await page.locator(selector).first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize));
  assert.ok(size >= 16, `${label} font-size was ${size}px.`);
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-320x568', viewport: { width: 320, height: 568 } },
    { name: 'iphone-390x844', viewport: { width: 390, height: 844 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'Launch Command Center Track A');
    await page.getByRole('region', { name: 'Home command center' }).waitFor();
    assert.equal(await page.getByText('Moon Tower · Synthetic', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Daily goal', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '56');
    assert.deepEqual(
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button').allTextContents(),
      ['Home', 'TurnBoard', 'Add', 'Activity', 'More'],
    );
    for (const action of ['Import work', 'Assign crews', 'Start walk', 'End day']) {
      assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), 1);
    }
    assert.equal(
      await page.getByText('Access needs clarification', { exact: true }).isVisible(),
      false,
    );
    await assertNoHorizontalOverflow(page, `${target.name} Home`);
    await assertCriticalTargets(page, `${target.name} Home`);

    const screenshot = `/private/tmp/launch-command-center-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    if (target.name === 'iphone-390x844') {
      await page.locator('summary').filter({ hasText: 'Blocked' }).click();
      await page.getByText('Access needs clarification', { exact: true }).waitFor();
      await page.locator('.lcc-blocked-summary__details').getByRole('button').first().click();
      assert.deepEqual(
        await page.evaluate(() => window.__launchTrackAEvents.blockers),
        ['unit:602:blocker:access'],
      );

      await page.getByRole('button', { name: 'Open Search' }).click();
      await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
      await assertInputFontSize(page, 'input[type="search"]', 'Search input');
      await page.getByRole('searchbox').fill('paint');
      await page.getByRole('button', { name: /North Paint Team/ }).click();
      assert.deepEqual(
        await page.evaluate(() => window.__launchTrackAEvents.searchDestinations),
        ['crew:synthetic-north-paint'],
      );
      await assertNoHorizontalOverflow(page, 'iPhone Search');
      const searchScreenshot = '/private/tmp/launch-command-center-search-iphone.png';
      await page.screenshot({ path: searchScreenshot, fullPage: false });
      screenshots.push(searchScreenshot);
      await page.getByRole('button', { name: 'Back from Search' }).click();

      await page.getByRole('button', { name: /Open notifications/ }).click();
      await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Callbacks', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /Unit 603/ }).count(), 1);
      await page.getByRole('button', { name: /Unit 603/ }).click();
      assert.deepEqual(
        await page.evaluate(() => window.__launchTrackAEvents.notificationDestinations),
        ['unit:603:paint:A'],
      );
      await assertNoHorizontalOverflow(page, 'iPhone Notifications');
      const notificationScreenshot = '/private/tmp/launch-command-center-notifications-iphone.png';
      await page.screenshot({ path: notificationScreenshot, fullPage: false });
      screenshots.push(notificationScreenshot);
      await page.getByRole('button', { name: 'Back from Notifications' }).click();

      await page.getByRole('button', { name: 'Open central add menu' }).click();
      await page.getByRole('button', { name: 'Open Turn OS Intelligence' }).click();
      assert.equal(await page.evaluate(() => window.__launchTrackAEvents.plus), 1);
      assert.equal(await page.evaluate(() => window.__launchTrackAEvents.intelligence), 1);
      assert.equal(await page.getByRole('dialog').count(), 0);
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const loginPage = await loginContext.newPage();
  const loginFindings = attachRuntimeChecks(loginPage);
  await loginPage.goto(`${baseUrl}${previewPath}?surface=login`, { waitUntil: 'networkidle' });
  await loginPage.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await assertInputFontSize(loginPage, 'input[type="email"]', 'Email input');
  await assertInputFontSize(loginPage, 'input[type="password"]', 'Password input');
  await loginPage.getByLabel('Email').fill('los@example.test');
  await loginPage.getByLabel('Password').fill('synthetic-password');
  await loginPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert.equal(await loginPage.evaluate(() => window.__launchTrackAEvents.loginSubmits), 1);
  await assertNoHorizontalOverflow(loginPage, 'iPhone Login');
  await assertCriticalTargets(loginPage, 'iPhone Login');
  const loginScreenshot = '/private/tmp/launch-command-center-login-iphone.png';
  await loginPage.screenshot({ path: loginScreenshot, fullPage: false });
  screenshots.push(loginScreenshot);
  assert.deepEqual(loginFindings, [], `Login runtime findings:\n${loginFindings.join('\n')}`);
  await loginContext.close();

  const reducedContext = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}${previewPath}?surface=login`, { waitUntil: 'networkidle' });
  const animationDuration = await reducedPage.locator('.lcc-login__mark').evaluate((element) =>
    getComputedStyle(element).animationDuration);
  assert.ok(
    animationDuration === '1e-06s' || animationDuration === '0.000001s' || animationDuration === '0s',
    `Reduced-motion mark animation remained ${animationDuration}.`,
  );
  await reducedContext.close();

  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(`${baseUrl}${previewPath}?surface=login&offline=1`, { waitUntil: 'networkidle' });
  assert.equal(await offlinePage.getByRole('button', { name: 'Sign in', exact: true }).isDisabled(), true);
  await offlinePage.getByText('Sign-in needs a connection.', { exact: false }).waitFor();
  await offlineContext.close();

  console.log('Launch command center browser gate passed.');
  console.log(`Screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser?.close();
  await server.close();
}
