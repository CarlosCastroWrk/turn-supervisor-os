import { ExternalLink, Plus, ShieldAlert, X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  TRACK_C_SECTIONS,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  trackCSectionLabel,
} from '../model';
import {
  PHASE2_ADDITIONAL_SCOPE_CATEGORIES,
  PHASE2_ADDITIONAL_SCOPE_STATUSES,
  createPhase2AdditionalScopeRecord,
  phase2AdditionalScopeBlocksBaseCompletion,
  phase2AdditionalScopeCategoryLabel,
  phase2AdditionalScopeStatusLabel,
  type Phase2AdditionalScopeCommit,
  type Phase2AdditionalScopeCategory,
  type Phase2AdditionalScopeRecord,
  type Phase2AdditionalScopeStatus,
  type Phase2ChangeOrderCandidate,
  type Phase2ScopeSourceConfidence,
} from './contracts';

interface AdditionalScopePanelProps {
  readonly state: TrackCState;
  readonly records: readonly Phase2AdditionalScopeRecord[];
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly onCommit?: Phase2AdditionalScopeCommit;
  readonly onOpenChangeOrder?: (record: Phase2AdditionalScopeRecord) => void;
}

interface AdditionalScopeMessage {
  readonly kind: 'error' | 'success';
  readonly text: string;
}

const defaultTrade = (
  category: Phase2AdditionalScopeCategory,
): TrackCTrade | '' => {
  if (category === 'full-paint') return 'paint';
  if (category === 'bathtub-clean') return 'clean';
  return '';
};

const localDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

export const AdditionalScopePanel = ({
  state,
  records,
  createId,
  now,
  onCommit,
  onOpenChangeOrder,
}: AdditionalScopePanelProps) => {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(state.units[0]?.id ?? '');
  const [category, setCategory] =
    useState<Phase2AdditionalScopeCategory>('full-paint');
  const [description, setDescription] = useState('');
  const [trade, setTrade] = useState<TrackCTrade | ''>('paint');
  const [sections, setSections] = useState<readonly TrackCSection[]>([]);
  const [sourceContact, setSourceContact] = useState('');
  const [sourceConfidence, setSourceConfidence] =
    useState<Phase2ScopeSourceConfidence>('uncertain');
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(now()));
  const [requiredForBaseCompletion, setRequiredForBaseCompletion] =
    useState(false);
  const [changeOrderCandidate, setChangeOrderCandidate] =
    useState<Phase2ChangeOrderCandidate>('uncertain');
  const [status, setStatus] =
    useState<Phase2AdditionalScopeStatus>('recorded');
  const [message, setMessage] = useState<AdditionalScopeMessage>();
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);

  const selectedUnit = useMemo(
    () => state.units.find((unit) => unit.id === unitId),
    [state.units, unitId],
  );

  const toggleSection = (section: TrackCSection) => {
    setSections((current) =>
      current.includes(section)
        ? current.filter((candidate) => candidate !== section)
        : [...current, section],
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(undefined);
    if (!onCommit) {
      setMessage({
        kind: 'error',
        text: 'Additional scope was not saved. No approved durable record owner is available in this candidate.',
      });
      return;
    }
    if (saveInFlightRef.current) return;

    const result = createPhase2AdditionalScopeRecord(state, {
      id: createId('phase2-additional-scope'),
      unitId,
      category,
      description,
      trade: trade || undefined,
      sections,
      sourceContact,
      sourceConfidence,
      occurredAt,
      recordedAt: now(),
      requiredForBaseCompletion,
      changeOrderCandidate,
      status,
    });
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const committed = await onCommit(result.value);
      if (!committed.ok) {
        setMessage({
          kind: 'error',
          text: `Additional scope was not saved. ${committed.error} Your entries are still here.`,
        });
        return;
      }
      if (
        committed.receipt.durable !== true ||
        committed.receipt.recordId !== result.value.id ||
        !Number.isFinite(Date.parse(committed.receipt.committedAt))
      ) {
        setMessage({
          kind: 'error',
          text: 'Additional scope was not saved because the durable receipt did not match this record. Your entries are still here.',
        });
        return;
      }

      setCategory('full-paint');
      setDescription('');
      setTrade('paint');
      setSections([]);
      setSourceContact('');
      setSourceConfidence('uncertain');
      setOccurredAt(localDateTime(now()));
      setRequiredForBaseCompletion(false);
      setChangeOrderCandidate('uncertain');
      setStatus('recorded');
      setMessage({
        kind: 'success',
        text: 'Personal additional scope durably saved. No price, approval, or form was submitted.',
      });
    } catch {
      setMessage({
        kind: 'error',
        text: 'Additional scope was not saved because the durable commit failed. Your entries are still here.',
      });
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="phase2-track-b-additional-scope">
      {!onCommit ? (
        <div
          className="phase2-track-b-additional-scope__unavailable"
          role="status"
        >
          <ShieldAlert aria-hidden="true" size={18} />
          <span>
            <strong>Additional Scope saving is unavailable</strong>
            <small>
              This candidate has no approved durable Additional Scope owner.
              Required added scope stays unresolved; Turn OS will not claim
              base completion from it. Keep the authoritative record on paper
              and use an existing accepted note when needed.
            </small>
          </span>
        </div>
      ) : !open ? (
        <button
          className="phase2-track-b-secondary-button"
          data-track-c-critical-target="true"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          Add additional scope
        </button>
      ) : (
        <form
          aria-label="Additional scope"
          className="phase2-track-b-additional-scope__form"
          onSubmit={save}
        >
          <header>
            <div>
              <h3>Add additional scope</h3>
              <p>Separate personal record; base Paint/Clean stays independent.</p>
            </div>
            <button
              aria-label="Close additional scope form"
              data-track-c-critical-target="true"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <label className="track-c-field">
            <span>Unit</span>
            <select
              onChange={(event) => {
                const nextUnitId = event.target.value;
                const nextUnit = state.units.find(
                  (unit) => unit.id === nextUnitId,
                );
                setUnitId(nextUnitId);
                setSections((current) =>
                  current.filter((section) =>
                    nextUnit?.applicableSections.includes(section),
                  ),
                );
              }}
              value={unitId}
            >
              {state.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}
                </option>
              ))}
            </select>
          </label>

          <label className="track-c-field">
            <span>Category</span>
            <select
              onChange={(event) => {
                const nextCategory = event.target
                  .value as Phase2AdditionalScopeCategory;
                setCategory(nextCategory);
                setTrade(defaultTrade(nextCategory));
              }}
              value={category}
            >
              {PHASE2_ADDITIONAL_SCOPE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {phase2AdditionalScopeCategoryLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="track-c-field">
            <span>Description</span>
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What changed or was added?"
              rows={3}
              value={description}
            />
          </label>

          <label className="track-c-field">
            <span>Trade, when relevant</span>
            <select
              onChange={(event) =>
                setTrade(event.target.value as TrackCTrade | '')}
              value={trade}
            >
              <option value="">Not set</option>
              <option value="paint">Paint</option>
              <option value="clean">Clean</option>
            </select>
          </label>

          <fieldset className="phase2-track-b-section-picker">
            <legend>Sections affected, when relevant</legend>
            <div>
              {TRACK_C_SECTIONS.filter((section) =>
                selectedUnit?.applicableSections.includes(section),
              ).map((section) => (
                <label key={section}>
                  <input
                    checked={sections.includes(section)}
                    onChange={() => toggleSection(section)}
                    type="checkbox"
                  />
                  <span>{trackCSectionLabel(section)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="track-c-field">
            <span>Source or contact</span>
            <input
              onChange={(event) => setSourceContact(event.target.value)}
              placeholder="Who or what supplied this scope?"
              value={sourceContact}
            />
          </label>

          <label className="track-c-field">
            <span>Source certainty</span>
            <select
              onChange={(event) =>
                setSourceConfidence(
                  event.target.value as Phase2ScopeSourceConfidence,
                )}
              value={sourceConfidence}
            >
              <option value="confirmed">Confirmed</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </label>

          <label className="track-c-field">
            <span>Date and time</span>
            <input
              onChange={(event) => setOccurredAt(event.target.value)}
              type="datetime-local"
              value={occurredAt}
            />
          </label>

          <label className="track-c-field">
            <span>Required for base completion</span>
            <select
              onChange={(event) =>
                setRequiredForBaseCompletion(event.target.value === 'yes')}
              value={requiredForBaseCompletion ? 'yes' : 'no'}
            >
              <option value="no">No — optional scope</option>
              <option value="yes">Yes — required scope</option>
            </select>
          </label>

          <label className="track-c-field">
            <span>Change-order candidate</span>
            <select
              onChange={(event) =>
                setChangeOrderCandidate(
                  event.target.value as Phase2ChangeOrderCandidate,
                )}
              value={changeOrderCandidate}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </label>

          <label className="track-c-field">
            <span>Personal status</span>
            <select
              onChange={(event) =>
                setStatus(event.target.value as Phase2AdditionalScopeStatus)}
              value={status}
            >
              {PHASE2_ADDITIONAL_SCOPE_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {phase2AdditionalScopeStatusLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <p className="phase2-track-b-safety-copy">
            <ShieldAlert aria-hidden="true" size={17} />
            Personal note only. This does not price or approve work, submit a
            form, change paper, or affect payroll.
          </p>
          {message ? (
            <p role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          ) : null}
          <button
            className="track-c-primary-button"
            data-track-c-critical-target="true"
            disabled={saving}
            type="submit"
          >
            {saving
              ? 'Saving…'
              : message?.kind === 'error'
                ? 'Retry save'
                : 'Save personal additional scope'}
          </button>
        </form>
      )}

      {records.length > 0 ? (
        <section
          aria-label="Additional scope records"
          className="phase2-track-b-additional-scope__records"
        >
          <h3>Additional scope records</h3>
          {records.map((record) => {
            const unit = state.units.find(
              (candidate) => candidate.id === record.unitId,
            );
            return (
              <article key={record.id}>
                <header>
                  <strong>
                    Unit {unit?.unitNumber ?? record.unitId} ·{' '}
                    {phase2AdditionalScopeCategoryLabel(record.category)}
                  </strong>
                  <span>{phase2AdditionalScopeStatusLabel(record.status)}</span>
                </header>
                <p>{record.description}</p>
                <small>
                  {record.sourceConfidence === 'confirmed'
                    ? 'Confirmed source'
                    : 'Source uncertain'}{' '}
                  · {record.sourceContact} ·{' '}
                  {record.requiredForBaseCompletion
                    ? phase2AdditionalScopeBlocksBaseCompletion(record)
                      ? 'Required · unresolved'
                      : 'Required · reported complete'
                    : 'Optional'}
                </small>
                {record.changeOrderCandidate !== 'no' &&
                onOpenChangeOrder ? (
                  <button
                    className="phase2-track-b-link-button"
                    data-track-c-critical-target="true"
                    onClick={() => onOpenChangeOrder(record)}
                    type="button"
                  >
                    Open Change Order Approval
                    <ExternalLink aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </section>
  );
};
