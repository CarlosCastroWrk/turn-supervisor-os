import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4228;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave2a2-track-d/preview.html';

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
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

const assertMinimumTargets = async (locator, label) => {
  const count = await locator.count();
  assert.ok(count > 0, `${label} rendered no targets.`);
  for (let index = 0; index < count; index += 1) {
    const bounds = await locator.nth(index).boundingBox();
    assert.ok(bounds, `${label} target ${index} had no bounds.`);
    assert.ok(
      bounds.height >= 43.5 && bounds.width >= 43.5,
      `${label} target ${index} measured ${bounds.width}x${bounds.height}.`,
    );
  }
};

const parseColor = (value) => {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `Could not parse color ${value}.`);
  return channels;
};

const relativeLuminance = (color) => {
  const channels = parseColor(color)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
};

const contrastRatio = (foreground, background) => {
  const luminances = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
};

const assertContrast = async (
  foregroundLocator,
  backgroundLocator,
  label,
) => {
  const colors = await foregroundLocator.evaluate(
    (foreground, backgroundSelector) => {
      const background = backgroundSelector
        ? document.querySelector(backgroundSelector)
        : foreground;
      if (!(background instanceof HTMLElement)) {
        throw new Error(`Missing contrast background ${backgroundSelector}.`);
      }
      return {
        background: getComputedStyle(background).backgroundColor,
        foreground: getComputedStyle(foreground).color,
      };
    },
    backgroundLocator,
  );
  const ratio = contrastRatio(colors.foreground, colors.background);
  assert.ok(
    ratio >= 4.5,
    `${label} contrast ${ratio.toFixed(2)} was below WCAG AA: ${JSON.stringify(colors)}.`,
  );
};

const selectTheme = async (page, theme) => {
  await page.getByRole('button', { name: `${theme} theme`, exact: true }).click();
  await page.waitForFunction(
    (nextTheme) =>
      nextTheme === 'System'
        ? !document.documentElement.dataset.turnTheme
        : document.documentElement.dataset.turnTheme === nextTheme.toLowerCase(),
    theme,
  );
};

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a2-track-d-vite-cache',
  configFile: false,
  logLevel: 'error',
  server: { host, port, strictPort: true },
});

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    {
      name: 'iphone-320-light',
      theme: 'Light',
      viewport: { width: 320, height: 844 },
    },
    {
      name: 'iphone-390-dark',
      theme: 'Dark',
      viewport: { width: 390, height: 844 },
    },
    {
      name: 'iphone-430-light',
      theme: 'Light',
      viewport: { width: 430, height: 932 },
    },
    {
      name: 'ipad-landscape-dark',
      theme: 'Dark',
      viewport: { width: 1024, height: 768 },
    },
    {
      name: 'mac-light',
      theme: 'Light',
      viewport: { width: 1440, height: 900 },
    },
  ]) {
    const context = await browser.newContext({
      colorScheme: target.theme === 'Dark' ? 'dark' : 'light',
      viewport: target.viewport,
    });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'Wave 2A.2 Track D Repair · Turn OS');
    await page.getByRole('heading', { name: 'Import Work', exact: true }).waitFor();
    await selectTheme(page, target.theme);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('main main').count(), 0);
    await assertNoHorizontalOverflow(page, target.name);

    if (target.name === 'iphone-320-light' || target.name === 'iphone-390-dark') {
      const screenshot = `/private/tmp/wave2a2-track-d-${target.name}.png`;
      await page.screenshot({ path: screenshot, fullPage: false });
      screenshots.push(screenshot);
    }

    assert.deepEqual(
      findings,
      [],
      `${target.name} runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  const context = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });

  const fileInput = page.locator('input[type="file"][accept*=".pdf"]');
  assert.equal(await fileInput.count(), 1);
  await fileInput.setInputFiles({
    buffer: Buffer.from('synthetic pdf source'),
    mimeType: 'application/pdf',
    name: 'release.pdf',
  });
  await page
    .getByText('Source attached — extraction not yet available.', {
      exact: true,
    })
    .waitFor();
  await page.getByRole('button', { name: 'Paste Text', exact: true }).click();
  await page.getByText(/Original attachment retained: release\.pdf/).waitFor();
  await page.getByLabel('Source wording').fill('101');
  await page
    .getByRole('button', { name: 'Create review preview', exact: true })
    .click();
  await page.getByRole('heading', { name: 'release.pdf', exact: true }).waitFor();
  await page.getByLabel('Paint scope').selectOption('included');
  await page.getByLabel('Clean scope').selectOption('excluded');
  await page.getByLabel(/I reviewed this personal preview/).check();

  const confirmButton = page.getByRole('button', {
    name: 'Confirm reviewed intake',
    exact: true,
  });
  await confirmButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByText(/Intake confirmed once and locked/).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Intake confirmed' }).isDisabled(),
    true,
  );
  assert.equal(await page.getByLabel('Paint scope').isDisabled(), true);
  const importResult = await page.getByTestId('preview-result').innerText();
  assert.match(importResult, /"sourceName": "release\.pdf"/);
  assert.match(importResult, /"sourceKind": "file"/);
  assert.match(importResult, /"sourceFiles": \[\s*"release\.pdf"\s*\]/);
  assert.match(importResult, /"transcriptionKind": "paste"/);
  assert.match(importResult, /"paintRequested": true/);
  assert.match(importResult, /"cleanRequested": false/);
  assert.match(importResult, /confirmCount:1/);

  await page.getByRole('button', { name: 'Photo', exact: true }).click();
  await page.getByRole('heading', { name: 'New Photo', exact: true }).waitFor();
  await page.getByText('plus-selected.svg', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: /Camera\s+Take a new photo/ })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole('button', { name: /Photos\s+Choose from this device/ })
      .count(),
    1,
  );
  await page.getByLabel('Caption (optional)').fill('Plus picker handoff');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await page.getByText('Photo saved', { exact: true }).waitFor();
  const photoResult = await page.getByTestId('preview-result').innerText();
  assert.match(photoResult, /"fileName": "plus-selected\.svg"/);
  assert.match(photoResult, /"caption": "Plus picker handoff"/);
  await assertMinimumTargets(
    page.locator('[data-track-d-critical-target="receipt-action"]:visible'),
    'receipt actions',
  );

  await selectTheme(page, 'Dark');
  await assertContrast(
    page.locator('.w2a2d-receipt'),
    null,
    'dark receipt text',
  );
  await assertContrast(
    page.locator('.w2a2d-receipt button').first(),
    '.w2a2d-receipt',
    'dark receipt action',
  );

  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
  assert.equal(await page.locator('.w2a2d-activity-card').count(), 1);
  assert.equal(await page.getByText('Unconfirmed model proposal').count(), 0);
  const activityCard = page.locator('.w2a2d-activity-card');
  assert.match(await activityCard.innerText(), /Action\s+Saved direct note/i);
  assert.match(await activityCard.innerText(), /Source\s+Direct note/i);
  assert.match(await activityCard.innerText(), /Boundary\s+Personal record/i);
  await assertMinimumTargets(
    page.locator('[data-track-d-critical-target="activity-filter"]:visible'),
    'Activity filters',
  );
  await assertMinimumTargets(
    page.locator('[data-track-d-critical-target]:visible'),
    'all visible Activity critical targets',
  );
  await assertContrast(
    page.locator('.w2a2d-page'),
    null,
    'dark page text',
  );
  await assertContrast(
    page.locator('.w2a2d-page__heading > p:not(.w2a2d-status-pill)'),
    '.w2a2d-page',
    'dark secondary text',
  );
  await assertContrast(
    page.locator('.w2a2d-status-pill'),
    null,
    'dark status token',
  );
  await assertContrast(
    page.locator('.w2a2d-filter-grid button[aria-pressed="true"]'),
    null,
    'dark active filter',
  );

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--turn-color-page', '#123456');
  });
  assert.equal(
    await page
      .locator('.w2a2d-page')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgb(18, 52, 86)',
  );
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--turn-color-page');
  });

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Reports and Proof', exact: true })
    .waitFor();
  const emptyRoster = page.getByRole('button', { name: /Property roster/ });
  assert.equal(await emptyRoster.isDisabled(), false);
  assert.match(await emptyRoster.innerText(), /^0\s+Property roster\s+0 linked records$/);
  const unavailableRelease = page.getByRole('button', {
    name: /Released today/,
  });
  assert.equal(await unavailableRelease.isDisabled(), true);
  assert.match(await unavailableRelease.innerText(), /Not connected/);
  const notRecordedWorking = page.getByRole('button', { name: /Working/ });
  assert.equal(await notRecordedWorking.isDisabled(), true);
  assert.match(await notRecordedWorking.innerText(), /Not recorded/);
  await emptyRoster.click();
  assert.match(await page.getByTestId('preview-result').innerText(), /property-roster:0/);

  await assertNoHorizontalOverflow(page, 'interaction flow');
  assert.deepEqual(
    findings,
    [],
    `Track D interaction runtime findings:\n${findings.join('\n')}`,
  );
  await context.close();

  console.log('Wave 2A.2 Track D browser repair checks passed.');
  console.log(`Screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser?.close();
  await server.close();
}
