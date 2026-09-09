// What Tony was HANDED for a pay week, frozen the moment Los copies the
// packet or saves the PDF. Payroll itself is always live — it reads each
// paint room's work type off the CURRENT release — so editing a task after
// payday silently rewrites the paid week on every surface ("3 cut-ins"
// becomes "2 cut-ins" with nobody told). This snapshot is the memory of what
// was sent; the pre-flight compares it to the live number and says so.
//
// Device-local on purpose (localStorage, turn-os:* key): the schema freeze
// forbids new stored collections, and losing this costs a warning, not pay.

import type { CrewPayroll, TypeTally } from './crewPayroll';
import { componentTotals } from './crewPayroll';
import { payWeekNumberOf } from '../../lib/localDay';

export const PAID_WEEKS_KEY = 'turn-os:paid-weeks-v1';

export interface PaidCrewLine {
  readonly name: string;
  readonly beds: number;
  readonly commons: number;
  readonly types: TypeTally;
}

export interface PaidWeekSnapshot {
  readonly week: number;
  readonly sentAt: string; // ISO — when the packet was copied / saved
  readonly crews: Record<string, PaidCrewLine>; // by crew id
}

export type PaidWeeks = Record<string, PaidWeekSnapshot>; // by week number

const emptyTypes = (): TypeTally =>
  ({ full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 });

// One pay week's per-crew totals, from the same payroll object the packet
// prints — so "sent" and "live" are always the same arithmetic.
export const buildPaidWeekSnapshot = (
  payrollByCrew: ReadonlyMap<string, CrewPayroll>,
  crewNameOf: (crewId: string) => string,
  week: number,
  sentAt: string,
): PaidWeekSnapshot => {
  const crews: Record<string, PaidCrewLine> = {};
  for (const [crewId, payroll] of payrollByCrew) {
    let beds = 0;
    let commons = 0;
    let types = emptyTypes();
    for (const room of payroll.rooms) {
      if (payWeekNumberOf(`${room.date}T12:00:00`) !== week) continue;
      if (room.section === 'common') commons += 1; else beds += 1;
      if (room.trade === 'paint') {
        const type = room.workType ?? 'full';
        types = { ...types, [type]: types[type] + 1 };
      }
    }
    if (beds + commons === 0) continue;
    crews[crewId] = { beds, commons, name: crewNameOf(crewId), types };
  }
  return { crews, sentAt, week };
};

const line = (entry: PaidCrewLine) =>
  `${entry.beds} bed${entry.beds === 1 ? '' : 's'} · ${entry.commons} common`;

// Plain sentences, one per crew whose number moved. Empty = nothing moved.
export const diffPaidWeek = (sent: PaidWeekSnapshot, live: PaidWeekSnapshot): string[] => {
  const changes: string[] = [];
  const ids = [...new Set([...Object.keys(sent.crews), ...Object.keys(live.crews)])]
    .sort((left, right) =>
      (sent.crews[left]?.name ?? live.crews[left]?.name ?? '').localeCompare(
        sent.crews[right]?.name ?? live.crews[right]?.name ?? ''));
  for (const id of ids) {
    const before = sent.crews[id];
    const after = live.crews[id];
    if (before && !after) {
      changes.push(`${before.name} — was ${line(before)}, now nothing`);
      continue;
    }
    if (!before && after) {
      changes.push(`${after.name} — new since sent: ${line(after)}`);
      continue;
    }
    if (!before || !after) continue;
    const parts: string[] = [];
    if (before.beds !== after.beds) parts.push(`beds ${before.beds} → ${after.beds}`);
    if (before.commons !== after.commons) parts.push(`common ${before.commons} → ${after.commons}`);
    const b = componentTotals(before.types);
    const a = componentTotals(after.types);
    if (b.full !== a.full) parts.push(`full ${b.full} → ${a.full}`);
    if (b.touchUp !== a.touchUp) parts.push(`touch-up ${b.touchUp} → ${a.touchUp}`);
    if (b.cutIn !== a.cutIn) parts.push(`cut-in ${b.cutIn} → ${a.cutIn}`);
    if (parts.length > 0) changes.push(`${after.name} — ${parts.join(' · ')}`);
  }
  return changes;
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const readPaidWeeks = (store: StorageLike | null = storage()): PaidWeeks => {
  try {
    const raw = store?.getItem(PAID_WEEKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PaidWeeks) : {};
  } catch {
    return {};
  }
};

export const writePaidWeek = (
  snapshot: PaidWeekSnapshot,
  store: StorageLike | null = storage(),
): PaidWeeks => {
  const next = { ...readPaidWeeks(store), [String(snapshot.week)]: snapshot };
  try {
    store?.setItem(PAID_WEEKS_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: the warning is lost, pay is not.
  }
  return next;
};
