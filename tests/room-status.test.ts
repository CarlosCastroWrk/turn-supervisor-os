import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { TrackCWorkProjection } from '../src/features/wave2a2-track-c/model.ts';
import {
  ROOM_STAGES,
  ROOM_STAGE_LABEL,
  ROOM_STAGE_RANK,
  ROOM_STAGE_SHORT,
  TRADE_STAGES,
  TRADE_STAGE_LABEL,
  TRADE_STAGE_ORDER,
  roomStageOf,
  roomStageTone,
  tradeStageOf,
} from '../src/features/wave2a2-track-c/roomStatus.ts';

const room = (overrides: Partial<TrackCWorkProjection> = {}): TrackCWorkProjection => ({
  id: 'u1:paint:A',
  unitId: 'u1',
  trade: 'paint',
  section: 'A',
  release: 'released',
  access: 'clear',
  sourceConfidence: 'confirmed',
  sourceLabel: 'test',
  activeCrewIds: [],
  assignmentConflict: false,
  execution: 'unassigned',
  inspection: 'not-ready',
  property: 'not-ready',
  callbackOpen: false,
  callbackResolvedCount: 0,
  personalPdsMirror: false,
  paperReviewed: false,
  confirmedEventCount: 0,
  ...overrides,
});

test('room stage precedence: callback beats approved beats passed beats done', () => {
  assert.equal(roomStageOf(room({ release: 'unreleased' })), 'unreleased');
  assert.equal(roomStageOf(room()), 'needs-crew');
  assert.equal(roomStageOf(room({ activeCrewIds: ['c1'] })), 'assigned', 'a crew on the room with no start yet = assigned');
  assert.equal(roomStageOf(room({ execution: 'assigned', activeCrewIds: ['c1'] })), 'assigned');
  assert.equal(roomStageOf(room({ execution: 'working', activeCrewIds: ['c1'] })), 'working');
  assert.equal(roomStageOf(room({ access: 'access-blocked' })), 'blocked');
  assert.equal(roomStageOf(room({ execution: 'crew-reported-complete', inspection: 'needs-los-inspection' })), 'crew-done');
  assert.equal(roomStageOf(room({ execution: 'crew-reported-complete', inspection: 'los-passed', property: 'pending-property-walk' })), 'passed');
  assert.equal(roomStageOf(room({ execution: 'crew-reported-complete', inspection: 'los-passed', property: 'property-accepted' })), 'approved');
  // The one that used to split the surfaces: a callback on an APPROVED room.
  // The board and the pay rule pull it back out; the peek sheet and crew card
  // used to say "Approved". Now there is one answer.
  assert.equal(
    roomStageOf(room({ execution: 'crew-reported-complete', inspection: 'callback-open', property: 'property-accepted', callbackOpen: true })),
    'callback',
  );
  // Done work never reads as "blocked" just because access changed later.
  assert.equal(roomStageOf(room({ execution: 'crew-reported-complete', inspection: 'los-passed', access: 'occupied-restricted' })), 'passed');
});

test('every stage has a label, a chip word, a rank, and a tone', () => {
  for (const stage of ROOM_STAGES) {
    assert.ok(ROOM_STAGE_LABEL[stage], stage);
    assert.ok(ROOM_STAGE_SHORT[stage], stage);
    assert.equal(typeof ROOM_STAGE_RANK[stage], 'number', stage);
    assert.ok(['ok', 'warn', 'work', 'open'].includes(roomStageTone(stage)), stage);
  }
  const ranks = ROOM_STAGES.map((stage) => ROOM_STAGE_RANK[stage]);
  assert.equal(new Set(ranks).size, ranks.length, 'ranks are distinct so a crew row can pick one');
  for (const stage of TRADE_STAGES) assert.ok(TRADE_STAGE_LABEL[stage], stage);
  assert.deepEqual([...TRADE_STAGE_ORDER].sort(), [...TRADE_STAGES].sort(), 'Home orders every trade stage');
});

test('trade stage rolls rooms up the way the wall board reads a unit', () => {
  const done = room({ section: 'A', execution: 'crew-reported-complete', inspection: 'needs-los-inspection' });
  const passed = room({ section: 'B', execution: 'crew-reported-complete', inspection: 'los-passed', property: 'pending-property-walk' });
  const approved = room({ section: 'C', execution: 'crew-reported-complete', inspection: 'los-passed', property: 'property-accepted' });
  const working = room({ section: 'D', execution: 'working', activeCrewIds: ['c1'] });
  const open = room({ section: 'E' });
  const callback = room({ section: 'common', inspection: 'callback-open', callbackOpen: true });

  assert.equal(tradeStageOf([]), 'unreleased');
  assert.equal(tradeStageOf([room({ release: 'unreleased' })]), 'unreleased');
  assert.equal(tradeStageOf([approved, approved]), 'approved');
  assert.equal(tradeStageOf([approved, passed]), 'passed', 'approved rooms are out of the way; the rest decide');
  assert.equal(tradeStageOf([passed, done]), 'crew-done');
  assert.equal(tradeStageOf([done, working]), 'working');
  assert.equal(tradeStageOf([open, open]), 'needs-crew');
  assert.equal(tradeStageOf([open, working]), 'working', 'one crew on the unit = the unit is working');
  assert.equal(tradeStageOf([approved, passed, callback]), 'callback', 'any open callback leads');
  // The portal shows the callback as its own chip and reads PROGRESS blind to
  // it: a called-back room that was never re-done is simply not done yet.
  assert.equal(tradeStageOf([approved, passed, callback], { ignoreCallbacks: true }), 'needs-crew');
  const calledBackAfterDone = room({ section: 'common', execution: 'crew-reported-complete', inspection: 'callback-open', callbackOpen: true });
  assert.equal(tradeStageOf([passed, calledBackAfterDone], { ignoreCallbacks: true }), 'crew-done');
  assert.equal(tradeStageOf([room({ access: 'access-blocked' })]), 'blocked');
});

// The pin: every surface that shows a room or trade status imports the module
// and none keeps its own precedence chain.
test('every status surface reads roomStatus.ts and none re-derives precedence', () => {
  const surfaces = [
    'src/features/launch-command-center/TurnPeek.tsx',
    'src/features/launch-command-center/turnChatAnswer.ts',
    'src/features/launch-command-center/LaunchIntegratedApp.tsx',
    'src/features/wave2a2-track-b/DayTaskWorkspace.tsx',
    'src/features/wave2a2-track-c/BoardView.tsx',
    'src/features/wave2a2-track-c/CrewView.tsx',
    'src/features/wave2a2-core/PortalPage.tsx',
  ];
  for (const path of surfaces) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /from '[./]+(?:wave2a2-track-c\/)?roomStatus'/u, `${path} imports roomStatus`);
    assert.doesNotMatch(source, /property === 'property-accepted' \? \[|return 'Approved'|return 'Accepted'|return 'Done — check'|\? 'crew-done' as const/u,
      `${path} keeps no local stage chain`);
  }
});
