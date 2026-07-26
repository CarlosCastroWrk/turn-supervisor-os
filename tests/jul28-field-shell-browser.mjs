import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4194;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/jul28-field-shell/preview.html';

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});

let browser;

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

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone', viewport: { width: 390, height: 844 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        findings.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'July 28 Field Shell Candidate');
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    await page.getByLabel('Turn OS, Supervisor').waitFor();

    for (const label of ['Today', 'TurnBoard', 'More']) {
      assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1);
    }
    assert.equal(await page.getByRole('button', { name: 'Queue', exact: true }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Turn OS command bar' }).count(), 1);
    assert.equal(await page.locator('[data-command-owner="external"]').count(), 1);

    const touchTargets = page.locator('[data-j28-touch="true"]:visible');
    const touchTargetCount = await touchTargets.count();
    assert.ok(touchTargetCount > 0);
    for (let index = 0; index < touchTargetCount; index += 1) {
      const box = await touchTargets.nth(index).boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44, `${target.name} touch target ${index} was smaller than 44px.`);
    }

    const bell = page.getByRole('button', { name: /Open Needs Me/ });
    await bell.click();
    const needsDialog = page.getByRole('dialog', { name: 'Needs Me' });
    await needsDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close Needs Me');
    await page.keyboard.press('Escape');
    await needsDialog.waitFor({ state: 'hidden' });
    assert.match(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), /Open Needs Me/);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    const moreDialog = page.getByRole('dialog', { name: 'More' });
    await moreDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await moreDialog.getByRole('button', { name: /Reports/ }).click();
    await moreDialog.waitFor({ state: 'hidden' });
    await page.getByText('Selected Reports.', { exact: true }).waitFor();

    await page.getByRole('button', { name: /Open personal task: Unit 602/ }).click();
    await page.getByText('Personal task opened: Unit 602, Paint walk.', { exact: true }).waitFor();

    const pageText = await page.locator('body').innerText();
    assert.doesNotMatch(pageText, /PDS Approved|payroll|client approval|officially complete/i);
    assert.doesNotMatch(pageText, /\bdone\b/i);
    await assertNoHorizontalOverflow(page, target.name);
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);

    await page.screenshot({ path: `/private/tmp/jul28-field-shell-${target.name}.png`, fullPage: true });
    await context.close();
  }

  const reducedMotionContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reducedMotionPage = await reducedMotionContext.newPage();
  await reducedMotionPage.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
  await reducedMotionPage.getByRole('button', { name: /Open Needs Me/ }).click();
  const animationDuration = await reducedMotionPage.getByRole('dialog', { name: 'Needs Me' })
    .evaluate((element) => getComputedStyle(element).animationDuration);
  assert.ok(Number.parseFloat(animationDuration) <= 0.0001, `Reduced motion duration was ${animationDuration}.`);
  await reducedMotionContext.close();

  console.log('July 28 field shell passed responsive and accessibility browser checks.');
} finally {
  await browser?.close();
  await server.close();
}
