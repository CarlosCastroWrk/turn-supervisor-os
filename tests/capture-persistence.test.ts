import assert from 'node:assert/strict';
import test from 'node:test';
import { persistCaptureSnapshot } from '../src/lib/capturePersistence.ts';
import { seedData } from '../src/data/seed.ts';

test('capture persistence returns the next snapshot only after a durable write', () => {
  const current = structuredClone(seedData);
  const result = persistCaptureSnapshot(
    current,
    (data) => ({ ...data, activeProjectId: 'project_next' }),
    () => true,
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.activeProjectId, 'project_next');
});

test('capture persistence preserves the current snapshot when storage fails', () => {
  const current = structuredClone(seedData);
  const result = persistCaptureSnapshot(
    current,
    (data) => ({ ...data, activeProjectId: 'project_that_must_not_escape' }),
    () => false,
  );

  assert.equal(result.ok, false);
  assert.equal(result.data, current);
  assert.notEqual(result.data.activeProjectId, 'project_that_must_not_escape');
});
