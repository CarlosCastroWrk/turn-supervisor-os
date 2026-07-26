import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type {
  Jul28LayerProjection,
  Jul28Section,
  Jul28Trade,
  Jul28TurnBoardFilter,
  Jul28TurnBoardRepository,
  Jul28UnitCardProjection,
  Jul28UnitRecord,
} from './model';
import {
  projectJul28SectionFacts,
  projectJul28TradeProgress,
  projectJul28TurnBoard,
  projectJul28UnitHistory,
  recordsForTrade,
} from './projections';
import { jul28SyntheticTurnBoardRepository } from './syntheticRepository';
import './turnBoardFeature.css';

interface TurnBoardFeatureProps {
  repository?: Jul28TurnBoardRepository;
  initialTrade?: Jul28Trade;
  initialUnitId?: string;
  onUnitSelected?: (unitId: string) => void;
}

const tradeLabels: Record<Jul28Trade, string> = { paint: 'Paint', clean: 'Clean' };
const filterLabels: Record<Jul28TurnBoardFilter, string> = {
  all: 'All',
  'needs-me': 'Needs me',
  'crew-reported': 'Crew reported',
  'my-walk': 'My walk',
};

const layerLabels: Array<[keyof Jul28UnitCardProjection['layers'], string, string]> = [
  ['assignmentEvidence', 'Assignment evidence', 'AE'],
  ['crewReported', 'Crew reported', 'CR'],
  ['losInspection', 'My inspection', 'MI'],
  ['propertyWalk', 'Property walk', 'PW'],
  ['paperReview', 'Paper review', 'PR'],
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
          <span aria-hidden="true">{option === 'paint' ? '▰' : '✦'}</span>
          {tradeLabels[option]}
        </button>
      ))}
    </div>
  );
}

function LayerRail({ projection }: { projection: Jul28UnitCardProjection }) {
  return (
    <dl className="jul28-layer-rail" aria-label={`${tradeLabels[projection.trade]} factual layers for Unit ${projection.unitNumber}`}>
      {layerLabels.map(([key, label, shortLabel]) => {
        const layer = projection.layers[key];
        return (
          <div className={`jul28-layer-rail__item is-${layer.tone}`} key={key} title={`${label}: ${layer.label}`}>
            <dt><span className="jul28-layer-rail__long">{label}</span><span className="jul28-layer-rail__short" aria-hidden="true">{shortLabel}</span></dt>
            <dd>{layerIcon(layer)}<span>{layer.label}</span></dd>
          </div>
        );
      })}
    </dl>
  );
}

function UnitCard({ projection, onOpen }: { projection: Jul28UnitCardProjection; onOpen: () => void }) {
  const sectionSummary = projection.applicableSections.map(sectionLabel).join(' / ') || 'No applicable scope';
  const crewSummary = projection.crewNames.length > 0 ? projection.crewNames.join(', ') : 'No crew evidence';

  return (
    <article className={`jul28-unit-card is-${projection.attentionKind}`}>
      <button type="button" className="jul28-unit-card__open" onClick={onOpen} aria-label={`Open Unit ${projection.unitNumber} ${tradeLabels[projection.trade]} workspace`}>
        <div className="jul28-unit-card__heading">
          <div>
            <span className="jul28-unit-card__number">{projection.unitNumber}</span>
            <span className="jul28-unit-card__location">{projection.locationLabel}</span>
          </div>
          <span className={`jul28-attention-label is-${projection.attentionKind}`}>{projection.attentionLabel}</span>
          <ChevronRight className="jul28-unit-card__chevron" size={22} aria-hidden="true" />
        </div>

        <div className="jul28-unit-card__scope">
          <span><strong>{tradeLabels[projection.trade]}</strong> · {sectionSummary}</span>
          <span><Users size={15} aria-hidden="true" /> {crewSummary}</span>
        </div>

        {projection.restrictedSections.length > 0 ? (
          <p className="jul28-unit-card__warning">
            <AlertTriangle size={16} aria-hidden="true" />
            Restricted: {projection.restrictedSections.map(sectionLabel).join(', ')} — do not enter without clarification
          </p>
        ) : null}
        {projection.addedScopeSections.length > 0 ? (
          <p className="jul28-unit-card__added-scope">
            Added scope: {projection.addedScopeSections.map(sectionLabel).join(', ')} · recorded as a new episode, not an original miss
          </p>
        ) : null}
        {projection.duplicateAssignmentSections.length > 0 ? (
          <p className="jul28-unit-card__warning">
            <AlertTriangle size={16} aria-hidden="true" />
            Conflicting active crew claims: {projection.duplicateAssignmentSections.map(sectionLabel).join(', ')}
          </p>
        ) : null}

        <LayerRail projection={projection} />
      </button>
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
  onTradeChange,
  onSectionChange,
  onClose,
}: {
  unit: Jul28UnitRecord;
  trade: Jul28Trade;
  selectedSection: Jul28Section;
  onTradeChange: (trade: Jul28Trade) => void;
  onSectionChange: (section: Jul28Section) => void;
  onClose: () => void;
}) {
  const records = recordsForTrade(unit, trade);
  const selectedRecord = records.find((record) => record.section === selectedSection) ?? records[0];
  const facts = selectedRecord ? projectJul28SectionFacts(selectedRecord) : [];
  const history = selectedRecord ? projectJul28UnitHistory(unit, trade, selectedRecord.section) : [];
  const progress = projectJul28TradeProgress(unit, trade);

  return (
    <section className="jul28-unit-workspace" aria-labelledby="jul28-unit-workspace-title">
      <header className="jul28-unit-workspace__header">
        <button type="button" className="jul28-icon-button jul28-unit-workspace__back" onClick={onClose} aria-label="Return to TurnBoard list">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div>
          <h2 id="jul28-unit-workspace-title">Unit {unit.unitNumber}</h2>
          <p>{unit.buildingLabel} · {unit.floorLabel}</p>
        </div>
        <span className="jul28-read-only-label">Wave 1 · read only</span>
      </header>

      <div className="jul28-paper-banner" role="note">
        <ShieldCheck size={21} aria-hidden="true" />
        <div><strong>Paper TurnBoard remains authoritative.</strong><span>This personal view does not approve work, reconcile payroll, or change paper.</span></div>
      </div>

      <TradeToggle trade={trade} onChange={onTradeChange} />

      <div className="jul28-progress-summary" aria-label={`${tradeLabels[trade]} inspection progress`}>
        <span><strong>{progress.losPassedSectionCount}</strong> my inspections recorded</span>
        <span><strong>{progress.pendingSectionCount}</strong> sections still pending</span>
        <p>{progress.label}</p>
      </div>

      <div className="jul28-section-picker" aria-label={`${tradeLabels[trade]} Unit sections`} role="group">
        {records.map((record) => {
          const isRestricted = record.applicability === 'applicable' && record.access !== 'accessible';
          const isNotApplicable = record.applicability === 'not-applicable';
          const detail = isNotApplicable ? 'not applicable' : isRestricted ? 'restricted' : 'applicable';
          return (
            <button
              aria-pressed={selectedRecord?.section === record.section}
              aria-label={`${sectionLabel(record.section)}, ${detail}`}
              className={`jul28-section-button ${isRestricted ? 'is-restricted' : ''} ${isNotApplicable ? 'is-not-applicable' : ''}`}
              key={record.section}
              onClick={() => onSectionChange(record.section)}
              type="button"
            >
              <span>{sectionLabel(record.section)}</span>
              {record.fullPaint ? <small>Full paint</small> : isRestricted ? <small>Restricted</small> : isNotApplicable ? <small>N/A</small> : null}
            </button>
          );
        })}
      </div>

      <div className="jul28-fact-list">
        {facts.map((fact) => (
          <article className={`jul28-fact-row is-${fact.tone}`} key={fact.key}>
            <div className="jul28-fact-row__icon">{layerIcon({ label: fact.label, detail: fact.detail, tone: fact.tone })}</div>
            <div>
              <span className="jul28-fact-row__heading">{fact.heading}</span>
              <strong>{fact.label}</strong>
              <p>{fact.detail}</p>
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
}: TurnBoardFeatureProps) {
  const [trade, setTrade] = useState<Jul28Trade>(initialTrade);
  const [filter, setFilter] = useState<Jul28TurnBoardFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId ?? '');
  const [selectedSection, setSelectedSection] = useState<Jul28Section>('common');
  const units = repository.listUnits();
  const projections = useMemo(
    () => projectJul28TurnBoard(units, trade, filter, query),
    [filter, query, trade, units],
  );
  const selectedUnit = selectedUnitId ? repository.getUnit(selectedUnitId) : undefined;

  const changeTrade = (nextTrade: Jul28Trade) => {
    setTrade(nextTrade);
    if (selectedUnit) {
      const nextSection = recordsForTrade(selectedUnit, nextTrade).find((record) => record.applicability === 'applicable')?.section;
      if (nextSection) setSelectedSection(nextSection);
    }
  };

  const openUnit = (unitId: string) => {
    const unit = repository.getUnit(unitId);
    const firstSection = unit && recordsForTrade(unit, trade).find((record) => record.applicability === 'applicable')?.section;
    setSelectedUnitId(unitId);
    if (firstSection) setSelectedSection(firstSection);
    onUnitSelected?.(unitId);
  };

  const filterCounts = useMemo(() => {
    const filters: Jul28TurnBoardFilter[] = ['all', 'needs-me', 'crew-reported', 'my-walk'];
    return Object.fromEntries(filters.map((option) => [option, projectJul28TurnBoard(units, trade, option).length])) as Record<Jul28TurnBoardFilter, number>;
  }, [trade, units]);

  return (
    <div className={`jul28-turnboard ${selectedUnit ? 'has-selected-unit' : ''}`} data-source={repository.source}>
      <section className="jul28-turnboard__list" aria-labelledby="jul28-turnboard-title">
        <header className="jul28-turnboard__header">
          <div><h1 id="jul28-turnboard-title">TurnBoard</h1><p>Personal Paint/Clean view · verify official work on paper</p></div>
          <span className="jul28-synthetic-label">Synthetic candidate</span>
        </header>

        <TradeToggle trade={trade} onChange={changeTrade} />

        <div className="jul28-turnboard__tools">
          <label className="jul28-search">
            <span className="jul28-visually-hidden">Filter Units</span>
            <Search size={18} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter units or crew" />
          </label>
          <span className="jul28-filter-icon" aria-hidden="true"><Filter size={18} /></span>
        </div>

        <div className="jul28-filter-row" aria-label={`${tradeLabels[trade]} TurnBoard filters`} role="group">
          {(Object.keys(filterLabels) as Jul28TurnBoardFilter[]).map((option) => (
            <button aria-pressed={filter === option} key={option} onClick={() => setFilter(option)} type="button">
              {filterLabels[option]} <strong>{filterCounts[option]}</strong>
            </button>
          ))}
        </div>

        <div className="jul28-unit-list" aria-live="polite">
          {projections.map((projection) => <UnitCard key={projection.unitId} projection={projection} onOpen={() => openUnit(projection.unitId)} />)}
          {projections.length === 0 ? (
            <div className="jul28-unit-list__empty"><Search size={28} aria-hidden="true" /><strong>No matching Units</strong><p>Clear the search or choose another factual filter.</p></div>
          ) : null}
        </div>
      </section>

      <aside className="jul28-turnboard__workspace" aria-label="Selected Unit workspace">
        {selectedUnit ? (
          <UnitWorkspace
            unit={selectedUnit}
            trade={trade}
            selectedSection={selectedSection}
            onTradeChange={changeTrade}
            onSectionChange={setSelectedSection}
            onClose={() => setSelectedUnitId('')}
          />
        ) : <WorkspaceEmpty />}
      </aside>
    </div>
  );
}
