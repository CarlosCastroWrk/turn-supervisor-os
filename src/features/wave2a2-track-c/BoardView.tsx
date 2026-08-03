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
  type TrackCState,
  type TrackCTrade,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
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
  readonly unitPhotos?: readonly PhotoNote[];
  readonly onCommitUnitPhoto?: UnitPhotoCommitter;
  readonly onPdsApprove?: (unitId: string, trade: TrackCTrade) => void;
  readonly onUnblockUnit?: (unitId: string, trade: TrackCTrade) => void;
  readonly onRequestBlock?: (unitId: string, trade: TrackCTrade) => void;
  readonly onSetSectionRelease?: (
    target: TrackCWorkTarget,
    released: boolean,
  ) => void;
  readonly onSetTradeRelease?: (
    unitId: string,
    trade: TrackCTrade,
    released: boolean,
  ) => void;
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
}: {
  state: TrackCState;
  progress: TrackCCompactUnitProjection['paint'];
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
        : <small>{progress.conciseLabel}</small>}
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
      {trade !== 'clean' ? <CompactTrade progress={unit.paint} state={state} /> : null}
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
}: {
  state: TrackCState;
  work: TrackCWorkProjection;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: TrackCSectionAction) => void;
  onRequestMirror: () => void;
  onToggleRelease?: (released: boolean) => void;
}) => {
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
    <div className={`track-c-section-row ${isSelected ? 'is-open' : ''}`}>
      <div className="track-c-section-row__bar">
        <button
          aria-label={`${trackCSectionLabel(work.section)}: ${executionLabel(work)}`}
          aria-expanded={isSelected}
          className="track-c-section-row__trigger"
          data-track-c-critical-target="true"
          onClick={onSelect}
          type="button"
        >
          <span className="track-c-section-row__section">
            {trackCSectionLabel(work.section)}
            {work.trade === 'paint' && work.release === 'released'
              && work.workType && work.workType !== 'full' ? (
                <em className={`track-c-worktype is-${work.workType}`}>
                  {work.workType === 'touch-up' ? 'touch-up' : 'cut-in'}
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
          {onToggleRelease
            && work.release === 'released'
            && work.activeCrewIds.length === 0
            && work.execution !== 'crew-reported-complete'
            && work.inspection === 'not-ready'
            && work.property !== 'property-accepted' ? (
              <button
                className="track-c-release-toggle is-remove"
                onClick={() => onToggleRelease(false)}
                type="button"
              >
                Joseph didn’t release this — mark not released
              </button>
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
  unitPhotos,
  onCommitUnitPhoto,
  focusTrade,
  onPdsApprove,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetTradeRelease,
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
  unitPhotos?: BoardViewProps['unitPhotos'];
  onCommitUnitPhoto?: BoardViewProps['onCommitUnitPhoto'];
  focusTrade?: TrackCTrade;
  onPdsApprove?: BoardViewProps['onPdsApprove'];
  onUnblockUnit?: BoardViewProps['onUnblockUnit'];
  onRequestBlock?: BoardViewProps['onRequestBlock'];
  onSetSectionRelease?: BoardViewProps['onSetSectionRelease'];
  onSetTradeRelease?: BoardViewProps['onSetTradeRelease'];
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
  // From a trade board the unit page IS that board's page — the other trade
  // stays one tap away, while notes/photos/change orders remain shared.
  const [showOtherTrade, setShowOtherTrade] = useState(false);
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
      <p className="track-c-detail__truth">
        Crew completion, Los inspection, and property acceptance stay separate.
      </p>
      <div className="track-c-util-row">
      {onRequestNote ? (
        <button
          className="track-c-unit-note-button"
          data-track-c-critical-target="true"
          onClick={onRequestNote}
          type="button"
        >
          Note
        </button>
      ) : null}
      <button
        className="track-c-unit-note-button track-c-change-order-flag"
        data-track-c-critical-target="true"
        onClick={() => {
          // One tap: summary on the clipboard, official form open — paste and
          // submit. Tubs and holes bigger than a quarter are change orders.
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
          onCommitPhoto={onCommitUnitPhoto}
          projectId={state.propertyId}
          unitId={unitId}
          unitNumber={unit.unitNumber}
        />
      ) : null}
      </div>
      {[...TRACK_C_TRADES]
        .sort((left, right) =>
          Number(right === focusTrade) - Number(left === focusTrade))
        .filter((trade) => !focusTrade || showOtherTrade || trade === focusTrade)
        .map((trade) => {
        const Icon = trade === 'paint' ? Paintbrush : Droplets;
        const tradeWork = work.filter((item) => item.trade === trade);
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
            </header>
            {(() => {
              if (!onSetTradeRelease) return null;
              const releasedItems = tradeWork.filter((item) => item.release === 'released');
              if (releasedItems.length === 0) {
                return (
                  <button
                    className="track-c-release-toggle"
                    data-track-c-critical-target="true"
                    onClick={() => onSetTradeRelease(unitId, trade, true)}
                    type="button"
                  >
                    Joseph released {tradeLabel(trade)} — mark the whole unit released
                  </button>
                );
              }
              const untouched = releasedItems.every((item) =>
                item.activeCrewIds.length === 0
                && item.execution !== 'crew-reported-complete'
                && item.inspection === 'not-ready'
                && item.property !== 'property-accepted');
              return untouched ? (
                <button
                  className="track-c-release-toggle is-remove"
                  onClick={() => onSetTradeRelease(unitId, trade, false)}
                  type="button"
                >
                  {tradeLabel(trade)} wasn’t released — remove it (undo mistake)
                </button>
              ) : null;
            })()}
            {(() => {
              const blockedItems = tradeWork.filter((item) =>
                item.release === 'released' && item.access !== 'clear');
              if (blockedItems.length > 0) {
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
              }
              return onRequestBlock && tradeWork.some((item) => item.release === 'released') ? (
                <button
                  className="track-c-block-link"
                  onClick={() => onRequestBlock(unitId, trade)}
                  type="button"
                >
                  Block {tradeLabel(trade)} — locked out / occupied / hold
                </button>
              ) : null;
            })()}
            {canRecordTradeComplete ? (
              <button
                className="track-c-trade-complete"
                data-track-c-critical-target="true"
                onClick={() => onTradeComplete(unitId, trade)}
                type="button"
              >
                Crew reports {tradeLabel(trade)} complete
              </button>
            ) : null}
            {onPdsApprove && tradeWork.some((item) =>
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
            <div className="track-c-section-list">
              {tradeWork.map((item) => {
                const key = trackCWorkKey(item);
                return (
                  <WorkSection
                    isSelected={selectedKey === key}
                    key={key}
                    onToggleRelease={onSetSectionRelease
                      ? (released) => onSetSectionRelease(
                        {
                          unitId: item.unitId,
                          trade: item.trade,
                          section: item.section,
                        },
                        released,
                      )
                      : undefined}
                    onAction={(action) =>
                      onSectionAction(
                        {
                          unitId: item.unitId,
                          trade: item.trade,
                          section: item.section,
                        },
                        action,
                      )}
                    onRequestMirror={() =>
                      onRequestMirror({
                        unitId: item.unitId,
                        trade: item.trade,
                        section: item.section,
                      })}
                    onSelect={() =>
                      setSelectedKey((current) => (current === key ? undefined : key))}
                    state={state}
                    work={item}
                  />
                );
              })}
            </div>
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
  onOpenUnitTrade,
}: {
  state: TrackCState;
  onOpenUnitTrade: (unitId: string, trade: TrackCTrade) => void;
}) => {
  const floors = useMemo(() => {
    const seen = new Map<string, number>();
    for (const unit of state.units) {
      const floor = wallFloorOf(unit.unitNumber);
      seen.set(floor, (seen.get(floor) ?? 0) + 1);
    }
    return [...seen.keys()].sort((left, right) =>
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
  const cellFor = (unitId: string, trade: TrackCTrade) => {
    const released = projectTrackCUnitWork(state, unitId)
      .filter((work) => work.trade === trade && work.release === 'released');
    if (released.length === 0) return { cls: 'is-empty', mark: '—' };
    if (released.every((work) => work.property === 'property-accepted')) {
      const latest = state.events
        .filter((event) =>
          event.eventType === 'property-accepted'
          && event.target.unitId === unitId
          && event.target.trade === trade)
        .reduce((max, event) => (event.recordedAt > max ? event.recordedAt : max), '');
      return {
        cls: `is-cc wall-wk${latest ? wallWeekIndex(latest) : 1}`,
        mark: 'CC',
      };
    }
    if (released.some((work) => work.callbackOpen)) return { cls: 'is-cb', mark: 'CB' };
    const inPlay = released.filter((work) =>
      work.access === 'clear' && work.property !== 'property-accepted');
    if (inPlay.length === 0) return { cls: 'is-blocked', mark: 'Wait' };
    if (inPlay.every((work) =>
      work.inspection === 'los-passed' || work.property === 'property-accepted')) {
      return { cls: 'is-passed', mark: 'PASS' };
    }
    if (inPlay.every((work) =>
      work.execution === 'crew-reported-complete'
      || work.inspection === 'los-passed'
      || work.property === 'property-accepted')) {
      return { cls: 'is-done', mark: 'X' };
    }
    const crewId = inPlay.find((work) => work.activeCrewIds.length > 0)?.activeCrewIds[0];
    if (crewId) {
      const name = state.crews.find((crew) => crew.id === crewId)?.name ?? 'Crew';
      return { cls: 'is-working', mark: name.split(' ')[0] };
    }
    return { cls: 'is-open', mark: '/' };
  };
  const rows = state.units
    .filter((unit) => wallFloorOf(unit.unitNumber) === activeFloor)
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }));
  return (
    <div className="track-c-wall">
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
      <div className="track-c-wall__grid" role="table" aria-label={`Wall board floor ${activeFloor}`}>
        <div className="track-c-wall__head" role="row">
          <span role="columnheader">Unit</span>
          <span role="columnheader">Paint</span>
          <span role="columnheader">Clean</span>
        </div>
        {rows.map((unit) => {
          const paint = cellFor(unit.id, 'paint');
          const clean = cellFor(unit.id, 'clean');
          return (
            <div className="track-c-wall__row" key={unit.id} role="row">
              <span className="track-c-wall__unit" role="rowheader">{unit.unitNumber}</span>
              {([['paint', paint], ['clean', clean]] as const).map(([trade, cell]) => (
                <button
                  aria-label={`Unit ${unit.unitNumber} ${trade}: ${cell.mark}`}
                  className={`track-c-wall__cell ${cell.cls}`}
                  key={trade}
                  onClick={() => onOpenUnitTrade(unit.id, trade)}
                  role="cell"
                  type="button"
                >
                  {cell.mark}
                </button>
              ))}
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="track-c-wall__empty">No units on this floor.</p>
        ) : null}
      </div>
      <p className="track-c-wall__legend">
        / released · name = working · X = crew done · PASS = Los passed ·
        CC = approved (color = pay week) · CB = callback · Wait = blocked
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
  unitPhotos,
  onCommitUnitPhoto,
  onPdsApprove,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetTradeRelease,
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
  // List = the twin trade boards; Wall = the paper-board grid, floor by floor.
  const [boardMode, setBoardMode] = useState<'list' | 'wall'>(() => {
    try {
      return window.localStorage.getItem('turn-os:board-mode') === 'wall' ? 'wall' : 'list';
    } catch {
      return 'list';
    }
  });
  const pickBoardMode = (mode: 'list' | 'wall') => {
    setBoardMode(mode);
    try {
      window.localStorage.setItem('turn-os:board-mode', mode);
    } catch {
      // Session-only then.
    }
  };
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
        onUnblockUnit={onUnblockUnit}
        onRequestBlock={onRequestBlock}
        onSetSectionRelease={onSetSectionRelease}
        onSetTradeRelease={onSetTradeRelease}
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
      <div className="track-c-board-trade track-c-board-mode" role="group" aria-label="Board style">
        <button
          aria-pressed={boardMode === 'list'}
          onClick={() => pickBoardMode('list')}
          type="button"
        >
          Boards
        </button>
        <button
          aria-pressed={boardMode === 'wall'}
          onClick={() => pickBoardMode('wall')}
          type="button"
        >
          Wall grid
        </button>
      </div>
      {boardMode === 'wall' ? (
        <WallGrid
          onOpenUnitTrade={(unitId, trade) => {
            setFocusTrade(trade);
            onOpenUnit(unitId, trade);
          }}
          state={state}
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
