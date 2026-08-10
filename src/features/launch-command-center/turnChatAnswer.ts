import {
  projectTrackCCrewDetail,
  projectTrackCTradeProgress,
  projectTrackCUnitWork,
  projectTrackCWalkCandidates,
} from '../wave2a2-track-c/projections';
import {
  trackCSectionLabel,
  type TrackCState,
  type TrackCTrade,
  type TrackCWorkProjection,
} from '../wave2a2-track-c/model';

// Turn Chat's INSTANT brain — answers straight from the phone's own board
// data: no AI, no network, no sign-in, free, works in a dead zone. Every
// answer is a tappable card that navigates to the real screen. The AI
// interpreter only gets involved for command sentences this brain can't
// answer (TurnChat decides that, not this module).

export type TurnChatNav =
  | { readonly kind: 'unit'; readonly unitId: string; readonly trade?: TrackCTrade }
  | { readonly kind: 'crew'; readonly crewId: string }
  | { readonly kind: 'board' };

export interface TurnChatLine {
  readonly text: string;
  readonly nav?: TurnChatNav;
}

export interface TurnChatCard {
  readonly title: string;
  readonly subtitle?: string;
  readonly lines: readonly TurnChatLine[];
  readonly nav?: TurnChatNav;
}

export interface TurnChatAnswer {
  readonly cards: readonly TurnChatCard[];
  /** Plain one-liner when there is nothing card-shaped to show. */
  readonly note?: string;
}

const tradeWord = (trade: TrackCTrade) => (trade === 'paint' ? 'Paint' : 'Clean');

const TASK_SHORT: Record<string, string> = {
  'cut-in': 'cut-in',
  full: 'full',
  'full-cut-in': 'full+cut',
  'heavy-clean': 'heavy',
  'touch-up': 'touch-up',
  'touch-up-cut-in': 'touch+cut',
};

// One word per room, the way Los reads the board.
const roomStatus = (work: TrackCWorkProjection): string => {
  if (work.release !== 'released') return 'not released';
  if (work.callbackOpen) return 'CALLBACK';
  if (work.property === 'property-accepted') return 'Accepted';
  if (work.inspection === 'los-passed') return 'Passed';
  if (work.execution === 'crew-reported-complete') return 'Inspect';
  if (work.execution === 'working') return 'Working';
  if (work.activeCrewIds.length > 0) return 'Assigned';
  return 'Released';
};

const roomLabel = (work: TrackCWorkProjection): string => {
  const section = trackCSectionLabel(work.section);
  const task = work.trade === 'paint'
    ? ` ${TASK_SHORT[work.workType ?? 'full']}`
    : work.workType === 'heavy-clean' ? ' heavy' : '';
  return `${section}${task} · ${roomStatus(work)}`;
};

const unitCard = (state: TrackCState, unitId: string): TurnChatCard | undefined => {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return undefined;
  const lines: TurnChatLine[] = [];
  for (const trade of ['paint', 'clean'] as const) {
    const progress = projectTrackCTradeProgress(state, unit.id, trade);
    if (progress.applicable === 0) continue;
    const crewNames = progress.crewIds
      .map((crewId) => state.crews.find((crew) => crew.id === crewId)?.name)
      .filter(Boolean)
      .join(', ');
    lines.push({
      nav: { kind: 'unit', trade, unitId: unit.id },
      text: `${tradeWord(trade)} — ${progress.conciseLabel}${crewNames ? ` · ${crewNames}` : ''}`,
    });
    const released = projectTrackCUnitWork(state, unit.id)
      .filter((item) => item.trade === trade && item.release === 'released');
    if (released.length > 0) {
      lines.push({
        nav: { kind: 'unit', trade, unitId: unit.id },
        text: released.map(roomLabel).join('  ·  '),
      });
    }
  }
  if (lines.length === 0) {
    lines.push({ text: 'Nothing released for this unit yet.' });
  }
  return {
    lines,
    nav: { kind: 'unit', unitId: unit.id },
    subtitle: unit.unitType,
    title: unit.unitNumber,
  };
};

const crewCard = (state: TrackCState, crewId: string): TurnChatCard | undefined => {
  const detail = projectTrackCCrewDetail(state, crewId);
  if (!detail) return undefined;
  const { crew, stats } = detail;
  const byUnit = new Map<string, TrackCWorkProjection[]>();
  for (const work of detail.currentWork) {
    const list = byUnit.get(work.unitId) ?? [];
    list.push(work);
    byUnit.set(work.unitId, list);
  }
  const lines: TurnChatLine[] = [...byUnit.entries()].map(([unitId, work]) => {
    const unitNumber = state.units.find((unit) => unit.id === unitId)?.unitNumber ?? unitId;
    return {
      nav: { kind: 'unit', trade: crew.trade, unitId },
      text: `${unitNumber} — ${work.map(roomLabel).join('  ·  ')}`,
    };
  });
  if (lines.length === 0) lines.push({ text: 'Nothing on their plate right now.' });
  const bits = [
    stats.currentAssignments > 0 ? `${stats.currentAssignments} rooms on` : '',
    stats.needsLosInspection > 0 ? `${stats.needsLosInspection} to inspect` : '',
    stats.openCallbacks > 0 ? `${stats.openCallbacks} callback${stats.openCallbacks === 1 ? '' : 's'}` : '',
    `${stats.propertyAccepted} accepted`,
  ].filter(Boolean);
  return {
    lines,
    nav: { kind: 'crew', crewId: crew.id },
    subtitle: bits.join(' · '),
    title: `${crew.name} — ${tradeWord(crew.trade)}`,
  };
};

const callbacksCard = (state: TrackCState): TurnChatCard => {
  const lines: TurnChatLine[] = [];
  for (const unit of state.units) {
    for (const trade of ['paint', 'clean'] as const) {
      const open = projectTrackCUnitWork(state, unit.id)
        .filter((item) => item.trade === trade && item.callbackOpen);
      if (open.length === 0) continue;
      lines.push({
        nav: { kind: 'unit', trade, unitId: unit.id },
        text: `${unit.unitNumber} ${tradeWord(trade)} — ${open
          .map((item) => trackCSectionLabel(item.section)).join(', ')}`,
      });
    }
  }
  return {
    lines: lines.length > 0 ? lines : [{ text: 'No open callbacks right now.' }],
    title: `Open callbacks · ${lines.length}`,
  };
};

const readyToWalkCard = (state: TrackCState): TurnChatCard => {
  const candidates = projectTrackCWalkCandidates(state);
  const lines: TurnChatLine[] = candidates.map((candidate) => ({
    nav: { kind: 'unit', trade: candidate.trade, unitId: candidate.target.unitId },
    text: `${candidate.unitNumber} ${tradeWord(candidate.trade)} — ${candidate.sectionCount} room${candidate.sectionCount === 1 ? '' : 's'}`,
  }));
  return {
    lines: lines.length > 0 ? lines : [{ text: 'Nothing is ready to walk yet.' }],
    title: `Ready to walk · ${candidates.length}`,
  };
};

const inspectCard = (state: TrackCState): TurnChatCard => {
  const lines: TurnChatLine[] = [];
  for (const unit of state.units) {
    for (const trade of ['paint', 'clean'] as const) {
      const waiting = projectTrackCUnitWork(state, unit.id).filter((item) =>
        item.trade === trade && item.inspection === 'needs-los-inspection');
      if (waiting.length === 0) continue;
      lines.push({
        nav: { kind: 'unit', trade, unitId: unit.id },
        text: `${unit.unitNumber} ${tradeWord(trade)} — ${waiting
          .map((item) => trackCSectionLabel(item.section)).join(', ')}`,
      });
    }
  }
  return {
    lines: lines.length > 0 ? lines : [{ text: 'Nothing is waiting on your inspection.' }],
    title: `Waiting on your inspection · ${lines.length}`,
  };
};

const todayCard = (state: TrackCState): TurnChatCard => {
  const lines: TurnChatLine[] = (['paint', 'clean'] as const).map((trade) => {
    let released = 0;
    let working = 0;
    let inspect = 0;
    let accepted = 0;
    let callbacks = 0;
    for (const unit of state.units) {
      for (const work of projectTrackCUnitWork(state, unit.id)) {
        if (work.trade !== trade || work.release !== 'released') continue;
        released += 1;
        if (work.callbackOpen) callbacks += 1;
        else if (work.property === 'property-accepted') accepted += 1;
        else if (work.inspection === 'needs-los-inspection') inspect += 1;
        else if (work.execution === 'working') working += 1;
      }
    }
    return {
      nav: { kind: 'board' as const },
      text: `${tradeWord(trade)} — ${released} rooms released · ${working} working · ${inspect} to inspect · ${callbacks} callbacks · ${accepted} accepted`,
    };
  });
  return { lines, nav: { kind: 'board' }, title: 'Where we are' };
};

// Compact board digest for the AI chat turn — the model's ONLY source of
// numbers. One terse line per active unit keeps a full turn under ~2K tokens.
export const buildTurnChatDigest = (state: TrackCState): string => {
  const lines: string[] = [];
  const crewLine = state.crews
    .filter((crew) => crew.activeToday !== false)
    .map((crew) => `${crew.name} (${crew.trade})`)
    .join(', ');
  for (const trade of ['paint', 'clean'] as const) {
    let released = 0;
    let working = 0;
    let inspect = 0;
    let accepted = 0;
    let callbacks = 0;
    for (const unit of state.units) {
      for (const work of projectTrackCUnitWork(state, unit.id)) {
        if (work.trade !== trade || work.release !== 'released') continue;
        released += 1;
        if (work.callbackOpen) callbacks += 1;
        else if (work.property === 'property-accepted') accepted += 1;
        else if (work.inspection === 'needs-los-inspection') inspect += 1;
        else if (work.execution === 'working') working += 1;
      }
    }
    lines.push(`${tradeWord(trade).toUpperCase()}: ${released} rooms released, ${working} working, ${inspect} to inspect, ${callbacks} callbacks, ${accepted} accepted`);
  }
  lines.push(`CREWS: ${crewLine || 'none'}`);
  lines.push('ACTIVE UNITS (room task=status; P=Paint C=Clean; rooms not listed are done/accepted):');
  let activeCount = 0;
  for (const unit of state.units) {
    const parts: string[] = [];
    for (const trade of ['paint', 'clean'] as const) {
      const open = projectTrackCUnitWork(state, unit.id).filter((work) =>
        work.trade === trade
        && work.release === 'released'
        && work.property !== 'property-accepted');
      if (open.length === 0) continue;
      const crewNames = [...new Set(open.flatMap((work) => work.activeCrewIds))]
        .map((crewId) => state.crews.find((crew) => crew.id === crewId)?.name)
        .filter(Boolean)
        .join('+');
      parts.push(`${trade === 'paint' ? 'P' : 'C'}${crewNames ? `[${crewNames}]` : ''} ${open
        .map((work) => `${trackCSectionLabel(work.section)}${work.trade === 'paint' ? `=${work.workType ?? 'full'}` : work.workType === 'heavy-clean' ? '=heavy' : ''}:${roomStatus(work)}`)
        .join(' ')}`);
    }
    if (parts.length === 0) continue;
    activeCount += 1;
    if (activeCount > 140) continue;
    lines.push(`${unit.unitNumber} ${parts.join(' | ')}`);
  }
  if (activeCount > 140) {
    lines.push(`(+${activeCount - 140} more active units not listed)`);
  }
  return lines.join('\n');
};

// ——— query routing ———

export const answerTurnChat = (
  state: TrackCState,
  rawQuery: string,
): TurnChatAnswer | null => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return null;

  // Unit numbers first — the question Los asks most, answered fastest.
  const numbers = [...new Set(rawQuery.match(/\d{3,4}/g) ?? [])];
  const matchedUnits = numbers
    .map((unitNumber) => state.units.find((unit) => unit.unitNumber === unitNumber))
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit));
  if (matchedUnits.length > 0) {
    const cards = matchedUnits.slice(0, 4)
      .map((unit) => unitCard(state, unit.id))
      .filter((card): card is TurnChatCard => Boolean(card));
    if (cards.length > 0) return { cards };
  }

  // A crew's day: "rocky", "rocky today", "what's sandra on".
  const crew = state.crews.find((candidate) => {
    const first = candidate.name.trim().toLowerCase().split(/\s+/)[0];
    return first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(query);
  });
  if (crew) {
    const card = crewCard(state, crew.id);
    if (card) return { cards: [card] };
  }

  if (/callback/.test(query)) return { cards: [callbacksCard(state)] };
  if (/\bwalk|ready\b/.test(query)) return { cards: [readyToWalkCard(state)] };
  if (/inspect|check\b/.test(query)) return { cards: [inspectCard(state)] };
  if (/\bleft\b|remaining|pending|today|status|where (are|r) we|how (are|r) we/.test(query)) {
    return { cards: [todayCard(state)] };
  }

  // A unit number was said but none matched the roster — say so plainly.
  if (numbers.length > 0 && matchedUnits.length === 0) {
    return {
      cards: [],
      note: `${numbers.join(', ')} — not in your roster. Check the number?`,
    };
  }

  return null;
};
