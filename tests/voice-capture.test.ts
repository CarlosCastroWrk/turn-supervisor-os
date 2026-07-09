import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVoiceDuration,
  getVoiceCaptureGuidance,
  isAppleTouchDevice,
  isRestartableSpeechError,
  shouldAutoFocusCaptureText,
  voiceErrorStatus,
} from '../src/lib/voiceCapture.ts';

test('getVoiceCaptureGuidance prefers browser speech when available', () => {
  const guidance = getVoiceCaptureGuidance({ speechRecognitionAvailable: true, userAgent: 'Chrome', platform: 'MacIntel' });

  assert.equal(guidance.mode, 'browserSpeech');
  assert.equal(guidance.idleButtonLabel, 'Voice Mode');
  assert.equal(guidance.sheetPrimaryAction, 'Stop');
  assert.match(guidance.description, /Short pauses are okay/);
  assert.match(guidance.privacyNote, /browser\/OS/);
});

test('getVoiceCaptureGuidance avoids browser speech inside installed iPhone and iPad apps', () => {
  const phone = getVoiceCaptureGuidance({
    speechRecognitionAvailable: true,
    standaloneApp: true,
    userAgent: 'Mozilla/5.0 (iPhone)',
  });
  const ipad = getVoiceCaptureGuidance({
    speechRecognitionAvailable: true,
    standaloneApp: true,
    userAgent: 'Mozilla/5.0 (Macintosh)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });

  assert.equal(phone.mode, 'keyboardDictation');
  assert.equal(ipad.mode, 'keyboardDictation');
  assert.match(phone.description, /Installed iPhone\/iPad apps/);
  assert.match(phone.unavailableStatus, /Use keyboard mic/);
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
  assert.equal(phone.idleButtonLabel, 'Voice Mode');
  assert.equal(phone.sheetPrimaryAction, 'Use keyboard mic');
  assert.equal(ipad.mode, 'keyboardDictation');
  assert.match(phone.unavailableStatus, /Use keyboard mic/);
});

test('getVoiceCaptureGuidance falls back to manual entry on unsupported desktop browsers', () => {
  const guidance = getVoiceCaptureGuidance({ speechRecognitionAvailable: false, userAgent: 'Firefox', platform: 'MacIntel' });

  assert.equal(guidance.mode, 'manualEntry');
  assert.equal(guidance.idleButtonLabel, 'Open note');
  assert.equal(guidance.sheetPrimaryAction, 'Type note');
  assert.match(guidance.privacyNote, /Nothing changes/);
});

test('isAppleTouchDevice detects modern iPadOS desktop-like user agents', () => {
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('shouldAutoFocusCaptureText avoids opening the iPhone or iPad keyboard on page load', () => {
  assert.equal(shouldAutoFocusCaptureText({ userAgent: 'Mozilla/5.0 (iPhone)' }), false);
  assert.equal(shouldAutoFocusCaptureText({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), false);
  assert.equal(shouldAutoFocusCaptureText({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), true);
});

test('formatVoiceDuration returns a stable minute and second display', () => {
  assert.equal(formatVoiceDuration(0), '0:00');
  assert.equal(formatVoiceDuration(7), '0:07');
  assert.equal(formatVoiceDuration(72), '1:12');
  assert.equal(formatVoiceDuration(-12), '0:00');
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
