import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findExactTurnCommandUnitMatches,
  findTurnCommandUnitMatches,
  normalizeTurnCommandUnitQuery,
  type TurnCommandUnitOption,
} from '../src/lib/turnCommand.ts';

const units: TurnCommandUnitOption[] = [
  {
    unitId: 'unit_101_north',
    unitNumber: '101',
    buildingName: 'North',
    floorName: 'Floor 1',
  },
  {
    unitId: 'unit_101_south',
    unitNumber: '101',
    buildingName: 'South',
    floorName: 'Floor 1',
  },
  {
    unitId: 'unit_202',
    unitNumber: '202',
    buildingName: 'North',
    floorName: 'Floor 2',
  },
  {
    unitId: 'unit_1201',
    unitNumber: '1201',
    buildingName: 'Tower',
    floorName: 'Floor 12',
  },
];

test('normalizes a bare Unit lookup without interpreting surrounding command wording', () => {
  assert.equal(normalizeTurnCommandUnitQuery(' Unit #202 '), '202');
  assert.equal(normalizeTurnCommandUnitQuery('paint Unit 202'), 'paint unit 202');
});

test('orders exact and prefix Unit matches deterministically', () => {
  assert.deepEqual(
    findTurnCommandUnitMatches(units, 'Unit 202').map((unit) => unit.unitId),
    ['unit_202'],
  );
  assert.deepEqual(
    findTurnCommandUnitMatches(units, '1').map((unit) => unit.unitId),
    ['unit_101_north', 'unit_101_south', 'unit_1201'],
  );
});

test('keeps natural Unit word prefixes in Unit-number search mode', () => {
  const expectedUnitIds = [
    'unit_101_north',
    'unit_101_south',
    'unit_202',
    'unit_1201',
  ];

  for (const query of ['U', 'UN', 'UNI', 'UNIT']) {
    assert.deepEqual(
      findTurnCommandUnitMatches(units, query).map((unit) => unit.unitId),
      expectedUnitIds,
      `${query} did not retain the available Unit suggestions.`,
    );
  }

  assert.deepEqual(
    findTurnCommandUnitMatches(units, 'UNIT 1').map((unit) => unit.unitId),
    ['unit_101_north', 'unit_101_south', 'unit_1201'],
  );
});

test('bounds broad Unit-prefix suggestions without hiding the scroll range', () => {
  const manyUnits = Array.from({ length: 20 }, (_, index) => ({
    unitId: `unit_${100 + index}`,
    unitNumber: String(100 + index),
    buildingName: 'North',
    floorName: 'Floor 1',
  }));

  assert.deepEqual(
    findTurnCommandUnitMatches(manyUnits, 'U').map((unit) => unit.unitNumber),
    Array.from({ length: 12 }, (_, index) => String(100 + index)),
  );
});

test('keeps duplicate exact Unit numbers explicit instead of guessing one destination', () => {
  assert.deepEqual(
    findExactTurnCommandUnitMatches(units, '101').map((unit) => unit.unitId),
    ['unit_101_north', 'unit_101_south'],
  );
  assert.deepEqual(findExactTurnCommandUnitMatches(units, '202'), [units[2]]);
});

test('does not turn a production sentence into a Unit navigation match', () => {
  assert.deepEqual(findTurnCommandUnitMatches(units, 'Unit 202 paint is done'), []);
});
