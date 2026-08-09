// Pay-week numbering for the wall board — the ONE place week numbers come from,
// so the wall's w# chip, the CC-highlight color, and the Home/Crews pay-week
// logic always agree. Pay week 2 begins Sun Aug 2, 2026 (WEEK2_START); the week
// before it is week 1. A week is plain Sunday→Saturday, DATE ONLY — no
// time-of-day cutoff — so the app week matches the physical board (Sun–Sat) and
// auto-advances on Sunday.
export const WALL_WEEK_EPOCH = new Date(2026, 7, 2);

export const payWeekNumberOf = (iso: string): number => {
  const date = new Date(iso);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  const weeks = Math.round((date.getTime() - WALL_WEEK_EPOCH.getTime()) / 604_800_000);
  return weeks + 2;
};

// Color rotates through 3 hues but stays locked to the week number: week 1 amber,
// week 2 green, week 3 pink, week 4 amber again — so w2 is always green.
export const wallWeekColor = (weekNumber: number): number => (((weekNumber - 1) % 3) + 3) % 3;

// Short paint-task tags shown under each room mark on the wall.
export const WALL_WORKTYPE_ABBR: Record<string, string> = {
  full: 'F',
  'touch-up': 'TU',
  'cut-in': 'CI',
  'full-cut-in': 'F+CI',
  'touch-up-cut-in': 'TU+CI',
};
