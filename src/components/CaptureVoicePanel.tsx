import { Check, Keyboard, Mic, ShieldCheck, Square } from 'lucide-react';
import type { RefObject } from 'react';
import type { VoiceCaptureGuidance } from '../lib/voiceCapture';
import { Button } from './FormControls';

interface CaptureVoicePanelProps {
  guidance: VoiceCaptureGuidance;
  canUseBrowserSpeech: boolean;
  isRecording: boolean;
  duration: string;
  transcriptPreview: string;
  input: string;
  onInputChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  status: string;
  dictationPlaceholder: string;
  onDone: () => void;
  onStart: () => void;
  onStop: () => void;
  onFallback: () => void;
  onType: () => void;
}

export function CaptureVoicePanel({
  guidance,
  canUseBrowserSpeech,
  isRecording,
  duration,
  transcriptPreview,
  input,
  onInputChange,
  inputRef,
  status,
  dictationPlaceholder,
  onDone,
  onStart,
  onStop,
  onFallback,
  onType,
}: CaptureVoicePanelProps) {
  return (
    <section className={`capture-voice-panel ${isRecording ? 'is-recording' : ''}`} aria-labelledby="capture-voice-title">
      <div className="capture-voice-panel__header">
        <div>
          <span className="quiet-label">Voice input</span>
          <h2 id="capture-voice-title">Speak your {isRecording ? 'update' : 'field note'}</h2>
        </div>
        <span className="capture-voice-panel__timer">{duration}</span>
      </div>

      <p className="voice-safety-line"><ShieldCheck size={17} aria-hidden="true" />Recording starts only when you tap Record.</p>

      <div className="voice-transcript-panel" aria-live="polite">
        {canUseBrowserSpeech ? (
          <p>{transcriptPreview || 'Your transcript will appear here. You can edit it before continuing.'}</p>
        ) : (
          <textarea
            ref={inputRef}
            rows={5}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={dictationPlaceholder}
            aria-label="Voice dictation text"
          />
        )}
      </div>

      {status ? <p className={isRecording ? 'success-text' : 'muted'} role="status">{status}</p> : null}

      <div className="capture-voice-panel__actions">
        {canUseBrowserSpeech ? (
          <Button variant={isRecording ? 'ghost' : 'primary'} onClick={isRecording ? onStop : onStart}>
            {isRecording ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
            {isRecording ? 'Stop' : 'Record'}
          </Button>
        ) : (
          <Button variant="primary" onClick={onFallback}>
            <Mic size={18} aria-hidden="true" />
            {guidance.sheetPrimaryAction}
          </Button>
        )}
        <Button onClick={onType}>
          <Keyboard size={18} aria-hidden="true" />
          Type instead
        </Button>
        <Button variant="primary" onClick={onDone}>
          <Check size={18} aria-hidden="true" />
          Done
        </Button>
      </div>
      <small>{guidance.privacyNote}</small>
    </section>
  );
}
