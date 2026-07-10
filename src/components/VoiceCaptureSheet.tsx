import { Camera, Check, FileText, Image, Keyboard, Mic, ShieldCheck, Square, X } from 'lucide-react';
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
  onFinish: () => void;
  onStart: () => void;
  onStop: () => void;
  onFallback: () => void;
  onCamera?: () => void;
  onPhoto?: () => void;
  onFile?: () => void;
  onType?: () => void;
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
  onFinish,
  onStart,
  onStop,
  onFallback,
  onCamera,
  onPhoto,
  onFile,
  onType,
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
            <h2 id={titleId}>Capture</h2>
          </div>
          <button autoFocus className="icon-button" type="button" onClick={onClose} aria-label="Close voice mode">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p className="voice-safety-line"><ShieldCheck size={17} aria-hidden="true" />Nothing changes until you approve.</p>

        {showOrb ? (
          <div className="voice-orb-wrap" aria-hidden="true">
            <div className="voice-orb">{isRecording ? <Square size={28} /> : <Mic size={30} />}</div>
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
        {onCamera && onPhoto && onFile && onType ? (
          <div className="voice-capture-tools" aria-label="Other capture options">
            <button type="button" onClick={onCamera}><Camera size={21} aria-hidden="true" /><span>Camera</span></button>
            <button type="button" onClick={onPhoto}><Image size={21} aria-hidden="true" /><span>Photo</span></button>
            <button type="button" onClick={onFile}><FileText size={21} aria-hidden="true" /><span>File</span></button>
            <button type="button" onClick={onType}><Keyboard size={21} aria-hidden="true" /><span>Type</span></button>
          </div>
        ) : null}
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
          <Button variant="primary" onClick={onFinish}>
            <Check size={18} aria-hidden="true" />
            Finish
          </Button>
        </div>
        <small>{guidance.privacyNote}</small>
      </section>
    </div>
  );
}
