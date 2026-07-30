import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { seedData } from '../src/data/seed.ts';
import { createRealTurnProject } from '../src/lib/actions.ts';
import { nowISO, todayISO } from '../src/lib/constants.ts';
import { buildDailyLogId } from '../src/lib/dailyLogs.ts';

const storageKey = 'turn-supervisor-os:v0.1';
const baseUrl = process.env.PDS_PRODUCTION_URL ?? 'https://turn-supervisor-os.vercel.app';
const accessUrl = process.env.PDS_ACCESS_URL;
const recoveryProjectName = 'QA_RECOVERY_GATE';
const recoveryIssueTitle = 'QA_RECOVERY_ISSUE';
const recoveryLogText = 'QA_RECOVERY_LOG';
const recoveryMemoryText = 'QA_RECOVERY_MEMORY';
const recoveryFollowUpText = 'QA_RECOVERY_FOLLOWUP';
const recoveryPhotoCaption = 'QA_RECOVERY_PHOTO';
const afterBackupMarker = 'QA_AFTER_BACKUP_SHOULD_DISAPPEAR';
const recoveryUnitNumber = '181';
const fieldDate = todayISO();

const cloneSeed = () => JSON.parse(JSON.stringify(seedData));

const buildRecoveryState = () => {
  const stamp = nowISO();
  const date = fieldDate;
  const data = createRealTurnProject(cloneSeed(), {
    projectName: recoveryProjectName,
    propertyName: 'QA Recovery Property',
    location: 'Austin, TX',
    startDate: date,
    endDate: date,
    supervisorName: 'Los',
    projectManagerName: 'Tony',
    buildingNames: ['QA Recovery Building'],
    buildingCount: 1,
    floorsPerBuilding: 1,
    unitsPerFloor: 2,
    firstUnitNumber: 181,
    bedCount: 2,
    bathroomCount: 1,
    hasCommonArea: false,
    notes: 'Disposable production recovery gate.',
  });
  const projectId = data.activeProjectId;
  const unit = data.units.find((item) => item.projectId === projectId && item.unitNumber === recoveryUnitNumber);
  assert.ok(unit);

  return {
    data: {
      ...data,
      issues: [
        {
          id: 'issue_qa_recovery',
          projectId,
          buildingId: unit.buildingId,
          floorId: unit.floorId,
          unitId: unit.id,
          title: recoveryIssueTitle,
          category: 'Maintenance',
          priority: 'High',
          owner: 'Los',
          status: 'Open',
          dueAt: date,
          notes: recoveryIssueTitle,
          resolutionNotes: '',
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...data.issues,
      ],
      dailyLogs: [
        {
          id: buildDailyLogId(projectId, date),
          projectId,
          date,
          morningPlan: 'QA recovery plan',
          middayUpdate: 'QA recovery midpoint',
          endOfDayReflection: 'QA recovery reflection',
          completedSummary: recoveryLogText,
          blockers: 'No QA blocker',
          lessons: 'QA recovery lesson',
          tomorrowPriorities: 'QA recovery next step',
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...data.dailyLogs,
      ],
      memoryCandidates: [
        {
          id: 'memory_candidate_qa_recovery',
          projectId,
          memoryType: 'Lesson Learned',
          content: recoveryMemoryText,
          source: 'QA recovery gate',
          sourceEntityId: 'activity_qa_recovery',
          confidence: 1,
          status: 'approved',
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...data.memoryCandidates,
      ],
      memories: [
        {
          id: 'memory_qa_recovery',
          projectId,
          memoryType: 'Lesson Learned',
          content: recoveryMemoryText,
          source: 'QA recovery gate',
          sourceEntityId: 'memory_candidate_qa_recovery',
          confidence: 1,
          approved: true,
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...data.memories,
      ],
      followUpTasks: [
        {
          id: 'follow_up_qa_recovery',
          title: recoveryFollowUpText,
          description: 'Disposable recovery export sentinel.',
          priority: 'High',
          dueAt: date,
          owner: 'Los',
          relatedEntityType: 'unit',
          relatedEntityId: unit.id,
          status: 'open',
          createdAt: stamp,
        },
        ...data.followUpTasks,
      ],
      activityLogs: [
        {
          id: 'activity_qa_recovery',
          projectId,
          entityType: 'Unit',
          entityId: unit.id,
          action: 'QA recovery checkpoint',
          note: recoveryLogText,
          createdAt: stamp,
        },
        ...data.activityLogs,
      ],
      photoNotes: [],
    },
    projectId,
    unitId: unit.id,
  };
};

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || message.type() === 'warning' || /content security policy|refused to/i.test(text)) {
      findings.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
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

const storedText = (page) => page.evaluate((key) => window.localStorage.getItem(key), storageKey);
const storedData = async (page) => JSON.parse(await storedText(page));

const captureDownload = async (page, button) => {
  assert.equal(await button.count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  const filePath = await download.path();
  assert.ok(filePath);
  return {
    filename: download.suggestedFilename(),
    text: await readFile(filePath, 'utf8'),
  };
};

const dismissErrorToast = async (page, expectedText) => {
  const toast = page.locator('.field-toast--error').filter({ hasText: expectedText });
  await toast.waitFor();
  await toast.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
};

const { data: recoveryState, projectId, unitId } = buildRecoveryState();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
await context.addInitScript(
  ({ key, value }) => {
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, value);
    }
  },
  { key: storageKey, value: JSON.stringify(recoveryState) },
);

const page = await context.newPage();
const runtimeFindings = attachRuntimeChecks(page);

try {
  if (accessUrl) {
    await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });
  }
  await page.goto(`${baseUrl}/#/unit/${encodeURIComponent(unitId)}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: `Unit ${recoveryUnitNumber}`, exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'production Unit photo capture');

  const photoForm = page.locator('form.photo-capture');
  await photoForm.getByLabel('Caption', { exact: true }).fill(recoveryPhotoCaption);
  await photoForm.locator('input[type="file"]').setInputFiles({
    name: 'qa-recovery.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4pVQAAAAASUVORK5CYII=', 'base64'),
  });
  await photoForm.getByText(/Photo saved offline on this device/).waitFor();
  await page.locator('.photo-thumb img').waitFor();

  await page.getByLabel('Quick note', { exact: true }).fill('QA_RECOVERY_ORIGINAL_NOTE');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText(`Note saved to Unit ${recoveryUnitNumber}.`, { exact: true }).waitFor();
  await page.waitForFunction(
    ({ key, caption, note }) => {
      const data = JSON.parse(window.localStorage.getItem(key));
      return data.photoNotes.some((photo) => photo.caption === caption) && data.units.some((unit) => unit.notes.includes(note));
    },
    { key: storageKey, caption: recoveryPhotoCaption, note: 'QA_RECOVERY_ORIGINAL_NOTE' },
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: `Unit ${recoveryUnitNumber}`, exact: true }).waitFor();
  await page.locator('.photo-thumb').filter({ hasText: recoveryPhotoCaption }).waitFor();
  await page.locator('.photo-thumb img').waitFor();
  const photoState = await storedData(page);
  const photoRecord = photoState.photoNotes.find((photo) => photo.caption === recoveryPhotoCaption);
  assert.ok(photoRecord);
  assert.equal(photoRecord.imageData, undefined);
  assert.equal(photoRecord.localImageAvailable, true);
  const indexedPhotoBytes = await page.evaluate(
    (photoId) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('turn-supervisor-os:media:v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction('photos', 'readonly');
          const request = transaction.objectStore('photos').get(photoId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result?.blob?.size ?? 0);
        };
      }),
    photoRecord.id,
  );
  assert.ok(indexedPhotoBytes > 0);
  assert.doesNotMatch(await storedText(page), /data:image\//);

  // The legacy Daily Report download was superseded by the accepted personal
  // Alpha Reports & Proof surface. Advanced reports are non-blocking for Alpha;
  // the P0 recovery contract continues below with full export and restore.

  await page.goto(`${baseUrl}/#/export`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Data and backup', exact: true }).waitFor();
  await page.getByText('All projects plus local photos; keep private', { exact: true }).waitFor();
  const restoreInput = page.getByLabel('Restore JSON backup file', { exact: true });
  await restoreInput.waitFor({ state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Restore JSON backup file"]')?.disabled);

  const fullBackup = await captureDownload(
    page,
    page.getByRole('button').filter({ hasText: 'Full Device JSON Backup' }),
  );
  const parsedBackup = JSON.parse(fullBackup.text);
  assert.equal(fullBackup.filename, `turn-supervisor-backup-${fieldDate}.json`);
  assert.equal(parsedBackup.photoFiles.includedLocalPhotoFiles, 1);
  assert.equal(parsedBackup.photoFiles.missingLocalPhotoFiles, 0);
  assert.equal(parsedBackup.photoFiles.totalPhotoRecords, 1);
  assert.ok(parsedBackup.data.projects.some((project) => project.mode === 'demo'));
  assert.ok(parsedBackup.data.projects.some((project) => project.name === recoveryProjectName));
  const backupPhoto = parsedBackup.data.photoNotes.find((photo) => photo.caption === recoveryPhotoCaption);
  assert.match(backupPhoto?.imageData ?? '', /^data:image\/jpeg;base64,/);
  await page.getByText('Backup saved with all 1 local photo file(s).', { exact: true }).waitFor();

  const unitsCsv = await captureDownload(page, page.getByRole('button').filter({ hasText: 'Units CSV' }));
  assert.equal(unitsCsv.filename, `turn-units-${fieldDate}.csv`);
  assert.match(unitsCsv.text, new RegExp(`"${recoveryUnitNumber}"`));
  assert.doesNotMatch(unitsCsv.text, /"103"/);
  const issuesCsv = await captureDownload(page, page.getByRole('button').filter({ hasText: 'Issues CSV' }));
  assert.equal(issuesCsv.filename, `turn-issues-${fieldDate}.csv`);
  assert.match(issuesCsv.text, new RegExp(recoveryIssueTitle));
  assert.doesNotMatch(issuesCsv.text, /Bathroom sink leak/);
  const dailyLogs = await captureDownload(page, page.getByRole('button').filter({ hasText: 'Current Turn Daily Logs' }));
  assert.equal(dailyLogs.filename, `turn-daily-logs-${fieldDate}.md`);
  assert.match(dailyLogs.text, new RegExp(recoveryLogText));
  const copilotMemory = await captureDownload(
    page,
    page.getByRole('button').filter({ hasText: 'Current Turn Copilot / Memory' }),
  );
  assert.equal(copilotMemory.filename, `turn-copilot-memory-${fieldDate}.md`);
  assert.match(copilotMemory.text, new RegExp(recoveryMemoryText));
  assert.match(copilotMemory.text, new RegExp(recoveryFollowUpText));
  const followUps = await captureDownload(page, page.getByRole('button').filter({ hasText: 'Current Turn Follow-Ups' }));
  assert.equal(followUps.filename, `turn-follow-ups-${fieldDate}.csv`);
  assert.match(followUps.text, new RegExp(recoveryFollowUpText));

  const beforeInvalid = await storedText(page);
  await restoreInput.setInputFiles({
    name: 'qa-invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not valid json'),
  });
  await dismissErrorToast(page, 'That backup file is not valid JSON. No local data was changed.');
  assert.equal(await storedText(page), beforeInvalid);

  const corruptBackup = JSON.parse(fullBackup.text);
  corruptBackup.data.projects = [];
  await restoreInput.setInputFiles({
    name: 'qa-corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corruptBackup)),
  });
  await dismissErrorToast(page, 'At least one project is required.');
  assert.equal(await storedText(page), beforeInvalid);

  const cancelDialogPromise = page.waitForEvent('dialog');
  await restoreInput.setInputFiles({
    name: 'qa-valid-cancel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fullBackup.text),
  });
  const cancelDialog = await cancelDialogPromise;
  assert.match(cancelDialog.message(), /This replaces local browser data on this device/);
  await cancelDialog.dismiss();
  assert.equal(await storedText(page), beforeInvalid);

  const mutationPage = await context.newPage();
  const mutationFindings = attachRuntimeChecks(mutationPage);
  await mutationPage.goto(`${baseUrl}/#/unit/${encodeURIComponent(unitId)}`, { waitUntil: 'networkidle' });
  await mutationPage.getByRole('heading', { name: `Unit ${recoveryUnitNumber}`, exact: true }).waitFor();
  await mutationPage.getByLabel('Quick note', { exact: true }).fill(afterBackupMarker);
  await mutationPage.getByRole('button', { name: 'Save note', exact: true }).click();
  await mutationPage.waitForFunction(
    ({ key, marker }) => JSON.parse(window.localStorage.getItem(key)).units.some((unit) => unit.notes.includes(marker)),
    { key: storageKey, marker: afterBackupMarker },
  );
  assert.deepEqual(mutationFindings, []);
  await mutationPage.close();
  assert.match(await storedText(page), new RegExp(afterBackupMarker));

  const restoreDialogPromise = page.waitForEvent('dialog');
  await restoreInput.setInputFiles({
    name: 'qa-valid-restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fullBackup.text),
  });
  const restoreDialog = await restoreDialogPromise;
  assert.match(restoreDialog.message(), /This replaces local browser data on this device/);
  await restoreDialog.accept();
  await page.getByText(/Restored \d+ project\(s\), \d+ unit\(s\), and \d+ issue\(s\)\./).waitFor();
  await page.waitForFunction(
    ({ key, marker, activeProjectId, expectedProjects, expectedUnits, expectedIssues }) => {
      const data = JSON.parse(window.localStorage.getItem(key));
      return (
        !window.localStorage.getItem(key).includes(marker) &&
        data.activeProjectId === activeProjectId &&
        data.projects.length === expectedProjects &&
        data.units.length === expectedUnits &&
        data.issues.length === expectedIssues
      );
    },
    {
      key: storageKey,
      marker: afterBackupMarker,
      activeProjectId: projectId,
      expectedProjects: parsedBackup.data.projects.length,
      expectedUnits: parsedBackup.data.units.length,
      expectedIssues: parsedBackup.data.issues.length,
    },
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Data and backup', exact: true }).waitFor();
  const restoredData = await storedData(page);
  assert.equal(restoredData.activeProjectId, projectId);
  assert.ok(restoredData.issues.some((issue) => issue.title === recoveryIssueTitle));
  assert.ok(restoredData.dailyLogs.some((log) => log.completedSummary === recoveryLogText));
  assert.doesNotMatch(await storedText(page), new RegExp(afterBackupMarker));
  await assertNoHorizontalOverflow(page, 'production restored Export');

  await page.goto(`${baseUrl}/#/unit/${encodeURIComponent(unitId)}`, { waitUntil: 'networkidle' });
  await page.locator('.photo-thumb').filter({ hasText: recoveryPhotoCaption }).waitFor();
  await page.locator('.photo-thumb img').waitFor();
  await assertNoHorizontalOverflow(page, 'production restored Unit photo');
  assert.deepEqual(runtimeFindings, [], `Production recovery findings:\n${runtimeFindings.join('\n')}`);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        downloads: [
          fullBackup.filename,
          unitsCsv.filename,
          issuesCsv.filename,
          dailyLogs.filename,
          copilotMemory.filename,
          followUps.filename,
        ],
        photo: { bytes: indexedPhotoBytes, includedInBackup: parsedBackup.photoFiles.includedLocalPhotoFiles },
        restore: {
          invalidRejected: true,
          corruptRejected: true,
          validCanceled: true,
          validApplied: true,
          projects: restoredData.projects.length,
          units: restoredData.units.length,
          issues: restoredData.issues.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
