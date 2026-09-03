// THE one place calendar days and pay weeks are computed.
//
// Timestamps are UTC; days are LOCAL (CLAUDE.md guardrail #5): evening work must
// count as today, so nothing in the app may `slice(0, 10)` an ISO string or
// keep its own copy of the year-month-day template. Twelve copies of that
// template used to live across the app; a test now pins that this file is the
// only one.
//
// Pay week = Sunday 00:00 → Saturday 23:59, DATE ONLY (Los-confirmed Aug 8
// 2026 — no time-of-day cutoff). Week numbers count from the wall board's
// epoch: pay week 2 begins Sun Aug 2 2026. Colors rotate amber → green → pink
// and stay locked to the number, so w2 is always green.

const pad2 = (value: number) => String(value).padStart(2, '0');

const toDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value);

// Local calendar day as YYYY-MM-DD. Accepts an ISO string or a Date. Returns
// '' for an unparseable input (never throws — used inside render paths).
export const localDayOf = (value: string | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

// Alias kept for the field-event call sites that read better with this name.
export const localEventDate = localDayOf;

export const todayLocalDay = (now: Date = new Date()): string => localDayOf(now);

// Midnight local for a YYYY-MM-DD (noon-anchored parse so DST never shifts it).
export const dateFromLocalDay = (day: string): Date => new Date(`${day}T12:00:00`);

export const shiftLocalDay = (day: string, deltaDays: number): string => {
  const date = dateFromLocalDay(day);
  date.setDate(date.getDate() + deltaDays);
  return localDayOf(date);
};

// The Sunday (YYYY-MM-DD) that starts the pay week containing this moment.
export const payWeekSunday = (value: string | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return localDayOf(date);
};

export const payWeekSaturday = (value: string | Date): string =>
  shiftLocalDay(payWeekSunday(value), 6);

export const WALL_WEEK_EPOCH = new Date(2026, 7, 2); // Sun Aug 2 2026 = pay week 2
const WEEK_MS = 604_800_000;

export const payWeekNumberOf = (value: string | Date): number => {
  const date = toDate(value);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - WALL_WEEK_EPOCH.getTime()) / WEEK_MS) + 2;
};

// The Sunday (YYYY-MM-DD) that starts a given pay-week NUMBER — lets Los pull
// up any past week to pay it.
export const payWeekSundayOfNumber = (weekNumber: number): string => {
  const date = new Date(WALL_WEEK_EPOCH);
  date.setDate(date.getDate() + (weekNumber - 2) * 7);
  return localDayOf(date);
};

export const wallWeekColor = (weekNumber: number): number => (((weekNumber - 1) % 3) + 3) % 3;

// Sunday=0 … Saturday=6 (JS convention). The most recent calendar day that
// fell on `weekday`, counting today as a hit — "what did Rocky do Monday?"
export const mostRecentWeekday = (now: Date, weekday: number): Date => {
  const delta = (now.getDay() - weekday + 7) % 7;
  const date = new Date(now);
  date.setDate(date.getDate() - delta);
  return date;
};
