import { Check, Keyboard, Mic, ShieldCheck, Square } from 'lucide-react';
import type { RefObject } from 'react';
import type { VoiceCaptureGuidance } from '../lib/voiceCapture';
import { Button } from './FormControls';

interface CaptureVoicePanelProps {
  guidance: VoiceCaptureGuidance;
  canUseBrowserSpeech: boolean;
  isStarting: boolean;
  isRecording: boolean;
  duration: string;
  interimTranscript: string;
  input: string;
  onInputChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  status: string;
  dictationPlaceholder: string;
  onDone?: () => void;
  onStart: () => void;
  onStop: () => void;
  onFallback: () => void;
  onType: () => void;
}

export function CaptureVoicePanel({
  guidance,
  canUseBrowserSpeech,
  isStarting,
  isRecording,
  duration,
  interimTranscript,
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
          <span className="quiet-label">Voice source</span>
          <h2 id="capture-voice-title">
            {isRecording ? 'Listening' : isStarting ? 'Starting microphone…' : 'Review your wording'}
          </h2>
        </div>
        <span className="capture-voice-panel__timer">{duration}</span>
      </div>

      <p className="voice-safety-line">
        <ShieldCheck size={17} aria-hidden="true" />
        {isRecording
          ? 'The browser confirmed recording. Stop before editing.'
          : 'This is source text only. Nothing is interpreted, sent, or changed.'}
      </p>

      <div className="voice-transcript-panel" aria-live="polite">
        <textarea
          ref={inputRef}
          rows={5}
          value={input}
          readOnly={isRecording}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={dictationPlaceholder}
          aria-label="Editable voice transcript"
        />
        {interimTranscript ? (
          <p className="voice-interim" aria-label="Words still being transcribed">
            Hearing: {interimTranscript}
          </p>
        ) : null}
      </div>

      {status ? (
        <p
          className={isRecording ? 'success-text' : canUseBrowserSpeech ? 'muted' : 'error-text'}
          role={canUseBrowserSpeech ? 'status' : 'alert'}
        >
          {status}
        </p>
      ) : null}

      <div className="capture-voice-panel__actions">
        {isRecording ? (
          <Button className="capture-voice-panel__stop" variant="danger" onClick={onStop}>
            <Square size={20} aria-hidden="true" />
            Stop
          </Button>
        ) : canUseBrowserSpeech && !isStarting ? (
          <Button onClick={onStart}>
            <Mic size={18} aria-hidden="true" />
            Record more
          </Button>
        ) : !isStarting && guidance.mode !== 'manualEntry' ? (
          <Button variant="primary" onClick={onFallback}>
            <Mic size={18} aria-hidden="true" />
            {guidance.sheetPrimaryAction}
          </Button>
        ) : null}
        {!isStarting && !isRecording ? (
          <Button variant={guidance.mode === 'manualEntry' ? 'primary' : 'secondary'} onClick={onType}>
            <Keyboard size={18} aria-hidden="true" />
            Type instead
          </Button>
        ) : null}
        {onDone && !isStarting && !isRecording ? (
          <Button variant="primary" onClick={onDone}>
            <Check size={18} aria-hidden="true" />
            Done
          </Button>
        ) : null}
      </div>
      <small>{guidance.privacyNote}</small>
    </section>
  );
}
