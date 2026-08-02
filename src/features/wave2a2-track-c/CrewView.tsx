import {
  ArrowLeft,
  ChevronRight,
  Droplets,
  Paintbrush,
  Pencil,
  Phone,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { composeEnabled, requestComposedText } from '../../lib/composeClient';
import {
  appendContactLog,
  contactsToday,
  lastContactTodayFor,
  readContactLog,
} from '../../lib/contactLog';
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

const localEventDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

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
              {(() => {
                // Unit grain — one line per unit per trade with its sections
                // folded in ("Unit 406 · Paint — Common, A, B, C"), so the
                // scroll stays short.
                const byUnit = new Map<string, {
                  sections: string[];
                  trade: string;
                  unitNumber: string;
                }>();
                for (const work of group.work) {
                  const unit = trackCUnitForTarget(state, work);
                  const key = `${work.unitId}:${work.trade}`;
                  const line = byUnit.get(key) ?? {
                    sections: [],
                    trade: work.trade === 'paint' ? 'Paint' : 'Clean',
                    unitNumber: unit?.unitNumber ?? work.unitId,
                  };
                  line.sections.push(trackCSectionLabel(work.section));
                  byUnit.set(key, line);
                }
                return [...byUnit.entries()]
                  .sort((left, right) => left[1].unitNumber.localeCompare(
                    right[1].unitNumber, undefined, { numeric: true }))
                  .slice(0, 10)
                  .map(([key, line]) => (
                    <li key={`${group.label}:${key}`}>
                      <strong>Unit {line.unitNumber}</strong>
                      <span>{line.trade} — {[...new Set(line.sections)].join(', ')}</span>
                    </li>
                  ));
              })()}
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
  phone,
}: {
  state: TrackCState;
  crewId: string;
  onClose: () => void;
  onEdit?: () => void;
  onContact?: () => void;
  phone?: string;
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
        {phone ? (
          <>
            <a data-track-c-critical-target="true" href={`tel:${phone}`}>
              <Phone aria-hidden="true" size={17} />
              Call
            </a>
            <a data-track-c-critical-target="true" href={`sms:${phone}`}>
              Text
            </a>
          </>
        ) : onContact ? (
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
  // Device-local "who did I contact today" receipts — deliberately outside the
  // event ledger (schema freeze), so a lost entry costs nothing operationally.
  const [contactLog, setContactLog] = useState(() => readContactLog());
  const [aiDraftingCrewId, setAiDraftingCrewId] = useState<string>();
  const [aiLanguagePickCrewId, setAiLanguagePickCrewId] = useState<string>();
  // Beds + common areas each crew reported complete TODAY — the 5-second
  // payroll glance.
  const todayByCrew = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const map = new Map<string, { beds: number; commons: number }>();
    const seen = new Set<string>();
    for (const event of state.events) {
      if (event.eventType !== 'crew-reported-complete' || !event.crewId) continue;
      if (event.confirmation !== 'confirmed') continue;
      if (localEventDate(event.recordedAt) !== today) continue;
      const key = `${event.crewId}:${event.target.unitId}:${event.target.trade}:${event.target.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = map.get(event.crewId) ?? { beds: 0, commons: 0 };
      line[event.target.section === 'common' ? 'commons' : 'beds'] += 1;
      map.set(event.crewId, line);
    }
    return map;
  }, [state.events]);
  // Pay-week totals (week runs Sunday -> Saturday 5pm; counted from Sunday).
  const weekByCrew = useMemo(() => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);
    const startIso = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
    // Pay week = Sunday 00:00 → Saturday 5:00 PM. Work reported after the
    // Saturday cutoff rolls into the NEXT pay week — same as the wall board.
    const payWeekSunday = (iso: string) => {
      const date = new Date(iso);
      if (date.getDay() === 6 && date.getHours() >= 17) date.setDate(date.getDate() + 1);
      date.setDate(date.getDate() - date.getDay());
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    void startIso;
    const currentWeek = payWeekSunday(new Date().toISOString());
    const map = new Map<string, { beds: number; commons: number }>();
    const seen = new Set<string>();
    for (const event of state.events) {
      if (event.eventType !== 'crew-reported-complete' || !event.crewId) continue;
      if (event.confirmation !== 'confirmed') continue;
      if (payWeekSunday(event.recordedAt) !== currentWeek) continue;
      const key = `${event.crewId}:${event.target.unitId}:${event.target.trade}:${event.target.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
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
    // "Today" = work still in front of them — not sections already reported
    // done or passed, and callbacks get their own conversation.
    for (const work of detail?.currentWork ?? []) {
      if (!['assigned', 'working'].includes(work.execution) || work.callbackOpen) continue;
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
  const logContact = (crewId: string, name: string, kind: 'call' | 'text' | 'ai-text') => {
    setContactLog(appendContactLog({ crewId, kind, name }));
  };
  // AI-personalized draft: Sonnet writes the bilingual text from the crew's
  // REAL current assignments; the phone's Messages composer opens with it and
  // nothing sends until Los taps send. Falls back to the standard template.
  const openAiDraft = async (
    crewId: string,
    crewName: string,
    trade: 'paint' | 'clean',
    phone: string,
    language: 'english' | 'spanish',
  ) => {
    setAiLanguagePickCrewId(undefined);
    setAiDraftingCrewId(crewId);
    try {
      const detail = projectTrackCCrewDetail(state, crewId);
      const byUnit = new Map<string, string[]>();
      for (const work of detail?.currentWork ?? []) {
        if (!['assigned', 'working'].includes(work.execution) || work.callbackOpen) continue;
        const unit = trackCUnitForTarget(state, work);
        if (!unit) continue;
        const sections = byUnit.get(unit.unitNumber) ?? [];
        sections.push(work.section === 'common' ? 'common' : work.section);
        byUnit.set(unit.unitNumber, sections);
      }
      const units = [...byUnit.entries()]
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
        .map(([unitNumber, sections]) => ({ sections: [...new Set(sections)], unitNumber }));
      let body: string;
      try {
        body = await requestComposedText({
          crewName,
          trade,
          units,
          language,
          // Rocky is also Los's runner — his texts carry the day-overview line.
          isRunner: crewName.trim().toLowerCase().startsWith('rocky'),
        });
        logContact(crewId, crewName, 'ai-text');
      } catch {
        body = composeBody(crewId, crewName);
        logContact(crewId, crewName, 'text');
      }
      window.location.href = `sms:${phone}&body=${encodeURIComponent(body)}`;
    } finally {
      setAiDraftingCrewId(undefined);
    }
  };

  if (selectedCrewId) {
    return (
      <CrewDetail
        crewId={selectedCrewId}
        phone={crewDirectory?.[selectedCrewId]?.phone?.trim()}
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
      {(() => {
        // Pay weeks run Sunday -> Saturday 5 PM. Week 2 = Aug 2-8 (week 1 was
        // the short Jul 31 - Aug 1 start). Colors follow Los's wall board.
        const WEEK2_START = new Date(2026, 7, 2);
        const now = new Date();
        const weekNumber = now < WEEK2_START
          ? 1
          : Math.floor((now.getTime() - WEEK2_START.getTime()) / (7 * 86_400_000)) + 2;
        const colors: Record<number, string> = { 1: 'yellow', 2: 'green', 3: 'pink' };
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - now.getDay());
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        const fmt = (date: Date) =>
          date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return (
          <p className="track-c-week-line">
            Pay week {weekNumber}{colors[weekNumber] ? ` · ${colors[weekNumber]} on the board` : ''} · {fmt(sunday)} → {fmt(saturday)} 5 PM
          </p>
        );
      })()}
      {(() => {
        const today = contactsToday(contactLog);
        if (today.length === 0) return null;
        const seen = new Set<string>();
        const names = today.filter((entry) => {
          if (seen.has(entry.crewId)) return false;
          seen.add(entry.crewId);
          return true;
        });
        return (
          <p className="track-c-contacted-today">
            Contacted today:{' '}
            {names.map((entry) =>
              `${entry.name} ${new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)
              .join(' · ')}
          </p>
        );
      })()}
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
            const walkedByTrade = (trade: 'paint' | 'clean') => new Set(
              state.completedWalks
                .filter((walk) => walk.propertyContact === contact.name)
                .flatMap((walk) => (walk.outcomes ?? [])
                  .filter((outcome) => outcome.outcome === 'accepted'
                    && outcome.target.trade === trade)
                  .map((outcome) => outcome.target.unitId)),
            ).size;
            const walkedPaint = walkedByTrade('paint');
            const walkedClean = walkedByTrade('clean');
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
                      Walked: Paint {walkedPaint} · Clean {walkedClean} accepted
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
          const week = weekByCrew.get(crew.id);
          const weekLabel = week && (week.beds > 0 || week.commons > 0)
            ? `wk ${week.beds} bed${week.beds === 1 ? '' : 's'}${week.commons > 0 ? ` + ${week.commons} common` : ''}`
            : '';
          const phone = crewDirectory?.[crew.id]?.phone?.trim();
          const contactedToday = lastContactTodayFor(contactLog, crew.id);
          const contactedLabel = contactedToday
            ? `${contactedToday.kind === 'call' ? 'called' : 'texted'} ${new Date(contactedToday.at)
              .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : '';
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
                    {weekLabel ? ` · ${weekLabel}` : ''}
                    {contactedLabel ? ` · ✓ ${contactedLabel}` : ''}
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
                    <a
                      aria-label={`Call ${crew.name}`}
                      href={`tel:${phone}`}
                      onClick={() => logContact(crew.id, crew.name, 'call')}
                    >
                      Call
                    </a>
                    <a
                      aria-label={`Text ${crew.name} today's assignments`}
                      href={`sms:${phone}&body=${encodeURIComponent(composeBody(crew.id, crew.name))}`}
                      onClick={() => logContact(crew.id, crew.name, 'text')}
                    >
                      Text
                    </a>
                    {composeEnabled() ? (
                      aiLanguagePickCrewId === crew.id ? (
                        <span className="track-c-ai-lang" role="group" aria-label="Draft language">
                          <button
                            onClick={() =>
                              void openAiDraft(crew.id, crew.name, crew.trade, phone, 'spanish')}
                            type="button"
                          >
                            Español
                          </button>
                          <button
                            onClick={() =>
                              void openAiDraft(crew.id, crew.name, crew.trade, phone, 'english')}
                            type="button"
                          >
                            English
                          </button>
                        </span>
                      ) : (
                        <button
                          aria-label={`AI-drafted text for ${crew.name}`}
                          className="track-c-crew-ai-draft"
                          disabled={aiDraftingCrewId === crew.id}
                          onClick={() => setAiLanguagePickCrewId(crew.id)}
                          type="button"
                        >
                          <Sparkles aria-hidden="true" size={14} />
                          {aiDraftingCrewId === crew.id ? 'Drafting…' : 'AI text'}
                        </button>
                      )
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <details className="track-c-crew-totals">
        <summary>Crew totals — payroll receipts</summary>
        {(() => {
          // Per crew, per day: beds + commons reported complete (the pay
          // basis: did the work = gets paid). Sun-Sat pay-week totals + Turn
          // total. This is Los's receipt when a count gets pushed back on.
          const byCrew = new Map<string, Map<string, { beds: number; commons: number }>>();
          const seenTotals = new Set<string>();
          for (const event of state.events) {
            if (event.eventType !== 'crew-reported-complete' || !event.crewId) continue;
            if (event.confirmation !== 'confirmed') continue;
            const date = localEventDate(event.recordedAt);
            const totalsKey = `${event.crewId}:${date}:${event.target.unitId}:${event.target.trade}:${event.target.section}`;
            if (seenTotals.has(totalsKey)) continue;
            seenTotals.add(totalsKey);
            const days = byCrew.get(event.crewId) ?? new Map();
            const line = days.get(date) ?? { beds: 0, commons: 0 };
            line[event.target.section === 'common' ? 'commons' : 'beds'] += 1;
            days.set(date, line);
            byCrew.set(event.crewId, days);
          }
          const fmtLine = (line: { beds: number; commons: number }) =>
            [
              line.beds > 0 ? `${line.beds} bed${line.beds === 1 ? '' : 's'}` : '',
              line.commons > 0 ? `${line.commons} common` : '',
            ].filter(Boolean).join(' + ') || '0';
          const buildText = () => state.crews.map((crew) => {
            const days = [...(byCrew.get(crew.id) ?? new Map()).entries()]
              .sort((left, right) => left[0].localeCompare(right[0]));
            const total = days.reduce((sum, [, line]) =>
              ({ beds: sum.beds + line.beds, commons: sum.commons + line.commons }),
              { beds: 0, commons: 0 });
            return [
              `${crew.name} (${crew.trade === 'paint' ? 'Paint' : 'Clean'})`,
              ...days.map(([date, line]) => `  ${date}: ${fmtLine(line)}`),
              `  Turn total: ${fmtLine(total)}`,
            ].join('\n');
          }).join('\n');
          return (
            <div className="track-c-crew-totals__body">
              {state.crews.map((crew) => {
                const days = [...(byCrew.get(crew.id) ?? new Map()).entries()]
                  .sort((left, right) => right[0].localeCompare(left[0]));
                const total = days.reduce((sum, [, line]) =>
                  ({ beds: sum.beds + line.beds, commons: sum.commons + line.commons }),
                  { beds: 0, commons: 0 });
                return (
                  <section key={crew.id}>
                    <header>
                      <strong>{crew.name}</strong>
                      <span>{crew.trade === 'paint' ? 'Paint' : 'Clean'} · Turn total {fmtLine(total)}</span>
                    </header>
                    {days.length > 0 ? (
                      <ul>
                        {days.map(([date, line]) => (
                          <li key={date}>
                            <span>{new Date(`${date}T12:00:00`).toLocaleDateString([], {
                              weekday: 'short', month: 'short', day: 'numeric',
                            })}</span>
                            <strong>{fmtLine(line)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p>No completed work reported yet.</p>}
                  </section>
                );
              })}
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(buildText()).catch(() => undefined);
                }}
                type="button"
              >
                Copy totals — paste anywhere
              </button>
            </div>
          );
        })()}
      </details>
      <p className="track-c-boundary-copy track-c-view-footnote">
        Open Crew Detail before Edit. Stats come only from confirmed personal
        events.
      </p>
    </section>
  );
};
