import {
  ArrowLeft,
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
import type { TrackCSectionAction } from './operations';
import {
  projectTrackCUnitWork,
  searchTrackCCompactUnits,
  trackCCrewName,
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
  readonly onRequestMirror: (target: TrackCWorkTarget) => void;
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
  if (work.release === 'released') return 'Released · unassigned';
  if (work.release === 'unreleased') return 'Unreleased';
  return 'Source review required';
};

const layerCopy = (state: TrackCState, work: TrackCWorkProjection) => {
  const crew =
    work.activeCrewIds.length === 0
      ? 'No confirmed crew'
      : work.activeCrewIds.length > 1
        ? 'Conflicting crews'
        : trackCCrewName(state, work.responsibleCrewId) ?? 'Unknown crew';
  return [
    ['Release', work.release.replaceAll('-', ' ')],
    ['Crew', crew],
    ['Crew report', work.execution === 'crew-reported-complete' ? 'Complete' : work.execution],
    ['Los', work.inspection.replaceAll('-', ' ')],
    ['Property', work.property.replaceAll('-', ' ')],
    [
      'Paper mirror',
      work.personalPdsMirror ? 'Recorded personally' : 'Not recorded',
    ],
  ] as const;
};

const actionsFor = (
  work: TrackCWorkProjection,
): readonly { action: TrackCSectionAction; label: string; tone?: string }[] => {
  if (
    work.release !== 'released' ||
    work.access !== 'clear' ||
    work.assignmentConflict ||
    work.sourceConfidence !== 'confirmed'
  ) {
    return [];
  }
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
  return (
    <div className="track-c-unit-row__trade">
      <Icon aria-hidden="true" size={15} strokeWidth={2.2} />
      <span>{tradeLabel(progress.trade)}</span>
      <strong>{names.length === 0 ? 'Unassigned' : names.join(', ')}</strong>
      <small>{progress.conciseLabel}</small>
    </div>
  );
};

const CompactUnitRow = ({
  state,
  unit,
  onOpen,
}: {
  state: TrackCState;
  unit: TrackCCompactUnitProjection;
  onOpen: () => void;
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
      <span>{unit.unitType} · {unit.locationLabel}</span>
    </div>
    <div className="track-c-unit-row__trades">
      <CompactTrade progress={unit.paint} state={state} />
      <CompactTrade progress={unit.clean} state={state} />
    </div>
    <span className={`track-c-signal is-${unit.signal}`}>
      {unit.signal === 'needs-me' ? (
        <CircleAlert aria-hidden="true" size={14} />
      ) : unit.signal === 'waiting' ? (
        <ShieldAlert aria-hidden="true" size={14} />
      ) : null}
      {unit.signalLabel}
    </span>
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
  return (
    <div className={`track-c-section-row ${isSelected ? 'is-open' : ''}`}>
      <button
        aria-expanded={isSelected}
        className="track-c-section-row__trigger"
        data-track-c-critical-target="true"
        onClick={onSelect}
        type="button"
      >
        <span className="track-c-section-row__section">
          {trackCSectionLabel(work.section)}
        </span>
        <span>
          <strong>{executionLabel(work)}</strong>
          <small>
            {work.restrictionLabel ??
              trackCCrewName(state, work.responsibleCrewId) ??
              'No confirmed responsible crew'}
          </small>
        </span>
        <ChevronRight aria-hidden="true" size={17} />
      </button>
      {isSelected ? (
        <div className="track-c-section-row__detail">
          {blocked ? (
            <p className="track-c-section-row__warning">
              <ShieldAlert aria-hidden="true" size={16} />
              {work.restrictionLabel ??
                'This section is not eligible for field actions until release, access, and source conflicts are resolved.'}
            </p>
          ) : null}
          <dl className="track-c-layer-list">
            {layerCopy(state, work).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
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
  onRequestMirror,
}: {
  state: TrackCState;
  unitId: string;
  onClose: () => void;
  onSectionAction: BoardViewProps['onSectionAction'];
  onRequestMirror: BoardViewProps['onRequestMirror'];
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string>();
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const work = useMemo(
    () => projectTrackCUnitWork(state, unitId),
    [state, unitId],
  );

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
          <p>{unit.unitType} · {unit.locationLabel}</p>
        </div>
      </header>
      <div className="track-c-applicable-strip">
        <span>Applicable</span>
        {unit.applicableSections.map((section) => (
          <strong key={section}>{trackCSectionLabel(section)}</strong>
        ))}
      </div>
      <p className="track-c-detail__truth">
        Release, crew report, Los inspection, property acceptance, and paper mirror
        remain separate.
      </p>
      {TRACK_C_TRADES.map((trade) => {
        const Icon = trade === 'paint' ? Paintbrush : Droplets;
        const tradeWork = work.filter((item) => item.trade === trade);
        return (
          <section
            aria-labelledby={`track-c-${trade}-heading`}
            className={`track-c-trade-panel is-${trade}`}
            key={trade}
          >
            <header>
              <Icon aria-hidden="true" size={18} />
              <h2 id={`track-c-${trade}-heading`}>{tradeLabel(trade)}</h2>
              <span>{tradeWork.length} sections</span>
            </header>
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
    </article>
  );
};

export const BoardView = ({
  state,
  selectedUnitId,
  onOpenUnit,
  onCloseUnit,
  onSectionAction,
  onRequestMirror,
}: BoardViewProps) => {
  const [query, setQuery] = useState('');
  const units = useMemo(
    () => searchTrackCCompactUnits(state, query),
    [query, state],
  );

  if (selectedUnitId) {
    return (
      <UnitDetail
        onClose={onCloseUnit}
        onRequestMirror={onRequestMirror}
        onSectionAction={onSectionAction}
        state={state}
        unitId={selectedUnitId}
      />
    );
  }

  return (
    <section className="track-c-board" aria-labelledby="track-c-board-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-board-heading">{state.terminology.boardName}</h1>
          <p>Compact Paint/Clean field projection</p>
        </div>
        <span>{units.length} Units</span>
      </header>
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
              key={unit.unitId}
              onOpen={() => onOpenUnit(unit.unitId)}
              state={state}
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
