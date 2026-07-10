import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { applyDraftAction, updateDraftAction } from '../src/lib/actions.ts';
import { mockAgentProvider } from '../src/lib/ai/mockAgentProvider.ts';
import type { AgentParseResult } from '../src/lib/ai/types.ts';
import type { AppData, Building, DraftAction, Floor, Project, Unit } from '../src/types.ts';

const stamp = '2026-07-08T12:00:00.000Z';
const unitNumbers = ['104', '105', '203', '204', '205', '312'];

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const project: Project = {
  id: 'project_parser_eval',
  mode: 'real',
  name: 'Parser Eval Turn',
  propertyName: 'Parser Eval Property',
  location: 'Austin, TX',
  startDate: '2026-07-08',
  endDate: '2026-07-22',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: unitNumbers.length,
  estimatedBeds: unitNumbers.length * 2,
  estimatedCommonAreas: 0,
  aiBudgetUsd: 10,
  createdAt: stamp,
  updatedAt: stamp,
};

const building: Building = {
  id: 'building_parser_eval',
  projectId: project.id,
  name: 'Parser Eval Building',
  notes: '',
  createdAt: stamp,
  updatedAt: stamp,
};

const floor: Floor = {
  id: 'floor_parser_eval',
  buildingId: building.id,
  name: 'Floor 1',
  notes: '',
  createdAt: stamp,
  updatedAt: stamp,
};

const unit = (unitNumber: string): Unit => ({
  id: `unit_parser_eval_${unitNumber}`,
  projectId: project.id,
  buildingId: building.id,
  floorId: floor.id,
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
  createdAt: stamp,
  updatedAt: stamp,
});

const parserData = (): AppData => {
  const data = cloneSeed();
  return {
    ...data,
    activeProjectId: project.id,
    projects: [project, ...data.projects],
    buildings: [building, ...data.buildings],
    floors: [floor, ...data.floors],
    units: [...unitNumbers.map(unit), ...data.units],
    draftActions: [],
  };
};

const parse = (input: string) => mockAgentProvider.parseQuickCapture(input, parserData());

const findDraft = (result: AgentParseResult, type: DraftAction['type'], unitNumber: string) =>
  result.draftActions.find((action) => action.type === type && action.payload.unitNumber === unitNumber);

test('parser scopes punctuation-free unit updates to each unit phrase', async () => {
  const result = await parse('104 done 105 in progress 312 sink leak');

  assert.deepEqual(result.detectedEntities.units, ['104', '105', '312']);
  assert.equal(result.draftActions.length, 3);

  const readyDraft = findDraft(result, 'UPDATE_UNIT_STATUS', '104');
  assert.equal(readyDraft?.payload.overallStatus, 'Ready');
  assert.equal(readyDraft?.payload.paintStatus, undefined);
  assert.equal(readyDraft?.payload.cleanStatus, undefined);
  assert.equal(readyDraft?.payload.repairStatus, undefined);
  assert.equal(readyDraft?.payload.inspectionStatus, undefined);
  assert.equal(readyDraft?.payload.explicitReadyConfirmation, undefined);

  const progressDraft = findDraft(result, 'UPDATE_UNIT_STATUS', '105');
  assert.equal(progressDraft?.payload.overallStatus, 'Painting');

  const leakDraft = findDraft(result, 'CREATE_ISSUE', '312');
  assert.equal(leakDraft?.payload.category, 'Maintenance');
  assert.equal(leakDraft?.payload.priority, 'High');
  assert.match(String(leakDraft?.payload.title), /312.*sink leak/i);

  assert.equal(result.draftActions.some((action) => action.type === 'CREATE_ISSUE' && action.payload.unitNumber === '104'), false);
  assert.equal(result.draftActions.some((action) => action.type === 'CREATE_ISSUE' && action.payload.unitNumber === '105'), false);
});

test('parser applies a shared completion statement to every named unit', async () => {
  const result = await parse('Unit 104, Unit 105, and Unit 203 are done');

  assert.deepEqual(result.detectedEntities.units, ['104', '105', '203']);
  const readyDrafts = result.draftActions.filter(
    (action) => action.type === 'UPDATE_UNIT_STATUS' && action.payload.overallStatus === 'Ready',
  );
  assert.equal(readyDrafts.length, 3);
  assert.deepEqual(readyDrafts.map((draft) => draft.payload.unitNumber).sort(), ['104', '105', '203']);
  assert.equal(readyDrafts.every((draft) => draft.payload.explicitReadyConfirmation === undefined), true);
});

test('parser keeps a multi-condition blocker on the mentioned unit only', async () => {
  const result = await parse('204 paint done but cleaning blocked keys missing');

  assert.deepEqual(result.detectedEntities.units, ['204']);
  assert.equal(result.draftActions.length, 3);
  assert.equal(result.draftActions.some((action) => action.payload.requiresConflictConfirmation === true), false);
  assert.equal(result.draftActions.every((action) => action.payload.unitNumber === '204'), true);

  const paintDraft = result.draftActions.find((action) => action.type === 'UPDATE_UNIT_STATUS' && action.payload.paintStatus === 'Complete');
  assert.equal(paintDraft?.payload.overallStatus, 'Cleaning Ready');

  const accessDraft = result.draftActions.find((action) => action.type === 'UPDATE_UNIT_STATUS' && action.payload.overallStatus === 'Access Blocked');
  assert.equal(accessDraft?.payload.unitNumber, '204');

  const issueDraft = findDraft(result, 'CREATE_ISSUE', '204');
  assert.equal(issueDraft?.payload.category, 'Access');
  assert.match(String(issueDraft?.payload.title), /204.*missing keys/i);
});

test('parser converts named crew movement into an assignment draft', async () => {
  const result = await parse('Jose moved from 203 to 205');

  assert.deepEqual(result.detectedEntities.units, ['203', '205']);
  assert.deepEqual(result.detectedEntities.crews, ['Jose crew']);
  assert.equal(result.draftActions.length, 1);

  const assignment = result.draftActions[0];
  assert.equal(assignment.type, 'CREATE_ASSIGNMENT');
  assert.equal(assignment.payload.teamName, 'Jose crew');
  assert.deepEqual(assignment.payload.unitNumbers, ['205']);
  assert.equal(assignment.payload.status, 'In Progress');
});

test('parser flags competing same-unit status drafts for explicit confirmation', async () => {
  const result = await parse('104 done 104 in progress');

  assert.deepEqual(result.detectedEntities.units, ['104']);
  assert.equal(result.draftActions.length, 2);
  assert.match(result.warnings.join(' '), /Conflicting draft updates need confirmation.*104/);
  assert.equal(result.clarificationQuestions.length, 1);
  assert.equal(result.draftActions.every((action) => action.payload.unitNumber === '104'), true);
  assert.equal(result.draftActions.every((action) => action.payload.requiresConflictConfirmation === true), true);
  assert.equal(result.draftActions.every((action) => action.payload.explicitConflictConfirmation !== true), true);
});

test('conflicting drafts cannot apply until they are explicitly confirmed', async () => {
  const result = await parse('104 done 104 in progress');
  const draft = result.draftActions.find(
    (action) => action.type === 'UPDATE_UNIT_STATUS' && action.payload.overallStatus === 'Painting',
  );
  assert.ok(draft);

  const blocked = applyDraftAction({ ...parserData(), draftActions: [draft] }, draft.id);
  assert.equal(blocked.draftActions[0].status, 'failed');
  assert.match(blocked.draftActions[0].error ?? '', /conflicts with another draft/i);

  const confirmedInput = updateDraftAction({ ...parserData(), draftActions: [draft] }, draft.id, {
    payload: { ...draft.payload, explicitConflictConfirmation: true },
  });
  const confirmed = applyDraftAction(confirmedInput, draft.id);
  assert.equal(confirmed.draftActions[0].status, 'applied');
});

test('parser does not turn negated completion notes into ready drafts', async () => {
  const result = await parse('104 not done');

  assert.deepEqual(result.detectedEntities.units, ['104']);
  assert.equal(
    result.draftActions.some((action) => action.type === 'UPDATE_UNIT_STATUS' && action.payload.overallStatus === 'Ready'),
    false,
  );
  assert.equal(result.draftActions.some((action) => action.type === 'ADD_DAILY_LOG_ENTRY'), true);
  assert.match(result.warnings.join(' '), /No high-confidence structured action found/);
});

test('parser-created ready drafts cannot bypass ready safety checks', async () => {
  const result = await parse('104 done');
  const readyDraft = findDraft(result, 'UPDATE_UNIT_STATUS', '104');
  assert.ok(readyDraft);
  assert.equal(readyDraft.payload.overallStatus, 'Ready');
  assert.equal(readyDraft.payload.explicitReadyConfirmation, undefined);

  const applied = applyDraftAction({ ...parserData(), draftActions: [readyDraft] }, readyDraft.id);

  assert.equal(applied.draftActions[0].status, 'failed');
  assert.match(applied.draftActions[0].error ?? '', /Ready is blocked/);
  assert.equal(applied.units.find((item) => item.unitNumber === '104')?.overallStatus, 'Not Started');
});

test('parser-created memory candidates inherit the active Turn scope', async () => {
  const result = await parse('Lesson learned: blocked units need an owner before lunch.');

  assert.equal(result.memoryCandidates.length, 1);
  assert.equal(result.memoryCandidates[0]?.memoryType, 'Lesson Learned');
  assert.equal(result.memoryCandidates[0]?.projectId, project.id);
  assert.equal(result.memoryCandidates[0]?.status, 'pending');
});
