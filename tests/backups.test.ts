import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import { buildJsonBackup } from '../src/lib/exporters.ts';
import type { AppData } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

test('current backup envelopes round-trip through restore validation', () => {
  const data = cloneSeed();
  const restored = parseJsonBackup(buildJsonBackup(data));

  assert.equal(restored.activeProjectId, data.activeProjectId);
  assert.equal(restored.projects.length, data.projects.length);
  assert.equal(restored.projects[0]?.id, data.projects[0]?.id);
  assert.equal(restored.projects[0]?.name, data.projects[0]?.name);
  assert.deepEqual(restored.units, data.units);
});

test('legacy bare AppData backups remain restorable and receive missing collection defaults', () => {
  const data = cloneSeed() as AppData & { reportDrafts?: AppData['reportDrafts'] };
  delete data.reportDrafts;

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.activeProjectId, seedData.activeProjectId);
  assert.deepEqual(restored.reportDrafts, []);
});

test('invalid JSON and empty project backups fail before local replacement', () => {
  assert.throws(() => parseJsonBackup('{broken'), /not valid JSON.*No local data was changed/);
  assert.throws(
    () => parseJsonBackup(JSON.stringify({ activeProjectId: 'missing', projects: [] })),
    /projects.*No local data was changed/,
  );
});

test('malformed collections and records are rejected instead of being normalized into silent data loss', () => {
  const malformedCollection = { ...cloneSeed(), units: { id: 'not-an-array' } };
  const malformedRecord = { ...cloneSeed(), issues: [{ title: 'Missing id' }] };
  const unsafeUnit = { ...cloneSeed(), units: [{ id: 'unit_missing_runtime_fields' }] };
  const invalidStatus = cloneSeed();
  invalidStatus.units[0] = { ...invalidStatus.units[0], overallStatus: 'Impossible state' as never };

  assert.throws(() => parseJsonBackup(JSON.stringify(malformedCollection)), /units/);
  assert.throws(() => parseJsonBackup(JSON.stringify(malformedRecord)), /issues\.0\.id/);
  assert.throws(() => parseJsonBackup(JSON.stringify(unsafeUnit)), /units\.0\.projectId/);
  assert.throws(() => parseJsonBackup(JSON.stringify(invalidStatus)), /units\.0\.overallStatus.*Invalid Unit status/);
});

test('a valid embedded photo payload remains available for post-restore IndexedDB migration', () => {
  const data = cloneSeed();
  data.photoNotes = [
    {
      id: 'photo_valid_backup',
      projectId: data.activeProjectId,
      unitId: data.units[0].id,
      category: 'Problem',
      caption: 'Valid recovery photo',
      imageData: 'data:image/jpeg;base64,AQID',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.photoNotes[0]?.imageData, 'data:image/jpeg;base64,AQID');
});

test('duplicate record ids and invalid embedded photo data are rejected', () => {
  const duplicateUnits = cloneSeed();
  duplicateUnits.units = [duplicateUnits.units[0], { ...duplicateUnits.units[0] }];

  const invalidPhoto = cloneSeed();
  invalidPhoto.photoNotes = [
    {
      id: 'photo_invalid_backup',
      projectId: invalidPhoto.activeProjectId,
      category: 'Problem',
      caption: 'Invalid payload',
      imageData: 'not-a-data-url',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];
  const unsupportedPhoto = cloneSeed();
  unsupportedPhoto.photoNotes = [
    {
      ...invalidPhoto.photoNotes[0],
      id: 'photo_unsupported_backup',
      imageData: 'data:text/html;base64,PGgxPk5vdCBhIHBob3RvPC9oMT4=',
    },
  ];

  assert.throws(() => parseJsonBackup(JSON.stringify(duplicateUnits)), /Duplicate record id/);
  assert.throws(() => parseJsonBackup(JSON.stringify(invalidPhoto)), /imageData is invalid, unsupported, or too large/);
  assert.throws(() => parseJsonBackup(JSON.stringify(unsupportedPhoto)), /imageData is invalid, unsupported, or too large/);
});

test('a stale active project id safely falls back to a project contained in the backup', () => {
  const data = cloneSeed();
  data.activeProjectId = 'project_missing_from_backup';

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.activeProjectId, restored.projects[0].id);
});
