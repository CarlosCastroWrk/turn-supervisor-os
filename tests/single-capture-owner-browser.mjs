import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4191;
const baseUrl = `http://${host}:${port}`;
const sourceText = 'Unit 202 paint is done.';
const attachmentName = 'unit-202-field-note.txt';

const viewports = [
  { name: 'Mac', width: 1440, height: 960 },
  { name: 'iPad landscape', width: 1180, height: 820 },
  { name: 'iPhone', width: 390, height: 844 },
];

const origins = [
  { name: 'Review', hash: '#/review' },
  { name: 'Legacy Unit 202', hash: '#/units/unit_202' },
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

const currentHash = (page) => page.evaluate(() => window.location.hash);

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

const assertSingleCapture = async (page, label) => {
  const dialog = page.locator('.capture-workspace[role="dialog"]');
  await dialog.waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} rendered more than one Capture shell.`);
  assert.equal(await page.locator('[role="dialog"]').count(), 1, `${label} exposed more than one accessible dialog.`);
  assert.equal(
    await page.locator('main .page-title h1').filter({ hasText: 'Capture' }).count(),
    0,
    `${label} left the route-level Capture page under the overlay.`,
  );
  assert.equal(
    await page.locator('input[type="file"][multiple][accept*=".csv"]').count(),
    1,
    `${label} mounted more than one Capture attachment owner.`,
  );
  assert.notEqual(await currentHash(page), '#/copilot', `${label} did not normalize the legacy Capture route.`);
};

const assertNativePlus = async (page, expectedHash, label) => {
  await page.getByRole('button', { name: 'Open central Plus menu', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
  await dialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1, `${label} stacked Add dialogs.`);
  assert.equal(await page.locator('.capture-workspace').count(), 0, `${label} opened legacy Capture from the primary Plus.`);
  await dialog.getByRole('button', { name: 'Close Add to Turn OS', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog').count(), 0, `${label} left an Add dialog after one close.`);
  assert.equal(await currentHash(page), expectedHash, `${label} changed route while dismissing Add.`);
  await page.waitForFunction(
    () => document.activeElement?.id === 'lcc-central-plus',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'lcc-central-plus',
    `${label} did not restore focus to the invoking Plus control.`,
  );

  await page.keyboard.press('Enter');
  await dialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1, `${label} stacked Add dialogs after keyboard reopen.`);
  assert.equal(await currentHash(page), expectedHash, `${label} changed route while reopening Add.`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog').count(), 0, `${label} left an Add dialog after Escape.`);
  await page.waitForFunction(
    () => document.activeElement?.id === 'lcc-central-plus',
  );
};

const openLegacyCapture = async (page, label) => {
  await page.evaluate(() => {
    window.location.hash = '#/copilot';
  });
  await assertSingleCapture(page, label);
};

const closeCaptureOnce = async (
  page,
  expectedHash,
  label,
  expectedFocusLabel = 'Open central Plus menu',
) => {
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[role="dialog"]').count(), 0, `${label} still had a dialog after one close.`);
  assert.equal(await currentHash(page), expectedHash, `${label} did not restore its origin route.`);
  await page.waitForFunction(
    (focusLabel) => document.activeElement?.getAttribute('aria-label') === focusLabel,
    expectedFocusLabel,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    expectedFocusLabel,
    `${label} did not return focus to its visible Capture trigger.`,
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

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    for (const origin of origins) {
      await page.goto(`${baseUrl}/${origin.hash}`, { waitUntil: 'networkidle' });
      const label = `${viewport.name} ${origin.name}`;
      await assertNativePlus(page, origin.hash, label);
      await assertNoHorizontalOverflow(page, `${label} Add`);
    }

    await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
    const legacyLabel = `${viewport.name} legacy bookmark`;
    await assertSingleCapture(page, legacyLabel);
    assert.equal(await currentHash(page), '#/dashboard', `${legacyLabel} did not choose Home as its safe origin.`);
    await closeCaptureOnce(page, '#/dashboard', legacyLabel);

    assert.deepEqual(findings, [], `${viewport.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const refreshContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const refreshPage = await refreshContext.newPage();
  const refreshFindings = attachRuntimeChecks(refreshPage);
  await refreshPage.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
  await refreshPage.evaluate(() => window.history.replaceState(null, '', '#/copilot'));
  await refreshPage.reload({ waitUntil: 'networkidle' });
  await assertSingleCapture(refreshPage, 'refreshed legacy bookmark');
  assert.equal(await currentHash(refreshPage), '#/dashboard');
  await closeCaptureOnce(refreshPage, '#/dashboard', 'refreshed legacy bookmark');
  assert.deepEqual(refreshFindings, [], `Refresh runtime findings:\n${refreshFindings.join('\n')}`);
  await refreshContext.close();

  const historyContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const historyPage = await historyContext.newPage();
  const historyFindings = attachRuntimeChecks(historyPage);
  await historyPage.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
  await historyPage.evaluate(() => {
    window.history.pushState(null, '', '#/units/unit_202');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await historyPage.waitForFunction(() => window.location.hash === '#/units/unit_202');
  await openLegacyCapture(historyPage, 'browser history legacy entry');
  await historyPage.goBack();
  await historyPage.waitForFunction(() => window.location.hash === '#/units/unit_202');
  await historyPage.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await historyPage.locator('[role="dialog"]').count(), 0, 'Browser Back left Capture stacked over the Unit.');
  await historyPage.goBack();
  await historyPage.waitForFunction(() => window.location.hash === '#/review');
  await historyPage.goForward();
  await historyPage.waitForFunction(() => window.location.hash === '#/units/unit_202');
  assert.equal(await historyPage.locator('[role="dialog"]').count(), 0, 'Browser Forward reopened Capture unexpectedly.');
  assert.deepEqual(historyFindings, [], `History runtime findings:\n${historyFindings.join('\n')}`);
  await historyContext.close();

  const sessionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sessionPage = await sessionContext.newPage();
  const sessionFindings = attachRuntimeChecks(sessionPage);
  await sessionPage.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
  await sessionPage.getByRole('button', { name: /UPDATE/ }).click();
  await sessionPage.getByRole('button', { name: 'Type', exact: true }).click();
  await sessionPage.getByRole('textbox', { name: 'Capture wording', exact: true }).fill(sourceText);
  await sessionPage.locator('input[type="file"][multiple][accept*=".csv"]').setInputFiles({
    name: attachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic field note only.'),
  });
  await sessionPage.getByText(attachmentName, { exact: true }).waitFor();
  await closeCaptureOnce(sessionPage, '#/dashboard', 'in-memory source close');

  await openLegacyCapture(sessionPage, 'reopened in-memory source');
  assert.equal(
    await sessionPage.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    sourceText,
    'Source text was lost after closing and reopening Capture.',
  );
  await sessionPage.getByText(attachmentName, { exact: true }).waitFor();

  await sessionPage.getByRole('button', { name: 'Back', exact: true }).click();
  await sessionPage.getByRole('group', { name: 'What do you want to capture?' }).waitFor();
  assert.equal(await sessionPage.locator('[role="dialog"]').count(), 1, 'Internal Back exited or stacked Capture.');
  assert.equal(await currentHash(sessionPage), '#/dashboard', 'Internal Back changed the safe route.');
  await sessionPage.getByRole('button', { name: /UPDATE/ }).click();
  await sessionPage.getByRole('button', { name: 'Type', exact: true }).click();
  assert.equal(
    await sessionPage.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    sourceText,
    'Internal Back discarded source text.',
  );
  await sessionPage.getByText(attachmentName, { exact: true }).waitFor();

  await sessionPage.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await sessionPage.getByRole('heading', { name: 'Confirm your exact wording', exact: true }).waitFor();
  await sessionPage.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(
    await sessionPage.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    sourceText,
    'Review Back discarded source text.',
  );
  await sessionPage.getByText(attachmentName, { exact: true }).waitFor();
  await sessionPage.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await sessionPage.getByRole('button', { name: 'Create drafts', exact: true }).click();
  await sessionPage.getByRole('heading', { name: 'Draft review ready', exact: true }).waitFor();
  await sessionPage.getByRole('heading', { name: /Added to Review/ }).waitFor();
  await closeCaptureOnce(sessionPage, '#/dashboard', 'Draft result close');

  await openLegacyCapture(sessionPage, 'reopened Draft result');
  await sessionPage.getByRole('heading', { name: 'Draft review ready', exact: true }).waitFor();
  const preservedResultSource = sessionPage.locator('.capture-result-card__source p');
  await preservedResultSource.waitFor();
  const preservedResultText = (await preservedResultSource.textContent())?.trim() ?? '';
  assert.match(preservedResultText, /Unit 202 paint is done\./, 'Completed Draft result lost its source wording.');
  assert.match(preservedResultText, /unit-202-field-note\.txt/, 'Completed Draft result lost its attachment reference.');
  assert.match(preservedResultText, /Synthetic field note only\./, 'Completed Draft result lost its attachment text.');
  await closeCaptureOnce(sessionPage, '#/dashboard', 'reopened Draft result');
  assert.deepEqual(sessionFindings, [], `Session runtime findings:\n${sessionFindings.join('\n')}`);
  await sessionContext.close();

  console.log('Single Capture owner browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
