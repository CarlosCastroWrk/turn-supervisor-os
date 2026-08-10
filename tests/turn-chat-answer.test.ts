import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import { answerTurnChat } from '../src/features/launch-command-center/turnChatAnswer.ts';

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

test('chit-chat it cannot answer returns null so the caller can escalate', () => {
  assert.equal(answerTurnChat(state, 'good morning how are you'), null);
  assert.equal(answerTurnChat(state, ''), null);
});
