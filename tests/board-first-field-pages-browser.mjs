import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4187;
const baseUrl = `http://${host}:${port}`;

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
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

const assertFieldNavigation = async (page, label) => {
  const navigation = page.getByRole('navigation', { name: 'Turn OS navigation' });
  for (const destination of ['Today', 'TurnBoard', 'More']) {
    assert.equal(
      await navigation.getByRole('button', { name: destination, exact: true }).count(),
      1,
      `${label} was missing ${destination}.`,
    );
  }
  assert.equal(
    await navigation.getByRole('button', { name: 'Queue', exact: true }).count(),
    0,
    `${label} retained Queue as permanent navigation.`,
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

  for (const target of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'ipad', viewport: { width: 1024, height: 768 } },
    { name: 'iphone', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await page.getByText('Personal Paint/Clean view · verify official work on paper', { exact: true }).waitFor();
    await assertFieldNavigation(page, `${target.name} TurnBoard`);
    assert.equal(await page.locator('.jul28-unit-card').count(), 4);
    assert.equal(await page.locator('.quick-status-row').count(), 0, 'TurnBoard exposed a legacy direct-status control.');
    assert.equal(await page.getByPlaceholder('Search units or crew').count(), 1);
    assert.equal(await page.getByRole('region', { name: 'Turn OS command bar' }).count(), 1);

    await page.getByRole('button', { name: 'Open Unit 602 workspace', exact: true }).click();
    await page.waitForFunction(() => window.location.hash === '#/units/jul28-unit-602');
    const selectedWorkspace = page.getByRole('complementary', { name: 'Selected Unit workspace' });
    await selectedWorkspace.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
    await page.getByText('Paper TurnBoard remains authoritative.', { exact: true }).waitFor();
    await page.getByText('Wave 1 · read only', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Paint and Clean', exact: true }).count(), 1);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Opening a Unit workspace opened a dialog.');
    await assertNoHorizontalOverflow(page, `${target.name} Unit 602 workspace`);

    await page.goBack({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/units');

    const unit603Button = page.getByRole('button', { name: 'Open Unit 603 workspace', exact: true });
    await unit603Button.click();
    await selectedWorkspace.getByRole('heading', { name: 'Unit 603', exact: true }).waitFor();
    if (target.viewport.width < 820) {
      await page.getByRole('button', { name: 'Close Unit workspace and return to TurnBoard list', exact: true }).click();
      await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.location.hash), '#/units');
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('aria-label') === 'Open Unit 603 workspace',
      );
    } else {
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => window.location.hash), '#/units');
    }

    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    await page.getByText('Juniper House (Synthetic)', { exact: true }).first().waitFor();
    await page.getByRole('heading', { name: 'Needs Me', exact: true }).waitFor();
    await page.getByRole('heading', { name: "Today's work", exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Keep the day aligned', exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid="recent-activity"]').getAttribute('open'), null);
    await assertFieldNavigation(page, `${target.name} Today`);

    await page.getByRole('button', { name: /Open Needs Me/ }).click();
    const needsMe = page.getByRole('dialog', { name: 'Needs Me' });
    await needsMe.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await needsMe.getByRole('button', { name: /Unit 603, Section C, Clean/ }).click();
    await page.getByRole('complementary', { name: 'Selected Unit workspace' })
      .getByRole('heading', { name: 'Unit 603', exact: true })
      .waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/units/jul28-unit-603');

    await page.goto(`${baseUrl}/#/issues`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Issue entry occupied the board by default.');
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const issueDialog = page.getByRole('dialog', { name: 'Add issue' });
    await issueDialog.waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await issueDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Issues`);

    await page.goto(`${baseUrl}/#/crews`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Crew directory' }).waitFor();
    await page.getByRole('button', { name: 'Add crew', exact: true }).click();
    const crewDialog = page.getByRole('dialog', { name: 'Add crew contact' });
    await crewDialog.waitFor();
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Phone (optional)' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await crewDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Crew`);

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Turn OS command bar' }).count(), 1);
    await assertFieldNavigation(page, `${target.name} Review`);
    await assertNoHorizontalOverflow(page, `${target.name} Review`);

    await page.goto(`${baseUrl}/#/sync`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sync & diagnostics', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Local-only mode', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Sync diagnostics`);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    const moreDialog = page.getByRole('dialog', { name: 'More' });
    await moreDialog.waitFor();
    for (const destination of ['Crew / People', 'Reports', 'Setup', 'Data & backup', 'Sync & diagnostics']) {
      assert.equal(
        await moreDialog.getByRole('button', { name: new RegExp(`^${destination}`) }).count(),
        1,
        `${target.name} More was missing ${destination}.`,
      );
    }
    assert.equal(await moreDialog.getByRole('button', { name: /^Training/ }).count(), 0);
    await page.getByRole('button', { name: 'Close More', exact: true }).click();
    await moreDialog.waitFor({ state: 'hidden' });

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  for (const width of [320, 375, 430, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);
    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${width}px TurnBoard`);
    assert.deepEqual(findings, [], `${width}px TurnBoard runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Wave 1 field pages passed on desktop, iPad, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
