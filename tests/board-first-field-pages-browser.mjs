import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4187;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';

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

    await page.goto(`${baseUrl}/#/issues`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Open issues' }).count(), 1);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Issue entry should not occupy the board by default.');
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const issueDialog = page.getByRole('dialog', { name: 'Add issue' });
    await issueDialog.waitFor();
    assert.equal(await issueDialog.getByRole('textbox', { name: 'Issue title' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await issueDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Issues`);

    await page.goto(`${baseUrl}/#/crews`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Crew directory' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Crew entry should not occupy the directory by default.');
    await page.getByRole('button', { name: 'Add crew', exact: true }).click();
    const crewDialog = page.getByRole('dialog', { name: 'Add crew contact' });
    await crewDialog.waitFor();
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Name' }).count(), 1);
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Phone (optional)' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await crewDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Crew`);

    await page.goto(`${baseUrl}/#/unit/unit_101`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit check' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Beds' }).inputValue(), '3');
    assert.equal(await page.getByText('Manual unit details', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Status Board' }).count(), 0);
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const unitIssueDialog = page.getByRole('dialog', { name: 'Add issue to Unit 101' });
    await unitIssueDialog.waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await unitIssueDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Unit detail`);

    await page.goto(`${baseUrl}/#/unit/unit_103`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit 103', exact: true }).waitFor();
    await page.getByRole('button', { name: /Mark ready/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Cannot mark Unit 103 Ready yet' }).waitFor();
    assert.equal(await page.locator('.unit-overview__status').getByText('Access Blocked', { exact: true }).count(), 1);
    await page.getByText('Manual unit details', { exact: true }).click();
    const flooringSelect = page.locator('.unit-manual-details label.field').filter({ hasText: /^Flooring/ }).locator('select');
    const trashOutSelect = page.locator('.unit-manual-details label.field').filter({ hasText: /^Trash out/ }).locator('select');
    assert.equal(await flooringSelect.count(), 1);
    assert.equal(await trashOutSelect.count(), 1);
    assert.equal(await trashOutSelect.inputValue(), 'Blocked');
    const overallSelect = page.getByRole('combobox', { name: 'Overall', exact: true });
    await overallSelect.selectOption('Ready');
    await page.getByRole('alert').filter({ hasText: 'Cannot set Unit 103 to Ready manually' }).waitFor();
    assert.equal(await overallSelect.inputValue(), 'Access Blocked');
    await assertNoHorizontalOverflow(page, `${target.name} guarded Ready state`);

    await page.evaluate((key) => {
      const stored = JSON.parse(window.localStorage.getItem(key));
      stored.units = stored.units.map((unit) =>
        unit.id === 'unit_103'
          ? {
              ...unit,
              overallStatus: 'Ready',
              paintStatus: 'Complete',
              cleanStatus: 'Complete',
              repairStatus: 'Needed',
              inspectionStatus: 'Complete',
            }
          : unit,
      );
      window.localStorage.setItem(key, JSON.stringify(stored));
    }, storageKey);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('alert').filter({ hasText: 'Ready needs review.' }).waitFor();
    assert.equal(await page.locator('.unit-overview__status').getByText('Ready', { exact: true }).count(), 1);
    await assertNoHorizontalOverflow(page, `${target.name} contradictory Ready warning`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Board-first field pages passed on desktop, iPad, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
