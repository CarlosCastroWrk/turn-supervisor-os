import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldPlaybooks } from '../src/lib/playbooks.ts';

test('field playbooks stay concise, unique, and navigation-only', () => {
  assert.equal(fieldPlaybooks.length, 3);
  assert.equal(new Set(fieldPlaybooks.map((playbook) => playbook.id)).size, fieldPlaybooks.length);

  fieldPlaybooks.forEach((playbook) => {
    assert.ok(playbook.steps.length >= 3 && playbook.steps.length <= 4);
    assert.ok(playbook.steps.every((step) => step.title.trim() && step.detail.trim()));
    assert.ok(['copilot', 'issues', 'daily'].includes(playbook.action.view));
    assert.ok(playbook.safetyNote.includes('Los'));
  });
});
