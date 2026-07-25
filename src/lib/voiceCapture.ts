export type VoiceCaptureMode = 'browserSpeech' | 'keyboardDictation' | 'manualEntry';

interface VoiceCaptureContext {
  speechRecognitionAvailable: boolean;
  standaloneApp?: boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

export interface VoiceCaptureGuidance {
  mode: VoiceCaptureMode;
  title: string;
  description: string;
  privacyNote: string;
  idleButtonLabel: string;
  unavailableStatus: string;
  sheetPrimaryAction: string;
}

export const isAppleTouchDevice = ({ userAgent = '', platform = '', maxTouchPoints = 0 }: Omit<VoiceCaptureContext, 'speechRecognitionAvailable'>) =>
  /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);

export const getVoiceCaptureGuidance = (context: VoiceCaptureContext): VoiceCaptureGuidance => {
  const appleTouchDevice = isAppleTouchDevice(context);

  if (appleTouchDevice && context.standaloneApp) {
    return {
      mode: 'keyboardDictation',
      title: 'Keyboard dictation fallback',
      description: 'Installed iPhone/iPad apps can block browser voice capture. Use the keyboard mic so your words appear here.',
      privacyNote: 'Keyboard dictation is handled by iOS/iPadOS. This step only keeps the editable text you leave here.',
      idleButtonLabel: 'Voice Mode',
      unavailableStatus: 'Installed app voice capture needs keyboard dictation. Tap Use keyboard mic, then talk.',
      sheetPrimaryAction: 'Use keyboard mic',
    };
  }

  if (context.speechRecognitionAvailable) {
    return {
      mode: 'browserSpeech',
      title: 'Browser voice capture',
      description: 'Recording begins only after the browser confirms microphone access. Short pauses are okay.',
      privacyNote: 'Speech transcription is handled by the browser/OS. This step only keeps editable source text.',
      idleButtonLabel: 'Voice Mode',
      unavailableStatus: 'Browser voice capture is ready.',
      sheetPrimaryAction: 'Stop',
    };
  }

  if (appleTouchDevice) {
    return {
      mode: 'keyboardDictation',
      title: 'Keyboard dictation fallback',
      description: 'Open voice mode first. Use the keyboard mic only when you are ready to dictate.',
      privacyNote: 'Keyboard dictation is handled by iOS/iPadOS. This step only keeps the editable text you leave here.',
      idleButtonLabel: 'Voice Mode',
      unavailableStatus: 'Voice mode is ready. Tap Use keyboard mic when you want iOS/iPadOS dictation.',
      sheetPrimaryAction: 'Use keyboard mic',
    };
  }

  return {
    mode: 'manualEntry',
    title: 'Text capture fallback',
    description: 'Browser voice capture is unavailable here. Type, paste, or use your device dictation into the note box.',
    privacyNote: 'This step only keeps editable source text. Nothing is interpreted, sent, or changed.',
    idleButtonLabel: 'Open note',
    unavailableStatus: 'Note box focused. Type, paste, or use system dictation.',
    sheetPrimaryAction: 'Type note',
  };
};

export const shouldAutoFocusCaptureText = (context: Omit<VoiceCaptureContext, 'speechRecognitionAvailable'>) => !isAppleTouchDevice(context);

export const formatVoiceDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export const appendVoiceTranscript = (sourceText: string, capturedSegment: string) => {
  const segment = capturedSegment.trim();
  if (!segment) {
    return sourceText;
  }

  const source = sourceText.trimEnd();
  return source ? `${source} ${segment}` : segment;
};

export const isRestartableSpeechError = (error?: string) => !error || error === 'no-speech';

export const voiceErrorStatus = (error?: string, message?: string) => {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone permission was blocked. Use keyboard dictation or type into the note box.';
  }

  if (error === 'audio-capture') {
    return 'No microphone was available. Use keyboard dictation or type into the note box.';
  }

  if (error === 'network') {
    return 'Voice capture lost network/browser service. The typed note box still works offline.';
  }

  return `Voice capture stopped: ${error ?? message ?? 'browser error'}. Use the note box if needed.`;
};
