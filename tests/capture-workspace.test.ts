import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCaptureInput,
  inferSingleCaptureUnitId,
  isSupportedCaptureTextFile,
} from '../src/lib/captureWorkspace.ts';
import type { DraftAction, Unit } from '../src/types.ts';

const unit = (id: string, projectId: string, unitNumber: string): Unit => ({
  id,
  projectId,
  buildingId: `building_${projectId}`,
  floorId: `floor_${projectId}`,
  unitNumber,
  bedCount: 2,
  bathroomCount: 1,
  hasCommonArea: false,
  overallStatus: 'Not Started',
  paintStatus: 'Not Started',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Started',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Started',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes: '',
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
});

const draft = (id: string, unitNumber?: string): DraftAction => ({
  id,
  type: 'CREATE_ISSUE',
  title: `Draft ${id}`,
  summary: 'Capture workspace test',
  targetEntityType: 'issue',
  payload: unitNumber ? { unitNumber } : {},
  confidence: 0.9,
  why: 'Test capture',
  sourceText: 'Test capture',
  status: 'pending',
  createdAt: '2026-07-10T12:00:00.000Z',
});

test('buildCaptureInput combines a typed note with readable file context', () => {
  assert.equal(
    buildCaptureInput('Unit 312 sink leak.', [
      { name: 'field-note.txt', content: 'Maintenance needs to return.' },
      { name: 'empty.txt', content: '   ' },
    ]),
    'Unit 312 sink leak.\n\nAttached file field-note.txt:\nMaintenance needs to return.',
  );
});

test('buildCaptureInput supports attachment-only captures', () => {
  assert.equal(
    buildCaptureInput('', [{ name: 'turn.csv', content: 'unit,note\n204,keys missing' }]),
    'Attached file turn.csv:\nunit,note\n204,keys missing',
  );
});

test('inferSingleCaptureUnitId suggests one current-project unit only', () => {
  const units = [unit('unit_real_312', 'project_real', '312'), unit('unit_demo_312', 'project_demo', '312')];

  assert.equal(
    inferSingleCaptureUnitId([draft('draft_issue', '312'), draft('draft_followup', '312')], units, 'project_real'),
    'unit_real_312',
  );
  assert.equal(
    inferSingleCaptureUnitId([draft('draft_312', '312'), draft('draft_204', '204')], units, 'project_real'),
    undefined,
  );
});

test('capture text attachments accept field-note formats and reject opaque binaries', () => {
  assert.equal(isSupportedCaptureTextFile('notes.txt', 'text/plain'), true);
  assert.equal(isSupportedCaptureTextFile('turn.csv', ''), true);
  assert.equal(isSupportedCaptureTextFile('handoff.eml', 'message/rfc822'), true);
  assert.equal(isSupportedCaptureTextFile('data.json', 'application/json'), true);
  assert.equal(isSupportedCaptureTextFile('manual.pdf', 'application/pdf'), false);
});
