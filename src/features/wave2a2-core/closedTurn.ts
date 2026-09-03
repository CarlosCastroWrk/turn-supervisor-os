import type { AppData, Project } from '../../types';
import type { TrackCState } from '../wave2a2-track-c/model';
import { componentTotals, type CrewPayroll } from '../wave2a2-track-c/crewPayroll';
import { localDayOf } from '../../lib/localDay';

// Close Turn = seal the ACTIVE project in place. Unlike the legacy
// archiveProject (src/lib/actions.ts), closing does NOT switch activeProjectId
// away: the sealed turn stays front and center as the saved record Los can
// browse read-only. The write gate lives in the host (every commit path flows
// through one choke point there); these writers are the only sanctioned
// mutations while sealed.

const OPEN_SESSION_STATUSES = new Set(['active', 'ending', 'reopened']);

export const activeProjectOf = (data: AppData): Project | undefined =>
  data.projects.find((project) => project.id === data.activeProjectId);

export const isTurnClosed = (data: AppData): boolean =>
  Boolean(activeProjectOf(data)?.archivedAt);

export type CloseTurnResult =
  | { readonly ok: true; readonly data: AppData }
  | { readonly ok: false; readonly reason: string };

export const closeActiveTurn = (data: AppData, nowIso: string): CloseTurnResult => {
  const project = activeProjectOf(data);
  if (!project) return { ok: false, reason: 'No active turn to close.' };
  if (project.mode !== 'real') {
    return { ok: false, reason: 'Only a real turn can be sealed.' };
  }
  if (project.archivedAt) {
    return { ok: false, reason: `${project.name} is already sealed.` };
  }
  const openSession = data.daySessions.find((session) =>
    session.projectId === project.id && OPEN_SESSION_STATUSES.has(session.status));
  if (openSession) {
    return { ok: false, reason: 'End the day first — today is still open on Home.' };
  }
  return {
    ok: true,
    data: {
      ...data,
      activityLogs: [{
        action: 'Turn sealed',
        createdAt: nowIso,
        entityId: project.id,
        entityType: 'Project',
        id: `close-turn-${nowIso}`,
        note: `${project.name} closed read-only. Nothing was deleted — reopen anytime from More.`,
        projectId: project.id,
      }, ...data.activityLogs],
      projects: data.projects.map((item) =>
        item.id === project.id
          ? { ...item, archivedAt: nowIso, endDate: localDayOf(nowIso), updatedAt: nowIso }
          : item),
    },
  };
};

export const reopenActiveTurn = (data: AppData, nowIso: string): CloseTurnResult => {
  const project = activeProjectOf(data);
  if (!project) return { ok: false, reason: 'No turn to reopen.' };
  if (!project.archivedAt) {
    return { ok: false, reason: `${project.name} is not sealed.` };
  }
  return {
    ok: true,
    data: {
      ...data,
      activityLogs: [{
        action: 'Turn reopened',
        createdAt: nowIso,
        entityId: project.id,
        entityType: 'Project',
        id: `reopen-turn-${nowIso}`,
        note: `${project.name} is live again — releases, crews, and payroll can change.`,
        projectId: project.id,
      }, ...data.activityLogs],
      projects: data.projects.map((item) => {
        if (item.id !== project.id) return item;
        const reopened = { ...item };
        delete reopened.archivedAt;
        return { ...reopened, updatedAt: nowIso };
      }),
    },
  };
};

// The saved-turn stat line. Counts come straight from the ledger (released
// facts) and the pay math (whole-Turn dedup) so the card always agrees with
// the board and the pay packet — never a snapshot that can drift.
export interface ClosedTurnSummary {
  readonly name: string;
  readonly propertyName: string;
  readonly startDate: string; // local YYYY-MM-DD ('' when unknown)
  readonly endDate: string;
  readonly dayCount: number;
  readonly unitCount: number; // units with at least one released room
  readonly paintRoomsReleased: number;
  readonly cleanRoomsReleased: number;
  readonly paintRoomsDone: number; // pay basis, whole Turn
  readonly cleanRoomsDone: number;
  readonly paintTypeLine: string; // "97 full · 41 touch-up · 23 cut-in" ('' when none)
  readonly paintCrews: readonly string[];
  readonly cleanCrews: readonly string[];
}

export const closedTurnSummary = (
  data: AppData,
  state: TrackCState,
  payroll: ReadonlyMap<string, CrewPayroll>,
): ClosedTurnSummary => {
  const project = activeProjectOf(data);
  const sessions = data.daySessions
    .filter((session) => session.projectId === data.activeProjectId)
    .map((session) => session.date)
    .sort();

  let paintReleased = 0;
  let cleanReleased = 0;
  let unitCount = 0;
  for (const unit of state.units) {
    let touched = false;
    for (const fact of unit.workFacts) {
      if (fact.release !== 'released') continue;
      touched = true;
      if (fact.trade === 'paint') paintReleased += 1;
      else cleanReleased += 1;
    }
    if (touched) unitCount += 1;
  }

  let paintDone = 0;
  let cleanDone = 0;
  const typeTally = { 'cut-in': 0, full: 0, 'full-cut-in': 0, 'touch-up': 0, 'touch-up-cut-in': 0 };
  for (const crew of payroll.values()) {
    for (const room of crew.rooms) {
      if (room.trade === 'paint') paintDone += 1;
      else cleanDone += 1;
    }
    for (const key of Object.keys(typeTally) as (keyof typeof typeTally)[]) {
      typeTally[key] += crew.turnTypes[key];
    }
  }
  const types = componentTotals(typeTally);
  const paintTypeLine = [
    types.full > 0 ? `${types.full} full` : '',
    types.touchUp > 0 ? `${types.touchUp} touch-up` : '',
    types.cutIn > 0 ? `${types.cutIn} cut-in` : '',
  ].filter(Boolean).join(' · ');

  const crewNames = (trade: 'paint' | 'clean') =>
    state.crews.filter((crew) => crew.trade === trade).map((crew) => crew.name);

  return {
    cleanCrews: crewNames('clean'),
    cleanRoomsDone: cleanDone,
    cleanRoomsReleased: cleanReleased,
    dayCount: sessions.length,
    endDate: project?.archivedAt ? localDayOf(project.archivedAt) : (sessions[sessions.length - 1] ?? project?.endDate ?? ''),
    name: project?.name ?? 'This turn',
    paintCrews: crewNames('paint'),
    paintRoomsDone: paintDone,
    paintRoomsReleased: paintReleased,
    paintTypeLine,
    propertyName: project?.propertyName || project?.name || '',
    startDate: sessions[0] ?? project?.startDate ?? '',
    unitCount,
  };
};
