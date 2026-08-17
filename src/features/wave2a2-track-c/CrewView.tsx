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
import { savePayWeekPacketPdf } from './payPacketPdf';
import {
  buildAllCrewPayroll,
  formatPayLine,
  formatRoomsByType,
  formatTypeTally,
  payLocalDate,
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
import {
  parseTextureWording,
  payWeekNumberOf,
  wallWeekColor,
  WALL_WEEK_EPOCH,
  WALL_WORKTYPE_ABBR,
} from './wallWeek';

// The Sunday (YYYY-MM-DD) that starts a given pay-week number, from the shared
// epoch (Aug 2 2026 = week 2). Lets Los pull up ANY past week to pay it.
const payWeekSundayOf = (weekNumber: number): string => {
  const date = new Date(WALL_WEEK_EPOCH);
  date.setDate(date.getDate() + (weekNumber - 2) * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Which "this week's extras" Los has ticked off as verified for payroll —
// device-local, namespaced by the pay-week Sunday so last week's ticks never
// bleed into this week's list.
const ACK_EXTRAS_KEY = 'turn-os:extras-ack';
const readAckExtras = (): ReadonlySet<string> => {
  try {
    const raw = window.localStorage.getItem(ACK_EXTRAS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};
const toggleAckExtra = (key: string): ReadonlySet<string> => {
  const next = new Set(readAckExtras());
  if (next.has(key)) next.delete(key); else next.add(key);
  try {
    window.localStorage.setItem(ACK_EXTRAS_KEY, JSON.stringify([...next]));
  } catch { /* session only */ }
  return next;
};

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
  readonly payExtras?: Readonly<Record<string, {
    changeOrders: readonly { label: string; week: number }[];
    textures: readonly { label: string; week: number }[];
  }>>;
  readonly weekExtras?: readonly {
    readonly id: string;
    readonly at: string;
    readonly crew: string;
    readonly kind: 'cut-in' | 'heavy-clean' | 'change-order' | 'texture' | 'drywall';
    readonly detail: string;
    readonly unitNumber: string;
    readonly week: number;
  }[];
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
  // Week filter for the units list: 0 = all weeks, or a specific pay week Los
  // flips to. Defaults to the current pay week so the profile opens on "now".
  const currentWeek = payWeekNumberOf(new Date().toISOString());
  const [weekFilter, setWeekFilter] = useState<number>(currentWeek);
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
          date: string;
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
            date: '',
            rank: -1,
            rooms: new Map<string, string | undefined>(),
            status: '',
            trade: work.trade === 'paint' ? 'Paint' : 'Clean',
            unitId: work.unitId,
            unitTrade: work.trade,
            unitNumber: unit.unitNumber,
          };
          // The week a unit belongs to = when it came onto the board (release),
          // matching the wall grid and the extras sheet. Keep the latest.
          const workDate = work.latestConfirmedEvent?.recordedAt ?? work.releasedAt ?? '';
          if (workDate > line.date) line.date = workDate;
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
        const unitNum = (unitNumber: string) => Number(unitNumber.replace(/\D/g, '')) || 0;
        const allRows = [...byUnit.values()]
          .map((line) => ({
            ...line,
            week: line.date ? payWeekNumberOf(line.date) : 0,
            roomList: [...line.rooms.entries()]
              .sort(([a], [b]) => roomOrder.indexOf(a) - roomOrder.indexOf(b))
              .map(([section, workType]) => {
                const label = trackCSectionLabel(section as Parameters<typeof trackCSectionLabel>[0]);
                return workType ? `${label} (${workType})` : label;
              }),
          }))
          // Low → high by unit number — Los's ask (and his walk/board order).
          .sort((left, right) => unitNum(left.unitNumber) - unitNum(right.unitNumber));
        // Which weeks this crew has work in, so the filter only shows real weeks.
        const weeksPresent = [...new Set(allRows.map((row) => row.week).filter((week) => week > 0))]
          .sort((left, right) => left - right);
        const activeFilter = weeksPresent.includes(weekFilter) ? weekFilter : 0;
        const rows = activeFilter === 0
          ? allRows
          : allRows.filter((row) => row.week === activeFilter);
        return (
          <>
            <div className="track-c-crew-summary">
              <div><small>Today</small><strong>{label(todayLine)}</strong></div>
              <div><small>This week</small><strong>{label(weekLine)}</strong></div>
            </div>
            {weeksPresent.length > 0 ? (
              <div className="track-c-crew-weekfilter" role="group" aria-label="Filter units by week">
                <button
                  aria-pressed={activeFilter === 0}
                  className={activeFilter === 0 ? 'is-on' : ''}
                  onClick={() => setWeekFilter(0)}
                  type="button"
                >
                  All
                </button>
                {weeksPresent.map((week) => (
                  <button
                    aria-pressed={activeFilter === week}
                    className={activeFilter === week ? 'is-on' : ''}
                    key={week}
                    onClick={() => setWeekFilter(week)}
                    type="button"
                  >
                    Wk {week}{week === currentWeek ? ' · now' : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <section className="track-c-crew-units" aria-label="Units">
              <h2>
                Units · {rows.length}
                {activeFilter !== 0 ? <span className="track-c-crew-units__wk"> · week {activeFilter}</span> : null}
              </h2>
              {rows.length === 0 ? (
                <p className="track-c-boundary-copy">
                  {activeFilter !== 0 ? `Nothing in week ${activeFilter}.` : 'Nothing assigned yet.'}
                </p>
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
  payExtras,
  weekExtras,
  propertyContacts,
}: CrewViewProps) => {
  const [payCopied, setPayCopied] = useState('');
  const [wallCopied, setWallCopied] = useState<{ trade: 'paint' | 'clean' | 'day'; msg: string } | null>(null);
  const [ackExtras, setAckExtras] = useState<ReadonlySet<string>>(() => readAckExtras());
  const crews = useMemo(() => projectTrackCCrewSummaries(state), [state]);
  // Which pay weeks have released work — so Los can pull up a PAST week to pay
  // it and copy it to the board even after a new week has started. Defaults to
  // the most recent week that has work (on Sunday morning that's last week).
  const weeksWithWork = useMemo(() => {
    const weeks = new Set<number>();
    for (const unit of state.units) {
      for (const work of projectTrackCUnitWork(state, unit.id)) {
        if (work.release === 'released' && work.releasedAt) weeks.add(payWeekNumberOf(work.releasedAt));
      }
    }
    return [...weeks].sort((left, right) => left - right);
  }, [state]);
  const [payWeekPick, setPayWeekPick] = useState<number | null>(null);
  // Which DAY the "tonight's board" transfer shows — null = the latest day
  // with done work (usually today). Chips cover the whole history.
  const [dayPick, setDayPick] = useState<string | null>(null);
  const currentPayWeek = payWeekNumberOf(new Date().toISOString());
  const activePayWeek = (payWeekPick && weeksWithWork.includes(payWeekPick))
    ? payWeekPick
    : (weeksWithWork.length > 0 ? weeksWithWork[weeksWithWork.length - 1] : currentPayWeek);
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
  // PAYROLL PRE-FLIGHT — the app audits itself BEFORE Saturday with Tony.
  // Every check compares two surfaces that must agree: done events vs crew
  // names (who gets paid?), the pay packet vs the live board, extras vs the
  // verified checks. Discrepancies get found Friday night, not in front of Tony.
  const preflight = useMemo(() => {
    interface PreflightItem {
      key: string;
      text: string;
      unitId?: string;
      trade?: 'paint' | 'clean';
      kind: 'fix' | 'check';
    }
    const items: PreflightItem[] = [];
    const unitById = new Map(state.units.map((unit) => [unit.id, unit]));
    // 1+2: every done room this week must have exactly ONE crew to pay.
    const doneByTarget = new Map<string, typeof state.events[number][]>();
    for (const event of state.events) {
      if (event.eventType !== 'crew-reported-complete' || event.confirmation !== 'confirmed') continue;
      if (payWeekNumberOf(event.recordedAt) !== activePayWeek) continue;
      const key = `${event.target.unitId}:${event.target.trade}:${event.target.section}`;
      const bucket = doneByTarget.get(key) ?? [];
      bucket.push(event);
      doneByTarget.set(key, bucket);
    }
    for (const [key, events] of doneByTarget) {
      const target = events[0].target;
      const unit = unitById.get(target.unitId);
      if (!unit) continue;
      const room = trackCSectionLabel(target.section);
      const tradeName = target.trade === 'paint' ? 'Paint' : 'Clean';
      const crewIds = [...new Set(events.filter((event) => event.crewId).map((event) => event.crewId as string))];
      if (crewIds.length === 0) {
        items.push({
          key: `nocrew:${key}`,
          kind: 'fix',
          text: `${unit.unitNumber} ${tradeName} ${room} — done, but NO crew on it. Who gets paid?`,
          trade: target.trade,
          unitId: unit.id,
        });
      } else if (crewIds.length > 1) {
        const names = crewIds.map((crewId) => state.crews.find((crew) => crew.id === crewId)?.name ?? '?');
        const first = [...events].filter((event) => event.crewId)
          .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))[0];
        const firstName = state.crews.find((crew) => crew.id === first.crewId)?.name ?? '?';
        items.push({
          key: `double:${key}`,
          kind: 'check',
          text: `${unit.unitNumber} ${room} — ${names.join(' AND ')} both reported it, so BOTH are counted. If only ${firstName} did it, clear the other's report so pay is right.`,
          trade: target.trade,
          unitId: unit.id,
        });
      }
    }
    // 3+4: every PAID room must still be on the release, and an open
    // callback on a paid room deserves a look (pay stands — crew did work).
    for (const [crewId, payroll] of payrollByCrew) {
      const crewName = state.crews.find((crew) => crew.id === crewId)?.name ?? '';
      for (const room of payroll.rooms) {
        if (payWeekNumberOf(`${room.date}T12:00:00`) !== activePayWeek) continue;
        const unit = state.units.find((candidate) => candidate.unitNumber === room.unitNumber);
        if (!unit) continue;
        const work = projectTrackCUnitWork(state, unit.id).find((candidate) =>
          candidate.trade === room.trade && candidate.section === room.section);
        if (!work) continue;
        const label = trackCSectionLabel(work.section);
        if (work.release !== 'released') {
          items.push({
            key: `off:${room.unitNumber}:${room.trade}:${room.section}`,
            kind: 'fix',
            text: `${room.unitNumber} ${label} — counted for ${crewName} but the room is OFF the ${room.trade} release.`,
            trade: room.trade,
            unitId: unit.id,
          });
        } else if (work.callbackOpen) {
          items.push({
            key: `cb:${room.unitNumber}:${room.trade}:${room.section}`,
            kind: 'check',
            text: `${room.unitNumber} ${label} — counted for ${crewName} with a callback still open. Pay stands (they did the work) — just confirm.`,
            trade: room.trade,
            unitId: unit.id,
          });
        }
      }
    }
    // 5: extras Tony pays on that nobody has verified yet.
    const weekKey = payWeekSundayOf(activePayWeek);
    const pendingExtras = (weekExtras ?? []).filter((extra) =>
      extra.week === activePayWeek && !ackExtras.has(`${weekKey}::${extra.id}`));
    if (pendingExtras.length > 0) {
      items.push({
        key: 'extras',
        kind: 'check',
        text: `${pendingExtras.length} extra${pendingExtras.length === 1 ? '' : 's'} (cut-ins / textures / changes) not verified yet — run the extras list below.`,
      });
    }
    return items;
  }, [state, payrollByCrew, weekExtras, ackExtras, activePayWeek]);
  // Prefilled, organized text from the crew's REAL current assignments —
  // bilingual-lite so it works for Spanish- and English-speaking crews.
  const composeBody = (crewId: string, crewName: string) => {
    const detail = projectTrackCCrewDetail(state, crewId);
    const byUnit = new Map<string, { sections: CrewTextSection[]; isStudio: boolean }>();
    let trade: 'paint' | 'clean' = 'paint';
    // "Today" = work still in front of them — not sections already reported
    // done or passed, and callbacks get their own conversation.
    for (const work of detail?.currentWork ?? []) {
      if (!['assigned', 'working'].includes(work.execution) || work.callbackOpen) continue;
      const unit = trackCUnitForTarget(state, work);
      if (!unit) continue;
      trade = work.trade;
      const entry = byUnit.get(unit.unitNumber)
        ?? { isStudio: /^s(tudio)?$/i.test(unit.unitType ?? ''), sections: [] };
      entry.sections.push(
        work.section === 'common'
          ? { kind: 'common', workType: work.workType }
          : { bed: trackCSectionLabel(work.section), kind: 'bed', workType: work.workType },
      );
      byUnit.set(unit.unitNumber, entry);
    }
    const rows = [...byUnit.entries()].map(([unitNumber, entry]) => ({
      isStudio: entry.isStudio,
      sections: entry.sections,
      unitNumber,
    }));
    // Nothing in front of them -> no canned "these are your units" text;
    // the button just opens the thread.
    if (rows.length === 0) return undefined;
    return crewUnitsTextBody(crewName, readCrewTextLang(), rows, trade);
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
        // Pay weeks run Sunday -> Saturday, date only (no time cutoff). Week
        // number comes from the ONE shared source (payWeekNumberOf) so the header
        // always agrees with the wall grid and crew tags. Colors follow the board.
        const now = new Date();
        const weekNumber = payWeekNumberOf(now.toISOString());
        const colors: Record<number, string> = { 1: 'yellow', 2: 'green', 3: 'pink' };
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - now.getDay());
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        const fmt = (date: Date) =>
          date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return (
          <p className="track-c-week-line">
            Pay week {weekNumber}{colors[weekNumber] ? ` · ${colors[weekNumber]} on the board` : ''} · {fmt(sunday)} → {fmt(saturday)}
          </p>
        );
      })()}
      {/* Crews FIRST — Los works crew -> unit; reports live below. */}
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
      {(() => {
        // Send today's lists — one Send button per crew that has work in front of
        // them right now, each with the message in Los's exact format and routed
        // to that crew's channel (WhatsApp or SMS). The whole list is rebuilt
        // from saved state every render, so leaving to WhatsApp and coming back
        // never wipes it; the ✓ (from the persisted contact log) shows which
        // crews are already sent so Los knows where he left off.
        const queue = crews
          .map(({ crew }) => ({
            body: composeBody(crew.id, crew.name),
            crew,
            phone: crewDirectory?.[crew.id]?.phone?.trim(),
            sent: lastContactTodayFor(contactLog, crew.id),
            whatsapp: whatsappCrews.has(crew.id),
          }))
          .filter((entry) => Boolean(entry.body));
        if (queue.length === 0) return null;
        const unsent = queue.filter((entry) => !entry.sent || entry.sent.kind === 'call').length;
        return (
          <details className="track-c-sendqueue" open>
            <summary>
              Send today’s lists · {unsent > 0 ? `${unsent} to send` : 'all sent'} of {queue.length}
            </summary>
            <div className="track-c-sendqueue__body">
              <p className="track-c-sendqueue__hint">
                Tap Send → it opens the crew’s chat with their list ready. Come back
                in and the rest are still here; sent ones show ✓.
              </p>
              {queue.map(({ crew, body, phone, sent, whatsapp }) => {
                const wasTexted = sent && sent.kind !== 'call';
                const sentTime = wasTexted
                  ? new Date(sent.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
                  : '';
                return (
                  <div className={`track-c-sendqueue__row${wasTexted ? ' is-sent' : ''}`} key={crew.id}>
                    <div className="track-c-sendqueue__who">
                      <strong>{crew.name}</strong>
                      <small>
                        {crew.trade === 'paint' ? 'Paint' : 'Clean'} · {whatsapp ? 'WhatsApp' : 'SMS'}
                        {wasTexted ? ` · ✓ sent ${sentTime}` : ''}
                      </small>
                    </div>
                    {phone ? (
                      <a
                        aria-label={`Send today's list to ${crew.name} by ${whatsapp ? 'WhatsApp' : 'SMS'}`}
                        className={`track-c-sendqueue__send${wasTexted ? ' is-resend' : ''}`}
                        href={crewMessageHref(phone, whatsapp, body)}
                        onClick={() => logContact(crew.id, crew.name, 'text')}
                        rel="noreferrer"
                        target={whatsapp ? '_blank' : undefined}
                      >
                        {wasTexted ? 'Resend' : whatsapp ? 'Send · WhatsApp' : 'Send · SMS'}
                      </a>
                    ) : (
                      <span className="track-c-sendqueue__nophone">Add a number</span>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })()}
      {weeksWithWork.length > 0 ? (
        <div className="track-c-payweekpick" role="group" aria-label="Which pay week to show">
          <span className="track-c-payweekpick__label">Paying week:</span>
          {weeksWithWork.map((week) => (
            <button
              aria-pressed={activePayWeek === week}
              className={activePayWeek === week ? 'is-on' : ''}
              key={week}
              onClick={() => setPayWeekPick(week)}
              type="button"
            >
              Wk {week}{week === currentPayWeek ? ' · now' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {(() => {
        // The selected pay week, across ALL crews: who did how many of each paint
        // task and how many clean rooms, and in which units — Tony's end-of-week
        // question, answered from the same deduped payroll the receipts use.
        const weekStart = payWeekSundayOf(activePayWeek);
        const weekEnd = payWeekSundayOf(activePayWeek + 1);
        const TASK_KEYS: readonly PaintTypeKey[] =
          ['full', 'touch-up', 'cut-in', 'full-cut-in', 'touch-up-cut-in'];
        const totalPaint: Record<PaintTypeKey, number> =
          { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 };
        let totalClean = 0;
        const perCrew: {
          name: string; trade: string; headline: string; beds: number; commons: number;
          rooms: readonly string[]; changeOrders: readonly string[]; textures: readonly string[];
        }[] = [];
        let totalChangeOrders = 0;
        let totalTextures = 0;
        // Cut-ins are tracked SEPARATELY from the wall board — collect every room
        // with a cut-in component (cut-in, full+cut, touch+cut) so Los has the
        // "where were the cut-ins" list he'd otherwise have to remember.
        const cutIns: string[] = [];
        for (const [crewId, payroll] of payrollByCrew) {
          const weekRooms = payroll.rooms.filter((room) => room.date >= weekStart && room.date < weekEnd);
          if (weekRooms.length === 0) continue;
          const crew = state.crews.find((candidate) => candidate.id === crewId);
          if (!crew) continue;
          // Beds/commons for the SELECTED week (payroll.week is current-week only).
          const beds = weekRooms.filter((room) => room.section !== 'common').length;
          const commons = weekRooms.filter((room) => room.section === 'common').length;
          const raw = payExtras?.[crewId] ?? { changeOrders: [], textures: [] };
          const extras = {
            changeOrders: raw.changeOrders.filter((entry) => entry.week === activePayWeek).map((entry) => entry.label),
            textures: raw.textures.filter((entry) => entry.week === activePayWeek).map((entry) => entry.label),
          };
          totalChangeOrders += extras.changeOrders.length;
          totalTextures += extras.textures.length;
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
              beds, changeOrders: extras.changeOrders, commons,
              headline: formatTypeTally(tally) || `${weekRooms.length} rooms`,
              name: crew.name, rooms: formatRoomsByType(weekRooms), textures: extras.textures, trade: 'Paint',
            });
          } else {
            totalClean += weekRooms.length;
            perCrew.push({
              beds, changeOrders: extras.changeOrders, commons,
              headline: `${beds} bed${beds === 1 ? '' : 's'} · ${commons} common`,
              name: crew.name, rooms: formatRoomsByType(weekRooms), textures: extras.textures, trade: 'Clean',
            });
          }
        }
        if (perCrew.length === 0) return null;
        const packetText = [
          'PAY WEEK — who did what',
          `Paint: ${formatTypeTally(totalPaint) || '—'}  ·  Clean: ${totalClean} rooms`,
          `Change orders: ${totalChangeOrders} · Textures: ${totalTextures}`,
          '',
          '— BY CREW —',
          ...perCrew.flatMap((entry) => [
            `${entry.name} (${entry.trade}): ${entry.headline} · ${entry.beds} beds · ${entry.commons} common`
              + (entry.changeOrders.length || entry.textures.length
                ? ` · ${entry.changeOrders.length} change order(s) · ${entry.textures.length} texture(s)`
                : ''),
            ...entry.rooms.map((line) => `   ${line}`),
            ...entry.changeOrders.map((line) => `   CHANGE ORDER — ${line}`),
            ...entry.textures.map((line) => `   TEXTURE — ${line}`),
          ]),
          '',
          `— CUT-INS (track separately) — ${cutIns.length}`,
          cutIns.length > 0 ? cutIns.join(', ') : 'none',
        ].join('\n');
        return (
          <details className="track-c-weeksummary">
            <summary>Pay week — for the board / Tony</summary>
            <div className="track-c-weeksummary__body">
              {(() => {
                const start = new Date(`${weekStart}T12:00:00`);
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                const fmt = (date: Date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                return (
                  <p className="track-c-weeksummary__caption">
                    Week {fmt(start)}–{end.getDate()} · counts are <b>rooms crews reported done</b>.
                    A full+cut-in counts as a full <b>and</b> a cut-in, so the task totals overlap.
                  </p>
                );
              })()}
              <p className="track-c-weeksummary__totals">
                <b>Paint:</b> {formatTypeTally(totalPaint) || '—'}
                {'  ·  '}
                <b>Clean:</b> {totalClean} room{totalClean === 1 ? '' : 's'}
                {'  ·  '}
                <b>Change orders:</b> {totalChangeOrders}
                {'  ·  '}
                <b>Textures:</b> {totalTextures}
              </p>
              {perCrew.map((entry) => (
                <div className="track-c-weeksummary__crew" key={entry.name}>
                  <strong>
                    {entry.name} ({entry.trade}) · {entry.headline} · {entry.beds} beds · {entry.commons} common
                    {entry.changeOrders.length || entry.textures.length
                      ? ` · ${entry.changeOrders.length} change order${entry.changeOrders.length === 1 ? '' : 's'} · ${entry.textures.length} texture${entry.textures.length === 1 ? '' : 's'}`
                      : ''}
                  </strong>
                  {entry.rooms.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {entry.changeOrders.map((line) => (
                    <p className="track-c-weeksummary__extra" key={`co-${line}`}>Change order — {line}</p>
                  ))}
                  {entry.textures.map((line) => (
                    <p className="track-c-weeksummary__extra" key={`tx-${line}`}>Texture — {line}</p>
                  ))}
                </div>
              ))}
              <div className="track-c-weeksummary__crew">
                <strong>Cut-in rooms (track separately) · {cutIns.length}</strong>
                <p>{cutIns.length > 0 ? cutIns.join(', ') : 'none this week'}</p>
                <p className="track-c-weeksummary__note">
                  This counts cut-in <b>rooms</b>. The “This week’s extras” sheet counts cut-in
                  <b> units</b>, so its number is lower — same work, different grain.
                </p>
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
              <button
                className="track-c-weeksummary__copy"
                onClick={() => {
                  void savePayWeekPacketPdf({
                    changeOrderTotal: totalChangeOrders,
                    cleanTotal: totalClean,
                    crews: perCrew,
                    cutIns,
                    paintTotalsLine: formatTypeTally(totalPaint),
                    propertyName: state.propertyName,
                    supervisor: 'Los',
                    textureTotal: totalTextures,
                    weekStart,
                  })
                    .then((filename) => setPayCopied(`Saved ${filename} — hand it to Tony or AirDrop it.`))
                    .catch(() => setPayCopied('PDF needs a moment online first — try again.'));
                }}
                type="button"
              >
                Save as PDF — for Tony
              </button>
              {payCopied ? <p className="track-c-weeksummary__copied">{payCopied}</p> : null}
            </div>
          </details>
        );
      })()}
      {(() => {
        const fixes = preflight.filter((item) => item.kind === 'fix');
        const checks = preflight.filter((item) => item.kind === 'check');
        return (
          <details className="track-c-preflight" open={fixes.length > 0}>
            <summary className={fixes.length > 0 ? 'is-warn' : 'is-clean'}>
              {fixes.length > 0
                ? `⚠ Payroll pre-flight · ${fixes.length} to fix${checks.length > 0 ? ` · ${checks.length} to confirm` : ''}`
                : checks.length > 0
                  ? `Payroll pre-flight · ✓ numbers agree · ${checks.length} to confirm`
                  : 'Payroll pre-flight · ✓ all clear — packet, board, and crews agree'}
            </summary>
            <div className="track-c-preflight__body">
              <p className="track-c-preflight__hint">
                Week {activePayWeek} audit: every done room has one crew to pay,
                every paid room is on the board, every extra is verified. Run it
                Friday night — walk in Saturday with zero surprises.
              </p>
              {preflight.length === 0 ? (
                <p className="track-c-preflight__clean">Nothing to fix. This packet survives an audit.</p>
              ) : preflight.map((item) => (
                item.unitId && onOpenUnit ? (
                  <button
                    className={`track-c-preflight__item is-${item.kind}`}
                    key={item.key}
                    onClick={() => onOpenUnit(item.unitId as string, item.trade ?? 'paint')}
                    type="button"
                  >
                    {item.kind === 'fix' ? '⚠' : '•'} {item.text}
                  </button>
                ) : (
                  <p className={`track-c-preflight__item is-${item.kind}`} key={item.key}>
                    {item.kind === 'fix' ? '⚠' : '•'} {item.text}
                  </p>
                )
              ))}
            </div>
          </details>
        );
      })()}
      {weekExtras && weekExtras.some((item) => item.week === activePayWeek) ? (() => {
        // The selected week's extras — the paper list Los used to keep, now in the
        // app. Organized the way PAYROLL works: each kind collapses to a glanceable
        // count (with a per-crew breakdown right in the header), and expands into
        // per-crew groups sorted low→high by unit. Tap the check to verify one for
        // payroll; the ✓ sticks (device-local, namespaced by the viewed week).
        const activeExtras = weekExtras.filter((item) => item.week === activePayWeek);
        const weekKey = payWeekSundayOf(activePayWeek);
        const ackKeyOf = (id: string) => `${weekKey}::${id}`;
        const KIND_META: Record<string, { label: string; cls: string }> = {
          'cut-in': { cls: 'is-cut-in', label: 'Cut-ins' },
          'heavy-clean': { cls: 'is-heavy-clean', label: 'Heavy cleans' },
          'change-order': { cls: 'is-change-order', label: 'Change orders' },
          texture: { cls: 'is-texture', label: 'Textures' },
          drywall: { cls: 'is-drywall', label: 'Drywall repairs' },
        };
        const KIND_ORDER = ['cut-in', 'heavy-clean', 'change-order', 'texture', 'drywall'] as const;
        const unitNum = (unitNumber: string) => Number(unitNumber.replace(/\D/g, '')) || 0;
        const ackedCount = activeExtras.filter((item) => ackExtras.has(ackKeyOf(item.id))).length;
        return (
          <details className="track-c-extras" open>
            <summary>
              Week {activePayWeek} extras · {activeExtras.length}
              {ackedCount > 0 ? ` · ${ackedCount} ✓` : ''}
            </summary>
            <div className="track-c-extras__body">
              <p className="track-c-extras__hint">
                Everything you’d write on paper for payroll. Tap a kind to open it;
                each crew’s count is right there. Tap a circle to verify one — the ✓ sticks.
              </p>
              {KIND_ORDER.filter((kind) => activeExtras.some((item) => item.kind === kind)).map((kind) => {
                type ExtraItem = (typeof activeExtras)[number];
                const rows = activeExtras.filter((item) => item.kind === kind);
                // Group by crew, each crew's rows sorted low→high by unit.
                const byCrew = new Map<string, ExtraItem[]>();
                for (const item of rows) {
                  const key = item.crew || '—';
                  const bucket = byCrew.get(key);
                  if (bucket) bucket.push(item);
                  else byCrew.set(key, [item]);
                }
                const crewNames = [...byCrew.keys()].sort();
                const crewCounts = crewNames.map((name) => `${name} ${byCrew.get(name)!.length}`).join(' · ');
                const bigList = rows.length > 6; // cut-ins/heavy cleans collapse by default
                return (
                  <details className="track-c-extras__kind" key={kind} open={!bigList}>
                    <summary className={`track-c-extras__kindhead ${KIND_META[kind].cls}`}>
                      {KIND_META[kind].label} · {rows.length}
                      {crewNames.length > 1 ? (
                        <span className="track-c-extras__crewcounts">{crewCounts}</span>
                      ) : null}
                    </summary>
                    {crewNames.map((name) => {
                      const crewRows = [...byCrew.get(name)!].sort((left, right) =>
                        unitNum(left.unitNumber) - unitNum(right.unitNumber));
                      return (
                        <div className="track-c-extras__crew" key={name}>
                          {crewNames.length > 1 ? (
                            <p className="track-c-extras__crewhead">{name} · {crewRows.length}</p>
                          ) : null}
                          {crewRows.map((item) => {
                            const acked = ackExtras.has(ackKeyOf(item.id));
                            // Tap-through to the unit so Los can validate the
                            // cut-in/extra on the spot instead of hunting it.
                            const unitId = state.units.find((unit) =>
                              unit.unitNumber === item.unitNumber)?.id;
                            const extraTrade = item.kind === 'heavy-clean' ? 'clean' as const : 'paint' as const;
                            return (
                              <div className={`track-c-extras__row${acked ? ' is-acked' : ''}`} key={item.id}>
                                <button
                                  aria-label={acked ? `Un-verify ${item.unitNumber}` : `Verify ${item.unitNumber}`}
                                  aria-pressed={acked}
                                  className="track-c-extras__ack"
                                  onClick={() => setAckExtras(toggleAckExtra(ackKeyOf(item.id)))}
                                  type="button"
                                >
                                  {acked ? '✓' : ''}
                                </button>
                                {onOpenUnit && unitId ? (
                                  <button
                                    className="track-c-extras__detail is-link"
                                    onClick={() => onOpenUnit(unitId, extraTrade)}
                                    type="button"
                                  >
                                    <strong>{item.unitNumber} ›</strong>
                                    <small>{item.detail}</small>
                                  </button>
                                ) : (
                                  <div className="track-c-extras__detail">
                                    <strong>{item.unitNumber}</strong>
                                    <small>{item.detail}</small>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </details>
                );
              })}
            </div>
          </details>
        );
      })() : null}
      {(() => {
        // TONIGHT'S BOARD — what Los applies to the physical boards at the end
        // of the day: every room FIRST reported done on the chosen day (crew-
        // done basis — the pay basis, not PDS approval), in board format, one
        // scroll instead of unit-by-unit. Day chips cover the whole history so
        // yesterday (or any day) is one tap — staying ahead of Tony's Sunday.
        interface DayRoom {
          unitNumber: string;
          trade: 'paint' | 'clean';
          section: string;
          workType?: string;
          crewName: string;
          date: string;
        }
        const allRooms: DayRoom[] = [];
        for (const [crewId, payroll] of payrollByCrew) {
          const crewName = state.crews.find((crew) => crew.id === crewId)?.name ?? '';
          for (const room of payroll.rooms) {
            allRooms.push({ ...room, crewName });
          }
        }
        if (allRooms.length === 0) return null;
        const days = [...new Set(allRooms.map((room) => room.date))].sort().reverse();
        const activeDay = dayPick && days.includes(dayPick) ? dayPick : days[0];
        const todayLocal = payLocalDate(new Date().toISOString());
        const dayLabel = (date: string) => {
          if (date === todayLocal) return 'Today';
          const [y, m, d] = date.split('-').map(Number);
          const when = new Date(y, m - 1, d);
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (date === payLocalDate(yesterday.toISOString())) return 'Yesterday';
          return when.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
        };
        const SECTIONS = ['common', 'A', 'B', 'C', 'D', 'E'] as const;
        const dayRooms = allRooms.filter((room) => room.date === activeDay);
        const tradeBlocks = (['paint', 'clean'] as const).map((trade) => {
          const rooms = dayRooms.filter((room) => room.trade === trade);
          const byUnit = new Map<string, DayRoom[]>();
          for (const room of rooms) {
            const bucket = byUnit.get(room.unitNumber);
            if (bucket) bucket.push(room);
            else byUnit.set(room.unitNumber, [room]);
          }
          const rows = [...byUnit.entries()]
            .sort((left, right) => compareUnitTopFloorFirst(left[0], right[0]))
            .map(([unitNumber, unitRooms]) => ({
              crew: [...new Set(unitRooms.map((room) => room.crewName))].filter(Boolean).join(' + '),
              unitId: state.units.find((unit) => unit.unitNumber === unitNumber)?.id,
              unitNumber,
              unitRooms,
            }));
          return { rows, trade };
        }).filter((block) => block.rows.length > 0);
        const taskTag = (trade: string, workType?: string) => (trade === 'clean'
          ? (workType === 'heavy-clean' ? 'HC' : '')
          : (WALL_WORKTYPE_ABBR[workType ?? 'full'] ?? 'F'));
        const dayTextures = new Map<string, { count: number; textureOnly: boolean }>();
        for (const extra of weekExtras ?? []) {
          if (extra.kind !== 'texture') continue;
          const parsed = parseTextureWording(extra.detail);
          if (!parsed?.room) continue;
          const key = `${extra.unitNumber}:${parsed.room}`;
          const existing = dayTextures.get(key);
          dayTextures.set(key, {
            count: (existing?.count ?? 0) + parsed.count,
            textureOnly: (existing?.textureOnly ?? false) || parsed.textureOnly,
          });
        }
        const dayTag = (unitNumber: string, room: DayRoom) => {
          const base = taskTag(room.trade, room.workType);
          const texture = room.trade === 'paint' ? dayTextures.get(`${unitNumber}:${room.section}`) : undefined;
          if (texture?.textureOnly) return `T${texture.count}`;
          return `${base}${texture ? `·T${texture.count}` : ''}`;
        };
        const dayText = [
          `${dayLabel(activeDay).toUpperCase()} ${activeDay} — apply to the board (crew-done)`,
          ...tradeBlocks.flatMap((block) => [
            block.trade === 'paint' ? 'PAINT:' : 'CLEAN:',
            ...block.rows.map((row) => {
              const marks = row.unitRooms
                .sort((a, b) => SECTIONS.indexOf(a.section as typeof SECTIONS[number]) - SECTIONS.indexOf(b.section as typeof SECTIONS[number]))
                .map((room) => {
                  const tag = dayTag(row.unitNumber, room);
                  const label = room.section === 'common' ? 'Comn' : room.section;
                  return tag && tag !== 'F' ? `${label}(${tag})` : label;
                }).join(' ');
              return `${row.unitNumber}  X: ${marks}  ${row.crew}`;
            }),
          ]),
        ].join('\n');
        return (
          <details className="track-c-wallxfer track-c-dayboard">
            <summary>
              Tonight’s board — {dayLabel(activeDay)} · {dayRooms.length} room{dayRooms.length === 1 ? '' : 's'} done
            </summary>
            <div className="track-c-wallxfer__body">
              <p className="track-c-wallxfer__hint">
                Rooms the crews finished on this day — mark these X on the wall
                and the mini board. Counts are the pay basis (crew-done), not
                waiting on PDS approval.
              </p>
              <div className="track-c-dayboard__days">
                {days.slice(0, 14).map((date) => (
                  <button
                    aria-pressed={date === activeDay}
                    className={date === activeDay ? 'is-selected' : undefined}
                    key={date}
                    onClick={() => setDayPick(date)}
                    type="button"
                  >
                    {dayLabel(date)}
                  </button>
                ))}
              </div>
              {tradeBlocks.map((block) => (
                <div className="track-c-dayboard__trade" key={block.trade}>
                  <p className="track-c-dayboard__tradehead">
                    {block.trade === 'paint' ? 'Paint' : 'Clean'} · {block.rows.length} unit{block.rows.length === 1 ? '' : 's'}
                  </p>
                  <div className="track-c-wallxfer__scroll">
                    <table className="track-c-wallxfer__grid">
                      <thead>
                        <tr>
                          <th>Unit</th>
                          <th>Comn</th>
                          <th>A</th><th>B</th><th>C</th><th>D</th><th>E</th>
                          <th>Crew</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row) => (
                          <tr key={row.unitNumber}>
                            <th scope="row">
                              {onOpenUnit && row.unitId ? (
                                <button
                                  className="track-c-wallxfer__unit"
                                  onClick={() => onOpenUnit(row.unitId as string, block.trade)}
                                  type="button"
                                >
                                  {row.unitNumber}
                                </button>
                              ) : row.unitNumber}
                            </th>
                            {SECTIONS.map((section) => {
                              const room = row.unitRooms.find((candidate) => candidate.section === section);
                              if (!room) return <td className="is-na" key={section} />;
                              return (
                                <td className="track-c-wallxfer__cell is-done" key={section}>
                                  <span className="track-c-wallxfer__mark">X</span>
                                  <span className="track-c-wallxfer__task">{dayTag(row.unitNumber, room)}</span>
                                </td>
                              );
                            })}
                            <td className="track-c-wallxfer__crew">{row.crew || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {tradeBlocks.length === 0 ? (
                <p className="track-c-wallxfer__hint">Nothing reported done this day.</p>
              ) : null}
              <button
                className="track-c-weeksummary__copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(dayText)
                    .then(() => setWallCopied({ msg: `Copied — ${dayLabel(activeDay)}'s board as text.`, trade: 'day' }))
                    .catch(() => setWallCopied({ msg: 'Copy not available — read it here.', trade: 'day' }));
                }}
                type="button"
              >
                Copy {dayLabel(activeDay)}’s board
              </button>
              {wallCopied?.trade === 'day'
                ? <p className="track-c-weeksummary__copied">{wallCopied.msg}</p>
                : null}
            </div>
          </details>
        );
      })()}
      {(['paint', 'clean'] as const).map((wallTrade) => {
        // Wall-board transfer — every unit with THIS trade in this pay week,
        // in board order, laid out exactly like Los's physical wall grid
        // (Comn · A · B · C · D · E · Crew · approved) so he can copy it cell by
        // cell. Paint cells also show the task tag (F/TU/CI/…); Clean shows HC for
        // a heavy clean (regular clean has no tag). One grid per physical board.
        //
        // ONE week per unit, ALL its rooms together (1001 field bug: room A got
        // re-listed a day later, so per-room release weeks split the unit across
        // two week boards while the unit page said all-approved). The unit's week
        // = Los's w# chip correction if he made one (same turn-os:wall-week-v2
        // the TurnBoard chip writes), else the week the crew DID the work (same
        // basis as pay), else the earliest release.
        const SECTIONS = ['common', 'A', 'B', 'C', 'D', 'E'] as const;
        const weekNo = activePayWeek;
        let weekOverrides: Record<string, number> = {};
        try {
          weekOverrides = JSON.parse(
            window.localStorage.getItem('turn-os:wall-week-v2') ?? '{}',
          ) as Record<string, number>;
        } catch { /* no corrections on this device */ }
        const latestDoneByUnit = new Map<string, string>();
        for (const event of state.events) {
          if (event.eventType !== 'crew-reported-complete') continue;
          if (event.target.trade !== wallTrade) continue;
          const existing = latestDoneByUnit.get(event.target.unitId) ?? '';
          if (event.recordedAt > existing) {
            latestDoneByUnit.set(event.target.unitId, event.recordedAt);
          }
        }
        const colorName = ['amber', 'green', 'pink'][wallWeekColor(weekNo)] ?? '';
        const crewNameOf = (id?: string) =>
          (id ? state.crews.find((crew) => crew.id === id)?.name ?? '' : '');
        const taskTagOf = (workType?: string) => (wallTrade === 'clean'
          ? (workType === 'heavy-clean' ? 'HC' : '')
          : (WALL_WORKTYPE_ABBR[workType ?? 'full'] ?? 'F'));
        // Texture repairs ride the cell tag too (T2 = two spots) — texture is
        // NOT a touch-up, and the board transfer should carry it.
        const textureBySection = new Map<string, { count: number; textureOnly: boolean }>();
        if (wallTrade === 'paint') {
          for (const extra of weekExtras ?? []) {
            if (extra.kind !== 'texture' || extra.week !== weekNo) continue;
            const parsed = parseTextureWording(extra.detail);
            if (!parsed?.room) continue;
            const key = `${extra.unitNumber}:${parsed.room}`;
            const existing = textureBySection.get(key);
            textureBySection.set(key, {
              count: (existing?.count ?? 0) + parsed.count,
              textureOnly: (existing?.textureOnly ?? false) || parsed.textureOnly,
            });
          }
        }
        type Cell = { mark: string; task: string; approved: boolean; done: boolean } | null;
        const rows: {
          unitId: string; unitNumber: string; cells: Record<string, Cell>;
          crew: string; allApproved: boolean;
        }[] = [];
        const orderedUnits = [...state.units].sort((left, right) =>
          compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
        for (const unit of orderedUnits) {
          const tradeWork = projectTrackCUnitWork(state, unit.id).filter(
            (work) => work.trade === wallTrade
              && work.release === 'released'
              && work.releasedAt);
          if (tradeWork.length === 0) continue;
          const override = weekOverrides[`${unit.id}:${wallTrade}`];
          const earliestRelease = tradeWork.reduce(
            (min, work) => (!min || (work.releasedAt ?? '') < min ? work.releasedAt ?? '' : min),
            '',
          );
          const unitWeek = override
            ?? payWeekNumberOf(latestDoneByUnit.get(unit.id) ?? earliestRelease);
          if (unitWeek !== weekNo) continue;
          const cells: Record<string, Cell> = {};
          let crewId: string | undefined;
          let anyApproved = false;
          let allApproved = true;
          for (const section of SECTIONS) {
            const work = tradeWork.find((item) => item.section === section);
            if (!work) { cells[section] = null; continue; }
            const approved = work.property === 'property-accepted';
            const done = approved
              || work.execution === 'crew-reported-complete'
              || work.inspection === 'los-passed';
            const mark = work.callbackOpen
              ? 'CB'
              : approved ? 'CC' : done ? 'X' : work.responsibleCrewId ? '•' : '/';
            const texture = textureBySection.get(`${unit.unitNumber}:${section}`);
            cells[section] = {
              approved,
              done,
              mark,
              // Texture-only rooms show JUST the texture tag — never a task.
              task: texture?.textureOnly
                ? `T${texture.count}`
                : `${taskTagOf(work.workType)}${texture ? `·T${texture.count}` : ''}`,
            };
            if (work.responsibleCrewId) crewId = work.responsibleCrewId;
            if (approved) anyApproved = true; else allApproved = false;
          }
          rows.push({
            allApproved: anyApproved && allApproved,
            cells,
            crew: crewNameOf(crewId),
            unitId: unit.id,
            unitNumber: unit.unitNumber,
          });
        }
        if (rows.length === 0) return null;
        const tradeUpper = wallTrade === 'paint' ? 'PAINT' : 'CLEAN';
        const wallText = [
          `WEEK ${weekNo} — ${tradeUpper} — copy to the wall board`,
          `Unit  Comn A B C D E  Crew  Approved`,
          ...rows.map((row) => {
            const marks = SECTIONS.map((section) => {
              const cell = row.cells[section];
              if (!cell) return '—';
              return cell.task && cell.task !== 'F' ? `${cell.mark}(${cell.task})` : cell.mark;
            }).join(' ');
            return `${row.unitNumber}  ${marks}  ${row.crew}${row.allApproved ? '  CC' : ''}`;
          }),
        ].join('\n');
        return (
          <details className="track-c-wallxfer" key={wallTrade}>
            <summary>
              Week {weekNo} — copy to the wall board · {rows.length} {wallTrade} unit{rows.length === 1 ? '' : 's'}
              {colorName ? ` (${colorName})` : ''}
            </summary>
            <div className="track-c-wallxfer__body">
              <p className="track-c-wallxfer__hint">
                X = done · CC = property approved · CB = callback · / = released · • = assigned.
                {wallTrade === 'paint'
                  ? ' Tag under each mark is the task — tap a unit to fix a wrong one.'
                  : ' HC under a mark = heavy clean. Tap a unit to fix a wrong one.'}
                {' '}A unit shows ALL its rooms on ONE week — the week the crew did
                the work, or your w# chip fix on the TurnBoard wall.
              </p>
              <div className="track-c-wallxfer__scroll">
                <table className="track-c-wallxfer__grid">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Comn</th>
                      <th>A</th><th>B</th><th>C</th><th>D</th><th>E</th>
                      <th>Crew</th>
                      <th aria-label="Approved">✓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.unitId}>
                        <th scope="row">
                          {onOpenUnit ? (
                            <button
                              className="track-c-wallxfer__unit"
                              onClick={() => onOpenUnit(row.unitId, wallTrade)}
                              type="button"
                            >
                              {row.unitNumber}
                            </button>
                          ) : row.unitNumber}
                        </th>
                        {SECTIONS.map((section) => {
                          const cell = row.cells[section];
                          if (!cell) return <td className="is-na" key={section} />;
                          return (
                            <td
                              className={`track-c-wallxfer__cell${cell.approved ? ' is-approved' : cell.done ? ' is-done' : ''}`}
                              key={section}
                            >
                              <span className="track-c-wallxfer__mark">{cell.mark}</span>
                              <span className="track-c-wallxfer__task">{cell.task}</span>
                            </td>
                          );
                        })}
                        <td className="track-c-wallxfer__crew">{row.crew || '—'}</td>
                        <td className="track-c-wallxfer__ok">{row.allApproved ? 'CC' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="track-c-weeksummary__copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(wallText)
                    .then(() => setWallCopied({ msg: `Copied — the ${wallTrade} wall grid as text.`, trade: wallTrade }))
                    .catch(() => setWallCopied({ msg: 'Copy not available — read it here.', trade: wallTrade }));
                }}
                type="button"
              >
                Copy the {wallTrade} wall grid
              </button>
              {wallCopied?.trade === wallTrade
                ? <p className="track-c-weeksummary__copied">{wallCopied.msg}</p>
                : null}
            </div>
          </details>
        );
      })}
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
          className="track-c-add-crew track-c-add-crew--compact"
          data-track-c-critical-target="true"
          onClick={onAddCrewRequested}
          type="button"
        >
          + Add crew
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
                      </span>
                      {turnTypeLabel ? (
                        <span className="track-c-crew-totals__typeline">{turnTypeLabel}</span>
                      ) : null}
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
