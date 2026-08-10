import { ArrowLeft, Camera, Check, MessageSquareText, Search } from 'lucide-react';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createId } from '../../lib/constants';
import {
  imageFileToIntakeSource,
  intakeEnabled,
  requestIntake,
  type IntakeRow,
} from '../../lib/intakeClient';
import type {
  DailyReleaseBatch,
  FieldSection,
  FieldTrade,
  ReleaseWorkType,
} from '../../types';
import type { PropertyRoster } from '../wave2a2-track-b';
import {
  createManualReleaseBatch,
  type ManualReleaseSelection,
} from './appDataAdapters';
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
import { parseStartDayMemo } from './startDayParse';
import './acceptedCore.css';

interface ManualReleaseReviewProps {
  actor: string;
  contacts?: readonly string[];
  onAttachNotes?: (notes: readonly { unitId: string; text: string }[]) => void;
  currentDate: string;
  onBack: () => void;
  onConfirm: (batch: DailyReleaseBatch) => boolean | Promise<boolean>;
  roster: PropertyRoster;
  unavailableReason?: string;
}

const MAX_VISIBLE_UNITS = 80;

const selectionKey = (selection: ManualReleaseSelection) =>
  `${selection.unitId}:${selection.section}:${selection.trade}`;

const toFieldTrade = (trade: 'Paint' | 'Clean'): FieldTrade =>
  trade === 'Paint' ? 'paint' : 'clean';

export function ManualReleaseReview({
  actor,
  contacts,
  onAttachNotes,
  currentDate,
  onBack,
  onConfirm,
  roster,
  unavailableReason,
}: ManualReleaseReviewProps) {
  const [query, setQuery] = useState('');
  // Zero-typing default: Joseph confirms almost every release.
  const [propertyContact, setPropertyContact] = useState(() => contacts?.[0] ?? '');
  const [selected, setSelected] = useState<Map<string, ManualReleaseSelection>>(
    () => new Map(),
  );
  const [confirmed, setConfirmed] = useState(false);
  // Joseph releases paint first and cleans follow later, so the quick grid
  // needs a per-trade scope — one tap must not release the other trade.
  const [tradeScope, setTradeScope] = useState<'both' | 'Paint' | 'Clean'>(() => {
    try {
      const preset = window.localStorage.getItem('turn-os:quickadd-trade');
      window.localStorage.removeItem('turn-os:quickadd-trade');
      return preset === 'paint' ? 'Paint' : preset === 'clean' ? 'Clean' : 'both';
    } catch {
      return 'both';
    }
  });
  // Searching filters the SAME tap grid; the per-section checkbox view is an
  // explicit choice, never a surprise interface swap.
  const [sectionMode, setSectionMode] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const pendingBatchRef = useRef<DailyReleaseBatch | undefined>(undefined);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState('');
  const [intakeMismatches, setIntakeMismatches] = useState<string[]>([]);
  const [intakeMessage, setIntakeMessage] = useState(() => {
    try {
      const prefill = window.localStorage.getItem('turn-os:intake-prefill') ?? '';
      window.localStorage.removeItem('turn-os:intake-prefill');
      return prefill;
    } catch {
      return '';
    }
  });
  const intakeFileRef = useRef<HTMLInputElement>(null);
  const intakeTextRef = useRef<HTMLTextAreaElement>(null);
  // "Paste your memo" front door: opened straight onto the paste box so Los can
  // drop his whole raw memo (paint + clean together) and let the reader split it.
  const memoMode = useRef<boolean>(false);
  if (memoMode.current === false) {
    try {
      if (window.localStorage.getItem('turn-os:intake-memo') === '1') {
        window.localStorage.removeItem('turn-os:intake-memo');
        memoMode.current = true;
      }
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (memoMode.current) intakeTextRef.current?.focus();
  }, []);

  const importNotesRef = useRef<Map<string, string>>(new Map());
  const applyIntakeRows = (rows: IntakeRow[], uncertainties: string[]) => {
    const unitByNumber = new Map(roster.units.map((unit) =>
      [unit.unitNumber.toLocaleLowerCase(), unit]));
    const unmatched: string[] = [];
    const mismatches: string[] = [];
    let added = 0;
    setSelected((current) => {
      const next = new Map(current);
      for (const row of rows) {
        const unit = unitByNumber.get(row.unitNumber.trim().toLocaleLowerCase());
        if (!unit) {
          unmatched.push(row.unitNumber);
          continue;
        }
        // Misread catch — the "confirm with me" trust check for Start Day.
        const bedIds = unit.applicableSections
          .filter((section) => section.id !== 'common').map((section) => section.id);
        const rosterBeds = bedIds.length;
        const has = unit.applicableSections
          .map((section) => (section.id === 'common' ? 'Común' : section.id)).join(', ');
        // (a) The reader read a different unit SIZE than the roster — e.g. it saw a
        // studio but the roster has 3 bedrooms. This is the exact case Los hit.
        if (typeof row.bedCount === 'number' && row.bedCount !== rosterBeds) {
          mismatches.push(`${row.unitNumber}: the reader saw ${row.bedCount === 0 ? 'a studio' : `${row.bedCount} bedroom${row.bedCount === 1 ? '' : 's'}`}, but the roster has ${rosterBeds === 0 ? 'a studio' : `${rosterBeds} (${bedIds.join(', ')})`}. Which is right?`);
        }
        // (b) Rooms Los listed that this unit doesn't have at all — dropped, so flag.
        const unitRoomIds = new Set(unit.applicableSections.map((section) => section.id));
        const missingRooms = row.sections.filter((section) => !unitRoomIds.has(section));
        if (missingRooms.length > 0) {
          mismatches.push(`${row.unitNumber}: you listed ${missingRooms.map((room) => room === 'common' ? 'Común' : room).join(', ')} but this unit has ${has || 'no rooms'} — skipped. Is the roster right?`);
        }
        if (row.note?.trim()) {
          // Anything the reader can't turn into a pill (color change, key
          // issues, special instructions) rides along as a unit note.
          importNotesRef.current.set(unit.id, row.note.trim());
        }
        // Joseph hands SEPARATE paint and clean sheets. When Los has picked
        // Paint or Clean above, the photo IS that one trade — never cross-tag
        // the other. Only 'both' falls back to whatever the reader guessed.
        const scopeTrade = tradeScope === 'Paint'
          ? 'paint'
          : tradeScope === 'Clean' ? 'clean' : null;
        const trades = scopeTrade
          ? [scopeTrade]
          : row.trades.length > 0 ? row.trades : ['paint', 'clean'];
        for (const trade of trades) {
          for (const section of unit.applicableSections) {
            if (!section.trades.includes(trade === 'paint' ? 'Paint' : 'Clean')) continue;
            if (
              row.sections.length > 0
              && !row.sections.includes(section.id as IntakeRow['sections'][number])
            ) {
              continue;
            }
            const sectionId = section.id as FieldSection;
            const workType = trade === 'paint'
              ? row.cutInSections?.includes(sectionId as IntakeRow['sections'][number])
                ? 'cut-in' as const
                : row.touchUpSections?.includes(sectionId as IntakeRow['sections'][number])
                  ? 'touch-up' as const
                  : 'full' as const
              : undefined;
            const selection: ManualReleaseSelection = {
              section: sectionId,
              trade: trade as FieldTrade,
              unitId: unit.id,
              ...(workType ? { workType } : {}),
            };
            const key = selectionKey(selection);
            if (!next.has(key)) {
              next.set(key, selection);
              added += 1;
            }
          }
        }
      }
      return next;
    });
    pendingBatchRef.current = undefined;
    setError('');
    const notes = [
      `${added} section${added === 1 ? '' : 's'} pre-selected from the import.`,
      unmatched.length > 0
        ? `Not in your roster (skipped): ${unmatched.join(', ')}.`
        : '',
      uncertainties.length > 0 ? `Check: ${uncertainties.join(' ')}` : '',
      'Nothing is released until you review and confirm below.',
    ].filter(Boolean);
    setIntakeStatus(notes.join(' '));
    setIntakeMismatches(mismatches);
  };

  const runIntake = async (
    source:
      | { type: 'image'; mediaType: string; data: string }
      | { type: 'text'; text: string },
  ) => {
    setIntakeBusy(true);
    setIntakeStatus('Reading the release…');
    try {
      const result = await requestIntake({
        kind: 'release',
        rosterUnitNumbers: roster.units.map((unit) => unit.unitNumber),
        source,
      });
      applyIntakeRows(result.rows, result.uncertainties);
    } catch (caught) {
      setIntakeStatus(caught instanceof Error
        ? caught.message
        : 'The import reader failed. Use the roster below.');
    } finally {
      setIntakeBusy(false);
    }
  };

  // Reliable path (no AI): the same deterministic Start Day reader parses the
  // pasted memo locally — instant, offline, no sign-in — for every scope,
  // 'both' included (headers or per-line task words split paint from clean,
  // and clean units always get their common). Returns false so the caller can
  // fall back to the AI reader only for input the rules can't read at all.
  const applyDictation = (text: string): boolean => {
    if (!text.trim()) return false;
    const mode = tradeScope === 'Paint' ? 'paint' : tradeScope === 'Clean' ? 'clean' : 'both';
    const units = roster.units.map((unit) => ({
      beds: unit.applicableSections
        .filter((section) => section.id !== 'common')
        .map((section) => section.id as FieldSection),
      hasCommon: unit.applicableSections.some((section) => section.id === 'common'),
      id: unit.id,
      unitNumber: unit.unitNumber,
    }));
    const result = parseStartDayMemo(text, units, mode);
    if (result.rows.length === 0) return false;
    const unitTradesById = new Map(roster.units.map((unit) => [
      unit.id,
      new Map(unit.applicableSections.map((section) =>
        [section.id, section.trades] as const)),
    ]));
    let added = 0;
    setSelected((current) => {
      const next = new Map(current);
      // Re-reading a unit+trade replaces its previous rooms — the box is the
      // source of truth for whatever it names.
      for (const row of result.rows) {
        for (const key of [...next.keys()]) {
          const existing = next.get(key);
          if (existing && existing.unitId === row.unitId && existing.trade === row.trade) {
            next.delete(key);
          }
        }
      }
      for (const row of result.rows) {
        for (const part of row.rooms) {
          const trades = unitTradesById.get(row.unitId)?.get(part.section);
          if (!trades?.includes(row.trade === 'paint' ? 'Paint' : 'Clean')) continue;
          const selection: ManualReleaseSelection = {
            section: part.section,
            trade: row.trade,
            unitId: row.unitId,
            ...(part.workType ? { workType: part.workType } : {}),
          };
          next.set(selectionKey(selection), selection);
          added += 1;
        }
      }
      return next;
    });
    const unitCount = new Set(result.rows.map((row) => row.unitId)).size;
    setIntakeStatus([
      `${unitCount} unit${unitCount === 1 ? '' : 's'} read (${added} room${added === 1 ? '' : 's'}).`,
      result.unmatched.length > 0 ? `Not in your roster: ${result.unmatched.join(', ')}.` : '',
      result.warnings.length > 0 ? result.warnings.join(' ') : '',
      'Review below — nothing releases until you confirm.',
    ].filter(Boolean).join(' '));
    setIntakeMismatches([...result.mismatches]);
    pendingBatchRef.current = undefined;
    setError('');
    return true;
  };

  const matchingUnits = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? roster.units.filter((unit) =>
        [
          unit.unitNumber,
          unit.building,
          unit.floor,
          unit.unitType,
        ].some((value) => value?.toLocaleLowerCase().includes(normalized)))
      : roster.units;
    return {
      total: matches.length,
      visible: matches.slice(0, MAX_VISIBLE_UNITS),
    };
  }, [query, roster.units]);

  const toggle = (selection: ManualReleaseSelection) => {
    const key = selectionKey(selection);
    setSelected((current) => {
      const next = new Map(current);
      const existing = next.get(key);
      if (!existing) {
        next.set(key, { ...selection, workType: 'full' });
      } else if (selection.trade !== 'paint') {
        next.delete(key);
      } else if ((existing.workType ?? 'full') === 'full') {
        next.set(key, { ...existing, workType: 'touch-up' });
      } else if (existing.workType === 'touch-up') {
        next.set(key, { ...existing, workType: 'cut-in' });
      } else if (existing.workType === 'cut-in') {
        next.set(key, { ...existing, workType: 'full-cut-in' });
      } else {
        next.delete(key);
      }
      return next;
    });
    pendingBatchRef.current = undefined;
    setError('');
  };

  // Which room's task PICKER is open (tap a room → choose the task, not cycle).
  const [taskPickerKey, setTaskPickerKey] = useState<string | null>(null);
  const setRoomTask = (
    selection: ManualReleaseSelection,
    workType: ReleaseWorkType | 'remove',
  ) => {
    const key = selectionKey(selection);
    setSelected((current) => {
      const next = new Map(current);
      if (workType === 'remove') next.delete(key);
      else next.set(key, { ...selection, workType });
      return next;
    });
    setTaskPickerKey(null);
    pendingBatchRef.current = undefined;
    setError('');
  };
  const PAINT_TASKS: readonly { key: ReleaseWorkType; label: string }[] = [
    { key: 'full', label: 'Full paint' },
    { key: 'touch-up', label: 'Touch-up' },
    { key: 'cut-in', label: 'Cut-in' },
    { key: 'full-cut-in', label: 'Full + cut-in' },
    { key: 'touch-up-cut-in', label: 'Touch-up + cut-in' },
  ];

  const submit = async () => {
    if (submittingRef.current) return;
    if (unavailableReason) {
      setError(unavailableReason);
      return;
    }
    if (!propertyContact.trim()) {
      setError('Record the property contact who supplied or confirmed this release.');
      return;
    }
    if (!confirmed) {
      setError('Confirm that every selected item came from the property release.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const batch = pendingBatchRef.current ?? createManualReleaseBatch({
        actor,
        date: currentDate,
        id: createId('manual-release'),
        propertyContact,
        recordedAt: new Date().toISOString(),
        roster,
        selections: [...selected.values()],
      });
      pendingBatchRef.current = batch;
      const saved = await onConfirm(batch);
      if (saved && onAttachNotes && importNotesRef.current.size > 0) {
        const confirmedUnitIds = new Set(batch.items.map((item) => item.unitId));
        const toAttach = [...importNotesRef.current.entries()]
          .filter(([unitId]) => confirmedUnitIds.has(unitId))
          .map(([unitId, text]) => ({ text, unitId }));
        if (toAttach.length > 0) onAttachNotes(toAttach);
        importNotesRef.current = new Map();
      }
      if (!saved) {
        throw new Error('Released work was not durably saved. Retry or edit the release.');
      }
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Manual release could not be saved.');
    }
  };

  return (
    <section
      className="w2a2-core-page w2a2-core-release"
      data-testid="manual-release-review"
    >
      <header className="w2a2-core-page__header">
        <button
          aria-label="Back to Today"
          className="w2a2-core-icon-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={22} />
        </button>
        <div>
          <h1>Quick add units</h1>
          <p>{(() => {
            const [y, m, d] = currentDate.split('-').map(Number);
            return new Date(y, (m ?? 1) - 1, d ?? 1)
              .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          })()} · personal Turn OS copy</p>
        </div>
      </header>

      <div className="w2a2-core-page__scroll" data-turn-scroll-region="primary">
        <p className="w2a2-core-caption w2a2-core-boundary-line" role="note">
          Record exactly what the property released — your review decides.
          {intakeEnabled()
            ? ''
            : ' This does not read a file, photo, paper mark, or official system.'}
        </p>

        {unavailableReason ? (
          <p className="w2a2-core-error" role="alert">{unavailableReason}</p>
        ) : null}

        {intakeEnabled() ? (
          <section className="w2a2-core-intake w2a2-core-intake--front">
            <label>
              <span className="w2a2-core-intake__label">
                <MessageSquareText aria-hidden="true" size={15} /> Paste or dictate your memo
                {tradeScope === 'both'
                  ? ' — paint and clean together, I’ll split them and you confirm'
                  : ` — tap the 🎤 on your keyboard, read your ${tradeScope} list`}
              </span>
              <textarea
                onChange={(event) => setIntakeMessage(event.target.value)}
                placeholder={tradeScope === 'both'
                  ? 'Paste your whole memo — e.g. paint 1806 A B cut in, 1707 A touch cut… clean 1404 common A B C D…'
                  : '1806 A B cut in, 1707 A touch cut, 800 full unit'}
                ref={intakeTextRef}
                rows={memoMode.current ? 5 : 2}
                value={intakeMessage}
              />
            </label>
            <div className="w2a2-core-intake__actions">
              <button
                className="is-primary"
                disabled={intakeBusy || !intakeMessage.trim()}
                onClick={() => {
                  // Reliable local parse first (Paint/Clean picked); AI reader only
                  // as the fallback for 'both' or input the rules can't read.
                  if (!applyDictation(intakeMessage)) {
                    void runIntake({ text: intakeMessage, type: 'text' });
                  }
                }}
                type="button"
              >
                {intakeBusy ? 'Reading…' : 'Read my list'}
              </button>
              <button
                disabled={intakeBusy}
                onClick={() => intakeFileRef.current?.click()}
                type="button"
              >
                <Camera aria-hidden="true" size={17} />
                From photo
              </button>
              <input
                accept="image/*"
                aria-label="Choose a TurnBoard photo"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  void imageFileToIntakeSource(file)
                    .then((source) => runIntake(source))
                    .catch(() => setIntakeStatus('That photo could not be read.'));
                }}
                ref={intakeFileRef}
                type="file"
              />
            </div>
            {intakeStatus ? (
              <p aria-live="polite" className="w2a2-core-intake__status">{intakeStatus}</p>
            ) : null}
            {intakeMismatches.length > 0 ? (
              <div className="w2a2-core-intake__mismatch" role="alert">
                <strong>⚠︎ Check these — rooms didn’t match the unit:</strong>
                <ul>
                  {intakeMismatches.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <label className="w2a2-core-field">
          <span>Property contact</span>
          {contacts && contacts.length > 0 ? (
            <span className="w2a2-core-contact-picks">
              {contacts.map((name) => (
                <button
                  aria-pressed={propertyContact === name}
                  className={propertyContact === name ? 'is-selected' : undefined}
                  key={name}
                  onClick={() => {
                    setPropertyContact(name);
                    setError('');
                  }}
                  type="button"
                >
                  {name}
                </button>
              ))}
            </span>
          ) : null}
          <input
            autoComplete="off"
            onChange={(event) => {
              setPropertyContact(event.target.value);
              pendingBatchRef.current = undefined;
              setError('');
            }}
            placeholder="Who confirmed today’s release?"
            value={propertyContact}
          />
        </label>

        <label className="w2a2-core-search">
          <Search aria-hidden="true" size={19} />
          <span className="sr-only">Search existing roster</span>
          <input
            autoComplete="off"
            inputMode="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search existing roster"
            value={query}
          />
        </label>

        <div className="w2a2-core-release__summary" aria-live="polite">
          <span>{matchingUnits.total} matching Units</span>
          <strong>{selected.size} section{selected.size === 1 ? '' : 's'} selected</strong>
        </div>

        {!sectionMode ? (
          <div className="w2a2-core-quickgrid" aria-label="Tap Units the property released">
            <p className="w2a2-core-caption">
              Tap the Units Joseph released — one tap selects the whole Unit
              for the trades below. Type a number above to jump to it.
            </p>
            <div className="w2a2-core-quickgrid__scope" role="group" aria-label="Trades to release">
              {([['both', 'Paint + Clean'], ['Paint', 'Paint only'], ['Clean', 'Clean only']] as const)
                .map(([value, label]) => (
                  <button
                    aria-pressed={tradeScope === value}
                    className={tradeScope === value ? 'is-selected' : undefined}
                    key={value}
                    onClick={() => setTradeScope(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
            </div>
            {selected.size > 0 ? (
              <div className="w2a2-core-selected">
                <p className="w2a2-core-caption">
                  Selected — tap a paint room to pick its task; tap a clean room to remove it.
                </p>
                {(() => {
                  const byUnit = new Map<string, ManualReleaseSelection[]>();
                  for (const selection of selected.values()) {
                    const list = byUnit.get(selection.unitId) ?? [];
                    list.push(selection);
                    byUnit.set(selection.unitId, list);
                  }
                  const numberOf = (unitId: string) =>
                    roster.units.find((unit) => unit.id === unitId)?.unitNumber ?? unitId;
                  return [...byUnit.entries()]
                    .sort((left, right) => compareUnitTopFloorFirst(numberOf(left[0]), numberOf(right[0])))
                    .map(([unitId, list]) => {
                      const rooms = [...list]
                        .sort((a, b) => `${a.trade}${a.section}`.localeCompare(`${b.trade}${b.section}`));
                      const openRoom = rooms.find((selection) =>
                        selection.trade === 'paint' && selectionKey(selection) === taskPickerKey);
                      return (
                        <div className="w2a2-core-selected__unit" key={unitId}>
                          <div className="w2a2-core-selected__row">
                            <strong>{numberOf(unitId)}</strong>
                            <button
                              aria-label={`Remove unit ${numberOf(unitId)}`}
                              className="w2a2-core-selected__remove"
                              onClick={() => setSelected((current) => {
                                const next = new Map(current);
                                for (const key of [...next.keys()]) {
                                  if (next.get(key)?.unitId === unitId) next.delete(key);
                                }
                                return next;
                              })}
                              type="button"
                            >
                              Remove ✕
                            </button>
                            <span className="w2a2-core-selected__pills">
                              {rooms.map((selection) => {
                                const label = selection.section === 'common' ? 'Common' : selection.section;
                                const kind = selection.trade === 'clean'
                                  ? 'clean'
                                  : selection.workType ?? 'full';
                                const kindLabel = selection.trade === 'clean'
                                  ? 'clean'
                                  : kind === 'full' ? 'full'
                                    : kind === 'full-cut-in' ? 'full+cut'
                                      : kind === 'touch-up-cut-in' ? 'TU+cut'
                                        : kind === 'touch-up' ? 'touch-up' : 'cut-in';
                                const key = selectionKey(selection);
                                const isPaint = selection.trade === 'paint';
                                return (
                                  <button
                                    aria-expanded={isPaint ? taskPickerKey === key : undefined}
                                    className={`w2a2-core-typepill is-${kind}${taskPickerKey === key ? ' is-open' : ''}`}
                                    key={key}
                                    onClick={() => {
                                      if (isPaint) {
                                        setTaskPickerKey((current) => (current === key ? null : key));
                                      } else {
                                        setRoomTask(selection, 'remove');
                                      }
                                    }}
                                    type="button"
                                  >
                                    {label} · {kindLabel}{isPaint ? ' ▾' : ''}
                                  </button>
                                );
                              })}
                            </span>
                          </div>
                          {openRoom ? (
                            <div className="w2a2-core-taskpicker">
                              <span className="w2a2-core-taskpicker__for">
                                {openRoom.section === 'common' ? 'Common' : openRoom.section}:
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
                    });
                })()}
              </div>
            ) : null}
            <button
              className="w2a2-core-sectionmode-toggle"
              onClick={() => setSectionMode(true)}
              type="button"
            >
              Need part of a unit? Pick sections instead
            </button>
            <div className="w2a2-core-quickgrid__units">
              {[...roster.units]
                .filter((unit) => !query.trim()
                  || unit.unitNumber.toLowerCase().includes(query.trim().toLowerCase()))
                .sort((left, right) =>
                  compareUnitTopFloorFirst(left.unitNumber, right.unitNumber))
                .map((unit) => {
                  const unitSelections = unit.applicableSections.flatMap((section) =>
                    section.trades
                      .filter((trade) => tradeScope === 'both' || trade === tradeScope)
                      .map((trade) => ({
                        section: section.id as FieldSection,
                        trade: toFieldTrade(trade),
                        unitId: unit.id,
                      })));
                  const allOn = unitSelections.length > 0
                    && unitSelections.every((candidate) => selected.has(selectionKey(candidate)));
                  return (
                    <button
                      aria-pressed={allOn}
                      className={allOn ? 'is-selected' : undefined}
                      key={unit.id}
                      onClick={() => {
                        setSelected((current) => {
                          const next = new Map(current);
                          if (allOn) {
                            for (const candidate of unitSelections) {
                              next.delete(selectionKey(candidate));
                            }
                          } else {
                            for (const candidate of unitSelections) {
                              if (!next.has(selectionKey(candidate))) {
                                next.set(selectionKey(candidate), { ...candidate, workType: 'full' });
                              }
                            }
                          }
                          return next;
                        });
                        pendingBatchRef.current = undefined;
                        setError('');
                      }}
                      type="button"
                    >
                      {unit.unitNumber}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
        <div className="w2a2-core-release__units">
          <button
            className="w2a2-core-sectionmode-toggle"
            onClick={() => setSectionMode(false)}
            type="button"
          >
            ← Back to the tap grid (whole units)
          </button>
          {matchingUnits.visible.map((unit) => (
            <section className="w2a2-core-release__unit" key={unit.id}>
              <header>
                <div>
                  <strong>Unit {unit.unitNumber}</strong>
                  <span>
                    {[unit.building, unit.floor, unit.unitType].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </header>
              <div className="w2a2-core-release__sections">
                {unit.applicableSections.flatMap((section) =>
                  section.trades.map((trade) => {
                    const selection = {
                      section: section.id as FieldSection,
                      trade: toFieldTrade(trade),
                      unitId: unit.id,
                    };
                    const key = selectionKey(selection);
                    const checked = selected.has(key);
                    return (
                      <label className={checked ? 'is-selected' : undefined} key={key}>
                        <input
                          checked={checked}
                          onChange={() => toggle(selection)}
                          type="checkbox"
                        />
                        <span>{section.label}</span>
                        <small>{trade}</small>
                        <Check aria-hidden="true" size={17} />
                      </label>
                    );
                  }))}
              </div>
            </section>
          ))}
        </div>
        )}

        {matchingUnits.total > matchingUnits.visible.length ? (
          <p className="w2a2-core-caption">
            Showing the first {MAX_VISIBLE_UNITS} matches. Narrow the search to review
            another Unit.
          </p>
        ) : null}

        <label className="w2a2-core-confirm">
          <input
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setError('');
            }}
            type="checkbox"
          />
          <span>
            I reviewed these selections against the property’s current release.
            Paper remains authoritative.
          </span>
        </label>

        {selected.size > 0 ? (
          <p className="w2a2-core-caption w2a2-core-proof-reminder">
            Tony's rule: submit proof whenever you receive units.{' '}
            <a
              href={OFFICIAL_PDS_LINKS.find((link) => link.id === 'backup-safety')?.url}
              rel="noreferrer"
              target="_blank"
            >
              Open the Backup Safety Submission Box
            </a>
            {' '}— the Home card keeps the copy-paste summary ready after you confirm.
          </p>
        ) : null}

        {error ? <p className="w2a2-core-error" role="alert">{error}</p> : null}

        <button
          className="w2a2-core-primary"
          disabled={Boolean(unavailableReason) || selected.size === 0 || submitting}
          onClick={() => void submit()}
          type="button"
        >
          {submitting
            ? 'Confirming…'
            : pendingBatchRef.current
              ? 'Retry personal release'
              : 'Confirm personal release'}
        </button>
        <p className="w2a2-core-caption">
          This creates no payroll, approval, property acceptance, or official paper mark.
        </p>
      </div>
    </section>
  );
}
