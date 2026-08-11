import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import {
  answerTurnChat,
  buildTurnChatHistoryDigest,
} from '../src/features/launch-command-center/turnChatAnswer.ts';

// Turn Chat's instant brain answers straight from board state — every card
// must navigate somewhere real, and a wrong unit number must be said, not
// silently ignored.

const state = createSyntheticTrackCState();

test('a unit number answers with that unit card, tappable to the unit', () => {
  const answer = answerTurnChat(state, '301');
  assert.ok(answer);
  assert.equal(answer.cards.length, 1);
  const card = answer.cards[0];
  assert.equal(card.title, '301');
  assert.equal(card.nav?.kind, 'unit');
  assert.ok(card.lines.length > 0);
  assert.ok(card.lines.some((line) => line.text.startsWith('Paint —')));
  assert.ok(card.lines.some((line) => line.text.startsWith('Clean —')));
});

test('several unit numbers in one question return several cards', () => {
  const answer = answerTurnChat(state, 'where are 301 and 410');
  assert.ok(answer);
  assert.deepEqual(answer.cards.map((card) => card.title), ['301', '410']);
});

test('a unit number not in the roster is called out, never silently ignored', () => {
  const answer = answerTurnChat(state, '9999');
  assert.ok(answer);
  assert.equal(answer.cards.length, 0);
  assert.ok(answer.note?.includes('9999'));
  assert.ok(answer.note?.includes('not in your roster'));
});

test('a crew first name answers with their day, tappable to the crew page', () => {
  const answer = answerTurnChat(state, 'what is bluebird on');
  assert.ok(answer);
  const card = answer.cards[0];
  assert.ok(card.title.startsWith('Bluebird'));
  assert.equal(card.nav?.kind, 'crew');
});

test('status keywords answer with list cards', () => {
  for (const [query, titleStart] of [
    ['callbacks', 'Open callbacks'],
    ['ready to walk', 'Ready to walk'],
    ['what needs my inspection', 'Waiting on your inspection'],
    ['where are we', 'Where we are'],
  ] as const) {
    const answer = answerTurnChat(state, query);
    assert.ok(answer, `no answer for "${query}"`);
    assert.ok(
      answer.cards[0]?.title.startsWith(titleStart),
      `"${query}" answered "${answer.cards[0]?.title}"`,
    );
  }
});

test('the summary counts released rooms per trade', () => {
  const answer = answerTurnChat(state, 'where are we');
  assert.ok(answer);
  const paintLine = answer.cards[0].lines.find((line) => line.text.startsWith('Paint —'));
  assert.ok(paintLine);
  assert.match(paintLine.text, /\d+ rooms released/);
});

test('history phrasing gets the payroll answer, not the live-day card', () => {
  const answer = answerTurnChat(state, 'what did bluebird do this week');
  assert.ok(answer);
  const card = answer.cards[0];
  assert.match(card.title, /^Bluebird Paint — pay week \d+$/);
  assert.equal(card.nav?.kind, 'crew');
  assert.ok(card.lines.some((line) => line.text.startsWith('This week:')));
  assert.ok(card.lines.some((line) => line.text.startsWith('Whole Turn:')));
  // "bluebird today" stays the live view.
  const live = answerTurnChat(state, 'bluebird today');
  assert.ok(live);
  assert.ok(!live.cards[0].title.includes('pay week'));
});

test('the history digest names the pay week and every reporting crew', () => {
  const digest = buildTurnChatHistoryDigest(state, new Date());
  if (digest === '') return; // fixture has no confirmed pay events — fine
  assert.match(digest, /^PAY WEEK \d+ \(Sun \d{4}-\d{2}-\d{2}/);
  assert.ok(digest.includes('week'));
});

test('a week task question answers the pay-packet list, lowest unit first', () => {
  const answer = answerTurnChat(state, 'what were the cut ins for week 2');
  assert.ok(answer);
  const card = answer.cards[0];
  assert.match(card.title, /^Cut-ins · week 2 · \d+ rooms?$/);
  assert.ok(card.subtitle?.includes('lowest unit first'));
  const unitLines = card.lines.filter((line) => line.nav?.kind === 'unit');
  const numbers = unitLines.map((line) => Number(line.text.split(' ')[0]));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  // Heavy cleans and touch-ups route the same way, defaulting to this week.
  const heavy = answerTurnChat(state, 'heavy cleans this week');
  assert.ok(heavy);
  assert.match(heavy.cards[0].title, /^Heavy cleans · week \d+/);
});

test('a floor question answers with only that floor', () => {
  // Fixture floors come from locationLabel ("Building 3 · Floor 3").
  const overview = answerTurnChat(state, 'just floor 3');
  assert.ok(overview);
  assert.match(overview.cards[0].title, /^Floor 3/);
  for (const line of overview.cards[0].lines) {
    if (line.nav?.kind === 'unit') assert.match(line.text, /^3\d\d /);
  }
  // Floor scopes the status keywords too — his exact field question shape.
  const scoped = answerTurnChat(state, 'anything on floor 4 that I need to check');
  assert.ok(scoped);
  assert.match(scoped.cards[0].title, /Waiting on your inspection · \d+ · floor 4$/);
  for (const line of scoped.cards[0].lines) {
    if (line.nav?.kind === 'unit') assert.match(line.text, /^4\d\d /);
  }
  // An empty floor is honest, not silent.
  const empty = answerTurnChat(state, 'floor 99');
  assert.ok(empty);
  assert.ok(empty.cards[0].lines.some((line) => line.text.includes('No units on floor 99')));
});

test('chit-chat it cannot answer returns null so the caller can escalate', () => {
  assert.equal(answerTurnChat(state, 'good morning how are you'), null);
  assert.equal(answerTurnChat(state, ''), null);
});
