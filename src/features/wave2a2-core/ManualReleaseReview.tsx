import { ArrowLeft, Camera, Check, MessageSquareText, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createId } from '../../lib/constants';
import {
  imageFileToIntakeSource,
  intakeEnabled,
  requestIntake,
  type IntakeRow,
} from '../../lib/intakeClient';
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
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
import './acceptedCore.css';

interface ManualReleaseReviewProps {
  actor: string;
  contacts?: readonly string[];
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
  contacts,
  currentDate,
  onBack,
  onConfirm,
  roster,
  unavailableReason,
}: ManualReleaseReviewProps) {
  const [query, setQuery] = useState('');
  // Zero-typing default: Joseph confirms almost every release.
  const [propertyContact, setPropertyContact] = useState(() => contacts?.[0] ?? '');
  const [selected, setSelected] = useState<Map<string, ManualReleaseSelection>>(
    () => new Map(),
  );
  const [confirmed, setConfirmed] = useState(false);
  // Joseph releases paint first and cleans follow later, so the quick grid
  // needs a per-trade scope — one tap must not release the other trade.
  const [tradeScope, setTradeScope] = useState<'both' | 'Paint' | 'Clean'>('both');
  // Searching filters the SAME tap grid; the per-section checkbox view is an
  // explicit choice, never a surprise interface swap.
  const [sectionMode, setSectionMode] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const pendingBatchRef = useRef<DailyReleaseBatch | undefined>(undefined);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState('');
  const [intakeMessage, setIntakeMessage] = useState('');
  const intakeFileRef = useRef<HTMLInputElement>(null);

  const applyIntakeRows = (rows: IntakeRow[], uncertainties: string[]) => {
    const unitByNumber = new Map(roster.units.map((unit) =>
      [unit.unitNumber.toLocaleLowerCase(), unit]));
    const unmatched: string[] = [];
    let added = 0;
    setSelected((current) => {
      const next = new Map(current);
      for (const row of rows) {
        const unit = unitByNumber.get(row.unitNumber.trim().toLocaleLowerCase());
        if (!unit) {
          unmatched.push(row.unitNumber);
          continue;
        }
        const trades = row.trades.length > 0 ? row.trades : ['paint', 'clean'];
        for (const trade of trades) {
          for (const section of unit.applicableSections) {
            if (!section.trades.includes(trade === 'paint' ? 'Paint' : 'Clean')) continue;
            if (
              row.sections.length > 0
              && !row.sections.includes(section.id as IntakeRow['sections'][number])
            ) {
              continue;
            }
            const selection: ManualReleaseSelection = {
              section: section.id as FieldSection,
              trade: trade as FieldTrade,
              unitId: unit.id,
            };
            const key = selectionKey(selection);
            if (!next.has(key)) {
              next.set(key, selection);
              added += 1;
            }
          }
        }
      }
      return next;
    });
    pendingBatchRef.current = undefined;
    setError('');
    const notes = [
      `${added} section${added === 1 ? '' : 's'} pre-selected from the import.`,
      unmatched.length > 0
        ? `Not in your roster (skipped): ${unmatched.join(', ')}.`
        : '',
      uncertainties.length > 0 ? `Check: ${uncertainties.join(' ')}` : '',
      'Nothing is released until you review and confirm below.',
    ].filter(Boolean);
    setIntakeStatus(notes.join(' '));
  };

  const runIntake = async (
    source:
      | { type: 'image'; mediaType: string; data: string }
      | { type: 'text'; text: string },
  ) => {
    setIntakeBusy(true);
    setIntakeStatus('Reading the release…');
    try {
      const result = await requestIntake({
        kind: 'release',
        rosterUnitNumbers: roster.units.map((unit) => unit.unitNumber),
        source,
      });
      applyIntakeRows(result.rows, result.uncertainties);
    } catch (caught) {
      setIntakeStatus(caught instanceof Error
        ? caught.message
        : 'The import reader failed. Use the roster below.');
    } finally {
      setIntakeBusy(false);
    }
  };

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
          <h1>Quick add units</h1>
          <p>{currentDate} · personal Turn OS copy</p>
        </div>
      </header>

      <div className="w2a2-core-page__scroll" data-turn-scroll-region="primary">
        <p className="w2a2-core-caption w2a2-core-boundary-line" role="note">
          Record exactly what the property released — your review decides.
          {intakeEnabled()
            ? ''
            : ' This does not read a file, photo, paper mark, or official system.'}
        </p>

        {unavailableReason ? (
          <p className="w2a2-core-error" role="alert">{unavailableReason}</p>
        ) : null}

        {intakeEnabled() ? (
          <details className="w2a2-core-intake-details">
          <summary><Camera aria-hidden="true" size={15} /> Import from photo or pasted message</summary>
          <section className="w2a2-core-intake">
            <div className="w2a2-core-intake__actions">
              <button
                disabled={intakeBusy}
                onClick={() => intakeFileRef.current?.click()}
                type="button"
              >
                <Camera aria-hidden="true" size={17} />
                From photo
              </button>
              <input
                accept="image/*"
                aria-label="Choose a TurnBoard photo"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  void imageFileToIntakeSource(file)
                    .then((source) => runIntake(source))
                    .catch(() => setIntakeStatus('That photo could not be read.'));
                }}
                ref={intakeFileRef}
                type="file"
              />
            </div>
            <label>
              <span className="w2a2-core-intake__label">
                <MessageSquareText aria-hidden="true" size={15} /> Or paste the message
              </span>
              <textarea
                onChange={(event) => setIntakeMessage(event.target.value)}
                placeholder="Joseph: you can start 301–310 paint and clean…"
                value={intakeMessage}
              />
            </label>
            <button
              disabled={intakeBusy || !intakeMessage.trim()}
              onClick={() => void runIntake({ text: intakeMessage, type: 'text' })}
              type="button"
            >
              Read message
            </button>
            {intakeStatus ? (
              <p aria-live="polite" className="w2a2-core-intake__status">{intakeStatus}</p>
            ) : null}
          </section>
          </details>
        ) : null}

        <label className="w2a2-core-field">
          <span>Property contact</span>
          {contacts && contacts.length > 0 ? (
            <span className="w2a2-core-contact-picks">
              {contacts.map((name) => (
                <button
                  aria-pressed={propertyContact === name}
                  className={propertyContact === name ? 'is-selected' : undefined}
                  key={name}
                  onClick={() => {
                    setPropertyContact(name);
                    setError('');
                  }}
                  type="button"
                >
                  {name}
                </button>
              ))}
            </span>
          ) : null}
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
          <strong>{selected.size} section{selected.size === 1 ? '' : 's'} selected</strong>
        </div>

        {!sectionMode ? (
          <div className="w2a2-core-quickgrid" aria-label="Tap Units the property released">
            <p className="w2a2-core-caption">
              Tap the Units Joseph released — one tap selects the whole Unit
              for the trades below. Type a number above to jump to it.
            </p>
            <div className="w2a2-core-quickgrid__scope" role="group" aria-label="Trades to release">
              {([['both', 'Paint + Clean'], ['Paint', 'Paint only'], ['Clean', 'Clean only']] as const)
                .map(([value, label]) => (
                  <button
                    aria-pressed={tradeScope === value}
                    className={tradeScope === value ? 'is-selected' : undefined}
                    key={value}
                    onClick={() => setTradeScope(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
            </div>
            <button
              className="w2a2-core-sectionmode-toggle"
              onClick={() => setSectionMode(true)}
              type="button"
            >
              Need part of a unit? Pick sections instead
            </button>
            <div className="w2a2-core-quickgrid__units">
              {[...roster.units]
                .filter((unit) => !query.trim()
                  || unit.unitNumber.toLowerCase().includes(query.trim().toLowerCase()))
                .sort((left, right) =>
                  left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }))
                .map((unit) => {
                  const unitSelections = unit.applicableSections.flatMap((section) =>
                    section.trades
                      .filter((trade) => tradeScope === 'both' || trade === tradeScope)
                      .map((trade) => ({
                        section: section.id as FieldSection,
                        trade: toFieldTrade(trade),
                        unitId: unit.id,
                      })));
                  const allOn = unitSelections.length > 0
                    && unitSelections.every((candidate) => selected.has(selectionKey(candidate)));
                  return (
                    <button
                      aria-pressed={allOn}
                      className={allOn ? 'is-selected' : undefined}
                      key={unit.id}
                      onClick={() => {
                        for (const candidate of unitSelections) {
                          const has = selected.has(selectionKey(candidate));
                          if (allOn === has) toggle(candidate);
                        }
                      }}
                      type="button"
                    >
                      {unit.unitNumber}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
        <div className="w2a2-core-release__units">
          <button
            className="w2a2-core-sectionmode-toggle"
            onClick={() => setSectionMode(false)}
            type="button"
          >
            ← Back to the tap grid (whole units)
          </button>
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
        )}

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

        {selected.size > 0 ? (
          <p className="w2a2-core-caption w2a2-core-proof-reminder">
            Tony's rule: submit proof whenever you receive units.{' '}
            <a
              href={OFFICIAL_PDS_LINKS.find((link) => link.id === 'backup-safety')?.url}
              rel="noreferrer"
              target="_blank"
            >
              Open the Backup Safety Submission Box
            </a>
            {' '}— the Home card keeps the copy-paste summary ready after you confirm.
          </p>
        ) : null}

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
