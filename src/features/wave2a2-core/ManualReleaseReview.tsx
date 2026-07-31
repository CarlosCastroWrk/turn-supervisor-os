import { ArrowLeft, Check, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createId } from '../../lib/constants';
import type {
  DailyReleaseBatch,
  FieldSection,
  FieldTrade,
} from '../../types';
import type { PropertyRoster } from '../wave2a2-track-b';
import {
  createManualReleaseBatch,
  type ManualReleaseSelection,
} from './appDataAdapters';
import './acceptedCore.css';

interface ManualReleaseReviewProps {
  actor: string;
  currentDate: string;
  onBack: () => void;
  onConfirm: (batch: DailyReleaseBatch) => boolean | Promise<boolean>;
  roster: PropertyRoster;
  unavailableReason?: string;
}

const MAX_VISIBLE_UNITS = 80;

const selectionKey = (selection: ManualReleaseSelection) =>
  `${selection.unitId}:${selection.section}:${selection.trade}`;

const toFieldTrade = (trade: 'Paint' | 'Clean'): FieldTrade =>
  trade === 'Paint' ? 'paint' : 'clean';

export function ManualReleaseReview({
  actor,
  currentDate,
  onBack,
  onConfirm,
  roster,
  unavailableReason,
}: ManualReleaseReviewProps) {
  const [query, setQuery] = useState('');
  const [propertyContact, setPropertyContact] = useState('');
  const [selected, setSelected] = useState<Map<string, ManualReleaseSelection>>(
    () => new Map(),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const pendingBatchRef = useRef<DailyReleaseBatch | undefined>(undefined);

  const matchingUnits = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? roster.units.filter((unit) =>
        [
          unit.unitNumber,
          unit.building,
          unit.floor,
          unit.unitType,
        ].some((value) => value?.toLocaleLowerCase().includes(normalized)))
      : roster.units;
    return {
      total: matches.length,
      visible: matches.slice(0, MAX_VISIBLE_UNITS),
    };
  }, [query, roster.units]);

  const toggle = (selection: ManualReleaseSelection) => {
    const key = selectionKey(selection);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, selection);
      return next;
    });
    pendingBatchRef.current = undefined;
    setError('');
  };

  const submit = async () => {
    if (submittingRef.current) return;
    if (unavailableReason) {
      setError(unavailableReason);
      return;
    }
    if (!propertyContact.trim()) {
      setError('Record the property contact who supplied or confirmed this release.');
      return;
    }
    if (!confirmed) {
      setError('Confirm that every selected item came from the property release.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const batch = pendingBatchRef.current ?? createManualReleaseBatch({
        actor,
        date: currentDate,
        id: createId('manual-release'),
        propertyContact,
        recordedAt: new Date().toISOString(),
        roster,
        selections: [...selected.values()],
      });
      pendingBatchRef.current = batch;
      const saved = await onConfirm(batch);
      if (!saved) {
        throw new Error('Released work was not durably saved. Retry or edit the release.');
      }
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Manual release could not be saved.');
    }
  };

  return (
    <section
      className="w2a2-core-page w2a2-core-release"
      data-testid="manual-release-review"
    >
      <header className="w2a2-core-page__header">
        <button
          aria-label="Back to Today"
          className="w2a2-core-icon-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={22} />
        </button>
        <div>
          <h1>Manual release review</h1>
          <p>{currentDate} · personal Turn OS copy</p>
        </div>
      </header>

      <div className="w2a2-core-page__scroll" data-turn-scroll-region="primary">
        <section className="w2a2-core-boundary" role="note">
          <strong>Record exactly what the property released.</strong>
          <p>
            Select only Units, sections, and Paint/Clean work the property actually
            released. This does not read a file, photo, paper mark, or official system.
          </p>
        </section>

        {unavailableReason ? (
          <p className="w2a2-core-error" role="alert">{unavailableReason}</p>
        ) : null}

        <label className="w2a2-core-field">
          <span>Property contact</span>
          <input
            autoComplete="off"
            onChange={(event) => {
              setPropertyContact(event.target.value);
              pendingBatchRef.current = undefined;
              setError('');
            }}
            placeholder="Who confirmed today’s release?"
            value={propertyContact}
          />
        </label>

        <label className="w2a2-core-search">
          <Search aria-hidden="true" size={19} />
          <span className="sr-only">Search existing roster</span>
          <input
            autoComplete="off"
            inputMode="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search existing roster"
            value={query}
          />
        </label>

        <div className="w2a2-core-release__summary" aria-live="polite">
          <span>{matchingUnits.total} matching Units</span>
          <strong>{selected.size} section-trades selected</strong>
        </div>

        <div className="w2a2-core-release__units">
          {matchingUnits.visible.map((unit) => (
            <section className="w2a2-core-release__unit" key={unit.id}>
              <header>
                <div>
                  <strong>Unit {unit.unitNumber}</strong>
                  <span>
                    {[unit.building, unit.floor, unit.unitType].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </header>
              <div className="w2a2-core-release__sections">
                {unit.applicableSections.flatMap((section) =>
                  section.trades.map((trade) => {
                    const selection = {
                      section: section.id as FieldSection,
                      trade: toFieldTrade(trade),
                      unitId: unit.id,
                    };
                    const key = selectionKey(selection);
                    const checked = selected.has(key);
                    return (
                      <label className={checked ? 'is-selected' : undefined} key={key}>
                        <input
                          checked={checked}
                          onChange={() => toggle(selection)}
                          type="checkbox"
                        />
                        <span>{section.label}</span>
                        <small>{trade}</small>
                        <Check aria-hidden="true" size={17} />
                      </label>
                    );
                  }))}
              </div>
            </section>
          ))}
        </div>

        {matchingUnits.total > matchingUnits.visible.length ? (
          <p className="w2a2-core-caption">
            Showing the first {MAX_VISIBLE_UNITS} matches. Narrow the search to review
            another Unit.
          </p>
        ) : null}

        <label className="w2a2-core-confirm">
          <input
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setError('');
            }}
            type="checkbox"
          />
          <span>
            I reviewed these selections against the property’s current release.
            Paper remains authoritative.
          </span>
        </label>

        {error ? <p className="w2a2-core-error" role="alert">{error}</p> : null}

        <button
          className="w2a2-core-primary"
          disabled={Boolean(unavailableReason) || selected.size === 0 || submitting}
          onClick={() => void submit()}
          type="button"
        >
          {submitting
            ? 'Confirming…'
            : pendingBatchRef.current
              ? 'Retry personal release'
              : 'Confirm personal release'}
        </button>
        <p className="w2a2-core-caption">
          This creates no payroll, approval, property acceptance, or official paper mark.
        </p>
      </div>
    </section>
  );
}
