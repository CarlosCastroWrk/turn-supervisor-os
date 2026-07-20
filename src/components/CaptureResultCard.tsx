import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, ExternalLink, RotateCcw } from 'lucide-react';
import type { CaptureIntent, CaptureResultReceipt, CaptureSessionError } from '../lib/captureSession';
import { Button } from './FormControls';

interface CaptureResultCardProps {
  intent: CaptureIntent;
  sourceText: string;
  receipt?: CaptureResultReceipt;
  error?: CaptureSessionError;
  onOpenTarget?: () => void;
  onRetry?: () => void;
  onSaveAsNote?: () => void;
  onCopySource: () => void;
  onOpenBackup?: () => void;
}

export function CaptureResultCard({
  intent,
  sourceText,
  receipt,
  error,
  onOpenTarget,
  onRetry,
  onSaveAsNote,
  onCopySource,
  onOpenBackup,
}: CaptureResultCardProps) {
  return (
    <div className={`capture-result-card ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
      <div className="capture-result-card__heading">
        {error ? <AlertTriangle size={22} aria-hidden="true" /> : <CheckCircle2 size={22} aria-hidden="true" />}
        <div>
          <span className="quiet-label">{intent} · {error ? 'Not saved' : 'Saved on this device'}</span>
          <h3>{error?.headline ?? receipt?.headline}</h3>
          <p>{error?.detail ?? receipt?.detail}</p>
        </div>
      </div>

      <article className="capture-result-card__source">
        <span className="quiet-label">Raw wording — preserved</span>
        <p>{sourceText}</p>
      </article>

      <div className="capture-result-card__actions">
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            <RotateCcw size={17} aria-hidden="true" /> Retry
          </Button>
        ) : null}
        {onSaveAsNote ? <Button variant="primary" onClick={onSaveAsNote}>Save as NOTE</Button> : null}
        {onOpenTarget ? (
          <Button variant="primary" onClick={onOpenTarget}>
            <ExternalLink size={17} aria-hidden="true" /> Open destination
          </Button>
        ) : null}
        {error ? (
          <Button onClick={onCopySource}>
            <ClipboardCopy size={17} aria-hidden="true" /> Copy raw wording
          </Button>
        ) : null}
        {error && onOpenBackup ? (
          <Button onClick={onOpenBackup}>
            <Download size={17} aria-hidden="true" /> Data &amp; backup
          </Button>
        ) : null}
      </div>
    </div>
  );
}
