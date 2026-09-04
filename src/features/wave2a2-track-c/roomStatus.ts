// THE one answer to "where is this room?" and "where is this trade?".
//
// Every surface (Home board, unit page, crew card, peek sheet, chat, wall
// grids) used to classify a TrackCWorkProjection with its own if-chain — and
// they disagreed on precedence. Two of them said a called-back room that had
// been approved was "Approved"; the board and the pay rule say a callback
// pulls it back out. That is exactly the kind of drift Los cannot see and
// Tony pays off. So the ORDER lives here, once:
//
//   callback  >  approved  >  passed  >  crew-done  >  blocked
//             >  working  >  assigned  >  needs-crew   (unreleased first)
//
// Labels are here too. Surfaces may pick the full label or the short chip
// label, but they never re-derive the stage.

import type { TrackCWorkProjection } from './model';

export const ROOM_STAGES = [
  'unreleased',
  'needs-crew',
  'assigned',
  'working',
  'blocked',
  'crew-done',
  'passed',
  'approved',
  'callback',
] as const;
export type RoomStage = (typeof ROOM_STAGES)[number];

// Higher = further along / more urgent. Used when one line must summarise
// several rooms (crew card unit rows).
export const ROOM_STAGE_RANK: Record<RoomStage, number> = {
  unreleased: 0,
  'needs-crew': 1,
  assigned: 2,
  working: 3,
  blocked: 4,
  'crew-done': 5,
  passed: 6,
  approved: 7,
  callback: 8,
};

export const roomStageOf = (work: TrackCWorkProjection): RoomStage => {
  if (work.release !== 'released') return 'unreleased';
  if (work.callbackOpen) return 'callback';
  if (work.property === 'property-accepted') return 'approved';
  if (work.inspection === 'los-passed') return 'passed';
  if (work.execution === 'crew-reported-complete' || work.inspection === 'needs-los-inspection') return 'crew-done';
  if (work.access !== 'clear') return 'blocked';
  if (work.execution === 'working') return 'working';
  if (work.execution === 'assigned' || work.activeCrewIds.length > 0) return 'assigned';
  return 'needs-crew';
};

// Full words — unit page rows, peek sheet, chat, crew card.
export const ROOM_STAGE_LABEL: Record<RoomStage, string> = {
  unreleased: 'Not released',
  'needs-crew': 'Needs crew',
  assigned: 'Assigned',
  working: 'Working',
  blocked: 'Blocked',
  'crew-done': 'Done — check',
  passed: 'Passed',
  approved: 'Approved',
  callback: 'Callback',
};

// Chip words — the tight room grid on the board.
export const ROOM_STAGE_SHORT: Record<RoomStage, string> = {
  unreleased: 'Unreleased',
  'needs-crew': 'Needs crew',
  assigned: 'Assigned',
  working: 'Working',
  blocked: 'Blocked',
  'crew-done': 'Check',
  passed: 'Passed',
  approved: 'Approved',
  callback: 'Callback',
};

export type StageTone = 'ok' | 'warn' | 'work' | 'open';
export const roomStageTone = (stage: RoomStage): StageTone =>
  stage === 'approved' || stage === 'passed'
    ? 'ok'
    : stage === 'callback' || stage === 'blocked'
      ? 'warn'
      : stage === 'working' || stage === 'assigned' || stage === 'crew-done'
        ? 'work'
        : 'open';

// Trade grain (one unit × Paint or Clean, several rooms). The wall board, the
// Home board, and the unit-page chip all summarise a trade the same way:
//   any callback → callback; nothing released → unreleased; every released
//   room approved → approved; among the rooms still open (not approved):
//   all passed → passed; all done-or-passed → crew-done; any crew on it →
//   working; all blocked → blocked; else needs-crew.
export const TRADE_STAGES = [
  'unreleased', 'needs-crew', 'working', 'blocked', 'crew-done', 'passed', 'approved', 'callback',
] as const;
export type TradeStage = (typeof TRADE_STAGES)[number];

export const tradeStageOf = (
  rooms: readonly TrackCWorkProjection[],
  options: { readonly ignoreCallbacks?: boolean } = {},
): TradeStage => {
  const released = rooms.filter((room) => room.release === 'released');
  if (released.length === 0) return 'unreleased';
  if (!options.ignoreCallbacks && released.some((room) => room.callbackOpen)) return 'callback';
  const open = released.filter((room) => room.property !== 'property-accepted');
  if (open.length === 0) return 'approved';
  const stages = open.map((room) => roomStageOf(options.ignoreCallbacks ? { ...room, callbackOpen: false } : room));
  if (stages.every((stage) => stage === 'passed')) return 'passed';
  if (stages.every((stage) => stage === 'passed' || stage === 'crew-done')) return 'crew-done';
  if (stages.some((stage) => stage === 'working' || stage === 'assigned')) return 'working';
  if (stages.every((stage) => stage === 'blocked')) return 'blocked';
  return 'needs-crew';
};

export const TRADE_STAGE_LABEL: Record<TradeStage, string> = {
  unreleased: 'Not released',
  'needs-crew': 'Needs crew',
  working: 'Working',
  blocked: 'Blocked',
  'crew-done': 'Done — check',
  passed: 'Ready to walk',
  approved: 'Approved',
  callback: 'Callback',
};

// The order Home groups the board in when grouped by status.
export const TRADE_STAGE_ORDER: readonly TradeStage[] = [
  'working', 'crew-done', 'passed', 'callback', 'blocked', 'needs-crew', 'approved', 'unreleased',
];
