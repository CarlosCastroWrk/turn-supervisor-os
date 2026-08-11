import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Droplets,
  Paintbrush,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { formatClock } from '../../lib/constants';
import {
  TRACK_C_TRADES,
  type TrackCCompactUnitProjection,
  type TrackCEventType,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
  paintWorkTypeLabel,
  trackCSectionLabel,
  trackCWorkKey,
} from './model';
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
import { payWeekNumberOf, wallWeekColor, WALL_WORKTYPE_ABBR } from './wallWeek';
import type { PhotoNote } from '../../types';
import type { TrackCSectionAction } from './operations';
import { UnitPhotoAddButton, UnitPhotoStrip, type UnitPhotoCommitter } from './UnitPhotos';
import {
  projectTrackCUnitWork,
  projectTrackCTradeProgress,
  projectTrackCWork,
  trackCTradeWorkTypeLabel,
  searchTrackCCompactUnits,
  trackCCrewName,
  trackCUnitMakeupLabel,
} from './projections';

export type UnitNoteKind = 'note' | 'change-order' | 'reminder' | 'texture' | 'drywall';

const NOTE_KIND_META: Record<UnitNoteKind, { badge: string; label: string; cls: string }> = {
  reminder: { badge: '★', label: 'Reminder', cls: 'is-reminder' },
  'change-order': { badge: '＄', label: 'Change order', cls: 'is-change' },
  texture: { badge: '≈', label: 'Texture', cls: 'is-texture' },
  drywall: { badge: '▭', label: 'Drywall', cls: 'is-drywall' },
  note: { badge: '✎', label: 'Note', cls: 'is-note' },
};

const NOTE_KIND_ORDER: Record<UnitNoteKind, number> = { reminder: 0, 'change-order': 1, texture: 2, drywall: 3, note: 4 };

interface UnitNote {
  id: string;
  unitId: string;
  kind?: UnitNoteKind;
  text: string;
  createdAt: string;
}

const UnitNotesPanel = ({
  notes,
  onAdd,
  onEdit,
  onDelete,
}: {
  notes: readonly UnitNote[];
  onAdd?: (kind: UnitNoteKind, text: string) => boolean;
  onEdit?: (noteId: string, text: string) => boolean;
  onDelete?: (noteId: string) => boolean;
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<UnitNoteKind>('note');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  // Reminders pin to the top (the whole point — the thing Los can't forget),
  // then change orders, then plain notes; newest first within each kind.
  const ordered = [...notes].sort((left, right) => {
    const kindDelta = NOTE_KIND_ORDER[left.kind ?? 'note'] - NOTE_KIND_ORDER[right.kind ?? 'note'];
    return kindDelta !== 0 ? kindDelta : right.createdAt.localeCompare(left.createdAt);
  });

  const saveNew = () => {
    if (!onAdd || !draftText.trim()) return;
    if (onAdd(draftKind, draftText)) {
      setDraftText('');
      setDraftKind('note');
      setComposerOpen(false);
    }
  };
  const saveEdit = (id: string) => {
    if (!onEdit || !editText.trim()) return;
    if (onEdit(id, editText)) setEditingId(null);
  };

  const canAdd = Boolean(onAdd);
  if (!canAdd && ordered.length === 0) return null;

  return (
    <section className="track-c-notes" aria-label="Unit notes and reminders">
      <div className="track-c-notes__head">
        <h3>Notes &amp; reminders</h3>
        {canAdd ? (
          <button
            className="track-c-notes__add"
            data-track-c-critical-target="true"
            onClick={() => { setComposerOpen((open) => !open); setEditingId(null); }}
            type="button"
          >
            {composerOpen ? 'Close' : '＋ Add'}
          </button>
        ) : null}
      </div>

      {composerOpen && canAdd ? (
        <div className="track-c-notes__composer">
          <div className="track-c-notes__kinds">
            {(['note', 'change-order', 'texture', 'drywall', 'reminder'] as const).map((kind) => (
              <button
                aria-pressed={draftKind === kind}
                className={`track-c-notekind ${NOTE_KIND_META[kind].cls} ${draftKind === kind ? 'is-on' : ''}`}
                key={kind}
                onClick={() => setDraftKind(kind)}
                type="button"
              >
                <span aria-hidden="true">{NOTE_KIND_META[kind].badge}</span> {NOTE_KIND_META[kind].label}
              </button>
            ))}
          </div>
          <textarea
            autoFocus
            className="track-c-notes__input"
            onChange={(event) => setDraftText(event.target.value)}
            placeholder={draftKind === 'change-order'
              ? 'What changed? e.g. tub resurface, wall hole > quarter'
              : draftKind === 'texture'
                ? 'What texture? e.g. knockdown on A ceiling'
                : draftKind === 'drywall'
                  ? 'What drywall repair? e.g. patched hole in B, retextured'
                  : draftKind === 'reminder'
                    ? 'What must you remember here?'
                    : 'Note for this unit'}
            rows={3}
            value={draftText}
          />
          <div className="track-c-notes__composer-actions">
            <button
              className="track-c-notes__save"
              data-track-c-critical-target="true"
              disabled={!draftText.trim()}
              onClick={saveNew}
              type="button"
            >
              Save {NOTE_KIND_META[draftKind].label.toLowerCase()}
            </button>
          </div>
        </div>
      ) : null}

      {ordered.length > 0 ? (
        <ul className="track-c-notes__list">
          {ordered.map((note) => {
            const meta = NOTE_KIND_META[note.kind ?? 'note'];
            const editing = editingId === note.id;
            return (
              <li className={`track-c-note ${meta.cls}`} key={note.id}>
                {editing ? (
                  <div className="track-c-note__edit">
                    <textarea
                      autoFocus
                      onChange={(event) => setEditText(event.target.value)}
                      rows={3}
                      value={editText}
                    />
                    <div className="track-c-note__edit-actions">
                      <button disabled={!editText.trim()} onClick={() => saveEdit(note.id)} type="button">Save</button>
                      <button className="track-c-note__cancel" onClick={() => setEditingId(null)} type="button">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="track-c-note__body">
                      <span className={`track-c-note__badge ${meta.cls}`}>
                        <span aria-hidden="true">{meta.badge}</span> {meta.label}
                      </span>
                      <p>{note.text}</p>
                    </div>
                    {(onEdit || onDelete) ? (
                      <div className="track-c-note__actions">
                        {onEdit ? (
                          <button
                            aria-label="Edit note"
                            onClick={() => { setEditingId(note.id); setEditText(note.text); setArmedDelete(null); }}
                            type="button"
                          >
                            Edit
                          </button>
                        ) : null}
                        {onDelete ? (
                          <button
                            aria-label={armedDelete === note.id ? 'Confirm delete note' : 'Delete note'}
                            className={armedDelete === note.id ? 'track-c-note__del is-armed' : 'track-c-note__del'}
                            onClick={() => {
                              if (armedDelete === note.id) { onDelete(note.id); setArmedDelete(null); }
                              else setArmedDelete(note.id);
                            }}
                            type="button"
                          >
                            {armedDelete === note.id ? 'Tap again' : 'Delete'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};

interface BoardViewProps {
  readonly state: TrackCState;
  readonly selectedUnitId?: string;
  readonly onOpenUnit: (unitId: string, trade?: TrackCTrade) => void;
  readonly focusTradeHint?: TrackCTrade;
  readonly onCloseUnit: () => void;
  readonly onSectionAction: (
    target: TrackCWorkTarget,
    action: TrackCSectionAction,
  ) => void;
  readonly onTradeComplete: (
    unitId: string,
    trade: TrackCTrade,
  ) => void;
  readonly onRequestAssign?: (trade: TrackCTrade) => void;
  readonly onQuickAssign?: (
    unitId: string,
    trade: TrackCTrade,
    crewId: string,
  ) => void;
  readonly onChangeCrew?: (
    unitId: string,
    trade: TrackCTrade,
    crewId: string,
  ) => void;
  readonly onRequestNote?: () => void;
  readonly onAddNote?: (unitId: string, kind: UnitNoteKind, text: string) => boolean;
  readonly onEditNote?: (noteId: string, text: string) => boolean;
  readonly onDeleteNote?: (noteId: string) => boolean;
  readonly onRequestMirror: (target: TrackCWorkTarget) => void;
  readonly unitNotes?: readonly { id: string; unitId: string; kind?: UnitNoteKind; text: string; createdAt: string }[];
  readonly unitPhotos?: readonly PhotoNote[];
  readonly onCommitUnitPhoto?: UnitPhotoCommitter;
  readonly onPdsApprove?: (unitId: string, trade: TrackCTrade) => void;
  readonly onOpenCallback?: (unitId: string, trade: TrackCTrade) => void;
  readonly onOpenSectionCallback?: (unitId: string, trade: TrackCTrade, section: TrackCSection, reason?: string) => void;
  readonly onResolveSectionCallback?: (unitId: string, trade: TrackCTrade, section: TrackCSection) => void;
  readonly onTradePass?: (unitId: string, trade: TrackCTrade) => void;
  readonly onResolveCallback?: (unitId: string, trade: TrackCTrade) => void;
  readonly onUnblockUnit?: (unitId: string, trade: TrackCTrade) => void;
  readonly onRequestBlock?: (unitId: string, trade: TrackCTrade) => void;
  readonly onSetSectionWorkType?: (
    target: TrackCWorkTarget,
    workType: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean',
  ) => void;
  readonly onUpgradeCutInToFull?: (
    target: TrackCWorkTarget,
    attribution: 'joseph' | 'catch' | 'redo',
  ) => void;
  readonly onSetSectionRelease?: (
    target: TrackCWorkTarget,
    released: boolean,
  ) => void;
  readonly onSetTradeRelease?: (
    unitId: string,
    trade: TrackCTrade,
    released: boolean,
    workType?: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean',
  ) => void;
  readonly onSetUnitBeds?: (unitId: string, beds: number) => void;
  readonly onMoveUnitTrade?: (sourceUnitId: string, trade: TrackCTrade, targetUnitNumber: string) => void;
}

const tradeLabel = (trade: TrackCTrade) =>
  trade === 'paint' ? 'Paint' : 'Clean';

const executionLabel = (work: TrackCWorkProjection) => {
  if (work.assignmentConflict) return 'Assignment conflict';
  if (work.callbackOpen) {
    return work.inspection === 'reinspection-pending'
      ? 'Reinspection pending'
      : 'Callback open';
  }
  if (work.property === 'property-accepted') {
    return work.personalPdsMirror ? 'Accepted · mirror recorded' : 'Accepted';
  }
  // A room is just "passed" — walking happens at the UNIT level once every room
  // is done, so a single room never reads as "needs to be walked".
  if (work.inspection === 'los-passed') return 'Los passed';
  if (work.inspection === 'needs-los-inspection') return 'Needs Los inspection';
  if (work.execution === 'crew-reported-complete') return 'Crew reported complete';
  if (work.execution === 'working') return 'Working';
  if (work.execution === 'assigned') return 'Assigned';
  if (work.release === 'released') return 'Needs crew';
  if (work.release === 'unreleased') return 'Unreleased';
  return 'Source review required';
};

const compactSectionStatus = (work: TrackCWorkProjection) => {
  if (work.assignmentConflict) return 'Conflict';
  if (work.callbackOpen) {
    return work.inspection === 'reinspection-pending'
      ? 'Reinspect'
      : 'Callback';
  }
  if (work.property === 'property-accepted') return 'Accepted';
  if (work.inspection === 'los-passed') return 'Passed';
  if (
    work.inspection === 'needs-los-inspection' ||
    work.execution === 'crew-reported-complete'
  ) {
    return 'Inspect';
  }
  if (work.execution === 'working') return 'Working';
  if (work.execution === 'assigned') return 'Assigned';
  if (work.release === 'released') {
    return work.access === 'clear' ? 'Needs crew' : 'Waiting';
  }
  if (work.release === 'unreleased') return 'Unreleased';
  return 'Review';
};

const layerCopy = (state: TrackCState, work: TrackCWorkProjection) => {
  const crew =
    work.activeCrewIds.length === 0
      ? 'Unassigned'
      : work.activeCrewIds.length > 1
        ? 'Conflicting crews'
        : trackCCrewName(state, work.responsibleCrewId) ?? 'Unknown crew';
  const crewSays = work.activeCrewIds.length === 0
    ? 'No crew yet'
    : work.execution === 'crew-reported-complete'
      ? 'Reported complete'
      : work.execution === 'working'
        ? 'Working'
        : 'Not started';
  const myInspection = work.inspection === 'los-passed'
    ? 'Passed'
    : work.inspection === 'needs-los-inspection'
      ? 'Needs my inspection'
      : work.inspection === 'callback-open'
        ? 'Callback open'
        : work.inspection === 'reinspection-pending'
          ? 'Ready to reinspect'
          : 'Waiting on crew';
  const property = work.property === 'property-accepted'
    ? work.personalPdsMirror
      ? 'Accepted · noted for paper'
      : 'Accepted'
    : 'Pending property';
  return [
    ['Crew', crew],
    ['Crew says', crewSays],
    ['My inspection', myInspection],
    ['Property', property],
  ] as const;
};

const actionsFor = (
  work: TrackCWorkProjection,
): readonly { action: TrackCSectionAction; label: string; tone?: string }[] => {
  if (
    work.release !== 'released' ||
    work.assignmentConflict ||
    work.sourceConfidence !== 'confirmed'
  ) {
    return [];
  }
  if (
    work.activeCrewIds.length === 1 &&
    (work.execution === 'assigned' || work.execution === 'working') &&
    work.access !== 'clear'
  ) {
    return [
      {
        action: 'record-crew-complete',
        label: 'Record crew completion report',
      },
    ];
  }
  if (work.access !== 'clear') return [];
  if (work.execution === 'assigned') {
    return [{ action: 'start-work', label: 'Start work' }];
  }
  if (work.execution === 'working') {
    return [{ action: 'record-crew-complete', label: 'Crew reports complete' }];
  }
  if (work.inspection === 'needs-los-inspection') {
    return [
      { action: 'record-los-pass', label: 'Record Los pass', tone: 'positive' },
      { action: 'open-callback', label: 'Open callback', tone: 'caution' },
    ];
  }
  if (work.inspection === 'callback-open') {
    return [
      {
        action: 'record-correction-ready',
        label: 'Correction reported ready',
      },
    ];
  }
  if (work.inspection === 'reinspection-pending') {
    return [
      {
        action: 'record-reinspection-pass',
        label: 'Pass reinspection',
        tone: 'positive',
      },
    ];
  }
  if (
    work.inspection === 'los-passed' &&
    work.property !== 'property-accepted'
  ) {
    return [
      {
        action: 'reopen-inspection',
        label: 'Undo pass — back to Needs Inspection',
        tone: 'caution',
      },
    ];
  }
  return [];
};

const CompactTrade = ({
  state,
  progress,
  workLabel,
}: {
  state: TrackCState;
  progress: TrackCCompactUnitProjection['paint'];
  workLabel?: string;
}) => {
  const Icon = progress.trade === 'paint' ? Paintbrush : Droplets;
  const names = progress.crewIds
    .map((crewId) => trackCCrewName(state, crewId))
    .filter(Boolean);
  // Tri-state truth per trade: green = property accepted everything released,
  // yellow = some progress, red = released with nothing done yet.
  const stateClass = progress.released === 0
    ? ''
    : progress.accepted >= progress.released
      ? 'is-approved'
      : progress.losPassed >= progress.released
        ? 'is-complete'
        : (progress.losPassed + progress.crewReportedComplete + progress.accepted) > 0
          ? 'is-partial'
          : 'is-open';
  return (
    <div className={`track-c-unit-row__trade ${stateClass}`}>
      <Icon aria-hidden="true" size={15} strokeWidth={2.2} />
      <span>{tradeLabel(progress.trade)}</span>
      <strong>
        {names.length === 0
          ? progress.released > 0 ? 'Needs crew' : 'Unreleased'
          : names.join(', ')}
      </strong>
      {progress.conciseLabel === 'No released work' && names.length === 0
        ? null
        : <small>{progress.conciseLabel}{workLabel ? ` · ${workLabel}` : ''}</small>}
    </div>
  );
};

// "today" / "yesterday" / "Aug 2" for an ISO time, in local days — so Los can
// tell at a glance whether a unit came onto the board today or is carryover.
const relativeDayLabel = (iso: string): string => {
  const localDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const day = localDay(new Date(iso));
  if (day === localDay(new Date())) return 'today';
  if (day === localDay(new Date(Date.now() - 86_400_000))) return 'yesterday';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// The day a unit's work (for this trade) was released onto the board.
const releasedDayOf = (
  state: TrackCState,
  unitId: string,
  trade?: TrackCTrade,
): string | undefined => {
  let earliest = '';
  for (const work of projectTrackCUnitWork(state, unitId)) {
    if (trade && work.trade !== trade) continue;
    if (work.release !== 'released' || !work.releasedAt) continue;
    if (!earliest || work.releasedAt < earliest) earliest = work.releasedAt;
  }
  return earliest ? relativeDayLabel(earliest) : undefined;
};

// The day Los last put a crew on this unit+trade (latest confirmed assignment)
// — shown next to the released day so "when did I get it" and "when did I crew
// it" are both answerable at a glance.
const assignedDayOf = (
  state: TrackCState,
  unitId: string,
  trade?: TrackCTrade,
): string | undefined => {
  let latest = '';
  for (const event of state.events) {
    if (event.eventType !== 'assignment-confirmed') continue;
    if (event.target.unitId !== unitId) continue;
    if (trade && event.target.trade !== trade) continue;
    if (event.recordedAt > latest) latest = event.recordedAt;
  }
  return latest ? relativeDayLabel(latest) : undefined;
};

const CompactUnitRow = ({
  state,
  unit,
  onOpen,
  cleanNext = false,
  blocked = false,
  trade,
}: {
  state: TrackCState;
  unit: TrackCCompactUnitProjection;
  onOpen: () => void;
  cleanNext?: boolean;
  blocked?: boolean;
  trade?: TrackCTrade;
}) => (
  <button
    aria-label={`Open Unit ${unit.unitNumber}`}
    className="track-c-unit-row"
    data-track-c-critical-target="true"
    data-testid="track-c-unit-row"
    data-unit-id={unit.unitId}
    onClick={onOpen}
    type="button"
  >
    <div className="track-c-unit-row__identity">
      <strong>{unit.unitNumber}</strong>
      <span>
        {unit.unitType}
        {(() => {
          const full = state.units.find((candidate) => candidate.id === unit.unitId);
          return full ? ` · ${trackCUnitMakeupLabel(full)}` : '';
        })()}
      </span>
      {(() => {
        const since = releasedDayOf(state, unit.unitId, trade);
        const assigned = assignedDayOf(state, unit.unitId, trade);
        if (!since && !assigned) return null;
        return (
          <span className={`track-c-unit-row__since${since && since !== 'today' ? ' is-old' : ''}`}>
            {since ? `released ${since}` : ''}
            {since && assigned ? ' · ' : ''}
            {assigned ? `assigned ${assigned}` : ''}
          </span>
        );
      })()}
    </div>
    <div className="track-c-unit-row__trades">
      {trade !== 'clean' ? <CompactTrade progress={unit.paint} state={state} workLabel={trackCTradeWorkTypeLabel(state, unit.unitId, 'paint')} /> : null}
      {trade !== 'paint' ? <CompactTrade progress={unit.clean} state={state} /> : null}
    </div>
    {blocked ? (
      <span className="track-c-signal is-blocked">
        <ShieldAlert aria-hidden="true" size={13} /> Blocked
      </span>
    ) : null}
    {cleanNext ? (
      <span className="track-c-signal is-clean-next">Clean next</span>
    ) : null}
    {unit.signal !== 'none' ? (
      <span className={`track-c-signal is-${unit.signal}`}>
        {unit.signal === 'needs-me' ? (
          <CircleAlert aria-hidden="true" size={14} />
        ) : (
          <ShieldAlert aria-hidden="true" size={14} />
        )}
        {unit.signalLabel}
      </span>
    ) : null}
    <ChevronRight aria-hidden="true" className="track-c-unit-row__chevron" size={18} />
  </button>
);

const WorkSection = ({
  state,
  work,
  isSelected,
  onSelect,
  onAction,
  onRequestMirror,
  onToggleRelease,
  onSetWorkType,
  onUpgradeCutInToFull,
  unitNumber,
}: {
  state: TrackCState;
  work: TrackCWorkProjection;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: TrackCSectionAction) => void;
  onRequestMirror: () => void;
  onToggleRelease?: (released: boolean) => void;
  onSetWorkType?: (workType: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean') => void;
  onUpgradeCutInToFull?: (attribution: 'joseph' | 'catch' | 'redo') => void;
  unitNumber?: string;
}) => {
  // Removing a room is destructive — first tap (or a left swipe) arms,
  // second tap confirms. A HOLD (iOS-style) opens the room menu instead.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  useEffect(() => {
    if (!confirmRemove) return undefined;
    const timer = window.setTimeout(() => setConfirmRemove(false), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmRemove]);
  // A room Joseph never actually released can be pulled back at any stage Los
  // still controls — assigned, working, crew-reported, even a Los pass (his own
  // reversible mark). The ONE hard stop is a property-accepted room (CC on the
  // wall — an official sign-off we never rewrite silently). Removing a room
  // leaves the crew's payroll events untouched, so this never erases pay.
  const canRemove = Boolean(onToggleRelease)
    && work.release === 'released'
    && work.property !== 'property-accepted';
  // Plain, the way Los says it: "delete Common from 1608." No editorializing
  // about crew work — deleting a room means that room doesn't need this trade.
  const removeLabel = `Delete ${trackCSectionLabel(work.section)}${unitNumber ? ` from ${unitNumber}` : ''}`;
  const actions = actionsFor(work);
  const blocked =
    work.release !== 'released' ||
    work.access !== 'clear' ||
    work.sourceConfidence !== 'confirmed' ||
    work.assignmentConflict;
  // One-tap inspection right on the row — no dropdown needed for the two moves
  // Los makes hundreds of times a day.
  const quickActions = !isSelected && !blocked && work.inspection === 'needs-los-inspection';
  return (
    <div
      className={`track-c-section-row ${isSelected ? 'is-open' : ''}`}
      onContextMenu={(event) => {
        if (work.release !== 'released') return;
        event.preventDefault();
        setMenuOpen(true);
      }}
      onTouchEnd={(event) => {
        clearHold();
        if (touchStartX.current === null || !canRemove) return;
        const delta = event.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (delta < -60) {
          if (!isSelected) onSelect();
          setConfirmRemove(true);
        }
      }}
      onTouchMove={(event) => {
        const startX = touchStartX.current;
        if (startX !== null
          && Math.abs(event.touches[0].clientX - startX) > 10) clearHold();
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        if (work.release !== 'released') return;
        clearHold();
        holdTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          setMenuOpen(true);
        }, 450);
      }}
    >
      {menuOpen ? (
        <>
        <button
          aria-label="Close menu"
          className="track-c-room-menu__backdrop"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
        <div className="track-c-room-menu" role="menu">
          <p>{trackCSectionLabel(work.section)}</p>
          {work.trade === 'paint' && onSetWorkType
            ? (['full', 'touch-up', 'cut-in', 'full-cut-in', 'touch-up-cut-in'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  onSetWorkType(type);
                  setMenuOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                {type === 'full'
                  ? 'Full paint'
                  : type === 'touch-up'
                    ? 'Touch-up'
                    : type === 'cut-in'
                      ? 'Cut-in'
                      : type === 'full-cut-in' ? 'Full + cut-in' : 'Touch-up + cut-in'}
                {(work.workType ?? 'full') === type ? ' \u2713' : ''}
              </button>
            ))
            : null}
          {canRemove && onToggleRelease ? (
            <button
              className="is-remove"
              onClick={() => {
                setMenuOpen(false);
                onToggleRelease(false);
              }}
              role="menuitem"
              type="button"
            >
              {removeLabel}
            </button>
          ) : null}
          {!canRemove && work.property === 'property-accepted' ? (
            <p className="track-c-room-menu__locked">
              Property approved this room — it can't be deleted. Block the unit if
              it needs a callback.
            </p>
          ) : null}
          <button onClick={() => setMenuOpen(false)} role="menuitem" type="button">
            Cancel
          </button>
        </div>
        </>
      ) : null}
      <div className="track-c-section-row__bar">
        <button
          aria-label={`${trackCSectionLabel(work.section)}: ${executionLabel(work)}`}
          aria-expanded={isSelected}
          className="track-c-section-row__trigger"
          data-track-c-critical-target="true"
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            onSelect();
          }}
          type="button"
        >
          <span className="track-c-section-row__section">
            {trackCSectionLabel(work.section)}
            {work.release === 'released'
              && (work.trade === 'paint' || work.workType === 'heavy-clean') ? (
                <em className={`track-c-worktype is-${work.workType ?? 'full'}`}>
                  {work.trade === 'paint'
                    ? paintWorkTypeLabel(work.workType ?? 'full')
                    : 'heavy clean'}
                </em>
              ) : null}
          </span>
          <span
            className={`track-c-section-row__state ${
              ['Passed', 'Accepted'].includes(compactSectionStatus(work)) ? 'is-passed' : ''
            }`}
          >
            {compactSectionStatus(work)}
          </span>
          <ChevronRight aria-hidden="true" size={17} />
        </button>
        {quickActions ? (
          <div className="track-c-section-row__quick">
            <button
              aria-label={`Record Los pass — ${trackCSectionLabel(work.section)}`}
              className="is-pass"
              data-track-c-critical-target="true"
              onClick={() => onAction('record-los-pass')}
              type="button"
            >
              <Check aria-hidden="true" size={18} />
            </button>
            <button
              aria-label={`Open callback — ${trackCSectionLabel(work.section)}`}
              className="is-callback"
              data-track-c-critical-target="true"
              onClick={() => onAction('open-callback')}
              type="button"
            >
              <CircleAlert aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}
      </div>
      {isSelected ? (
        <div className="track-c-section-row__detail">
          <p className="track-c-section-row__detail-status">
            {executionLabel(work)}
          </p>
          {/* Task picker — paint tasks, or Regular/Heavy for clean. Stays
              available AFTER the property approves so Los can correct it or mark
              a heavy clean even once it's accepted (pure label — no re-open). */}
          {onSetWorkType && work.release === 'released' ? (
            <div className="track-c-worktype-pick">
              <span className="track-c-worktype-pick__label">Task:</span>
              <div className="track-c-worktype-pick__chips">
                {work.trade === 'paint'
                  ? (['full', 'touch-up', 'cut-in', 'full-cut-in', 'touch-up-cut-in'] as const).map((type) => (
                    <button
                      className={`track-c-worktype-pick__chip${(work.workType ?? 'full') === type ? ' is-current' : ''}`}
                      key={type}
                      onClick={() => onSetWorkType(type)}
                      type="button"
                    >
                      {type === 'full'
                        ? 'Full'
                        : type === 'touch-up'
                          ? 'Touch-up'
                          : type === 'cut-in'
                            ? 'Cut-in'
                            : type === 'full-cut-in' ? 'Full+cut-in' : 'Touch-up+cut-in'}
                    </button>
                  ))
                  : ([['full', 'Regular clean'], ['heavy-clean', 'Heavy clean']] as const).map(([type, label]) => {
                    const isCurrent = type === 'heavy-clean'
                      ? work.workType === 'heavy-clean'
                      : work.workType !== 'heavy-clean';
                    return (
                      <button
                        className={`track-c-worktype-pick__chip${isCurrent ? ' is-current' : ''}`}
                        key={type}
                        onClick={() => onSetWorkType(type)}
                        type="button"
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : null}
          {onUpgradeCutInToFull
            && work.trade === 'paint'
            && work.release === 'released'
            && (work.workType === 'cut-in' || work.workType === 'touch-up-cut-in') ? (
              <div className="track-c-upgrade">
                {!upgradeOpen ? (
                  <button
                    className="track-c-upgrade__open"
                    data-track-c-critical-target="true"
                    onClick={() => setUpgradeOpen(true)}
                    type="button"
                  >
                    → Full paint (whose call?)
                  </button>
                ) : (
                  <>
                    <span className="track-c-upgrade__label">
                      Cut-in → full paint. Crew’s paid for the work — who called it?
                    </span>
                    <div className="track-c-upgrade__chips">
                      <button
                        className="track-c-upgrade__chip is-charge"
                        onClick={() => { setUpgradeOpen(false); onUpgradeCutInToFull('joseph'); }}
                        type="button"
                      >
                        Joseph — change order (charge)
                      </button>
                      <button
                        className="track-c-upgrade__chip"
                        onClick={() => { setUpgradeOpen(false); onUpgradeCutInToFull('catch'); }}
                        type="button"
                      >
                        My catch — no charge
                      </button>
                      <button
                        className="track-c-upgrade__chip"
                        onClick={() => { setUpgradeOpen(false); onUpgradeCutInToFull('redo'); }}
                        type="button"
                      >
                        Crew redo — no charge
                      </button>
                    </div>
                    <button
                      className="track-c-upgrade__cancel"
                      onClick={() => setUpgradeOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ) : null}
          {canRemove && onToggleRelease ? (
              <button
                className="track-c-release-toggle is-remove"
                onClick={() => {
                  if (!confirmRemove) {
                    setConfirmRemove(true);
                    return;
                  }
                  setConfirmRemove(false);
                  onToggleRelease(false);
                }}
                type="button"
              >
                {confirmRemove
                  ? `Yes — delete ${trackCSectionLabel(work.section)}${unitNumber ? ` from ${unitNumber}` : ''}`
                  : removeLabel}
              </button>
            ) : null}
          {!canRemove && work.property === 'property-accepted' ? (
            <p className="track-c-section-row__note">
              Property approved — can't delete this room. Block the unit if it
              needs a callback.
            </p>
          ) : null}
          {work.release === 'unreleased' && !work.assignmentConflict ? (
            <>
              <p className="track-c-section-row__note">
                Not released yet.
              </p>
              {onToggleRelease ? (
                <button
                  className="track-c-release-toggle"
                  data-track-c-critical-target="true"
                  onClick={() => onToggleRelease(true)}
                  type="button"
                >
                  Joseph released this — mark released
                </button>
              ) : null}
            </>
          ) : blocked ? (
            <p className="track-c-section-row__warning">
              <ShieldAlert aria-hidden="true" size={16} />
              {work.access !== 'clear' &&
              work.release === 'released' &&
              work.sourceConfidence === 'confirmed' &&
              !work.assignmentConflict
                ? `${work.restrictionLabel ?? 'Access is currently blocked.'} Do not enter or inspect. A crew completion report already received may still be recorded as evidence.`
                : work.restrictionLabel ??
                  'This section is not eligible for field actions until release, access, and source conflicts are resolved.'}
            </p>
          ) : null}
          {work.release === 'released' ? (
            <dl className="track-c-layer-list">
              {layerCopy(state, work).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {actions.length > 0 ? (
            <div className="track-c-action-row">
              {actions.map((item) => (
                <button
                  className={item.tone ? `is-${item.tone}` : undefined}
                  data-track-c-critical-target="true"
                  key={item.action}
                  onClick={() => onAction(item.action)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {work.property === 'property-accepted' && !work.personalPdsMirror ? (
            <button
              className="track-c-mirror-button"
              data-track-c-critical-target="true"
              onClick={onRequestMirror}
              type="button"
            >
              Record personal {state.terminology.personalMirrorLabel}
            </button>
          ) : null}
          <p className="track-c-boundary-copy">
            Personal Turn OS record only. Paper authority and payroll are unchanged.
          </p>
        </div>
      ) : null}
    </div>
  );
};

// Whole-unit release, task-aware. Joseph releases a unit at the door; before
// this, "mark the whole unit released" recorded every room with NO task, so the
// board (and the pay packet) silently showed "full paint" even for touch-ups
// and cut-ins. Now Los picks the task first, so the release records the truth.
// Clean has no paint task, so it keeps the plain one-tap button.
const RELEASE_TASKS: readonly {
  key: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in';
  short: string;
}[] = [
  { key: 'full', short: 'Full' },
  { key: 'touch-up', short: 'Touch-up' },
  { key: 'cut-in', short: 'Cut-in' },
  { key: 'full-cut-in', short: 'Full + cut' },
  { key: 'touch-up-cut-in', short: 'Touch + cut' },
];

const WholeUnitReleaseControl = ({
  trade,
  onRelease,
}: {
  trade: TrackCTrade;
  onRelease: (
    workType?: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean',
  ) => void;
}) => {
  const [task, setTask] =
    useState<'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in'>('full');
  if (trade !== 'paint') {
    return (
      <button
        className="track-c-release-toggle"
        data-track-c-critical-target="true"
        onClick={() => onRelease()}
        type="button"
      >
        Joseph released {tradeLabel(trade)} — mark the whole unit released
      </button>
    );
  }
  return (
    <div className="track-c-release-whole">
      <p className="track-c-release-whole__label">
        Joseph released Paint — pick the task, then release the whole unit:
      </p>
      <div className="track-c-release-whole__chips">
        {RELEASE_TASKS.map((option) => (
          <button
            className={`track-c-release-whole__chip${task === option.key ? ' is-current' : ''}`}
            key={option.key}
            onClick={() => setTask(option.key)}
            type="button"
          >
            {option.short}
          </button>
        ))}
      </div>
      <button
        className="track-c-release-toggle"
        data-track-c-critical-target="true"
        onClick={() => onRelease(task)}
        type="button"
      >
        Release whole unit — {paintWorkTypeLabel(task)}
      </button>
    </div>
  );
};

const UnitDetail = ({
  state,
  unitId,
  onClose,
  onSectionAction,
  onTradeComplete,
  onQuickAssign,
  onChangeCrew,
  onRequestAssign,
  onRequestNote,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onRequestMirror,
  unitNotes,
  unitPhotos,
  onCommitUnitPhoto,
  focusTrade,
  onPdsApprove,
  onOpenCallback,
  onOpenSectionCallback,
  onResolveSectionCallback,
  onTradePass,
  onResolveCallback,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetSectionWorkType,
  onUpgradeCutInToFull,
  onSetTradeRelease,
  onSetUnitBeds,
  onMoveUnitTrade,
}: {
  state: TrackCState;
  unitId: string;
  onClose: () => void;
  onSectionAction: BoardViewProps['onSectionAction'];
  onTradeComplete: BoardViewProps['onTradeComplete'];
  onQuickAssign?: BoardViewProps['onQuickAssign'];
  onChangeCrew?: BoardViewProps['onChangeCrew'];
  onRequestAssign?: BoardViewProps['onRequestAssign'];
  onRequestNote?: BoardViewProps['onRequestNote'];
  onAddNote?: BoardViewProps['onAddNote'];
  onEditNote?: BoardViewProps['onEditNote'];
  onDeleteNote?: BoardViewProps['onDeleteNote'];
  onRequestMirror: BoardViewProps['onRequestMirror'];
  unitNotes?: BoardViewProps['unitNotes'];
  unitPhotos?: BoardViewProps['unitPhotos'];
  onCommitUnitPhoto?: BoardViewProps['onCommitUnitPhoto'];
  focusTrade?: TrackCTrade;
  onPdsApprove?: BoardViewProps['onPdsApprove'];
  onOpenCallback?: BoardViewProps['onOpenCallback'];
  onOpenSectionCallback?: BoardViewProps['onOpenSectionCallback'];
  onResolveSectionCallback?: BoardViewProps['onResolveSectionCallback'];
  onTradePass?: BoardViewProps['onTradePass'];
  onResolveCallback?: BoardViewProps['onResolveCallback'];
  onUnblockUnit?: BoardViewProps['onUnblockUnit'];
  onRequestBlock?: BoardViewProps['onRequestBlock'];
  onSetSectionRelease?: BoardViewProps['onSetSectionRelease'];
  onSetSectionWorkType?: BoardViewProps['onSetSectionWorkType'];
  onUpgradeCutInToFull?: BoardViewProps['onUpgradeCutInToFull'];
  onSetTradeRelease?: BoardViewProps['onSetTradeRelease'];
  onSetUnitBeds?: BoardViewProps['onSetUnitBeds'];
  onMoveUnitTrade?: BoardViewProps['onMoveUnitTrade'];
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string>();
  // Which room a callback is being written for, and the reason Los is typing —
  // so tapping a room opens a "what's wrong?" box before the crew gets texted.
  const [callbackDraft, setCallbackDraft] = useState<{ trade: TrackCTrade; section: TrackCSection; reason: string } | null>(null);
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const work = useMemo(
    () => projectTrackCUnitWork(state, unitId),
    [state, unitId],
  );
  const photosForUnit = useMemo(
    () => (unitPhotos ?? []).filter((photo) => photo.unitId === unitId),
    [unitPhotos, unitId],
  );
  const notesForUnit = useMemo(
    () => (unitNotes ?? [])
      .filter((note) => note.unitId === unitId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [unitNotes, unitId],
  );
  // From a trade board the unit page IS that board's page — the other trade
  // stays one tap away, while notes/photos/change orders remain shared.
  const [showOtherTrade, setShowOtherTrade] = useState(false);
  // One popup at a time on the unit page: 'add' (Note/Change/Photo) or
  // `more:paint`/`more:clean` (Delete/Block). Keeps the page calm instead of
  // stacking a wall of buttons.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveTrade, setMoveTrade] = useState<TrackCTrade | null>(null);
  // PDS approval is heavyweight truth with no undo — it takes two taps.
  const [pdsConfirmTrade, setPdsConfirmTrade] = useState<TrackCTrade>();
  useEffect(() => {
    if (!pdsConfirmTrade) return undefined;
    const timer = window.setTimeout(() => setPdsConfirmTrade(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [pdsConfirmTrade]);
  useEffect(() => {
    setShowOtherTrade(false);
  }, [unitId, focusTrade]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [unitId]);

  if (!unit) return null;

  return (
    <article className="track-c-detail" data-testid="track-c-unit-detail">
      <header className="track-c-detail__header">
        <button
          aria-label="Back to compact TurnBoard"
          className="track-c-back-button"
          data-track-c-critical-target="true"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Unit {unit.unitNumber}
            {focusTrade && !showOtherTrade
              ? ` · ${focusTrade === 'paint' ? 'Paint' : 'Clean'}`
              : ''}
          </h1>
          <p>{unit.unitType} · {trackCUnitMakeupLabel(unit)}</p>
        </div>
      </header>
      <UnitNotesPanel
        notes={notesForUnit}
        onAdd={onAddNote ? (kind, text) => onAddNote(unitId, kind, text) : undefined}
        onEdit={onEditNote}
        onDelete={onDeleteNote}
      />
      {[...TRACK_C_TRADES]
        .sort((left, right) =>
          Number(right === focusTrade) - Number(left === focusTrade))
        .filter((trade) => !focusTrade || showOtherTrade || trade === focusTrade)
        .map((trade) => {
        const Icon = trade === 'paint' ? Paintbrush : Droplets;
        const tradeWork = work.filter((item) => item.trade === trade);
        // An open callback takes priority over every other action on this trade.
        const anyCallbackOpen = tradeWork.some((item) =>
          item.release === 'released' && item.callbackOpen);
        // One-glance status chip that LEADS the panel, so opening a unit answers
        // "where is this trade?" in a second — before any of the controls.
        const releasedItems = tradeWork.filter((item) => item.release === 'released');
        const callbackRoomsLabel = releasedItems
          .filter((item) => item.callbackOpen)
          .map((item) => trackCSectionLabel(item.section))
          .join(', ');
        const tradeStatus: { text: string; tone: string } = anyCallbackOpen
          ? { text: `Callback — ${callbackRoomsLabel}`, tone: 'callback' }
          : releasedItems.length === 0
            ? { text: 'Not released', tone: 'idle' }
            : releasedItems.every((item) => item.property === 'property-accepted')
              ? { text: 'Approved', tone: 'approved' }
              : releasedItems.every((item) => item.inspection === 'los-passed')
                ? { text: 'Ready to walk', tone: 'ready' }
                : releasedItems.every((item) =>
                  item.execution === 'crew-reported-complete' || item.inspection === 'los-passed')
                  ? { text: 'Crew done — your inspection', tone: 'check' }
                  : releasedItems.some((item) => ['assigned', 'working'].includes(item.execution))
                    ? { text: 'Working', tone: 'working' }
                    : { text: 'Needs crew', tone: 'idle' };
        const progress = projectTrackCTradeProgress(state, unitId, trade);
        const crewNames = progress.crewIds
          .map((crewId) => trackCCrewName(state, crewId))
          .filter((name): name is string => Boolean(name));
        // The clock on this trade: when it was assigned, when the crew reported
        // done, when Los passed it, when the property manager approved — Los's
        // local time, 12-hour (never military). Latest event of each kind.
        const latestEventAt = (...types: TrackCEventType[]): string => state.events
          .filter((event) => event.confirmation === 'confirmed'
            && event.target.unitId === unitId
            && event.target.trade === trade
            && types.includes(event.eventType))
          .reduce((max, event) => (event.recordedAt > max ? event.recordedAt : max), '');
        // "PM approved" is only shown while the trade is STILL accepted — once a
        // callback pulls a room back, the old approval time must not linger (that
        // read as "approved AND callback" at the same time).
        const hasAcceptedNow = releasedItems.some((item) => item.property === 'property-accepted');
        const tradeTimes: { label: string; at: string }[] = [
          { at: latestEventAt('assignment-confirmed', 'work-started'), label: 'Assigned' },
          { at: latestEventAt('crew-reported-complete'), label: 'Crew done' },
          { at: latestEventAt('los-passed'), label: 'You passed' },
          { at: hasAcceptedNow ? latestEventAt('property-accepted') : '', label: 'PM approved' },
        ].filter((entry) => Boolean(entry.at));
        // A room added to a unit a crew already has (e.g. Los adds C after B was
        // released) shows "needs crew" with no way to assign it. If the trade
        // already has a crew, offer to put the new room(s) on that same crew in
        // one tap — "go with whoever did the job", per Los.
        const orphanRooms = tradeWork.filter((item) =>
          item.release === 'released'
          && item.activeCrewIds.length === 0
          && item.property !== 'property-accepted'
          && !item.callbackOpen);
        const existingCrewId = crewNames.length >= 1 ? progress.crewIds[0] : undefined;
        const canRecordTradeComplete =
          tradeWork.some((item) =>
            item.release === 'released' &&
            ['assigned', 'working'].includes(item.execution)) &&
          tradeWork.every((item) =>
            item.release !== 'released' ||
            item.assignmentConflict ||
            item.activeCrewIds.length !== 1 ||
            ['assigned', 'working', 'crew-reported-complete'].includes(
              item.execution,
            ));
        return (
          <section
            aria-labelledby={`track-c-${trade}-heading`}
            className={`track-c-trade-panel is-${trade}`}
            key={trade}
          >
            <header>
              <Icon aria-hidden="true" size={18} />
              <div className="track-c-trade-panel__identity">
                <div className="track-c-trade-panel__title">
                  <h2 id={`track-c-${trade}-heading`}>{tradeLabel(trade)}</h2>
                  <span className={`track-c-trade-status is-${tradeStatus.tone}`}>
                    {tradeStatus.text}
                  </span>
                </div>
                <span>
                  {crewNames.length === 0
                    ? progress.released > 0 ? 'Needs crew' : 'Unreleased'
                    : crewNames.join(', ')}
                </span>
                {tradeTimes.length > 0 ? (
                  <div className="track-c-trade-times">
                    {tradeTimes.map((entry) => (
                      <span key={entry.label}>
                        <b>{entry.label}</b> {formatClock(entry.at)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {orphanRooms.length > 0 && existingCrewId && onQuickAssign ? (
                  <button
                    className="track-c-assign-orphan"
                    data-track-c-critical-target="true"
                    onClick={() => onQuickAssign(unitId, trade, existingCrewId)}
                    type="button"
                  >
                    ＋ Add {orphanRooms.map((item) => trackCSectionLabel(item.section)).join(', ')} to {trackCCrewName(state, existingCrewId)}
                  </button>
                ) : null}
              </div>
              {crewNames.length === 0 && progress.released > 0 ? (
                onQuickAssign
                  && state.crews.some((crew) => crew.trade === trade) ? (
                    <select
                      aria-label={`Assign a ${tradeLabel(trade)} crew to Unit ${unit.unitNumber}`}
                      className="track-c-trade-assign"
                      data-track-c-critical-target="true"
                      onChange={(event) => {
                        if (event.target.value) {
                          onQuickAssign(unitId, trade, event.target.value);
                        }
                      }}
                      value=""
                    >
                      <option value="">Assign…</option>
                      {(() => {
                        // Only who's HERE today — the full list is noise in the
                        // field. If nobody's marked present, fall back to all
                        // so the picker is never dead.
                        const tradeCrews = state.crews.filter((crew) => crew.trade === trade);
                        const present = tradeCrews.filter((crew) => crew.activeToday);
                        return (present.length > 0 ? present : tradeCrews).map((crew) => (
                          <option key={crew.id} value={crew.id}>{crew.name}</option>
                        ));
                      })()}
                    </select>
                  ) : state.crews.length > 0
                    && !state.crews.some((crew) => crew.trade === trade) ? (
                    // Los has crews, but none of THIS trade — the usual reason a
                    // just-added crew "won't show" is it was saved as the other
                    // trade. Say so instead of a dead "Assign" button.
                    <small className="track-c-trade-assign-hint">
                      No {tradeLabel(trade)} crew yet — add one in Crews and pick{' '}
                      {tradeLabel(trade)}.
                    </small>
                  ) : onRequestAssign ? (
                    <button
                      className="track-c-trade-assign"
                      data-track-c-critical-target="true"
                      onClick={() => onRequestAssign(trade)}
                      type="button"
                    >
                      Assign
                    </button>
                  ) : (
                    <small>{progress.conciseLabel}</small>
                  )
              ) : crewNames.length === 1
                && onChangeCrew
                && state.crews.filter((crew) =>
                  crew.trade === trade && !progress.crewIds.includes(crew.id)).length > 0 ? (
                  <select
                    aria-label={`Change ${tradeLabel(trade)} crew for Unit ${unit.unitNumber}`}
                    className="track-c-trade-assign track-c-trade-change"
                    onChange={(event) => {
                      if (event.target.value) {
                        onChangeCrew(unitId, trade, event.target.value);
                      }
                    }}
                    value=""
                  >
                    <option value="">Change…</option>
                    {state.crews
                      .filter((crew) =>
                        crew.trade === trade && !progress.crewIds.includes(crew.id))
                      .map((crew) => (
                        <option key={crew.id} value={crew.id}>{crew.name}</option>
                      ))}
                  </select>
                ) : (
                  <small>{progress.conciseLabel}</small>
                )}
              {(() => {
                const released = tradeWork.filter((item) => item.release === 'released');
                const anyAccepted = released.some((item) => item.property === 'property-accepted');
                const anyBlocked = released.some((item) => item.access !== 'clear');
                const canDelete = Boolean(onSetTradeRelease) && released.length > 0 && !anyAccepted;
                const canBlock = Boolean(onRequestBlock) && released.length > 0 && !anyBlocked;
                if (!canDelete && !canBlock) return null;
                return (
                  <button
                    aria-label={`More ${tradeLabel(trade)} options`}
                    className="track-c-trade-more"
                    onClick={() =>
                      setOpenMenu(openMenu === `more:${trade}` ? null : `more:${trade}`)}
                    type="button"
                  >
                    ⋯
                  </button>
                );
              })()}
            </header>
            {(() => {
              // Which day this trade came onto the wall + which day Los crewed
              // it — so he can reconcile the unit against his physical board.
              let earliest = '';
              for (const item of tradeWork) {
                if (item.release !== 'released' || !item.releasedAt) continue;
                if (!earliest || item.releasedAt < earliest) earliest = item.releasedAt;
              }
              if (!earliest) return null;
              const assigned = assignedDayOf(state, unitId, trade);
              return (
                <p className="track-c-unit-released">
                  Released {new Date(earliest).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })} · {tradeLabel(trade)}
                  {assigned ? ` · assigned ${assigned}` : ''}
                </p>
              );
            })()}
            {(() => {
              // Joseph added a room to an already-walked unit (e.g. a common-area
              // touch-up on 507 after A/B/C were approved). The new room re-opens
              // the unit — it can't be "done" until that room is finished and the
              // property re-walks. Make that explicit so Los isn't surprised.
              const released = tradeWork.filter((item) => item.release === 'released');
              const accepted = released.filter((item) => item.property === 'property-accepted');
              const reopened = released.filter((item) =>
                item.property !== 'property-accepted' && !item.callbackOpen);
              if (accepted.length === 0 || reopened.length === 0) return null;
              return (
                <p className="track-c-rewalk-note">
                  New work added ({reopened.map((item) => trackCSectionLabel(item.section)).join(', ')})
                  — finish it, then the property re-walks {unit.unitNumber}. The
                  already-approved rooms stay approved.
                </p>
              );
            })()}
            {onSetTradeRelease
              && tradeWork.filter((item) => item.release === 'released').length === 0 ? (
                <WholeUnitReleaseControl
                  onRelease={(workType) => onSetTradeRelease(unitId, trade, true, workType)}
                  trade={trade}
                />
              ) : null}
            {(() => {
              const released = tradeWork.filter((item) => item.release === 'released');
              return released.length > 0 && released.some((item) =>
                item.property === 'property-accepted') ? (
                  <p className="track-c-release-locked">
                    Some {tradeLabel(trade)} rooms are property-approved — delete
                    the extra rooms one by one (hold a room) so the approved work
                    stays.
                  </p>
                ) : null;
            })()}
            {(() => {
              const blockedItems = tradeWork.filter((item) =>
                item.release === 'released' && item.access !== 'clear');
              if (blockedItems.length === 0) return null;
              const reason = (blockedItems[0].restrictionLabel ?? '')
                .replace(/^Blocked — /u, '') || 'no reason recorded';
              return (
                <div className="track-c-blocked-banner" role="status">
                  <ShieldAlert aria-hidden="true" size={16} />
                  <span><strong>Blocked</strong> — {reason}</span>
                  {onUnblockUnit ? (
                    <button
                      data-track-c-critical-target="true"
                      onClick={() => onUnblockUnit(unitId, trade)}
                      type="button"
                    >
                      Unblock {tradeLabel(trade)}
                    </button>
                  ) : null}
                </div>
              );
            })()}
            {openMenu === `more:${trade}` ? (
              <>
                <button
                  aria-label="Close menu"
                  className="track-c-menu-backdrop"
                  onClick={() => setOpenMenu(null)}
                  type="button"
                />
                <div className="track-c-popmenu track-c-popmenu--trade">
                  {(() => {
                    const released = tradeWork.filter((item) => item.release === 'released');
                    const anyAccepted = released.some((item) => item.property === 'property-accepted');
                    return onSetTradeRelease && released.length > 0 && !anyAccepted ? (
                      <button
                        className="is-remove"
                        onClick={() => { setOpenMenu(null); onSetTradeRelease(unitId, trade, false); }}
                        type="button"
                      >
                        Delete all {tradeLabel(trade)} from {unit.unitNumber}
                      </button>
                    ) : null;
                  })()}
                  {(() => {
                    const anyBlocked = tradeWork.some((item) =>
                      item.release === 'released' && item.access !== 'clear');
                    return onRequestBlock
                      && tradeWork.some((item) => item.release === 'released')
                      && !anyBlocked ? (
                        <button
                          onClick={() => { setOpenMenu(null); onRequestBlock(unitId, trade); }}
                          type="button"
                        >
                          Block {tradeLabel(trade)} — locked out / occupied / hold
                        </button>
                      ) : null;
                  })()}
                </div>
              </>
            ) : null}
            {/* An open callback is the one thing to deal with — while it's open,
                show ONLY "Callback fixed" and hide the pass/approve/open actions
                so the panel isn't a wall of buttons. They come back once it clears. */}
            {canRecordTradeComplete && !anyCallbackOpen ? (
              <button
                className="track-c-trade-complete"
                data-track-c-critical-target="true"
                onClick={() => onTradeComplete(unitId, trade)}
                type="button"
              >
                Crew reports {tradeLabel(trade)} complete
              </button>
            ) : null}
            {anyCallbackOpen ? (() => {
              // Every room currently on callback — Los sees exactly which rooms,
              // and clears them ONE AT A TIME as the crew finishes each (several
              // rooms can be on callback at once).
              const callbackRooms = tradeWork.filter((item) =>
                item.release === 'released' && item.callbackOpen);
              return (
                <div className="track-c-callback-open">
                  <p className="track-c-callback-rooms">
                    ⚠ Callback — go fix{' '}
                    <strong>
                      {callbackRooms.map((item) => trackCSectionLabel(item.section)).join(', ')}
                    </strong>
                    {' '}in {tradeLabel(trade)}.
                  </p>
                  {onResolveSectionCallback ? (
                    <div className="track-c-callback-fix">
                      <span className="track-c-callback-fix__label">Fixed &amp; checked:</span>
                      <div className="track-c-callback-fix__chips">
                        {callbackRooms.map((item) => (
                          <button
                            className="track-c-callback-fix__chip"
                            data-track-c-critical-target="true"
                            key={trackCWorkKey(item)}
                            onClick={() => onResolveSectionCallback(unitId, trade, item.section)}
                            type="button"
                          >
                            ✓ {trackCSectionLabel(item.section)} fixed
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : onResolveCallback ? (
                    <button
                      className="track-c-trade-complete track-c-trade-lospass"
                      data-track-c-critical-target="true"
                      onClick={() => onResolveCallback(unitId, trade)}
                      type="button"
                    >
                      Callback fixed — {tradeLabel(trade)} passes, back to walk
                    </button>
                  ) : null}
                </div>
              );
            })() : null}
            {onTradePass && !anyCallbackOpen && tradeWork.some((item) =>
              item.release === 'released'
              && item.access === 'clear'
              && item.inspection === 'needs-los-inspection') ? (
                <button
                  className="track-c-trade-complete track-c-trade-lospass"
                  data-track-c-critical-target="true"
                  onClick={() => onTradePass(unitId, trade)}
                  type="button"
                >
                  Los passed {tradeLabel(trade)} — my inspection
                </button>
              ) : null}
            {onPdsApprove && !anyCallbackOpen && tradeWork.some((item) =>
              item.release === 'released'
              && item.inspection === 'los-passed'
              && item.property !== 'property-accepted') ? (
                <button
                  className={`track-c-trade-complete track-c-pds-approve ${pdsConfirmTrade === trade ? 'is-arming' : ''}`}
                  data-track-c-critical-target="true"
                  onClick={() => {
                    if (pdsConfirmTrade === trade) {
                      setPdsConfirmTrade(undefined);
                      onPdsApprove(unitId, trade);
                      return;
                    }
                    setPdsConfirmTrade(trade);
                  }}
                  type="button"
                >
                  {pdsConfirmTrade === trade
                    ? `Tap again to confirm — ${tradeLabel(trade)} accepted by the property`
                    : `PDS approved — walked ${tradeLabel(trade)} with the property`}
                </button>
              ) : null}
            {(() => {
              // Pick the ROOM that failed the walk — only that room goes back to
              // callback, so Los knows exactly where to send the crew. Stays
              // available even when OTHER rooms are already on callback, so he
              // can call back several rooms of the same unit independently.
              const callbackable = tradeWork.filter((item) =>
                item.release === 'released'
                && !item.callbackOpen
                && (item.inspection === 'los-passed' || item.property === 'property-accepted'));
              if (callbackable.length === 0) return null;
              if (onOpenSectionCallback) {
                const drafting = callbackDraft?.trade === trade ? callbackDraft : null;
                return (
                  <div className="track-c-callback-pick">
                    <span className="track-c-callback-pick__label">
                      {anyCallbackOpen
                        ? 'Callback another room:'
                        : 'Callback a room that needs fixing:'}
                    </span>
                    {drafting ? (
                      <div className="track-c-callback-reason">
                        <span className="track-c-callback-reason__room">
                          Callback {drafting.section === 'common' ? 'Common' : drafting.section} — what needs fixing?
                        </span>
                        <input
                          autoFocus
                          onChange={(event) =>
                            setCallbackDraft({ ...drafting, reason: event.target.value })}
                          placeholder="e.g. touch-up needs a redo · better look at the cut-in"
                          value={drafting.reason}
                        />
                        <div className="track-c-callback-reason__actions">
                          <button
                            className="track-c-callback-reason__send"
                            data-track-c-critical-target="true"
                            onClick={() => {
                              onOpenSectionCallback(unitId, trade, drafting.section, drafting.reason);
                              setCallbackDraft(null);
                            }}
                            type="button"
                          >
                            Call back &amp; text the crew
                          </button>
                          <button
                            className="track-c-callback-reason__cancel"
                            onClick={() => setCallbackDraft(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="track-c-callback-pick__chips">
                        {callbackable.map((item) => (
                          <button
                            className="track-c-callback-pick__chip"
                            data-track-c-critical-target="true"
                            key={trackCWorkKey(item)}
                            onClick={() => setCallbackDraft({ reason: '', section: item.section, trade })}
                            type="button"
                          >
                            {trackCSectionLabel(item.section)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return onOpenCallback ? (
                <button
                  className="track-c-callback-link"
                  onClick={() => onOpenCallback(unitId, trade)}
                  type="button"
                >
                  Open a callback — {tradeLabel(trade)} needs to be fixed
                </button>
              ) : null;
            })()}
            {(() => {
              // The unit page shows the ROOMS BEING WORKED (released). Deleting a
              // room drops it out of this list and into the "add a room" strip —
              // so 1608 shows only B when only B was released, exactly like Los
              // reads it off Joseph's sheet.
              const releasedWork = tradeWork.filter((item) => item.release === 'released');
              const addableWork = tradeWork.filter((item) => item.release !== 'released');
              return (
                <>
                  <div className="track-c-section-list">
                    {releasedWork.map((item) => {
                      const key = trackCWorkKey(item);
                      return (
                        <WorkSection
                          isSelected={selectedKey === key}
                          key={key}
                          unitNumber={unit.unitNumber}
                          onToggleRelease={onSetSectionRelease
                            ? (released) => onSetSectionRelease(
                              { unitId: item.unitId, trade: item.trade, section: item.section },
                              released,
                            )
                            : undefined}
                          onSetWorkType={onSetSectionWorkType
                            ? (workType) => onSetSectionWorkType(
                              { unitId: item.unitId, trade: item.trade, section: item.section },
                              workType,
                            )
                            : undefined}
                          onUpgradeCutInToFull={onUpgradeCutInToFull
                            ? (attribution) => onUpgradeCutInToFull(
                              { unitId: item.unitId, trade: item.trade, section: item.section },
                              attribution,
                            )
                            : undefined}
                          onAction={(action) =>
                            onSectionAction(
                              { unitId: item.unitId, trade: item.trade, section: item.section },
                              action,
                            )}
                          onRequestMirror={() =>
                            onRequestMirror({ unitId: item.unitId, trade: item.trade, section: item.section })}
                          onSelect={() =>
                            setSelectedKey((current) => (current === key ? undefined : key))}
                          state={state}
                          work={item}
                        />
                      );
                    })}
                    {releasedWork.length === 0 ? (
                      <p className="track-c-section-row__note">
                        Nothing released for {tradeLabel(trade)} yet — add the rooms
                        Joseph released below.
                      </p>
                    ) : null}
                  </div>
                  {onSetSectionRelease && addableWork.length > 0 ? (
                    <div className="track-c-addrooms">
                      <span>Add a room Joseph released:</span>
                      <div className="track-c-addrooms__chips">
                        {addableWork.map((item) => (
                          <button
                            data-track-c-critical-target="true"
                            key={trackCWorkKey(item)}
                            onClick={() => onSetSectionRelease(
                              { unitId: item.unitId, trade: item.trade, section: item.section },
                              true,
                            )}
                            type="button"
                          >
                            + {trackCSectionLabel(item.section)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              );
            })()}
          </section>
        );
      })}
      {focusTrade && !showOtherTrade ? (
        <button
          className="track-c-show-other-trade"
          onClick={() => setShowOtherTrade(true)}
          type="button"
        >
          Show {focusTrade === 'paint' ? 'Clean' : 'Paint'} for this unit too
        </button>
      ) : null}
      <UnitPhotoStrip photos={photosForUnit} unitNumber={unit.unitNumber} />
      <details className="track-c-manage">
        <summary>Manage this unit — notes, rooms, move</summary>
        <div className="track-c-manage__body">
      <div className="track-c-util-row">
        <button
          aria-expanded={openMenu === 'add'}
          className="track-c-addmenu-trigger"
          data-track-c-critical-target="true"
          onClick={() => setOpenMenu(openMenu === 'add' ? null : 'add')}
          type="button"
        >
          <span aria-hidden="true">＋</span> Official change-order form · photo
        </button>
        {openMenu === 'add' ? (
          <>
            <button
              aria-label="Close menu"
              className="track-c-menu-backdrop"
              onClick={() => setOpenMenu(null)}
              type="button"
            />
            <div className="track-c-popmenu">
              <button
                onClick={() => {
                  setOpenMenu(null);
                  const summary = `Change order — Unit ${unit.unitNumber} (${trackCUnitMakeupLabel(unit)}). `
                    + 'Reason: tub resurface / wall hole larger than a quarter / other (edit). '
                    + 'Flagged from Turn OS.';
                  void navigator.clipboard?.writeText(summary).catch(() => undefined);
                  window.open(
                    OFFICIAL_PDS_LINKS.find((link) => link.id === 'change-order')?.url,
                    '_blank',
                    'noopener,noreferrer',
                  );
                }}
                type="button"
              >
                Submit official change order (JotForm)
              </button>
              {onCommitUnitPhoto ? (
                <UnitPhotoAddButton
                  compact
                  onCommitPhoto={(photo) => {
                    setOpenMenu(null);
                    return onCommitUnitPhoto(photo);
                  }}
                  projectId={state.propertyId}
                  unitId={unitId}
                  unitNumber={unit.unitNumber}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {onSetUnitBeds ? (() => {
        // Joseph gives rooms Turn OS didn't know a unit had (a "studio" that's
        // really got beds). Set the rooms right here — can't drop below a room
        // that already has released work.
        const bedLetters = ['A', 'B', 'C', 'D', 'E'] as const;
        const currentBeds = unit.applicableSections
          .filter((section) => section !== 'common').length;
        const highestReleasedBed = work
          .filter((item) => item.release === 'released' && item.section !== 'common')
          .reduce((max, item) => Math.max(max, bedLetters.indexOf(item.section as 'A') + 1), 0);
        return (
          <div className="track-c-rooms-editor">
            <h3>Rooms</h3>
            <div className="track-c-rooms-editor__choices" role="group" aria-label="Rooms in this unit">
              {[0, 2, 3, 4, 5].map((beds) => (
                <button
                  aria-pressed={currentBeds === beds}
                  disabled={beds < highestReleasedBed}
                  key={beds}
                  onClick={() => onSetUnitBeds(unitId, beds)}
                  type="button"
                >
                  {beds === 0 ? 'Studio' : `A–${bedLetters[beds - 1]}`}
                </button>
              ))}
            </div>
            <small>Common area stays. Release only the rooms Joseph gave you.</small>
          </div>
        );
      })() : null}
      {onMoveUnitTrade && work.some((item) => item.release === 'released') ? (
        <div className="track-c-move-unit">
          {moveTrade ? (
            <>
              <span>Move {tradeLabel(moveTrade)} from {unit.unitNumber} to unit #</span>
              <div className="track-c-move-unit__row">
                <input
                  aria-label="Target unit number"
                  inputMode="numeric"
                  onChange={(event) => setMoveTarget(event.target.value)}
                  placeholder="1103"
                  type="text"
                  value={moveTarget}
                />
                <button
                  disabled={!moveTarget.trim()}
                  onClick={() => {
                    onMoveUnitTrade(unitId, moveTrade, moveTarget.trim());
                    setMoveTarget('');
                    setMoveTrade(null);
                  }}
                  type="button"
                >
                  Move
                </button>
                <button className="is-cancel" onClick={() => setMoveTrade(null)} type="button">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="track-c-move-unit__triggers">
              <span>Wrong unit? Move the release:</span>
              {[...new Set(work.filter((item) => item.release === 'released').map((item) => item.trade))]
                .map((trade) => (
                  <button key={trade} onClick={() => setMoveTrade(trade)} type="button">
                    Move {tradeLabel(trade)}
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : null}
        </div>
      </details>
    </article>
  );
};

// The WALL view — his paper board, page per floor: unit rows with a Paint
// and a Clean cell carrying the board's own marks ("/" released, name =
// working, X = crew done, PASS = Los passed, CC = approved in that pay
// week's color).
// Pay-week numbering (payWeekNumberOf / wallWeekColor) lives in ./wallWeek and
// matches Home/Crews: the week of Sun Aug 2 2026 is week 2 (green), the week
// before it is week 1 (yellow), Aug 9–15 is week 3 (pink).

const wallFloorOf = (unitNumber: string): string => {
  const digits = unitNumber.replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, -2) : 'Other';
};

const WallGrid = ({
  state,
  trade,
  onOpenUnitTrade,
}: {
  state: TrackCState;
  trade: TrackCTrade;
  onOpenUnitTrade: (unitId: string, trade: TrackCTrade) => void;
}) => {
  const [query, setQuery] = useState('');
  const floors = useMemo(() => {
    const seen = new Set<string>();
    for (const unit of state.units) seen.add(wallFloorOf(unit.unitNumber));
    return [...seen].sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }));
  }, [state.units]);
  const [floor, setFloor] = useState<string>(() => {
    try {
      return window.localStorage.getItem('turn-os:wall-floor') ?? '';
    } catch {
      return '';
    }
  });
  // Los can correct a unit's pay-week chip when the release date lands it on the
  // wrong week — tap the chip to cycle w1 → w2 → w3 → back to auto. Overrides are
  // device-local, keyed by unit:trade.
  const [weekOverrides, setWeekOverrides] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem('turn-os:wall-week-v2') ?? '{}');
    } catch {
      return {};
    }
  });
  const cycleWeek = (unitId: string, _computed: number | undefined) => {
    const key = `${unitId}:${trade}`;
    setWeekOverrides((current) => {
      const next = { ...current };
      // Cycle through EVERY week and back to auto so Los can reach any of them:
      // auto → w1 → w2 → w3 → auto. (Before, it only stepped up from the
      // computed week, so from week 3 he could never get back down to week 1.)
      const cur = current[key];
      if (cur === undefined) next[key] = 1;
      else if (cur >= 3) delete next[key];
      else next[key] = cur + 1;
      try {
        window.localStorage.setItem('turn-os:wall-week-v2', JSON.stringify(next));
      } catch {
        // Session-only then.
      }
      return next;
    });
  };
  const activeFloor = floors.includes(floor) ? floor : floors[0];
  const pickFloor = (next: string) => {
    setFloor(next);
    try {
      window.localStorage.setItem('turn-os:wall-floor', next);
    } catch {
      // Session-only then.
    }
  };
  // Swipe left/right to flip floors like paging his paper board.
  const swipeStartX = useRef<number | null>(null);
  const stepFloor = (direction: 1 | -1) => {
    const index = floors.indexOf(activeFloor);
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < floors.length) pickFloor(floors[nextIndex]);
  };
  // His paper board: room columns, then the crew, then approval.
  const ROOM_COLUMNS: readonly TrackCSection[] = ['common', 'A', 'B', 'C', 'D', 'E'];
  const cellFor = (unitId: string, section: TrackCSection) => {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit?.workFacts.some((fact) => fact.trade === trade && fact.section === section)) {
      return { cls: 'is-na', mark: '', sub: '' };
    }
    const work = projectTrackCWork(state, { section, trade, unitId });
    if (!work || work.release !== 'released') return { cls: 'is-empty', mark: '\u2014', sub: '' };
    // Paint task on this room (full / cut-in / touch-up \u2026) so the wall shows WHAT
    // work each room got, not just its status. Clean has no task type.
    const sub = trade === 'paint' && work.workType ? WALL_WORKTYPE_ABBR[work.workType] : '';
    if (work.property === 'property-accepted') {
      // Wall SOP: the CC highlight color follows the unit's week. By default
      // that's the pay week it was APPROVED (automatic from the approval date),
      // but if Los corrected the week with the w# chip, the CC color follows his
      // correction — one week per unit, chip and CC always agree.
      const override = weekOverrides[`${unitId}:${trade}`];
      const latest = state.events
        .filter((event) =>
          event.eventType === 'property-accepted'
          && event.target.unitId === unitId
          && event.target.trade === trade
          && event.target.section === section)
        .reduce((max, event) => (event.recordedAt > max ? event.recordedAt : max), '');
      const ccWeek = override ?? payWeekNumberOf(latest || new Date().toISOString());
      return { cls: `is-cc wall-wk${wallWeekColor(ccWeek)}`, mark: 'CC', sub };
    }
    if (work.callbackOpen) return { cls: 'is-cb', mark: 'CB', sub };
    if (work.access !== 'clear') return { cls: 'is-blocked', mark: 'W', sub };
    if (work.inspection === 'los-passed') return { cls: 'is-passed', mark: '\u2713', sub };
    if (work.execution === 'crew-reported-complete') return { cls: 'is-done', mark: 'X', sub };
    return { cls: 'is-open', mark: '/', sub };
  };
  const crewFor = (unitId: string) => {
    const names = new Set<string>();
    for (const work of projectTrackCUnitWork(state, unitId)) {
      if (work.trade !== trade || work.release !== 'released') continue;
      for (const crewId of work.activeCrewIds) {
        const name = state.crews.find((crew) => crew.id === crewId)?.name;
        if (name) names.add(name.split(' ')[0]);
      }
    }
    return [...names].join('+');
  };
  // The pay week this unit's work entered the board (earliest release of any of
  // this trade's rooms). Drives the little week chip so Los sees the Turn build
  // up week by week and can rebuild the wall in the order units came on.
  const releaseWeekOf = (unitId: string): number | undefined => {
    const override = weekOverrides[`${unitId}:${trade}`];
    if (override !== undefined) return override; // Los corrected it by hand.
    let earliest = '';
    for (const work of projectTrackCUnitWork(state, unitId)) {
      if (work.trade !== trade || work.release !== 'released' || !work.releasedAt) continue;
      if (!earliest || work.releasedAt < earliest) earliest = work.releasedAt;
    }
    return earliest ? payWeekNumberOf(earliest) : undefined;
  };
  const trimmed = query.trim().toLowerCase();
  const rows = (trimmed
    ? state.units.filter((unit) => unit.unitNumber.toLowerCase().includes(trimmed))
    : state.units.filter((unit) => wallFloorOf(unit.unitNumber) === activeFloor))
    .sort((left, right) =>
      compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
  return (
    <div className="track-c-wall">
      <label className="track-c-wall__search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label="Search units on the wall grid"
          inputMode="numeric"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search unit\u2026"
          type="search"
          value={query}
        />
      </label>
      {!trimmed ? (
        <div className="track-c-wall__floors" role="group" aria-label="Floor">
          {floors.map((candidate) => (
            <button
              aria-pressed={candidate === activeFloor}
              key={candidate}
              onClick={() => pickFloor(candidate)}
              type="button"
            >
              {candidate === 'Other' ? 'Other' : `Floor ${candidate}`}
            </button>
          ))}
        </div>
      ) : null}
      <p className="track-c-wall__legend">
        Whole Turn · every unit, all days. Marks: / released · X crew done ·
        ✓ passed · CC approved (highlight color = the unit's week)
        · CB callback · W waiting/blocked. Tap the
        {' '}<em className="track-c-wall__wk wall-wk0">w#</em> chip to set the week
        — w1 → w2 → w3 → auto — and the CC color follows it.
      </p>
      <div
        aria-label={`${trade === 'paint' ? 'Paint' : 'Clean'} wall grid`}
        className="track-c-wall__grid is-rooms"
        onTouchEnd={(event) => {
          if (swipeStartX.current === null || trimmed) return;
          const delta = event.changedTouches[0].clientX - swipeStartX.current;
          swipeStartX.current = null;
          if (Math.abs(delta) > 55) stepFloor(delta < 0 ? 1 : -1);
        }}
        onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }}
        role="table"
      >
        <div className="track-c-wall__head" role="row">
          <span role="columnheader">Unit</span>
          <span role="columnheader">Com</span>
          <span role="columnheader">A</span>
          <span role="columnheader">B</span>
          <span role="columnheader">C</span>
          <span role="columnheader">D</span>
          <span role="columnheader">E</span>
          <span role="columnheader">Crew</span>
        </div>
        {rows.map((unit) => (
          <button
            aria-label={`Open unit ${unit.unitNumber} ${trade}`}
            className="track-c-wall__row"
            key={unit.id}
            onClick={() => onOpenUnitTrade(unit.id, trade)}
            role="row"
            type="button"
          >
            <span className="track-c-wall__unit" role="rowheader">
              {unit.unitNumber}
              {(() => {
                const wk = releaseWeekOf(unit.id);
                return wk === undefined ? null : (
                  <span
                    aria-label={`Week ${wk} — tap to change`}
                    className={`track-c-wall__wk wall-wk${wallWeekColor(wk)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      cycleWeek(unit.id, wk);
                    }}
                    role="button"
                    title="Tap to change the pay week"
                  >
                    w{wk}
                  </span>
                );
              })()}
            </span>
            {ROOM_COLUMNS.map((section) => {
              const cell = cellFor(unit.id, section);
              return (
                <span
                  className={`track-c-wall__cell ${cell.cls}`}
                  key={section}
                  role="cell"
                >
                  <span className="track-c-wall__mark">{cell.mark}</span>
                  {cell.sub ? <em className="track-c-wall__wt">{cell.sub}</em> : null}
                </span>
              );
            })}
            <span className="track-c-wall__crew" role="cell">{crewFor(unit.id)}</span>
          </button>
        ))}
        {rows.length === 0 ? (
          <p className="track-c-wall__empty">
            {trimmed ? 'No unit matches.' : 'No units on this floor.'}
          </p>
        ) : null}
      </div>
      <p className="track-c-wall__legend">
        / released \u00b7 X crew done \u00b7 \u2713 Los passed \u00b7
        CC approved (color = pay week) \u00b7 CB callback \u00b7 W blocked
      </p>
    </div>
  );
};

export const BoardView = ({
  state,
  selectedUnitId,
  focusTradeHint,
  onOpenUnit,
  onCloseUnit,
  onSectionAction,
  onTradeComplete,
  onQuickAssign,
  onChangeCrew,
  onRequestAssign,
  onRequestNote,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onRequestMirror,
  unitNotes,
  unitPhotos,
  onCommitUnitPhoto,
  onPdsApprove,
  onOpenCallback,
  onOpenSectionCallback,
  onResolveSectionCallback,
  onTradePass,
  onResolveCallback,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetSectionWorkType,
  onUpgradeCutInToFull,
  onSetTradeRelease,
  onSetUnitBeds,
  onMoveUnitTrade,
}: BoardViewProps) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'released' | 'working' | 'callbacks' | 'approved' | 'all'>('released');
  // The wall board keeps Paint and Clean as separate boards — mirror that.
  const [boardTrade, setBoardTrade] = useState<TrackCTrade>(() => {
    try {
      const stored = window.localStorage.getItem('turn-os:board-trade');
      return stored === 'clean' ? 'clean' : 'paint';
    } catch {
      return 'paint';
    }
  });
  const pickBoardTrade = (trade: TrackCTrade) => {
    setBoardTrade(trade);
    try {
      window.localStorage.setItem('turn-os:board-trade', trade);
    } catch {
      // Storage full — the toggle still works for this session.
    }
  };
  const [focusTrade, setFocusTrade] = useState<TrackCTrade>();
  // The TurnBoard IS the wall grid now — one per trade, like his paper.
  const boardMode: 'list' | 'wall' = 'wall';
  const tradeWorkFor = (unitId: string) =>
    projectTrackCUnitWork(state, unitId).filter((work) => work.trade === boardTrade);
  const unitWorkHas = (unitId: string, predicate: (work: TrackCWorkProjection) => boolean) =>
    tradeWorkFor(unitId).some(predicate);
  // Approved on a trade board = every released section of THIS trade accepted
  // (the wall board keeps Paint and Clean separate, so we do too).
  const isApproved = (unitId: string) => {
    const released = tradeWorkFor(unitId)
      .filter((work) => work.release === 'released');
    return released.length > 0
      && released.every((work) => work.property === 'property-accepted');
  };
  const isWorking = (unitId: string) =>
    unitWorkHas(unitId, (work) =>
      work.release === 'released'
      && (work.execution === 'working' || work.execution === 'assigned'));
  const hasCallback = (unitId: string) =>
    unitWorkHas(unitId, (work) => work.callbackOpen);
  // Paint finished but clean not done yet — these turn over first (they are
  // already painted), so they sort to the top and get a "Clean next" tag.
  const isCleanNext = (unitId: string) => {
    const work = projectTrackCUnitWork(state, unitId);
    const paint = work.filter((item) => item.trade === 'paint' && item.release === 'released');
    const clean = work.filter((item) => item.trade === 'clean');
    const paintDone = paint.length > 0 && paint.every((item) =>
      item.property === 'property-accepted' || item.inspection === 'los-passed');
    const cleanDone = clean.some((item) => item.release === 'released')
      && clean.filter((item) => item.release === 'released')
        .every((item) => item.property === 'property-accepted');
    return paintDone && !cleanDone;
  };
  const units = useMemo(() => {
    const prioritized = (list: readonly TrackCCompactUnitProjection[]) =>
      [...list].sort((left, right) =>
        Number(isCleanNext(right.unitId)) - Number(isCleanNext(left.unitId)));
    const matches = prioritized(searchTrackCCompactUnits(state, query));
    if (scope === 'all') return matches;
    if (scope === 'approved') {
      const latestAccepted = (unitId: string) =>
        state.events
          .filter((event) =>
            event.eventType === 'property-accepted'
            && event.target.unitId === unitId
            && event.target.trade === boardTrade)
          .reduce((latest, event) =>
            event.recordedAt > latest ? event.recordedAt : latest, '');
      return matches
        .filter((unit) => isApproved(unit.unitId))
        .sort((left, right) =>
          latestAccepted(right.unitId).localeCompare(latestAccepted(left.unitId)));
    }
    if (scope === 'working') return matches.filter((unit) => isWorking(unit.unitId));
    if (scope === 'callbacks') return matches.filter((unit) => hasCallback(unit.unitId));
    // Released = still IN PLAY for this trade: not blocked, not fully
    // accepted. Finished units live under Approved; blocked under Waiting.
    return matches.filter((unit) => {
      const work = tradeWorkFor(unit.unitId)
        .filter((item) => item.release === 'released');
      if (work.length === 0) return false;
      if (work.every((item) => item.property === 'property-accepted')) return false;
      return work.some((item) =>
        item.access === 'clear' && item.property !== 'property-accepted');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardTrade, query, scope, state]);
  const releasedCount = useMemo(() => state.units.filter((unit) => {
    const work = projectTrackCUnitWork(state, unit.id)
      .filter((item) => item.trade === boardTrade && item.release === 'released');
    if (work.length === 0) return false;
    if (work.every((item) => item.property === 'property-accepted')) return false;
    return work.some((item) =>
      item.access === 'clear' && item.property !== 'property-accepted');
  }).length, [boardTrade, state]);
  const approvedCount = useMemo(() => state.units.filter((unit) =>
    isApproved(unit.id)).length, [boardTrade, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const workingCount = useMemo(() => state.units.filter((unit) =>
    isWorking(unit.id)).length, [boardTrade, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const callbackCount = useMemo(() => state.units.filter((unit) =>
    hasCallback(unit.id)).length, [boardTrade, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedUnitId) {
    return (
      <UnitDetail
        focusTrade={focusTrade ?? focusTradeHint ?? boardTrade}
        onPdsApprove={onPdsApprove}
        onOpenCallback={onOpenCallback}
        onOpenSectionCallback={onOpenSectionCallback}
        onResolveSectionCallback={onResolveSectionCallback}
        onTradePass={onTradePass}
        onResolveCallback={onResolveCallback}
        onUnblockUnit={onUnblockUnit}
        onRequestBlock={onRequestBlock}
        onSetSectionRelease={onSetSectionRelease}
        onSetSectionWorkType={onSetSectionWorkType}
        onUpgradeCutInToFull={onUpgradeCutInToFull}
        onSetTradeRelease={onSetTradeRelease}
        onSetUnitBeds={onSetUnitBeds}
        onMoveUnitTrade={onMoveUnitTrade}
        onClose={onCloseUnit}
        onQuickAssign={onQuickAssign}
        onChangeCrew={onChangeCrew}
        onRequestAssign={onRequestAssign}
        onRequestNote={onRequestNote}
        onAddNote={onAddNote}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
        onRequestMirror={onRequestMirror}
        onSectionAction={onSectionAction}
        onTradeComplete={onTradeComplete}
        state={state}
        unitId={selectedUnitId}
        unitNotes={unitNotes}
        unitPhotos={unitPhotos}
        onCommitUnitPhoto={onCommitUnitPhoto}
      />
    );
  }

  return (
    <section className="track-c-board" aria-labelledby="track-c-board-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-board-heading">{state.terminology.boardName}</h1>
          <p>Paper TurnBoard is official</p>
        </div>
        <span>{boardMode === 'wall' ? 'Wall board' : `${units.length} Units`}</span>
      </header>
      <div className="track-c-board-trade" role="group" aria-label="Paint or Clean wall grid">
        <button
          aria-pressed={boardTrade === 'paint'}
          onClick={() => pickBoardTrade('paint')}
          type="button"
        >
          <Paintbrush aria-hidden="true" size={15} /> Paint
        </button>
        <button
          aria-pressed={boardTrade === 'clean'}
          onClick={() => pickBoardTrade('clean')}
          type="button"
        >
          <Droplets aria-hidden="true" size={15} /> Clean
        </button>
      </div>
      {boardMode === 'wall' ? (
        <WallGrid
          onOpenUnitTrade={(unitId, trade) => {
            setFocusTrade(trade);
            onOpenUnit(unitId, trade);
          }}
          state={state}
          trade={boardTrade}
        />
      ) : (
      <>
      <div className="track-c-board-trade" role="group" aria-label="Paint or Clean board">
        <button
          aria-pressed={boardTrade === 'paint'}
          onClick={() => pickBoardTrade('paint')}
          type="button"
        >
          <Paintbrush aria-hidden="true" size={15} /> Paint board
        </button>
        <button
          aria-pressed={boardTrade === 'clean'}
          onClick={() => pickBoardTrade('clean')}
          type="button"
        >
          <Droplets aria-hidden="true" size={15} /> Clean board
        </button>
      </div>
      <p className="track-c-board-turnline">
        <strong>Whole Turn</strong> · {boardTrade === 'paint' ? 'Paint' : 'Clean'} across every day
        {' · '}{releasedCount} in play · {workingCount} working · {approvedCount} approved
      </p>
      <div className="track-c-board-scope" role="group" aria-label="Board scope">
        <button
          aria-pressed={scope === 'released'}
          onClick={() => setScope('released')}
          type="button"
        >
          Released · {releasedCount}
        </button>
        <button
          aria-pressed={scope === 'working'}
          onClick={() => setScope('working')}
          type="button"
        >
          Working · {workingCount}
        </button>
        <button
          aria-pressed={scope === 'callbacks'}
          onClick={() => setScope('callbacks')}
          type="button"
        >
          Callbacks · {callbackCount}
        </button>
        <button
          aria-pressed={scope === 'approved'}
          onClick={() => setScope('approved')}
          type="button"
        >
          Approved · {approvedCount}
        </button>
        <button
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
          type="button"
        >
          All Units · {state.units.length}
        </button>
      </div>
      <label className="track-c-search">
        <Search aria-hidden="true" size={18} />
        <span className="track-c-visually-hidden">Search Unit, location, or crew</span>
        <input
          inputMode="search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Units or crews"
          type="search"
          value={query}
        />
      </label>
      <div className="track-c-unit-list">
        {units.length > 0 ? (
          units.map((unit) => (
            <CompactUnitRow
              blocked={tradeWorkFor(unit.unitId).some((item) =>
                item.release === 'released' && item.access !== 'clear')}
              cleanNext={boardTrade === 'clean' && isCleanNext(unit.unitId)}
              key={unit.unitId}
              onOpen={() => {
                setFocusTrade(boardTrade);
                onOpenUnit(unit.unitId, boardTrade);
              }}
              state={state}
              trade={boardTrade}
              unit={unit}
            />
          ))
        ) : (
          <div className="track-c-empty">
            <Search aria-hidden="true" size={24} />
            <h2>{query.trim() ? 'No matching Units' : 'Nothing here yet'}</h2>
            <p>
              {query.trim()
                ? 'Clear the search to return to the board.'
                : scope === 'released'
                  ? 'Nothing is in play on this board — All Units shows the whole roster.'
                  : 'Nothing matches this view yet.'}
            </p>
          </div>
        )}
      </div>
      </>
      )}
    </section>
  );
};
