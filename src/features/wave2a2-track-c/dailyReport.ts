import type {
  TrackCConfirmedEvent,
  TrackCState,
  TrackCWorkTarget,
} from './model';
import { projectTrackCWork } from './projections';

// Builds the human-readable Daily Supervisor Report from the same event
// ledger everything else reads. The backup JSON is the machine file; this is
// the file Los hands to a person. Personal record only — the paper
// TurnBoard stays the official approval.

const localDate = (iso: string) => {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const tradeLabel = (trade: string) => (trade === 'paint' ? 'Paint' : 'Clean');

const sectionLabel = (section: string) =>
  section === 'common' ? 'Common' : `Room ${section}`;

export interface DailyReportUnitLine {
  readonly unitNumber: string;
  readonly trades: readonly string[];
  readonly sections: number;
  /** "1 common area · 3 beds" — the property-manager language. */
  readonly makeup?: string;
  readonly walkedWith?: string;
  readonly time?: string;
}

export interface DailyReportCrewLine {
  readonly name: string;
  readonly trade: string;
  readonly sectionsStarted: number;
  readonly sectionsCompleted: number;
}

export interface DailyReportData {
  readonly propertyName: string;
  readonly date: string;
  readonly dayNumber?: number;
  readonly supervisor: string;
  readonly stats: {
    readonly unitsAccepted: number;
    readonly sectionsAccepted: number;
    readonly sectionsPassed: number;
    readonly bedsPassed: number;
    readonly commonsPassed: number;
    readonly bedsCompleted: number;
    readonly commonsCompleted: number;
    readonly callbacksOpened: number;
    readonly callbacksResolved: number;
    readonly callbacksStillOpen: number;
    readonly crewsActive: number;
  };
  readonly unitsDone: readonly DailyReportUnitLine[];
  readonly openCallbacks: readonly {
    readonly unitNumber: string;
    readonly trade: string;
    readonly section: string;
  }[];
  readonly crews: readonly DailyReportCrewLine[];
}

export function buildDailyReportData(input: {
  state: TrackCState;
  date: string;
  dayNumber?: number;
  supervisor?: string;
}): DailyReportData {
  const { state, date } = input;
  const unitNumberById = new Map(
    state.units.map((unit) => [unit.id, unit.unitNumber]),
  );
  const todays = (eventType: TrackCConfirmedEvent['eventType']) =>
    state.events.filter((event) =>
      event.eventType === eventType && localDate(event.recordedAt) === date);

  const accepted = todays('property-accepted');
  const acceptedByUnit = new Map<string, { trades: Set<string>; sections: number }>();
  for (const event of accepted) {
    const group = acceptedByUnit.get(event.target.unitId)
      ?? { sections: 0, trades: new Set<string>() };
    group.sections += 1;
    group.trades.add(tradeLabel(event.target.trade));
    acceptedByUnit.set(event.target.unitId, group);
  }
  const walkMeta = new Map<string, { contact: string; at?: string }>();
  for (const walk of state.completedWalks) {
    if (!walk.endedAt || localDate(walk.endedAt) !== date) continue;
    for (const outcome of walk.outcomes ?? []) {
      if (outcome.outcome !== 'accepted') continue;
      walkMeta.set(outcome.target.unitId, {
        at: walk.endedAt,
        contact: walk.propertyContact,
      });
    }
  }
  const unitsDone: DailyReportUnitLine[] = [...acceptedByUnit.entries()]
    .map(([unitId, group]) => {
      // Beds/common language per unit ("1 common area · 3 beds"), from the
      // unit's own accepted sections (unique, not section-trade counts).
      const unit = state.units.find((candidate) => candidate.id === unitId);
      const uniqueSections = new Set(
        unit?.workFacts.map((fact) => fact.section) ?? [],
      );
      const commons = uniqueSections.has('common') ? 1 : 0;
      const beds = uniqueSections.size - commons;
      return {
        makeup: [
          commons > 0 ? `${commons} common area` : '',
          beds > 0 ? `${beds} bed${beds === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' · '),
        sections: group.sections,
        time: walkMeta.get(unitId)?.at ? timeLabel(walkMeta.get(unitId)!.at!) : undefined,
        trades: [...group.trades],
        unitNumber: unitNumberById.get(unitId) ?? unitId,
        walkedWith: walkMeta.get(unitId)?.contact,
      };
    })
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }));

  const openCallbacks: { unitNumber: string; trade: string; section: string }[] = [];
  for (const unit of state.units) {
    for (const fact of unit.workFacts) {
      if (fact.release !== 'released') continue;
      const target: TrackCWorkTarget = {
        section: fact.section,
        trade: fact.trade,
        unitId: fact.unitId,
      };
      const projection = projectTrackCWork(state, target);
      if (!projection?.callbackOpen) continue;
      openCallbacks.push({
        section: sectionLabel(fact.section),
        trade: tradeLabel(fact.trade),
        unitNumber: unit.unitNumber,
      });
    }
  }

  const crewById = new Map(state.crews.map((crew) => [crew.id, crew]));
  const crewLines = new Map<string, {
    completed: number;
    name: string;
    started: number;
    trade: string;
  }>();
  const touchCrew = (crewId: string | undefined, field: 'completed' | 'started') => {
    if (!crewId) return;
    const crew = crewById.get(crewId);
    const line = crewLines.get(crewId) ?? {
      completed: 0,
      name: crew?.name ?? crewId,
      started: 0,
      trade: crew ? tradeLabel(crew.trade) : '',
    };
    line[field] += 1;
    crewLines.set(crewId, line);
  };
  for (const event of todays('work-started')) touchCrew(event.crewId, 'started');
  for (const event of todays('crew-reported-complete')) touchCrew(event.crewId, 'completed');

  // Beds vs common areas (a bed = a bedroom — the property manager's language).
  const splitByKind = (events: readonly { target: { section: string } }[]) => {
    const commons = events.filter((event) => event.target.section === 'common').length;
    return { beds: events.length - commons, commons };
  };
  const passedSplit = splitByKind(todays('los-passed'));
  const completedSplit = splitByKind(todays('crew-reported-complete'));

  return {
    crews: [...crewLines.values()]
      .map((line) => ({
        name: line.name,
        sectionsCompleted: line.completed,
        sectionsStarted: line.started,
        trade: line.trade,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    date: input.date,
    dayNumber: input.dayNumber,
    openCallbacks,
    propertyName: state.propertyName,
    stats: {
      bedsCompleted: completedSplit.beds,
      bedsPassed: passedSplit.beds,
      callbacksOpened: todays('callback-opened').length,
      callbacksResolved: todays('callback-resolved').length,
      callbacksStillOpen: openCallbacks.length,
      commonsCompleted: completedSplit.commons,
      commonsPassed: passedSplit.commons,
      crewsActive: crewLines.size,
      sectionsAccepted: accepted.length,
      sectionsPassed: todays('los-passed').length,
      unitsAccepted: acceptedByUnit.size,
    },
    supervisor: input.supervisor ?? 'Los',
    unitsDone,
  };
}

// Warm the PDF chunk into the service-worker cache while the device is online,
// so the day's first report can still generate in a dead-zone hallway after a
// deploy has changed the chunk's hashed filename. Safe to call repeatedly.
let pdfPrewarmed = false;
export function prewarmDailyReportPdf(): void {
  if (pdfPrewarmed) return;
  pdfPrewarmed = true;
  void import('jspdf').catch(() => {
    // Offline or blocked — the on-demand import will retry when a report is made.
    pdfPrewarmed = false;
  });
}

// jsPDF loads on demand so report generation never weighs down the app shell.
export async function saveDailyReportPdf(report: DailyReportData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const left = 18;
  const right = 192;
  let y = 22;

  const ensureRoom = (needed: number) => {
    if (y + needed <= 278) return;
    doc.addPage();
    y = 22;
  };
  const heading = (text: string) => {
    ensureRoom(14);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, left, y);
    y += 2;
    doc.setDrawColor(180);
    doc.line(left, y, right, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
  };
  const line = (text: string) => {
    const wrapped = doc.splitTextToSize(text, right - left) as string[];
    for (const part of wrapped) {
      ensureRoom(6);
      doc.text(part, left, y);
      y += 5.5;
    }
  };

  const dateLabel = new Date(`${report.date}T12:00:00`).toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`${report.propertyName} — Daily Supervisor Report`, left, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(
    `${report.dayNumber ? `Day ${report.dayNumber} · ` : ''}${dateLabel} · Supervisor: ${report.supervisor}`,
    left,
    y,
  );
  y += 4;

  heading('Today at a glance');
  line(`Units accepted by the property: ${report.stats.unitsAccepted}`);
  line(`Crew reported complete: ${report.stats.bedsCompleted} beds · ${report.stats.commonsCompleted} common areas`);
  line(`Passed my inspection: ${report.stats.bedsPassed} beds · ${report.stats.commonsPassed} common areas`);
  line(`Callbacks: ${report.stats.callbacksOpened} opened · ${report.stats.callbacksResolved} resolved · ${report.stats.callbacksStillOpen} still open`);
  line(`Crews active: ${report.stats.crewsActive}`);

  heading('Units done today');
  if (report.unitsDone.length === 0) {
    line('No units were property-accepted today.');
  }
  for (const unit of report.unitsDone) {
    const scope = unit.makeup || `${unit.sections} section${unit.sections === 1 ? '' : 's'}`;
    line(`Unit ${unit.unitNumber} — ${unit.trades.join(' + ')} · ${scope}${unit.walkedWith ? ` · walked with ${unit.walkedWith}` : ''}${unit.time ? ` at ${unit.time}` : ''}`);
  }

  heading('Open callbacks going into tomorrow');
  if (report.openCallbacks.length === 0) {
    line('None — the board is clean.');
  }
  for (const callback of report.openCallbacks) {
    line(`Unit ${callback.unitNumber} · ${callback.trade} · ${callback.section}`);
  }

  heading('Crew activity today');
  if (report.crews.length === 0) {
    line('No crew work was recorded today.');
  }
  for (const crew of report.crews) {
    line(`${crew.name} (${crew.trade}) — started ${crew.sectionsStarted}, reported complete ${crew.sectionsCompleted}`);
  }

  ensureRoom(16);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    'Personal record generated by Turn OS. The paper TurnBoard remains the official approval record.',
    left,
    y,
  );

  const filename = `turn-os-${report.dayNumber ? `day-${report.dayNumber}-` : ''}report-${report.date}.pdf`;
  doc.save(filename);
  return filename;
}
