import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROPOSAL_TOOL_NAMES,
  READ_TOOL_NAMES,
  executeProposalTool,
  executeReadTool,
} from '../src/features/turn-intelligence/tools.ts';
import { reviewProposal } from '../src/features/turn-intelligence/proposals.ts';
import { syntheticContext } from './turn-intelligence-fixtures.ts';

test('approved tool surface is exact and contains no direct-write tool', () => {
  assert.deepEqual(READ_TOOL_NAMES, [
    'get_property_summary',
    'search_units',
    'get_unit',
    'get_unit_history',
    'get_needs_me',
    'get_daily_progress',
    'get_callbacks',
    'get_ready_for_walk',
    'get_crew_assignments',
    'get_approved_knowledge',
  ]);
  assert.deepEqual(PROPOSAL_TOOL_NAMES, [
    'propose_daily_goal',
    'propose_note',
    'propose_assignment',
    'propose_crew_report',
    'propose_inspection_result',
    'propose_callback',
    'propose_blocker',
    'propose_property_walk',
    'draft_spanish_message',
    'draft_tony_update',
    'parse_assignment_source',
  ]);
  assert.equal(
    [...READ_TOOL_NAMES, ...PROPOSAL_TOOL_NAMES]
      .some((name) => /^(write|apply|send|mark|calculate_payroll)/.test(name)),
    false,
  );
});

test('read tools validate arguments and call only the injected read boundary', async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const runtime = {
    async read(name: (typeof READ_TOOL_NAMES)[number], input: unknown) {
      calls.push({ name, input });
      return {
        available: true,
        data: { unitNumber: '413' },
        sourceIds: ['synthetic-record'],
        synthetic: true,
        authorization: 'none' as const,
      };
    },
  };
  const result = await executeReadTool(runtime, 'search_units', {
    propertyId: 'synthetic-property',
    query: '413',
    limit: 5,
  });
  assert.equal(result.kind, 'read-result');
  assert.equal(calls.length, 1);
  await assert.rejects(() => executeReadTool(runtime, 'search_units', {
    propertyId: 'synthetic-property',
    query: '413',
    limit: 500,
    write: true,
  }));
  await assert.rejects(() => executeReadTool({
    async read() {
      return { available: true, data: undefined } as never;
    },
  }, 'get_unit', { unitId: 'synthetic-unit-413' }));
});

test('proposal lifecycle never applies operational work', () => {
  const result = executeProposalTool('propose_inspection_result', {
    title: 'Synthetic inspection proposal',
    editableDraft: 'Record my personal inspection observation for Unit 413 paint A.',
    evidenceSourceIds: [],
  }, syntheticContext, 'Unit 413 paint A looks ready for my review.', () => 'proposal-test');
  assert.equal(result.kind, 'proposal');
  if (result.kind !== 'proposal') return;
  assert.equal(result.proposal.status, 'pending');
  assert.equal(result.proposal.applied, false);
  assert.equal(result.proposal.exactSourceText, 'Unit 413 paint A looks ready for my review.');

  const edited = reviewProposal(result.proposal, { type: 'edit', text: 'Edited wording only.' });
  const approved = reviewProposal(edited, { type: 'approve' });
  const savedNote = reviewProposal(edited, { type: 'save-note' });
  const rejected = reviewProposal(edited, { type: 'reject' });
  assert.equal(approved.status, 'approved');
  assert.equal(savedNote.status, 'saved-note');
  assert.equal(rejected.status, 'rejected');
  assert.equal([approved, savedNote, rejected].every((proposal) => proposal.applied === false), true);
});

test('assignment-source parsing remains a pending non-authoritative proposal', () => {
  const result = executeProposalTool('parse_assignment_source', {
    title: 'Interpret uploaded assignment source',
    editableDraft: 'Possible assignment interpretation; verify against paper and Tony.',
    evidenceSourceIds: ['synthetic-upload'],
  }, syntheticContext, 'Synthetic screenshot wording.', () => 'proposal-source');
  assert.equal(result.kind, 'proposal');
  if (result.kind === 'proposal') {
    assert.equal(result.proposal.status, 'pending');
    assert.equal(result.proposal.applied, false);
  }
});
