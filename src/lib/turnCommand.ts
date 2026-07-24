import type { AppData } from '../types';

export interface TurnCommandUnitOption {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  floorName: string;
}

export interface TurnCommandSourceRequest {
  id: number;
  sourceText: string;
}

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export const normalizeTurnCommandUnitQuery = (value: string) =>
  normalized(value).replace(/^unit\s*#?\s*/i, '').trim();

export const buildTurnCommandUnitOptions = (
  data: Pick<AppData, 'activeProjectId' | 'buildings' | 'floors' | 'units'>,
): TurnCommandUnitOption[] => {
  const buildings = new Map(data.buildings.map((building) => [building.id, building.name]));
  const floors = new Map(data.floors.map((floor) => [floor.id, floor.name]));

  return data.units
    .filter((unit) => unit.projectId === data.activeProjectId)
    .map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      buildingName: buildings.get(unit.buildingId) ?? '',
      floorName: floors.get(unit.floorId) ?? '',
    }))
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true, sensitivity: 'base' }),
    );
};

const matchScore = (option: TurnCommandUnitOption, query: string) => {
  const unitNumber = normalized(option.unitNumber);
  const searchText = normalized(
    [option.unitNumber, option.buildingName, option.floorName].filter(Boolean).join(' '),
  );

  if (unitNumber === query) return 0;
  if (unitNumber.startsWith(query)) return 1;
  if (unitNumber.includes(query)) return 2;
  if (searchText.startsWith(query)) return 3;
  if (searchText.includes(query)) return 4;
  return Number.POSITIVE_INFINITY;
};

export const findTurnCommandUnitMatches = (
  options: TurnCommandUnitOption[],
  rawQuery: string,
  limit = 5,
) => {
  const query = normalizeTurnCommandUnitQuery(rawQuery);
  if (!query) {
    return [];
  }

  return options
    .map((option) => ({ option, score: matchScore(option, query) }))
    .filter((match) => Number.isFinite(match.score))
    .sort((left, right) =>
      left.score - right.score
      || left.option.unitNumber.localeCompare(right.option.unitNumber, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    )
    .slice(0, limit)
    .map((match) => match.option);
};

export const findExactTurnCommandUnitMatches = (
  options: TurnCommandUnitOption[],
  rawQuery: string,
) => {
  const query = normalizeTurnCommandUnitQuery(rawQuery);
  if (!query) {
    return [];
  }

  return options.filter((option) => normalized(option.unitNumber) === query);
};
