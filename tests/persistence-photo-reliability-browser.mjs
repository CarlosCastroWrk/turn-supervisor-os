import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';

const host = '127.0.0.1';
const port = 4197;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';
const initialData = structuredClone(seedData);
const unit = initialData.units.find((item) => item.projectId === initialData.activeProjectId);
assert.ok(unit);

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
      let failAppDataWrites = false;
      let failPhotoWrites = false;
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(storageKey, storageValue) {
        if (storageKey === key && failAppDataWrites) {
          throw new DOMException('QA app storage full', 'QuotaExceededError');
        }
        return originalSetItem.call(this, storageKey, storageValue);
      };

      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function put(...args) {
        if (failPhotoWrites) {
          throw new DOMException('QA photo storage unavailable', 'InvalidStateError');
        }
        return originalPut.apply(this, args);
      };

      window.__PDS_RELIABILITY_QA__ = {
        failAppDataWrites: (fail) => { failAppDataWrites = fail; },
        failPhotoWrites: (fail) => { failPhotoWrites = fail; },
      };
    },
    { key: storageKey, value: JSON.stringify(initialData) },
  );

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(650);

  const supervisor = page.getByLabel('Supervisor', { exact: true }).last();
  const originalSupervisor = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).projects
    .find((project) => project.id === initialData.activeProjectId).supervisorName;
  await page.evaluate(() => window.__PDS_RELIABILITY_QA__.failAppDataWrites(true));
  await supervisor.fill('QA Unsaved Supervisor');
  await supervisor.press('Tab');

  const unsavedAlert = page.getByRole('alert').filter({ hasText: 'Changes are not saved on this device' });
  await unsavedAlert.waitFor();
  assert.match(await unsavedAlert.textContent(), /latest changes are still in memory/i);
  assert.equal(
    JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).projects
      .find((project) => project.id === initialData.activeProjectId).supervisorName,
    originalSupervisor,
  );

  await unsavedAlert.getByRole('button', { name: 'Retry save', exact: true }).click();
  await unsavedAlert.waitFor();
  await page.evaluate(() => window.__PDS_RELIABILITY_QA__.failAppDataWrites(false));
  await unsavedAlert.getByRole('button', { name: 'Retry save', exact: true }).click();
  await unsavedAlert.waitFor({ state: 'detached' });
  assert.equal(
    JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).projects
      .find((project) => project.id === initialData.activeProjectId).supervisorName,
    'QA Unsaved Supervisor',
  );

  await page.goto(`${baseUrl}/#/unit/${encodeURIComponent(unit.id)}`, { waitUntil: 'networkidle' });
  const photoCountBefore = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).photoNotes.length;
  await page.evaluate(() => window.__PDS_RELIABILITY_QA__.failPhotoWrites(true));
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('.photo-capture input[type="file"]').setInputFiles({
    name: 'qa-photo.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });

  const failedPhoto = page.getByRole('group', { name: 'Failed photo' });
  await failedPhoto.waitFor();
  assert.match(await failedPhoto.textContent(), /not saved/i);
  assert.equal(await failedPhoto.getByRole('button', { name: 'Retry photo', exact: true }).count(), 1);
  assert.equal(await failedPhoto.getByRole('button', { name: 'Remove', exact: true }).count(), 1);
  assert.equal(
    JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).photoNotes.length,
    photoCountBefore,
  );
  assert.equal(await page.getByText(/Photo saved offline on this device/i).count(), 0);

  const quickNote = page.getByLabel('Quick note', { exact: true });
  await quickNote.fill('QA normal write after failed photo');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.waitForTimeout(650);
  assert.match(
    JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).units
      .find((item) => item.id === unit.id).notes,
    /QA normal write after failed photo/,
  );
  await failedPhoto.waitFor();

  await page.evaluate(() => window.__PDS_RELIABILITY_QA__.failPhotoWrites(false));
  await failedPhoto.getByRole('button', { name: 'Retry photo', exact: true }).click();
  await failedPhoto.waitFor({ state: 'detached' });
  await page.getByText(/Photo saved offline on this device/i).waitFor();
  const savedData = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), storageKey));
  assert.equal(savedData.photoNotes.length, photoCountBefore + 1);
  assert.equal(savedData.photoNotes[0].imageData, undefined);
  assert.deepEqual(pageErrors, []);

  await context.close();
  console.log('Persistence and photo reliability browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
