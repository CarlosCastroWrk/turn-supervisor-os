import type { AppData } from '../../types';
import {
  createJul28AppDataTurnBoardRepository,
  type Jul28AppDataRepositoryError,
} from '../jul28-turnboard/adapters/appDataRepository';
import type {
  Jul28TurnBoardRepository,
  Jul28UnitRecord,
} from '../jul28-turnboard/model';

const emptyRepository: Jul28TurnBoardRepository = Object.freeze({
  source: 'personal-turn-os-unavailable',
  listUnits: () => [],
  getUnit: () => undefined,
});

export interface LaunchBoardRepositoryState {
  error?: Jul28AppDataRepositoryError;
  repository: Jul28TurnBoardRepository;
}

export const createLaunchBoardRepository = (
  data: Readonly<AppData>,
): LaunchBoardRepositoryState => {
  const result = createJul28AppDataTurnBoardRepository(data);
  if (!result.ok) {
    return {
      error: result.error,
      repository: emptyRepository,
    };
  }

  // The source adapter is deeply read-only. BoardFirst is also read-only, but its
  // older repository contract predates that type boundary. Clone once here so
  // no consumer can mutate the authoritative AppData snapshot by reference.
  const units = result.repository.listUnits().map((unit) =>
    structuredClone(unit) as unknown as Jul28UnitRecord
  );
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const repository: Jul28TurnBoardRepository = Object.freeze({
    source: result.repository.source,
    listUnits: () => units,
    getUnit: (unitId: string) => byId.get(unitId),
  });

  return { repository };
};
