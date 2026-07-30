import {
  ArrowLeft,
  ChevronRight,
  Droplets,
  ListPlus,
  Paintbrush,
  Pencil,
  Phone,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type {
  TrackCState,
  TrackCWorkProjection,
} from './model';
import { trackCSectionLabel } from './model';
import {
  projectTrackCCrewSummaries,
  trackCUnitForTarget,
} from './projections';
import {
  projectPhase2TrackBAssignmentUnits,
  projectPhase2TrackBCrewDetail,
  type Phase2TrackBCallbackHistoryRecord,
  type Phase2TrackBCrewDetail,
} from './phase2-track-b/contracts';
import './phase2-track-b/phase2TrackB.css';

interface CrewViewProps {
  readonly state: TrackCState;
  readonly selectedCrewId?: string;
  readonly onOpenCrew: (crewId: string) => void;
  readonly onCloseCrew: () => void;
  readonly onEditCrew?: (crewId: string) => void;
  readonly onContactCrew?: (crewId: string) => void;
  readonly onAssignCrew?: (crewId: string) => void;
}

const CrewWorkList = ({
  detail,
  state,
}: {
  detail: Phase2TrackBCrewDetail;
  state: TrackCState;
}) => {
  const groups: readonly {
    label: string;
    work: readonly TrackCWorkProjection[];
  }[] = [
    { label: 'Current work', work: detail.currentWork },
    { label: 'Crew-reported complete', work: detail.crewCompleteWork },
    { label: 'Los passed', work: detail.losPassedWork },
    { label: 'Open callbacks', work: detail.openCallbackWork },
    { label: 'Property accepted', work: detail.propertyAcceptedWork },
  ];
  return (
    <div className="track-c-crew-work">
      {groups.map((group) => (
        <section key={group.label}>
          <header>
            <h2>{group.label}</h2>
            <span>{group.work.length}</span>
          </header>
          {group.work.length > 0 ? (
            <ul>
              {group.work.slice(0, 8).map((work) => {
                const unit = trackCUnitForTarget(state, work);
                return (
                  <li key={`${group.label}:${work.id}`}>
                    <strong>Unit {unit?.unitNumber ?? work.unitId}</strong>
                    <span>
                      {work.trade === 'paint' ? 'Paint' : 'Clean'} ·{' '}
                      {trackCSectionLabel(work.section)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No confirmed events in this group.</p>
          )}
        </section>
      ))}
    </div>
  );
};

const CrewCallbackHistory = ({
  history,
  state,
}: {
  history: readonly Phase2TrackBCallbackHistoryRecord[];
  state: TrackCState;
}) => (
  <section
    aria-label="Historical callbacks"
    className="phase2-track-b-callback-history"
  >
    <header>
      <h2>Callback history</h2>
      <span>{history.length}</span>
    </header>
    <p>
      Historical responsibility at callback open. Current assignment is shown
      separately above.
    </p>
    {history.length > 0 ? (
      <ol>
        {history.map((record) => {
          const unit = trackCUnitForTarget(state, record.target);
          return (
            <li key={record.callbackId}>
              <strong>
                Unit {unit?.unitNumber ?? record.target.unitId} ·{' '}
                {record.target.trade === 'paint' ? 'Paint' : 'Clean'} ·{' '}
                {trackCSectionLabel(record.target.section)}
              </strong>
              <span>
                {record.state === 'resolved' ? 'Resolved' : 'Open'} · Then:{' '}
                {record.responsibleCrewLabel}
              </span>
              <small>{record.openingNote}</small>
              {record.resolutionNote ? (
                <small>
                  Resolution: {record.resolutionNote}
                  {record.resolvedAt
                    ? ` · ${new Date(record.resolvedAt).toLocaleString()}`
                    : ''}
                </small>
              ) : null}
            </li>
          );
        })}
      </ol>
    ) : (
      <p>No confirmed callback history for this crew.</p>
    )}
  </section>
);

const CrewDetail = ({
  state,
  crewId,
  onClose,
  onEdit,
  onContact,
  onAssign,
}: {
  state: TrackCState;
  crewId: string;
  onClose: () => void;
  onEdit?: () => void;
  onContact?: () => void;
  onAssign?: () => void;
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detail = useMemo(
    () => projectPhase2TrackBCrewDetail(state, crewId),
    [crewId, state],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [crewId]);

  if (!detail) return null;
  const Icon = detail.crew.trade === 'paint' ? Paintbrush : Droplets;
  const hasEligibleReleasedWork = projectPhase2TrackBAssignmentUnits(
    state,
    detail.crew.trade,
  ).some((option) => option.eligible);
  const noReleasedWorkMessage = `No released ${
    detail.crew.trade === 'paint' ? 'Paint' : 'Clean'
  } work is available.`;
  const assignmentHelpId = `track-c-crew-${detail.crew.id}-assignment-help`;

  return (
    <article className="track-c-detail track-c-crew-detail">
      <header className="track-c-detail__header">
        <button
          aria-label="Back to crew list"
          className="track-c-back-button"
          data-track-c-critical-target="true"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div>
          <h1 ref={headingRef} tabIndex={-1}>{detail.crew.name}</h1>
          <p>
            {detail.crew.trade === 'paint' ? 'Paint' : 'Clean'} crew ·{' '}
            {detail.crew.activeToday ? 'Active today' : 'Not active today'}
          </p>
          {detail.crew.phone && onContact ? (
            <p className="phase2-track-b-crew-phone">{detail.crew.phone}</p>
          ) : null}
        </div>
      </header>
      <div className="track-c-crew-detail__actions">
        {onContact && detail.crew.phone ? (
          <button
            data-track-c-critical-target="true"
            onClick={onContact}
            type="button"
          >
            <Phone aria-hidden="true" size={17} />
            Contact
          </button>
        ) : null}
        {onEdit ? (
          <button
            data-track-c-critical-target="true"
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden="true" size={17} />
            Edit
          </button>
        ) : null}
        {onAssign ? (
          <button
            aria-describedby={
              hasEligibleReleasedWork ? undefined : assignmentHelpId
            }
            data-track-c-critical-target="true"
            disabled={!hasEligibleReleasedWork}
            onClick={onAssign}
            type="button"
          >
            <ListPlus aria-hidden="true" size={17} />
            Assign work
          </button>
        ) : null}
      </div>
      {onAssign && !hasEligibleReleasedWork ? (
        <p
          className="phase2-track-b-assignment-unavailable"
          id={assignmentHelpId}
        >
          {noReleasedWorkMessage}
        </p>
      ) : null}
      <section className="track-c-stat-grid" aria-label="Confirmed crew event stats">
        {[
          ['Assigned Units', detail.currentAssignedUnitIds.length],
          ['Crew complete', detail.stats.crewReportedComplete],
          ['Awaiting Los', detail.stats.needsLosInspection],
          ['Open callbacks', detail.stats.openCallbacks],
          ['Resolved callbacks', detail.stats.resolvedCallbacks],
          ['Los passed', detail.stats.losPassed],
          ['Property accepted', detail.stats.propertyAccepted],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <p className="track-c-boundary-copy">
        Counts use confirmed events only. No ranking, blame, payroll, or payment
        eligibility is calculated.
      </p>
      <CrewWorkList detail={detail} state={state} />
      <CrewCallbackHistory history={detail.callbackHistory} state={state} />
      <section className="track-c-recent-activity">
        <header>
          <Icon aria-hidden="true" size={18} />
          <h2>Recent confirmed activity</h2>
        </header>
        {detail.recentActivity.length > 0 ? (
          <ol>
            {detail.recentActivity.map((event) => (
              <li key={event.id}>
                <strong>{event.summary}</strong>
                <span>{new Date(event.recordedAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })} · {event.sourceLabel}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No confirmed activity.</p>
        )}
      </section>
    </article>
  );
};

export const CrewView = ({
  state,
  selectedCrewId,
  onOpenCrew,
  onCloseCrew,
  onEditCrew,
  onContactCrew,
  onAssignCrew,
}: CrewViewProps) => {
  const crews = useMemo(() => projectTrackCCrewSummaries(state), [state]);

  if (selectedCrewId) {
    return (
      <CrewDetail
        crewId={selectedCrewId}
        onClose={onCloseCrew}
        onContact={
          onContactCrew ? () => onContactCrew(selectedCrewId) : undefined
        }
        onEdit={onEditCrew ? () => onEditCrew(selectedCrewId) : undefined}
        onAssign={
          onAssignCrew ? () => onAssignCrew(selectedCrewId) : undefined
        }
        state={state}
      />
    );
  }

  return (
    <section className="track-c-crews" aria-labelledby="track-c-crews-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-crews-heading">Crews</h1>
          <p>Confirmed work, not performance scoring</p>
        </div>
        <span>{crews.filter((item) => item.crew.activeToday).length} active</span>
      </header>
      <div className="track-c-crew-list">
        {crews.map(({ crew, stats }) => {
          const Icon = crew.trade === 'paint' ? Paintbrush : Droplets;
          return (
            <button
              aria-label={`Open ${crew.name} detail`}
              className="track-c-crew-row"
              data-track-c-critical-target="true"
              key={crew.id}
              onClick={() => onOpenCrew(crew.id)}
              type="button"
            >
              <span className={`track-c-crew-row__icon is-${crew.trade}`}>
                <Icon aria-hidden="true" size={20} />
              </span>
              <span className="track-c-crew-row__identity">
                <strong>{crew.name}</strong>
                <small>
                  {crew.trade === 'paint' ? 'Paint' : 'Clean'} ·{' '}
                  {crew.activeToday ? 'Active today' : 'Not active today'}
                </small>
              </span>
              <span className="track-c-crew-row__stats">
                <strong>{stats.currentAssignments}</strong> current
                <small>{stats.crewReportedComplete} complete · {stats.needsLosInspection} need Los</small>
              </span>
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          );
        })}
      </div>
      <p className="track-c-boundary-copy track-c-view-footnote">
        Open Crew Detail before Edit. Stats come only from confirmed personal
        events.
      </p>
    </section>
  );
};
