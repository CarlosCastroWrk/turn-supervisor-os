export type VoiceCaptureMode = 'browserSpeech' | 'keyboardDictation' | 'manualEntry';

interface VoiceCaptureContext {
  speechRecognitionAvailable: boolean;
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
}

export const isAppleTouchDevice = ({ userAgent = '', platform = '', maxTouchPoints = 0 }: Omit<VoiceCaptureContext, 'speechRecognitionAvailable'>) =>
  /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);

export const getVoiceCaptureGuidance = (context: VoiceCaptureContext): VoiceCaptureGuidance => {
  if (context.speechRecognitionAvailable) {
    return {
      mode: 'browserSpeech',
      title: 'Browser voice capture',
      description: 'Tap Record. Short pauses are okay; the app will keep listening when the browser allows it.',
      privacyNote: 'Speech transcription is handled by the browser/OS. This app only turns saved text into draft actions.',
      idleButtonLabel: 'Record',
      unavailableStatus: 'Browser voice capture is ready.',
    };
  }

  if (isAppleTouchDevice(context)) {
    return {
      mode: 'keyboardDictation',
      title: 'Keyboard dictation fallback',
      description: 'Tap Dictate, then use the iPhone/iPad keyboard mic in the note box.',
      privacyNote: 'Keyboard dictation is handled by iOS/iPadOS. This app only saves the text you leave in the note box.',
      idleButtonLabel: 'Dictate',
      unavailableStatus: 'Note box focused. Use the keyboard mic, then tap Create Drafts.',
    };
  }

  return {
    mode: 'manualEntry',
    title: 'Text capture fallback',
    description: 'Browser voice capture is unavailable here. Type, paste, or use your device dictation into the note box.',
    privacyNote: 'Nothing changes on the board until you create and approve draft actions.',
    idleButtonLabel: 'Focus note',
    unavailableStatus: 'Note box focused. Type, paste, or use system dictation.',
  };
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
