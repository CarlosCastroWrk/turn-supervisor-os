export type CaptureIntent = 'update' | 'note' | 'ask';
export type CaptureStep = 'intent' | 'input' | 'review' | 'result';
export type CaptureInputMethod = 'voice' | 'text' | 'photo' | 'file';

export interface CaptureSessionState {
  step: CaptureStep;
  intent?: CaptureIntent;
  inputMethod?: CaptureInputMethod;
  immutableSourceText: string;
}

export type CaptureSessionEvent =
  | { type: 'SELECT_INTENT'; intent: CaptureIntent }
  | { type: 'SELECT_INPUT_METHOD'; inputMethod: CaptureInputMethod }
  | { type: 'CONTINUE_TO_REVIEW'; sourceText: string }
  | { type: 'BACK' }
  | { type: 'START_OVER' }
  | { type: 'COMPLETE' };

export const initialCaptureSessionState: CaptureSessionState = {
  step: 'intent',
  immutableSourceText: '',
};

export function captureSessionReducer(
  state: CaptureSessionState,
  event: CaptureSessionEvent,
): CaptureSessionState {
  switch (event.type) {
    case 'SELECT_INTENT':
      if (state.step !== 'intent') return state;
      return { ...state, step: 'input', intent: event.intent, inputMethod: undefined };
    case 'SELECT_INPUT_METHOD':
      if (state.step !== 'input' || !state.intent) return state;
      if (state.intent === 'ask' && event.inputMethod === 'photo') return state;
      return { ...state, inputMethod: event.inputMethod };
    case 'CONTINUE_TO_REVIEW':
      if (state.step !== 'input' || !state.intent || !event.sourceText.trim()) return state;
      return { ...state, step: 'review', immutableSourceText: event.sourceText.trim() };
    case 'BACK':
      if (state.step === 'result') return { ...state, step: 'review' };
      if (state.step === 'review') return { ...state, step: 'input' };
      if (state.step === 'input') return initialCaptureSessionState;
      return state;
    case 'COMPLETE':
      if (state.step !== 'review') return state;
      return { ...state, step: 'result' };
    case 'START_OVER':
      return initialCaptureSessionState;
    default:
      return state;
  }
}
