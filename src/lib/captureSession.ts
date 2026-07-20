export type CaptureIntent = 'update' | 'note' | 'ask';
export type CaptureStep = 'intent' | 'input' | 'review' | 'result';
export type CaptureInputMethod = 'voice' | 'text' | 'photo' | 'file';

export type CaptureDestinationKind =
  | 'unit_timeline'
  | 'daily_log'
  | 'review'
  | 'draft_awaiting_approval'
  | 'photo_retry'
  | 'answer';

export interface CaptureOpenTarget {
  view: 'unitDetail' | 'daily' | 'copilot';
  recordId?: string;
}

export interface CaptureResultReceipt {
  destinationKind: CaptureDestinationKind;
  headline: string;
  detail: string;
  sourceText: string;
  openTarget?: CaptureOpenTarget;
}

export interface CaptureSessionError {
  headline: string;
  detail: string;
  kind: 'save_failed' | 'ambiguous_update' | 'processing_failed';
}

export interface CaptureSessionState {
  step: CaptureStep;
  intent?: CaptureIntent;
  inputMethod?: CaptureInputMethod;
  immutableSourceText: string;
  result?: CaptureResultReceipt;
  error?: CaptureSessionError;
}

export type CaptureSessionEvent =
  | { type: 'SELECT_INTENT'; intent: CaptureIntent }
  | { type: 'SELECT_INPUT_METHOD'; inputMethod: CaptureInputMethod }
  | { type: 'CONTINUE_TO_REVIEW'; sourceText: string }
  | { type: 'BACK' }
  | { type: 'START_OVER' }
  | { type: 'FAIL'; error: CaptureSessionError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'COMPLETE'; result: CaptureResultReceipt };

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
      return { ...state, step: 'review', immutableSourceText: event.sourceText.trim(), error: undefined, result: undefined };
    case 'BACK':
      if (state.step === 'result') return { ...state, step: 'review' };
      if (state.step === 'review') return { ...state, step: 'input' };
      if (state.step === 'input') return initialCaptureSessionState;
      return state;
    case 'FAIL':
      if (state.step !== 'review') return state;
      return { ...state, error: event.error };
    case 'CLEAR_ERROR':
      return { ...state, error: undefined };
    case 'COMPLETE':
      if (state.step !== 'review') return state;
      return { ...state, step: 'result', result: event.result, error: undefined };
    case 'START_OVER':
      return initialCaptureSessionState;
    default:
      return state;
  }
}
