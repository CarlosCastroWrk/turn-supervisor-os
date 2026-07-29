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

  const integrityContext = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  });
  const integrityPage = await integrityContext.newPage();
  const integrityFindings = attachRuntimeChecks(integrityPage);
  await integrityPage.goto(`${baseUrl}${previewPath}`, {
    waitUntil: 'networkidle',
  });

  // 01/03: editing the source starts a newer parse revision; the older,
  // slower result must never replace it.
  await integrityPage
    .getByRole('button', {
      name: 'Paste Text Parse copied rows deterministically',
      exact: true,
    })
    .click();
  const sourceWording = integrityPage.getByLabel('Source wording');
  const createPreview = integrityPage.getByRole('button', {
    name: 'Create review preview',
    exact: true,
  });
  await sourceWording.fill('Unit: 101; notes: SLOW_PARSE');
  await createPreview.click();
  await sourceWording.fill('Unit: 102; notes: FAST_PARSE');
  await createPreview.click();
  await integrityPage
    .getByRole('heading', { name: 'Pasted source text', exact: true })
    .waitFor();
  assert.equal(
    await integrityPage.getByLabel('Unit', { exact: true }).inputValue(),
    '102',
  );
  await integrityPage.waitForTimeout(450);
  assert.equal(
    await integrityPage.getByLabel('Unit', { exact: true }).inputValue(),
    '102',
  );

  // 02: replacing a text file while its parse is running leaves only the
  // replacement review visible.
  await integrityPage
    .getByRole('button', { name: 'Start over', exact: true })
    .click();
  const integrityFileInput = integrityPage.locator(
    'input[type="file"][accept*=".pdf"]',
  );
  await integrityFileInput.setInputFiles({
    buffer: Buffer.from('Unit: 101; notes: SLOW_PARSE'),
    mimeType: 'text/plain',
    name: 'earlier.txt',
  });
  await integrityFileInput.setInputFiles({
    buffer: Buffer.from('Unit: 102; notes: FAST_PARSE'),
    mimeType: 'text/plain',
    name: 'replacement.txt',
  });
  await integrityPage
    .getByRole('heading', { name: 'replacement.txt', exact: true })
    .waitFor();
  await integrityPage.waitForTimeout(450);
  assert.equal(
    await integrityPage.getByRole('heading', {
      name: 'replacement.txt',
      exact: true,
    }).count(),
    1,
  );
  assert.equal(
    await integrityPage.getByLabel('Unit', { exact: true }).inputValue(),
    '102',
  );

  // 14: parser exceptions preserve the exact retryable source.
  await integrityPage
    .getByRole('button', { name: 'Start over', exact: true })
    .click();
  await integrityPage
    .getByRole('button', {
      name: 'Paste Text Parse copied rows deterministically',
      exact: true,
    })
    .click();
  await integrityPage
    .getByLabel('Source wording')
    .fill('Unit: 101; notes: THROW_PARSE');
  await integrityPage
    .getByRole('button', { name: 'Create review preview', exact: true })
    .click();
  await integrityPage.getByText(/Preview failed\. Nothing was imported/).waitFor();
  assert.equal(
    await integrityPage.getByLabel('Source wording').inputValue(),
    'Unit: 101; notes: THROW_PARSE',
  );

  assert.deepEqual(
    integrityFindings,
    [],
    `Track D integrity runtime findings:\n${integrityFindings.join('\n')}`,
  );
  await integrityContext.close();

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
  await page
    .getByRole('button', {
      name: 'Paste Text',
      exact: true,
    })
    .click();
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
  await selectTheme(page, 'Dark');
  await assertContrast(
    confirmButton,
    null,
    'explicit-dark import primary action without a host on-brand token',
  );

  const startOverButton = page.getByRole('button', {
    name: 'Start over',
    exact: true,
  });
  const unitInput = page.getByLabel('Unit', { exact: true });
  const reviewCheckbox = page.getByLabel(
    /I reviewed this personal preview/,
  );

  await confirmButton.click();
  await page
    .getByRole('button', { name: 'Confirming…', exact: true })
    .waitFor();
  assert.equal(await startOverButton.isDisabled(), true);
  assert.equal(await unitInput.isDisabled(), true);
  assert.equal(await reviewCheckbox.isDisabled(), true);

  await startOverButton.evaluate((button) => {
    button.removeAttribute('disabled');
    button.click();
    button.setAttribute('disabled', '');
  });
  await unitInput.evaluate((input) => {
    input.removeAttribute('disabled');
    input.value = '999';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.setAttribute('disabled', '');
  });
  await page
    .getByRole('button', { name: 'Confirming…', exact: true })
    .evaluate((button) => {
      button.removeAttribute('disabled');
      button.click();
      button.setAttribute('disabled', '');
    });

  await page.getByText(/Intake confirmed once and locked/).waitFor();
  await page.getByRole('heading', { name: 'release.pdf', exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Unit', { exact: true }).inputValue(),
    '101',
  );
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
  assert.match(importResult, /"originalText": "101"/);
  assert.match(importResult, /confirmCount:1/);

  // 15/17/18/22/23/24: a rejected complete-save callback never produces a
  // success receipt, leaves the exact source/review retryable, and succeeds
  // only after a later complete matching receipt.
  await page
    .getByRole('button', { name: 'Start a new intake', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Paste Text Parse copied rows deterministically',
      exact: true,
    })
    .click();
  const failingSource =
    'Unit: 102; paint: yes; clean: no; notes: SAVE_FAIL';
  await page.getByLabel('Source wording').fill(failingSource);
  await page
    .getByRole('button', { name: 'Create review preview', exact: true })
    .click();
  await page.getByLabel(/I reviewed this personal preview/).check();
  await page
    .getByRole('button', { name: 'Confirm reviewed intake', exact: true })
    .click();
  await page.getByText(/Confirmation failed\. Nothing is marked saved/).waitFor();
  assert.equal(
    await page.getByLabel('Restrictions or source notes').inputValue(),
    'SAVE_FAIL',
  );
  assert.match(
    await page.getByTestId('preview-result').innerText(),
    /confirmCount:1/,
  );
  await page
    .getByLabel('Restrictions or source notes')
    .fill('retry succeeds');
  await page.getByLabel(/I reviewed this personal preview/).check();
  await page
    .getByRole('button', { name: 'Confirm reviewed intake', exact: true })
    .click();
  await page.getByText(/Intake confirmed once and locked/).waitFor();
  const retryResult = await page.getByTestId('preview-result').innerText();
  assert.match(retryResult, /confirmCount:2/);
  assert.match(retryResult, /SAVE_FAIL/);
  assert.doesNotMatch(retryResult, /retry succeeds/);

  // Direct Note saves clear only the exact committed revision. Newer wording
  // and Unit context survive an earlier in-flight save.
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await page.getByRole('heading', { name: 'New Note', exact: true }).waitFor();
  const noteWording = page.getByLabel('Note wording');
  await noteWording.fill('Earlier note wording');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
  await noteWording.fill('Newer unsaved note wording');
  await page.getByLabel('Unit context (optional)').selectOption('unit-102');
  await page.getByText(/earlier note was saved.*newer wording/i).waitFor();
  assert.equal(await noteWording.inputValue(), 'Newer unsaved note wording');
  assert.equal(
    await page.getByLabel('Unit context (optional)').inputValue(),
    'unit-102',
  );
  assert.match(
    await page.getByTestId('preview-result').innerText(),
    /Earlier note wording/,
  );
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Note saved', { exact: true }).waitFor();
  assert.equal(await noteWording.inputValue(), '');

  // Save and offline-style host failures retain current Note wording for retry.
  await noteWording.fill('OFFLINE_FAIL remains retryable');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText(/Note was not saved/).waitFor();
  assert.equal(
    await noteWording.inputValue(),
    'OFFLINE_FAIL remains retryable',
  );
  await noteWording.fill('Retry after connectivity returns');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Note saved', { exact: true }).waitFor();

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
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
  await page.getByLabel('Caption (optional)').fill('Newer photo context');
  await page.getByText(/earlier photo was saved.*newer photo or context/i).waitFor();
  const photoResult = await page.getByTestId('preview-result').innerText();
  assert.match(photoResult, /"fileName": "plus-selected\.svg"/);
  assert.match(photoResult, /"caption": "Plus picker handoff"/);
  assert.equal(
    await page.getByLabel('Caption (optional)').inputValue(),
    'Newer photo context',
  );
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await page.getByText('Photo saved', { exact: true }).waitFor();
  const photosInput = page.locator(
    'input[type="file"][accept="image/*"]:not([capture])',
  );
  await photosInput.setInputFiles({
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    ),
    mimeType: 'image/svg+xml',
    name: 'retry-photo.svg',
  });
  await page.getByText('retry-photo.svg', { exact: true }).waitFor();
  await page.getByLabel('Caption (optional)').fill('SAVE_FAIL photo');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await page.getByText(/Photo was not saved/).waitFor();
  assert.equal(
    await page.getByLabel('Caption (optional)').inputValue(),
    'SAVE_FAIL photo',
  );
  await page.getByLabel('Caption (optional)').fill('Photo retry succeeds');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await page.getByText('Photo saved', { exact: true }).waitFor();
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
