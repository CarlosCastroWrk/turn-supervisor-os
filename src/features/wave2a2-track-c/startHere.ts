import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import type { TrackCState, TrackCTrade } from './model';
import { trackCSectionLabel } from './model';
import { projectTrackCUnitWork } from './projections';
import { localDayOf } from '../../lib/localDay';

export interface StartHereItem {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly trade: TrackCTrade;
  // Rooms that still need work (not yet Los-passed), in board order.
  readonly rooms: readonly string[];
  // Crew(s) already on it — named so Los can tell them to pick up where they left off.
  readonly crewNames: readonly string[];
  readonly stage: 'no-crew' | 'in-progress';
  // Earliest release timestamp (ISO) — drives the "released Aug 5" line.
  readonly since: string;
}

// Local-calendar day from a UTC ISO — evening work still counts as that day
// (CLAUDE.md guardrail #5: never slice the ISO string).
const localDay = (iso: string): string => {
  const date = new Date(iso);
  return localDayOf(date);
};

// "Start here" = work RELEASED ON AN EARLIER DAY that still isn't finished:
// released, access clear, not property-accepted, no open callback, and at least
// one room not yet Los-passed. Splits into no-crew (needs assigning) vs
// in-progress (a crew started but didn't finish — named so Los can remind them
// to start there). Sorted top-floor-first, matching how Los reads his board.
export const projectStartHere = (
  state: TrackCState,
  currentDate: string,
): StartHereItem[] => {
  const crewName = new Map(state.crews.map((crew) => [crew.id, crew.name]));
  const items: StartHereItem[] = [];
  for (const unit of state.units) {
    for (const trade of ['paint', 'clean'] as const) {
      const work = projectTrackCUnitWork(state, unit.id).filter((item) =>
        item.trade === trade
        && item.release === 'released'
        && item.access === 'clear'
        && item.property !== 'property-accepted'
        && !item.callbackOpen);
      if (work.length === 0) continue;
      // All rooms Los-passed = awaiting the walk, not "start here".
      const remaining = work.filter((item) => item.inspection !== 'los-passed');
      if (remaining.length === 0) continue;
      const earliest = work
        .map((item) => item.releasedAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0];
      // Only carryover — first released on an earlier local day than today.
      if (!earliest || localDay(earliest) >= currentDate) continue;
      const crewIds = [...new Set(work.flatMap((item) => item.activeCrewIds))];
      items.push({
        crewNames: crewIds.map((id) => crewName.get(id) ?? 'crew'),
        rooms: remaining.map((item) => trackCSectionLabel(item.section)),
        since: earliest,
        stage: crewIds.length > 0 ? 'in-progress' : 'no-crew',
        trade,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
      });
    }
  }
  return items.sort((left, right) =>
    compareUnitTopFloorFirst(left.unitNumber, right.unitNumber)
    || left.trade.localeCompare(right.trade));
};
