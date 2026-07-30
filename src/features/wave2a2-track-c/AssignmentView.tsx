import {
  Check,
  ClipboardCheck,
  Droplets,
  Paintbrush,
  ShieldAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
import {
  projectTrackCAssignmentEligibleUnits,
} from './projections';

interface AssignmentViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
}

export const AssignmentView = ({
  state,
  createId,
  now,
  onStateChange,
}: AssignmentViewProps) => {
  const [trade, setTrade] = useState<TrackCTrade>('paint');
  const compatibleCrews = useMemo(
    () => state.crews.filter((crew) => crew.trade === trade),
    [state.crews, trade],
  );
  const eligibleUnits = useMemo(
    () => projectTrackCAssignmentEligibleUnits(state, trade),
    [state, trade],
  );
  const [crewId, setCrewId] = useState('');
  const [unitIds, setUnitIds] = useState<readonly string[]>([]);
  const [sectionMode, setSectionMode] = useState<'all-released' | 'specific'>(
    'all-released',
  );
  const [sections, setSections] = useState<readonly TrackCSection[]>(['common']);
  const [proposal, setProposal] = useState<TrackCBulkAssignmentProposal>();
  const [receipt, setReceipt] = useState<TrackCAssignmentReceipt>();
  const [message, setMessage] = useState<string>();

  const selectTrade = (nextTrade: TrackCTrade) => {
    setTrade(nextTrade);
    setCrewId('');
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
      }),
    );
  };

  const confirm = () => {
    if (!proposal) return;
    const result = confirmTrackCBulkAssignmentProposal(state, proposal, {
      recordedAt: now(),
      recordedBy: 'Los',
      eventIdPrefix: createId('track-c-assignment'),
      confirmed: true,
    });
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    onStateChange(result.value.state, 'bulk-assignment-confirmed');
    setReceipt(result.value.receipt);
    setMessage(
      `${result.value.receipt.assignedTargets.length} personal assignment records saved.`,
    );
    setProposal(undefined);
  };

  return (
    <section className="track-c-assignment" aria-labelledby="track-c-assignment-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-assignment-heading">Assign Crews</h1>
          <p>Released Paint and Clean work only</p>
        </div>
        <ClipboardCheck aria-hidden="true" size={20} />
      </header>
      <p className="track-c-boundary-copy">
        Personal Alpha fallback: Crew Detail enhancements and Advanced Additional
        Scope are unavailable in this release. Review and confirm every personal
        assignment here; paper and payroll remain unchanged.
      </p>
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
            }}
            value={crewId}
          >
            <option value="">Choose {trade} crew</option>
            {compatibleCrews.map((crew) => (
              <option key={crew.id} value={crew.id}>{crew.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="track-c-choice-list">
          <legend>Select Units</legend>
          {eligibleUnits.map((unit) => (
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
          ))}
          {eligibleUnits.length === 0 ? (
            <p>No confirmed released {trade} work is eligible for assignment.</p>
          ) : null}
        </fieldset>
        <fieldset className="track-c-section-mode">
          <legend>Section scope</legend>
          <label>
            <input
              checked={sectionMode === 'all-released'}
              name="track-c-section-mode"
              onChange={() => {
                setSectionMode('all-released');
                setProposal(undefined);
              }}
              type="radio"
            />
            <span>All released sections</span>
          </label>
          <label>
            <input
              checked={sectionMode === 'specific'}
              name="track-c-section-mode"
              onChange={() => {
                setSectionMode('specific');
                setProposal(undefined);
              }}
              type="radio"
            />
            <span>Specific sections</span>
          </label>
          {sectionMode === 'specific' ? (
            <div className="track-c-section-chips">
              {TRACK_C_SECTIONS.map((section) => (
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
        </fieldset>
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
