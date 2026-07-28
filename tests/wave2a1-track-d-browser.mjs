import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4217;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave1r-board-first/preview.html';

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
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="wave1r-shell"]');
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      shellClientWidth: shell?.clientWidth ?? 0,
      shellScrollWidth: shell?.scrollWidth ?? 0,
    };
  });

  assert.ok(
    dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
    `${label} document overflowed: ${dimensions.documentScrollWidth}px > ${dimensions.documentClientWidth}px.`,
  );
  assert.ok(
    dimensions.shellScrollWidth <= dimensions.shellClientWidth + 1,
    `${label} shell overflowed: ${dimensions.shellScrollWidth}px > ${dimensions.shellClientWidth}px.`,
  );
};

const assertCollapsedRows = async (page, label) => {
  const rows = page.getByTestId('wave1r-unit-row');
  assert.equal(await rows.count(), 4, `${label} did not render four synthetic Units.`);
  assert.equal(
    await page.locator('.w1r-unit-detail:visible').count(),
    0,
    `${label} expanded Unit detail by default.`,
  );

  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    assert.equal(
      await row.getByRole('button').count(),
      1,
      `${label} Unit row ${index} exposed a section or crew action while collapsed.`,
    );
    assert.equal(await row.getByTestId('wave2a1-paint-summary').count(), 1);
    assert.equal(await row.getByTestId('wave2a1-clean-summary').count(), 1);
    assert.equal(
      await row.locator('.w1r-detail-sections').count(),
      0,
      `${label} Unit row ${index} exposed Common/A-E cells while collapsed.`,
    );

    const target = await row.getByRole('button').boundingBox();
    assert.ok(target, `${label} Unit row ${index} disclosure had no bounds.`);
    assert.ok(
      target.height >= 44 && target.width >= 44,
      `${label} Unit row ${index} disclosure measured ${target.width}x${target.height}.`,
    );
  }
};

const assertBlueUnitIdentity = async (page, label) => {
  const unitColor = await page.getByTestId('wave2a1-unit-number').first().evaluate(
    (element) => getComputedStyle(element).color,
  );
  assert.equal(unitColor, 'rgb(18, 104, 211)', `${label} Unit number was not brand blue.`);
};

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a1-track-d-vite-cache',
  configFile: false,
  logLevel: 'error',
  server: { host, port, strictPort: true },
});

let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-320', viewport: { width: 320, height: 844 } },
    { name: 'iphone-390', viewport: { width: 390, height: 844 } },
    { name: 'iphone-430', viewport: { width: 430, height: 932 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    await assertCollapsedRows(page, target.name);
    await assertBlueUnitIdentity(page, target.name);
    await assertNoHorizontalOverflow(page, target.name);

    if (target.name === 'iphone-390') {
      const rowMetrics = await page.getByTestId('wave1r-unit-row').evaluateAll((rows) =>
        rows.map((row) => {
          const bounds = row.getBoundingClientRect();
          return {
            bottom: bounds.bottom,
            height: bounds.height,
            top: bounds.top,
          };
        }),
      );
      assert.ok(
        rowMetrics.slice(0, 3).every(({ bottom, height, top }) =>
          top >= 0 && bottom <= target.viewport.height && height <= 104),
        `iphone-390 did not show three compact Unit rows: ${JSON.stringify(rowMetrics)}.`,
      );
      await page.screenshot({
        path: '/private/tmp/wave2a1-track-d-after-390x844.png',
        fullPage: false,
      });
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });

  const row602 = page.getByTestId('wave1r-unit-row').filter({ hasText: 'Unit 602' });
  assert.match(await row602.getByTestId('wave2a1-paint-summary').innerText(), /Bluebird Paint/);
  assert.match(await row602.getByTestId('wave2a1-paint-summary').innerText(), /3\/5 ready for me/);
  assert.match(await row602.getByTestId('wave2a1-clean-summary').innerText(), /Cedar Clean/);
  assert.match(await row602.getByTestId('wave2a1-clean-summary').innerText(), /0\/5 inspected/);
  await row602.getByRole('button', { name: 'Open Unit 602', exact: true }).click();

  await page.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
  const tabs = page.getByRole('tablist', { name: 'Unit 602 detail' });
  for (const tabName of ['Paint', 'Clean', 'Waiting', 'Notes & History']) {
    assert.equal(
      await tabs.getByRole('tab', { name: tabName, exact: true }).count(),
      1,
      `Expanded detail was missing ${tabName}.`,
    );
  }
  assert.equal(await tabs.getByRole('tab', { name: 'Blockers', exact: true }).count(), 0);
  const paintSections = page.locator(
    '.w1r-detail-sections[aria-label="Paint sections for Unit 602"]',
  );
  assert.equal(await paintSections.count(), 1, 'Expanded Paint detail did not expose section actions.');
  assert.equal(await paintSections.getByRole('button').count(), 6);

  await tabs.getByRole('tab', { name: 'Waiting', exact: true }).click();
  await page.getByRole('heading', { name: 'Waiting', exact: true }).waitFor();
  await page.locator('.w1r-blocker-list:visible').getByText(/Occupied \/ restricted/).first().waitFor();

  await tabs.getByRole('tab', { name: 'Notes & History', exact: true }).click();
  await page.getByRole('heading', { name: 'Notes & History', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to TurnBoard', exact: true }).click();
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  await assertCollapsedRows(page, 'returned TurnBoard');
  await assertNoHorizontalOverflow(page, 'returned TurnBoard');

  assert.deepEqual(findings, [], `Track D interaction findings:\n${findings.join('\n')}`);
  await context.close();

  console.log('Wave 2A.1 Track D compact TurnBoard checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
