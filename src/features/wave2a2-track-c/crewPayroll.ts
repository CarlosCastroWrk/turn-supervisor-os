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
export type PaintTypeKey = 'full' | 'touch-up' | 'cut-in' | 'full-cut-in';
export interface TypeTally {
  readonly full: number;
  readonly 'touch-up': number;
  readonly 'cut-in': number;
  readonly 'full-cut-in': number;
}

export interface CrewPayDay {
  readonly date: string; // local calendar day YYYY-MM-DD
  readonly line: PayLine;
  readonly types: TypeTally; // paint work types done that day (zero for clean)
}

export interface CrewPayroll {
  readonly crewId: string;
  readonly today: PayLine;
  readonly week: PayLine; // current pay week (Sun 00:00 -> Sat 5:00 PM)
  readonly turn: PayLine; // whole Turn, deduped
  readonly turnTypes: TypeTally; // whole-Turn paint work-type totals
  readonly perDay: readonly CrewPayDay[]; // ascending by date, each room on its first day
}

const emptyLine = (): PayLine => ({ beds: 0, commons: 0 });
const emptyTypes = (): TypeTally =>
  ({ full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0 });

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

// Pay week = Sunday 00:00 -> Saturday 5:00 PM. Work reported after the Saturday
// 5 PM cutoff rolls into the NEXT pay week — same rule as the wall board's
// color rotation. Returns the Sunday (YYYY-MM-DD) that starts the week.
export const payWeekSunday = (iso: string): string => {
  const date = new Date(iso);
  if (date.getDay() === 6 && date.getHours() >= 17) {
    date.setDate(date.getDate() + 1);
  }
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
  for (const unit of state.units) {
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
    };
    accum.turn = addRoom(accum.turn, event.target.section);
    if (date === today) accum.today = addRoom(accum.today, event.target.section);
    if (week === currentWeek) accum.week = addRoom(accum.week, event.target.section);
    accum.perDay.set(date, addRoom(accum.perDay.get(date) ?? emptyLine(), event.target.section));
    if (event.target.trade === 'paint') {
      const type = workTypeOf.get(`${event.target.unitId}:paint:${event.target.section}`) ?? 'full';
      accum.turnTypes = addType(accum.turnTypes, type);
      accum.perDayTypes.set(date, addType(accum.perDayTypes.get(date) ?? emptyTypes(), type));
    }
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
    });
  }
  return result;
};

// Short human label for a paint work-type tally, e.g. "2 cut-in · 1 full".
export const formatTypeTally = (types: TypeTally): string =>
  [
    types.full > 0 ? `${types.full} full` : '',
    types['touch-up'] > 0 ? `${types['touch-up']} touch-up` : '',
    types['cut-in'] > 0 ? `${types['cut-in']} cut-in` : '',
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
  };

// Short human label, e.g. "3 beds · 1 common" or "0".
export const formatPayLine = (line: PayLine): string =>
  [
    line.beds > 0 ? `${line.beds} bed${line.beds === 1 ? '' : 's'}` : '',
    line.commons > 0 ? `${line.commons} common` : '',
  ].filter(Boolean).join(' · ') || '0';
