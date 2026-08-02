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
  readonly onOpenUnit: (unitId: string) => void;
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
      <small>{progress.conciseLabel}</small>
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
}: {
  state: TrackCState;
  work: TrackCWorkProjection;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: TrackCSectionAction) => void;
  onRequestMirror: () => void;
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
          {work.release === 'unreleased' && !work.assignmentConflict ? (
            <p className="track-c-section-row__note">
              Not released yet. This section appears here when the property
              releases it.
            </p>
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
          <h1 ref={headingRef} tabIndex={-1}>Unit {unit.unitNumber}</h1>
          <p>{unit.unitType} · {trackCUnitMakeupLabel(unit)}</p>
        </div>
      </header>
      <p className="track-c-detail__truth">
        Crew completion, Los inspection, and property acceptance stay separate.
      </p>
      {onRequestNote ? (
        <button
          className="track-c-unit-note-button"
          data-track-c-critical-target="true"
          onClick={onRequestNote}
          type="button"
        >
          Add note or change order to Unit {unit.unitNumber}
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
        Flag change order (tub · hole &gt; quarter) — summary copied, form opens
      </button>
      {onCommitUnitPhoto ? (
        <UnitPhotoAddButton
          onCommitPhoto={onCommitUnitPhoto}
          projectId={state.propertyId}
          unitId={unitId}
          unitNumber={unit.unitNumber}
        />
      ) : null}
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
                  className="track-c-trade-complete track-c-pds-approve"
                  data-track-c-critical-target="true"
                  onClick={() => onPdsApprove(unitId, trade)}
                  type="button"
                >
                  PDS approved — walked {tradeLabel(trade)} with the property
                </button>
              ) : null}
            <div className="track-c-section-list">
              {tradeWork.map((item) => {
                const key = trackCWorkKey(item);
                return (
                  <WorkSection
                    isSelected={selectedKey === key}
                    key={key}
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

export const BoardView = ({
  state,
  selectedUnitId,
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
        focusTrade={focusTrade ?? boardTrade}
        onPdsApprove={onPdsApprove}
        onUnblockUnit={onUnblockUnit}
        onRequestBlock={onRequestBlock}
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
        <span>{units.length} Units</span>
      </header>
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
                onOpenUnit(unit.unitId);
              }}
              state={state}
              trade={boardTrade}
              unit={unit}
            />
          ))
        ) : (
          <div className="track-c-empty">
            <Search aria-hidden="true" size={24} />
            <h2>No matching Units</h2>
            <p>Clear the search to return to the compact board.</p>
          </div>
        )}
      </div>
    </section>
  );
};
