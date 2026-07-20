import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureSessionReducer,
  initialCaptureSessionState,
} from '../src/lib/captureSession.ts';

test('Capture opens at Intent and requires intent before input', () => {
  assert.deepEqual(initialCaptureSessionState, { step: 'intent', immutableSourceText: '' });
  assert.equal(
    captureSessionReducer(initialCaptureSessionState, { type: 'SELECT_INPUT_METHOD', inputMethod: 'voice' }).step,
    'intent',
  );
});

test('Capture follows intent, input, review, and result in order', () => {
  const input = captureSessionReducer(initialCaptureSessionState, { type: 'SELECT_INTENT', intent: 'update' });
  const voice = captureSessionReducer(input, { type: 'SELECT_INPUT_METHOD', inputMethod: 'voice' });
  const review = captureSessionReducer(voice, { type: 'CONTINUE_TO_REVIEW', sourceText: 'Unit 413 paint crew-complete.' });
  const result = captureSessionReducer(review, {
    type: 'COMPLETE',
    result: {
      destinationKind: 'review',
      headline: 'Added to Review',
      detail: 'Nothing applied.',
      sourceText: review.immutableSourceText,
    },
  });

  assert.equal(input.step, 'input');
  assert.equal(voice.inputMethod, 'voice');
  assert.equal(review.step, 'review');
  assert.equal(review.immutableSourceText, 'Unit 413 paint crew-complete.');
  assert.equal(result.step, 'result');
  assert.equal(result.result?.destinationKind, 'review');
});

test('a save failure stays in Review with immutable wording', () => {
  const input = captureSessionReducer(initialCaptureSessionState, { type: 'SELECT_INTENT', intent: 'note' });
  const review = captureSessionReducer(input, { type: 'CONTINUE_TO_REVIEW', sourceText: 'Call Joseph after lunch.' });
  const failed = captureSessionReducer(review, {
    type: 'FAIL',
    error: { kind: 'save_failed', headline: 'Not saved', detail: 'Retry.' },
  });

  assert.equal(failed.step, 'review');
  assert.equal(failed.immutableSourceText, 'Call Joseph after lunch.');
  assert.equal(failed.error?.kind, 'save_failed');
});

test('ASK cannot select Photo and Back never closes the shell', () => {
  const input = captureSessionReducer(initialCaptureSessionState, { type: 'SELECT_INTENT', intent: 'ask' });
  const rejectedPhoto = captureSessionReducer(input, { type: 'SELECT_INPUT_METHOD', inputMethod: 'photo' });
  const back = captureSessionReducer(input, { type: 'BACK' });

  assert.equal(rejectedPhoto.inputMethod, undefined);
  assert.equal(back.step, 'intent');
});

test('empty wording cannot advance to Review', () => {
  const input = captureSessionReducer(initialCaptureSessionState, { type: 'SELECT_INTENT', intent: 'note' });
  assert.equal(captureSessionReducer(input, { type: 'CONTINUE_TO_REVIEW', sourceText: '  ' }).step, 'input');
});
