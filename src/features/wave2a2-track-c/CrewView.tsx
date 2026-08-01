import {
  ArrowLeft,
  ChevronRight,
  Droplets,
  Paintbrush,
  Pencil,
  Phone,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  readonly onAssignCrew?: (crewId: string) => void;
  readonly onAddCrewRequested?: () => void;
  readonly crewDirectory?: Readonly<Record<string, { phone?: string }>>;
  readonly propertyContacts?: readonly {
    id: string;
    name: string;
    role?: string;
    phone?: string;
  }[];
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
  onAssignCrew,
  onAddCrewRequested,
  crewDirectory,
  propertyContacts,
}: CrewViewProps) => {
  const crews = useMemo(() => projectTrackCCrewSummaries(state), [state]);
  const [expandedContactId, setExpandedContactId] = useState<string>();
  // Beds + common areas each crew reported complete TODAY — the 5-second
  // payroll glance.
  const todayByCrew = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const map = new Map<string, { beds: number; commons: number }>();
    for (const event of state.events) {
      if (event.eventType !== 'crew-reported-complete' || !event.crewId) continue;
      if (event.recordedAt.slice(0, 10) !== today) continue;
      const line = map.get(event.crewId) ?? { beds: 0, commons: 0 };
      line[event.target.section === 'common' ? 'commons' : 'beds'] += 1;
      map.set(event.crewId, line);
    }
    return map;
  }, [state.events]);
  // Prefilled, organized text from the crew's REAL current assignments —
  // bilingual-lite so it works for Spanish- and English-speaking crews.
  const composeBody = (crewId: string, crewName: string) => {
    const detail = projectTrackCCrewDetail(state, crewId);
    const byUnit = new Map<string, string[]>();
    for (const work of detail?.currentWork ?? []) {
      const unit = trackCUnitForTarget(state, work);
      if (!unit) continue;
      const sections = byUnit.get(unit.unitNumber) ?? [];
      sections.push(work.section === 'common' ? 'Común/Common' : work.section);
      byUnit.set(unit.unitNumber, sections);
    }
    const lines = [...byUnit.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([unitNumber, sections]) => `• Unit ${unitNumber}: ${[...new Set(sections)].join(', ')}`);
    return [
      `Hola ${crewName}! Hoy / Today:`,
      ...(lines.length > 0 ? lines : ['(No units assigned yet — te aviso / I will text you the units.)']),
      'Avísame cuando termines cada uno / Text me as you finish each one.',
      'Gracias! Great work.',
    ].join('\n');
  };

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
      {onAddCrewRequested ? (
        <button
          className="track-c-add-crew"
          data-track-c-critical-target="true"
          onClick={onAddCrewRequested}
          type="button"
        >
          Add crew — name, number, or from phone contacts
        </button>
      ) : null}
      {propertyContacts && propertyContacts.length > 0 ? (
        <div className="track-c-contact-strip" aria-label="Property contacts">
          {propertyContacts.map((contact) => {
            const open = expandedContactId === contact.id;
            const walkedUnits = new Set(
              state.completedWalks
                .filter((walk) => walk.propertyContact === contact.name)
                .flatMap((walk) => (walk.outcomes ?? [])
                  .filter((outcome) => outcome.outcome === 'accepted')
                  .map((outcome) => outcome.target.unitId)),
            ).size;
            return (
              <div className={`track-c-contact-chip ${open ? 'is-open' : ''}`} key={contact.id}>
                <button
                  aria-expanded={open}
                  className="track-c-contact-chip__main"
                  onClick={() => setExpandedContactId(open ? undefined : contact.id)}
                  type="button"
                >
                  <span>
                    <strong>{contact.name}</strong>
                    <small>{contact.role || 'Property contact'}</small>
                  </span>
                  <small className="track-c-contact-chip__hint">{open ? 'Hide' : 'Open'}</small>
                </button>
                {open ? (
                  <div className="track-c-contact-chip__detail">
                    <p>
                      Walked together: {walkedUnits} unit{walkedUnits === 1 ? '' : 's'} accepted this Turn.
                    </p>
                    {contact.phone ? (
                      <span className="track-c-contact-chip__actions">
                        <a aria-label={`Call ${contact.name}`} href={`tel:${contact.phone}`}>Call</a>
                        <a aria-label={`Text ${contact.name}`} href={`sms:${contact.phone}`}>Text</a>
                      </span>
                    ) : (
                      <p className="track-c-contact-chip__nophone">
                        No number yet — add it in Project Setup → Contacts.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="track-c-crew-list">
        {crews.map(({ crew, stats }) => {
          const Icon = crew.trade === 'paint' ? Paintbrush : Droplets;
          const today = todayByCrew.get(crew.id);
          const todayLabel = today
            ? [
              today.beds > 0 ? `${today.beds} bed${today.beds === 1 ? '' : 's'}` : '',
              today.commons > 0 ? `${today.commons} common` : '',
            ].filter(Boolean).join(' · ')
            : '';
          const phone = crewDirectory?.[crew.id]?.phone?.trim();
          return (
            <div className="track-c-crew-card" key={crew.id}>
              <button
                aria-label={`Open ${crew.name} detail`}
                className="track-c-crew-row"
                data-track-c-critical-target="true"
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
                    {todayLabel ? ` · today: ${todayLabel}` : ''}
                  </small>
                </span>
                <span className="track-c-crew-row__stats">
                  <strong>{stats.currentAssignments}</strong> current
                  <small>{stats.crewReportedComplete} complete · {stats.needsLosInspection} need Los</small>
                </span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
              <div className="track-c-crew-card__actions">
                {onAssignCrew ? (
                  <button
                    data-track-c-critical-target="true"
                    onClick={() => onAssignCrew(crew.id)}
                    type="button"
                  >
                    Assign units
                  </button>
                ) : null}
                {phone ? (
                  <>
                    <a aria-label={`Call ${crew.name}`} href={`tel:${phone}`}>Call</a>
                    <a
                      aria-label={`Text ${crew.name} today's assignments`}
                      href={`sms:${phone}&body=${encodeURIComponent(composeBody(crew.id, crew.name))}`}
                    >
                      Text
                    </a>
                  </>
                ) : null}
              </div>
            </div>
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
