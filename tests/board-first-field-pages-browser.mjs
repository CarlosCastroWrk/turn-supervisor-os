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

const assertBoardNavigation = async (page, label) => {
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  for (const destination of ['TurnBoard', 'Activity', 'More']) {
    assert.equal(
      await navigation.getByRole('button', { name: destination, exact: true }).count(),
      1,
      `${label} was missing ${destination}.`,
    );
  }
  assert.equal(
    await navigation.getByRole('button', { name: /Today|Queue/ }).count(),
    0,
    `${label} retained a superseded primary destination.`,
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
    await page.getByText('Paper remains authoritative', { exact: true }).waitFor();
    await assertBoardNavigation(page, `${target.name} TurnBoard`);
    assert.equal(await page.getByTestId('wave1r-unit-row').count(), 6);
    assert.equal(await page.getByLabel('Search TurnBoard Units or crew', { exact: true }).count(), 1);
    const filters = page.getByRole('group', { name: 'Filter TurnBoard Units', exact: true });
    for (const label of ['All', 'Needs Me', 'Assignment conflict']) {
      assert.equal(
        await filters.getByRole('button', { name: new RegExp(`^${label}\\b`) }).count(),
        1,
        `${target.name} TurnBoard was missing the ${label} filter.`,
      );
    }
    assert.equal(
      await page.getByRole('region', { name: 'Turn OS command bar' }).count(),
      0,
      'BoardFirst rendered the superseded legacy command bar.',
    );
    assert.equal(
      await page.getByRole('button', {
        name: /property accepted|property rejected|PDS Approved|mark done/i,
      }).count(),
      0,
      'TurnBoard exposed an unauthorized operational mutation.',
    );
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);

    await page.getByRole('button', { name: 'Open Unit 101', exact: true }).click();
    await page.waitForFunction(() => window.location.hash === '#/units/unit_101');
    await page.getByRole('heading', { name: 'Unit 101', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Paint', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Clean', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Opening Unit 101 opened a dialog.');
    assert.equal(
      await page.getByTestId('wave1r-unit-row').count(),
      6,
      'Opening a Unit unmounted the compact TurnBoard list.',
    );
    await assertNoHorizontalOverflow(page, `${target.name} Unit 101`);

    await page.goBack();
    await page.waitForFunction(() => window.location.hash === '#/units');
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'Activity', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Activity`);

    await page.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    for (const destination of ['Crews', 'Reports', 'Setup', 'Backup', 'Sync']) {
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`^${destination}\\b`) }).count(),
        1,
        `${target.name} BoardFirst More was missing ${destination}.`,
      );
    }
    await assertNoHorizontalOverflow(page, `${target.name} More`);

    await page.goto(`${baseUrl}/#/issues`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Issues opened a dialog by default.');
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const issueDialog = page.getByRole('dialog', { name: 'Add issue', exact: true });
    await issueDialog.waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await issueDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Issues`);

    await page.goto(`${baseUrl}/#/crews`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Crew directory' }).waitFor();
    await page.getByRole('button', { name: 'Add crew', exact: true }).click();
    const crewDialog = page.getByRole('dialog', { name: 'Add crew contact', exact: true });
    await crewDialog.waitFor();
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Phone (optional)' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await crewDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Crew`);

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Turn OS command bar' }).count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} Review`);

    await page.goto(`${baseUrl}/#/sync`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sync & diagnostics', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Local-only mode', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Sync diagnostics`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const hostRoutes = [
    { button: 'Crews', hash: '#/crews', heading: 'Crew directory' },
    { button: 'Reports', hash: '#/reports', heading: 'Daily Report' },
    { button: 'Setup', hash: '#/setup', heading: 'Project Setup' },
    { button: 'Backup', hash: '#/export', heading: 'Export / Backup' },
    { button: 'Sync', hash: '#/sync', heading: 'Sync & diagnostics' },
  ];
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hostPage = await hostContext.newPage();
  const hostFindings = attachRuntimeChecks(hostPage);
  for (const route of hostRoutes) {
    await hostPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await hostPage.getByRole('navigation', { name: 'Primary' })
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await hostPage.getByRole('button', { name: new RegExp(`^${route.button}\\b`) }).click();
    await hostPage.waitForFunction((hash) => window.location.hash === hash, route.hash);
    await hostPage.getByRole('heading', { name: route.heading, exact: true }).waitFor();
  }
  assert.deepEqual(hostFindings, [], `BoardFirst host-route findings:\n${hostFindings.join('\n')}`);
  await hostContext.close();

  for (const width of [320, 375, 430, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);
    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${width}px TurnBoard`);
    const searchBox = await page.getByLabel('Search TurnBoard Units or crew', { exact: true }).boundingBox();
    assert.ok(
      searchBox && searchBox.height >= 44,
      `${width}px TurnBoard search target was smaller than 44px.`,
    );
    assert.deepEqual(findings, [], `${width}px TurnBoard runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('BoardFirst and preserved field pages passed on desktop, iPad, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
