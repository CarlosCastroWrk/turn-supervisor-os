import { useState } from 'react';
import type {
  TrackCSection,
  TrackCTrade,
} from '../wave2a2-track-c/model';
import { trackCSectionLabel } from '../wave2a2-track-c/model';
import {
  createTrackBAdditionalScopeDraft,
  type TrackBAdditionalScopeDraft,
  type TrackBAdditionalScopeStatus,
  type TrackBAdditionalScopeType,
  type TrackBChangeOrderCandidate,
} from './additionalScope';

interface AdditionalScopeHelperProps {
  readonly unitId: string;
  readonly unitLabel: string;
  readonly applicableSections: readonly TrackCSection[];
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly onDraftRequested: (draft: TrackBAdditionalScopeDraft) => void;
}

export const AdditionalScopeHelper = ({
  unitId,
  unitLabel,
  applicableSections,
  createId,
  now,
  onDraftRequested,
}: AdditionalScopeHelperProps) => {
  const [scopeType, setScopeType] =
    useState<TrackBAdditionalScopeType>('other');
  const [description, setDescription] = useState('');
  const [relatedTrade, setRelatedTrade] = useState<TrackCTrade | ''>('');
  const [sections, setSections] = useState<readonly TrackCSection[]>([]);
  const [sourceContact, setSourceContact] = useState('');
  const [changeOrderCandidate, setChangeOrderCandidate] =
    useState<TrackBChangeOrderCandidate>('uncertain');
  const [status, setStatus] =
    useState<TrackBAdditionalScopeStatus>('draft');
  const [message, setMessage] = useState<string>();

  const requestDraft = () => {
    const recordedAt = now();
    const result = createTrackBAdditionalScopeDraft({
      id: createId('track-b-additional-scope'),
      unitId,
      scopeType,
      relatedTrade: relatedTrade || undefined,
      sections,
      description,
      sourceContact,
      sourceRecordedAt: recordedAt,
      changeOrderCandidate,
      status,
      createdAt: recordedAt,
      createdBy: 'Los',
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    onDraftRequested(result.value);
    setScopeType('other');
    setDescription('');
    setRelatedTrade('');
    setSections([]);
    setSourceContact('');
    setChangeOrderCandidate('uncertain');
    setStatus('draft');
    setMessage('Personal additional-scope draft sent for local review.');
  };

  return (
    <details className="track-c-section-mode">
      <summary>Add additional scope</summary>
      <p className="track-c-boundary-copy">
        Personal draft for Unit {unitLabel}. This does not create or submit an
        official change order and does not block Paint or Clean.
      </p>
      <label className="track-c-field">
        <span>Scope type</span>
        <select
          onChange={(event) =>
            setScopeType(event.target.value as TrackBAdditionalScopeType)}
          value={scopeType}
        >
          <option value="full-paint">Full Paint</option>
          <option value="doors">Doors</option>
          <option value="drywall-repair">Drywall Repair</option>
          <option value="bathtub-clean">Bathtub Clean</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="track-c-field">
        <span>Related trade (optional)</span>
        <select
          onChange={(event) =>
            setRelatedTrade(event.target.value as TrackCTrade | '')}
          value={relatedTrade}
        >
          <option value="">No trade selected</option>
          <option value="paint">Paint</option>
          <option value="clean">Clean</option>
        </select>
      </label>
      <fieldset className="track-c-section-mode">
        <legend>Related sections (optional)</legend>
        <div className="track-c-section-chips">
          {applicableSections.map((section) => (
            <button
              aria-pressed={sections.includes(section)}
              data-track-c-critical-target="true"
              key={section}
              onClick={() =>
                setSections((current) =>
                  current.includes(section)
                    ? current.filter((candidate) => candidate !== section)
                    : [...current, section])}
              type="button"
            >
              {trackCSectionLabel(section)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="track-c-field">
        <span>Description</span>
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <label className="track-c-field">
        <span>Source or contact</span>
        <input
          onChange={(event) => setSourceContact(event.target.value)}
          value={sourceContact}
        />
      </label>
      <label className="track-c-field">
        <span>Change-order candidate</span>
        <select
          onChange={(event) =>
            setChangeOrderCandidate(
              event.target.value as TrackBChangeOrderCandidate,
            )}
          value={changeOrderCandidate}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="uncertain">Uncertain</option>
        </select>
      </label>
      <label className="track-c-field">
        <span>Status</span>
        <select
          onChange={(event) =>
            setStatus(event.target.value as TrackBAdditionalScopeStatus)}
          value={status}
        >
          <option value="draft">Draft</option>
          <option value="needs-clarification">Needs clarification</option>
          <option value="ready-for-review">Ready for review</option>
        </select>
      </label>
      <p className="track-c-boundary-copy">
        The source time is recorded when this personal draft is created.
      </p>
      <button
        className="track-c-primary-button"
        data-track-c-critical-target="true"
        onClick={requestDraft}
        type="button"
      >
        Create personal draft
      </button>
      {message ? <p role="status">{message}</p> : null}
    </details>
  );
};
