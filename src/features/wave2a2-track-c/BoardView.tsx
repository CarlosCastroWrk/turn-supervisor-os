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
import {
  TRACK_C_TRADES,
  type TrackCCompactUnitProjection,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
  paintWorkTypeLabel,
  paintWorkTypeNote,
  trackCSectionLabel,
  trackCWorkKey,
} from './model';
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
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
  readonly onRequestMirror: (target: TrackCWorkTarget) => void;
  readonly unitNotes?: readonly { id: string; unitId: string; text: string; createdAt: string }[];
  readonly unitPhotos?: readonly PhotoNote[];
  readonly onCommitUnitPhoto?: UnitPhotoCommitter;
  readonly onPdsApprove?: (unitId: string, trade: TrackCTrade) => void;
  readonly onOpenCallback?: (unitId: string, trade: TrackCTrade) => void;
  readonly onTradePass?: (unitId: string, trade: TrackCTrade) => void;
  readonly onResolveCallback?: (unitId: string, trade: TrackCTrade) => void;
  readonly onUnblockUnit?: (unitId: string, trade: TrackCTrade) => void;
  readonly onRequestBlock?: (unitId: string, trade: TrackCTrade) => void;
  readonly onSetSectionWorkType?: (
    target: TrackCWorkTarget,
    workType: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in',
  ) => void;
  readonly onSetSectionRelease?: (
    target: TrackCWorkTarget,
    released: boolean,
  ) => void;
  readonly onSetTradeRelease?: (
    unitId: string,
    trade: TrackCTrade,
    released: boolean,
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
  if (work.inspection === 'los-passed') return 'Los passed · property walk pending';
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
    : 'Not walked yet';
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
  unitNumber,
}: {
  state: TrackCState;
  work: TrackCWorkProjection;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: TrackCSectionAction) => void;
  onRequestMirror: () => void;
  onToggleRelease?: (released: boolean) => void;
  onSetWorkType?: (workType: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in') => void;
  unitNumber?: string;
}) => {
  // Removing a room is destructive — first tap (or a left swipe) arms,
  // second tap confirms. A HOLD (iOS-style) opens the room menu instead.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
            ? (['full', 'touch-up', 'cut-in', 'full-cut-in'] as const).map((type) => (
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
                    : type === 'cut-in' ? 'Cut-in' : 'Full + cut-in'}
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
            {work.trade === 'paint' && work.release === 'released'
              && work.workType && work.workType !== 'full' ? (
                <em className={`track-c-worktype is-${work.workType}`}>
                  {paintWorkTypeNote(work.workType)}
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
          {onSetWorkType
            && work.trade === 'paint'
            && work.release === 'released'
            && work.property !== 'property-accepted' ? (
              <button
                className="track-c-release-toggle track-c-worktype-cycle"
                onClick={() => {
                  const current = work.workType ?? 'full';
                  const next = current === 'full'
                    ? 'touch-up'
                    : current === 'touch-up'
                      ? 'cut-in'
                      : current === 'cut-in' ? 'full-cut-in' : 'full';
                  onSetWorkType(next);
                }}
                type="button"
              >
                Task: {paintWorkTypeLabel(work.workType)} — tap to change
              </button>
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
  onRequestMirror,
  unitNotes,
  unitPhotos,
  onCommitUnitPhoto,
  focusTrade,
  onPdsApprove,
  onOpenCallback,
  onTradePass,
  onResolveCallback,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetSectionWorkType,
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
  onRequestMirror: BoardViewProps['onRequestMirror'];
  unitNotes?: BoardViewProps['unitNotes'];
  unitPhotos?: BoardViewProps['unitPhotos'];
  onCommitUnitPhoto?: BoardViewProps['onCommitUnitPhoto'];
  focusTrade?: TrackCTrade;
  onPdsApprove?: BoardViewProps['onPdsApprove'];
  onOpenCallback?: BoardViewProps['onOpenCallback'];
  onTradePass?: BoardViewProps['onTradePass'];
  onResolveCallback?: BoardViewProps['onResolveCallback'];
  onUnblockUnit?: BoardViewProps['onUnblockUnit'];
  onRequestBlock?: BoardViewProps['onRequestBlock'];
  onSetSectionRelease?: BoardViewProps['onSetSectionRelease'];
  onSetSectionWorkType?: BoardViewProps['onSetSectionWorkType'];
  onSetTradeRelease?: BoardViewProps['onSetTradeRelease'];
  onSetUnitBeds?: BoardViewProps['onSetUnitBeds'];
  onMoveUnitTrade?: BoardViewProps['onMoveUnitTrade'];
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string>();
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
      <div className="track-c-util-row">
        <button
          aria-expanded={openMenu === 'add'}
          className="track-c-addmenu-trigger"
          data-track-c-critical-target="true"
          onClick={() => setOpenMenu(openMenu === 'add' ? null : 'add')}
          type="button"
        >
          <span aria-hidden="true">＋</span> Add note · change order · photo
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
              {onRequestNote ? (
                <button
                  onClick={() => { setOpenMenu(null); onRequestNote(); }}
                  type="button"
                >
                  Note
                </button>
              ) : null}
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
                Change order
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
      {notesForUnit.length > 0 ? (
        <div className="track-c-unit-notes">
          <h3>Notes</h3>
          {notesForUnit.map((note) => (
            <p key={note.id}>{note.text}</p>
          ))}
        </div>
      ) : null}
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
        const progress = projectTrackCTradeProgress(state, unitId, trade);
        const crewNames = progress.crewIds
          .map((crewId) => trackCCrewName(state, crewId))
          .filter((name): name is string => Boolean(name));
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
                <h2 id={`track-c-${trade}-heading`}>{tradeLabel(trade)}</h2>
                <span>
                  {crewNames.length === 0
                    ? progress.released > 0 ? 'Needs crew' : 'Unreleased'
                    : crewNames.join(', ')}
                </span>
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
                      {state.crews
                        .filter((crew) => crew.trade === trade)
                        .map((crew) => (
                          <option key={crew.id} value={crew.id}>{crew.name}</option>
                        ))}
                    </select>
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
              // Which day this trade came onto the wall — so Los can reconcile
              // the unit against his physical board day by day.
              let earliest = '';
              for (const item of tradeWork) {
                if (item.release !== 'released' || !item.releasedAt) continue;
                if (!earliest || item.releasedAt < earliest) earliest = item.releasedAt;
              }
              return earliest ? (
                <p className="track-c-unit-released">
                  Released {new Date(earliest).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })} · {tradeLabel(trade)}
                </p>
              ) : null;
            })()}
            {onSetTradeRelease
              && tradeWork.filter((item) => item.release === 'released').length === 0 ? (
                <button
                  className="track-c-release-toggle"
                  data-track-c-critical-target="true"
                  onClick={() => onSetTradeRelease(unitId, trade, true)}
                  type="button"
                >
                  Joseph released {tradeLabel(trade)} — mark the whole unit released
                </button>
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
            {onResolveCallback && tradeWork.some((item) =>
              item.release === 'released' && item.callbackOpen) ? (
                <button
                  className="track-c-trade-complete track-c-trade-lospass"
                  data-track-c-critical-target="true"
                  onClick={() => onResolveCallback(unitId, trade)}
                  type="button"
                >
                  Callback fixed — {tradeLabel(trade)} passes, back to walk
                </button>
              ) : null}
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
            {onOpenCallback && !anyCallbackOpen && tradeWork.some((item) =>
              item.release === 'released'
              && !item.callbackOpen
              && (item.inspection === 'los-passed' || item.property === 'property-accepted')) ? (
                <button
                  className="track-c-callback-link"
                  onClick={() => onOpenCallback(unitId, trade)}
                  type="button"
                >
                  Open a callback — {tradeLabel(trade)} needs to be fixed
                </button>
              ) : null}
            {trade === 'clean' ? (
              <p className="track-c-clean-wholeunit">
                {(() => {
                  const beds = tradeWork.filter((item) => item.section !== 'common').length;
                  const hasCommon = tradeWork.some((item) => item.section === 'common');
                  return `Whole unit — ${beds} bed${beds === 1 ? '' : 's'}${hasCommon ? ' + common' : ''}. `;
                })()}
                The crew cleans everything; report it done above, walk it, and
                keep anything that needs work in Notes.
              </p>
            ) : (() => {
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
    </article>
  );
};

// The WALL view — his paper board, page per floor: unit rows with a Paint
// and a Clean cell carrying the board's own marks ("/" released, name =
// working, X = crew done, PASS = Los passed, CC = approved in that pay
// week's color).
const WALL_WEEK_EPOCH = new Date(2026, 6, 26); // Sunday, week 1 = yellow

const wallWeekIndex = (iso: string): number => {
  const date = new Date(iso);
  if (date.getDay() === 6 && date.getHours() >= 17) date.setDate(date.getDate() + 1);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  const weeks = Math.round((date.getTime() - WALL_WEEK_EPOCH.getTime()) / 604_800_000);
  return ((weeks % 3) + 3) % 3;
};

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
      left.localeCompare(right, undefined, { numeric: true }));
  }, [state.units]);
  const [floor, setFloor] = useState<string>(() => {
    try {
      return window.localStorage.getItem('turn-os:wall-floor') ?? '';
    } catch {
      return '';
    }
  });
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
      return { cls: 'is-na', mark: '' };
    }
    const work = projectTrackCWork(state, { section, trade, unitId });
    if (!work || work.release !== 'released') return { cls: 'is-empty', mark: '\u2014' };
    if (work.property === 'property-accepted') {
      const latest = state.events
        .filter((event) =>
          event.eventType === 'property-accepted'
          && event.target.unitId === unitId
          && event.target.trade === trade
          && event.target.section === section)
        .reduce((max, event) => (event.recordedAt > max ? event.recordedAt : max), '');
      return { cls: `is-cc wall-wk${latest ? wallWeekIndex(latest) : 1}`, mark: 'CC' };
    }
    if (work.callbackOpen) return { cls: 'is-cb', mark: 'CB' };
    if (work.access !== 'clear') return { cls: 'is-blocked', mark: 'W' };
    if (work.inspection === 'los-passed') return { cls: 'is-passed', mark: '\u2713' };
    if (work.execution === 'crew-reported-complete') return { cls: 'is-done', mark: 'X' };
    return { cls: 'is-open', mark: '/' };
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
    let earliest = '';
    for (const work of projectTrackCUnitWork(state, unitId)) {
      if (work.trade !== trade || work.release !== 'released' || !work.releasedAt) continue;
      if (!earliest || work.releasedAt < earliest) earliest = work.releasedAt;
    }
    return earliest ? wallWeekIndex(earliest) : undefined;
  };
  const trimmed = query.trim().toLowerCase();
  const rows = (trimmed
    ? state.units.filter((unit) => unit.unitNumber.toLowerCase().includes(trimmed))
    : state.units.filter((unit) => wallFloorOf(unit.unitNumber) === activeFloor))
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }));
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
        Whole Turn · every unit released, all days. The
        {' '}<em className="track-c-wall__wk wall-wk0">w#</em> chip = the pay week it came onto the board.
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
                  <em className={`track-c-wall__wk wall-wk${wk}`} title={`Released week ${wk + 1}`}>
                    w{wk + 1}
                  </em>
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
                  {cell.mark}
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
  onRequestMirror,
  unitNotes,
  unitPhotos,
  onCommitUnitPhoto,
  onPdsApprove,
  onOpenCallback,
  onTradePass,
  onResolveCallback,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetSectionWorkType,
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
        onTradePass={onTradePass}
        onResolveCallback={onResolveCallback}
        onUnblockUnit={onUnblockUnit}
        onRequestBlock={onRequestBlock}
        onSetSectionRelease={onSetSectionRelease}
        onSetSectionWorkType={onSetSectionWorkType}
        onSetTradeRelease={onSetTradeRelease}
        onSetUnitBeds={onSetUnitBeds}
        onMoveUnitTrade={onMoveUnitTrade}
        onClose={onCloseUnit}
        onQuickAssign={onQuickAssign}
        onChangeCrew={onChangeCrew}
        onRequestAssign={onRequestAssign}
        onRequestNote={onRequestNote}
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
