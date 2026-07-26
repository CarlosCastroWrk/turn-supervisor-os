import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jul28SectionTradeRecord, Jul28UnitRecord } from '../src/features/jul28-turnboard/model.ts';
import {
  projectJul28Blocker,
  projectJul28SectionFacts,
  projectJul28TradeProgress,
  projectJul28TurnBoard,
  projectJul28UnitCard,
  projectJul28UnitHistory,
  recordsForTrade,
  validateJul28SourceCoverage,
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

const getRecord = (
  unitNumber: string,
  trade: 'paint' | 'clean',
  section: 'common' | 'A' | 'B' | 'C' | 'D' | 'E',
) => {
  const record = recordsForTrade(getUnit(unitNumber), trade).find((candidate) => candidate.section === section);
  assert.ok(record, `Expected ${trade} ${section} record for Unit ${unitNumber}`);
  return record;
};

test('synthetic repository has exactly one Paint/Clean record per section and is deeply immutable', () => {
  const units = jul28SyntheticTurnBoardRepository.listUnits();
  const assignment = getRecord('602', 'paint', 'A').assignmentEpisodes[0];
  assert.ok(assignment);
  const originalWording = assignment.wording;

  assert.equal(jul28SyntheticTurnBoardRepository.source, 'synthetic-jul28-pattern-candidate');
  assert.equal(assertSyntheticFixtureCompleteness(), true);
  assert.equal(Object.isFrozen(units), true);
  assert.equal(Object.isFrozen(units[0]), true);
  assert.equal(Object.isFrozen(units[0]?.records), true);
  assert.equal(Object.isFrozen(assignment), true);
  assert.throws(() => {
    (units as Jul28UnitRecord[]).push(getUnit('602'));
  }, TypeError);
  assert.throws(() => {
    (assignment as { wording: string }).wording = 'mutated';
  }, TypeError);
  assert.equal(assignment.wording, originalWording);
});

test('coverage validation fails closed for a missing or duplicate section-trade record', () => {
  const complete = getUnit('602');
  const missing: Jul28UnitRecord = {
    ...complete,
    records: complete.records.filter((record) => !(record.trade === 'clean' && record.section === 'E')),
  };
  const duplicate: Jul28UnitRecord = {
    ...complete,
    records: [...complete.records, getRecord('602', 'paint', 'A')],
  };

  const missingCoverage = validateJul28SourceCoverage(missing);
  const duplicateCoverage = validateJul28SourceCoverage(duplicate);
  const progress = projectJul28TradeProgress(missing, 'paint');
  const card = projectJul28UnitCard(missing, 'paint');

  assert.equal(missingCoverage.complete, false);
  assert.deepEqual(missingCoverage.missingKeys, ['clean:E']);
  assert.equal(duplicateCoverage.complete, false);
  assert.deepEqual(duplicateCoverage.duplicateKeys, ['paint:A']);
  assert.equal(progress.applicableSectionCount, null);
  assert.equal(progress.readyForMyWalkCount, null);
  assert.equal(progress.losPassedSectionCount, null);
  assert.match(progress.label, /Source coverage incomplete/i);
  assert.equal(card.readyForMyWalkCount, null);
  assert.equal(card.attentionKind, 'source-coverage-incomplete');
  assert.equal(card.attentionLabel, 'Source coverage incomplete');
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

test('Unit 603 reports partial section readiness and never whole-Unit readiness', () => {
  const unit = getUnit('603');
  const sectionC = getRecord('603', 'paint', 'C');
  const projection = projectJul28UnitCard(unit, 'paint');
  const progress = projectJul28TradeProgress(unit, 'paint');
  const facts = projectJul28SectionFacts(sectionC);
  const blocker = projectJul28Blocker(sectionC, validateJul28SourceCoverage(unit));

  assert.equal(sectionC.crewExecution, 'crew-reported-complete');
  assert.equal(sectionC.access, 'occupied-or-restricted');
  assert.equal(sectionC.inspection, 'inspection-pending');
  assert.deepEqual(projection.readyForMyWalkSections, ['common', 'A', 'B', 'D']);
  assert.equal(projection.readyForMyWalkCount, 4);
  assert.equal(projection.attentionKind, 'inspection-blocked');
  assert.match(progress.label, /4 of 5 sections ready for my walk/i);
  assert.doesNotMatch(progress.label, /^ready for my walk$/i);
  assert.equal(facts.find((fact) => fact.key === 'crew-report')?.label, 'Crew reported complete');
  assert.equal(facts.find((fact) => fact.key === 'los-inspection')?.label, 'My inspection pending');
  assert.match(facts.find((fact) => fact.key === 'los-inspection')?.detail ?? '', /access prevents/i);
  assert.equal(blocker?.owner, 'Property contact / Tony');
  assert.match(blocker?.nextAction ?? '', /work window/i);
});

test('Unit 604C keeps release authority and assignment evidence separate and unresolved', () => {
  const unit = getUnit('604');
  const sectionC = getRecord('604', 'paint', 'C');
  const projection = projectJul28UnitCard(unit, 'paint');
  const facts = projectJul28SectionFacts(sectionC);
  const authorizationFact = facts.find((fact) => fact.key === 'authorization');
  const assignmentFact = facts.find((fact) => fact.key === 'assignment-evidence');

  assert.equal(sectionC.authorization, 'assignment-conflict');
  assert.equal(sectionC.assignmentEpisodes.filter((episode) => episode.active).length, 2);
  assert.equal(projection.attentionKind, 'assignment-conflict');
  assert.deepEqual(projection.duplicateAssignmentSections, ['C']);
  assert.equal(authorizationFact?.label, 'Assignment conflict');
  assert.match(authorizationFact?.detail ?? '', /separate fact/i);
  assert.equal(assignmentFact?.label, 'Conflicting assignment evidence');
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
  assert.equal(progress.readyForMyWalkCount, 0);
  assert.doesNotMatch(progress.label, /\bdone\b/i);
});

test('Paint and Clean remain independent and both summaries are projected on every Unit card', () => {
  const paintB = getRecord('1305', 'paint', 'B');
  const cleanB = getRecord('1305', 'clean', 'B');
  const projection = projectJul28UnitCard(getUnit('1305'), 'paint');

  assert.equal(paintB.crewExecution, 'crew-reported-complete');
  assert.equal(paintB.inspection, 'los-passed');
  assert.equal(cleanB.crewExecution, 'assigned');
  assert.equal(cleanB.inspection, 'inspection-pending');
  assert.notDeepEqual(projection.tradeSummaries.paint, projection.tradeSummaries.clean);
  assert.equal(projection.tradeSummaries.paint.trade, 'paint');
  assert.equal(projection.tradeSummaries.clean.trade, 'clean');
});

test('not applicable, occupied/restricted, access blocked, maintenance blocked, and accessible stay distinct', () => {
  const restricted = getRecord('602', 'paint', 'B');
  const notApplicable = getRecord('602', 'paint', 'E');
  const accessible = getRecord('602', 'paint', 'A');
  const accessBlocked: Jul28SectionTradeRecord = {
    ...accessible,
    access: 'access-blocked',
    restrictionLabel: undefined,
  };
  const maintenanceBlocked: Jul28SectionTradeRecord = {
    ...accessible,
    access: 'maintenance-blocked',
    restrictionLabel: undefined,
  };

  const restrictedFact = projectJul28SectionFacts(restricted).find((fact) => fact.key === 'access');
  const accessBlockedFact = projectJul28SectionFacts(accessBlocked).find((fact) => fact.key === 'access');
  const maintenanceFact = projectJul28SectionFacts(maintenanceBlocked).find((fact) => fact.key === 'access');
  const accessibleFact = projectJul28SectionFacts(accessible).find((fact) => fact.key === 'access');
  const notApplicableFacts = projectJul28SectionFacts(notApplicable);

  assert.equal(restrictedFact?.label, 'Occupied / restricted — do not enter');
  assert.equal(accessBlockedFact?.label, 'Access blocked');
  assert.equal(maintenanceFact?.label, 'Maintenance blocked');
  assert.doesNotMatch(maintenanceFact?.detail ?? '', /do not enter|no access restriction/i);
  assert.equal(accessibleFact?.label, 'Accessible');
  assert.match(accessibleFact?.detail ?? '', /No access restriction/i);
  assert.equal(notApplicableFacts[0]?.label, 'Not applicable');
  assert.match(notApplicableFacts[0]?.detail ?? '', /not complete or restricted/i);
});

test('current facts expose provenance and blockers expose owner, next action, and resolution', () => {
  const record = getRecord('604', 'paint', 'C');
  const facts = projectJul28SectionFacts(record);
  const blocker = projectJul28Blocker(record, validateJul28SourceCoverage(getUnit('604')));

  for (const key of [
    'authorization',
    'assignment-evidence',
    'access',
    'crew-report',
    'los-inspection',
    'property-walk',
    'paper-review',
  ]) {
    const fact = facts.find((candidate) => candidate.key === key);
    assert.ok(fact, `Expected current ${key} fact`);
    assert.ok(fact.provenance.sourceLabel);
    assert.ok(fact.provenance.recordedAt);
  }

  assert.ok(blocker?.owner);
  assert.ok(blocker?.nextAction);
  assert.ok(blocker?.resolution);
});

test('Unit history remains additive and preserves assignment plus crew-report records', () => {
  const history = projectJul28UnitHistory(getUnit('603'), 'paint', 'C');
  const ids = history.map((event) => event.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(history.some((event) => event.kind === 'authorization'), true);
  assert.equal(history.some((event) => event.kind === 'assignment'), true);
  assert.equal(history.some((event) => event.kind === 'crew-report'), true);
  assert.equal(history.some((event) => event.kind === 'los-inspection'), false);
});

test('all requested filters and search are deterministic and non-mutating', () => {
  const units = jul28SyntheticTurnBoardRepository.listUnits();
  const allFilters = { attention: 'all', buildingFloor: 'all', crew: 'all' } as const;
  const needsInspection = projectJul28TurnBoard(units, 'paint', { ...allFilters, attention: 'needs-inspection' });
  const propertyWalk = projectJul28TurnBoard(units, 'paint', { ...allFilters, attention: 'property-walk' });
  const accessBlocked = projectJul28TurnBoard(units, 'paint', { ...allFilters, attention: 'access-blocked' });
  const assignmentConflict = projectJul28TurnBoard(units, 'paint', { ...allFilters, attention: 'assignment-conflict' });
  const floor = projectJul28TurnBoard(units, 'paint', { ...allFilters, buildingFloor: 'Building B · Level 13' });
  const crew = projectJul28TurnBoard(units, 'clean', { ...allFilters, crew: 'Harbor Clean' });
  const searched = projectJul28TurnBoard(units, 'paint', allFilters, '3-bedroom 1305');

  assert.equal(needsInspection.some((projection) => projection.unitNumber === '603'), true);
  assert.equal(propertyWalk.some((projection) => projection.unitNumber === '1305'), true);
  assert.equal(accessBlocked.some((projection) => projection.unitNumber === '602'), true);
  assert.deepEqual(assignmentConflict.map((projection) => projection.unitNumber), ['604']);
  assert.deepEqual(floor.map((projection) => projection.unitNumber), ['1305']);
  assert.equal(crew.some((projection) => projection.unitNumber === '1305'), true);
  assert.deepEqual(searched.map((projection) => projection.unitNumber), ['1305']);
  assert.equal(jul28SyntheticTurnBoardRepository.listUnits(), units);
});

test('Wave 1 property-walk states remain read-only and no deferred approval state is encoded', () => {
  const serialized = JSON.stringify(jul28SyntheticTurnBoardRepository.listUnits());
  const propertyFact = projectJul28SectionFacts(getRecord('1305', 'paint', 'B'))
    .find((fact) => fact.key === 'property-walk');

  assert.match(propertyFact?.detail ?? '', /read-only/i);
  assert.match(propertyFact?.detail ?? '', /No positive property result or internal approval/i);
  assert.doesNotMatch(propertyFact?.detail ?? '', /property accepted|property rejected|PDS Approved/i);
  assert.doesNotMatch(serialized, /property-accepted|property-rejected|pds-approved/i);
});
