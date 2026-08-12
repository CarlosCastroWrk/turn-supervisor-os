import {
  projectTrackCCrewDetail,
  projectTrackCTradeProgress,
  projectTrackCUnitWork,
  projectTrackCWalkCandidates,
} from '../wave2a2-track-c/projections';
import {
  buildAllCrewPayroll,
  componentTotals,
  formatTypeTally,
  payWeekSunday,
} from '../wave2a2-track-c/crewPayroll';
import { payWeekNumberOf } from '../wave2a2-track-c/wallWeek';
import { crewFirstNameMatches } from '../../lib/constants';
import {
  crewCallbackTextBody,
  crewUnitsTextBody,
  type CrewTextRow,
  type CrewTextSection,
} from '../wave2a2-track-c/crewTextTemplates';
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
  /** One-tap copy payload (e.g. the crew's WhatsApp message, in Spanish). */
  readonly copy?: { readonly label: string; readonly text: string };
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

// Moon Tower numbering: the digits before the last two are the floor
// (1108 → 11, 903 → 9). locationLabel wins when the roster has it.
const floorOfUnit = (state: TrackCState, unitId: string): number | undefined => {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return undefined;
  const labeled = /floor\s*(\d+)/i.exec(unit.locationLabel ?? '');
  if (labeled) return Number(labeled[1]);
  if (!/^\d{3,4}$/.test(unit.unitNumber)) return undefined;
  return Number(unit.unitNumber.slice(0, -2));
};

const floorFromQuery = (query: string): number | undefined => {
  const match = /(?:floor|piso)\s*(\d{1,2})\b/.exec(query)
    ?? /\b(\d{1,2})(?:st|nd|rd|th)\s*(?:floor|piso)/.exec(query);
  return match ? Number(match[1]) : undefined;
};

const floorSuffix = (floor: number | undefined) =>
  floor === undefined ? '' : ` · floor ${floor}`;

const callbacksCard = (state: TrackCState, floor?: number): TurnChatCard => {
  const lines: TurnChatLine[] = [];
  for (const unit of state.units) {
    if (floor !== undefined && floorOfUnit(state, unit.id) !== floor) continue;
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
    title: `Open callbacks · ${lines.length}${floorSuffix(floor)}`,
  };
};

const readyToWalkCard = (state: TrackCState, floor?: number): TurnChatCard => {
  const candidates = projectTrackCWalkCandidates(state).filter((candidate) =>
    floor === undefined || floorOfUnit(state, candidate.target.unitId) === floor);
  const lines: TurnChatLine[] = candidates.map((candidate) => ({
    nav: { kind: 'unit', trade: candidate.trade, unitId: candidate.target.unitId },
    text: `${candidate.unitNumber} ${tradeWord(candidate.trade)} — ${candidate.sectionCount} room${candidate.sectionCount === 1 ? '' : 's'}`,
  }));
  return {
    lines: lines.length > 0 ? lines : [{ text: 'Nothing is ready to walk yet.' }],
    title: `Ready to walk · ${candidates.length}${floorSuffix(floor)}`,
  };
};

const inspectCard = (state: TrackCState, floor?: number): TurnChatCard => {
  const lines: TurnChatLine[] = [];
  for (const unit of state.units) {
    if (floor !== undefined && floorOfUnit(state, unit.id) !== floor) continue;
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
    title: `Waiting on your inspection · ${lines.length}${floorSuffix(floor)}`,
  };
};

// "Just floor 11" — every unit on the floor with anything still open, one
// tappable line each; accepted-and-done units summarized so "quiet" floors
// still read honestly.
const floorCard = (state: TrackCState, floor: number): TurnChatCard => {
  const lines: TurnChatLine[] = [];
  let doneUnits = 0;
  let offFloorUnits = 0;
  for (const unit of state.units) {
    if (floorOfUnit(state, unit.id) !== floor) { offFloorUnits += 1; continue; }
    const parts: string[] = [];
    for (const trade of ['paint', 'clean'] as const) {
      const open = projectTrackCUnitWork(state, unit.id).filter((work) =>
        work.trade === trade
        && work.release === 'released'
        && work.property !== 'property-accepted');
      if (open.length === 0) continue;
      parts.push(`${tradeWord(trade)}: ${open.map(roomLabel).join(', ')}`);
    }
    if (parts.length === 0) {
      const released = projectTrackCUnitWork(state, unit.id)
        .some((work) => work.release === 'released');
      if (released) doneUnits += 1;
      continue;
    }
    lines.push({
      nav: { kind: 'unit', unitId: unit.id },
      text: `${unit.unitNumber} — ${parts.join('  |  ')}`,
    });
  }
  if (offFloorUnits === state.units.length) {
    return { lines: [{ text: `No units on floor ${floor} in your roster.` }], title: `Floor ${floor}` };
  }
  if (doneUnits > 0 || lines.length === 0) {
    lines.push({
      text: lines.length === 0 && doneUnits === 0
        ? 'Nothing released on this floor yet.'
        : `${doneUnits} unit${doneUnits === 1 ? '' : 's'} fully accepted.`,
    });
  }
  const activeCount = lines.filter((line) => line.nav).length;
  return {
    lines,
    title: `Floor ${floor} · ${activeCount} active unit${activeCount === 1 ? '' : 's'}`,
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

const payLineText = (line: { beds: number; commons: number }) =>
  `${line.beds} bed${line.beds === 1 ? '' : 's'} + ${line.commons} common${line.commons === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// Payroll-sheet mode: "give me Rocky, Monday and today, least to greatest".
// Los fills his paper pay sheet crew by crew — he needs what each crew DID
// (crew-done, the pay basis) on specific DAYS, sorted lowest unit first.
// ---------------------------------------------------------------------------

const localDateOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const WEEKDAY_WORDS: readonly (readonly string[])[] = [
  ['sunday', 'domingo'],
  ['monday', 'lunes'],
  ['tuesday', 'martes'],
  ['wednesday', 'miercoles', 'miércoles'],
  ['thursday', 'jueves'],
  ['friday', 'viernes'],
  ['saturday', 'sabado', 'sábado'],
];

interface SheetDay { readonly date: string; readonly label: string }

const shortDayLabel = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' });
  return `${weekday} ${m}/${d}`;
};

// "monday and today" → the actual dates, oldest first. A weekday name means
// the most recent one (today included) — payroll always looks backward.
const daysFromQuery = (query: string, now: Date): SheetDay[] => {
  const days = new Map<string, string>();
  const today = localDateOf(now);
  if (/\btoday\b|\bhoy\b/.test(query)) days.set(today, `Today ${shortDayLabel(today)}`);
  if (/yesterday|ayer/.test(query)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    const key = localDateOf(date);
    days.set(key, `Yesterday ${shortDayLabel(key)}`);
  }
  for (let index = 0; index < WEEKDAY_WORDS.length; index += 1) {
    if (!WEEKDAY_WORDS[index].some((word) => query.includes(word))) continue;
    const delta = (now.getDay() - index + 7) % 7;
    const date = new Date(now);
    date.setDate(date.getDate() - delta);
    const key = localDateOf(date);
    if (!days.has(key)) {
      days.set(key, delta === 0 ? `Today ${shortDayLabel(key)}` : shortDayLabel(key));
    }
  }
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, label]) => ({ date, label }));
};

const PAY_TYPE_WORD: Readonly<Record<string, string>> = {
  'cut-in': 'cut-in',
  full: 'full',
  'full-cut-in': 'full + cut-in',
  'touch-up': 'touch-up',
  'touch-up-cut-in': 'touch-up + cut-in',
};

// One crew, day by day, lowest unit first, task per room — the exact order
// Los writes rows onto his payboard. Same deduped, release-gated payroll the
// packet uses, so the sheet and the packet can never disagree.
const payrollSheetCard = (
  state: TrackCState,
  crewId: string,
  now: Date,
  requestedDays?: readonly SheetDay[],
): TurnChatCard | undefined => {
  const crew = state.crews.find((candidate) => candidate.id === crewId);
  if (!crew) return undefined;
  const payroll = buildAllCrewPayroll(state, now).get(crewId);
  const rooms = payroll?.rooms ?? [];
  const days: SheetDay[] = requestedDays?.length
    ? [...requestedDays]
    : [...new Set(rooms.map((room) => room.date))]
      .filter((date) => date >= payWeekSunday(now.toISOString()))
      .sort()
      .map((date) => ({
        date,
        label: date === localDateOf(now) ? `Today ${shortDayLabel(date)}` : shortDayLabel(date),
      }));
  const lines: TurnChatLine[] = [];
  for (const day of days) {
    const dayRooms = rooms.filter((room) => room.date === day.date);
    const beds = dayRooms.filter((room) => room.section !== 'common').length;
    const commons = dayRooms.length - beds;
    lines.push({
      text: `— ${day.label} · ${payLineText({ beds, commons })}`,
    });
    if (dayRooms.length === 0) {
      lines.push({ text: '   nothing reported done' });
      continue;
    }
    // Lowest unit → greatest, each unit one row, rooms grouped by task.
    const byUnit = new Map<string, typeof dayRooms>();
    for (const room of dayRooms) {
      const bucket = byUnit.get(room.unitNumber) ?? [];
      bucket.push(room);
      byUnit.set(room.unitNumber, bucket);
    }
    const orderedUnits = [...byUnit.entries()]
      .sort(([left], [right]) => (Number(left) || 0) - (Number(right) || 0));
    for (const [unitNumber, unitRooms] of orderedUnits) {
      const byTask = new Map<string, string[]>();
      for (const room of unitRooms) {
        const task = room.trade === 'paint'
          ? PAY_TYPE_WORD[room.workType ?? 'full'] ?? 'full'
          : 'clean';
        const sections = byTask.get(task) ?? [];
        sections.push(room.section === 'common' ? 'Common' : room.section);
        byTask.set(task, sections);
      }
      const detail = [...byTask.entries()]
        .map(([task, sections]) => `${sections.join(', ')} ${task}`)
        .join(' · ');
      const unit = state.units.find((candidate) => candidate.unitNumber === unitNumber);
      lines.push({
        ...(unit ? { nav: { kind: 'unit' as const, trade: crew.trade, unitId: unit.id } } : {}),
        text: `${unitNumber} — ${detail}`,
      });
    }
  }
  if (lines.length === 0) lines.push({ text: 'Nothing reported done yet.' });
  return {
    lines,
    nav: { kind: 'crew', crewId },
    subtitle: 'what they DID (crew-done) · lowest unit first · same math as the pay packet',
    title: `${crew.name} — pay sheet`,
  };
};

// "What did Rocky do this week" — answered from the SAME payroll math the
// pay packet uses, so chat and packet can never disagree. Free and instant.
const payrollCard = (
  state: TrackCState,
  crewId: string,
  now: Date,
): TurnChatCard | undefined => {
  const crew = state.crews.find((candidate) => candidate.id === crewId);
  if (!crew) return undefined;
  const payroll = buildAllCrewPayroll(state, now).get(crewId);
  const weekNumber = payWeekNumberOf(now.toISOString());
  if (!payroll) {
    return {
      lines: [{ text: 'Nothing reported done yet.' }],
      nav: { kind: 'crew', crewId },
      title: `${crew.name} — pay week ${weekNumber}`,
    };
  }
  const weekSunday = payWeekSunday(now.toISOString());
  const weekDays = payroll.perDay.filter((day) => day.date >= weekSunday);
  const weekTypes = weekDays.reduce((tally, day) => ({
    'cut-in': tally['cut-in'] + day.types['cut-in'],
    full: tally.full + day.types.full,
    'full-cut-in': tally['full-cut-in'] + day.types['full-cut-in'],
    'touch-up': tally['touch-up'] + day.types['touch-up'],
    'touch-up-cut-in': tally['touch-up-cut-in'] + day.types['touch-up-cut-in'],
  }), { 'cut-in': 0, full: 0, 'full-cut-in': 0, 'touch-up': 0, 'touch-up-cut-in': 0 });
  const typeLine = formatTypeTally(weekTypes);
  const lines: TurnChatLine[] = [
    { text: `This week: ${payLineText(payroll.week)}${typeLine ? ` — ${typeLine}` : ''}` },
    { text: `Today: ${payLineText(payroll.today)}` },
    { text: `Whole Turn: ${payLineText(payroll.turn)}` },
    ...weekDays.map((day) => {
      const dayTypes = formatTypeTally(day.types);
      const [, month, dayNum] = day.date.split('-');
      return { text: `${Number(month)}/${Number(dayNum)}: ${payLineText(day.line)}${dayTypes ? ` (${dayTypes})` : ''}` };
    }),
  ];
  return {
    lines,
    nav: { kind: 'crew', crewId },
    subtitle: 'counts = done rooms · full+cut counts as full AND cut-in',
    title: `${crew.name} — pay week ${weekNumber}`,
  };
};

// One extras row as the host computes them for the Crews sheet — cut-ins,
// heavy cleans, change orders, textures, drywall. Passed in so the chat can
// answer "how many textures happened" from the same list Los verifies ✓.
export interface TurnChatExtra {
  readonly id: string;
  readonly kind: 'cut-in' | 'heavy-clean' | 'change-order' | 'texture' | 'drywall';
  readonly unitNumber: string;
  readonly crew: string;
  readonly detail: string;
  readonly at: string;
  readonly week: number;
}

// "Pass me the assigned units that were released on Monday" — TurnBoard
// format: lowest unit first, rooms grouped by task, → who's on it. Straight
// from the release facts (releasedAt) so it matches the wall grid.
const releasedOnDayCard = (
  state: TrackCState,
  days: readonly SheetDay[],
  query: string,
  extras: readonly TurnChatExtra[],
): TurnChatCard => {
  const tradeFilter: TrackCTrade | undefined =
    /paint|pintur/.test(query) ? 'paint' : /clean|limpi/.test(query) ? 'clean' : undefined;
  const onlyAssigned = /assign|asigna/.test(query) && !/unassigned|sin asignar/.test(query);
  const onlyUnassigned = /unassigned|sin asignar/.test(query);
  const crewNameById = new Map(state.crews.map((crew) => [crew.id, crew.name]));
  const lines: TurnChatLine[] = [];
  let totalRooms = 0;
  for (const day of days) {
    interface Row { rooms: { section: string; task: string }[]; crews: Set<string>; trade: TrackCTrade }
    const byUnit = new Map<string, Row>();
    for (const unit of state.units) {
      for (const work of projectTrackCUnitWork(state, unit.id)) {
        if (work.release !== 'released' || !work.releasedAt) continue;
        if (tradeFilter && work.trade !== tradeFilter) continue;
        if (localDateOf(new Date(work.releasedAt)) !== day.date) continue;
        const row = byUnit.get(unit.unitNumber)
          ?? { crews: new Set<string>(), rooms: [], trade: work.trade };
        row.rooms.push({
          section: work.section === 'common' ? 'Common' : work.section,
          task: work.trade === 'paint'
            ? PAY_TYPE_WORD[work.workType ?? 'full'] ?? 'full'
            : work.workType === 'heavy-clean' ? 'heavy clean' : 'clean',
        });
        for (const crewId of work.activeCrewIds) {
          const name = crewNameById.get(crewId);
          if (name) row.crews.add(name.split(/\s+/)[0]);
        }
        byUnit.set(unit.unitNumber, row);
      }
    }
    const units = [...byUnit.entries()]
      .filter(([, row]) => onlyAssigned ? row.crews.size > 0 : onlyUnassigned ? row.crews.size === 0 : true)
      .sort(([left], [right]) => (Number(left) || 0) - (Number(right) || 0));
    const dayRooms = units.reduce((sum, [, row]) => sum + row.rooms.length, 0);
    totalRooms += dayRooms;
    lines.push({ text: `— ${day.label} · ${units.length} unit${units.length === 1 ? '' : 's'} (${dayRooms} rooms)` });
    if (units.length === 0) {
      lines.push({ text: '   nothing released' });
    }
    for (const [unitNumber, row] of units) {
      const byTask = new Map<string, string[]>();
      for (const room of row.rooms) {
        const sections = byTask.get(room.task) ?? [];
        sections.push(room.section);
        byTask.set(room.task, sections);
      }
      const detail = [...byTask.entries()]
        .map(([task, sections]) => `${sections.join(', ')} ${task}`)
        .join(' · ');
      const who = row.crews.size > 0 ? ` → ${[...row.crews].join(' + ')}` : ' · unassigned';
      const unit = state.units.find((candidate) => candidate.unitNumber === unitNumber);
      lines.push({
        ...(unit ? { nav: { kind: 'unit' as const, trade: row.trade, unitId: unit.id } } : {}),
        text: `${unitNumber} — ${detail}${who}`,
      });
    }
    // The option he asked for: how many cut-ins / textures / change orders
    // rode along with that day.
    const cutRooms = units.reduce((sum, [, row]) =>
      sum + row.rooms.filter((room) => room.task.includes('cut-in')).length, 0);
    const dayExtras = extras.filter((extra) =>
      localDateOf(new Date(extra.at)) === day.date);
    const textures = dayExtras.filter((extra) => extra.kind === 'texture').length;
    const changeOrders = dayExtras.filter((extra) => extra.kind === 'change-order').length;
    if (cutRooms > 0 || textures > 0 || changeOrders > 0) {
      lines.push({
        text: `   extras that day: ${[
          cutRooms > 0 ? `${cutRooms} cut-in room${cutRooms === 1 ? '' : 's'}` : '',
          textures > 0 ? `${textures} texture${textures === 1 ? '' : 's'}` : '',
          changeOrders > 0 ? `${changeOrders} change order${changeOrders === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' · ')} — ask "textures ${day.label.toLowerCase().includes('today') ? 'today' : day.label.split(' ')[0].toLowerCase()}" for the list`,
      });
    }
  }
  return {
    lines,
    nav: { kind: 'board' },
    subtitle: `${onlyAssigned ? 'assigned only · ' : onlyUnassigned ? 'unassigned only · ' : ''}released rooms with their task · lowest unit first`,
    title: `Released — ${totalRooms} rooms`,
  };
};

// "How many textures / change orders happened (monday | this week | week 2)"
// — count + the list, from the same extras the Crews sheet verifies.
const extrasCard = (
  state: TrackCState,
  extras: readonly TurnChatExtra[],
  kinds: readonly TurnChatExtra['kind'][],
  days: readonly SheetDay[],
  week: number,
): TurnChatCard => {
  const scoped = extras.filter((extra) => kinds.includes(extra.kind)
    && (days.length > 0
      ? days.some((day) => localDateOf(new Date(extra.at)) === day.date)
      : extra.week === week));
  const kindWord = (kind: TurnChatExtra['kind']) =>
    kind === 'change-order' ? 'change order' : kind === 'heavy-clean' ? 'heavy clean' : kind;
  const scopeWord = days.length > 0 ? days.map((day) => day.label).join(' + ') : `week ${week}`;
  const counts = kinds
    .map((kind) => ({ count: scoped.filter((extra) => extra.kind === kind).length, kind }))
    .filter((entry) => entry.count > 0);
  const lines: TurnChatLine[] = [{
    text: counts.length > 0
      ? counts.map((entry) => `${entry.count} ${kindWord(entry.kind)}${entry.count === 1 ? '' : 's'}`).join(' · ')
      : `None logged ${scopeWord}.`,
  }];
  const ordered = [...scoped].sort((left, right) =>
    (Number(left.unitNumber) || 0) - (Number(right.unitNumber) || 0));
  for (const extra of ordered.slice(0, 30)) {
    const unit = state.units.find((candidate) => candidate.unitNumber === extra.unitNumber);
    lines.push({
      ...(unit ? { nav: { kind: 'unit' as const, unitId: unit.id } } : {}),
      text: `${extra.unitNumber} — ${extra.detail}${extra.crew ? ` (${extra.crew.split(/\s+/)[0]})` : ''}`,
    });
  }
  if (ordered.length > 30) lines.push({ text: `…and ${ordered.length - 30} more` });
  return {
    lines,
    nav: { kind: 'board' },
    subtitle: 'same list the Crews sheet verifies ✓ · lowest unit first',
    title: `${kinds.map(kindWord).join(' + ')} — ${scopeWord}`,
  };
};

// "Give me Rocky's list" — the crew's day from BOARD TRUTH: callbacks first
// (the board knows which rooms are callbacks — no more guessing in ChatGPT),
// then what's in front of them, plus the exact-format Spanish WhatsApp
// message ready to copy. Display is English; only the copy text is Spanish.
const crewListCard = (state: TrackCState, crewId: string): TurnChatCard | undefined => {
  const detail = projectTrackCCrewDetail(state, crewId);
  if (!detail) return undefined;
  const { crew } = detail;
  const firstName = crew.name.trim().split(/\s+/)[0];
  const groupByUnit = (work: readonly TrackCWorkProjection[]) => {
    const byUnit = new Map<string, TrackCWorkProjection[]>();
    for (const item of work) {
      const bucket = byUnit.get(item.unitId) ?? [];
      bucket.push(item);
      byUnit.set(item.unitId, bucket);
    }
    return [...byUnit.entries()].map(([unitId, rooms]) => ({
      rooms,
      unitId,
      unitNumber: state.units.find((unit) => unit.id === unitId)?.unitNumber ?? unitId,
    }));
  };
  const callbacks = groupByUnit(detail.openCallbackWork);
  const todays = groupByUnit(detail.currentWork.filter((item) =>
    ['assigned', 'working'].includes(item.execution) && !item.callbackOpen));

  const lines: TurnChatLine[] = [];
  if (callbacks.length > 0) {
    lines.push({ text: '⚠ Callbacks first:' });
    for (const unit of callbacks) {
      lines.push({
        nav: { kind: 'unit', trade: crew.trade, unitId: unit.unitId },
        text: `${unit.unitNumber} — ${unit.rooms.map(roomLabel).join('  ·  ')}`,
      });
    }
  }
  lines.push({ text: callbacks.length > 0 ? 'Then today’s list:' : 'Today’s list:' });
  if (todays.length === 0) lines.push({ text: 'Nothing assigned right now.' });
  for (const unit of todays) {
    lines.push({
      nav: { kind: 'unit', trade: crew.trade, unitId: unit.unitId },
      text: `${unit.unitNumber} — ${unit.rooms.map(roomLabel).join('  ·  ')}`,
    });
  }

  // The copy text uses the EXACT format Los already sends (Spanish default).
  const toTextRow = (unit: { unitNumber: string; rooms: TrackCWorkProjection[] }): CrewTextRow => {
    const beds = unit.rooms.filter((room) => room.section !== 'common');
    return {
      isStudio: crew.trade === 'clean' && beds.length === 0
        && unit.rooms.some((room) => room.section === 'common'),
      sections: unit.rooms.map((room): CrewTextSection => ({
        bed: room.section === 'common' ? undefined : room.section,
        kind: room.section === 'common' ? 'common' : 'bed',
        workType: room.workType as CrewTextSection['workType'],
      })),
      unitNumber: unit.unitNumber,
    };
  };
  const parts: string[] = [];
  if (todays.length > 0) {
    parts.push(crewUnitsTextBody(firstName, 'es', todays.map(toTextRow), crew.trade));
  }
  if (callbacks.length > 0) {
    parts.push(crewCallbackTextBody(firstName, 'es', callbacks.map((unit) => ({
      sections: unit.rooms.map((room) => ({ label: room.section })),
      unitNumber: unit.unitNumber,
    }))));
  }
  return {
    ...(parts.length > 0
      ? { copy: { label: 'Copy the WhatsApp message (Español)', text: parts.join('\n\n') } }
      : {}),
    lines,
    nav: { kind: 'crew', crewId: crew.id },
    subtitle: 'from the board — callbacks are the board’s callbacks',
    title: `${crew.name} — ${tradeWord(crew.trade)} list`,
  };
};

// "What were the cut-ins for week 2" — the whole list from the pay-packet
// math: lowest unit first, which rooms, by which crew, every line tappable.
const WEEK_TASK_KINDS = [
  { key: 'cut-in', label: 'Cut-ins', match: /cut.?in|cuttin/, types: ['cut-in', 'full-cut-in', 'touch-up-cut-in'] },
  { key: 'heavy', label: 'Heavy cleans', match: /heavy|deep clean/, types: ['heavy-clean'] },
  { key: 'touch-up', label: 'Touch-ups', match: /touch.?up/, types: ['touch-up', 'touch-up-cut-in'] },
  { key: 'full', label: 'Full paints', match: /full paint|\bfulls?\b/, types: ['full', 'full-cut-in'] },
] as const;

const weekTaskCard = (
  state: TrackCState,
  now: Date,
  kind: (typeof WEEK_TASK_KINDS)[number],
  week: number,
): TurnChatCard => {
  interface TaskRoom { section: string; workType?: string; crewName: string }
  const byUnit = new Map<string, TaskRoom[]>();
  for (const [crewId, payroll] of buildAllCrewPayroll(state, now)) {
    const crewName = state.crews.find((crew) => crew.id === crewId)?.name ?? '';
    for (const room of payroll.rooms) {
      if (payWeekNumberOf(`${room.date}T12:00:00`) !== week) continue;
      if (!room.workType || !(kind.types as readonly string[]).includes(room.workType)) continue;
      const bucket = byUnit.get(room.unitNumber) ?? [];
      bucket.push({ crewName, section: room.section, workType: room.workType });
      byUnit.set(room.unitNumber, bucket);
    }
  }
  const order = ['common', 'A', 'B', 'C', 'D', 'E'];
  const lines: TurnChatLine[] = [...byUnit.entries()]
    .sort((left, right) => (Number(left[0]) || 0) - (Number(right[0]) || 0))
    .map(([unitNumber, rooms]) => {
      const unitId = state.units.find((unit) => unit.unitNumber === unitNumber)?.id;
      const crews = [...new Set(rooms.map((room) => room.crewName))].filter(Boolean).join(' + ');
      const roomText = [...rooms]
        .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section))
        .map((room) => {
          // UI stays English — Spanish lives only in the crew messages.
          const label = room.section === 'common' ? 'Common' : room.section;
          const combo = room.workType && !['cut-in', 'touch-up', 'full', 'heavy-clean'].includes(room.workType)
            ? ` (${TASK_SHORT[room.workType] ?? room.workType})`
            : '';
          return `${label}${combo}`;
        }).join(', ');
      return {
        ...(unitId ? { nav: { kind: 'unit' as const, unitId } } : {}),
        text: `${unitNumber} — ${roomText}${crews ? ` · ${crews}` : ''}`,
      };
    });
  const total = [...byUnit.values()].reduce((sum, rooms) => sum + rooms.length, 0);
  return {
    lines: lines.length > 0
      ? lines
      : [{ text: `No ${kind.label.toLowerCase()} reported done in week ${week}.` }],
    subtitle: 'lowest unit first · counts = done rooms · tap to open',
    title: `${kind.label} · week ${week} · ${total} room${total === 1 ? '' : 's'}`,
  };
};

// Pay-week history for the AI turn — same source of truth as the pay packet.
export const buildTurnChatHistoryDigest = (
  state: TrackCState,
  now: Date,
): string => {
  const payrolls = buildAllCrewPayroll(state, now);
  if (payrolls.size === 0) return '';
  const weekSunday = payWeekSunday(now.toISOString());
  const weekNumber = payWeekNumberOf(now.toISOString());
  const previousSunday = (() => {
    const day = new Date(`${weekSunday}T12:00:00`);
    day.setDate(day.getDate() - 7);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  })();
  const lines: string[] = [
    `PAY WEEK ${weekNumber} (Sun ${weekSunday} → Sat; counts = DONE rooms; paint full+cut counts as full AND cut-in):`,
  ];
  for (const [crewId, payroll] of payrolls) {
    const crew = state.crews.find((candidate) => candidate.id === crewId);
    if (!crew) continue;
    const weekRooms = payroll.rooms.filter((room) => room.date >= weekSunday);
    const lastWeekRooms = payroll.rooms.filter((room) =>
      room.date >= previousSunday && room.date < weekSunday);
    const weekComponents = componentTotals(weekRooms.reduce((tally, room) => (
      room.workType ? { ...tally, [room.workType]: tally[room.workType] + 1 } : tally
    ), { 'cut-in': 0, full: 0, 'full-cut-in': 0, 'touch-up': 0, 'touch-up-cut-in': 0 }));
    const byUnit = new Map<string, string[]>();
    for (const room of weekRooms) {
      const list = byUnit.get(room.unitNumber) ?? [];
      list.push(`${room.section === 'common' ? 'Com' : room.section}${room.workType ? `=${room.workType}` : ''}`);
      byUnit.set(room.unitNumber, list);
    }
    lines.push(`${crew.name} (${crew.trade}): week ${payLineText(payroll.week)}${crew.trade === 'paint' ? ` — ${weekComponents.full} full, ${weekComponents.touchUp} touch-up, ${weekComponents.cutIn} cut-in` : ''}; today ${payLineText(payroll.today)}; whole Turn ${payLineText(payroll.turn)}; last week ${lastWeekRooms.length} rooms`);
    if (byUnit.size > 0 && byUnit.size <= 60) {
      lines.push(`  wk units: ${[...byUnit.entries()].map(([unitNumber, rooms]) => `${unitNumber} ${rooms.join(',')}`).join(' · ')}`);
    }
  }
  return lines.join('\n');
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
  now: Date = new Date(),
  extras: readonly TurnChatExtra[] = [],
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

  // "Released monday" / "assigned units released today" — day-scoped release
  // list in TurnBoard format. Runs after the unit-number branch
  // so "did 1806 get released" still answers THAT unit's card.
  if (/releas|relas|reklas/.test(query)) {
    const releaseDays = daysFromQuery(query, now);
    const today = localDateOf(now);
    return {
      cards: [releasedOnDayCard(
        state,
        releaseDays.length > 0 ? releaseDays : [{ date: today, label: `Today ${shortDayLabel(today)}` }],
        query,
        extras,
      )],
    };
  }

  // "How many textures / change orders (monday | week 2)" — from the extras.
  if (/texture|textura|change order|cambio de orden|drywall/.test(query)) {
    const kinds: TurnChatExtra['kind'][] = [];
    if (/texture|textura/.test(query)) kinds.push('texture');
    if (/change order|cambio/.test(query)) kinds.push('change-order');
    if (/drywall/.test(query)) kinds.push('drywall');
    const extraDays = daysFromQuery(query, now);
    const weekMatch = /w(?:ee)?k\s*(\d{1,2})/.exec(query);
    const week = weekMatch
      ? Number(weekMatch[1])
      : /last week/.test(query)
        ? payWeekNumberOf(now.toISOString()) - 1
        : payWeekNumberOf(now.toISOString());
    return { cards: [extrasCard(state, extras, kinds, extraDays, week)] };
  }

  // A crew's day: "rocky", "rocky today", "what's sandra on".
  const crew = state.crews.find((candidate) => crewFirstNameMatches(candidate.name, query));
  if (crew) {
    // "Rocky's list/text/message" → the sendable day list (Spanish copy);
    // day names or sheet words → the payroll SHEET (what they DID, day by
    // day, lowest unit first — for filling the payboard); week/total
    // phrasing → the week summary; otherwise their live day.
    const wantsList = /\blist\b|lista|\btext\b|message|mensaje|whatsapp|send/.test(query);
    const sheetDays = daysFromQuery(query, now);
    // "rocky today" alone still means his LIVE day; the sheet needs a past
    // day ("monday", "yesterday"), several days, or a payroll word.
    const wantsSheet = sheetDays.some((day) => day.date !== localDateOf(now))
      || sheetDays.length > 1
      || /sheet|payboard|pay board|payroll|\bdid\b|hizo/.test(query);
    const wantsHistory = /week|how many|count|total/.test(query);
    const card = wantsList
      ? crewListCard(state, crew.id)
      : wantsHistory && sheetDays.length === 0
        ? payrollCard(state, crew.id, now)
        : wantsSheet
          ? payrollSheetCard(state, crew.id, now, sheetDays.length > 0 ? sheetDays : undefined)
          : crewCard(state, crew.id);
    if (card) return { cards: [card] };
  }

  // "What were the cut-ins for week 2" — the pay-packet list, no crew named.
  const taskKind = WEEK_TASK_KINDS.find((kind) => kind.match.test(query));
  if (taskKind) {
    const weekMatch = /w(?:ee)?k\s*(\d{1,2})/.exec(query);
    const week = weekMatch
      ? Number(weekMatch[1])
      : /last week/.test(query)
        ? payWeekNumberOf(now.toISOString()) - 1
        : payWeekNumberOf(now.toISOString());
    return { cards: [weekTaskCard(state, now, taskKind, week)] };
  }

  // "floor 11" scopes every status answer; on its own it's the floor overview.
  const floor = floorFromQuery(query);

  if (/callback/.test(query)) return { cards: [callbacksCard(state, floor)] };
  if (/\bwalk|ready\b/.test(query)) return { cards: [readyToWalkCard(state, floor)] };
  if (/inspect|check\b/.test(query)) return { cards: [inspectCard(state, floor)] };
  if (floor !== undefined) return { cards: [floorCard(state, floor)] };
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
