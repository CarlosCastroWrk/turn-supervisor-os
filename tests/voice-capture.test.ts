import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVoiceCaptureGuidance,
  isAppleTouchDevice,
  isRestartableSpeechError,
  voiceErrorStatus,
} from '../src/lib/voiceCapture.ts';

test('getVoiceCaptureGuidance prefers browser speech when available', () => {
  const guidance = getVoiceCaptureGuidance({ speechRecognitionAvailable: true, userAgent: 'iPhone' });

  assert.equal(guidance.mode, 'browserSpeech');
  assert.equal(guidance.idleButtonLabel, 'Record');
  assert.match(guidance.description, /Short pauses are okay/);
  assert.match(guidance.privacyNote, /browser\/OS/);
});

test('getVoiceCaptureGuidance shows iPhone and iPad keyboard dictation fallback', () => {
  const phone = getVoiceCaptureGuidance({ speechRecognitionAvailable: false, userAgent: 'Mozilla/5.0 (iPhone)' });
  const ipad = getVoiceCaptureGuidance({
    speechRecognitionAvailable: false,
    userAgent: 'Mozilla/5.0 (Macintosh)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });

  assert.equal(phone.mode, 'keyboardDictation');
  assert.equal(phone.idleButtonLabel, 'Dictate');
  assert.equal(ipad.mode, 'keyboardDictation');
  assert.match(phone.unavailableStatus, /keyboard mic/);
});

test('getVoiceCaptureGuidance falls back to manual entry on unsupported desktop browsers', () => {
  const guidance = getVoiceCaptureGuidance({ speechRecognitionAvailable: false, userAgent: 'Firefox', platform: 'MacIntel' });

  assert.equal(guidance.mode, 'manualEntry');
  assert.equal(guidance.idleButtonLabel, 'Focus note');
  assert.match(guidance.privacyNote, /Nothing changes/);
});

test('isAppleTouchDevice detects modern iPadOS desktop-like user agents', () => {
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('isRestartableSpeechError only restarts on ordinary browser endings and pauses', () => {
  assert.equal(isRestartableSpeechError(), true);
  assert.equal(isRestartableSpeechError('no-speech'), true);
  assert.equal(isRestartableSpeechError('not-allowed'), false);
  assert.equal(isRestartableSpeechError('network'), false);
});

test('voiceErrorStatus gives actionable fallback messages', () => {
  assert.match(voiceErrorStatus('not-allowed'), /permission/);
  assert.match(voiceErrorStatus('audio-capture'), /No microphone/);
  assert.match(voiceErrorStatus('network'), /typed note box still works offline/);
});
