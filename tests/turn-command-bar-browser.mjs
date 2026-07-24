import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4194;
const baseUrl = `http://${host}:${port}`;
const sourceText = 'Unit 202 paint is done.';

const targets = [
  { name: 'Mac', viewport: { width: 1440, height: 960 } },
  { name: 'iPad landscape', viewport: { width: 1180, height: 820 } },
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
];

const commandRoutes = [
  { name: 'Today', hash: '#/dashboard' },
  { name: 'TurnBoard', hash: '#/units' },
  { name: 'Queue', hash: '#/review' },
  { name: 'Unit workspace', hash: '#/units/unit_101' },
];

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
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

const assertSingleCommandSurface = async (page, label) => {
  const dialog = page.locator('.capture-workspace[role="dialog"]');
  await dialog.waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} rendered multiple Capture shells.`);
  assert.equal(await page.locator('[role="dialog"]').count(), 1, `${label} exposed multiple dialogs.`);
  assert.equal(
    await page.locator('main .page-title h1').filter({ hasText: 'Capture' }).count(),
    0,
    `${label} rendered a route-level Capture page beneath the overlay.`,
  );
};

const closeCommand = async (page, expectedHash, expectedFocusLabel, label) => {
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[role="dialog"]').count(), 0, `${label} needed more than one Close.`);
  assert.equal(await page.evaluate(() => window.location.hash), expectedHash, `${label} changed its origin route.`);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    expectedFocusLabel,
    `${label} did not restore focus to its command origin.`,
  );
};

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    for (const route of commandRoutes) {
      await page.goto(`${baseUrl}/${route.hash}`, { waitUntil: 'networkidle' });
      const commandBar = page.getByRole('region', { name: 'Turn OS command bar' });
      await commandBar.waitFor();
      assert.equal(await commandBar.count(), 1, `${target.name} ${route.name} did not have exactly one command bar.`);
      assert.equal(
        await commandBar.getByPlaceholder('Ask or update Turn OS…').count(),
        1,
        `${target.name} ${route.name} did not expose the shared command field.`,
      );
      assert.equal(
        await commandBar.getByRole('button', { name: 'Open Capture attachments', exact: true }).count(),
        1,
        `${target.name} ${route.name} did not expose one Plus action.`,
      );
      assert.equal(
        await commandBar.getByRole('button', { name: 'Open Capture', exact: true }).count(),
        1,
        `${target.name} ${route.name} did not expose one microphone action.`,
      );
      await assertNoHorizontalOverflow(page, `${target.name} ${route.name}`);
    }

    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
    const commandInput = page.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
    await commandInput.fill('101');
    const unitMatches = page.getByRole('listbox', { name: 'Current Turn Unit matches' });
    await unitMatches.waitFor();
    await unitMatches.getByRole('option', { name: /Unit 101/ }).click();
    await page.waitForFunction(() => window.location.hash === '#/units/unit_101');
    await page.getByText('Context: Unit 101', { exact: false }).waitFor();
    assert.equal(await page.locator('[role="dialog"]').count(), 0, 'Unit selection opened Capture or changed status.');

    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    const sourceInput = page.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
    await sourceInput.fill(sourceText);
    await sourceInput.press('Enter');
    await assertSingleCommandSurface(page, `${target.name} typed command`);
    await page.getByRole('button', { name: /UPDATE/ }).click();
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
      sourceText,
      `${target.name} lost typed command wording during handoff.`,
    );
    await closeCommand(
      page,
      '#/units',
      'Ask, update, or search Turn OS',
      `${target.name} typed command`,
    );

    const queuedSourceText = 'Unit 303 clean needs review.';
    await sourceInput.fill(queuedSourceText);
    await sourceInput.press('Enter');
    await assertSingleCommandSurface(page, `${target.name} protected in-memory source`);
    await page.getByText('Your earlier in-memory Capture is still here.', { exact: false }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
      sourceText,
      `${target.name} overwrote the earlier in-memory Capture.`,
    );
    assert.equal(
      await page.locator('.turn-command-bar input').inputValue(),
      queuedSourceText,
      `${target.name} lost the newer command wording while preserving the earlier Capture.`,
    );
    await closeCommand(
      page,
      '#/units',
      'Ask, update, or search Turn OS',
      `${target.name} protected in-memory source`,
    );
    await sourceInput.fill('');

    await page.getByRole('button', { name: 'Open Capture', exact: true }).click();
    await assertSingleCommandSurface(page, `${target.name} microphone entry`);
    await closeCommand(page, '#/units', 'Open Capture', `${target.name} microphone entry`);

    await page.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
    await assertSingleCommandSurface(page, `${target.name} Plus entry`);
    await closeCommand(
      page,
      '#/units',
      'Open Capture attachments',
      `${target.name} Plus entry`,
    );

    await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
    await assertSingleCommandSurface(page, `${target.name} legacy entry`);
    assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');
    await closeCommand(page, '#/dashboard', 'Open Capture', `${target.name} legacy entry`);

    if (target.name === 'iPhone') {
      const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' });
      for (const label of ['Today', 'TurnBoard', 'Queue', 'More']) {
        assert.equal(
          await primaryNav.getByRole('button', { name: label, exact: true }).count(),
          1,
          `iPhone primary navigation was missing ${label}.`,
        );
      }
      assert.equal(
        await primaryNav.getByRole('button', { name: 'Open Capture', exact: true }).count(),
        0,
        'iPhone retained a second Capture owner in primary navigation.',
      );
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Turn command bar passed on Mac, iPad landscape, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
