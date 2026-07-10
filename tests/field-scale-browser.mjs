import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';
import { createRealTurnProject } from '../src/lib/actions.ts';
import { buildDailyLogId } from '../src/lib/dailyLogs.ts';

const storageKey = 'turn-supervisor-os:v0.1';
const host = '127.0.0.1';
const port = 4178;
const baseUrl = `http://${host}:${port}`;
const screenshotDirectory = await mkdtemp(path.join(tmpdir(), 'pds-field-scale-'));

const cloneSeed = () => JSON.parse(JSON.stringify(seedData));

const scaleState = (floorsPerBuilding, unitsPerFloor, activityCount = 0) => {
  const data = createRealTurnProject(cloneSeed(), {
    projectName: `QA ${floorsPerBuilding * unitsPerFloor} Unit Turn`,
    propertyName: 'QA Field Scale Property',
    location: 'Austin, TX',
    startDate: '2026-07-09',
    endDate: '2026-07-23',
    supervisorName: 'Los',
    projectManagerName: 'Tony',
    buildingNames: ['Building A'],
    buildingCount: 1,
    floorsPerBuilding,
    unitsPerFloor,
    firstUnitNumber: 101,
    bedCount: 2,
    bathroomCount: 1,
    hasCommonArea: false,
    notes: 'Disposable browser scale QA.',
  });
  const projectId = data.activeProjectId;
  const units = data.units.filter((unit) => unit.projectId === projectId);
  const start = Date.parse('2026-07-09T14:00:00.000Z');
  const activityLogs = Array.from({ length: activityCount }, (_, index) => {
    const unit = units[index % units.length];
    return {
      id: `activity_browser_scale_${String(index).padStart(5, '0')}`,
      projectId,
      entityType: 'Unit',
      entityId: unit.id,
      action: 'Field checkpoint',
      note: `Unit ${unit.unitNumber} browser event ${index + 1}`,
      createdAt: new Date(start + index * 1_000).toISOString(),
    };
  });

  return {
    ...data,
    activityLogs: [...activityLogs, ...data.activityLogs.filter((log) => log.projectId !== projectId)],
  };
};

const attachConsoleChecks = (page) => {
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

const waitForStoredUnitCount = (page, expected) =>
  page.waitForFunction(
    ({ key, unitCount }) => {
      const stored = window.localStorage.getItem(key);
      if (!stored) return false;
      const data = JSON.parse(stored);
      return data.units.filter((unit) => unit.projectId === data.activeProjectId).length === unitCount;
    },
    { key: storageKey, unitCount: expected },
  );

const loadStoredContext = async (browser, viewport, storedState, trackStorageWrites = false) => {
  const context = await browser.newContext({ viewport });
  if (trackStorageWrites) {
    await context.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      window.__pdsStorageWriteCount = 0;
      Storage.prototype.setItem = function instrumentedSetItem(storageKey, value) {
        if (storageKey === key) {
          window.__pdsStorageWriteCount += 1;
        }
        return setItem.call(this, storageKey, value);
      };
    }, storageKey);
  }
  await context.addInitScript(
    ({ key, value }) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, value);
      }
    },
    { key: storageKey, value: storedState },
  );
  return context;
};

const verifyUnitBoard = async ({ browser, name, storedState, viewport }) => {
  const context = await loadStoredContext(browser, viewport, storedState);
  const page = await context.newPage();
  const consoleFindings = attachConsoleChecks(page);
  const startedAt = performance.now();
  await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Unit Command' }).waitFor();
  await page.locator('.unit-card').first().waitFor();
  const loadMs = performance.now() - startedAt;

  assert.equal(await page.locator('.unit-card').count(), 100);
  assert.match(await page.locator('.unit-list-limit').innerText(), /200 more matched units are hidden for speed/);
  await assertNoHorizontalOverflow(page, name);
  await page.getByRole('button', { name: /Capture/ }).waitFor();

  const screenshot = path.join(screenshotDirectory, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  assert.deepEqual(consoleFindings, [], `${name} console findings:\n${consoleFindings.join('\n')}`);
  await context.close();

  return { loadMs: Math.round(loadMs), screenshot };
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

  const setupContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const setupPage = await setupContext.newPage();
  const setupConsoleFindings = attachConsoleChecks(setupPage);
  await setupPage.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  await setupPage.getByRole('heading', { name: 'Project Setup' }).waitFor();
  await setupPage.getByLabel('Project name').first().fill('QA 300 Unit Turn');
  await setupPage.getByLabel('Property name').first().fill('QA 300 Unit Property');
  await setupPage.getByLabel('Location').first().fill('Austin, TX');
  await setupPage.getByLabel('Floors per building').fill('10');
  await setupPage.getByLabel('Units per floor').fill('30');
  setupPage.once('dialog', (dialog) => dialog.accept());
  await setupPage.getByRole('button', { name: 'Start Real Turn', exact: true }).click();
  await waitForStoredUnitCount(setupPage, 300);

  const setupUnitCount = setupPage.locator('.setup-summary article').filter({ hasText: 'Units' }).locator('strong');
  assert.equal(await setupUnitCount.textContent(), '300');
  const stored300 = await setupPage.evaluate((key) => window.localStorage.getItem(key), storageKey);
  assert.ok(stored300);

  await setupPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await setupPage.locator('.unit-card').first().waitFor();
  assert.equal(await setupPage.locator('.unit-card').count(), 100);
  await setupPage.getByLabel('Search unit').fill('1020');
  await setupPage.waitForFunction(() => document.querySelectorAll('.unit-card').length === 1);
  assert.equal(await setupPage.locator('.unit-card h3').textContent(), '1020');
  await assertNoHorizontalOverflow(setupPage, 'desktop-setup');
  const setupScreenshot = path.join(screenshotDirectory, 'desktop-setup.png');
  await setupPage.screenshot({ path: setupScreenshot, fullPage: false });

  await setupPage.getByLabel('Building name').fill('QA Quick Annex');
  await setupPage.getByLabel('Floors', { exact: true }).fill('11');
  await setupPage.getByLabel('First unit').fill('1101');
  await setupPage.getByLabel('Units per floor').fill('12');
  await setupPage.getByLabel('Beds per unit').fill('4');
  await setupPage.getByLabel('Baths per unit').fill('3');
  await setupPage.getByRole('button', { name: 'Create Units', exact: true }).click();
  await waitForStoredUnitCount(setupPage, 312);
  const quickCreationResult = await setupPage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const building = stored.buildings.find(
      (item) => item.projectId === stored.activeProjectId && item.name === 'QA Quick Annex',
    );
    const units = stored.units.filter((item) => item.buildingId === building?.id);
    return {
      bathroomCounts: [...new Set(units.map((item) => item.bathroomCount))],
      bedCounts: [...new Set(units.map((item) => item.bedCount))],
      unitCount: units.length,
    };
  }, storageKey);
  assert.deepEqual(quickCreationResult, { bathroomCounts: [3], bedCounts: [4], unitCount: 12 });
  assert.deepEqual(setupConsoleFindings, [], `Setup console findings:\n${setupConsoleFindings.join('\n')}`);
  await setupContext.close();

  const responsive = {};
  for (const target of [
    { name: 'desktop-300', viewport: { width: 1440, height: 900 } },
    { name: 'ipad-300', viewport: { width: 1024, height: 768 } },
    { name: 'iphone-300', viewport: { width: 390, height: 844 } },
  ]) {
    responsive[target.name] = await verifyUnitBoard({ browser, storedState: stored300, ...target });
  }

  const csvText = [
    'Unit,Building,Floor,Beds,Bathrooms,Common Area,Notes,Overall Status',
    '101,Building A,Floor 1,50,50,yes,Must not overwrite,Ready',
    '1501,CSV Annex,Floor 15,2,1,no,"Needs, keys",Ready',
    '1502,CSV Annex,Floor 15,3,2,yes,Second imported unit,Painting',
    '1502,CSV Annex,Floor 15,9,9,no,Duplicate row,Ready',
    '1503,CSV Annex,Floor 15,51,1,maybe,Invalid row,Ready',
  ].join('\n');
  const csvContext = await loadStoredContext(browser, { width: 1440, height: 900 }, stored300);
  const csvPage = await csvContext.newPage();
  const csvConsoleFindings = attachConsoleChecks(csvPage);
  await csvPage.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  await csvPage.getByRole('heading', { name: 'Import Unit List', exact: true }).waitFor();
  const csvFileInput = csvPage.getByLabel('CSV file', { exact: true });
  await csvFileInput.setInputFiles({ name: 'qa-unit-import.csv', mimeType: 'text/csv', buffer: Buffer.from(csvText) });
  const importTwoButton = csvPage.getByRole('button', { name: 'Import 2 Units', exact: true });
  await importTwoButton.waitFor();
  const csvPreviewSummary = await csvPage.locator('.csv-import-summary').innerText();
  assert.match(csvPreviewSummary, /2\s+Ready to import/);
  assert.match(csvPreviewSummary, /1\s+Existing skipped/);
  assert.match(csvPreviewSummary, /2\s+Invalid or duplicate/);
  await csvPage.getByText('Status columns are ignored. Every imported unit starts Not Started for field safety.', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(csvPage, 'desktop-csv-preview');
  const csvPreviewScreenshot = path.join(screenshotDirectory, 'desktop-csv-preview.png');
  await csvPage.locator('.unit-csv-import').screenshot({ path: csvPreviewScreenshot });

  csvPage.once('dialog', (dialog) => dialog.accept());
  await importTwoButton.click();
  await waitForStoredUnitCount(csvPage, 302);
  const csvImportResult = await csvPage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const projectUnits = stored.units.filter((unit) => unit.projectId === stored.activeProjectId);
    const existing = projectUnits.find((unit) => unit.unitNumber === '101');
    const imported = projectUnits.filter((unit) => unit.unitNumber === '1501' || unit.unitNumber === '1502');
    return {
      activityCount: stored.activityLogs.filter((log) => log.action === 'Imported units from CSV').length,
      existing: { bedCount: existing?.bedCount, notes: existing?.notes },
      imported: imported.map((unit) => ({
        cleanStatus: unit.cleanStatus,
        notes: unit.notes,
        overallStatus: unit.overallStatus,
        paintStatus: unit.paintStatus,
        unitNumber: unit.unitNumber,
      })),
      uniqueUnits: new Set(projectUnits.map((unit) => unit.unitNumber.toLocaleLowerCase())).size,
      unitCount: projectUnits.length,
    };
  }, storageKey);
  assert.deepEqual(csvImportResult.existing, { bedCount: 0, notes: '' });
  assert.equal(csvImportResult.activityCount, 1);
  assert.equal(csvImportResult.unitCount, 302);
  assert.equal(csvImportResult.uniqueUnits, 302);
  assert.deepEqual(
    csvImportResult.imported,
    [
      { cleanStatus: 'Not Started', notes: 'Needs, keys', overallStatus: 'Not Started', paintStatus: 'Not Started', unitNumber: '1501' },
      { cleanStatus: 'Not Started', notes: 'Second imported unit', overallStatus: 'Not Started', paintStatus: 'Not Started', unitNumber: '1502' },
    ],
  );

  await csvPage.reload({ waitUntil: 'networkidle' });
  await csvPage.getByRole('heading', { name: 'Import Unit List', exact: true }).waitFor();
  await csvPage.getByLabel('CSV file', { exact: true }).setInputFiles({
    name: 'qa-unit-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvText),
  });
  const zeroImportButton = csvPage.getByRole('button', { name: 'Import 0 Units', exact: true });
  await zeroImportButton.waitFor();
  assert.equal(await zeroImportButton.isDisabled(), true);
  assert.deepEqual(csvConsoleFindings, [], `CSV import console findings:\n${csvConsoleFindings.join('\n')}`);
  await csvContext.close();

  const csvMobileContext = await loadStoredContext(browser, { width: 390, height: 844 }, stored300);
  const csvMobilePage = await csvMobileContext.newPage();
  const csvMobileConsoleFindings = attachConsoleChecks(csvMobilePage);
  await csvMobilePage.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  await csvMobilePage.getByLabel('CSV file', { exact: true }).setInputFiles({
    name: 'qa-mobile-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('unit,building,floor,beds,bathrooms\n1601,Mobile Annex,Floor 16,2,1'),
  });
  await csvMobilePage.getByRole('button', { name: 'Import 1 Unit', exact: true }).waitFor();
  await assertNoHorizontalOverflow(csvMobilePage, 'iphone-csv-preview');
  const csvMobileScreenshot = path.join(screenshotDirectory, 'iphone-csv-preview.png');
  await csvMobilePage.locator('.unit-csv-import').screenshot({ path: csvMobileScreenshot });
  const csvMobileOverlap = await csvMobilePage.evaluate(() => {
    const importButton = document.querySelector('.csv-import-confirm .button')?.getBoundingClientRect();
    const captureButton = document.querySelector('.floating-capture')?.getBoundingClientRect();
    if (!importButton || !captureButton) return false;
    return !(
      importButton.right <= captureButton.left ||
      importButton.left >= captureButton.right ||
      importButton.bottom <= captureButton.top ||
      importButton.top >= captureButton.bottom
    );
  });
  assert.equal(csvMobileOverlap, false, 'Floating Capture must not cover the CSV Import button.');
  assert.deepEqual(csvMobileConsoleFindings, [], `Mobile CSV console findings:\n${csvMobileConsoleFindings.join('\n')}`);
  await csvMobileContext.close();

  const scaleImportState = JSON.stringify(scaleState(0, 0));
  const scaleCsv = [
    'unit,building,floor',
    ...Array.from({ length: 5_000 }, (_, index) => `${20_000 + index},Bulk Import,Unassigned`),
  ].join('\n');
  const scaleCsvContext = await loadStoredContext(browser, { width: 1440, height: 900 }, scaleImportState);
  const scaleCsvPage = await scaleCsvContext.newPage();
  const scaleCsvConsoleFindings = attachConsoleChecks(scaleCsvPage);
  await scaleCsvPage.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  const scaleParseStartedAt = performance.now();
  await scaleCsvPage.getByLabel('CSV file', { exact: true }).setInputFiles({
    name: 'qa-5000-unit-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(scaleCsv),
  });
  const scaleImportButton = scaleCsvPage.getByRole('button', { name: 'Import 5,000 Units', exact: true });
  await scaleImportButton.waitFor({ timeout: 15_000 });
  const scaleParseMs = performance.now() - scaleParseStartedAt;
  assert.equal(await scaleCsvPage.locator('.csv-import-table tbody tr').count(), 10);
  const scaleImportStartedAt = performance.now();
  scaleCsvPage.once('dialog', (dialog) => dialog.accept());
  await scaleImportButton.click();
  await waitForStoredUnitCount(scaleCsvPage, 5_000);
  const scaleImportMs = performance.now() - scaleImportStartedAt;
  const scaleCsvResult = await scaleCsvPage.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    const stored = JSON.parse(serialized);
    const units = stored.units.filter((unit) => unit.projectId === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.filter((log) => log.action === 'Imported units from CSV').length,
      allNotStarted: units.every((unit) => unit.overallStatus === 'Not Started'),
      serializedCharacters: serialized.length,
      uniqueUnits: new Set(units.map((unit) => unit.unitNumber)).size,
      unitCount: units.length,
    };
  }, storageKey);
  assert.equal(scaleCsvResult.activityCount, 1);
  assert.equal(scaleCsvResult.allNotStarted, true);
  assert.equal(scaleCsvResult.uniqueUnits, 5_000);
  assert.equal(scaleCsvResult.unitCount, 5_000);
  assert.ok(scaleCsvResult.serializedCharacters < 5_000_000);
  await scaleCsvPage.reload({ waitUntil: 'networkidle' });
  await scaleCsvPage.getByRole('heading', { name: 'Import Unit List', exact: true }).waitFor();
  await assertNoHorizontalOverflow(scaleCsvPage, 'desktop-5000-csv-import');
  const scaleCsvScreenshot = path.join(screenshotDirectory, 'desktop-5000-csv-import.png');
  await scaleCsvPage.locator('.setup-summary').screenshot({ path: scaleCsvScreenshot });
  assert.deepEqual(scaleCsvConsoleFindings, [], `5,000-unit CSV console findings:\n${scaleCsvConsoleFindings.join('\n')}`);
  await scaleCsvContext.close();

  const dailyContext = await loadStoredContext(browser, { width: 390, height: 844 }, stored300);
  const dailyPage = await dailyContext.newPage();
  const dailyConsoleFindings = attachConsoleChecks(dailyPage);
  await dailyPage.goto(`${baseUrl}/#/daily`, { waitUntil: 'networkidle' });
  await dailyPage.getByRole('heading', { name: 'Daily Log', exact: true }).waitFor();
  const dailyDate = await dailyPage.getByLabel('Date', { exact: true }).inputValue();
  const completedSummary = dailyPage.getByLabel('Completed Summary', { exact: true });
  await completedSummary.fill('QA Daily Log first save');
  await dailyPage.getByRole('button', { name: 'Save Daily Log', exact: true }).click();
  await dailyPage.waitForFunction(
    ({ date, key, summary }) => {
      const stored = JSON.parse(window.localStorage.getItem(key));
      const matching = stored.dailyLogs.filter(
        (log) => log.projectId === stored.activeProjectId && log.date === date,
      );
      return matching.length === 1 && matching[0].completedSummary === summary;
    },
    { date: dailyDate, key: storageKey, summary: 'QA Daily Log first save' },
  );

  await dailyPage.reload({ waitUntil: 'networkidle' });
  await dailyPage.getByRole('heading', { name: 'Daily Log', exact: true }).waitFor();
  const reloadedSummary = dailyPage.getByLabel('Completed Summary');
  const reloadedSummaryCount = await reloadedSummary.count();
  assert.equal(
    reloadedSummaryCount,
    1,
    `Expected one reloaded Completed Summary field at ${dailyPage.url()}. Main text: ${await dailyPage.locator('main').innerText()}`,
  );
  assert.equal(await reloadedSummary.inputValue(), 'QA Daily Log first save');
  await reloadedSummary.fill('QA Daily Log updated after reload');
  await dailyPage.getByRole('button', { name: 'Save Daily Log', exact: true }).click();
  await dailyPage.waitForFunction(
    ({ date, key, summary }) => {
      const stored = JSON.parse(window.localStorage.getItem(key));
      const matching = stored.dailyLogs.filter(
        (log) => log.projectId === stored.activeProjectId && log.date === date,
      );
      return matching.length === 1 && matching[0].completedSummary === summary;
    },
    { date: dailyDate, key: storageKey, summary: 'QA Daily Log updated after reload' },
  );
  const dailyLogResult = await dailyPage.evaluate(
    ({ date, key }) => {
      const stored = JSON.parse(window.localStorage.getItem(key));
      const matching = stored.dailyLogs.filter(
        (log) => log.projectId === stored.activeProjectId && log.date === date,
      );
      return { activeProjectId: stored.activeProjectId, ids: matching.map((log) => log.id), rowCount: matching.length };
    },
    { date: dailyDate, key: storageKey },
  );
  assert.equal(dailyLogResult.rowCount, 1);
  assert.deepEqual(dailyLogResult.ids, [buildDailyLogId(dailyLogResult.activeProjectId, dailyDate)]);
  await assertNoHorizontalOverflow(dailyPage, 'iphone-daily-log');
  const dailyLogScreenshot = path.join(screenshotDirectory, 'iphone-daily-log.png');
  await dailyPage.screenshot({ path: dailyLogScreenshot, fullPage: false });

  await dailyPage.goto(`${baseUrl}/#/export`, { waitUntil: 'networkidle' });
  await dailyPage.getByRole('heading', { name: 'Export / Backup', exact: true }).waitFor();
  assert.equal(await dailyPage.getByRole('button', { name: 'Restore JSON Backup', exact: true }).isEnabled(), true);
  assert.equal(await dailyPage.locator('.restore-warning').count(), 0);
  assert.deepEqual(dailyConsoleFindings, [], `Daily Log console findings:\n${dailyConsoleFindings.join('\n')}`);
  await dailyContext.close();

  const largeState = JSON.stringify(scaleState(20, 50, 10_000));
  const largeContext = await loadStoredContext(browser, { width: 390, height: 844 }, largeState, true);
  const largePage = await largeContext.newPage();
  const cdp = await largeContext.newCDPSession(largePage);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const largeConsoleFindings = attachConsoleChecks(largePage);
  const largeStartedAt = performance.now();
  await largePage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await largePage.getByRole('heading', { name: 'Unit Command' }).waitFor();
  await largePage.locator('.unit-card').first().waitFor();
  const largeLoadMs = performance.now() - largeStartedAt;

  assert.equal(await largePage.locator('.unit-card').count(), 100);
  assert.match(await largePage.locator('.unit-list-limit').innerText(), /900 more matched units are hidden for speed/);
  assert.ok(largeLoadMs < 15_000, `1,000-unit board took ${largeLoadMs.toFixed(1)}ms under 4x CPU throttling.`);
  await assertNoHorizontalOverflow(largePage, 'iphone-1000');

  await largePage.goto(`${baseUrl}/#/reports`, { waitUntil: 'networkidle' });
  await largePage.getByRole('heading', { name: 'Daily Report', exact: true }).waitFor();
  await largePage.getByText('Turn Supervisor OS', { exact: true }).waitFor();
  const reportText = await largePage.locator('main').innerText();
  assert.match(reportText, /Total units\s+1000/);
  assert.match(reportText, /9992 more recorded update/);
  await assertNoHorizontalOverflow(largePage, 'iphone-1000-report');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await largePage.waitForTimeout(500);
  const largeScreenshot = path.join(screenshotDirectory, 'iphone-1000-report.png');
  await largePage.screenshot({ path: largeScreenshot, fullPage: false });

  await largePage.goto(`${baseUrl}/#/setup`, { waitUntil: 'networkidle' });
  await largePage.getByRole('heading', { name: 'Project Setup' }).waitFor();
  const turnProjectHeading = largePage.getByRole('heading', { name: 'Turn Project', exact: true });
  const turnProjectSection = largePage.locator('.section').filter({ has: turnProjectHeading });
  const projectNameInput = turnProjectSection.getByLabel('Project name');
  assert.equal(await projectNameInput.count(), 1);
  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  const activityBeforeTyping = await largePage.evaluate((key) => {
    const activityLogs = JSON.parse(window.localStorage.getItem(key)).activityLogs;
    return { count: activityLogs.length, latestId: activityLogs[0]?.id };
  }, storageKey);
  const originalProjectName = await projectNameInput.inputValue();
  const replacementProjectName = 'QA Commit Once Turn';
  const typingStartedAt = performance.now();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await projectNameInput.fill('');
  await projectNameInput.type(replacementProjectName, { delay: 5 });
  const typingMs = performance.now() - typingStartedAt;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await largePage.waitForTimeout(600);
  const beforeCommit = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.length,
      projectName: project?.name,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);

  assert.equal(await projectNameInput.inputValue(), replacementProjectName);
  assert.equal(beforeCommit.projectName, originalProjectName);
  assert.equal(beforeCommit.activityCount, activityBeforeTyping.count);
  assert.equal(beforeCommit.storageWrites, 0);
  assert.ok(typingMs < 4_000, `Expected local-draft typing under 4s at 4x CPU; received ${typingMs.toFixed(1)}ms.`);

  await projectNameInput.press('Tab');
  await largePage.waitForTimeout(700);
  const persistenceResult = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.length,
      latestActivityId: stored.activityLogs[0]?.id,
      projectName: project?.name,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);
  assert.equal(persistenceResult.projectName, replacementProjectName);
  assert.equal(persistenceResult.activityCount, activityBeforeTyping.count);
  assert.notEqual(persistenceResult.latestActivityId, activityBeforeTyping.latestId);
  assert.equal(persistenceResult.storageWrites, 1);

  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  const startDateInput = turnProjectSection.getByLabel('Start date');
  assert.equal(await startDateInput.count(), 1);
  await startDateInput.fill('2026-07-10');
  await largePage.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  const pagehideResult = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      latestActivityId: stored.activityLogs[0]?.id,
      startDate: project?.startDate,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);
  assert.equal(pagehideResult.startDate, '2026-07-10');
  assert.notEqual(pagehideResult.latestActivityId, persistenceResult.latestActivityId);
  assert.equal(pagehideResult.storageWrites, 1);

  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  const interruptedProjectName = 'QA Interrupted Draft Turn';
  await projectNameInput.fill(interruptedProjectName);
  await largePage.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  const storedBeforeReload = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    return stored.projects.find((item) => item.id === stored.activeProjectId)?.name;
  }, storageKey);
  assert.equal(storedBeforeReload, replacementProjectName);

  await largePage.reload({ waitUntil: 'networkidle' });
  await largePage.getByRole('heading', { name: 'Project Setup' }).waitFor();
  const recoveredTurnProjectHeading = largePage.getByRole('heading', { name: 'Turn Project', exact: true });
  const recoveredTurnProjectSection = largePage.locator('.section').filter({ has: recoveredTurnProjectHeading });
  const recoveredProjectNameInput = recoveredTurnProjectSection.getByLabel('Project name');
  assert.equal(await recoveredProjectNameInput.count(), 1);
  assert.equal(await recoveredProjectNameInput.inputValue(), interruptedProjectName);
  await largePage.waitForTimeout(600);
  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  await recoveredProjectNameInput.focus();
  await recoveredProjectNameInput.press('Tab');
  await largePage.waitForTimeout(700);
  const recoveryResult = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.length,
      latestActivityId: stored.activityLogs[0]?.id,
      projectName: project?.name,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);
  assert.equal(recoveryResult.projectName, interruptedProjectName);
  assert.equal(recoveryResult.activityCount, activityBeforeTyping.count);
  assert.notEqual(recoveryResult.latestActivityId, pagehideResult.latestActivityId);
  assert.equal(recoveryResult.storageWrites, 1);

  const estimatedUnitsInput = recoveredTurnProjectSection.getByLabel('Estimated units');
  assert.equal(await estimatedUnitsInput.count(), 1);
  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  const activityBeforeNumericTyping = recoveryResult.activityCount;
  await estimatedUnitsInput.fill('1250');
  await largePage.waitForTimeout(600);
  const beforeNumericCommit = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.length,
      latestActivityId: stored.activityLogs[0]?.id,
      estimatedUnits: project?.estimatedUnits,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);
  assert.equal(await estimatedUnitsInput.inputValue(), '1250');
  assert.equal(beforeNumericCommit.estimatedUnits, 1000);
  assert.equal(beforeNumericCommit.activityCount, activityBeforeNumericTyping);
  assert.equal(beforeNumericCommit.latestActivityId, recoveryResult.latestActivityId);
  assert.equal(beforeNumericCommit.storageWrites, 0);

  await largePage.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  const storedBeforeNumericReload = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    return stored.projects.find((item) => item.id === stored.activeProjectId)?.estimatedUnits;
  }, storageKey);
  assert.equal(storedBeforeNumericReload, 1000);

  await largePage.reload({ waitUntil: 'networkidle' });
  await largePage.getByRole('heading', { name: 'Project Setup' }).waitFor();
  const numericTurnProjectSection = largePage
    .locator('.section')
    .filter({ has: largePage.getByRole('heading', { name: 'Turn Project', exact: true }) });
  const recoveredEstimatedUnitsInput = numericTurnProjectSection.getByLabel('Estimated units');
  assert.equal(await recoveredEstimatedUnitsInput.count(), 1);
  assert.equal(await recoveredEstimatedUnitsInput.inputValue(), '1250');
  await largePage.waitForTimeout(600);
  await largePage.evaluate(() => {
    window.__pdsStorageWriteCount = 0;
  });
  await recoveredEstimatedUnitsInput.focus();
  await recoveredEstimatedUnitsInput.press('Enter');
  await largePage.waitForTimeout(700);
  const numericCommitResult = await largePage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const project = stored.projects.find((item) => item.id === stored.activeProjectId);
    return {
      activityCount: stored.activityLogs.length,
      latestActivityId: stored.activityLogs[0]?.id,
      estimatedUnits: project?.estimatedUnits,
      storageWrites: window.__pdsStorageWriteCount,
    };
  }, storageKey);
  assert.equal(numericCommitResult.estimatedUnits, 1250);
  assert.equal(numericCommitResult.activityCount, activityBeforeNumericTyping);
  assert.notEqual(numericCommitResult.latestActivityId, recoveryResult.latestActivityId);
  assert.equal(numericCommitResult.storageWrites, 1);
  await assertNoHorizontalOverflow(largePage, 'iphone-commit-on-blur');
  const committedFieldScreenshot = path.join(screenshotDirectory, 'iphone-commit-on-blur.png');
  await recoveredProjectNameInput.screenshot({ path: committedFieldScreenshot });
  assert.deepEqual(largeConsoleFindings, [], `Large-state console findings:\n${largeConsoleFindings.join('\n')}`);
  await largeContext.close();

  process.stdout.write(
    `${JSON.stringify({
      largeLoadMs: Math.round(largeLoadMs),
      largeStateCharacters: largeState.length,
      dailyLogSafety: {
        id: dailyLogResult.ids[0],
        rowCount: dailyLogResult.rowCount,
        screenshot: dailyLogScreenshot,
      },
      quickCreation: quickCreationResult,
      csvImport: {
        imported: csvImportResult.unitCount - 300,
        mobileScreenshot: csvMobileScreenshot,
        previewScreenshot: csvPreviewScreenshot,
        scaleImportMs: Math.round(scaleImportMs),
        scaleParseMs: Math.round(scaleParseMs),
        scaleScreenshot: scaleCsvScreenshot,
        scaleSerializedCharacters: scaleCsvResult.serializedCharacters,
        scaleUnitCount: scaleCsvResult.unitCount,
      },
      numericPersistence: {
        latestActivityRetained: numericCommitResult.latestActivityId !== recoveryResult.latestActivityId,
        retainedActivityCount: numericCommitResult.activityCount,
        recoveredDraft: true,
        storageWrites: numericCommitResult.storageWrites,
      },
      persistence: {
        latestActivityRetained: persistenceResult.latestActivityId !== activityBeforeTyping.latestId,
        retainedActivityCount: persistenceResult.activityCount,
        pagehideWrites: pagehideResult.storageWrites,
        recoveredDraft: recoveryResult.projectName === interruptedProjectName,
        recoveryWrites: recoveryResult.storageWrites,
        storageWrites: persistenceResult.storageWrites,
        typingMs: Math.round(typingMs),
      },
      responsive,
      screenshots: { committedField: committedFieldScreenshot, large: largeScreenshot, setup: setupScreenshot },
    })}\n`,
  );
} finally {
  await browser?.close();
  await server.close();
}
