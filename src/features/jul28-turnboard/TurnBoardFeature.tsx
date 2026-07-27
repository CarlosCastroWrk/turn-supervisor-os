import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  PaintRoller,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type {
  Jul28AttentionFilter,
  Jul28LayerProjection,
  Jul28Section,
  Jul28Trade,
  Jul28TradeSummaryProjection,
  Jul28TurnBoardFilters,
  Jul28TurnBoardRepository,
  Jul28UnitCardProjection,
  Jul28UnitRecord,
} from './model';
import {
  projectJul28Blocker,
  projectJul28FilterOptions,
  projectJul28SectionFacts,
  projectJul28TradeProgress,
  projectJul28TurnBoard,
  projectJul28UnitHistory,
  recordsForTrade,
  validateJul28SourceCoverage,
} from './projections';
import { jul28SyntheticTurnBoardRepository } from './syntheticRepository';
import './turnBoardFeature.css';

interface TurnBoardFeatureProps {
  repository?: Jul28TurnBoardRepository;
  initialTrade?: Jul28Trade;
  initialUnitId?: string;
  onUnitSelected?: (unitId: string) => void;
  onUnitClose?: (unitId: string) => void;
}

const tradeLabels: Record<Jul28Trade, string> = { paint: 'Paint', clean: 'Clean' };
const attentionFilterLabels: Record<Jul28AttentionFilter, string> = {
  all: 'All',
  'needs-inspection': 'Needs inspection',
  callback: 'Callback',
  'property-walk': 'Property walk',
  'access-blocked': 'Access blocked',
  'assignment-conflict': 'Assignment conflict',
};

const layerLabels: Array<[keyof Jul28UnitCardProjection['layers'], string]> = [
  ['authorization', 'Authorization'],
  ['assignmentEvidence', 'Assignment evidence'],
  ['crewReported', 'Crew report'],
  ['losInspection', 'My inspection'],
  ['propertyWalk', 'Property walk'],
  ['paperReview', 'Paper review'],
];

const sectionLabel = (section: Jul28Section) => section === 'common' ? 'Common' : section;

const formatDateTime = (value?: string) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const tradeIcon = (trade: Jul28Trade) =>
  trade === 'paint'
    ? <PaintRoller size={17} aria-hidden="true" />
    : <Sparkles size={17} aria-hidden="true" />;

const layerIcon = (layer: Jul28LayerProjection): ReactNode => {
  if (layer.tone === 'recorded') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (layer.tone === 'attention') return <AlertTriangle size={16} aria-hidden="true" />;
  if (layer.tone === 'not-applicable') return <span aria-hidden="true">—</span>;
  return <Clock3 size={16} aria-hidden="true" />;
};

function TradeToggle({ trade, onChange }: { trade: Jul28Trade; onChange: (trade: Jul28Trade) => void }) {
  return (
    <div className="jul28-trade-toggle" aria-label="Trade" role="group">
      {(Object.keys(tradeLabels) as Jul28Trade[]).map((option) => (
        <button
          className={`jul28-trade-toggle__button jul28-trade-toggle__button--${option}`}
          aria-pressed={trade === option}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {tradeIcon(option)}
          {tradeLabels[option]}
        </button>
      ))}
    </div>
  );
}

function LayerRail({ projection }: { projection: Jul28UnitCardProjection }) {
  return (
    <dl className="jul28-layer-rail" aria-label={`${tradeLabels[projection.trade]} factual layers for Unit ${projection.unitNumber}`}>
      {layerLabels.map(([key, label]) => {
        const layer = projection.layers[key];
        return (
          <div className={`jul28-layer-rail__item is-${layer.tone}`} key={key}>
            <dt>{label}</dt>
            <dd>{layerIcon(layer)}<span>{layer.label}</span></dd>
          </div>
        );
      })}
    </dl>
  );
}

function TradeSummary({
  summary,
  selected,
  asButton = false,
  onSelect,
}: {
  summary: Jul28TradeSummaryProjection;
  selected: boolean;
  asButton?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <span className="jul28-trade-summary__heading">{tradeIcon(summary.trade)} {tradeLabels[summary.trade]}</span>
      <strong>
        {summary.sourceCoverageComplete
          ? `${summary.readyForMyWalkCount} of ${summary.applicableSectionCount} ready for my walk`
          : 'Source coverage incomplete'}
      </strong>
      <small>{summary.attentionLabel}</small>
    </>
  );

  return asButton ? (
    <button
      aria-pressed={selected}
      className={`jul28-trade-summary is-${summary.trade} ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      {body}
    </button>
  ) : (
    <div className={`jul28-trade-summary is-${summary.trade} ${selected ? 'is-selected' : ''}`}>
      {body}
    </div>
  );
}

function UnitCard({
  projection,
  onOpen,
}: {
  projection: Jul28UnitCardProjection;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const crewSummary = projection.crewNames.length > 0 ? projection.crewNames.join(', ') : 'No crew evidence';

  return (
    <article
      className={`jul28-unit-card is-${projection.attentionKind}`}
      data-unit-id={projection.unitId}
    >
      <div className="jul28-unit-card__body">
        <header className="jul28-unit-card__heading">
          <div>
            <h2 className="jul28-unit-card__number">Unit {projection.unitNumber}</h2>
            <span className="jul28-unit-card__location">{projection.locationLabel} · {projection.unitTypeLabel}</span>
          </div>
          <span className={`jul28-attention-label is-${projection.attentionKind}`}>{projection.attentionLabel}</span>
        </header>

        <div className="jul28-unit-card__trade-grid" aria-label={`Paint and Clean summary for Unit ${projection.unitNumber}`}>
          <TradeSummary summary={projection.tradeSummaries.paint} selected={projection.trade === 'paint'} />
          <TradeSummary summary={projection.tradeSummaries.clean} selected={projection.trade === 'clean'} />
        </div>

        <div className="jul28-unit-card__crew">
          <Users size={15} aria-hidden="true" />
          <span><strong>{tradeLabels[projection.trade]} crew evidence:</strong> {crewSummary}</span>
        </div>

        {projection.restrictedSections.length > 0 ? (
          <p className="jul28-unit-card__warning">
            <AlertTriangle size={16} aria-hidden="true" />
            Occupied / restricted: {projection.restrictedSections.map(sectionLabel).join(', ')} — do not enter until clarified
          </p>
        ) : null}
        {projection.accessBlockedSections.length > 0 ? (
          <p className="jul28-unit-card__warning">
            <AlertTriangle size={16} aria-hidden="true" />
            Access blocked: {projection.accessBlockedSections.map(sectionLabel).join(', ')}
          </p>
        ) : null}
        {projection.maintenanceBlockedSections.length > 0 ? (
          <p className="jul28-unit-card__maintenance">
            <Wrench size={16} aria-hidden="true" />
            Maintenance blocked: {projection.maintenanceBlockedSections.map(sectionLabel).join(', ')}
          </p>
        ) : null}
        {projection.addedScopeSections.length > 0 ? (
          <p className="jul28-unit-card__added-scope">
            Added scope: {projection.addedScopeSections.map(sectionLabel).join(', ')} · new episode, not an original miss
          </p>
        ) : null}
        {projection.duplicateAssignmentSections.length > 0 ? (
          <p className="jul28-unit-card__warning">
            <AlertTriangle size={16} aria-hidden="true" />
            Conflicting active assignment evidence: {projection.duplicateAssignmentSections.map(sectionLabel).join(', ')}
          </p>
        ) : null}

        <LayerRail projection={projection} />
        <button
          type="button"
          className="jul28-unit-card__open"
          onClick={(event: MouseEvent<HTMLButtonElement>) => onOpen(event.currentTarget)}
          aria-label={`Open Unit ${projection.unitNumber} workspace`}
        >
          <span>Open Unit workspace</span>
          <ChevronRight className="jul28-unit-card__chevron" size={21} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function WorkspaceEmpty() {
  return (
    <div className="jul28-workspace-empty">
      <FileText size={30} aria-hidden="true" />
      <h2>Select a Unit</h2>
      <p>Review section-level Paint and Clean facts without changing the authoritative paper TurnBoard.</p>
    </div>
  );
}

function UnitWorkspace({
  unit,
  trade,
  selectedSection,
  headingRef,
  onTradeChange,
  onSectionChange,
  onClose,
}: {
  unit: Jul28UnitRecord;
  trade: Jul28Trade;
  selectedSection: Jul28Section;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onTradeChange: (trade: Jul28Trade) => void;
  onSectionChange: (section: Jul28Section) => void;
  onClose: () => void;
}) {
  const records = recordsForTrade(unit, trade);
  const selectedRecord = records.find((record) => record.section === selectedSection) ?? records[0];
  const facts = selectedRecord ? projectJul28SectionFacts(selectedRecord) : [];
  const history = selectedRecord ? projectJul28UnitHistory(unit, trade, selectedRecord.section) : [];
  const coverage = validateJul28SourceCoverage(unit);
  const progress = projectJul28TradeProgress(unit, trade);
  const paintProgress = projectJul28TradeProgress(unit, 'paint');
  const cleanProgress = projectJul28TradeProgress(unit, 'clean');
  const blocker = selectedRecord ? projectJul28Blocker(selectedRecord, coverage) : null;

  return (
    <section className="jul28-unit-workspace" aria-labelledby="jul28-unit-workspace-title">
      <header className="jul28-unit-workspace__header">
        <button type="button" className="jul28-icon-button jul28-unit-workspace__back" onClick={onClose} aria-label="Close Unit workspace and return to TurnBoard list">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div>
          <h2 id="jul28-unit-workspace-title" ref={headingRef} tabIndex={-1}>Unit {unit.unitNumber}</h2>
          <p>{unit.buildingLabel} · {unit.floorLabel} · {unit.unitTypeLabel}</p>
        </div>
        <span className="jul28-read-only-label">Wave 1 · read only</span>
      </header>

      <div className="jul28-paper-banner" role="note">
        <ShieldCheck size={21} aria-hidden="true" />
        <div><strong>Paper TurnBoard remains authoritative.</strong><span>This personal view does not approve work, reconcile payroll, or change paper.</span></div>
      </div>

      {!coverage.complete ? (
        <div className="jul28-source-warning" role="alert">
          <AlertTriangle size={19} aria-hidden="true" />
          <div>
            <strong>Source coverage incomplete</strong>
            <span>Readiness and completion counts are withheld until the order is Common + A–E and every Paint/Clean section has exactly one source record.</span>
          </div>
        </div>
      ) : null}

      <section className="jul28-workspace-trades" aria-labelledby="jul28-workspace-trades-title">
        <div className="jul28-workspace-section-heading">
          <h3 id="jul28-workspace-trades-title">Paint and Clean</h3>
          <p>Choose a trade for section details. Both remain independent.</p>
        </div>
        <div className="jul28-workspace-trades__grid">
          <TradeSummary
            asButton
            selected={trade === 'paint'}
            summary={{
              trade: 'paint',
              sourceCoverageComplete: paintProgress.sourceCoverageComplete,
              applicableSectionCount: paintProgress.applicableSectionCount,
              readyForMyWalkSections: paintProgress.readyForMyWalkSections,
              readyForMyWalkCount: paintProgress.readyForMyWalkCount,
              losPassedSectionCount: paintProgress.losPassedSectionCount,
              pendingInspectionCount: paintProgress.pendingSectionCount,
              attentionKind: coverage.complete ? 'in-progress' : 'source-coverage-incomplete',
              attentionLabel: paintProgress.label,
              readinessLabel: paintProgress.label,
            }}
            onSelect={() => onTradeChange('paint')}
          />
          <TradeSummary
            asButton
            selected={trade === 'clean'}
            summary={{
              trade: 'clean',
              sourceCoverageComplete: cleanProgress.sourceCoverageComplete,
              applicableSectionCount: cleanProgress.applicableSectionCount,
              readyForMyWalkSections: cleanProgress.readyForMyWalkSections,
              readyForMyWalkCount: cleanProgress.readyForMyWalkCount,
              losPassedSectionCount: cleanProgress.losPassedSectionCount,
              pendingInspectionCount: cleanProgress.pendingSectionCount,
              attentionKind: coverage.complete ? 'in-progress' : 'source-coverage-incomplete',
              attentionLabel: cleanProgress.label,
              readinessLabel: cleanProgress.label,
            }}
            onSelect={() => onTradeChange('clean')}
          />
        </div>
      </section>

      <section className="jul28-selected-trade" aria-labelledby="jul28-selected-trade-title">
        <div className="jul28-workspace-section-heading">
          <h3 id="jul28-selected-trade-title">{tradeLabels[trade]} section details</h3>
          <p>{progress.label}</p>
        </div>

        <div className="jul28-progress-summary" aria-label={`${tradeLabels[trade]} inspection progress`}>
          <span><strong>{progress.losPassedSectionCount ?? '—'}</strong> my inspections recorded</span>
          <span><strong>{progress.readyForMyWalkCount ?? '—'}</strong> sections ready for my walk</span>
          <p>
            {progress.sourceCoverageComplete
              ? `${progress.readyForMyWalkCount} of ${progress.applicableSectionCount} applicable sections are ready for my walk.`
              : 'Source coverage incomplete — no positive or zero-ready result is shown.'}
          </p>
        </div>

        <div className="jul28-section-picker" aria-label={`${tradeLabels[trade]} Unit sections`} role="group">
          {records.map((record) => {
            const isNotApplicable = record.applicability === 'not-applicable';
            const stateLabel = isNotApplicable
              ? 'not applicable'
              : record.access === 'occupied-or-restricted'
                ? 'occupied or restricted'
                : record.access === 'access-blocked'
                  ? 'access blocked'
                  : record.access === 'maintenance-blocked'
                    ? 'maintenance blocked'
                    : 'accessible';
            return (
              <button
                aria-pressed={selectedRecord?.section === record.section}
                aria-label={`${sectionLabel(record.section)}, ${stateLabel}`}
                className={`jul28-section-button is-${record.access} ${isNotApplicable ? 'is-not-applicable' : ''}`}
                key={record.section}
                onClick={() => onSectionChange(record.section)}
                type="button"
              >
                <span>{sectionLabel(record.section)}</span>
                {record.fullPaint
                  ? <small>Full paint</small>
                  : isNotApplicable
                    ? <small>N/A</small>
                    : record.access !== 'accessible'
                      ? <small>{stateLabel}</small>
                      : null}
              </button>
            );
          })}
        </div>
      </section>

      {blocker ? (
        <section className={`jul28-blocker is-${blocker.tone}`} aria-labelledby="jul28-blocker-title">
          <div className="jul28-blocker__heading">
            <AlertTriangle size={18} aria-hidden="true" />
            <div><span>Current blocker</span><strong id="jul28-blocker-title">{blocker.label}</strong></div>
          </div>
          <dl>
            <div><dt>Owner</dt><dd>{blocker.owner}</dd></div>
            <div><dt>Next action</dt><dd>{blocker.nextAction}</dd></div>
            <div><dt>Resolved when</dt><dd>{blocker.resolution}</dd></div>
          </dl>
        </section>
      ) : null}

      <div className="jul28-fact-list">
        {facts.map((fact) => (
          <article className={`jul28-fact-row is-${fact.tone}`} key={fact.key}>
            <div className="jul28-fact-row__icon">{layerIcon({ label: fact.label, detail: fact.detail, tone: fact.tone })}</div>
            <div>
              <span className="jul28-fact-row__heading">{fact.heading}</span>
              <strong>{fact.label}</strong>
              <p>{fact.detail}</p>
              <small className="jul28-fact-row__provenance">
                Source: {fact.provenance.sourceLabel} · {formatDateTime(fact.provenance.recordedAt)}
              </small>
            </div>
          </article>
        ))}
      </div>

      <section className="jul28-history" aria-labelledby="jul28-history-title">
        <div className="jul28-history__heading">
          <div><h3 id="jul28-history-title">Unit history</h3><p>Additive personal projection · newest first</p></div>
          <span>{history.length} records</span>
        </div>
        {history.length > 0 ? (
          <ol>
            {history.map((event) => (
              <li key={event.id}>
                <span className="jul28-history__marker" aria-hidden="true" />
                <div>
                  <div className="jul28-history__meta"><strong>{event.title}</strong><time dateTime={event.recordedAt}>{formatDateTime(event.recordedAt)}</time></div>
                  <p>{event.wording}</p>
                  <small>{event.sourceLabel}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="jul28-history__empty">No personal history is recorded for this synthetic section.</p>}
      </section>
    </section>
  );
}

export function TurnBoardFeature({
  repository = jul28SyntheticTurnBoardRepository,
  initialTrade = 'paint',
  initialUnitId,
  onUnitSelected,
  onUnitClose,
}: TurnBoardFeatureProps) {
  const [trade, setTrade] = useState<Jul28Trade>(initialTrade);
  const [filters, setFilters] = useState<Jul28TurnBoardFilters>({
    attention: 'all',
    buildingFloor: 'all',
    crew: 'all',
  });
  const [query, setQuery] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId ?? '');
  const [selectedSection, setSelectedSection] = useState<Jul28Section>('common');
  const lastUnitTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const units = repository.listUnits();
  const projections = useMemo(
    () => projectJul28TurnBoard(units, trade, filters, query),
    [filters, query, trade, units],
  );
  const filterOptions = useMemo(() => projectJul28FilterOptions(units, trade), [trade, units]);
  const selectedUnit = selectedUnitId ? repository.getUnit(selectedUnitId) : undefined;

  useEffect(() => {
    if (selectedUnit) workspaceHeadingRef.current?.focus();
  }, [selectedUnit]);

  const changeTrade = (nextTrade: Jul28Trade) => {
    const nextCrewOptions = projectJul28FilterOptions(units, nextTrade).crews;
    setTrade(nextTrade);
    setFilters((current) => ({
      ...current,
      crew: nextCrewOptions.includes(current.crew) ? current.crew : 'all',
    }));
    if (selectedUnit) {
      const nextSection = recordsForTrade(selectedUnit, nextTrade)
        .find((record) => record.applicability === 'applicable')?.section;
      if (nextSection) setSelectedSection(nextSection);
    }
  };

  const openUnit = (unitId: string, trigger: HTMLButtonElement) => {
    const unit = repository.getUnit(unitId);
    const firstSection = unit && recordsForTrade(unit, trade)
      .find((record) => record.applicability === 'applicable')?.section;
    lastUnitTriggerRef.current = trigger;
    setSelectedUnitId(unitId);
    if (firstSection) setSelectedSection(firstSection);
    onUnitSelected?.(unitId);
  };

  const closeUnit = () => {
    const closingUnitId = selectedUnitId;
    setSelectedUnitId('');
    if (closingUnitId) onUnitClose?.(closingUnitId);
    requestAnimationFrame(() => {
      (lastUnitTriggerRef.current ?? listHeadingRef.current)?.focus();
    });
  };

  const filterCounts = useMemo(() => {
    const options = Object.keys(attentionFilterLabels) as Jul28AttentionFilter[];
    return Object.fromEntries(options.map((attention) => [
      attention,
      projectJul28TurnBoard(units, trade, { ...filters, attention }, query).length,
    ])) as Record<Jul28AttentionFilter, number>;
  }, [filters, query, trade, units]);

  return (
    <div className={`jul28-turnboard ${selectedUnit ? 'has-selected-unit' : ''}`} data-source={repository.source}>
      <section className="jul28-turnboard__list" aria-labelledby="jul28-turnboard-title">
        <header className="jul28-turnboard__header">
          <div>
            <h1 id="jul28-turnboard-title" ref={listHeadingRef} tabIndex={-1}>TurnBoard</h1>
            <p>Personal Paint/Clean view · verify official work on paper</p>
          </div>
          <span className="jul28-synthetic-label">Synthetic candidate</span>
        </header>

        <TradeToggle trade={trade} onChange={changeTrade} />

        <div className="jul28-turnboard__tools">
          <label className="jul28-search">
            <span className="jul28-visually-hidden">Search Units or crew</span>
            <Search size={18} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search units or crew" />
          </label>
          <div className="jul28-select-filter">
            <label>
              <span>Building / floor</span>
              <select
                aria-label="Building / floor"
                value={filters.buildingFloor}
                onChange={(event) => setFilters((current) => ({ ...current, buildingFloor: event.target.value }))}
              >
                <option value="all">All locations</option>
                {filterOptions.buildingFloors.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Crew</span>
              <select
                aria-label="Crew"
                value={filters.crew}
                onChange={(event) => setFilters((current) => ({ ...current, crew: event.target.value }))}
              >
                <option value="all">All crews</option>
                {filterOptions.crews.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="jul28-filter-row" aria-label={`${tradeLabels[trade]} TurnBoard attention filters`} role="group">
          {(Object.keys(attentionFilterLabels) as Jul28AttentionFilter[]).map((option) => (
            <button
              aria-pressed={filters.attention === option}
              key={option}
              onClick={() => setFilters((current) => ({ ...current, attention: option }))}
              type="button"
            >
              {attentionFilterLabels[option]} <strong>{filterCounts[option]}</strong>
            </button>
          ))}
        </div>

        <div className="jul28-unit-list" aria-live="polite">
          {projections.map((projection) => (
            <UnitCard
              key={projection.unitId}
              projection={projection}
              onOpen={(trigger) => openUnit(projection.unitId, trigger)}
            />
          ))}
          {projections.length === 0 ? (
            <div className="jul28-unit-list__empty">
              <Search size={28} aria-hidden="true" />
              <strong>No matching Units</strong>
              <p>Clear search or change a building, crew, or attention filter.</p>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="jul28-turnboard__workspace" aria-label="Selected Unit workspace">
        {selectedUnit ? (
          <UnitWorkspace
            unit={selectedUnit}
            trade={trade}
            selectedSection={selectedSection}
            headingRef={workspaceHeadingRef}
            onTradeChange={changeTrade}
            onSectionChange={setSelectedSection}
            onClose={closeUnit}
          />
        ) : <WorkspaceEmpty />}
      </aside>
    </div>
  );
}
