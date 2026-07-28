import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4227;
const previewPath = '/src/features/wave2a2-track-a/preview.html';
const baseUrl = `http://${host}:${port}${previewPath}`;
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

const assertTargetsAtLeast44 = async (page, locator, label) => {
  const count = await locator.count();
  assert.ok(count > 0, `${label} exposed no targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await locator.nth(index).boundingBox();
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

const parseRgb = (value) => {
  const channels = value.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? [];
  assert.equal(channels.length, 3, `Could not parse color ${value}.`);
  return channels;
};

const relativeLuminance = (channels) =>
  channels
    .map((channel) => channel / 255)
    .map((channel) => (
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ))
    .reduce((sum, channel, index) =>
      sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

const contrastRatio = (foreground, background) => {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  return (
    Math.max(foregroundLuminance, backgroundLuminance) + 0.05
  ) / (
    Math.min(foregroundLuminance, backgroundLuminance) + 0.05
  );
};

const assertContrast = async (page, foregroundSelector, backgroundSelector, label) => {
  const colors = await page.evaluate(
    ({ foregroundSelector: foreground, backgroundSelector: background }) => {
      const foregroundElement = document.querySelector(foreground);
      const backgroundElement = document.querySelector(background);
      if (!(foregroundElement instanceof HTMLElement)
        || !(backgroundElement instanceof HTMLElement)) {
        return null;
      }
      return {
        background: getComputedStyle(backgroundElement).backgroundColor,
        foreground: getComputedStyle(foregroundElement).color,
        rootTheme: document.documentElement.dataset.turnTheme,
        turnPrimary: getComputedStyle(document.documentElement)
          .getPropertyValue('--turn-color-primary').trim(),
        w2a1bText: getComputedStyle(foregroundElement)
          .getPropertyValue('--w2a1b-text').trim(),
        parentColor: foregroundElement.parentElement
          ? getComputedStyle(foregroundElement.parentElement).color
          : '',
        rowColor: foregroundElement.closest('.w2a1b-row')
          ? getComputedStyle(foregroundElement.closest('.w2a1b-row')).color
          : '',
      };
    },
    { backgroundSelector, foregroundSelector },
  );
  assert.ok(colors, `${label} elements were unavailable.`);
  const ratio = contrastRatio(colors.foreground, colors.background);
  assert.ok(
    ratio >= 4.5,
    `${label} contrast was ${ratio.toFixed(2)}:1 `
      + `(${colors.foreground} on ${colors.background}; `
      + `theme=${colors.rootTheme ?? 'unset'}, `
      + `primary=${colors.turnPrimary || 'unset'}, `
      + `w2a1b=${colors.w2a1bText || 'unset'}, `
      + `parent=${colors.parentColor || 'unset'}, `
      + `row=${colors.rowColor || 'unset'}).`,
  );
};

const assertMoreThemeState = async (page, theme, label) => {
  const displayName = theme === 'dark' ? 'Dark' : 'Light';
  assert.deepEqual(
    await page.evaluate(() => ({
      preference: document.documentElement.dataset.turnThemePreference,
      resolved: document.documentElement.dataset.turnTheme,
    })),
    { preference: theme, resolved: theme },
    `${label} did not update the document theme state.`,
  );
  assert.equal(
    await page.getByRole('radio', { name: displayName, exact: true }).isChecked(),
    true,
    `${label} did not select the ${displayName} theme control.`,
  );
  assert.deepEqual(
    await page.locator('.w2a2-theme-picker button.is-selected').allTextContents(),
    [displayName],
    `${label} exposed the wrong selected-theme styling.`,
  );
  await assertContrast(
    page,
    '.w2a1b-profile-card__copy strong',
    '.w2a1b-profile-card',
    `${label} More profile`,
  );
  await assertContrast(
    page,
    '.w2a1b-row__copy strong',
    '.w2a1b-group__card',
    `${label} More row`,
  );
};

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

const createCleanPage = async (browser, options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const findings = attachRuntimeChecks(page);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  return { context, findings, page };
};

const openHome = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-wave2a2-shell="true"]').waitFor();
};

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a2-track-a-vite',
  configLoader: 'runner',
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), `.${previewPath}`)],
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
    await openHome(page);

    assert.equal(await page.locator('[data-wave2a2-shell="true"]').count(), 1);
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
    await assertNoHorizontalOverflow(page, `${target.name} Home`);
    await assertTargetsAtLeast44(
      page,
      page.locator('[data-w2a2-critical-target="true"]:visible'),
      `${target.name} shell`,
    );

    await primaryNavigation(page)
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
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

  const interaction = await createCleanPage(browser, {
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  });
  await openHome(interaction.page);
  const { page } = interaction;

  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  assert.equal(await page.locator('[data-wave2a2-shell="true"]').count(), 1);
  assert.equal(await page.locator('.w2a2-standalone-route').count(), 0);
  assert.equal(await page.getByRole('main').count(), 1);
  assert.equal(await primaryNavigation(page).isHidden(), true);
  await assertInputsAtLeast16(page, 'Search');
  await page.getByRole('button', { name: 'Back from Search', exact: true }).click();
  assert.equal(await primaryNavigation(page).isVisible(), true);

  await page.getByRole('button', { name: /Open notifications/u }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  assert.equal(await page.locator('[data-wave2a2-shell="true"]').count(), 1);
  assert.equal(await page.getByRole('main').count(), 1);
  assert.equal(await primaryNavigation(page).isHidden(), true);
  await page.getByRole('button', { name: 'Back from Notifications', exact: true }).click();

  await primaryNavigation(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await assertMoreThemeState(page, 'dark', 'Immediate Light to Dark');
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator('meta[name="theme-color"]').getAttribute('content'),
    '#000000',
  );
  await assertMoreThemeState(page, 'dark', 'Settled Dark');
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-more-dark.png`,
    fullPage: false,
  });

  await primaryNavigation(page).getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Open Capture preview' }).click();
  await page.getByRole('dialog', { name: 'Capture' }).waitFor();
  await page.waitForTimeout(220);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await assertContrast(
    page,
    '.capture-workspace__project strong',
    '.capture-workspace',
    'Dark Capture title',
  );
  await assertContrast(
    page,
    '.capture-intent-picker > p',
    '.capture-workspace__timeline',
    'Dark Capture guidance',
  );
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-capture-dark.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Close Field Copilot' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  await primaryNavigation(page).getByRole('button', { name: 'Open central Plus menu' }).click();
  await page.getByRole('dialog', { name: 'Add to Turn OS' }).waitFor();
  await page.waitForTimeout(240);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await assertContrast(
    page,
    '.tc-sheet__header h2',
    '.tc-sheet',
    'Dark Plus title',
  );
  await assertContrast(
    page,
    '.tc-option-list > button strong',
    '.tc-option-list > button',
    'Dark Plus option',
  );
  await assertTargetsAtLeast44(
    page,
    page.locator('[data-track-c-critical-target="true"]:visible'),
    'Dark Plus',
  );
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-plus-dark.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  await primaryNavigation(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await assertMoreThemeState(page, 'light', 'Immediate Dark to Light');
  await page.screenshot({
    path: `${screenshotDir}/iphone-390-more-light.png`,
    fullPage: false,
  });
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator('meta[name="theme-color"]').getAttribute('content'),
    '#f2f4f7',
  );
  await assertMoreThemeState(page, 'light', 'Settled Light');

  assert.deepEqual(
    interaction.findings,
    [],
    `Interaction findings:\n${interaction.findings.join('\n')}`,
  );
  await interaction.context.close();

  const scrollCheck = await createCleanPage(browser, {
    colorScheme: 'light',
    viewport: { width: 390, height: 568 },
  });
  await openHome(scrollCheck.page);
  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();
  const scrollRegion = scrollCheck.page.locator('[data-turn-scroll-region="primary"]');
  await scrollRegion.waitFor();
  const listPosition = await scrollRegion.evaluate((element) => {
    element.scrollTop = Math.min(180, element.scrollHeight - element.clientHeight);
    element.dispatchEvent(new Event('scroll'));
    return element.scrollTop;
  });
  assert.ok(listPosition > 0, 'Synthetic TurnBoard list did not become scrollable.');

  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'Open central Plus menu' })
    .click();
  await scrollCheck.page.getByRole('dialog', { name: 'Add to Turn OS' }).waitFor();
  await scrollCheck.page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
  const positionAfterSheet = await scrollRegion.evaluate((element) => element.scrollTop);
  assert.equal(positionAfterSheet, listPosition, 'Plus changed TurnBoard scroll position.');

  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await primaryNavigation(scrollCheck.page)
    .getByRole('button', { name: 'TurnBoard', exact: true })
    .click();
  await scrollCheck.page.waitForTimeout(50);
  const restoredPosition = await scrollCheck.page
    .locator('[data-turn-scroll-region="primary"]')
    .evaluate((element) => element.scrollTop);
  assert.ok(
    Math.abs(restoredPosition - listPosition) <= 2,
    `TurnBoard restored ${restoredPosition}px instead of ${listPosition}px.`,
  );
  assert.deepEqual(
    scrollCheck.findings,
    [],
    `Scroll findings:\n${scrollCheck.findings.join('\n')}`,
  );
  await scrollCheck.context.close();

  const firstPaint = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const firstPaintPage = await firstPaint.newPage();
  await firstPaintPage.addInitScript(() => {
    localStorage.setItem('turn-os:appearance:v1:device', 'dark');
  });
  await firstPaintPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await firstPaintPage.evaluate(() => document.documentElement.dataset.turnTheme),
    'dark',
  );
  await firstPaintPage.locator('[data-wave2a2-shell="true"]').waitFor();
  assert.equal(
    await firstPaintPage.evaluate(() => document.documentElement.dataset.turnReducedMotion),
    'true',
  );
  const routeAnimation = await firstPaintPage.locator('.w2a2-route-surface').evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  assert.ok(
    routeAnimation === '0s'
      || routeAnimation === '1e-06s'
      || routeAnimation === '0.000001s',
    `Reduced-motion route animation remained ${routeAnimation}.`,
  );
  await firstPaint.close();

  console.log(`Wave 2A.2 Track A browser gate passed. Screenshots: ${screenshotDir}`);
} finally {
  await browser?.close();
  await server.close();
}
