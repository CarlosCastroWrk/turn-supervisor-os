import { useState } from 'react';
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
import type { ProjectRosterUnitOption } from './contracts';
import './trackA.css';

export interface DailyReleaseSelectorProps {
  readonly availableTradeChoices?: readonly DailyReleaseTradeChoice[];
  readonly draft: DailyReleaseDraft;
  readonly onChange: (draft: DailyReleaseDraft) => void;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
}

const sectionLabel = (
  section: ProjectRosterUnitOption['applicableSections'][number],
) => section === 'common' ? 'Common' : `Bedroom ${section}`;

export function DailyReleaseSelector({
  availableTradeChoices = DAILY_RELEASE_TRADE_CHOICES,
  draft,
  onChange,
  rosterUnits,
}: DailyReleaseSelectorProps) {
  const [exactUnitInput, setExactUnitInput] = useState('');
  const [exactUnitErrors, setExactUnitErrors] = useState<readonly string[]>([]);
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
                        draft.selectedUnitIds.length === rosterUnits.length
                          ? []
                          : rosterUnits.map((unit) => unit.id),
                    })}
                    type="button"
                  >
                    {draft.selectedUnitIds.length === rosterUnits.length
                      ? 'Clear all'
                      : `Select all ${rosterUnits.length}`}
                  </button>
                ) : null}
              </div>
              <div className="w2a21a-release__roster-grid">
                {rosterUnits.map((unit) => {
                  const checked = draft.selectedUnitIds.includes(unit.id);
                  return (
                    <button
                      aria-pressed={checked}
                      className={checked ? 'is-selected' : undefined}
                      key={unit.id}
                      onClick={() => onChange(setDailyReleaseUnitSelected(
                        draft,
                        unit.id,
                        !checked,
                      ))}
                      type="button"
                    >
                      <strong>{unit.unitNumber}</strong>
                      <small>{unit.unitType}</small>
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
