import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  cleanCompletionPatch,
  maintenanceNeededPatch,
  paintCompletionPatch,
  undoUnitUpdate,
  updateUnit,
  updateUnitWithUndo,
} from '../src/lib/actions.ts';
import type { AppData } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

test('undo restores a quick Unit status update as a newer field event', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const result = updateUnitWithUndo(
    data,
    unit.id,
    { paintStatus: 'Complete', overallStatus: 'Cleaning Ready' },
    'Marked paint complete.',
  );

  assert.ok(result.undoToken);
  const changed = result.data.units.find((item) => item.id === unit.id);
  assert.equal(changed?.paintStatus, 'Complete');
  assert.equal(changed?.overallStatus, 'Cleaning Ready');
  assert.ok(Date.parse(changed?.updatedAt ?? '') > Date.parse(unit.updatedAt));

  const undone = undoUnitUpdate(result.data, result.undoToken);
  const restored = undone.data.units.find((item) => item.id === unit.id);
  assert.equal(undone.status, 'applied');
  assert.equal(restored?.paintStatus, unit.paintStatus);
  assert.equal(restored?.overallStatus, unit.overallStatus);
  assert.ok(Date.parse(restored?.updatedAt ?? '') > Date.parse(result.undoToken.expectedUpdatedAt));
  assert.equal(undone.data.activityLogs[0].note, 'Undo: Marked paint complete.');
});

test('undo refuses to overwrite a Unit that changed after the toast was created', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const result = updateUnitWithUndo(data, unit.id, { paintStatus: 'Complete' }, 'Marked paint complete.');
  assert.ok(result.undoToken);

  const changedAgain = updateUnit(result.data, unit.id, { paintStatus: 'Blocked' }, 'Paint became blocked.');
  const undone = undoUnitUpdate(changedAgain, result.undoToken);

  assert.equal(undone.status, 'stale');
  assert.equal(undone.data, changedAgain);
  assert.equal(undone.data.units.find((item) => item.id === unit.id)?.paintStatus, 'Blocked');
});

test('undo reports a missing Unit without recreating it', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const result = updateUnitWithUndo(data, unit.id, { paintStatus: 'Complete' }, 'Marked paint complete.');
  assert.ok(result.undoToken);

  const withoutUnit = { ...result.data, units: result.data.units.filter((item) => item.id !== unit.id) };
  const undone = undoUnitUpdate(withoutUnit, result.undoToken);

  assert.equal(undone.status, 'missing');
  assert.equal(undone.data, withoutUnit);
});

test('a repeated quick Unit status does not create activity or an Undo token', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const result = updateUnitWithUndo(data, unit.id, { paintStatus: unit.paintStatus }, 'Repeated paint status.');

  assert.equal(result.status, 'unchanged');
  assert.equal(result.data, data);
  assert.equal(result.undoToken, undefined);
  assert.equal(result.data.activityLogs.length, data.activityLogs.length);
});

test('trade quick actions preserve an active access blocker', () => {
  const data = cloneSeed();
  const unit = data.units.find((item) => item.overallStatus === 'Access Blocked');
  assert.ok(unit);

  assert.deepEqual(paintCompletionPatch(unit), { paintStatus: 'Complete' });
  assert.deepEqual(cleanCompletionPatch({ ...unit, paintStatus: 'Complete', repairStatus: 'Complete' }), {
    cleanStatus: 'Complete',
  });
  assert.deepEqual(maintenanceNeededPatch(unit), { repairStatus: 'Needed' });
});

test('trade quick actions advance only an ordinary forward workflow', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const ordinaryPaintingUnit = {
    ...unit,
    overallStatus: 'Painting' as const,
    paintStatus: 'In Progress' as const,
    cleanStatus: 'Not Started' as const,
    repairStatus: 'Complete' as const,
    trashStatus: 'Complete' as const,
  };

  assert.deepEqual(paintCompletionPatch(ordinaryPaintingUnit), {
    paintStatus: 'Complete',
    overallStatus: 'Cleaning Ready',
  });
  assert.deepEqual(
    cleanCompletionPatch({ ...ordinaryPaintingUnit, overallStatus: 'Cleaning', paintStatus: 'Complete' }),
    { cleanStatus: 'Complete', overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' },
  );
  assert.deepEqual(maintenanceNeededPatch({ ...ordinaryPaintingUnit, overallStatus: 'Inspection Needed' }), {
    repairStatus: 'Needed',
    overallStatus: 'Maintenance Needed',
  });
});

test('Unit updates remain monotonic when a device clock trails the last saved timestamp', () => {
  const data = cloneSeed();
  const unit = data.units[0];
  const futureUpdatedAt = '2099-01-01T00:00:00.000Z';
  const withFutureTimestamp = {
    ...data,
    units: data.units.map((item) => (item.id === unit.id ? { ...item, updatedAt: futureUpdatedAt } : item)),
  };

  const next = updateUnit(withFutureTimestamp, unit.id, { paintStatus: 'Complete' }, 'Marked paint complete.');
  const updated = next.units.find((item) => item.id === unit.id);
  assert.equal(updated?.updatedAt, '2099-01-01T00:00:00.001Z');
});
