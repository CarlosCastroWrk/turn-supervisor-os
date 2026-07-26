import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectJul28SectionFacts,
  projectJul28TradeProgress,
  projectJul28TurnBoard,
  projectJul28UnitCard,
  projectJul28UnitHistory,
  recordsForTrade,
} from '../src/features/jul28-turnboard/projections.ts';
import {
  assertSyntheticFixtureCompleteness,
  jul28SyntheticTurnBoardRepository,
} from '../src/features/jul28-turnboard/syntheticRepository.ts';

const getUnit = (unitNumber: string) => {
  const unit = jul28SyntheticTurnBoardRepository.listUnits().find((candidate) => candidate.unitNumber === unitNumber);
  assert.ok(unit, `Expected synthetic Unit ${unitNumber}`);
  return unit;
};

const getRecord = (unitNumber: string, trade: 'paint' | 'clean', section: 'common' | 'A' | 'B' | 'C' | 'D' | 'E') => {
  const record = recordsForTrade(getUnit(unitNumber), trade).find((candidate) => candidate.section === section);
  assert.ok(record, `Expected ${trade} ${section} record for Unit ${unitNumber}`);
  return record;
};

test('synthetic repository provides every Common through E Paint and Clean position', () => {
  assert.equal(jul28SyntheticTurnBoardRepository.source, 'synthetic-jul28-pattern-candidate');
  assert.equal(assertSyntheticFixtureCompleteness(), true);
});

test('Unit 602 added Paint scope is a new assignment episode rather than an original miss', () => {
  const unit = getUnit('602');
  const sectionD = getRecord('602', 'paint', 'D');
  const projection = projectJul28UnitCard(unit, 'paint');

  assert.deepEqual(projection.addedScopeSections, ['D']);
  assert.equal(sectionD.assignmentEpisodes[0]?.kind, 'added-scope');
  assert.equal(sectionD.assignmentEpisodes.some((episode) => episode.kind === 'callback'), false);
  assert.equal(sectionD.inspection, 'inspection-pending');
  assert.match(sectionD.assignmentEpisodes[0]?.wording ?? '', /new assignment episode/i);
});

test('Unit 603C crew report cannot become Los inspection while access is restricted', () => {
  const unit = getUnit('603');
  const sectionC = getRecord('603', 'paint', 'C');
  const projection = projectJul28UnitCard(unit, 'paint');
  const facts = projectJul28SectionFacts(sectionC);

  assert.equal(sectionC.crewExecution, 'crew-reported-complete');
  assert.equal(sectionC.access, 'occupied-or-restricted');
  assert.equal(sectionC.inspection, 'inspection-pending');
  assert.equal(projection.attentionKind, 'inspection-blocked');
  assert.equal(facts.find((fact) => fact.key === 'crew')?.label, 'Crew reported complete');
  assert.equal(facts.find((fact) => fact.key === 'inspection')?.label, 'My inspection pending');
  assert.match(facts.find((fact) => fact.key === 'inspection')?.detail ?? '', /access prevents/i);
});

test('Unit 604C leaves conflicting and duplicate assignment evidence unresolved', () => {
  const unit = getUnit('604');
  const sectionC = getRecord('604', 'paint', 'C');
  const projection = projectJul28UnitCard(unit, 'paint');
  const assignmentFact = projectJul28SectionFacts(sectionC).find((fact) => fact.key === 'assignment');

  assert.equal(sectionC.authorization, 'assignment-conflict');
  assert.equal(sectionC.assignmentEpisodes.filter((episode) => episode.active).length, 2);
  assert.equal(projection.attentionKind, 'assignment-conflict');
  assert.deepEqual(projection.duplicateAssignmentSections, ['C']);
  assert.equal(assignmentFact?.label, 'Needs clarification');
  assert.equal(assignmentFact?.tone, 'attention');
});

test('Unit 1305 section B cannot make the whole Paint track inspected while section C remains', () => {
  const unit = getUnit('1305');
  const sectionB = getRecord('1305', 'paint', 'B');
  const sectionC = getRecord('1305', 'paint', 'C');
  const progress = projectJul28TradeProgress(unit, 'paint');

  assert.equal(sectionB.inspection, 'los-passed');
  assert.equal(sectionC.inspection, 'inspection-pending');
  assert.equal(progress.allApplicableSectionsInspected, false);
  assert.equal(progress.losPassedSectionCount, 3);
  assert.equal(progress.pendingSectionCount, 1);
  assert.notEqual(progress.label, 'Done');
});

test('Paint and Clean remain independent for the same Unit section', () => {
  const paintB = getRecord('1305', 'paint', 'B');
  const cleanB = getRecord('1305', 'clean', 'B');
  const paintProjection = projectJul28UnitCard(getUnit('1305'), 'paint');
  const cleanProjection = projectJul28UnitCard(getUnit('1305'), 'clean');

  assert.equal(paintB.crewExecution, 'crew-reported-complete');
  assert.equal(paintB.inspection, 'los-passed');
  assert.equal(cleanB.crewExecution, 'assigned');
  assert.equal(cleanB.inspection, 'inspection-pending');
  assert.notDeepEqual(paintProjection.layers, cleanProjection.layers);
});

test('not applicable and restricted are distinct section facts', () => {
  const restrictedB = getRecord('602', 'paint', 'B');
  const notApplicableE = getRecord('602', 'paint', 'E');
  const restrictedFacts = projectJul28SectionFacts(restrictedB);
  const notApplicableFacts = projectJul28SectionFacts(notApplicableE);

  assert.equal(restrictedB.applicability, 'applicable');
  assert.equal(restrictedB.access, 'occupied-or-restricted');
  assert.equal(notApplicableE.applicability, 'not-applicable');
  assert.equal(restrictedFacts.find((fact) => fact.key === 'access')?.label, 'Restricted — do not enter');
  assert.equal(notApplicableFacts[0]?.label, 'Not applicable');
  assert.match(notApplicableFacts[0]?.detail ?? '', /not complete or restricted/i);
});

test('Unit history keeps additive assignment and crew-report records', () => {
  const history = projectJul28UnitHistory(getUnit('603'), 'paint', 'C');
  const ids = history.map((event) => event.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(history.some((event) => event.kind === 'assignment'), true);
  assert.equal(history.some((event) => event.kind === 'crew-report'), true);
  assert.equal(history.some((event) => event.kind === 'los-inspection'), false);
});

test('TurnBoard filters and search are deterministic and never select or mutate a Unit', () => {
  const units = jul28SyntheticTurnBoardRepository.listUnits();
  const needsMe = projectJul28TurnBoard(units, 'paint', 'needs-me');
  const crewReported = projectJul28TurnBoard(units, 'paint', 'crew-reported');
  const searched = projectJul28TurnBoard(units, 'paint', 'all', '1305');

  assert.equal(needsMe.some((projection) => projection.unitNumber === '604'), true);
  assert.equal(crewReported.some((projection) => projection.unitNumber === '603'), true);
  assert.deepEqual(searched.map((projection) => projection.unitNumber), ['1305']);
  assert.equal(jul28SyntheticTurnBoardRepository.listUnits(), units);
});
