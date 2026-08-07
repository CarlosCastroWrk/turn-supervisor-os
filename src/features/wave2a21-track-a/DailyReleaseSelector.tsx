import { useRef, useState } from 'react';
import {
  imageFileToIntakeSource,
  intakeEnabled,
  requestIntake,
} from '../../lib/intakeClient';
import type {
  DailyReleaseDraft,
  DailyReleaseExceptionKind,
  DailyReleaseTradeChoice,
} from './phase2Workflow';
import {
  DAILY_RELEASE_EXCEPTION_KINDS,
  DAILY_RELEASE_EXCEPTION_LABELS,
  DAILY_RELEASE_TRADE_CHOICES,
  resolveExactUnitNumberSelection,
  setDailyReleaseException,
  setDailyReleaseUnitSelected,
} from './phase2Workflow';
import { AiSignInPanel } from '../../components/AiSignInPanel';
import { parseDictatedRelease } from '../wave2a2-core/dictationParse';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import type { ProjectRosterUnitOption } from './contracts';
import '../wave2a2-core/acceptedCore.css';
import './trackA.css';

export interface DailyReleaseSelectorProps {
  readonly availableTradeChoices?: readonly DailyReleaseTradeChoice[];
  readonly draft: DailyReleaseDraft;
  readonly onChange: (draft: DailyReleaseDraft) => void;
  readonly doneUnitIds?: ReadonlySet<string>;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
}

const sectionLabel = (
  section: ProjectRosterUnitOption['applicableSections'][number],
) => section === 'common' ? 'Common' : `Bedroom ${section}`;

export function DailyReleaseSelector({
  availableTradeChoices = DAILY_RELEASE_TRADE_CHOICES,
  draft,
  onChange,
  doneUnitIds,
  rosterUnits,
}: DailyReleaseSelectorProps) {
  const [exactUnitInput, setExactUnitInput] = useState('');
  const [gridQuery, setGridQuery] = useState('');
  const [exactUnitErrors, setExactUnitErrors] = useState<readonly string[]>([]);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState('');
  const [intakeMessage, setIntakeMessage] = useState('');
  const intakeFileRef = useRef<HTMLInputElement>(null);

  const runIntake = async (
    source:
      | { type: 'image'; mediaType: string; data: string }
      | { type: 'text'; text: string },
  ) => {
    setIntakeBusy(true);
    setIntakeStatus('Reading today’s release…');
    try {
      const result = await requestIntake({
        kind: 'release',
        rosterUnitNumbers: rosterUnits.map((unit) => unit.unitNumber),
        source,
      });
      const unitByNumber = new Map(rosterUnits.map((unit) =>
        [unit.unitNumber.toLocaleLowerCase(), unit]));
      const matchedIds: string[] = [];
      const unmatched: string[] = [];
      for (const row of result.rows) {
        const unit = unitByNumber.get(row.unitNumber.trim().toLocaleLowerCase());
        if (unit) matchedIds.push(unit.id);
        else unmatched.push(row.unitNumber);
      }
      onChange({
        ...draft,
        explicitConfirmation: false,
        selectedUnitIds: [...new Set([...draft.selectedUnitIds, ...matchedIds])],
      });
      const notes = [
        `${matchedIds.length} Unit${matchedIds.length === 1 ? '' : 's'} selected from the import.`,
        unmatched.length > 0 ? `Not in your roster (skipped): ${unmatched.join(', ')}.` : '',
        result.uncertainties.length > 0 ? `Check: ${result.uncertainties.join(' ')}` : '',
        'Review before starting the day — nothing is released until you confirm.',
      ].filter(Boolean);
      setIntakeStatus(notes.join(' '));
    } catch (caught) {
      setIntakeStatus(caught instanceof Error
        ? caught.message
        : 'The import reader failed. Tap Units below instead.');
    } finally {
      setIntakeBusy(false);
    }
  };

  // Reliable local parse (no AI, no sign-in, instant): when Paint or Clean is
  // picked, Los's dictated/typed list selects those units right here. Returns
  // false so the caller can fall back to the AI reader for 'Both' or messy input.
  const applyDictation = (text: string): boolean => {
    const trade = draft.tradeChoice === 'Paint'
      ? 'paint'
      : draft.tradeChoice === 'Clean' ? 'clean' : null;
    if (!trade || !text.trim()) return false;
    const units = rosterUnits.map((unit) => ({
      beds: unit.applicableSections.filter((section) => section !== 'common'),
      hasCommon: unit.applicableSections.includes('common'),
      id: unit.id,
      unitNumber: unit.unitNumber,
    }));
    const result = parseDictatedRelease(text, trade, units);
    if (result.rows.length === 0) return false;
    const nextIds = new Set([
      ...draft.selectedUnitIds,
      ...result.rows.map((row) => row.unitId),
    ]);
    onChange({ ...draft, explicitConfirmation: false, selectedUnitIds: [...nextIds] });
    setIntakeStatus([
      `${result.rows.length} unit${result.rows.length === 1 ? '' : 's'} selected from your list.`,
      result.unmatched.length > 0 ? `Not in your roster: ${result.unmatched.join(', ')}.` : '',
      result.warnings.length > 0 ? result.warnings.join(' ') : '',
      'Review below — nothing releases until you Start Day.',
    ].filter(Boolean).join(' '));
    return true;
  };

  const importReleasePhotos = async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) {
      try {
        const source = await imageFileToIntakeSource(files[0]);
        await runIntake(source);
      } catch {
        setIntakeStatus('That photo could not be read.');
      }
      return;
    }
    // Several release photos: read each, merge the matched units, select once.
    setIntakeBusy(true);
    const unitByNumber = new Map(rosterUnits.map((unit) =>
      [unit.unitNumber.toLocaleLowerCase(), unit]));
    const matchedIds = new Set<string>();
    const unmatched: string[] = [];
    const uncertainties: string[] = [];
    const failedPhotos: number[] = [];
    let readCount = 0;
    for (let index = 0; index < files.length; index += 1) {
      setIntakeStatus(`Reading photo ${index + 1} of ${files.length}…`);
      try {
        const source = await imageFileToIntakeSource(files[index]);
        const result = await requestIntake({
          kind: 'release',
          rosterUnitNumbers: rosterUnits.map((unit) => unit.unitNumber),
          source,
        });
        readCount += 1;
        for (const row of result.rows) {
          const unit = unitByNumber.get(row.unitNumber.trim().toLocaleLowerCase());
          if (unit) matchedIds.add(unit.id);
          else if (!unmatched.includes(row.unitNumber)) unmatched.push(row.unitNumber);
        }
        for (const note of result.uncertainties) {
          if (!uncertainties.includes(note)) uncertainties.push(note);
        }
      } catch (caught) {
        failedPhotos.push(index + 1);
        if (caught instanceof Error && /sign in/iu.test(caught.message)) {
          setIntakeStatus(caught.message);
          setIntakeBusy(false);
          return;
        }
      }
    }
    onChange({
      ...draft,
      explicitConfirmation: false,
      selectedUnitIds: [...new Set([...draft.selectedUnitIds, ...matchedIds])],
    });
    const notes = [
      `${matchedIds.size} Unit${matchedIds.size === 1 ? '' : 's'} selected from ${readCount} photo${readCount === 1 ? '' : 's'}.`,
      unmatched.length > 0 ? `Not in your roster (skipped): ${unmatched.join(', ')}.` : '',
      failedPhotos.length > 0 ? `Photo ${failedPhotos.join(', ')} could not be read.` : '',
      uncertainties.length > 0 ? `Check: ${uncertainties.join(' ')}` : '',
      'Review before starting the day — nothing is released until you confirm.',
    ].filter(Boolean);
    setIntakeStatus(notes.join(' '));
    setIntakeBusy(false);
  };

  const selectedUnits = rosterUnits.filter((unit) =>
    draft.selectedUnitIds.includes(unit.id));
  const addExactUnits = () => {
    const result = resolveExactUnitNumberSelection(exactUnitInput, rosterUnits);
    if (!result.ok) {
      setExactUnitErrors(result.errors);
      return;
    }
    setExactUnitErrors([]);
    onChange({
      ...draft,
      explicitConfirmation: false,
      selectedUnitIds: [...new Set([
        ...draft.selectedUnitIds,
        ...result.unitIds,
      ])],
    });
    setExactUnitInput('');
  };

  return (
    <div className="w2a21a-release" data-daily-release-selector="true">
      <fieldset className="w2a21a-release__trade-choice">
        <legend>Trade scope</legend>
        <div className="w2a21a-release__segmented">
          {availableTradeChoices.map((choice) => (
            <label key={choice}>
              <input
                checked={draft.tradeChoice === choice}
                name="daily-release-trade"
                onChange={() => onChange({
                  ...draft,
                  explicitConfirmation: false,
                  tradeChoice: choice,
                })}
                type="radio"
              />
              <span>{choice}</span>
            </label>
          ))}
        </div>
        {availableTradeChoices.length === 0 ? (
          <p className="w2a21a-setup__errors" role="alert">
            Project Setup must enable Paint, Clean, or both before a release can be reviewed.
          </p>
        ) : null}
      </fieldset>

      {intakeEnabled() && rosterUnits.length > 0 ? (
        <section className="w2a2-core-intake">
          <strong>Dictate today’s release</strong>
          <p>
            {draft.tradeChoice === 'Both'
              ? 'Pick Paint or Clean above, then read your list — one trade at a time.'
              : `Tap the 🎤 on your keyboard and read your ${draft.tradeChoice} list. You review before starting.`}
          </p>
          <label>
            <span className="w2a2-core-intake__label">Your list</span>
            <textarea
              onChange={(event) => setIntakeMessage(event.target.value)}
              placeholder="1806 A B cut in, 1707 A touch cut, 800 full unit"
              value={intakeMessage}
            />
          </label>
          <button
            className="is-primary"
            disabled={intakeBusy || !intakeMessage.trim()}
            onClick={() => {
              // Reliable local parse first (Paint/Clean picked); AI reader only
              // falls back for 'Both' or input the rules can't read.
              if (!applyDictation(intakeMessage)) {
                void runIntake({ text: intakeMessage, type: 'text' });
              }
            }}
            type="button"
          >
            {intakeBusy ? 'Reading…' : 'Read my list'}
          </button>
          <details className="w2a2-core-intake__photo">
            <summary>Read a photo instead (needs sign-in)</summary>
            <AiSignInPanel purpose="release import" />
            <button
              disabled={intakeBusy}
              onClick={() => intakeFileRef.current?.click()}
              type="button"
            >
              {intakeBusy ? 'Reading…' : 'From photos'}
            </button>
            <input
              accept="image/*"
              aria-label="Choose one or more TurnBoard photos"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length > 0) void importReleasePhotos(files);
              }}
              ref={intakeFileRef}
              type="file"
            />
          </details>
          {intakeStatus ? (
            <p aria-live="polite" className="w2a2-core-intake__status">{intakeStatus}</p>
          ) : null}
        </section>
      ) : null}

      {selectedUnits.length > 0 ? (
        <section className="w2a21a-release__selected">
          <strong>Selected today · {selectedUnits.length} unit{selectedUnits.length === 1 ? '' : 's'}</strong>
          <ul>
            {[...selectedUnits]
              .sort((left, right) => compareUnitTopFloorFirst(left.unitNumber, right.unitNumber))
              .map((unit) => {
                const rooms = unit.applicableSections
                  .map((section) => section === 'common' ? 'Common' : section)
                  .join(', ');
                return (
                  <li key={unit.id}>
                    <span><b>{unit.unitNumber}</b> — {rooms}</span>
                    <button
                      onClick={() => onChange(setDailyReleaseUnitSelected(draft, unit.id, false))}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      <fieldset>
        <legend>Units released today</legend>
        {rosterUnits.length === 0 ? (
          <div className="w2a21a-setup__empty">
            <strong>No known Units are available.</strong>
            <p>Return to Project Setup and review the Property roster.</p>
          </div>
        ) : (
          <div className="w2a21a-release__selection">
            <section className="w2a21a-release__roster">
              <div className="w2a21a-release__roster-header">
                <strong>Tap the Units the property released</strong>
                {rosterUnits.length > 1 ? (
                  <button
                    onClick={() => onChange({
                      ...draft,
                      explicitConfirmation: false,
                      selectedUnitIds:
                        draft.selectedUnitIds.length
                          === rosterUnits.filter((unit) =>
                            !(doneUnitIds?.has(unit.id) ?? false)).length
                          ? []
                          : rosterUnits
                            .filter((unit) => !(doneUnitIds?.has(unit.id) ?? false))
                            .map((unit) => unit.id),
                    })}
                    type="button"
                  >
                    {(() => {
                      const available = rosterUnits
                        .filter((unit) => !(doneUnitIds?.has(unit.id) ?? false)).length;
                      return draft.selectedUnitIds.length === available
                        ? 'Clear all'
                        : `Select all ${available}`;
                    })()}
                  </button>
                ) : null}
              </div>
              <label className="w2a21a-release__search">
                <span className="sr-only">Search units</span>
                <input
                  autoComplete="off"
                  inputMode="search"
                  onChange={(event) => setGridQuery(event.target.value)}
                  placeholder="Type a unit number — no scrolling"
                  value={gridQuery}
                />
              </label>
              <div className="w2a21a-release__roster-grid">
                {rosterUnits
                  .filter((unit) => !gridQuery.trim()
                    || unit.unitNumber.toLowerCase()
                      .includes(gridQuery.trim().toLowerCase()))
                  .map((unit) => {
                  const checked = draft.selectedUnitIds.includes(unit.id);
                  const done = doneUnitIds?.has(unit.id) ?? false;
                  return (
                    <button
                      aria-pressed={checked}
                      className={done ? 'is-done' : checked ? 'is-selected' : undefined}
                      disabled={done}
                      key={unit.id}
                      onClick={() => onChange(setDailyReleaseUnitSelected(
                        draft,
                        unit.id,
                        !checked,
                      ))}
                      type="button"
                    >
                      <strong>{unit.unitNumber}</strong>
                      <small>{done ? '✓ Done' : unit.unitType}</small>
                    </button>
                  );
                })}
              </div>
            </section>
            <details className="w2a21a-release__exact">
              <summary>Paste exact Unit numbers instead</summary>
              <label>
                Exact Unit numbers
                <textarea
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => {
                    setExactUnitInput(event.target.value);
                    setExactUnitErrors([]);
                  }}
                  placeholder="101, 102, 103"
                  spellCheck={false}
                  value={exactUnitInput}
                />
              </label>
              <button
                disabled={!exactUnitInput.trim()}
                onClick={addExactUnits}
                type="button"
              >
                Add exact Units
              </button>
              <p>
                Exact roster matches only. Any duplicate, unknown, or ambiguous Unit stops the whole add.
              </p>
              {exactUnitErrors.length > 0 ? (
                <div className="w2a21a-setup__errors" role="alert">
                  <strong>No Units were added.</strong>
                  <ul>{exactUnitErrors.map((error) => <li key={error}>{error}</li>)}</ul>
                </div>
              ) : null}
            </details>
            <details className="w2a21a-release__known">
              <summary>
                Review known Units <span>{draft.selectedUnitIds.length} selected</span>
              </summary>
              <div className="w2a21a-release__unit-list">
                {rosterUnits.map((unit) => (
                  <label className="w2a21a-release__unit" key={unit.id}>
                    <input
                      checked={draft.selectedUnitIds.includes(unit.id)}
                      onChange={(event) => onChange(setDailyReleaseUnitSelected(
                        draft,
                        unit.id,
                        event.target.checked,
                      ))}
                      type="checkbox"
                    />
                    <span>
                      <strong>Unit {unit.unitNumber}</strong>
                      <small>
                        {unit.unitType} · {unit.applicableSections.length} applicable {
                          unit.applicableSections.length === 1 ? 'section' : 'sections'
                        }
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        )}
      </fieldset>

      {selectedUnits.length > 0 ? (
        <details className="w2a21a-release__exceptions">
          <summary>Exceptions <span>Optional</span></summary>
          <p>
            All structurally applicable sections are included by default. Record only today’s exceptions.
          </p>
          {selectedUnits.map((unit) => (
            <fieldset key={unit.id}>
              <legend>Unit {unit.unitNumber}</legend>
              {unit.applicableSections.map((section) => {
                const selectedException = draft.exceptions.find((exception) =>
                  exception.unitId === unit.id && exception.section === section)?.kind;
                return (
                  <label key={`${unit.id}:${section}`}>
                    {sectionLabel(section)}
                    <select
                      onChange={(event) => onChange(setDailyReleaseException(
                        draft,
                        unit.id,
                        section,
                        event.target.value
                          ? event.target.value as DailyReleaseExceptionKind
                          : undefined,
                      ))}
                      value={selectedException ?? ''}
                    >
                      <option value="">Included · no exception</option>
                      {DAILY_RELEASE_EXCEPTION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {DAILY_RELEASE_EXCEPTION_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <p className="w2a21a-setup__supporting">
            Unreleased and occupied/restricted sections stay out of the confirmed release.
            Access issues stay visible without treating keys as work authorization.
          </p>
        </details>
      ) : null}

      <label className="w2a21a-setup__switch w2a21a-release__confirm">
        <input
          checked={draft.explicitConfirmation}
          onChange={(event) => onChange({
            ...draft,
            explicitConfirmation: event.target.checked,
          })}
          type="checkbox"
        />
        <span>
          <strong>I reviewed today’s release</strong>
          <small>
            This confirms only Los’s personal release record. It does not change the paper TurnBoard.
          </small>
        </span>
      </label>
    </div>
  );
}
