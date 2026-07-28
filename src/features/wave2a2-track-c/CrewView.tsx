import {
  ArrowLeft,
  ChevronRight,
  Droplets,
  Paintbrush,
  Pencil,
  Phone,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type {
  TrackCCrewDetail,
  TrackCState,
  TrackCWorkProjection,
} from './model';
import { trackCSectionLabel } from './model';
import {
  projectTrackCCrewDetail,
  projectTrackCCrewSummaries,
  trackCUnitForTarget,
} from './projections';

interface CrewViewProps {
  readonly state: TrackCState;
  readonly selectedCrewId?: string;
  readonly onOpenCrew: (crewId: string) => void;
  readonly onCloseCrew: () => void;
  readonly onEditCrew?: (crewId: string) => void;
  readonly onContactCrew?: (crewId: string) => void;
}

const CrewWorkList = ({
  detail,
  state,
}: {
  detail: TrackCCrewDetail;
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
const CrewDetail = ({
  state,
  crewId,
  onClose,
  onEdit,
  onContact,
}: {
  state: TrackCState;
  crewId: string;
  onClose: () => void;
  onEdit?: () => void;
  onContact?: () => void;
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detail = useMemo(
    () => projectTrackCCrewDetail(state, crewId),
    [crewId, state],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [crewId]);

  if (!detail) return null;
  const Icon = detail.crew.trade === 'paint' ? Paintbrush : Droplets;

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
        </div>
      </header>
      <div className="track-c-crew-detail__actions">
        {onContact ? (
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
      </div>
      <section className="track-c-stat-grid" aria-label="Confirmed crew event stats">
        {[
          ['Current', detail.stats.currentAssignments],
          ['Crew complete', detail.stats.crewReportedComplete],
          ['Needs Los', detail.stats.needsLosInspection],
          ['Los passed', detail.stats.losPassed],
          ['Callbacks', detail.stats.openCallbacks],
          ['Accepted', detail.stats.propertyAccepted],
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
