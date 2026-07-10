import { Check, Mic, Square, X } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import type { VoiceCaptureGuidance } from '../lib/voiceCapture';
import { Button } from './FormControls';

interface VoiceCaptureSheetProps {
  guidance: VoiceCaptureGuidance;
  canUseBrowserSpeech: boolean;
  isRecording: boolean;
  duration: string;
  transcriptPreview: string;
  input: string;
  onInputChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  status: string;
  titleId: string;
  showOrb?: boolean;
  dictationPlaceholder: string;
  onClose: () => void;
  onStart: () => void;
  onStop: () => void;
  onFallback: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function VoiceCaptureSheet({
  guidance,
  canUseBrowserSpeech,
  isRecording,
  duration,
  transcriptPreview,
  input,
  onInputChange,
  inputRef,
  status,
  titleId,
  showOrb = false,
  dictationPlaceholder,
  onClose,
  onStart,
  onStop,
  onFallback,
  onKeyDown,
}: VoiceCaptureSheetProps) {
  return (
    <div className="voice-sheet-backdrop" role="presentation">
      <section
        className={`voice-sheet voice-sheet--${guidance.mode} ${isRecording ? 'is-recording' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="voice-sheet__handle" aria-hidden="true" />
        <div className="voice-sheet__topline">
          <div>
            <span className="quiet-label">Voice capture</span>
            <h2 id={titleId}>{canUseBrowserSpeech ? 'Listening mode' : 'Dictation mode'}</h2>
          </div>
          <button autoFocus className="icon-button" type="button" onClick={onClose} aria-label="Close voice mode">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {showOrb ? (
          <div className="voice-orb-wrap" aria-hidden="true">
            <div className="voice-orb">
              <Mic size={28} />
            </div>
            <span />
            <span />
          </div>
        ) : null}

        <div className="voice-session-meta">
          <strong>{isRecording ? 'Recording' : canUseBrowserSpeech ? 'Ready' : 'Ready for keyboard mic'}</strong>
          <span>{duration}</span>
        </div>
        <div className="voice-sheet-meter" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="voice-transcript-panel" aria-live="polite">
          {canUseBrowserSpeech ? (
            <p>{transcriptPreview || 'Transcript will appear here as your browser returns words.'}</p>
          ) : (
            <textarea
              ref={inputRef}
              rows={5}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={dictationPlaceholder}
              aria-label="Voice mode dictation text"
            />
          )}
        </div>
        {status ? <p className={isRecording ? 'success-text' : 'muted'} role="status" aria-live="polite">{status}</p> : null}
        <div className="voice-sheet-actions">
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
          <Button onClick={onClose}>
            <Check size={18} aria-hidden="true" />
            Done
          </Button>
        </div>
        <small>{guidance.privacyNote}</small>
      </section>
    </div>
  );
}
