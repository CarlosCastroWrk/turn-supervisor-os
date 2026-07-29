import { Check, Paintbrush, Plus, SprayCan, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  getTrackBCrewInitials,
  validateTrackBCrewDraft,
  type TrackBCrewDraft,
  type TrackBCrewRecord,
  type TrackBCrewTrade,
} from './model';
import { NativeDetailShell } from './NativeDetailShell';

const tradeIcons = {
  Clean: SprayCan,
  Paint: Paintbrush,
} as const;

export interface TrackBCrewListPageProps {
  crews: readonly TrackBCrewRecord[];
  statusLabel: string;
  backLabel?: string;
  onAdd: () => void;
  onBack: () => void;
  onEdit: (crew: TrackBCrewRecord) => void;
}
export function TrackBCrewListPage({
  backLabel,
  crews,
  onAdd,
  onBack,
  onEdit,
  statusLabel,
}: TrackBCrewListPageProps) {
  return (
    <NativeDetailShell
      backLabel={backLabel}
      description="Paint and Clean contacts for this personal workspace."
      onBack={onBack}
      statusLabel={statusLabel}
      title="Crews"
      trailingAction={(
        <button
          aria-label="Add crew"
          className="w2a1b-icon-button w2a1b-icon-button--accent"
          type="button"
          onClick={onAdd}
        >
          <Plus aria-hidden="true" size={23} />
        </button>
      )}
    >
      <section className="w2a1b-contacts" aria-label="Crew directory">
        {crews.length === 0 ? (
          <div className="w2a1b-empty-state">
            <UserRound aria-hidden="true" size={28} />
            <strong>No crews recorded</strong>
            <p>Add a Paint or Clean contact when the source is confirmed.</p>
            <button className="w2a1b-primary-button" type="button" onClick={onAdd}>
              <Plus aria-hidden="true" size={19} />
              Add crew
            </button>
          </div>
        ) : crews.map((crew) => {
          const TradeIcon = tradeIcons[crew.trade];
          return (
            <button
              className="w2a1b-contact"
              key={crew.id}
              type="button"
              onClick={() => onEdit(crew)}
            >
              <span className="w2a1b-avatar" aria-hidden="true">
                {getTrackBCrewInitials(crew.name)}
              </span>
              <span className="w2a1b-contact__copy">
                <strong>{crew.name}</strong>
                <span>
                  <TradeIcon aria-hidden="true" size={16} />
                  {crew.trade}
                  {crew.phone ? ` · ${crew.phone}` : ''}
                </span>
              </span>
              <span className={`w2a1b-contact__status ${crew.activeToday ? 'is-active' : ''}`}>
                {crew.activeToday ? <Check aria-hidden="true" size={15} /> : null}
                {crew.activeToday ? 'Active today' : 'Not active'}
              </span>
            </button>
          );
        })}
      </section>
    </NativeDetailShell>
  );
}

export interface TrackBCrewFormPageProps {
  mode: 'add' | 'edit';
  statusLabel: string;
  initialCrew?: TrackBCrewDraft;
  onBack: () => void;
  onCancel: () => void;
  onSave: (crew: TrackBCrewDraft) => void;
}

const emptyCrew: TrackBCrewDraft = {
  activeToday: true,
  name: '',
  phone: '',
  trade: 'Paint',
};

export function TrackBCrewFormPage({
  initialCrew,
  mode,
  onBack,
  onCancel,
  onSave,
  statusLabel,
}: TrackBCrewFormPageProps) {
  const [draft, setDraft] = useState<TrackBCrewDraft>(
    () => initialCrew ? { ...initialCrew } : emptyCrew,
  );
  const validation = validateTrackBCrewDraft(draft);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validation.valid) return;
    onSave({
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
    });
  };

  const setTrade = (trade: TrackBCrewTrade) => {
    setDraft((current) => ({ ...current, trade }));
  };

  return (
    <NativeDetailShell
      description="Keep only the details needed while moving through the field."
      onBack={onBack}
      statusLabel={statusLabel}
      title={mode === 'add' ? 'Add Crew' : 'Edit Crew'}
    >
      <form className="w2a1b-form" onSubmit={submit}>
        <div className="w2a1b-form__card">
          <label className="w2a1b-field">
            <span>Name</span>
            <input
              autoComplete="name"
              name="name"
              placeholder="Crew name"
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))}
            />
          </label>

          <fieldset className="w2a1b-fieldset">
            <legend>Trade</legend>
            <div className="w2a1b-segmented">
              {(['Paint', 'Clean'] as const).map((trade) => {
                const Icon = tradeIcons[trade];
                return (
                  <button
                    aria-pressed={draft.trade === trade}
                    className={draft.trade === trade ? 'is-selected' : ''}
                    key={trade}
                    type="button"
                    onClick={() => setTrade(trade)}
                  >
                    <Icon aria-hidden="true" size={18} />
                    {trade}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="w2a1b-field">
            <span>Phone <small>Optional</small></span>
            <input
              autoComplete="tel"
              inputMode="tel"
              name="phone"
              placeholder="Phone number"
              type="tel"
              value={draft.phone ?? ''}
              onChange={(event) => setDraft((current) => ({
                ...current,
                phone: event.target.value,
              }))}
            />
          </label>

          <label className="w2a1b-toggle-row">
            <span>
              <strong>Active today</strong>
              <small>Show this crew in today’s field choices.</small>
            </span>
            <input
              checked={draft.activeToday}
              name="activeToday"
              type="checkbox"
              onChange={(event) => setDraft((current) => ({
                ...current,
                activeToday: event.target.checked,
              }))}
            />
          </label>
        </div>

        {!validation.valid && draft.name.length > 0 ? (
          <p className="w2a1b-form__error" role="alert">{validation.errors[0]}</p>
        ) : null}

        <p className="w2a1b-form__notice">
          This form calls the provided save handler. It does not claim persistence on its own.
        </p>

        <div className="w2a1b-form__actions">
          <button className="w2a1b-secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="w2a1b-primary-button" disabled={!validation.valid} type="submit">
            {mode === 'add' ? 'Add crew' : 'Save changes'}
          </button>
        </div>
      </form>
    </NativeDetailShell>
  );
}
