// One place that answers "what has each crew earned?" — for the card glance,
// the pay-week count, and the whole-Turn receipt. Tony pays off these numbers,
// so they must agree on every surface. Keeping the math here (instead of three
// near-copies inside CrewView) is what keeps them agreeing.
//
// PAY BASIS: a confirmed `crew-reported-complete` for a room = the crew did that
// room = it pays. Deduped so a room pays ONCE per crew, no matter how many times
// it gets re-reported (a callback re-report, a mistap-reopen-and-report-again).
// Each room is attributed to the day it was FIRST reported complete, so the
// per-day breakdown always sums to the Turn total — the numbers reconcile.

import type { TrackCState, TrackCConfirmedEvent } from './model';

export interface PayLine {
  readonly beds: number;
  readonly commons: number;
}

// Paint rooms carry a work type; a crew's day should read "2 cut-in · 1 full".
// Clean rooms have no type — the tally stays all zero for clean crews.
export type PaintTypeKey = 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in';
export interface TypeTally {
  readonly full: number;
  readonly 'touch-up': number;
  readonly 'cut-in': number;
  readonly 'full-cut-in': number;
  readonly 'touch-up-cut-in': number;
}

export interface CrewPayDay {
  readonly date: string; // local calendar day YYYY-MM-DD
  readonly line: PayLine;
  readonly types: TypeTally; // paint work types done that day (zero for clean)
}

// One payable room with where it is and (for paint) what kind of work — the
// grain Tony asks about: "how many cut-ins, in WHICH unit".
export interface PayRoom {
  readonly unitNumber: string;
  readonly trade: 'paint' | 'clean';
  readonly section: string; // 'common' | 'A'..'E'
  readonly workType?: PaintTypeKey; // paint only
  readonly date: string; // local day it was first reported done
}

export interface CrewPayroll {
  readonly crewId: string;
  readonly today: PayLine;
  readonly week: PayLine; // current pay week (Sun 00:00 -> Sat 5:00 PM)
  readonly turn: PayLine; // whole Turn, deduped
  readonly turnTypes: TypeTally; // whole-Turn paint work-type totals
  readonly perDay: readonly CrewPayDay[]; // ascending by date, each room on its first day
  readonly rooms: readonly PayRoom[]; // every payable room with unit + type
}

const emptyLine = (): PayLine => ({ beds: 0, commons: 0 });
const emptyTypes = (): TypeTally =>
  ({ full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 });

const addRoom = (line: PayLine, section: string): PayLine =>
  section === 'common'
    ? { beds: line.beds, commons: line.commons + 1 }
    : { beds: line.beds + 1, commons: line.commons };

const addType = (tally: TypeTally, type: PaintTypeKey): TypeTally =>
  ({ ...tally, [type]: tally[type] + 1 });

// Local calendar day (days are local even though timestamps are UTC).
export const payLocalDate = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Pay week = Sunday 00:00 -> Saturday 23:59, date only (no time-of-day cutoff) —
// the app week matches Los's physical wall board, which is colored Sun–Sat. Any
// work whose local calendar day falls in that Sun–Sat range belongs to that
// week. Returns the Sunday (YYYY-MM-DD) that starts the week.
export const payWeekSunday = (iso: string): string => {
  const date = new Date(iso);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const isPayEvent = (event: TrackCConfirmedEvent): boolean =>
  event.eventType === 'crew-reported-complete'
  && event.confirmation === 'confirmed'
  && Boolean(event.crewId);

// Build the full payroll picture for every crew that has reported any work.
// `now` is injected so the "today" and "this week" windows are testable and so
// the caller controls the clock (never read the wall clock in here).
export const buildAllCrewPayroll = (
  state: TrackCState,
  now: Date,
): Map<string, CrewPayroll> => {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentWeek = payWeekSunday(now.toISOString());

  // Work type per paint room (unit:trade:section -> full/touch-up/cut-in/…),
  // read off the release so a completed paint room can be tallied by its kind.
  const workTypeOf = new Map<string, PaintTypeKey>();
  const unitNumberOf = new Map<string, string>();
  for (const unit of state.units) {
    unitNumberOf.set(unit.id, unit.unitNumber);
    for (const fact of unit.workFacts) {
      if (fact.trade !== 'paint') continue;
      workTypeOf.set(
        `${fact.unitId}:${fact.trade}:${fact.section}`,
        (fact.workType ?? 'full') as PaintTypeKey,
      );
    }
  }

  // First confirmed completion per (crew, unit, trade, section) — the payable
  // room, attributed to that first day. Events are read oldest-first so "first"
  // is the earliest report.
  const ordered = [...state.events]
    .filter(isPayEvent)
    .sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));

  interface Accum {
    today: PayLine;
    week: PayLine;
    turn: PayLine;
    turnTypes: TypeTally;
    perDay: Map<string, PayLine>;
    perDayTypes: Map<string, TypeTally>;
    rooms: PayRoom[];
  }
  const byCrew = new Map<string, Accum>();
  const seenRooms = new Set<string>();

  for (const event of ordered) {
    const crewId = event.crewId as string;
    const roomKey = `${crewId}:${event.target.unitId}:${event.target.trade}:${event.target.section}`;
    if (seenRooms.has(roomKey)) continue; // already paid — never twice
    seenRooms.add(roomKey);

    const date = payLocalDate(event.recordedAt);
    const week = payWeekSunday(event.recordedAt);
    const accum = byCrew.get(crewId) ?? {
      today: emptyLine(),
      week: emptyLine(),
      turn: emptyLine(),
      turnTypes: emptyTypes(),
      perDay: new Map<string, PayLine>(),
      perDayTypes: new Map<string, TypeTally>(),
      rooms: [] as PayRoom[],
    };
    accum.turn = addRoom(accum.turn, event.target.section);
    if (date === today) accum.today = addRoom(accum.today, event.target.section);
    if (week === currentWeek) accum.week = addRoom(accum.week, event.target.section);
    accum.perDay.set(date, addRoom(accum.perDay.get(date) ?? emptyLine(), event.target.section));
    const paintType = event.target.trade === 'paint'
      ? workTypeOf.get(`${event.target.unitId}:paint:${event.target.section}`) ?? 'full'
      : undefined;
    if (paintType) {
      accum.turnTypes = addType(accum.turnTypes, paintType);
      accum.perDayTypes.set(date, addType(accum.perDayTypes.get(date) ?? emptyTypes(), paintType));
    }
    accum.rooms.push({
      date,
      section: event.target.section,
      trade: event.target.trade,
      unitNumber: unitNumberOf.get(event.target.unitId) ?? event.target.unitId,
      workType: paintType,
    });
    byCrew.set(crewId, accum);
  }

  const result = new Map<string, CrewPayroll>();
  for (const [crewId, accum] of byCrew) {
    const perDay = [...accum.perDay.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, line]) => ({
        date,
        line,
        types: accum.perDayTypes.get(date) ?? emptyTypes(),
      }));
    result.set(crewId, {
      crewId,
      today: accum.today,
      week: accum.week,
      turn: accum.turn,
      turnTypes: accum.turnTypes,
      perDay,
      rooms: accum.rooms,
    });
  }
  return result;
};

// Tony's question, answered directly: for a PAINT crew, group the payable
// rooms by work type with the units — "cut-in ×3 — 1007 (A, C) · 1608 (B)".
// For a CLEAN crew, group by unit — "1806 — Com, A, B".
export const formatRoomsByType = (rooms: readonly PayRoom[]): string[] => {
  const paint = rooms.filter((room) => room.trade === 'paint');
  const clean = rooms.filter((room) => room.trade === 'clean');
  const lines: string[] = [];
  const roomLabel = (section: string) => (section === 'common' ? 'Com' : section);
  const typeOrder: PaintTypeKey[] = ['full', 'full-cut-in', 'cut-in', 'touch-up-cut-in', 'touch-up'];
  const typeWord: Record<PaintTypeKey, string> = {
    full: 'full', 'full-cut-in': 'full+cut-in', 'cut-in': 'cut-in',
    'touch-up-cut-in': 'touch-up+cut-in', 'touch-up': 'touch-up',
  };
  for (const type of typeOrder) {
    const ofType = paint.filter((room) => (room.workType ?? 'full') === type);
    if (ofType.length === 0) continue;
    const byUnit = new Map<string, string[]>();
    for (const room of ofType) {
      byUnit.set(room.unitNumber, [...(byUnit.get(room.unitNumber) ?? []), roomLabel(room.section)]);
    }
    const units = [...byUnit.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([unitNumber, sections]) => `${unitNumber} (${sections.sort().join(', ')})`)
      .join(' · ');
    lines.push(`${typeWord[type]} ×${ofType.length} — ${units}`);
  }
  if (clean.length > 0) {
    const byUnit = new Map<string, string[]>();
    for (const room of clean) {
      byUnit.set(room.unitNumber, [...(byUnit.get(room.unitNumber) ?? []), roomLabel(room.section)]);
    }
    for (const [unitNumber, sections] of [...byUnit.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))) {
      lines.push(`${unitNumber} — ${sections.sort().join(', ')} (${sections.length})`);
    }
  }
  return lines;
};

// Short human label for a paint work-type tally, e.g. "2 cut-in · 1 full".
export const formatTypeTally = (types: TypeTally): string =>
  [
    types.full > 0 ? `${types.full} full` : '',
    types['touch-up'] > 0 ? `${types['touch-up']} touch-up` : '',
    types['cut-in'] > 0 ? `${types['cut-in']} cut-in` : '',
    types['touch-up-cut-in'] > 0 ? `${types['touch-up-cut-in']} touch-up+cut-in` : '',
    types['full-cut-in'] > 0 ? `${types['full-cut-in']} full+cut-in` : '',
  ].filter(Boolean).join(' · ');

// Convenience for one crew (empty payroll if they've reported nothing).
export const buildCrewPayroll = (
  state: TrackCState,
  crewId: string,
  now: Date,
): CrewPayroll =>
  buildAllCrewPayroll(state, now).get(crewId) ?? {
    crewId,
    today: emptyLine(),
    week: emptyLine(),
    turn: emptyLine(),
    turnTypes: emptyTypes(),
    perDay: [],
    rooms: [],
  };

// Short human label, e.g. "3 beds · 1 common" or "0".
export const formatPayLine = (line: PayLine): string =>
  [
    line.beds > 0 ? `${line.beds} bed${line.beds === 1 ? '' : 's'}` : '',
    line.commons > 0 ? `${line.commons} common` : '',
  ].filter(Boolean).join(' · ') || '0';
