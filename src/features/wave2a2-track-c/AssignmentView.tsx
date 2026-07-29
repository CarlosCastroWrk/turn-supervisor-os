import {
  Check,
  ClipboardCheck,
  Droplets,
  Paintbrush,
  ShieldAlert,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AdditionalScopeHelper } from '../wave2a21-track-b/AdditionalScopeHelper';
import type { TrackBAdditionalScopeDraft } from '../wave2a21-track-b/additionalScope';
import {
  resolveTrackBActiveCrewIds,
  trackBAssignmentConfirmationPrefix,
} from '../wave2a21-track-b/contracts';
import {
  acquireTrackBOneShot,
  releaseTrackBOneShot,
} from '../wave2a21-track-b/oneShot';
import {
  TRACK_C_SECTIONS,
  type TrackCAssignmentReceipt,
  type TrackCBulkAssignmentProposal,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  trackCSectionLabel,
} from './model';
import {
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
} from './operations';
import { projectTrackCReleasedUnitsForTrade } from './projections';

export interface AssignmentViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly activeCrewIds?: readonly string[];
  readonly onAdditionalScopeDraftRequested?: (
    draft: TrackBAdditionalScopeDraft,
  ) => void;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
}

export const AssignmentView = ({
  state,
  createId,
  now,
  activeCrewIds,
  onAdditionalScopeDraftRequested,
  onStateChange,
}: AssignmentViewProps) => {
  const [trade, setTrade] = useState<TrackCTrade>('paint');
  const availableCrewIds = useMemo(
    () => resolveTrackBActiveCrewIds(state.crews, activeCrewIds),
    [activeCrewIds, state.crews],
  );
  const compatibleCrews = useMemo(
    () =>
      state.crews.filter(
        (crew) => crew.trade === trade && availableCrewIds.includes(crew.id),
      ),
    [availableCrewIds, state.crews, trade],
  );
  const releasedUnits = useMemo(
    () => projectTrackCReleasedUnitsForTrade(state, trade),
    [state, trade],
  );
  const [crewId, setCrewId] = useState('');
  const [unitIds, setUnitIds] = useState<readonly string[]>([]);
  const [sectionMode, setSectionMode] = useState<'all-released' | 'specific'>(
    'all-released',
  );
  const [sections, setSections] = useState<readonly TrackCSection[]>([]);
  const [proposal, setProposal] = useState<TrackCBulkAssignmentProposal>();
  const [receipt, setReceipt] = useState<TrackCAssignmentReceipt>();
  const [message, setMessage] = useState<string>();
  const confirmGuardRef = useRef(false);

  const availableExceptionSections = useMemo(
    () =>
      TRACK_C_SECTIONS.filter((section) =>
        releasedUnits
          .filter((unit) => unitIds.includes(unit.id))
          .some(
            (unit) =>
              unit.applicableSections.includes(section) &&
              unit.workFacts.some(
                (fact) =>
                  fact.trade === trade &&
                  fact.section === section &&
                  fact.release === 'released',
              ),
          ),
      ),
    [releasedUnits, trade, unitIds],
  );

  const selectTrade = (nextTrade: TrackCTrade) => {
    setTrade(nextTrade);
    setCrewId('');
    setUnitIds([]);
    setSectionMode('all-released');
    setSections([]);
    setProposal(undefined);
    setReceipt(undefined);
    setMessage(undefined);
  };

  const toggleUnit = (unitId: string) => {
    setUnitIds((current) =>
      current.includes(unitId)
        ? current.filter((candidate) => candidate !== unitId)
        : [...current, unitId],
    );
    setProposal(undefined);
  };

  const toggleSection = (section: TrackCSection) => {
    setSections((current) =>
      current.includes(section)
        ? current.filter((candidate) => candidate !== section)
        : [...current, section],
    );
    setProposal(undefined);
  };

  const review = () => {
    confirmGuardRef.current = false;
    setReceipt(undefined);
    setMessage(undefined);
    setProposal(
      createTrackCBulkAssignmentProposal(state, {
        proposalId: createId('track-c-assignment-proposal'),
        trade,
        crewId,
        unitIds,
        sectionMode,
        sections,
        createdAt: now(),
        createdBy: 'Los',
        activeCrewIds: availableCrewIds,
      }),
    );
  };

  const confirm = () => {
    if (!proposal || !acquireTrackBOneShot(confirmGuardRef)) return;
    const result = confirmTrackCBulkAssignmentProposal(state, proposal, {
      recordedAt: now(),
      recordedBy: 'Los',
      eventIdPrefix: trackBAssignmentConfirmationPrefix(proposal.id),
      confirmed: true,
      currentActiveCrewIds: availableCrewIds,
    });
    if (!result.ok) {
      releaseTrackBOneShot(confirmGuardRef);
      setMessage(result.error.message);
      return;
    }
    onStateChange(result.value.state, 'bulk-assignment-confirmed');
    setReceipt(result.value.receipt);
    setMessage(
      result.value.receipt.idempotentReplay
        ? 'This exact personal assignment was already saved. No duplicate record was added.'
        : `${result.value.receipt.assignedTargets.length} personal assignment records saved.`,
    );
    setProposal(undefined);
  };

  return (
    <section className="track-c-assignment" aria-labelledby="track-c-assignment-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-assignment-heading">Bulk assign</h1>
          <p>Review before personal records change</p>
        </div>
        <ClipboardCheck aria-hidden="true" size={20} />
      </header>
      <div className="track-c-form-stack">
        <fieldset className="track-c-segmented">
          <legend>Trade</legend>
          {(['paint', 'clean'] as const).map((option) => {
            const Icon = option === 'paint' ? Paintbrush : Droplets;
            return (
              <button
                aria-pressed={trade === option}
                data-track-c-critical-target="true"
                key={option}
                onClick={() => selectTrade(option)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                {option === 'paint' ? 'Paint' : 'Clean'}
              </button>
            );
          })}
        </fieldset>
        <label className="track-c-field">
          <span>Compatible crew</span>
          <select
            aria-label="Compatible crew"
            disabled={compatibleCrews.length === 0}
            onChange={(event) => {
              setCrewId(event.target.value);
              setProposal(undefined);
            }}
            value={crewId}
          >
            <option value="">Choose {trade} crew</option>
            {compatibleCrews.map((crew) => (
              <option key={crew.id} value={crew.id}>{crew.name}</option>
            ))}
          </select>
          {compatibleCrews.length === 0 ? (
            <small>No active {trade} crew is confirmed for today.</small>
          ) : null}
        </label>
        <fieldset className="track-c-choice-list">
          <legend>Released Units</legend>
          {releasedUnits.length > 0 ? (
            releasedUnits.map((unit) => (
              <label key={unit.id}>
                <input
                  checked={unitIds.includes(unit.id)}
                  onChange={() => toggleUnit(unit.id)}
                  type="checkbox"
                />
                <span>
                  <strong>Unit {unit.unitNumber}</strong>
                  <small>{unit.unitType} · {unit.locationLabel}</small>
                </span>
              </label>
            ))
          ) : (
            <p>No released {trade} work is available to assign.</p>
          )}
        </fieldset>
        <p className="track-c-boundary-copy">
          All released sections are included by default for the selected Units.
          Use Exceptions only when a special section selection is needed.
        </p>
        <details className="track-c-section-mode">
          <summary>Exceptions</summary>
          <label>
            <input
              checked={sectionMode === 'specific'}
              name="track-c-section-mode"
              onChange={(event) => {
                setSectionMode(
                  event.target.checked ? 'specific' : 'all-released',
                );
                setSections([]);
                setProposal(undefined);
              }}
              type="checkbox"
            />
            <span>Select only specific released sections</span>
          </label>
          {sectionMode === 'specific' ? (
            <div className="track-c-section-chips">
              {availableExceptionSections.map((section) => (
                <button
                  aria-pressed={sections.includes(section)}
                  data-track-c-critical-target="true"
                  key={section}
                  onClick={() => toggleSection(section)}
                  type="button"
                >
                  {trackCSectionLabel(section)}
                </button>
              ))}
            </div>
          ) : null}
        </details>
        <button
          className="track-c-primary-button"
          data-track-c-critical-target="true"
          disabled={!crewId || unitIds.length === 0 || (sectionMode === 'specific' && sections.length === 0)}
          onClick={review}
          type="button"
        >
          Review personal proposal
        </button>
      </div>
      {onAdditionalScopeDraftRequested && unitIds.length === 1 ? (
        <AdditionalScopeHelper
          applicableSections={
            releasedUnits.find((unit) => unit.id === unitIds[0])
              ?.applicableSections ?? []
          }
          createId={createId}
          now={now}
          onDraftRequested={onAdditionalScopeDraftRequested}
          unitId={unitIds[0]}
          unitLabel={
            releasedUnits.find((unit) => unit.id === unitIds[0])?.unitNumber ??
            unitIds[0]
          }
        />
      ) : null}
      {proposal ? (
        <section className="track-c-proposal" aria-label="Assignment proposal review">
          <header>
            <h2>Review</h2>
            <span>
              {proposal.items.filter((item) => item.eligible).length} eligible ·{' '}
              {proposal.items.filter((item) => !item.eligible).length} blocked
            </span>
          </header>
          <p>
            {state.crews.find((crew) => crew.id === proposal.crewId)?.name} ·{' '}
            {proposal.trade === 'paint' ? 'Paint' : 'Clean'}
          </p>
          {[...proposal.warnings, ...proposal.items.flatMap((item) => item.warnings)]
            .filter(
              (warning, index, all) =>
                all.findIndex(
                  (candidate) =>
                    candidate.code === warning.code &&
                    candidate.message === warning.message &&
                    JSON.stringify(candidate.target) === JSON.stringify(warning.target),
                ) === index,
            )
            .map((warning) => (
              <div className="track-c-proposal__warning" key={`${warning.code}:${warning.message}:${warning.target?.unitId ?? ''}:${warning.target?.section ?? ''}`}>
                <ShieldAlert aria-hidden="true" size={17} />
                <span>
                  <strong>{warning.code.replaceAll('-', ' ')}</strong>
                  <small>{warning.message}</small>
                </span>
              </div>
            ))}
          <ul>
            {proposal.items.map((item) => {
              const unit = state.units.find((candidate) => candidate.id === item.target.unitId);
              return (
                <li className={item.eligible ? 'is-eligible' : 'is-blocked'} key={`${item.target.unitId}:${item.target.section}`}>
                  {item.eligible ? <Check aria-hidden="true" size={16} /> : <ShieldAlert aria-hidden="true" size={16} />}
                  Unit {unit?.unitNumber} · {trackCSectionLabel(item.target.section)}
                </li>
              );
            })}
          </ul>
          <p className="track-c-boundary-copy">
            Confirming changes personal Turn OS assignment records only. Paper and
            payroll remain unchanged.
          </p>
          <div className="track-c-action-row">
            <button
              data-track-c-critical-target="true"
              onClick={() => setProposal(undefined)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="is-positive"
              data-track-c-critical-target="true"
              disabled={!proposal.items.some((item) => item.eligible)}
              onClick={confirm}
              type="button"
            >
              Confirm personal assignment
            </button>
          </div>
        </section>
      ) : null}
      {message ? (
        <div className="track-c-receipt" role="status">
          <Check aria-hidden="true" size={18} />
          <span>
            <strong>{message}</strong>
            <small>
              {receipt?.skippedTargets.length ?? 0} blocked section(s) stayed unchanged.
            </small>
          </span>
        </div>
      ) : null}
    </section>
  );
};
