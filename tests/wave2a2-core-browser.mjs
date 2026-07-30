import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4233;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';
const viewports = [
  { name: 'iPhone-320', viewport: { height: 700, width: 320 } },
  { name: 'iPhone-390', viewport: { height: 844, width: 390 } },
  { name: 'iPhone-430', viewport: { height: 932, width: 430 } },
  { name: 'iPad-landscape', viewport: { height: 768, width: 1024 } },
  { name: 'Mac', viewport: { height: 900, width: 1440 } },
];

const createCleanPage = async (browser, viewport, colorScheme = 'light') => {
  const context = await browser.newContext({ colorScheme, viewport });
  const page = await context.newPage();
  const findings = [];
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.addInitScript(() => {
    const initializationKey = 'wave2a2-core-browser-initialized';
    if (window.sessionStorage.getItem(initializationKey) === 'true') return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(initializationKey, 'true');
  });
  return { context, findings, page };
};

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

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

const assertAcceptedShell = async (page, label) => {
  assert.equal(
    await page.locator('[data-testid="launch-command-center-shell"]').count(),
    1,
    `${label} did not expose exactly one accepted shell.`,
  );
  assert.equal(
    await page.locator('[data-wave2a2-overlay-boundary="true"]').count(),
    1,
    `${label} did not expose exactly one overlay boundary.`,
  );
  assert.equal(await page.getByRole('main').count(), 1, `${label} did not expose one main.`);
  assert.deepEqual(
    await primaryNavigation(page).getByRole('button').allTextContents(),
    ['Home', 'TurnBoard', 'Plus', 'Activity', 'More'],
  );
  await assertNoHorizontalOverflow(page, label);
};

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a2-core-browser-vite',
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

  for (const target of viewports) {
    const { context, findings, page } = await createCleanPage(
      browser,
      target.viewport,
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await assertAcceptedShell(page, `${target.name} Home`);

    await primaryNavigation(page)
      .getByRole('button', { name: 'TurnBoard', exact: true })
      .click();
    await page.locator('[data-testid="track-c-field-ops"]').waitFor();
    await assertAcceptedShell(page, `${target.name} TurnBoard`);
    assert.ok(await page.getByText('Paint', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Clean', { exact: true }).count() > 0);
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createCleanPage(
      browser,
      { height: 844, width: 390 },
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

    await page.getByRole('button', { name: 'Open central Plus menu' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
    await addDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await addDialog.getByRole('button', { name: /^Note(?:\s|$)/u }).count(), 1);
    assert.equal(
      await addDialog.getByRole('button', { name: /^Photos(?:\s|$)/u }).isDisabled(),
      true,
    );
    assert.equal(
      await addDialog.getByRole('button', { name: /^Add Release Batch(?:\s|$)/u }).isEnabled(),
      true,
    );
    assert.equal(await addDialog.getByText('Import Work', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Field Copilot', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Create Assignment', { exact: true }).count(), 0);

    await addDialog.getByRole('button', { name: /^Add Release Batch(?:\s|$)/u }).click();
    await page.getByRole('heading', { name: 'Manual release review', exact: true }).waitFor();
    await page.getByLabel('Property contact').fill('Synthetic property contact');
    const unit101 = page.locator('.w2a2-core-release__unit').filter({ hasText: 'Unit 101' });
    await unit101.getByRole('checkbox').first().check();
    await page.getByRole('checkbox', {
      name: /I reviewed these selections against the property.s current release/u,
    }).check();
    const confirmRelease = page.getByRole('button', {
      name: 'Confirm personal release',
      exact: true,
    });
    await confirmRelease.evaluate((button) => {
      button.click();
      button.click();
    });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.waitForTimeout(750);
    const manualBatches = await page.evaluate((key) => {
      const stored = window.localStorage.getItem(key);
      if (!stored) return [];
      const data = JSON.parse(stored);
      return data.dailyReleaseBatches.filter((batch) => batch.sourceType === 'manual');
    }, storageKey);
    assert.equal(
      manualBatches.length,
      1,
      'rapid double-confirm created more than one local manual-release batch',
    );
    assert.equal(manualBatches[0].items.length, 1);

    await page.getByRole('button', { name: 'Open central Plus menu' }).click();
    await page.getByRole('dialog', { name: 'Add to Turn OS' })
      .getByRole('button', { name: /^Note(?:\s|$)/u })
      .click();
    const noteDialog = page.getByRole('dialog', { name: 'New Note' });
    await noteDialog.waitFor();
    await noteDialog.getByRole('textbox', { name: 'Note', exact: true })
      .fill('Synthetic accepted-core regression note.');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await primaryNavigation(page)
      .getByRole('button', { name: 'Activity', exact: true })
      .click();
    await page.getByText('Synthetic accepted-core regression note.', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Open central Plus menu' }).click();
    const releaseBatch = page.getByRole('dialog', { name: 'Add to Turn OS' })
      .getByRole('button', { name: /^Add Release Batch(?:\s|$)/u });
    assert.equal(await releaseBatch.isEnabled(), true);
    assert.equal(
      await page.getByRole('dialog', { name: 'Add to Turn OS' })
        .getByText('Import Work', { exact: true })
        .count(),
      0,
    );
    assert.equal(await page.getByText('Field Copilot', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Create Assignment', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();

    await primaryNavigation(page)
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    await page.getByRole('radio', { name: 'Dark', exact: true }).click();
    assert.equal(
      await page.locator('[data-testid="launch-command-center-shell"]').getAttribute('data-theme'),
      'dark',
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    assert.equal(
      await page.locator('[data-testid="launch-command-center-shell"]').getAttribute('data-theme'),
      'dark',
      'explicit theme preference did not persist',
    );
    await page.getByText('Official PDS Forms', { exact: true }).click();
    await page.getByRole('heading', { name: 'Official PDS Forms', exact: true }).waitFor();
    const officialFormsPage = page.getByTestId('official-pds-forms');
    const officialFormLinks = officialFormsPage.getByRole('link');
    assert.equal(await officialFormLinks.count(), 3);
    for (const link of await officialFormLinks.all()) {
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.match(await link.getAttribute('rel'), /noopener/u);
    }

    assert.deepEqual(findings, [], `core flow runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Wave 2A.2 accepted-core browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
