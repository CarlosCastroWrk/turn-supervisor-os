// Pay-week numbering for the wall board — the ONE place week numbers come from,
// so the wall's w# chip, the CC-highlight color, and the Home/Crews pay-week
// logic always agree. Pay week 2 begins Sun Aug 2, 2026 (WEEK2_START); the week
// before it is week 1. A week is plain Sunday→Saturday, DATE ONLY — no
// time-of-day cutoff — so the app week matches the physical board (Sun–Sat) and
// auto-advances on Sunday.
// The math lives in src/lib/localDay.ts (the ONE date/week module); the names
// stay exported here so the board's existing imports keep working.
export { WALL_WEEK_EPOCH, payWeekNumberOf, wallWeekColor } from '../../lib/localDay';


// Short paint-task tags shown under each room mark on the wall.
export const WALL_WORKTYPE_ABBR: Record<string, string> = {
  full: 'F',
  'touch-up': 'TU',
  'cut-in': 'CI',
  'full-cut-in': 'F+CI',
  'touch-up-cut-in': 'TU+CI',
};

// Texture notes carry the room + count in their wording ("Texture repair — C
// ×2"). One parser everywhere, so the unit page, the wall grids, and the
// day board all read the same fact the same way.
export const parseTextureWording = (
  text: string,
): { room?: 'common' | 'A' | 'B' | 'C' | 'D' | 'E'; count: number; textureOnly: boolean } | null => {
  if (!/texture|textura/i.test(text)) return null;
  const roomMatch = /(?:—|-)\s*(Common|Com[uú]n|[A-E])\b\s*(?:[×x]\s*(\d+))?/i.exec(text);
  const bare = /[×x]\s*(\d+)/.exec(text);
  const count = Number(roomMatch?.[2] ?? bare?.[1] ?? 1) || 1;
  // "(texture only)" in the wording = the room has NO paint task, just this.
  const textureOnly = /texture only|solo textura/i.test(text);
  if (!roomMatch) return { count, textureOnly };
  const raw = roomMatch[1].toLowerCase();
  return {
    count,
    room: raw.startsWith('com') ? 'common' : roomMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E',
    textureOnly,
  };
};
