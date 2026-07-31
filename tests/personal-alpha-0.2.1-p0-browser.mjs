import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { seedData } from '../src/data/seed.ts';

const baseUrl = process.env.PDS_BASE_URL ?? 'http://127.0.0.1:4174';
const storageKey = 'turn-supervisor-os:v0.1';
const projectId = seedData.activeProjectId;
const localDate = (date) => new Date(
  date.getTime() - date.getTimezoneOffset() * 60_000,
).toISOString().slice(0, 10);
const nowDate = new Date();
const dayTwoDate = localDate(nowDate);
const dayOneDate = localDate(new Date(nowDate.getTime() - 86_400_000));

const cloneSeed = () => structuredClone(seedData);

const release = (id, date, confirmedAt, unitId, trade = 'paint') => ({
  confirmedAt,
  confirmedBy: 'Los',
  createdAt: confirmedAt,
  date,
  id,
  items: [{
    id: `${id}:item:1`,
    section: 'A',
    sourceExcerpt: 'Explicit browser-gate release.',
    trade,
    unitId,
  }],
  projectId,
  propertyContact: 'Property contact',
  sourceLabel: 'Browser gate manual release',
  sourceType: 'manual',
  status: 'confirmed',
  uncertainties: [],
  updatedAt: confirmedAt,
});

const day = (id, date, status, releaseBatchIds, startedAt, endedAt) => ({
  activeCleanCrewIds: ['crew_cleaner'],
  activePaintCrewIds: ['crew_painter'],
  createdAt: startedAt,
  date,
  ...(endedAt ? { endedAt, endKeyStatus: 'yes', endNote: 'Closed by browser fixture.' } : {}),
  id,
  keyStatus: 'yes',
  morningNote: '',
  projectId,
  propertyContact: 'Property contact',
  releaseBatchIds,
  startedAt,
  startedBy: 'Los',
  status,
  updatedAt: endedAt ?? startedAt,
});

const fieldEvent = (id, daySessionId, eventType, recordedAt) => ({
  actorId: 'Los',
  actorType: 'los',
  boundary: 'personal-record',
  daySessionId,
  eventType,
  id,
  projectId,
  recordedAt,
  recordedBy: 'Los',
  ...(eventType === 'assignment-confirmed' ? { reportedBy: 'crew_painter' } : {}),
  section: 'A',
  sourceType: 'personal-confirmation',
  summary: eventType,
  trade: 'paint',
  unitId: 'unit_101',
});

const buildSupervisorFixture = () => {
  const data = cloneSeed();
  // The operator fixture represents an activated personal project, not the
  // demo, so the shell opens the operational Home rather than onboarding.
  data.projects = data.projects.map((project) =>
    project.id === projectId ? { ...project, mode: 'real' } : project);
  const dayOneRelease = release(
    'browser-day-1-release',
    dayOneDate,
    `${dayOneDate}T13:00:00.000Z`,
    'unit_101',
  );
  const dayTwoRelease = release(
    'browser-day-2-release',
    dayTwoDate,
    `${dayTwoDate}T13:00:00.000Z`,
    'unit_102',
    'clean',
  );
  data.dailyReleaseBatches = [dayOneRelease, dayTwoRelease];
  data.daySessions = [
    day(
      'browser-day-1',
      dayOneDate,
      'closed',
      [dayOneRelease.id],
      `${dayOneDate}T12:00:00.000Z`,
      `${dayOneDate}T22:00:00.000Z`,
    ),
    day(
      'browser-day-2',
      dayTwoDate,
      'active',
      [dayTwoRelease.id],
      `${dayTwoDate}T12:00:00.000Z`,
    ),
  ];
  data.fieldEvents = [
    fieldEvent('browser-assignment', 'browser-day-1', 'assignment-confirmed', `${dayOneDate}T14:00:00.000Z`),
    fieldEvent('browser-work-started', 'browser-day-1', 'work-started', `${dayOneDate}T15:00:00.000Z`),
    fieldEvent('browser-crew-complete', 'browser-day-1', 'crew-reported-complete', `${dayOneDate}T16:00:00.000Z`),
    fieldEvent('browser-los-pass', 'browser-day-1', 'los-passed', `${dayOneDate}T17:00:00.000Z`),
  ];
  data.walkSessions = [{
    createdAt: `${dayTwoDate}T15:00:00.000Z`,
    daySessionId: 'browser-day-2',
    id: 'browser-active-walk',
    outcomes: [],
    projectId,
    propertyContact: 'Property contact',
    selectedItemIds: [dayOneRelease.items[0].id],
    startedAt: `${dayTwoDate}T15:00:00.000Z`,
    startedBy: 'Los',
    status: 'active',
    updatedAt: `${dayTwoDate}T15:00:00.000Z`,
  }];
  return data;
};

const assertNoOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const browser = await chromium.launch({ headless: true });
const runtimeErrors = [];
const fixture = buildSupervisorFixture();

try {
  const context = await browser.newContext({
    colorScheme: 'light',
    viewport: { height: 844, width: 390 },
  });
  await context.addInitScript(
    ({ key, value }) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, value);
      }
    },
    { key: storageKey, value: JSON.stringify(fixture) },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const html = await page.content();
  assert.match(html, /\/assets\/index-[^"]+\.js/u);
  assert.doesNotMatch(html, /@vite\/client/u);
  await assertNoOverflow(page, 'Home at 390px');

  const importButton = page.getByRole('button', {
    name: 'Import today’s work',
    exact: true,
  });
  assert.equal(await importButton.count(), 1);
  await importButton.click();
  await page.getByPlaceholder('Who confirmed today’s release?').fill('Property contact');
  const unitCard = page.locator('.w2a2-core-release__unit').filter({
    hasText: 'Unit 103',
  });
  assert.equal(await unitCard.count(), 1);
  const selection = unitCard.getByRole('checkbox', { name: 'B Clean', exact: true });
  assert.equal(await selection.count(), 1);
  await selection.check();
  await page.getByRole('checkbox', {
    name: 'I reviewed these selections against the property’s current release. Paper remains authoritative.',
    exact: true,
  }).check();
  await page.getByRole('button', {
    name: 'Confirm personal release',
    exact: true,
  }).click();
  await page.getByText('Midday release saved', { exact: true }).waitFor();

  const storedAfterMidday = JSON.parse(
    await page.evaluate((key) => window.localStorage.getItem(key), storageKey),
  );
  const activeDay = storedAfterMidday.daySessions.find(
    (session) => session.id === 'browser-day-2',
  );
  const middayBatch = storedAfterMidday.dailyReleaseBatches.find(
    (batch) => batch.items.some((item) =>
      item.unitId === 'unit_103' && item.section === 'B' && item.trade === 'clean'),
  );
  assert.ok(middayBatch);
  assert.ok(activeDay.releaseBatchIds.includes(middayBatch.id));
  assert.equal(
    storedAfterMidday.fieldEvents.filter((event) =>
      event.id === `${middayBatch.id}:daily-release-confirmed`).length,
    1,
  );

  await page.reload({ waitUntil: 'networkidle' });
  const storedAfterReload = JSON.parse(
    await page.evaluate((key) => window.localStorage.getItem(key), storageKey),
  );
  assert.equal(
    storedAfterReload.dailyReleaseBatches.filter((batch) =>
      batch.id === middayBatch.id).length,
    1,
  );
  assert.ok(
    storedAfterReload.daySessions
      .find((session) => session.id === 'browser-day-2')
      .releaseBatchIds.includes(middayBatch.id),
  );

  const endDayButton = page.getByRole('button').filter({ hasText: 'End day' });
  assert.equal(await endDayButton.count(), 1);
  await endDayButton.click();
  await page.getByText(
    'Finish or defer the active property walk before ending the day.',
    { exact: true },
  ).waitFor();
  for (const action of ['Return to Active Walk', 'End Walk', 'Cancel End Day']) {
    assert.equal(
      await page.getByRole('button', { name: action, exact: true }).count(),
      1,
    );
  }
  assert.equal(
    await page.evaluate((key) => {
      const data = JSON.parse(window.localStorage.getItem(key));
      return data.daySessions.find((session) => session.id === 'browser-day-2').status;
    }, storageKey),
    'active',
  );
  await context.close();

  const corruptData = cloneSeed();
  corruptData.units = [corruptData.units[0], structuredClone(corruptData.units[0])];
  const corruptRaw = JSON.stringify(corruptData);
  const recoveryContext = await browser.newContext({
    colorScheme: 'dark',
    acceptDownloads: true,
    viewport: { height: 700, width: 320 },
  });
  await recoveryContext.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: corruptRaw },
  );
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.on('pageerror', (error) =>
    runtimeErrors.push(`recovery pageerror: ${error.message}`));
  await recoveryPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await recoveryPage.getByTestId('recovery-mode').waitFor();
  await assertNoOverflow(recoveryPage, 'Recovery mode at 320px dark');
  const bodyText = await recoveryPage.locator('body').innerText();
  assert.ok(!bodyText.includes(corruptRaw.slice(0, 40)));
  assert.equal(await recoveryPage.getByText('Home', { exact: true }).count(), 0);

  const downloadPromise = recoveryPage.waitForEvent('download');
  await recoveryPage.getByRole('button', {
    name: 'Export preserved raw payload',
    exact: true,
  }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  const preserved = JSON.parse(await readFile(downloadPath, 'utf8'));
  assert.equal(preserved.rawPayload, corruptRaw);
  assert.equal(preserved.metadata.originalKey, storageKey);
  assert.ok(preserved.metadata.validationErrors.length > 0);

  const tempDirectory = await mkdtemp(join(tmpdir(), 'turn-os-p0-restore-'));
  const backupPath = join(tempDirectory, 'valid-turn-os-backup.json');
  await writeFile(backupPath, JSON.stringify(seedData), 'utf8');
  await recoveryPage.locator('input[type="file"]').setInputFiles(backupPath);
  await recoveryPage.getByRole('heading', { name: 'Welcome to Turn OS', exact: true }).waitFor();
  const restoredRaw = await recoveryPage.evaluate(
    (key) => window.localStorage.getItem(key),
    storageKey,
  );
  assert.ok(restoredRaw);
  assert.doesNotThrow(() => JSON.parse(restoredRaw));
  assert.equal(await recoveryPage.getByTestId('recovery-mode').count(), 0);
  await recoveryContext.close();

  assert.deepEqual(runtimeErrors, []);
  console.log(
    'Personal Alpha 0.2.1 P0 production-preview gate passed: project carryover, atomic midday release, active-Walk End Day guard, and raw recovery/restore.',
  );
} finally {
  await browser.close();
}
