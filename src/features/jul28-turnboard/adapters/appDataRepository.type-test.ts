import type {
  Jul28AppDataTurnBoardRepository,
  Jul28AppDataUnitRecord,
  Jul28TurnBoardReadBoundary,
} from './appDataRepository';

const assertReadonlySnapshotTypes = (
  repository: Jul28AppDataTurnBoardRepository,
  unit: Jul28AppDataUnitRecord,
) => {
  // @ts-expect-error Adapter snapshot scalars are read-only.
  unit.unitNumber = 'MUTATED';
  // @ts-expect-error Adapter section order is a read-only array.
  unit.sectionOrder.push('A');
  // @ts-expect-error Adapter records are a read-only array.
  unit.records.push();
  // @ts-expect-error Nested adapter metadata arrays are read-only.
  unit.adapterCoverage.mappedFields.push('unit.id');
  // @ts-expect-error Repository scalar metadata is read-only.
  repository.sourceLabel = 'MUTATED';
  // @ts-expect-error A deeply read-only snapshot is not the existing mutable Wave 1 record boundary.
  const existingBoundary: Jul28TurnBoardReadBoundary = repository;
  const record = unit.records[0];
  if (record) {
    // @ts-expect-error Nested section-record scalars are read-only.
    record.id = 'MUTATED';
  }
  void existingBoundary;
};

void assertReadonlySnapshotTypes;
