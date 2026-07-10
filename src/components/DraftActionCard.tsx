import { Check, Save, X } from 'lucide-react';
import { useState } from 'react';
import type { DraftAction } from '../types';
import { Button, Field } from './FormControls';
import { StatusBadge } from './StatusBadge';

interface DraftActionCardProps {
  draft: DraftAction;
  isStale: boolean;
  targetLabel: string;
  onApply: () => void;
  onConfirmConflictAndApply: () => void;
  onOpenTarget?: () => void;
  onReject: () => void;
  onSavePayload: (payload: Record<string, unknown>) => void;
  showAppliedOpenButton?: boolean;
  compact?: boolean;
}

const confidenceLabel = (value: number) => `${Math.round(value * 100)}%`;

const captureBatchId = (draft: DraftAction) => {
  const value = draft.payload.captureBatchId;
  return typeof value === 'string' ? value : '';
};

export function DraftActionCard({
  draft,
  isStale,
  targetLabel,
  onApply,
  onConfirmConflictAndApply,
  onOpenTarget,
  onReject,
  onSavePayload,
  showAppliedOpenButton = true,
  compact = false,
}: DraftActionCardProps) {
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(draft.payload, null, 2));
  const [payloadError, setPayloadError] = useState('');
  const isActionable = draft.status === 'pending' || draft.status === 'failed';
  const needsConflictConfirmation =
    draft.payload.requiresConflictConfirmation === true && draft.payload.explicitConflictConfirmation !== true;

  const savePayload = () => {
    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>;
      onSavePayload(parsed);
      setPayloadError('');
    } catch {
      setPayloadError('Payload must be valid JSON before saving.');
    }
  };

  if (compact) {
    return (
      <article className="draft-card draft-card--compact">
        <div className="draft-card--compact__body">
          <div className="draft-card__header">
            <div>
              <span className="quiet-label">{draft.type.replaceAll('_', ' ')}</span>
              <h3>{draft.title}</h3>
            </div>
            <StatusBadge value={draft.status} />
          </div>
          <p>{draft.summary}</p>
          <div className="draft-meta">
            <span>Target: {targetLabel}</span>
            <span>Confidence: {confidenceLabel(draft.confidence)}</span>
            {isStale ? <span>Stale</span> : null}
          </div>
          {isStale ? <p className="error-text">This draft is from a previous day. Review it by itself.</p> : null}
          {needsConflictConfirmation ? (
            <p className="error-text">This capture has competing updates for {targetLabel}. Confirm the correct one.</p>
          ) : null}
          {draft.error ? <p className="error-text">{draft.error}</p> : null}
          {draft.status === 'applied' ? <p className="success-text">Applied to {targetLabel}.</p> : null}
          <details className="draft-advanced">
            <summary>{isActionable ? 'Edit details' : 'Review details'}</summary>
            <p>{draft.why}</p>
            {isActionable ? (
              <>
                <Field label="Editable draft details">
                  <textarea rows={6} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
                </Field>
                {payloadError ? <p className="error-text">{payloadError}</p> : null}
                <Button onClick={savePayload}>
                  <Save size={16} aria-hidden="true" />
                  Save Edit
                </Button>
              </>
            ) : null}
          </details>
        </div>
        <div className="draft-card--compact__actions">
          {showAppliedOpenButton && draft.status === 'applied' && onOpenTarget ? (
            <Button onClick={onOpenTarget}>Open {targetLabel}</Button>
          ) : null}
          {isActionable ? (
            <>
              {needsConflictConfirmation ? (
                <Button variant="primary" onClick={onConfirmConflictAndApply}>
                  <Check size={16} aria-hidden="true" />
                  Confirm
                </Button>
              ) : (
                <Button variant="primary" onClick={onApply}>
                  <Check size={16} aria-hidden="true" />
                  Approve
                </Button>
              )}
              <Button variant="ghost" onClick={onReject}>
                <X size={16} aria-hidden="true" />
                Reject
              </Button>
            </>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="draft-card">
      <div className="draft-card__header">
        <div>
          <span className="quiet-label">{draft.type.replaceAll('_', ' ')}</span>
          <h3>{draft.title}</h3>
        </div>
        <StatusBadge value={draft.status} />
      </div>
      <p>{draft.summary}</p>
      <div className="draft-meta">
        <span>Target: {targetLabel}</span>
        <span>Confidence: {confidenceLabel(draft.confidence)}</span>
        {captureBatchId(draft) ? <span>Batch: {captureBatchId(draft).slice(-6)}</span> : null}
        {isStale ? <span>Stale</span> : null}
      </div>
      <details>
        <summary>Why this draft exists</summary>
        <p>{draft.why}</p>
      </details>
      {isStale ? <p className="error-text">This pending draft is from a previous day. Review it by itself before approving.</p> : null}
      {needsConflictConfirmation ? (
        <p className="error-text">
          This capture produced more than one possible update for {targetLabel}. Approve only the version that matches the field.
        </p>
      ) : null}
      {draft.error ? <p className="error-text">{draft.error}</p> : null}
      {draft.status === 'applied' ? <p className="success-text">Applied to {targetLabel}.</p> : null}
      {draft.status === 'rejected' ? <p className="muted">Rejected. No board record was changed.</p> : null}
      {showAppliedOpenButton && draft.status === 'applied' && onOpenTarget ? (
        <div className="button-row">
          <Button onClick={onOpenTarget}>Open {targetLabel}</Button>
        </div>
      ) : null}
      {isActionable ? (
        <details className="draft-advanced">
          <summary>Advanced edit</summary>
          <Field label="Editable draft details">
            <textarea rows={6} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
          </Field>
          {payloadError ? <p className="error-text">{payloadError}</p> : null}
          <Button onClick={savePayload}>
            <Save size={16} aria-hidden="true" />
            Save Edit
          </Button>
        </details>
      ) : null}
      {isActionable ? (
        <div className="button-row">
          {needsConflictConfirmation ? (
            <Button variant="primary" onClick={onConfirmConflictAndApply}>
              <Check size={16} aria-hidden="true" />
              Confirm & Approve
            </Button>
          ) : (
            <Button variant="primary" onClick={onApply}>
              <Check size={16} aria-hidden="true" />
              Approve
            </Button>
          )}
          <Button variant="ghost" onClick={onReject}>
            <X size={16} aria-hidden="true" />
            Reject
          </Button>
        </div>
      ) : null}
    </article>
  );
}
