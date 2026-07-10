import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealTurnProject, importUnitsFromCsv } from '../src/lib/actions.ts';
import { seedData } from '../src/data/seed.ts';
import { toCsv } from '../src/lib/exporters.ts';
import {
  buildUnitCsvTemplate,
  parseUnitCsv,
  UNIT_CSV_MAX_ROWS,
  type UnitCsvRow,
} from '../src/lib/unitCsvImport.ts';
import type { AppData } from '../src/types.ts';

const cloneSeed = () => structuredClone(seedData);

const createEmptyRealTurn = () =>
  createRealTurnProject(cloneSeed(), {
    projectName: 'QA CSV Turn',
    propertyName: 'QA CSV Property',
    location: 'Austin, TX',
    startDate: '2026-07-10',
    endDate: '2026-07-24',
    supervisorName: 'Los',
    projectManagerName: 'Tony',
    buildingNames: ['Building A'],
    buildingCount: 1,
    floorsPerBuilding: 0,
    unitsPerFloor: 0,
    firstUnitNumber: 101,
    bedCount: 0,
    bathroomCount: 0,
    hasCommonArea: false,
    notes: 'Disposable CSV import test.',
  });

const row = (sourceRow: number, unitNumber: string, patch: Partial<UnitCsvRow> = {}): UnitCsvRow => ({
  sourceRow,
  unitNumber,
  bedCount: 0,
  bathroomCount: 0,
  hasCommonArea: false,
  notes: '',
  ...patch,
});

test('CSV parser handles aliases, quoted fields, existing units, duplicates, and ignored statuses', async () => {
  const csv = [
    '\ufeffUnit #,Building Name,Level,Bedrooms,Baths,Common Area,Notes,Overall Status,Vendor',
    'A-101,North,Floor 1,2,1,yes,"Needs, keys",Ready,PaintCo',
    'A-102,North,Floor 1,3,2,no,"Line one\nLine two",Painting,CleanCo',
    'A-101,North,Floor 1,2,1,yes,Duplicate,Ready,PaintCo',
    'A-103,North,Floor 1,2.5,1,maybe,Bad counts,Ready,PaintCo',
    'A-104,North,Floor 2,1,1,0,Already here,Ready,PaintCo',
  ].join('\n');

  const result = await parseUnitCsv(csv, { existingUnitNumbers: ['a-104'] });

  assert.equal(result.fatalErrors.length, 0);
  assert.equal(result.totalDataRows, 5);
  assert.deepEqual(result.rows.map((item) => item.unitNumber), ['A-101', 'A-102']);
  assert.deepEqual(result.rows[0], {
    sourceRow: 2,
    unitNumber: 'A-101',
    buildingName: 'North',
    floorName: 'Floor 1',
    bedCount: 2,
    bathroomCount: 1,
    hasCommonArea: true,
    notes: 'Needs, keys',
  });
  assert.equal(result.rows[1].notes, 'Line one\nLine two');
  assert.equal(result.skippedExisting.length, 1);
  assert.equal(result.skippedExisting[0].unitNumber, 'A-104');
  assert.equal(result.rowErrors.length, 2);
  assert.match(result.rowErrors[0].message, /Duplicate Unit A-101/);
  assert.match(result.rowErrors[1].message, /Beds must be a whole number/);
  assert.match(result.rowErrors[1].message, /Common area must be/);
  assert.ok(result.warnings.some((warning) => warning.includes('Status columns are ignored')));
  assert.ok(result.warnings.some((warning) => warning.includes('Vendor')));
});

test('CSV parser rejects missing headers, malformed quoting, oversized files, and excessive rows', async () => {
  const missingUnit = await parseUnitCsv('building,floor\nA,1');
  assert.match(missingUnit.fatalErrors.join(' '), /needs a Unit column/);

  const malformed = await parseUnitCsv('unit,notes\n101,"never closes');
  assert.match(malformed.fatalErrors.join(' '), /could not be parsed/);

  const excessiveRows = ['unit', ...Array.from({ length: UNIT_CSV_MAX_ROWS + 1 }, (_, index) => String(index + 1))].join('\n');
  const excessive = await parseUnitCsv(excessiveRows);
  assert.match(excessive.fatalErrors.join(' '), /maximum is 5,000/);
  assert.equal(excessive.rows.length, 0);

  const oversized = await parseUnitCsv(`unit,notes\n101,${'x'.repeat(2 * 1024 * 1024)}`);
  assert.match(oversized.fatalErrors.join(' '), /larger than 2 MB/);
});

test('CSV template is header-only and parses without fake unit rows', async () => {
  const template = buildUnitCsvTemplate();
  assert.equal(template, 'unit,building,floor,beds,bathrooms,common_area,notes\r\n');
  const result = await parseUnitCsv(template);
  assert.equal(result.fatalErrors.length, 0);
  assert.equal(result.totalDataRows, 0);
  assert.equal(result.rows.length, 0);
});

test('CSV import adds a complete Not Started unit graph without overwriting existing data', () => {
  const initial = createEmptyRealTurn();
  const projectId = initial.activeProjectId;
  const activityBefore = initial.activityLogs.length;
  const first = importUnitsFromCsv(initial, projectId, [
    row(2, '101', { bedCount: 2, bathroomCount: 1, notes: 'Original note' }),
    row(3, '102', { bedCount: 3, bathroomCount: 2, hasCommonArea: true }),
    row(4, 'B201', { buildingName: 'Building B', floorName: 'Floor 2', bedCount: 4, bathroomCount: 2 }),
  ]);

  assert.equal(first.status, 'applied');
  assert.equal(first.importedCount, 3);
  assert.equal(first.createdBuildings, 1);
  assert.equal(first.createdFloors, 2);
  assert.equal(initial.units.filter((unit) => unit.projectId === projectId).length, 0, 'input state must stay immutable');
  assert.equal(first.data.activityLogs.length, activityBefore + 1);
  assert.equal(first.data.activityLogs[0].action, 'Imported units from CSV');

  const imported = first.data.units.filter((unit) => unit.projectId === projectId);
  assert.equal(imported.length, 3);
  for (const unit of imported) {
    assert.equal(unit.overallStatus, 'Not Started');
    assert.equal(unit.paintStatus, 'Not Started');
    assert.equal(unit.cleanStatus, 'Not Started');
    assert.equal(unit.repairStatus, 'Not Started');
    assert.equal(unit.inspectionStatus, 'Not Started');
    assert.equal(unit.flooringStatus, 'Not Applicable');
    assert.deepEqual(unit.assignedCrewIds, []);
  }

  const buildingA = first.data.buildings.find((building) => building.projectId === projectId && building.name === 'Building A');
  const buildingB = first.data.buildings.find((building) => building.projectId === projectId && building.name === 'Building B');
  assert.ok(buildingA);
  assert.ok(buildingB);
  assert.ok(first.data.floors.some((floor) => floor.buildingId === buildingA.id && floor.name === 'Unassigned Floor'));
  assert.ok(first.data.floors.some((floor) => floor.buildingId === buildingB.id && floor.name === 'Floor 2'));

  const project = first.data.projects.find((item) => item.id === projectId);
  assert.equal(project?.estimatedBuildings, 2);
  assert.equal(project?.estimatedUnits, 3);
  assert.equal(project?.estimatedBeds, 9);
  assert.equal(project?.estimatedCommonAreas, 1);

  const second = importUnitsFromCsv(first.data, projectId, [
    row(2, '101', { bedCount: 50, notes: 'Must not overwrite' }),
    row(3, '103', { bedCount: 1, notes: 'New unit' }),
    row(4, '103', { bedCount: 9, notes: 'Duplicate source row' }),
    { sourceRow: 5, unitNumber: '', bedCount: -1 } as unknown as UnitCsvRow,
  ]);
  assert.equal(second.status, 'applied');
  assert.equal(second.importedCount, 1);
  assert.equal(second.skippedExisting, 1);
  assert.equal(second.skippedDuplicates, 1);
  assert.equal(second.skippedInvalid, 1);
  const unit101 = second.data.units.find((unit) => unit.projectId === projectId && unit.unitNumber === '101');
  assert.equal(unit101?.bedCount, 2);
  assert.equal(unit101?.notes, 'Original note');
});

test('CSV import reuses equivalent building and floor labels instead of duplicating structure', () => {
  const initial = createRealTurnProject(cloneSeed(), {
    projectName: 'QA Structure Match Turn',
    propertyName: 'QA Structure Match Property',
    location: '',
    startDate: '',
    endDate: '',
    supervisorName: 'Los',
    projectManagerName: 'Tony',
    buildingNames: ['Building A'],
    buildingCount: 1,
    floorsPerBuilding: 1,
    unitsPerFloor: 0,
    firstUnitNumber: 101,
    bedCount: 0,
    bathroomCount: 0,
    hasCommonArea: false,
    notes: '',
  });
  const projectId = initial.activeProjectId;
  const result = importUnitsFromCsv(initial, projectId, [
    row(2, '101', { buildingName: 'A', floorName: '01' }),
    row(3, '102', { buildingName: 'Bldg A', floorName: '1st Floor' }),
  ]);

  assert.equal(result.status, 'applied');
  assert.equal(result.createdBuildings, 0);
  assert.equal(result.createdFloors, 0);
  const projectBuildings = result.data.buildings.filter((building) => building.projectId === projectId);
  const buildingIds = new Set(projectBuildings.map((building) => building.id));
  const projectFloors = result.data.floors.filter((floor) => buildingIds.has(floor.buildingId));
  assert.equal(projectBuildings.length, 1);
  assert.equal(projectFloors.length, 1);
  assert.equal(result.data.units.filter((unit) => unit.projectId === projectId).length, 2);
});

test('CSV import refuses Demo Mode, stale project previews, row overflow, and all-existing batches', () => {
  const demoData = cloneSeed();
  const demoResult = importUnitsFromCsv(demoData, seedData.activeProjectId, [row(2, '999')]);
  assert.equal(demoResult.status, 'not-real');
  assert.equal(demoResult.data, demoData);

  const real = createEmptyRealTurn();
  const projectId = real.activeProjectId;
  const demoProjectId = real.projects.find((project) => project.mode === 'demo')?.id;
  assert.ok(demoProjectId);
  const staleData: AppData = { ...real, activeProjectId: demoProjectId };
  const stale = importUnitsFromCsv(staleData, projectId, [row(2, '999')]);
  assert.equal(stale.status, 'project-changed');
  assert.equal(stale.data, staleData);

  const overflowRows = Array.from({ length: UNIT_CSV_MAX_ROWS + 1 }, (_, index) => row(index + 2, String(index + 1)));
  const overflow = importUnitsFromCsv(real, projectId, overflowRows);
  assert.equal(overflow.status, 'row-limit');
  assert.equal(overflow.data, real);

  const first = importUnitsFromCsv(real, projectId, [row(2, '101')]);
  const existingOnly = importUnitsFromCsv(first.data, projectId, [row(2, '101')]);
  assert.equal(existingOnly.status, 'nothing-to-import');
  assert.equal(existingOnly.skippedExisting, 1);
  assert.equal(existingOnly.data, first.data);
});

test('CSV exports neutralize spreadsheet formula cells', () => {
  const csv = toCsv([{ note: '=HYPERLINK("https://example.invalid")' }], [{ key: 'note', label: 'Note' }]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /\n"=HYPERLINK/);
});
