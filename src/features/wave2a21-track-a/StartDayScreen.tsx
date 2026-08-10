import { useEffect, useMemo, useRef, useState } from 'react';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { createId } from '../../lib/constants';
import type {
  DailyReleaseBatch,
  DaySessionKeyStatus,
  FieldSection,
  FieldTrade,
  ReleaseWorkType,
} from '../../types';
import type {
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
  TrackACrewOption,
} from './contracts';
import type { PropertyRoster } from '../wave2a2-track-b';
import {
  createManualReleaseBatch,
  type ManualReleaseSelection,
} from '../wave2a2-core/appDataAdapters';
import {
  parseStartDayMemo,
  type StartDayMemoMode,
} from '../wave2a2-core/startDayParse';
import {
  availableDailyReleaseTradeChoices,
  defaultActiveCrewIds,
  prepareFastStartDaySubmission,
  resolveProjectDefaultSchedule,
  type FastStartDaySubmission,
  type RoomPlanEntry,
} from './phase2Workflow';
import '../wave2a2-core/acceptedCore.css';
import './trackA.css';

// The new Start Day — ONE screen: paste (or dictate) the morning list, SEE
// every unit + room + task land, fix anything with a tap, press Start Day.
// The reader is deterministic (startDayParse) so ChatGPT's exact paint/clean
// lists — commons included — land perfectly with no AI, no sign-in, offline.
// If the day is already running, the same screen adds the list to today.

export interface StartDayScreenProps {
  readonly configuration: ProjectConfiguration;
  readonly contacts: readonly PropertyContact[];
  readonly crewOptions: readonly TrackACrewOption[];
  readonly currentDate: string;
  readonly dayActive: boolean;
  readonly onAddCrew?: (name: string, trade: 'paint' | 'clean') => string;
  readonly onAddToDay: (batch: DailyReleaseBatch) => boolean | Promise<boolean>;
  readonly onCancel: () => void;
  readonly onStartDay: (
    submission: FastStartDaySubmission,
  ) => boolean | Promise<boolean>;
  readonly projectId: string;
  readonly propertyName: string;
  readonly roster: PropertyRoster;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
}

interface PlanEntry {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly section: FieldSection;
  readonly trade: FieldTrade;
  readonly workType?: ReleaseWorkType;
}

const entryKey = (entry: Pick<PlanEntry, 'unitId' | 'section' | 'trade'>) =>
  `${entry.unitId}:${entry.section}:${entry.trade}`;

const SECTION_ORDER: readonly FieldSection[] = ['common', 'A', 'B', 'C', 'D', 'E'];

const PAINT_TASKS: readonly { key: ReleaseWorkType; label: string }[] = [
  { key: 'full', label: 'Full paint' },
  { key: 'touch-up', label: 'Touch-up' },
  { key: 'cut-in', label: 'Cut-in' },
  { key: 'full-cut-in', label: 'Full + cut-in' },
  { key: 'touch-up-cut-in', label: 'Touch-up + cut-in' },
];

const TASK_SHORT: Record<ReleaseWorkType, string> = {
  'cut-in': 'cut-in',
  full: 'full',
  'full-cut-in': 'full+cut',
  'heavy-clean': 'heavy',
  'touch-up': 'touch-up',
  'touch-up-cut-in': 'TU+cut',
};

const keyStatusOptions: readonly {
  label: string;
  value: DaySessionKeyStatus;
}[] = [
  { label: 'Keys received', value: 'yes' },
  { label: 'Not received', value: 'no' },
  { label: 'Partial / issue', value: 'partial-issue' },
];

export function StartDayScreen({
  configuration,
  contacts,
  crewOptions,
  currentDate,
  dayActive,
  onAddCrew,
  onAddToDay,
  onCancel,
  onStartDay,
  projectId,
  propertyName,
  roster,
  rosterUnits,
}: StartDayScreenProps) {
  const availableContacts = useMemo(() => contacts.filter((contact) =>
    contact.projectId === projectId && contact.activeForProject !== false),
  [contacts, projectId]);

  const [text, setText] = useState('');
  const [mode, setMode] = useState<StartDayMemoMode>('both');
  const [entries, setEntries] = useState<Map<string, PlanEntry>>(() => new Map());
  const [status, setStatus] = useState('');
  const [mismatches, setMismatches] = useState<readonly string[]>([]);
  const [taskPickerKey, setTaskPickerKey] = useState<string | null>(null);
  const [addQuery, setAddQuery] = useState('');
  const [contactId, setContactId] = useState(() =>
    availableContacts.some((contact) =>
      contact.id === configuration.defaultPropertyContactId)
      ? configuration.defaultPropertyContactId
      : availableContacts[0]?.id ?? '');
  const [keyStatus, setKeyStatus] = useState<DaySessionKeyStatus>('yes');
  const [crewIds, setCrewIds] = useState(() =>
    defaultActiveCrewIds(configuration, crewOptions));
  const [schedule, setSchedule] = useState(() =>
    resolveProjectDefaultSchedule(configuration));
  const [newCrewName, setNewCrewName] = useState<{ paint: string; clean: string }>(
    { clean: '', paint: '' },
  );
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textRef.current?.focus(); }, []);

  // Roster in the parser's shape. Beds/common come straight from the roster so
  // the parser can flag memo-vs-roster disagreements instead of guessing.
  const dictationUnits = useMemo(() => roster.units.map((unit) => ({
    beds: unit.applicableSections
      .filter((section) => section.id !== 'common')
      .map((section) => section.id as FieldSection),
    hasCommon: unit.applicableSections.some((section) => section.id === 'common'),
    id: unit.id,
    unitNumber: unit.unitNumber,
  })), [roster.units]);
  const unitById = useMemo(() =>
    new Map(roster.units.map((unit) => [unit.id, unit])), [roster.units]);

  const sectionSupportsTrade = (
    unitId: string,
    section: FieldSection,
    trade: FieldTrade,
  ) => {
    const unit = unitById.get(unitId);
    return unit?.applicableSections.some((candidate) =>
      candidate.id === section
      && candidate.trades.includes(trade === 'paint' ? 'Paint' : 'Clean')) ?? false;
  };

  const readList = () => {
    const result = parseStartDayMemo(text, dictationUnits, mode);
    if (result.rows.length === 0 && result.unmatched.length === 0) {
      setStatus('Nothing readable yet — one unit per line, e.g. "1404 — Común + A, B, C, D".');
      setMismatches(result.mismatches);
      return;
    }
    setEntries((current) => {
      const next = new Map(current);
      // Re-reading a unit+trade replaces its previous rooms — the box is the
      // source of truth for whatever it names; everything else is kept.
      for (const row of result.rows) {
        for (const key of [...next.keys()]) {
          const existing = next.get(key);
          if (existing && existing.unitId === row.unitId && existing.trade === row.trade) {
            next.delete(key);
          }
        }
      }
      for (const row of result.rows) {
        for (const room of row.rooms) {
          if (!sectionSupportsTrade(row.unitId, room.section, row.trade)) continue;
          const entry: PlanEntry = {
            section: room.section,
            trade: row.trade,
            unitId: row.unitId,
            unitNumber: row.unitNumber,
            ...(room.workType ? { workType: room.workType } : {}),
          };
          next.set(entryKey(entry), entry);
        }
      }
      return next;
    });
    const paintUnits = new Set(result.rows.filter((row) => row.trade === 'paint').map((row) => row.unitId)).size;
    const cleanUnits = new Set(result.rows.filter((row) => row.trade === 'clean').map((row) => row.unitId)).size;
    const roomCount = result.rows.reduce((sum, row) => sum + row.rooms.length, 0);
    setStatus([
      `Read ${paintUnits} paint + ${cleanUnits} clean unit${paintUnits + cleanUnits === 1 ? '' : 's'} (${roomCount} rooms).`,
      result.unmatched.length > 0 ? `Not in your roster: ${result.unmatched.join(', ')}.` : '',
      result.warnings.length > 0 ? result.warnings.join(' ') : '',
      'Check the list below, then Start Day.',
    ].filter(Boolean).join(' '));
    setMismatches(result.mismatches);
    setErrors([]);
  };

  const removeUnitTrade = (unitId: string, trade: FieldTrade) => {
    setEntries((current) => {
      const next = new Map(current);
      for (const key of [...next.keys()]) {
        const entry = next.get(key);
        if (entry && entry.unitId === unitId && entry.trade === trade) next.delete(key);
      }
      return next;
    });
    setErrors([]);
  };

  const setRoomTask = (entry: PlanEntry, workType: ReleaseWorkType | 'remove') => {
    setEntries((current) => {
      const next = new Map(current);
      if (workType === 'remove') next.delete(entryKey(entry));
      else next.set(entryKey(entry), { ...entry, workType });
      return next;
    });
    setTaskPickerKey(null);
    setErrors([]);
  };

  const addWholeUnit = (unit: PropertyRoster['units'][number], trade: FieldTrade) => {
    setEntries((current) => {
      const next = new Map(current);
      for (const section of unit.applicableSections) {
        if (!section.trades.includes(trade === 'paint' ? 'Paint' : 'Clean')) continue;
        const entry: PlanEntry = {
          section: section.id as FieldSection,
          trade,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          ...(trade === 'paint' ? { workType: 'full' as const } : {}),
        };
        if (!next.has(entryKey(entry))) next.set(entryKey(entry), entry);
      }
      return next;
    });
    setAddQuery('');
    setErrors([]);
  };

  // Group for display: trade → units (top floor first) → rooms (Común first).
  const grouped = useMemo(() => {
    const byTrade: Record<FieldTrade, Map<string, PlanEntry[]>> = {
      clean: new Map(),
      paint: new Map(),
    };
    for (const entry of entries.values()) {
      const bucket = byTrade[entry.trade];
      const list = bucket.get(entry.unitId) ?? [];
      list.push(entry);
      bucket.set(entry.unitId, list);
    }
    const sortUnits = (bucket: Map<string, PlanEntry[]>) =>
      [...bucket.entries()]
        .sort((left, right) => compareUnitTopFloorFirst(
          left[1][0].unitNumber,
          right[1][0].unitNumber,
        ))
        .map(([unitId, list]) => ({
          rooms: [...list].sort((a, b) =>
            SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)),
          unitId,
          unitNumber: list[0].unitNumber,
        }));
    return {
      clean: sortUnits(byTrade.clean),
      paint: sortUnits(byTrade.paint),
    };
  }, [entries]);

  const addMatches = useMemo(() => {
    const query = addQuery.trim().toLowerCase();
    if (!query) return [];
    return roster.units
      .filter((unit) => unit.unitNumber.toLowerCase().includes(query))
      .sort((left, right) => compareUnitTopFloorFirst(left.unitNumber, right.unitNumber))
      .slice(0, 8);
  }, [addQuery, roster.units]);

  const contactName = availableContacts.find((contact) =>
    contact.id === contactId)?.name ?? '';

  // Anything fixable inside the collapsed defaults panel opens it with the
  // error, so Los is never blocked by a control he can't see.
  const raiseErrors = (nextErrors: readonly string[]) => {
    setErrors(nextErrors);
    if (nextErrors.some((error) => /contact|crew|key|time/i.test(error))) {
      setDefaultsOpen(true);
    }
  };

  const submit = async () => {
    if (savingRef.current) return;
    if (entries.size === 0) {
      setErrors(['Read your list (or add a unit) before starting the day.']);
      return;
    }
    if (!contactName) {
      raiseErrors(['Pick the property contact under Today’s defaults before releasing.']);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setErrors([]);
    try {
      if (dayActive) {
        // The day is already running — this list joins today's release.
        const selections: ManualReleaseSelection[] = [...entries.values()].map(
          (entry) => ({
            section: entry.section,
            trade: entry.trade,
            unitId: entry.unitId,
            ...(entry.workType ? { workType: entry.workType } : {}),
          }),
        );
        const batch = createManualReleaseBatch({
          actor: 'Los',
          date: currentDate,
          id: createId('manual-release'),
          propertyContact: contactName,
          recordedAt: new Date().toISOString(),
          roster,
          selections,
        });
        const saved = await onAddToDay(batch);
        if (!saved) {
          setErrors(['The list was not saved. Nothing was added — retry.']);
        }
        return;
      }
      const tradeChoices = availableDailyReleaseTradeChoices(
        configuration.enabledTrades,
      );
      const roomPlan: RoomPlanEntry[] = [...entries.values()].map((entry) => ({
        section: entry.section,
        trade: entry.trade,
        unitId: entry.unitId,
        ...(entry.workType ? { workType: entry.workType } : {}),
      }));
      const prepared = prepareFastStartDaySubmission({
        activeCrewIdsByTrade: crewIds,
        contacts: availableContacts,
        crewOptions,
        date: currentDate,
        enabledTrades: configuration.enabledTrades,
        explicitStartConfirmation: true,
        keyStatus,
        morningNote: '',
        projectId,
        propertyContactId: contactId,
        propertyName,
        releaseDraft: {
          exceptions: [],
          explicitConfirmation: true,
          roomPlan,
          selectedUnitIds: [...new Set([...entries.values()].map((entry) => entry.unitId))],
          tradeChoice: tradeChoices.includes('Both') ? 'Both' : tradeChoices[0] ?? 'Both',
        },
        rosterUnits,
        schedule,
      });
      if (!prepared.ok) {
        raiseErrors(prepared.errors);
        return;
      }
      const saved = await onStartDay(prepared.submission);
      if (!saved) {
        setErrors([
          'Start Day was not saved. Nothing was started or released — retry, edit, or cancel.',
        ]);
      }
    } catch (caught) {
      setErrors([caught instanceof Error
        ? caught.message
        : 'Start Day could not be saved. Nothing was changed — retry.']);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const totalRooms = entries.size;
  const paintUnitCount = grouped.paint.length;
  const cleanUnitCount = grouped.clean.length;
  const prettyDate = (() => {
    const [y, m, d] = currentDate.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1)
      .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  const renderTradeGroup = (
    trade: FieldTrade,
    unitsInTrade: typeof grouped.paint,
  ) => (
    <section className="w2a21a-sd-group" key={trade}>
      <h2>
        {trade === 'paint' ? 'Paint' : 'Clean'} · {unitsInTrade.length} unit{unitsInTrade.length === 1 ? '' : 's'}
      </h2>
      <div className="w2a2-core-selected">
        {unitsInTrade.map((unit) => {
          const openRoom = unit.rooms.find((entry) =>
            entry.trade === 'paint' && entryKey(entry) === taskPickerKey);
          return (
            <div className="w2a2-core-selected__unit" key={`${trade}:${unit.unitId}`}>
              <div className="w2a2-core-selected__row">
                <strong>{unit.unitNumber}</strong>
                <button
                  aria-label={`Remove unit ${unit.unitNumber} from ${trade}`}
                  className="w2a2-core-selected__remove"
                  onClick={() => removeUnitTrade(unit.unitId, trade)}
                  type="button"
                >
                  Remove ✕
                </button>
                <span className="w2a2-core-selected__pills">
                  {unit.rooms.map((entry) => {
                    const label = entry.section === 'common' ? 'Común' : entry.section;
                    const kind = entry.trade === 'clean'
                      ? entry.workType === 'heavy-clean' ? 'heavy-clean' : 'clean'
                      : entry.workType ?? 'full';
                    const key = entryKey(entry);
                    const isPaint = entry.trade === 'paint';
                    const taskLabel = entry.trade === 'clean'
                      ? entry.workType === 'heavy-clean' ? 'heavy' : 'clean'
                      : TASK_SHORT[entry.workType ?? 'full'];
                    return (
                      <button
                        aria-expanded={isPaint ? taskPickerKey === key : undefined}
                        className={`w2a2-core-typepill is-${kind}${taskPickerKey === key ? ' is-open' : ''}`}
                        key={key}
                        onClick={() => {
                          if (isPaint) {
                            setTaskPickerKey((current) => (current === key ? null : key));
                          } else {
                            setRoomTask(entry, 'remove');
                          }
                        }}
                        type="button"
                      >
                        {label} · {taskLabel}{isPaint ? ' ▾' : ''}
                      </button>
                    );
                  })}
                </span>
              </div>
              {openRoom ? (
                <div className="w2a2-core-taskpicker">
                  <span className="w2a2-core-taskpicker__for">
                    {openRoom.section === 'common' ? 'Común' : openRoom.section}:
                  </span>
                  {PAINT_TASKS.map((task) => (
                    <button
                      className={(openRoom.workType ?? 'full') === task.key ? 'is-current' : undefined}
                      key={task.key}
                      onClick={() => setRoomTask(openRoom, task.key)}
                      type="button"
                    >
                      {task.label}
                    </button>
                  ))}
                  <button
                    className="is-remove"
                    onClick={() => setRoomTask(openRoom, 'remove')}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <section className="w2a21a-start-day w2a21a-sd" data-start-day-screen="true">
      <header className="w2a21a-start-day__header">
        <button
          aria-label="Cancel and go back"
          className="w2a21a-start-day__back"
          onClick={onCancel}
          type="button"
        >
          ← Back
        </button>
        <h1>{dayActive ? 'Add to today' : 'Start Day'}</h1>
        <p>{prettyDate} · paste or dictate → check it → {dayActive ? 'add' : 'Start Day'}</p>
      </header>

      <div className="w2a21a-start-day__body w2a21a-sd__body">
        <section className="w2a2-core-intake w2a2-core-intake--front">
          <div className="w2a2-core-quickgrid__scope w2a21a-sd__modes" role="group" aria-label="What is in the box">
            {([['both', 'Paint + Clean'], ['paint', 'Paint list'], ['clean', 'Clean list']] as const)
              .map(([value, label]) => (
                <button
                  aria-pressed={mode === value}
                  className={mode === value ? 'is-selected' : undefined}
                  key={value}
                  onClick={() => setMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
          </div>
          <label>
            <span className="w2a2-core-intake__label">
              Your morning list — one unit per line
            </span>
            <textarea
              onChange={(event) => setText(event.target.value)}
              placeholder={'Paint:\n1002 — A: recorte, D: retoque\nClean:\n1404 — Común + A, B, C, D\n1209 — Estudio'}
              ref={textRef}
              rows={6}
              value={text}
            />
          </label>
          <div className="w2a2-core-intake__actions">
            <button
              className="is-primary"
              disabled={!text.trim()}
              onClick={readList}
              type="button"
            >
              Read my list
            </button>
          </div>
          {status ? (
            <p aria-live="polite" className="w2a2-core-intake__status">{status}</p>
          ) : null}
          {mismatches.length > 0 ? (
            <div className="w2a2-core-intake__mismatch" role="alert">
              <strong>⚠︎ Check these — the list and the roster disagree:</strong>
              <ul>
                {mismatches.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        {entries.size > 0 ? (
          <>
            <p className="w2a21a-sd__summary" aria-live="polite">
              <strong>{paintUnitCount} paint · {cleanUnitCount} clean units · {totalRooms} rooms.</strong>{' '}
              Tap a paint room to change its task. Tap a clean room to remove it.
            </p>
            {grouped.paint.length > 0 ? renderTradeGroup('paint', grouped.paint) : null}
            {grouped.clean.length > 0 ? renderTradeGroup('clean', grouped.clean) : null}
          </>
        ) : null}

        <section className="w2a21a-sd__add">
          <label>
            <span className="w2a2-core-intake__label">Add a unit by number</span>
            <input
              autoComplete="off"
              inputMode="numeric"
              onChange={(event) => setAddQuery(event.target.value)}
              placeholder="Type a unit number"
              value={addQuery}
            />
          </label>
          {addMatches.length > 0 ? (
            <div className="w2a21a-sd__add-matches">
              {addMatches.map((unit) => (
                <span className="w2a21a-sd__add-unit" key={unit.id}>
                  <strong>{unit.unitNumber}</strong>
                  <button onClick={() => addWholeUnit(unit, 'paint')} type="button">
                    + Paint
                  </button>
                  <button onClick={() => addWholeUnit(unit, 'clean')} type="button">
                    + Clean
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <details
          className="w2a21a-sd__defaults"
          onToggle={(event) => setDefaultsOpen(event.currentTarget.open)}
          open={defaultsOpen}
        >
          <summary>
            Today’s defaults — {contactName || 'no contact'}
            {dayActive
              ? ''
              : ` · ${keyStatusOptions.find((option) => option.value === keyStatus)?.label.toLowerCase() ?? ''} · ${crewIds.paint.length} paint / ${crewIds.clean.length} clean crews`}
          </summary>
          <div className="w2a21a-sd__defaults-body">
            <div className="w2a21a-sd__chips" role="group" aria-label="Property contact">
              {availableContacts.map((contact) => (
                <button
                  aria-pressed={contactId === contact.id}
                  className={contactId === contact.id ? 'is-selected' : undefined}
                  key={contact.id}
                  onClick={() => setContactId(contact.id)}
                  type="button"
                >
                  {contact.name}
                </button>
              ))}
            </div>
            {!dayActive ? (
              <>
                <div className="w2a21a-sd__chips" role="group" aria-label="Keys">
                  {keyStatusOptions.map((option) => (
                    <button
                      aria-pressed={keyStatus === option.value}
                      className={keyStatus === option.value ? 'is-selected' : undefined}
                      key={option.value}
                      onClick={() => setKeyStatus(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {(['paint', 'clean'] as const)
                  .filter((trade) => configuration.enabledTrades[trade])
                  .map((trade) => (
                    <fieldset className="w2a21a-sd__crews" key={trade}>
                      <legend>{trade === 'paint' ? 'Paint' : 'Clean'} crews today</legend>
                      {crewOptions
                        .filter((crew) => crew.trade === trade && crew.active !== false)
                        .map((crew) => (
                          <label key={crew.id}>
                            <input
                              checked={crewIds[trade].includes(crew.id)}
                              onChange={() => setCrewIds((current) => ({
                                ...current,
                                [trade]: current[trade].includes(crew.id)
                                  ? current[trade].filter((id) => id !== crew.id)
                                  : [...current[trade], crew.id],
                              }))}
                              type="checkbox"
                            />
                            {crew.name}
                          </label>
                        ))}
                      {onAddCrew ? (
                        <span className="w2a21a-sd__add-crew">
                          <input
                            aria-label={`Add a ${trade} crew`}
                            onChange={(event) => setNewCrewName((current) => ({
                              ...current,
                              [trade]: event.target.value,
                            }))}
                            placeholder="Add crew"
                            type="text"
                            value={newCrewName[trade]}
                          />
                          <button
                            disabled={!newCrewName[trade].trim()}
                            onClick={() => {
                              const name = newCrewName[trade].trim();
                              if (!name || !onAddCrew) return;
                              const id = onAddCrew(name, trade);
                              setCrewIds((current) => ({
                                ...current,
                                [trade]: [...current[trade], id],
                              }));
                              setNewCrewName((current) => ({ ...current, [trade]: '' }));
                            }}
                            type="button"
                          >
                            Add
                          </button>
                        </span>
                      ) : null}
                    </fieldset>
                  ))}
                <div className="w2a21a-sd__schedule">
                  <label>
                    Work start
                    <input
                      onChange={(event) => setSchedule((current) => ({
                        ...current,
                        workStartTime: event.target.value,
                      }))}
                      type="time"
                      value={schedule.workStartTime}
                    />
                  </label>
                  <label>
                    Work end
                    <input
                      onChange={(event) => setSchedule((current) => ({
                        ...current,
                        workEndTime: event.target.value,
                      }))}
                      type="time"
                      value={schedule.workEndTime}
                    />
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </details>

        {errors.length > 0 ? (
          <div className="w2a21a-setup__errors" role="alert">
            <strong>{dayActive ? 'Nothing was added.' : 'Start Day was not saved.'}</strong>
            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        ) : null}

        <button
          className="w2a21a-setup__primary w2a21a-sd__start"
          disabled={saving || entries.size === 0}
          onClick={() => void submit()}
          type="button"
        >
          {saving
            ? 'Saving…'
            : dayActive
              ? `Add ${totalRooms} room${totalRooms === 1 ? '' : 's'} to today`
              : `Start Day — ${paintUnitCount} paint · ${cleanUnitCount} clean`}
        </button>
        <p className="w2a21a-setup__supporting">
          Nothing is released until you press the button. Paper stays authoritative.
        </p>
      </div>
    </section>
  );
}
