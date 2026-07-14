import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';

const storageKey = 'turn-supervisor-os:v0.1';
const host = '127.0.0.1';
const port = 4184;
const baseUrl = `http://${host}:${port}`;
const screenshotDirectory = await mkdtemp(path.join(tmpdir(), 'pds-playbooks-'));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify(seedData) },
  );
  const page = await context.newPage();
  const runtimeFindings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      runtimeFindings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => runtimeFindings.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const moreMenu = page.getByRole('dialog', { name: 'More' });
  await moreMenu.getByRole('button').filter({ hasText: 'Playbooks' }).click();

  await page.getByRole('heading', { name: 'Turn OS Playbooks', exact: true }).waitFor();
  assert.equal(page.url().endsWith('#/playbooks'), true);
  assert.equal(await page.locator('.playbook-card').count(), 3);
  assert.equal(await page.getByText('Opening one takes you to the existing screen; it never changes a Unit, Issue, or Crew record for you.', { exact: false }).count(), 1);
  assert.equal(await page.getByText('They are not official company procedures.', { exact: false }).count(), 1);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, 'Playbooks overflowed the iPhone viewport.');

  await page.waitForTimeout(650);
  const before = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), storageKey);
  const screenshot = path.join(screenshotDirectory, 'iphone-playbooks.png');
  await page.screenshot({ path: screenshot, fullPage: false });

  const blockerPlaybook = page.locator('.playbook-card').filter({ hasText: 'Handle a blocker' });
  await blockerPlaybook.getByRole('button', { name: /Review Issues/ }).click();
  await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
  await page.waitForTimeout(650);
  const after = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), storageKey);
  assert.deepEqual(after, before);
  assert.deepEqual(runtimeFindings, [], `Playbooks runtime findings:\n${runtimeFindings.join('\n')}`);
  console.log(JSON.stringify({ screenshot }));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
