import {
  Check,
  ClipboardCheck,
  Droplets,
  Paintbrush,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type TrackCAssignmentReceipt,
  type TrackCBulkAssignmentProposal,
  type TrackCState,
  type TrackCTrade,
  trackCSectionLabel,
} from './model';
import { confirmTrackCBulkAssignmentProposal } from './operations';
import { AdditionalScopePanel } from './phase2-track-b/AdditionalScopePanel';
import {
  createPhase2TrackBAssignmentProposal,
  projectPhase2TrackBAssignmentUnits,
  type Phase2AdditionalScopeRecord,
} from './phase2-track-b/contracts';
import './phase2-track-b/phase2TrackB.css';

interface AssignmentViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
  readonly initialCrewId?: string;
  readonly additionalScopes?: readonly Phase2AdditionalScopeRecord[];
  readonly onAdditionalScopeCreate?: (
    record: Phase2AdditionalScopeRecord,
  ) => void;
  readonly onOpenChangeOrder?: (
    record: Phase2AdditionalScopeRecord,
  ) => void;
}

const uniqueWarnings = (proposal: TrackCBulkAssignmentProposal) =>
  [...proposal.warnings, ...proposal.items.flatMap((item) => item.warnings)]
    .filter(
      (warning, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.code === warning.code &&
            candidate.message === warning.message &&
            JSON.stringify(candidate.target) ===
              JSON.stringify(warning.target),
        ) === index,
    );

export const AssignmentView = ({
  state,
  createId,
  now,
  onStateChange,
  initialCrewId,
  additionalScopes = [],
  onAdditionalScopeCreate,
  onOpenChangeOrder,
}: AssignmentViewProps) => {
  const initialCrew = state.crews.find((crew) => crew.id === initialCrewId);
  const [trade, setTrade] = useState<TrackCTrade>(
    initialCrew?.trade ?? 'paint',
  );
  const [crewId, setCrewId] = useState(initialCrew?.id ?? '');
  const [unitIds, setUnitIds] = useState<readonly string[]>([]);
  const [proposal, setProposal] = useState<TrackCBulkAssignmentProposal>();
  const [receipt, setReceipt] = useState<TrackCAssignmentReceipt>();
  const [message, setMessage] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const confirmInFlightRef = useRef(false);

  useEffect(() => {
    if (!initialCrewId) return;
    const crew = state.crews.find((candidate) => candidate.id === initialCrewId);
    if (!crew) return;
    setTrade(crew.trade);
    setCrewId(crew.id);
    setUnitIds([]);
    setProposal(undefined);
    setReceipt(undefined);
    setMessage(undefined);
  }, [initialCrewId, state.crews]);

  const compatibleCrews = useMemo(
    () => state.crews.filter((crew) => crew.trade === trade),
    [state.crews, trade],
  );
  const eligibleUnits = useMemo(
    () =>
      projectPhase2TrackBAssignmentUnits(state, trade).filter(
        (option) => option.eligible,
      ),
    [state, trade],
  );

  const selectTrade = (nextTrade: TrackCTrade) => {
    setTrade(nextTrade);
    setCrewId('');
    setUnitIds([]);
    setProposal(undefined);
    setReceipt(undefined);
    setMessage(undefined);
    confirmInFlightRef.current = false;
    setConfirming(false);
  };

  const toggleUnit = (unitId: string) => {
    setUnitIds((current) =>
      current.includes(unitId)
        ? current.filter((candidate) => candidate !== unitId)
        : [...current, unitId],
    );
    setProposal(undefined);
    setReceipt(undefined);
    setMessage(undefined);
    confirmInFlightRef.current = false;
    setConfirming(false);
  };

  const review = () => {
    setReceipt(undefined);
    setMessage(undefined);
    confirmInFlightRef.current = false;
    setConfirming(false);
    const result = createPhase2TrackBAssignmentProposal(state, {
      proposalId: createId('phase2-track-b-assignment-proposal'),
      trade,
      crewId,
      unitIds,
      createdAt: now(),
      createdBy: 'Los',
    });
    if (!result.ok) {
      setProposal(undefined);
      setMessage(result.error);
      return;
    }
    setProposal(result.value);
  };

  const confirm = () => {
    if (!proposal || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    setConfirming(true);
    const result = confirmTrackCBulkAssignmentProposal(state, proposal, {
      recordedAt: now(),
      recordedBy: 'Los',
      eventIdPrefix: `${proposal.id}-confirmed`,
      confirmed: true,
    });
    if (!result.ok) {
      confirmInFlightRef.current = false;
      setConfirming(false);
      setMessage(result.error.message);
      return;
    }

    onStateChange(result.value.state, 'bulk-assignment-confirmed');
    setReceipt(result.value.receipt);
    const assignedUnitCount = new Set(
      result.value.receipt.assignedTargets.map((target) => target.unitId),
    ).size;
    setMessage(
      `${assignedUnitCount} Unit${assignedUnitCount === 1 ? '' : 's'} assigned across ${result.value.receipt.assignedTargets.length} released sections.`,
    );
    setProposal(undefined);
    setUnitIds([]);
    setConfirming(false);
    // Keep the synchronous guard closed after success. A new Review explicitly
    // opens it, so a rapid second confirm cannot append the same proposal twice.
  };

  const proposalUnits = proposal?.unitIds.map((unitId) => {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    const items = proposal.items.filter(
      (item) => item.target.unitId === unitId && item.eligible,
    );
    return { unit, items };
  });

  return (
    <section
      aria-labelledby="track-c-assignment-heading"
      className="track-c-assignment phase2-track-b-assignment"
    >
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-assignment-heading">Assign work</h1>
          <p>One crew · one trade · released Units</p>
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
            onChange={(event) => {
              setCrewId(event.target.value);
              setProposal(undefined);
              setReceipt(undefined);
              setMessage(undefined);
              confirmInFlightRef.current = false;
              setConfirming(false);
            }}
            value={crewId}
          >
            <option value="">Choose {trade} crew</option>
            {compatibleCrews.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name}
                {crew.activeToday ? '' : ' · Not active today'}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="track-c-choice-list phase2-track-b-unit-list">
          <legend>Eligible released Units</legend>
          {eligibleUnits.map(({ unit, releasedTargets }) => (
            <label key={unit.id}>
              <input
                checked={unitIds.includes(unit.id)}
                onChange={() => toggleUnit(unit.id)}
                type="checkbox"
              />
              <span>
                <strong>Unit {unit.unitNumber}</strong>
                <small>
                  {unit.unitType} · {unit.locationLabel} ·{' '}
                  {releasedTargets.length} released section
                  {releasedTargets.length === 1 ? '' : 's'}
                </small>
              </span>
            </label>
          ))}
          {eligibleUnits.length === 0 ? (
            <p>
              No confirmed released {trade} Units are fully eligible for
              assignment.
            </p>
          ) : null}
        </fieldset>

        <p className="phase2-track-b-inline-note">
          All confirmed released sections are included automatically. Unreleased
          or restricted sections are never added.
        </p>

        <div className="phase2-track-b-primary-dock">
          <button
            className="track-c-primary-button"
            data-track-c-critical-target="true"
            disabled={!crewId || unitIds.length === 0}
            onClick={review}
            type="button"
          >
            Review personal proposal
          </button>
        </div>
      </div>

      {proposal ? (
        <section
          aria-label="Assignment proposal review"
          className="track-c-proposal phase2-track-b-proposal"
        >
          <header>
            <h2>Review</h2>
            <span>{proposalUnits?.length ?? 0} Units</span>
          </header>
          <p>
            {state.crews.find((crew) => crew.id === proposal.crewId)?.name} ·{' '}
            {proposal.trade === 'paint' ? 'Paint' : 'Clean'}
          </p>

          {uniqueWarnings(proposal).map((warning) => (
            <div
              className="track-c-proposal__warning"
              key={`${warning.code}:${warning.message}:${warning.target?.unitId ?? ''}:${warning.target?.section ?? ''}`}
            >
              <ShieldAlert aria-hidden="true" size={17} />
              <span>
                <strong>
                  {warning.severity === 'blocking' ? 'Blocked' : 'Check'}
                </strong>
                <small>{warning.message}</small>
              </span>
            </div>
          ))}

          <ul>
            {proposalUnits?.map(({ unit, items }) => (
              <li
                className={items.length > 0 ? 'is-eligible' : 'is-blocked'}
                key={unit?.id}
              >
                <Check aria-hidden="true" size={16} />
                <span>
                  <strong>Unit {unit?.unitNumber ?? 'Unavailable'}</strong>
                  <small>
                    All released sections:{' '}
                    {items
                      .map((item) => trackCSectionLabel(item.target.section))
                      .join(', ') || 'None'}
                  </small>
                </span>
              </li>
            ))}
          </ul>

          <p className="track-c-boundary-copy">
            Confirmation records personal responsibility only. Paper, property
            approval, and payroll remain unchanged.
          </p>
          <div className="track-c-action-row phase2-track-b-primary-dock">
            <button
              data-track-c-critical-target="true"
              onClick={() => {
                setProposal(undefined);
                confirmInFlightRef.current = false;
                setConfirming(false);
              }}
              type="button"
            >
              Edit
            </button>
            <button
              className="is-positive"
              data-track-c-critical-target="true"
              disabled={
                confirming ||
                proposal.items.every((item) => !item.eligible) ||
                proposal.warnings.some(
                  (warning) => warning.severity === 'blocking',
                )
              }
              onClick={confirm}
              type="button"
            >
              {confirming ? 'Saving…' : 'Confirm personal assignment'}
            </button>
          </div>
        </section>
      ) : null}

      {receipt ? (
        <p className="phase2-track-b-receipt" role="status">
          <Check aria-hidden="true" size={18} />
          Assignment saved to confirmed personal events.
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}

      {onAdditionalScopeCreate ? (
        <details className="phase2-track-b-exceptions">
          <summary>Exceptions</summary>
          <p>
            Record added scope separately. Normal crew assignment remains all
            released sections.
          </p>
          <AdditionalScopePanel
            createId={createId}
            now={now}
            onCreate={onAdditionalScopeCreate}
            onOpenChangeOrder={onOpenChangeOrder}
            records={additionalScopes}
            state={state}
          />
        </details>
      ) : null}
    </section>
  );
};
