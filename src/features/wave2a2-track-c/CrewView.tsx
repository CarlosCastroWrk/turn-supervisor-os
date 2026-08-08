import {
  ArrowLeft,
  ChevronRight,
  Droplets,
  Paintbrush,
  Pencil,
  Phone,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
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
import { paintWorkTypeLabel, trackCSectionLabel } from './model';
import {
  buildAllCrewPayroll,
  formatPayLine,
  formatRoomsByType,
  formatTypeTally,
  payWeekSunday,
  type PaintTypeKey,
} from './crewPayroll';
import {
  crewMessageHref,
  crewUnitsTextBody,
  readCrewTextLang,
  readWhatsappCrews,
  toggleWhatsappCrew,
  type CrewTextSection,
} from './crewTextTemplates';
import {
  projectTrackCCrewDetail,
  projectTrackCCrewSummaries,
  projectTrackCUnitWork,
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
  readonly onQuickAssign?: (unitId: string, trade: 'paint' | 'clean', crewId: string) => void;
  readonly onOpenUnit?: (unitId: string, trade: 'paint' | 'clean') => void;
  readonly onToggleCrewActive?: (crewId: string, active: boolean) => void;
  readonly onAddCrewRequested?: () => void;
  readonly crewDirectory?: Readonly<Record<string, { phone?: string }>>;
  readonly propertyContacts?: readonly {
    id: string;
    name: string;
    role?: string;
    phone?: string;
  }[];
}

const CrewDetail = ({
  state,
  crewId,
  onClose,
  onEdit,
  onContact,
  onToggleWhatsapp,
  onOpenUnit,
  phone,
  whatsapp,
}: {
  state: TrackCState;
  crewId: string;
  onClose: () => void;
  onEdit?: () => void;
  onContact?: () => void;
  onToggleWhatsapp?: () => void;
  onOpenUnit?: (unitId: string, trade: 'paint' | 'clean') => void;
  phone?: string;
  whatsapp?: boolean;
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
            <a
              data-track-c-critical-target="true"
              href={crewMessageHref(phone, whatsapp === true)}
              rel="noreferrer"
              target={whatsapp ? '_blank' : undefined}
            >
              {whatsapp ? 'WhatsApp' : 'Text'}
            </a>
            {onToggleWhatsapp ? (
              <button
                aria-pressed={whatsapp === true}
                className="track-c-whatsapp-toggle"
                data-track-c-critical-target="true"
                onClick={onToggleWhatsapp}
                type="button"
              >
                {whatsapp ? 'Uses WhatsApp' : 'Use WhatsApp?'}
              </button>
            ) : null}
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
      {(() => {
        // Beds + common areas — the recorded language. One row per unit,
        // latest state only; no triple listing.
        const localDay = (iso: string) => {
          const date = new Date(iso);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        const today = localDay(new Date().toISOString());
        const doneEvents = state.events.filter((event) =>
          event.eventType === 'crew-reported-complete'
          && event.confirmation === 'confirmed'
          && event.crewId === crewId);
        const count = (filter: (iso: string) => boolean) => {
          const seen = new Set<string>();
          let beds = 0;
          let commons = 0;
          for (const event of doneEvents) {
            if (!filter(event.recordedAt)) continue;
            const key = `${event.target.unitId}:${event.target.trade}:${event.target.section}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (event.target.section === 'common') commons += 1;
            else beds += 1;
          }
          return { beds, commons };
        };
        const sunday = new Date();
        if (sunday.getDay() === 6 && sunday.getHours() >= 17) sunday.setDate(sunday.getDate() + 1);
        sunday.setDate(sunday.getDate() - sunday.getDay());
        const weekStart = localDay(sunday.toISOString());
        const todayLine = count((iso) => localDay(iso) === today);
        const weekLine = count((iso) => localDay(iso) >= weekStart);
        const label = (line: { beds: number; commons: number }) =>
          line.beds === 0 && line.commons === 0
            ? '—'
            : [
              line.beds > 0 ? `${line.beds} bed${line.beds === 1 ? '' : 's'}` : '',
              line.commons > 0 ? `${line.commons} common` : '',
            ].filter(Boolean).join(' · ');
        const allWork = [
          ...detail.currentWork,
          ...detail.crewCompleteWork,
          ...detail.losPassedWork,
          ...detail.openCallbackWork,
          ...detail.propertyAcceptedWork,
        ];
        const byUnit = new Map<string, {
          unitNumber: string;
          unitId: string;
          unitTrade: 'paint' | 'clean';
          trade: string;
          rooms: Map<string, string | undefined>;
          rank: number;
          status: string;
        }>();
        const statusOf = (work: (typeof allWork)[number]): [number, string] =>
          work.property === 'property-accepted' ? [4, 'Approved']
            : work.callbackOpen ? [3, 'Callback']
              : work.inspection === 'los-passed' ? [2, 'Los passed']
                : work.execution === 'crew-reported-complete' ? [1, 'Done — needs Los']
                  : [0, 'Working'];
        const roomOrder: readonly string[] = ['common', 'A', 'B', 'C', 'D', 'E'];
        for (const work of allWork) {
          const unit = trackCUnitForTarget(state, work);
          if (!unit) continue;
          const key = `${work.unitId}:${work.trade}`;
          const [rank, status] = statusOf(work);
          const line = byUnit.get(key) ?? {
            rank: -1,
            rooms: new Map<string, string | undefined>(),
            status: '',
            trade: work.trade === 'paint' ? 'Paint' : 'Clean',
            unitId: work.unitId,
            unitTrade: work.trade,
            unitNumber: unit.unitNumber,
          };
          // Keep WHAT they did in each room — the paint task (full / cut-in …),
          // so Los sees "A (cut-in), B (full)" right on the crew's profile.
          if (work.trade === 'paint' && work.workType) {
            line.rooms.set(work.section, paintWorkTypeLabel(work.workType));
          } else if (!line.rooms.has(work.section)) {
            line.rooms.set(work.section, undefined);
          }
          if (rank > line.rank) {
            line.rank = rank;
            line.status = status;
          }
          byUnit.set(key, line);
        }
        const rows = [...byUnit.values()]
          .map((line) => ({
            ...line,
            roomList: [...line.rooms.entries()]
              .sort(([a], [b]) => roomOrder.indexOf(a) - roomOrder.indexOf(b))
              .map(([section, workType]) => {
                const label = trackCSectionLabel(section as Parameters<typeof trackCSectionLabel>[0]);
                return workType ? `${label} (${workType})` : label;
              }),
          }))
          .sort((left, right) =>
            compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
        return (
          <>
            <div className="track-c-crew-summary">
              <div><small>Today</small><strong>{label(todayLine)}</strong></div>
              <div><small>This week</small><strong>{label(weekLine)}</strong></div>
            </div>
            <section className="track-c-crew-units" aria-label="Units">
              <h2>Units · {rows.length}</h2>
              {rows.length === 0 ? (
                <p className="track-c-boundary-copy">Nothing assigned yet.</p>
              ) : rows.map((row) => {
                const inner = (
                  <>
                    <strong>{row.unitNumber}</strong>
                    <span>
                      {row.trade} — {row.roomList.join(', ')}
                    </span>
                    <em className={`is-rank-${row.rank}`}>{row.status}</em>
                  </>
                );
                return onOpenUnit ? (
                  <button
                    className="track-c-crew-units__row is-tappable"
                    key={`${row.unitNumber}:${row.trade}`}
                    onClick={() => onOpenUnit(row.unitId, row.unitTrade)}
                    type="button"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="track-c-crew-units__row" key={`${row.unitNumber}:${row.trade}`}>
                    {inner}
                  </div>
                );
              })}
            </section>
          </>
        );
      })()}
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
  onQuickAssign,
  onOpenUnit,
  onToggleCrewActive,
  onAddCrewRequested,
  crewDirectory,
  propertyContacts,
}: CrewViewProps) => {
  const [payCopied, setPayCopied] = useState('');
  const crews = useMemo(() => projectTrackCCrewSummaries(state), [state]);
  // Per-trade roundup so this page agrees with the boards: "unassigned" is
  // exactly the board's Needs crew (released, clear, nobody's name on it) and
  // "working" is a unit a crew currently owns.
  const tradeRollup = useMemo(() => {
    const rollup = {
      clean: { unassigned: [] as { unitId: string; unitNumber: string; rooms: number }[], working: 0 },
      paint: { unassigned: [] as { unitId: string; unitNumber: string; rooms: number }[], working: 0 },
    };
    for (const unit of state.units) {
      const work = projectTrackCUnitWork(state, unit.id);
      for (const trade of ['paint', 'clean'] as const) {
        const inPlay = work.filter((item) =>
          item.trade === trade
          && item.release === 'released'
          && item.access === 'clear'
          && item.property !== 'property-accepted');
        if (inPlay.length === 0) continue;
        if (inPlay.some((item) => item.activeCrewIds.length > 0)) {
          if (inPlay.some((item) =>
            ['assigned', 'working'].includes(item.execution) && !item.callbackOpen)) {
            rollup[trade].working += 1;
          }
          continue;
        }
        rollup[trade].unassigned.push({
          rooms: inPlay.length,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
        });
      }
    }
    for (const trade of ['paint', 'clean'] as const) {
      rollup[trade].unassigned.sort((left, right) =>
        compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
    }
    return rollup;
  }, [state]);
  const [expandedContactId, setExpandedContactId] = useState<string>();
  // Device-local "who did I contact today" receipts — deliberately outside the
  // event ledger (schema freeze), so a lost entry costs nothing operationally.
  const [contactLog, setContactLog] = useState(() => readContactLog());
  const [whatsappCrews, setWhatsappCrews] = useState<ReadonlySet<string>>(() => readWhatsappCrews());
  // Every crew's pay picture — today, this pay week, and the whole Turn — from
  // ONE shared calculation so the card, the receipts, and Tony's counts always
  // agree. Each room pays once (deduped), attributed to the day it was first
  // reported done. See crewPayroll.ts for the pay-week/dedup rules.
  const payrollByCrew = useMemo(
    () => buildAllCrewPayroll(state, new Date()),
    [state.events],
  );
  // Prefilled, organized text from the crew's REAL current assignments —
  // bilingual-lite so it works for Spanish- and English-speaking crews.
  const composeBody = (crewId: string, crewName: string) => {
    const detail = projectTrackCCrewDetail(state, crewId);
    const byUnit = new Map<string, CrewTextSection[]>();
    // "Today" = work still in front of them — not sections already reported
    // done or passed, and callbacks get their own conversation.
    for (const work of detail?.currentWork ?? []) {
      if (!['assigned', 'working'].includes(work.execution) || work.callbackOpen) continue;
      const unit = trackCUnitForTarget(state, work);
      if (!unit) continue;
      const sections = byUnit.get(unit.unitNumber) ?? [];
      sections.push(
        work.section === 'common'
          ? { kind: 'common', workType: work.workType }
          : { bed: trackCSectionLabel(work.section), kind: 'bed', workType: work.workType },
      );
      byUnit.set(unit.unitNumber, sections);
    }
    const rows = [...byUnit.entries()].map(([unitNumber, sections]) => ({
      sections,
      unitNumber,
    }));
    // Nothing in front of them -> no canned "these are your units" text;
    // the button just opens the thread.
    if (rows.length === 0) return undefined;
    return crewUnitsTextBody(crewName, readCrewTextLang(), rows);
  };
  const logContact = (crewId: string, name: string, kind: 'call' | 'text' | 'ai-text') => {
    setContactLog(appendContactLog({ crewId, kind, name }));
  };
  if (selectedCrewId) {
    return (
      <CrewDetail
        crewId={selectedCrewId}
        onToggleWhatsapp={() => setWhatsappCrews(toggleWhatsappCrew(selectedCrewId))}
        phone={crewDirectory?.[selectedCrewId]?.phone?.trim()}
        whatsapp={whatsappCrews.has(selectedCrewId)}
        onClose={onCloseCrew}
        onContact={
          onContactCrew ? () => onContactCrew(selectedCrewId) : undefined
        }
        onEdit={onEditCrew ? () => onEditCrew(selectedCrewId) : undefined}
        onOpenUnit={onOpenUnit}
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
        // This week, across ALL crews: who did how many of each paint task and
        // how many clean rooms, and in which units — Tony's end-of-week question,
        // answered from the same deduped payroll the receipts use.
        const weekStart = payWeekSunday(new Date().toISOString());
        const TASK_KEYS: readonly PaintTypeKey[] =
          ['full', 'touch-up', 'cut-in', 'full-cut-in', 'touch-up-cut-in'];
        const totalPaint: Record<PaintTypeKey, number> =
          { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 };
        let totalClean = 0;
        const perCrew: {
          name: string; trade: string; headline: string; beds: number; commons: number; rooms: readonly string[];
        }[] = [];
        // Cut-ins are tracked SEPARATELY from the wall board — collect every room
        // with a cut-in component (cut-in, full+cut, touch+cut) so Los has the
        // "where were the cut-ins" list he'd otherwise have to remember.
        const cutIns: string[] = [];
        for (const [crewId, payroll] of payrollByCrew) {
          const weekRooms = payroll.rooms.filter((room) => room.date >= weekStart);
          if (weekRooms.length === 0) continue;
          const crew = state.crews.find((candidate) => candidate.id === crewId);
          if (!crew) continue;
          const beds = payroll.week.beds;
          const commons = payroll.week.commons;
          for (const room of weekRooms) {
            if (room.workType && room.workType.includes('cut-in')) {
              cutIns.push(`${room.unitNumber} ${room.section === 'common' ? 'Com' : room.section} (${crew.name})`);
            }
          }
          if (crew.trade === 'paint') {
            const tally: Record<PaintTypeKey, number> =
              { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 };
            for (const room of weekRooms) {
              if (room.workType) tally[room.workType] += 1;
            }
            for (const key of TASK_KEYS) totalPaint[key] += tally[key];
            perCrew.push({
              beds, commons,
              headline: formatTypeTally(tally) || `${weekRooms.length} rooms`,
              name: crew.name, rooms: formatRoomsByType(weekRooms), trade: 'Paint',
            });
          } else {
            totalClean += weekRooms.length;
            perCrew.push({
              beds, commons,
              headline: `${beds} bed${beds === 1 ? '' : 's'} · ${commons} common`,
              name: crew.name, rooms: formatRoomsByType(weekRooms), trade: 'Clean',
            });
          }
        }
        if (perCrew.length === 0) return null;
        const packetText = [
          'PAY WEEK — who did what',
          `Paint: ${formatTypeTally(totalPaint) || '—'}  ·  Clean: ${totalClean} rooms`,
          '',
          '— BY CREW —',
          ...perCrew.flatMap((entry) => [
            `${entry.name} (${entry.trade}): ${entry.headline} · ${entry.beds} beds · ${entry.commons} common`,
            ...entry.rooms.map((line) => `   ${line}`),
          ]),
          '',
          `— CUT-INS (track separately) — ${cutIns.length}`,
          cutIns.length > 0 ? cutIns.join(', ') : 'none',
        ].join('\n');
        return (
          <details className="track-c-weeksummary">
            <summary>Pay week — for the board / Tony</summary>
            <div className="track-c-weeksummary__body">
              <p className="track-c-weeksummary__totals">
                <b>Paint:</b> {formatTypeTally(totalPaint) || '—'}
                {'  ·  '}
                <b>Clean:</b> {totalClean} room{totalClean === 1 ? '' : 's'}
              </p>
              {perCrew.map((entry) => (
                <div className="track-c-weeksummary__crew" key={entry.name}>
                  <strong>{entry.name} ({entry.trade}) · {entry.headline} · {entry.beds} beds · {entry.commons} common</strong>
                  {entry.rooms.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ))}
              <div className="track-c-weeksummary__crew">
                <strong>Cut-ins (track separately) · {cutIns.length}</strong>
                <p>{cutIns.length > 0 ? cutIns.join(', ') : 'none this week'}</p>
              </div>
              <button
                className="track-c-weeksummary__copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(packetText)
                    .then(() => setPayCopied('Copied — paste it to Tony or use it to fill the board.'))
                    .catch(() => setPayCopied('Copy not available — read it here.'));
                }}
                type="button"
              >
                Copy the pay packet
              </button>
              {payCopied ? <p className="track-c-weeksummary__copied">{payCopied}</p> : null}
            </div>
          </details>
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
              `${entry.name} ${new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`)
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
        {(['paint', 'clean'] as const).map((tradeGroup) => {
          const group = crews
            .filter(({ crew }) => crew.trade === tradeGroup)
            .sort((left, right) =>
              Number(right.crew.activeToday) - Number(left.crew.activeToday)
              || left.crew.name.localeCompare(right.crew.name));
          if (group.length === 0 && tradeRollup[tradeGroup].unassigned.length === 0) return null;
          const rollup = tradeRollup[tradeGroup];
          // Show EVERY crew of this trade — present ones first — so a crew Los
          // just added is never hidden behind the present filter.
          const allTradeCrews = group.map(({ crew }) => crew);
          const tradeCrews = [...allTradeCrews].sort((left, right) =>
            Number(right.activeToday) - Number(left.activeToday)
            || left.name.localeCompare(right.name));
          return (
            <div key={tradeGroup}>
              <h2 className={`track-c-crew-group is-${tradeGroup}`}>
                {tradeGroup === 'paint' ? 'PAINT CREWS' : 'CLEAN CREWS'}
                <span className="track-c-crew-group__counts">
                  {rollup.working} working
                  {rollup.unassigned.length > 0
                    ? ` · ${rollup.unassigned.length} unassigned`
                    : ''}
                </span>
              </h2>
              {rollup.unassigned.length > 0 ? (
                <section
                  aria-label={`Unassigned ${tradeGroup} units`}
                  className={`track-c-unassigned is-${tradeGroup}`}
                >
                  <h3>Unassigned — tap a crew to put them on it</h3>
                  {rollup.unassigned.map((entry) => (
                    <div className="track-c-unassigned__row" key={entry.unitId}>
                      <span className="track-c-unassigned__unit">
                        <strong>{entry.unitNumber}</strong>
                        <small>{entry.rooms} room{entry.rooms === 1 ? '' : 's'}</small>
                      </span>
                      {onQuickAssign && tradeCrews.length > 0 ? (
                        <span className="track-c-unassigned__crews">
                          {tradeCrews.map((crew) => (
                            <button
                              aria-label={`Assign ${crew.name} to unit ${entry.unitNumber}`}
                              data-track-c-critical-target="true"
                              key={crew.id}
                              onClick={() => onQuickAssign(entry.unitId, tradeGroup, crew.id)}
                              type="button"
                            >
                              {crew.name}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {tradeCrews.length === 0 ? (
                    <small>No {tradeGroup} crew on the roster yet — add one below to assign these.</small>
                  ) : null}
                </section>
              ) : null}
              {group.map(({ crew, stats }) => {
          const Icon = crew.trade === 'paint' ? Paintbrush : Droplets;
          const pay = payrollByCrew.get(crew.id);
          const todayLabel = pay && (pay.today.beds > 0 || pay.today.commons > 0)
            ? formatPayLine(pay.today)
            : '';
          const weekLabel = pay && (pay.week.beds > 0 || pay.week.commons > 0)
            ? `this week: ${formatPayLine(pay.week)}`
            : '';
          // Whole-Turn running total — the cumulative count Tony pays off.
          const turnLabel = pay && (pay.turn.beds > 0 || pay.turn.commons > 0)
            ? `Turn: ${formatPayLine(pay.turn)}`
            : '';
          const phone = crewDirectory?.[crew.id]?.phone?.trim();
          const contactedToday = lastContactTodayFor(contactLog, crew.id);
          const contactedLabel = contactedToday
            ? `${contactedToday.kind === 'call' ? 'called' : 'texted'} ${new Date(contactedToday.at)
              .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
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
                    {turnLabel ? ` · ${turnLabel}` : ''}
                    {contactedLabel ? ` · ✓ ${contactedLabel}` : ''}
                  </small>
                </span>
                <span className="track-c-crew-row__stats">
                  {(() => {
                    // "Current" = sections still in front of the crew, not
                    // everything short of property acceptance.
                    const activeNow = projectTrackCCrewDetail(state, crew.id)
                      ?.currentWork.filter((work) =>
                        ['assigned', 'working'].includes(work.execution)
                        && !work.callbackOpen).length ?? 0;
                    return <><strong>{activeNow}</strong> now</>;
                  })()}
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
                      aria-label={`Text ${crew.name}`}
                      href={crewMessageHref(phone, whatsappCrews.has(crew.id), composeBody(crew.id, crew.name))}
                      onClick={() => logContact(crew.id, crew.name, 'text')}
                      rel="noreferrer"
                      target={whatsappCrews.has(crew.id) ? '_blank' : undefined}
                    >
                      {whatsappCrews.has(crew.id) ? 'WhatsApp' : 'Text'}
                    </a>
                    {onToggleCrewActive ? (
                      <button
                        aria-pressed={crew.activeToday}
                        className="track-c-present-toggle"
                        data-track-c-critical-target="true"
                        onClick={() => onToggleCrewActive(crew.id, !crew.activeToday)}
                        type="button"
                      >
                        {crew.activeToday ? 'Present today' : 'Out today'}
                      </button>
                    ) : null}

                  </>
                ) : null}
              </div>
            </div>
              );
              })}
            </div>
          );
        })}
      </div>
      <details className="track-c-crew-totals">
        <summary>Crew totals — payroll receipts</summary>
        {(() => {
          // Per crew, per day: the rooms reported complete (the pay basis — did
          // the work = gets paid), plus the whole-Turn total. Same shared
          // calculation as the crew card, so per-day always sums to the Turn
          // total. This is Los's receipt when a count gets pushed back on.
          const emptyTypes = { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 };
          const emptyPay = { today: { beds: 0, commons: 0 }, week: { beds: 0, commons: 0 }, turn: { beds: 0, commons: 0 }, turnTypes: emptyTypes, perDay: [], rooms: [] };
          const payFor = (crewId: string) => payrollByCrew.get(crewId) ?? emptyPay;
          const buildText = () => state.crews.map((crew) => {
            const pay = payFor(crew.id);
            const isPaint = crew.trade === 'paint';
            return [
              `${crew.name} (${isPaint ? 'Paint' : 'Clean'})`,
              ...pay.perDay.map((day) => {
                const types = isPaint ? formatTypeTally(day.types) : '';
                return `  ${day.date}: ${formatPayLine(day.line)}${types ? ` (${types})` : ''}`;
              }),
              // Tony's grain: what KIND of work, in WHICH units.
              ...formatRoomsByType(pay.rooms).map((line) => `  ${line}`),
              `  Turn total: ${formatPayLine(pay.turn)}${isPaint && formatTypeTally(pay.turnTypes) ? ` (${formatTypeTally(pay.turnTypes)})` : ''}`,
            ].join('\n');
          }).join('\n');
          return (
            <div className="track-c-crew-totals__body">
              {state.crews.map((crew) => {
                const pay = payFor(crew.id);
                const isPaint = crew.trade === 'paint';
                const days = [...pay.perDay].reverse(); // newest first for the eye
                const turnTypeLabel = isPaint ? formatTypeTally(pay.turnTypes) : '';
                return (
                  <section key={crew.id}>
                    <header>
                      <strong>{crew.name}</strong>
                      <span>
                        {isPaint ? 'Paint' : 'Clean'} · Turn total {formatPayLine(pay.turn)}
                        {turnTypeLabel ? ` · ${turnTypeLabel}` : ''}
                      </span>
                    </header>
                    {days.length > 0 ? (
                      <ul>
                        {days.map((day) => {
                          const typeLabel = isPaint ? formatTypeTally(day.types) : '';
                          return (
                            <li key={day.date}>
                              <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], {
                                weekday: 'short', month: 'short', day: 'numeric',
                              })}</span>
                              <strong>
                                {formatPayLine(day.line)}
                                {typeLabel ? <em className="track-c-crew-totals__types"> · {typeLabel}</em> : null}
                              </strong>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p>No completed work reported yet.</p>}
                    {pay.rooms.length > 0 ? (
                      <div className="track-c-crew-totals__byunit">
                        {formatRoomsByType(pay.rooms).map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
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
