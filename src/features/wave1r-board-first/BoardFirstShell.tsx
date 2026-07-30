import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cloud,
  DatabaseBackup,
  FileText,
  History,
  ListChecks,
  Lock,
  MessageSquare,
  Mic,
  MoreHorizontal,
  PaintRoller,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Settings,
  Users,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { FieldBottomSheet } from '../jul28-field-shell/components/FieldBottomSheet';
import type {
  Jul28Section,
  Jul28SectionTradeRecord,
  Jul28Trade,
  Jul28UnitRecord,
} from '../jul28-turnboard/model';
import { recordsForTrade, validateJul28SourceCoverage } from '../jul28-turnboard/projections';
import { jul28SyntheticTurnBoardRepository } from '../jul28-turnboard/syntheticRepository';
import { WAVE1R_SYNTHETIC_ACTIVITY, WAVE1R_SYNTHETIC_CONTEXT } from './fixtures';
import {
  createBoardFirstActionProposal,
  createBoardFirstActionActivityItem,
  createBoardFirstAssignmentActivityItem,
  createBoardFirstAssignmentProposal,
  eligibleAssignmentSections,
  filterBoardFirstBoard,
  initialBoardFirstAssistantState,
  listBoardFirstCrewOptions,
  projectBoardFirstActivity,
  projectBoardFirstBoard,
  projectBoardFirstCaptureReceiptActivity,
  projectBoardFirstUnit,
  projectBoardFirstUnitActivity,
  projectBoardFirstUnitAttentions,
  reduceBoardFirstAssistant,
  selectBoardFirstSectionActions,
} from './projections';
import {
  BOARD_FIRST_HOST_DESTINATIONS,
  BOARD_FIRST_NAVIGATION,
  DEFAULT_BOARD_FIRST_VIEW,
  type BoardFirstActivityItem,
  type BoardFirstAssignmentProposal,
  type BoardFirstBoardFilter,
  type BoardFirstCaptureRequest,
  type BoardFirstCaptureKind,
  type BoardFirstHostDestination,
  type BoardFirstHostNavigationHandler,
  type BoardFirstSectionAction,
  type BoardFirstShellProps,
  type BoardFirstTradeProjection,
  type BoardFirstUnitProjection,
  type BoardFirstView,
} from './types';
import './boardFirstShell.css';

type DetailPanel = Jul28Trade | 'blockers' | 'history';
type BoardFirstSourceMode = 'personal' | 'synthetic';

type OpenSheet =
  | { kind: 'needs-me' }
  | { kind: 'plus' }
  | { kind: 'section'; unitId: string; trade: Jul28Trade; section: Jul28Section }
  | { kind: 'assignment'; unitId: string; trade: Jul28Trade; initialSection?: Jul28Section }
  | null;

type DetailTab = { id: DetailPanel; label: string };

interface BoardFirstSheetHistoryEntry {
  sheet: Exclude<OpenSheet, null>;
  triggerId: string;
}

const DETAIL_TABS: readonly DetailTab[] = [
  { id: 'paint', label: 'Paint' },
  { id: 'clean', label: 'Clean' },
  { id: 'blockers', label: 'Waiting' },
  { id: 'history', label: 'Notes & History' },
];

const BOARD_FIRST_SHEET_HISTORY_KEY = 'turnOsBoardFirstSheet';

const readBoardFirstHistoryState = (): Record<string, unknown> => {
  if (typeof window === 'undefined') return {};
  const state = window.history.state;
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
};

const readBoardFirstSheetHistory = (): BoardFirstSheetHistoryEntry | null => {
  const value = readBoardFirstHistoryState()[BOARD_FIRST_SHEET_HISTORY_KEY];
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<BoardFirstSheetHistoryEntry>;
  if (typeof entry.triggerId !== 'string' || !entry.sheet || typeof entry.sheet !== 'object') {
    return null;
  }
  if (!['needs-me', 'plus', 'section', 'assignment'].includes(entry.sheet.kind)) return null;
  return entry as BoardFirstSheetHistoryEntry;
};

const tradeLabels: Record<Jul28Trade, string> = { paint: 'Paint', clean: 'Clean' };
const sectionLabels: Record<Jul28Section, string> = {
  common: 'Common',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
};

const hostIcon = (destination: BoardFirstHostDestination): ReactNode => {
  if (destination === 'crews') return <Users size={19} aria-hidden="true" />;
  if (destination === 'reports') return <BarChart3 size={19} aria-hidden="true" />;
  if (destination === 'setup') return <Settings size={19} aria-hidden="true" />;
  if (destination === 'backup') return <DatabaseBackup size={19} aria-hidden="true" />;
  return <Cloud size={19} aria-hidden="true" />;
};

const focusElement = (element: HTMLElement | null | undefined) => {
  if (!element?.isConnected) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
};

const focusById = (triggerId: string) => {
  const element = document.getElementById(triggerId);
  return focusElement(element);
};

const formatActivityTime = (value: string) => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Time unavailable';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const navIcon = (view: BoardFirstView): ReactNode => {
  if (view === 'turnboard') return <ListChecks size={19} aria-hidden="true" />;
  if (view === 'activity') return <ActivityIcon size={19} aria-hidden="true" />;
  return <MoreHorizontal size={20} aria-hidden="true" />;
};

const actionIcon = (action: BoardFirstSectionAction): ReactNode => {
  if (action.opensAssignment) return <Users size={19} aria-hidden="true" />;
  if (action.id === 'pass-inspection' || action.id === 'pass-reinspection') {
    return <CheckCircle2 size={19} aria-hidden="true" />;
  }
  if (action.id === 'create-callback' || action.id === 'review-callback') {
    return <History size={19} aria-hidden="true" />;
  }
  if (action.id === 'inspection-blocked' || action.id === 'add-blocker') {
    return <Lock size={19} aria-hidden="true" />;
  }
  if (action.id === 'add-note-photo') return <MessageSquare size={19} aria-hidden="true" />;
  return <FileText size={19} aria-hidden="true" />;
};

function ShellHeader({
  attentionCount,
  dateLabel,
  propertyName,
  onOpenNeedsMe,
}: {
  attentionCount: number;
  dateLabel: string;
  propertyName: string;
  onOpenNeedsMe: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <header className="w1r-header">
      <strong className="w1r-header__brand">Turn OS</strong>
      <div className="w1r-header__context">
        <span>{propertyName}</span>
        <small>{dateLabel}</small>
      </div>
      <button
        className="w1r-icon-button w1r-header__bell"
        data-w1r-critical-target="true"
        id="w1r-header-needs-me"
        type="button"
        onClick={(event) => onOpenNeedsMe(event.currentTarget)}
        aria-label={`Open Needs Me, ${attentionCount} Units`}
      >
        <Bell size={19} aria-hidden="true" />
        {attentionCount > 0 ? <span aria-hidden="true">{attentionCount}</span> : null}
      </button>
    </header>
  );
}

function PrimaryNavigation({
  activeView,
  onNavigate,
}: {
  activeView: BoardFirstView;
  onNavigate: (view: BoardFirstView) => void;
}) {
  return (
    <nav className="w1r-navigation" aria-label="Primary">
      {BOARD_FIRST_NAVIGATION.map((destination) => (
        <button
          aria-current={activeView === destination.id ? 'page' : undefined}
          className={activeView === destination.id ? 'is-active' : ''}
          data-w1r-critical-target="true"
          key={destination.id}
          onClick={() => onNavigate(destination.id)}
          type="button"
        >
          {navIcon(destination.id)}
          <span>{destination.label}</span>
        </button>
      ))}
    </nav>
  );
}

function TradeSummary({
  trade,
}: {
  trade: BoardFirstTradeProjection;
}) {
  return (
    <div
      className={`w1r-unit-row__trade is-${trade.trade}`}
      data-testid={`wave2a1-${trade.trade}-summary`}
    >
      <strong>{tradeLabels[trade.trade]}</strong>
      <span title={trade.crewLabel}>{trade.crewLabel}</span>
      <small>{trade.summaryLabel}</small>
    </div>
  );
}

const UnitRow = memo(function UnitRow({
  projection,
  selected,
  onOpenUnit,
}: {
  projection: BoardFirstUnitProjection;
  selected: boolean;
  onOpenUnit: (unitId: string, trigger: HTMLButtonElement) => void;
}) {
  const waiting = projection.waiting;
  const description = [
    `${projection.unitTypeLabel}, ${projection.locationLabel}.`,
    `Paint crew ${projection.paint.crewLabel}; ${projection.paint.summaryLabel}.`,
    `Clean crew ${projection.clean.crewLabel}; ${projection.clean.summaryLabel}.`,
    waiting ? `Waiting: ${projection.waitingLabel}.` : '',
    projection.needsMe ? 'Needs Me.' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={`w1r-unit-row ${selected ? 'is-selected' : ''}`}
      data-testid="wave1r-unit-row"
      data-unit-id={projection.unitId}
    >
      <button
        aria-describedby={`w1r-unit-description-${projection.unitId}`}
        aria-label={`Open Unit ${projection.unitNumber}`}
        className="w1r-unit-row__identity"
        data-w1r-critical-target="true"
        id={`w1r-unit-open-${projection.unitId}`}
        onClick={(event) => onOpenUnit(projection.unitId, event.currentTarget)}
        type="button"
      >
        <span
          className="w1r-visually-hidden"
          id={`w1r-unit-description-${projection.unitId}`}
        >
          {description}
        </span>
        <span className="w1r-unit-row__topline">
          <span className="w1r-unit-row__unit">
            <strong data-testid="wave2a1-unit-number">Unit {projection.unitNumber}</strong>
            <small>{projection.unitTypeLabel} · {projection.locationLabel}</small>
          </span>
          <span className="w1r-unit-row__indicators">
            {waiting ? <span className="w1r-waiting-label"><span aria-hidden="true" />Waiting</span> : null}
            {projection.needsMe ? (
              <span className="w1r-needs-label"><span aria-hidden="true" />Needs Me</span>
            ) : null}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </span>
        <span className="w1r-unit-row__trades">
          <TradeSummary trade={projection.paint} />
          <TradeSummary trade={projection.clean} />
        </span>
      </button>
    </article>
  );
});

function TurnBoardSurface({
  assignmentConflictCount,
  filter,
  needsMeCount,
  onFilterChange,
  projections,
  query,
  selectedUnitId,
  sourceMode,
  totalCount,
  onQueryChange,
  onOpenUnit,
}: {
  assignmentConflictCount: number;
  filter: BoardFirstBoardFilter;
  needsMeCount: number;
  onFilterChange: (filter: BoardFirstBoardFilter) => void;
  projections: readonly BoardFirstUnitProjection[];
  query: string;
  selectedUnitId: string;
  sourceMode: BoardFirstSourceMode;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onOpenUnit: (unitId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="w1r-board" aria-labelledby="w1r-board-title">
      <div className="w1r-surface-heading">
        <div>
          <h1 id="w1r-board-title">TurnBoard</h1>
          <p>
            {projections.length === totalCount
              ? `${totalCount}${sourceMode === 'synthetic' ? ' synthetic' : ''} Units`
              : `${projections.length} of ${totalCount}${sourceMode === 'synthetic' ? ' synthetic' : ''} Units`}
            {' · Paint and Clean stay separate'}
          </p>
        </div>
        <span><ShieldCheck size={15} aria-hidden="true" />Paper remains authoritative</span>
      </div>
      <div className="w1r-board-controls">
        <label className="w1r-board-search">
          <span className="w1r-visually-hidden">Search TurnBoard Units or crew</span>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search TurnBoard Units or crew"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search units or crew"
            type="search"
            value={query}
          />
        </label>
        <div className="w1r-board-filters" role="group" aria-label="Filter TurnBoard Units">
          {([
            ['all', 'All', totalCount],
            ['needs-me', 'Needs Me', needsMeCount],
            ['assignment-conflict', 'Assignment conflict', assignmentConflictCount],
          ] as const).map(([id, label, count]) => (
            <button
              aria-pressed={filter === id}
              className={filter === id ? 'is-active' : ''}
              data-w1r-critical-target="true"
              key={id}
              onClick={() => onFilterChange(id)}
              type="button"
            >
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="w1r-unit-list">
        {projections.map((projection) => (
          <UnitRow
            key={projection.unitId}
            projection={projection}
            selected={selectedUnitId === projection.unitId}
            onOpenUnit={onOpenUnit}
          />
        ))}
        {projections.length === 0 ? (
          <p className="w1r-empty-copy" role="status">
            No {sourceMode === 'synthetic' ? 'synthetic ' : ''}Units match this search and filter.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ActivityList({
  activity,
  compact = false,
  onOpenActivity,
  onOpenUnit,
  sourceMode,
}: {
  activity: readonly BoardFirstActivityItem[];
  compact?: boolean;
  onOpenActivity?: (
    item: BoardFirstActivityItem,
    trigger: HTMLButtonElement,
  ) => void;
  onOpenUnit: (unitId: string, trigger: HTMLButtonElement) => void;
  sourceMode: BoardFirstSourceMode;
}) {
  if (activity.length === 0) {
    return (
      <p className="w1r-empty-copy">
        No {sourceMode === 'synthetic' ? 'synthetic ' : ''}activity is available for this view.
      </p>
    );
  }
  return (
    <ol className={`w1r-activity-list ${compact ? 'is-compact' : ''}`}>
      {activity.map((item) => (
        <li key={item.id}>
          <span className={`w1r-activity-list__marker is-${item.kind}`} aria-hidden="true" />
          <div className="w1r-activity-list__content">
            {onOpenActivity ? (
              <button
                aria-label={`Open ${item.title}`}
                className="w1r-activity-list__open"
                onClick={(event) => onOpenActivity(item, event.currentTarget)}
                type="button"
              >
                <span className="w1r-activity-list__meta">
                  <strong>{item.title}</strong>
                  <time dateTime={item.recordedAt}>{formatActivityTime(item.recordedAt)}</time>
                </span>
                <span className="w1r-activity-list__wording">{item.wording}</span>
                <small>{item.sourceLabel}</small>
              </button>
            ) : (
              <>
                <div className="w1r-activity-list__meta">
                  <strong>{item.title}</strong>
                  <time dateTime={item.recordedAt}>{formatActivityTime(item.recordedAt)}</time>
                </div>
                <p>{item.wording}</p>
                <small>{item.sourceLabel}</small>
              </>
            )}
            {item.unitId && item.unitNumber ? (
              <button
                className="w1r-activity-list__unit"
                data-w1r-critical-target="true"
                id={`w1r-activity-unit-${item.id}`}
                onClick={(event) => onOpenUnit(item.unitId!, event.currentTarget)}
                type="button"
              >
                Unit {item.unitNumber}
                {item.trade ? ` · ${tradeLabels[item.trade]}` : ''}
                {item.section ? ` · ${sectionLabels[item.section]}` : ''}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivitySurface({
  activity,
  onOpenActivity,
  onOpenUnit,
  sourceMode,
}: {
  activity: readonly BoardFirstActivityItem[];
  onOpenActivity?: (
    item: BoardFirstActivityItem,
    trigger: HTMLButtonElement,
  ) => void;
  onOpenUnit: (unitId: string, trigger: HTMLButtonElement) => void;
  sourceMode: BoardFirstSourceMode;
}) {
  return (
    <section className="w1r-secondary-surface" aria-labelledby="w1r-activity-title">
      <div className="w1r-surface-heading">
        <div>
          <h1 id="w1r-activity-title">Activity</h1>
          <p>Human-readable personal field history</p>
        </div>
        <span>{activity.length} {activity.length === 1 ? 'event' : 'events'}</span>
      </div>
      <ActivityList
        activity={activity}
        onOpenActivity={onOpenActivity}
        onOpenUnit={onOpenUnit}
        sourceMode={sourceMode}
      />
    </section>
  );
}

function MoreSurface({
  onHostNavigate,
  onOpenNeedsMe,
}: {
  onHostNavigate?: BoardFirstHostNavigationHandler;
  onOpenNeedsMe: (trigger: HTMLButtonElement) => void;
}) {
  const [status, setStatus] = useState('');

  const requestHostNavigation = async (
    destination: BoardFirstHostDestination,
    trigger: HTMLButtonElement,
  ) => {
    if (!onHostNavigate) {
      setStatus(`${BOARD_FIRST_HOST_DESTINATIONS.find((item) => item.id === destination)?.label} is unavailable until the host wires navigation. No navigation occurred.`);
      return;
    }
    try {
      const receipt = await onHostNavigate({
        destination,
        origin: 'more',
        returnFocus: { triggerId: trigger.id },
      });
      setStatus(receipt.accepted
        ? (receipt.message ?? `${BOARD_FIRST_HOST_DESTINATIONS.find((item) => item.id === destination)?.label} navigation was accepted by the host.`)
        : (receipt.message ?? `The host did not accept ${destination} navigation. No navigation occurred.`));
    } catch {
      setStatus(`The host could not accept ${destination} navigation. No navigation occurred.`);
    }
  };

  return (
    <section className="w1r-secondary-surface" aria-labelledby="w1r-more-title">
      <div className="w1r-surface-heading">
        <div>
          <h1 id="w1r-more-title">More</h1>
          <p>Secondary tools stay behind the field board</p>
        </div>
      </div>
      <div className="w1r-more-list">
        <button
          data-w1r-critical-target="true"
          id="w1r-more-needs-me"
          onClick={(event) => onOpenNeedsMe(event.currentTarget)}
          type="button"
        >
          <Bell size={19} aria-hidden="true" />
          <span><strong>Needs Me</strong><small>Open the same personal attention list as the header bell.</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <div className="w1r-more-list__legacy">
          <MoreHorizontal size={19} aria-hidden="true" />
          <span>
            <strong>Advanced / Legacy</strong>
            <small>Existing host-owned tools remain available through the continuity actions below. Track A never fabricates their screens.</small>
          </span>
        </div>
        {BOARD_FIRST_HOST_DESTINATIONS.map((destination) => (
          <button
            data-w1r-critical-target="true"
            id={`w1r-more-${destination.id}`}
            key={destination.id}
            onClick={(event) => {
              void requestHostNavigation(destination.id, event.currentTarget);
            }}
            type="button"
          >
            {hostIcon(destination.id)}
            <span>
              <strong>{destination.label}</strong>
              <small>Continue in the existing host-owned {destination.label} tool.</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
        {status ? <p className="w1r-more-status" role="status">{status}</p> : null}
      </div>
    </section>
  );
}

function TradeDetail({
  projection,
  unit,
  onOpenAssignment,
  onOpenSection,
}: {
  projection: BoardFirstTradeProjection;
  unit: Jul28UnitRecord;
  onOpenAssignment: (trigger: HTMLButtonElement) => void;
  onOpenSection: (section: Jul28Section, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="w1r-trade-detail" aria-labelledby={`w1r-${projection.trade}-detail`}>
      <div className="w1r-trade-detail__heading">
        <div>
          {projection.trade === 'paint'
            ? <PaintRoller size={18} aria-hidden="true" />
            : <Sparkles size={18} aria-hidden="true" />}
          <span>
            <h3 id={`w1r-${projection.trade}-detail`}>{tradeLabels[projection.trade]}</h3>
            <small>{projection.summaryLabel}</small>
          </span>
        </div>
        {projection.sourceCoverageComplete ? (
          <button
            data-w1r-critical-target="true"
            id={`w1r-detail-crew-${unit.id}-${projection.trade}`}
            onClick={(event) => onOpenAssignment(event.currentTarget)}
            type="button"
          >
            <Users size={16} aria-hidden="true" />
            {projection.crewLabel}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <div
            aria-label={`${tradeLabels[projection.trade]} crew: Assignment unknown`}
            className="w1r-trade-detail__crew-status"
          >
            <Users size={16} aria-hidden="true" />
            Assignment unknown
          </div>
        )}
      </div>
      <div className="w1r-detail-sections" aria-label={`${tradeLabels[projection.trade]} sections for Unit ${unit.unitNumber}`}>
        {projection.sections.map((section) => (
          <button
            className={`is-${section.tone} ${section.applicable ? '' : 'is-not-applicable'}`}
            data-w1r-critical-target="true"
            id={`w1r-detail-section-${unit.id}-${projection.trade}-${section.section}`}
            key={section.section}
            onClick={(event) => onOpenSection(section.section, event.currentTarget)}
            type="button"
            aria-label={`${tradeLabels[projection.trade]} ${section.label}`}
          >
            <strong>{sectionLabels[section.section]}</strong>
            <small>{section.label.replace(`${sectionLabels[section.section]} `, '')}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function UnitDetail({
  activity,
  panel,
  projection,
  sourceMode,
  unit,
  headingRef,
  onOpenActivity,
  onClose,
  onOpenAssignment,
  onOpenPersonalUnit,
  onOpenSection,
  onOpenUnitFromHistory,
  onPanelChange,
}: {
  activity: readonly BoardFirstActivityItem[];
  panel: DetailPanel;
  projection: BoardFirstUnitProjection;
  sourceMode: BoardFirstSourceMode;
  unit: Jul28UnitRecord;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onOpenActivity?: (
    item: BoardFirstActivityItem,
    trigger: HTMLButtonElement,
  ) => void;
  onClose: () => void;
  onOpenAssignment: (trade: Jul28Trade, trigger: HTMLButtonElement) => void;
  onOpenPersonalUnit?: (unitId: string) => void;
  onOpenSection: (trade: Jul28Trade, section: Jul28Section, trigger: HTMLButtonElement) => void;
  onOpenUnitFromHistory: (unitId: string, trigger: HTMLButtonElement) => void;
  onPanelChange: (panel: DetailPanel) => void;
}) {
  const blockers = projectBoardFirstUnitAttentions(unit).filter((item) => item.blockerKind);
  const unitActivity = projectBoardFirstUnitActivity(activity, unit.id);

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % DETAIL_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = DETAIL_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = DETAIL_TABS[nextIndex];
    onPanelChange(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#w1r-tab-${unit.id}-${nextTab.id}`)
      ?.focus({ preventScroll: true });
  };

  return (
    <aside className="w1r-unit-detail" aria-labelledby="w1r-unit-detail-title">
      <header className="w1r-unit-detail__header">
        <button
          className="w1r-icon-button w1r-unit-detail__back"
          data-w1r-critical-target="true"
          onClick={onClose}
          type="button"
          aria-label="Back to TurnBoard"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <h2 id="w1r-unit-detail-title" ref={headingRef} tabIndex={-1}>Unit {unit.unitNumber}</h2>
          <p>{unit.unitTypeLabel} · {projection.locationLabel}</p>
        </div>
        {projection.needsMe ? <span className="w1r-needs-label"><span aria-hidden="true" />Needs Me</span> : null}
      </header>

      {onOpenPersonalUnit ? (
        <button
          className="w1r-personal-unit-link"
          data-w1r-critical-target="true"
          onClick={() => onOpenPersonalUnit(unit.id)}
          type="button"
        >
          Personal notes &amp; photos
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ) : null}

      <div className="w1r-detail-tabs" role="tablist" aria-label={`Unit ${unit.unitNumber} detail`}>
        {DETAIL_TABS.map((tab, index) => (
          <button
            aria-controls={`w1r-panel-${unit.id}`}
            aria-selected={panel === tab.id}
            className={panel === tab.id ? 'is-active' : ''}
            data-w1r-critical-target="true"
            id={`w1r-tab-${unit.id}-${tab.id}`}
            key={tab.id}
            onClick={() => onPanelChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            role="tab"
            tabIndex={panel === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`w1r-tab-${unit.id}-${panel}`}
        className="w1r-unit-detail__body"
        id={`w1r-panel-${unit.id}`}
        role="tabpanel"
        tabIndex={0}
      >
        {panel === 'paint' ? (
          <TradeDetail
            projection={projection.paint}
            unit={unit}
            onOpenAssignment={(trigger) => onOpenAssignment('paint', trigger)}
            onOpenSection={(section, trigger) => onOpenSection('paint', section, trigger)}
          />
        ) : null}
        {panel === 'clean' ? (
          <TradeDetail
            projection={projection.clean}
            unit={unit}
            onOpenAssignment={(trigger) => onOpenAssignment('clean', trigger)}
            onOpenSection={(section, trigger) => onOpenSection('clean', section, trigger)}
          />
        ) : null}
        {panel === 'blockers' ? (
          <section className="w1r-blocker-list" aria-labelledby="w1r-blockers-title">
            <h3 id="w1r-blockers-title">Waiting</h3>
            {blockers.length > 0 ? blockers.slice(0, 8).map((blocker) => (
              <button
                data-w1r-critical-target="true"
                id={`w1r-detail-blocker-${unit.id}-${blocker.trade}-${blocker.section}`}
                key={`${blocker.trade}:${blocker.section}:${blocker.label}`}
                onClick={(event) => onOpenSection(
                  blocker.trade,
                  blocker.section,
                  event.currentTarget,
                )}
                type="button"
              >
                <AlertTriangle size={17} aria-hidden="true" />
                <span><strong>{blocker.label}</strong><small>{blocker.nextAction}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )) : (
              <p className="w1r-empty-copy">
                No source-grounded waiting detail is projected for this {sourceMode === 'synthetic' ? 'synthetic ' : ''}Unit.
              </p>
            )}
          </section>
        ) : null}
        {panel === 'history' ? (
          <section className="w1r-unit-history" aria-labelledby="w1r-unit-history-title">
            <div>
              <h3 id="w1r-unit-history-title">Notes &amp; History</h3>
              <span>{unitActivity.length} linked items</span>
            </div>
            <ActivityList
              compact
              activity={unitActivity}
              onOpenActivity={onOpenActivity}
              onOpenUnit={onOpenUnitFromHistory}
              sourceMode={sourceMode}
            />
          </section>
        ) : null}
      </div>

      <footer className="w1r-paper-footer">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Paper remains authoritative · {sourceMode === 'synthetic'
            ? 'synthetic read-only candidate'
            : 'personal Turn record'}
        </span>
      </footer>
    </aside>
  );
}

function AssistantBar({
  message,
  onOpenPlus,
  onRequestVoice,
  onSubmit,
}: {
  message: string;
  onOpenPlus: (trigger: HTMLButtonElement) => void;
  onRequestVoice: (trigger: HTMLButtonElement) => void;
  onSubmit: (draft: string) => boolean;
}) {
  const [state, dispatch] = useReducer(reduceBoardFirstAssistant, initialBoardFirstAssistantState);
  const touchStartRef = useRef<number | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!state.draft.trim()) return;
    const hostAcceptedRequest = onSubmit(state.draft);
    dispatch({
      type: 'message-changed',
      message: hostAcceptedRequest
        ? 'Draft sent to the host callback. No save or operational change is claimed.'
        : 'No host assistant is wired. The draft remains in this shell.',
    });
  };

  const requestVoice = (trigger: HTMLButtonElement) => {
    onRequestVoice(trigger);
    dispatch({
      type: 'message-changed',
      message: 'Waiting for the existing Capture owner to accept or reject voice entry. This shell is not recording.',
    });
  };

  return (
    <section
      className={`w1r-assistant ${state.expanded ? 'is-expanded' : ''}`}
      aria-label="Turn OS assistant"
      onTouchStart={(event) => {
        touchStartRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        const end = event.changedTouches[0]?.clientY;
        touchStartRef.current = null;
        if (state.expanded && start !== null && end !== undefined && end - start > 36) {
          dispatch({ type: 'collapse' });
        }
      }}
    >
      <button
        aria-expanded={state.expanded}
        className="w1r-assistant__launcher"
        data-w1r-critical-target="true"
        id="w1r-assistant-launcher"
        onClick={() => dispatch({ type: 'toggle' })}
        type="button"
        aria-label={state.expanded ? 'Collapse Turn OS assistant' : 'Expand Turn OS assistant'}
      >
        <span>Turn<br />OS</span>
      </button>
      {state.expanded ? (
        <form onSubmit={submit}>
          <button
            className="w1r-icon-button"
            data-w1r-critical-target="true"
            id="w1r-assistant-plus"
            onClick={(event) => onOpenPlus(event.currentTarget)}
            type="button"
            aria-label="Open Turn OS add menu"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
          <label>
            <span className="w1r-visually-hidden">Ask or update Turn OS</span>
            <input
              aria-label="Ask or update Turn OS"
              id="w1r-assistant-input"
              onChange={(event) => dispatch({ type: 'draft-changed', draft: event.target.value })}
              placeholder="Ask or update Turn OS…"
              value={state.draft}
            />
          </label>
          <button
            className="w1r-icon-button"
            data-w1r-critical-target="true"
            id="w1r-assistant-voice"
            onClick={(event) => requestVoice(event.currentTarget)}
            type="button"
            aria-label="Request voice entry from existing Capture owner"
          >
            <Mic size={20} aria-hidden="true" />
          </button>
        </form>
      ) : null}
      {state.expanded && (message || state.message) ? (
        <p role="status">{message || state.message}</p>
      ) : null}
    </section>
  );
}

function NeedsMeSheet({
  open,
  projections,
  sourceMode,
  onDismiss,
  onOpenUnit,
}: {
  open: boolean;
  projections: readonly BoardFirstUnitProjection[];
  sourceMode: BoardFirstSourceMode;
  onDismiss: () => void;
  onOpenUnit: (unitId: string, trigger: HTMLButtonElement) => void;
}) {
  const needsMe = projections.filter((projection) => projection.needsMe);
  return (
    <FieldBottomSheet
      description={sourceMode === 'synthetic'
        ? 'Personal synthetic attention only. Verify all official work on paper.'
        : 'Personal attention only. Verify all official work on paper.'}
      onDismiss={onDismiss}
      open={open}
      title="Needs Me"
    >
      <div className="w1r-sheet-list">
        {needsMe.map((projection) => (
          <button
            data-w1r-critical-target="true"
            id={`w1r-needs-unit-${projection.unitId}`}
            key={projection.unitId}
            onClick={(event) => onOpenUnit(projection.unitId, event.currentTarget)}
            type="button"
          >
            <span>
              <strong>Unit {projection.unitNumber}</strong>
              <small>{projection.highestAttention?.label}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
    </FieldBottomSheet>
  );
}

function SectionActionSheet({
  open,
  record,
  sourceMode,
  sourceCoverageComplete,
  unit,
  onAction,
  onDismiss,
  onOpenAssignment,
}: {
  open: boolean;
  record: Jul28SectionTradeRecord;
  sourceMode: BoardFirstSourceMode;
  sourceCoverageComplete: boolean;
  unit: Jul28UnitRecord;
  onAction: (action: BoardFirstSectionAction) => void;
  onDismiss: () => void;
  onOpenAssignment: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const actions = selectBoardFirstSectionActions(record, sourceCoverageComplete);
  const unitProjection = projectBoardFirstUnit(unit);
  const tradeProjection = unitProjection[record.trade];
  const sectionProjection = tradeProjection.sections.find((section) => section.section === record.section);

  return (
    <FieldBottomSheet
      description={`${tradeLabels[record.trade]} · Section ${sectionLabels[record.section]}`}
      onDismiss={onDismiss}
      open={open}
      title={`Unit ${unit.unitNumber}`}
    >
      <div className={`w1r-current-state is-${sectionProjection?.tone ?? 'neutral'}`}>
        <span>Current state</span>
        <strong>{sectionProjection?.label ?? 'State unavailable'}</strong>
        <small>
          {sourceMode === 'synthetic'
            ? 'Read-only projection from existing Jul28 facts.'
            : 'Read-only projection from personal Turn OS data.'}
        </small>
      </div>
      <div className="w1r-sheet-actions">
        <span>Valid next actions</span>
        {actions.map((item) => (
          <button
            data-w1r-critical-target="true"
            key={item.id}
            onClick={() => {
              if (item.opensAssignment) {
                onOpenAssignment();
                return;
              }
              onAction(item);
              if (!item.captureKind) {
                setFeedback(`${item.label} was proposed. No official, persisted, or paper state changed.`);
              }
            }}
            type="button"
          >
            {actionIcon(item)}
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      {feedback ? <p className="w1r-honesty-message" role="status">{feedback}</p> : null}
      <p className="w1r-sheet-paper"><ShieldCheck size={15} aria-hidden="true" />Paper remains authoritative.</p>
    </FieldBottomSheet>
  );
}

function AssignmentSheet({
  crewOptions,
  initialSection,
  open,
  sourceMode,
  trade,
  unit,
  onConfirm,
  onDismiss,
}: {
  crewOptions: readonly string[];
  initialSection?: Jul28Section;
  open: boolean;
  sourceMode: BoardFirstSourceMode;
  trade: Jul28Trade;
  unit: Jul28UnitRecord;
  onConfirm: (proposal: BoardFirstAssignmentProposal) => void;
  onDismiss: () => void;
}) {
  const eligible = eligibleAssignmentSections(unit, trade);
  const [crewName, setCrewName] = useState(crewOptions[0] ?? '');
  const [sections, setSections] = useState<Jul28Section[]>(() => (
    initialSection && eligible.includes(initialSection) ? [initialSection] : [...eligible]
  ));
  const [confirmed, setConfirmed] = useState<BoardFirstAssignmentProposal | null>(null);
  const proposal = useMemo(
    () => createBoardFirstAssignmentProposal(unit, trade, crewName, sections),
    [crewName, sections, trade, unit],
  );

  return (
    <FieldBottomSheet
      description={`${tradeLabels[trade]} · ${
        sourceMode === 'synthetic' ? 'synthetic assignment proposal' : 'personal draft assignment proposal'
      }`}
      onDismiss={onDismiss}
      open={open}
      title={`Unit ${unit.unitNumber} crew`}
    >
      <div className="w1r-assignment-form">
        <label>
          <span>Crew</span>
          <select
            aria-label={sourceMode === 'synthetic' ? 'Select synthetic crew' : 'Select crew'}
            onChange={(event) => {
              setCrewName(event.target.value);
              setConfirmed(null);
            }}
            value={crewName}
          >
            {crewOptions.length === 0 ? (
              <option value="">
                No compatible {sourceMode === 'synthetic' ? 'synthetic ' : ''}crew available
              </option>
            ) : null}
            {crewOptions.map((crew) => <option key={crew} value={crew}>{crew}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Assignable sections · passed and paper-review work omitted</legend>
          <button
            className="w1r-select-all"
            data-w1r-critical-target="true"
            onClick={() => {
              setSections(sections.length === eligible.length ? [] : [...eligible]);
              setConfirmed(null);
            }}
            type="button"
          >
            {sections.length === eligible.length ? 'Clear sections' : 'Select all released sections'}
          </button>
          <div>
            {eligible.map((section) => (
              <label key={section}>
                <input
                  checked={sections.includes(section)}
                  onChange={() => {
                    setSections((current) => (
                      current.includes(section)
                        ? current.filter((candidate) => candidate !== section)
                        : [...current, section]
                    ));
                    setConfirmed(null);
                  }}
                  type="checkbox"
                />
                <span>{sectionLabels[section]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {proposal.conflicts.length > 0 ? (
          <div className="w1r-assignment-warning" role="note">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              <strong>Existing responsibility detected</strong>
              <small>
                {proposal.conflicts.map((conflict) =>
                  `${sectionLabels[conflict.section]}: ${conflict.existingCrewNames.join(', ')}`,
                ).join(' · ')}. This remains a nonpersisted proposal and does not replace either claim.
              </small>
            </span>
          </div>
        ) : null}
        <button
          className="w1r-primary-action"
          data-w1r-critical-target="true"
          disabled={!crewName || proposal.sections.length === 0}
          onClick={() => {
            onConfirm(proposal);
            setConfirmed(proposal);
          }}
          type="button"
        >
          Confirm {sourceMode === 'synthetic' ? 'synthetic' : 'draft'} proposal
        </button>
        {confirmed ? <p className="w1r-honesty-message" role="status">{confirmed.disclaimer}</p> : null}
        <p className="w1r-sheet-paper"><ShieldCheck size={15} aria-hidden="true" />No official or persisted assignment is created.</p>
      </div>
    </FieldBottomSheet>
  );
}

const PLUS_ITEMS: Array<{
  kind: BoardFirstCaptureKind;
  label: string;
  icon: ReactNode;
}> = [
  { kind: 'note', label: 'Note', icon: <MessageSquare size={19} aria-hidden="true" /> },
  { kind: 'photo-file', label: 'Photo or File', icon: <Camera size={19} aria-hidden="true" /> },
  { kind: 'assignment-intake', label: 'Assignment Intake', icon: <Users size={19} aria-hidden="true" /> },
  { kind: 'blocker', label: 'Add Blocker', icon: <Lock size={19} aria-hidden="true" /> },
];

function PlusSheet({
  open,
  onDismiss,
  onSelect,
}: {
  open: boolean;
  onDismiss: () => void;
  onSelect: (kind: BoardFirstCaptureKind) => void;
}) {
  return (
    <FieldBottomSheet
      description="Request one focused intent from the existing Capture owner. Acceptance is reported by the host."
      onDismiss={onDismiss}
      open={open}
      title="Add to Turn OS"
    >
      <div className="w1r-sheet-actions w1r-plus-actions">
        {PLUS_ITEMS.map((item) => (
          <button
            data-w1r-critical-target="true"
            key={item.kind}
            onClick={() => onSelect(item.kind)}
            type="button"
          >
            {item.icon}
            <strong>{item.label}</strong>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
    </FieldBottomSheet>
  );
}

export function BoardFirstShell({
  activeView: controlledActiveView,
  activityItems = WAVE1R_SYNTHETIC_ACTIVITY,
  dateLabel = WAVE1R_SYNTHETIC_CONTEXT.dateLabel,
  externalDialogOpen = false,
  embedded = false,
  hostStatusSlot,
  initialUnitId = '',
  propertyName = WAVE1R_SYNTHETIC_CONTEXT.propertyName,
  repository = jul28SyntheticTurnBoardRepository,
  onActionProposal,
  onAssignmentProposal,
  onAssistantSubmit,
  onCaptureRequest,
  onHostNavigate,
  onActiveViewChange,
  onDialogOpenChange,
  onOpenActivity,
  onOpenPersonalUnit,
  onUnitNavigate,
}: BoardFirstShellProps) {
  const sourceMode: BoardFirstSourceMode = repository.source.includes('synthetic')
    ? 'synthetic'
    : 'personal';
  const units = useMemo(() => repository.listUnits(), [repository]);
  const projections = useMemo(() => projectBoardFirstBoard(repository), [repository]);
  const [boardQuery, setBoardQuery] = useState('');
  const [boardFilter, setBoardFilter] = useState<BoardFirstBoardFilter>('all');
  const filteredProjections = useMemo(
    () => filterBoardFirstBoard(projections, boardQuery, boardFilter),
    [boardFilter, boardQuery, projections],
  );
  const boardCounts = useMemo(() => ({
    assignmentConflict: projections.filter((projection) => projection.assignmentConflict).length,
    needsMe: projections.filter((projection) => projection.needsMe).length,
  }), [projections]);
  const [localActivityItems, setLocalActivityItems] = useState<BoardFirstActivityItem[]>([]);
  const activity = useMemo(
    () => projectBoardFirstActivity(repository, [...activityItems, ...localActivityItems]),
    [activityItems, localActivityItems, repository],
  );
  const crewOptions = useMemo(() => ({
    paint: listBoardFirstCrewOptions(repository, 'paint'),
    clean: listBoardFirstCrewOptions(repository, 'clean'),
  }), [repository]);
  const [localActiveView, setLocalActiveView] = useState<BoardFirstView>(DEFAULT_BOARD_FIRST_VIEW);
  const activeView = controlledActiveView ?? localActiveView;
  const changeActiveView = useCallback((view: BoardFirstView) => {
    setLocalActiveView(view);
    onActiveViewChange?.(view);
  }, [onActiveViewChange]);
  const [selectedUnitId, setSelectedUnitId] = useState(
    initialUnitId && repository.getUnit(initialUnitId) ? initialUnitId : '',
  );
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('paint');
  const initialSheetHistory = readBoardFirstSheetHistory();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(initialSheetHistory?.sheet ?? null);
  const [pendingCapture, setPendingCapture] = useState<BoardFirstCaptureRequest | null>(null);
  const [captureStatus, setCaptureStatus] = useState('');
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const sheetOriginRef = useRef<HTMLElement | null>(null);
  const sheetOriginIdRef = useRef(initialSheetHistory?.triggerId ?? '');
  const openSheetRef = useRef<OpenSheet>(initialSheetHistory?.sheet ?? null);
  const afterSheetCloseRef = useRef<(() => void) | null>(null);
  const restoreSheetFocusRef = useRef(true);
  const unitOriginRef = useRef<HTMLElement | null>(null);
  const unitFallbackIdRef = useRef('');
  const receiptSequenceRef = useRef(0);
  const captureSequenceRef = useRef(0);
  const dispatchedCaptureIdsRef = useRef(new Set<string>());
  const previousInitialUnitIdRef = useRef(initialUnitId);
  const dialogOpen = openSheet !== null || externalDialogOpen;
  const selectedUnit = selectedUnitId
    ? units.find((unit) => unit.id === selectedUnitId)
    : undefined;
  const selectedProjection = selectedUnit
    ? projections.find((projection) => projection.unitId === selectedUnit.id)
    : undefined;

  useEffect(() => {
    onDialogOpenChange?.(openSheet !== null);
  }, [onDialogOpenChange, openSheet]);

  useEffect(() => {
    if (previousInitialUnitIdRef.current === initialUnitId) return;
    previousInitialUnitIdRef.current = initialUnitId;
    const routeUnitId = initialUnitId && repository.getUnit(initialUnitId)
      ? initialUnitId
      : '';
    setSelectedUnitId(routeUnitId);
    if (routeUnitId) {
      changeActiveView('turnboard');
      setDetailPanel('paint');
    }
  }, [changeActiveView, initialUnitId, repository]);

  useEffect(() => {
    if (selectedUnit) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedUnit]);

  const scheduleFocusRestore = useCallback((
    origin: HTMLElement | null,
    fallbackId = '',
  ) => {
    requestAnimationFrame(() => {
      if (!focusElement(origin) && fallbackId) focusById(fallbackId);
    });
  }, []);

  const appendLocalActivity = useCallback((item: BoardFirstActivityItem) => {
    setLocalActivityItems((current) => (
      current.some((candidate) => candidate.id === item.id) ? current : [...current, item]
    ));
  }, []);

  const nextReceipt = useCallback((kind: 'action' | 'assignment') => {
    receiptSequenceRef.current += 1;
    return {
      receiptId: `${kind}-${receiptSequenceRef.current}`,
      recordedAt: new Date().toISOString(),
    };
  }, []);

  const completeSheetClose = useCallback(() => {
    const fallbackId = sheetOriginIdRef.current;
    const origin = sheetOriginRef.current
      ?? (fallbackId ? document.getElementById(fallbackId) : null);
    const afterClose = afterSheetCloseRef.current;
    const shouldRestoreFocus = restoreSheetFocusRef.current;
    openSheetRef.current = null;
    setOpenSheet(null);
    sheetOriginRef.current = null;
    sheetOriginIdRef.current = '';
    afterSheetCloseRef.current = null;
    restoreSheetFocusRef.current = true;
    if (shouldRestoreFocus) scheduleFocusRestore(origin, fallbackId);
    if (afterClose) requestAnimationFrame(afterClose);
  }, [scheduleFocusRestore]);

  const requestSheetClose = useCallback((
    afterClose?: () => void,
    restoreFocus = true,
  ) => {
    afterSheetCloseRef.current = afterClose ?? null;
    restoreSheetFocusRef.current = restoreFocus;
    if (readBoardFirstSheetHistory()) {
      window.history.back();
      return;
    }
    completeSheetClose();
  }, [completeSheetClose]);

  const openBoardSheet = useCallback((
    sheet: Exclude<OpenSheet, null>,
    trigger?: HTMLElement,
  ) => {
    if (trigger) {
      sheetOriginRef.current = trigger;
      sheetOriginIdRef.current = trigger.id;
    }
    const entry: BoardFirstSheetHistoryEntry = {
      sheet,
      triggerId: sheetOriginIdRef.current,
    };
    const nextState = {
      ...readBoardFirstHistoryState(),
      [BOARD_FIRST_SHEET_HISTORY_KEY]: entry,
    };
    if (readBoardFirstSheetHistory()) {
      window.history.replaceState(nextState, '', window.location.href);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }
    openSheetRef.current = sheet;
    setOpenSheet(sheet);
  }, []);

  useEffect(() => {
    const handleSheetHistory = () => {
      const historyEntry = readBoardFirstSheetHistory();
      if (historyEntry) {
        sheetOriginIdRef.current = historyEntry.triggerId;
        sheetOriginRef.current = historyEntry.triggerId
          ? document.getElementById(historyEntry.triggerId)
          : null;
        openSheetRef.current = historyEntry.sheet;
        setOpenSheet(historyEntry.sheet);
        return;
      }
      if (openSheetRef.current) completeSheetClose();
    };

    window.addEventListener('popstate', handleSheetHistory);
    return () => window.removeEventListener('popstate', handleSheetHistory);
  }, [completeSheetClose]);

  const closeSheet = useCallback(() => {
    requestSheetClose();
  }, [requestSheetClose]);

  const openNeedsMe = useCallback((trigger: HTMLButtonElement) => {
    openBoardSheet({ kind: 'needs-me' }, trigger);
  }, [openBoardSheet]);

  const selectUnit = useCallback((unitId: string, trigger?: HTMLElement) => {
    unitOriginRef.current = trigger ?? null;
    unitFallbackIdRef.current = `w1r-unit-open-${unitId}`;
    changeActiveView('turnboard');
    setSelectedUnitId(unitId);
    setDetailPanel('paint');
    onUnitNavigate?.(unitId);
  }, [changeActiveView, onUnitNavigate]);

  const openUnit = useCallback((unitId: string, trigger?: HTMLElement) => {
    if (openSheetRef.current) {
      requestSheetClose(() => selectUnit(unitId), false);
      return;
    }
    selectUnit(unitId, trigger);
  }, [requestSheetClose, selectUnit]);

  const closeUnit = useCallback(() => {
    const origin = unitOriginRef.current;
    const fallbackId = unitFallbackIdRef.current;
    setSelectedUnitId('');
    unitOriginRef.current = null;
    unitFallbackIdRef.current = '';
    scheduleFocusRestore(origin, fallbackId);
    onUnitNavigate?.();
  }, [onUnitNavigate, scheduleFocusRestore]);

  const openSection = useCallback((
    unitId: string,
    trade: Jul28Trade,
    section: Jul28Section,
    trigger: HTMLButtonElement,
  ) => {
    openBoardSheet({ kind: 'section', unitId, trade, section }, trigger);
  }, [openBoardSheet]);

  const openAssignment = useCallback((
    unitId: string,
    trade: Jul28Trade,
    initialSection?: Jul28Section,
    trigger?: HTMLButtonElement,
  ) => {
    openBoardSheet({ kind: 'assignment', unitId, trade, initialSection }, trigger);
  }, [openBoardSheet]);

  const queueCapture = useCallback((
    request: Omit<BoardFirstCaptureRequest, 'requestId'>,
  ) => {
    captureSequenceRef.current += 1;
    setCaptureStatus('');
    const nextRequest: BoardFirstCaptureRequest = {
      ...request,
      requestId: `wave1r-capture-${captureSequenceRef.current}`,
    };
    if (openSheetRef.current) {
      requestSheetClose(() => setPendingCapture(nextRequest), false);
      return;
    }
    setPendingCapture(nextRequest);
  }, [requestSheetClose]);

  useEffect(() => {
    if (!pendingCapture || openSheet || dispatchedCaptureIdsRef.current.has(pendingCapture.requestId)) {
      return;
    }
    const request = pendingCapture;
    dispatchedCaptureIdsRef.current.add(request.requestId);
    setPendingCapture(null);

    const restoreRejectedFocus = () => {
      scheduleFocusRestore(null, request.returnFocus.triggerId);
    };

    const dispatch = async () => {
      if (!onCaptureRequest) {
        setCaptureStatus('Capture is unavailable until the host wires it. Nothing was handed off or saved.');
        restoreRejectedFocus();
        return;
      }
      try {
        const receipt = await onCaptureRequest(request);
        const receiptActivity = projectBoardFirstCaptureReceiptActivity(
          request,
          receipt,
          new Date().toISOString(),
        );
        if (receiptActivity) appendLocalActivity(receiptActivity);
        if (receipt.accepted) {
          setCaptureStatus(receipt.message ?? (
            receipt.activityItem
              ? 'Capture accepted the request and returned an activity item.'
              : 'Capture accepted the handoff. This receipt does not claim that content was saved.'
          ));
        } else {
          setCaptureStatus(receipt.message ?? 'Capture did not accept the request. Nothing was handed off or saved.');
          restoreRejectedFocus();
        }
      } catch {
        setCaptureStatus('Capture could not accept the request. Nothing was handed off or saved.');
        restoreRejectedFocus();
      }
    };

    void dispatch();
  }, [
    appendLocalActivity,
    onCaptureRequest,
    openSheet,
    pendingCapture,
    scheduleFocusRestore,
  ]);

  const sectionSheet = openSheet?.kind === 'section'
    ? (() => {
        const unit = repository.getUnit(openSheet.unitId);
        const record = unit
          ? recordsForTrade(unit, openSheet.trade).find((candidate) => candidate.section === openSheet.section)
          : undefined;
        return unit && record ? { unit, record } : null;
      })()
    : null;
  const assignmentUnit = openSheet?.kind === 'assignment'
    ? repository.getUnit(openSheet.unitId)
    : undefined;
  const MainRegion = embedded ? 'div' : 'main';

  return (
    <div
      className={`w1r-shell ${selectedUnit ? 'has-selected-unit' : ''} ${embedded ? 'is-embedded' : ''}`}
      data-source={repository.source}
      data-testid="wave1r-shell"
    >
      <div className="w1r-shell__app" aria-hidden={dialogOpen || undefined} inert={dialogOpen || undefined}>
        {!embedded ? (
          <ShellHeader
            attentionCount={boardCounts.needsMe}
            dateLabel={dateLabel}
            propertyName={propertyName}
            onOpenNeedsMe={openNeedsMe}
          />
        ) : null}
        {hostStatusSlot}
        <div className="w1r-shell__body">
          {!embedded ? (
            <PrimaryNavigation
              activeView={activeView}
              onNavigate={(view) => {
                changeActiveView(view);
                if (view !== 'turnboard' && selectedUnitId) {
                  setSelectedUnitId('');
                  onUnitNavigate?.();
                }
              }}
            />
          ) : null}
          <MainRegion className="w1r-main">
            <div className="w1r-main__surface">
              {activeView === 'turnboard' ? (
                <TurnBoardSurface
                  assignmentConflictCount={boardCounts.assignmentConflict}
                  filter={boardFilter}
                  needsMeCount={boardCounts.needsMe}
                  onFilterChange={setBoardFilter}
                  onQueryChange={setBoardQuery}
                  projections={filteredProjections}
                  query={boardQuery}
                  selectedUnitId={selectedUnitId}
                  sourceMode={sourceMode}
                  totalCount={projections.length}
                  onOpenUnit={openUnit}
                />
              ) : null}
              {activeView === 'activity' ? (
                <ActivitySurface
                  activity={activity}
                  onOpenActivity={onOpenActivity}
                  onOpenUnit={openUnit}
                  sourceMode={sourceMode}
                />
              ) : null}
              {activeView === 'more' ? (
                <MoreSurface
                  onHostNavigate={onHostNavigate}
                  onOpenNeedsMe={openNeedsMe}
                />
              ) : null}
            </div>
            {activeView === 'turnboard' && selectedUnit && selectedProjection ? (
              <UnitDetail
                activity={activity}
                headingRef={detailHeadingRef}
                onOpenActivity={onOpenActivity}
                panel={detailPanel}
                projection={selectedProjection}
                sourceMode={sourceMode}
                unit={selectedUnit}
                onClose={closeUnit}
                onOpenAssignment={(trade, trigger) =>
                  openAssignment(selectedUnit.id, trade, undefined, trigger)}
                onOpenPersonalUnit={onOpenPersonalUnit}
                onOpenSection={(trade, section, trigger) =>
                  openSection(selectedUnit.id, trade, section, trigger)}
                onOpenUnitFromHistory={openUnit}
                onPanelChange={setDetailPanel}
              />
            ) : (
              <aside className="w1r-detail-empty" aria-label="Selected Unit">
                <ListChecks size={27} aria-hidden="true" />
                <strong>Select a Unit</strong>
                <span>Paint, Clean, blockers, notes, and history open here.</span>
              </aside>
            )}
          </MainRegion>
        </div>
        {!embedded ? <AssistantBar
          message={captureStatus}
          onOpenPlus={(trigger) => {
            openBoardSheet({ kind: 'plus' }, trigger);
          }}
          onRequestVoice={(trigger) => queueCapture({
            kind: 'voice',
            origin: 'assistant',
            returnFocus: selectedUnit
              ? { triggerId: trigger.id, unitId: selectedUnit.id }
              : { triggerId: trigger.id },
            ...(detailPanel === 'paint' || detailPanel === 'clean'
              ? { trade: detailPanel }
              : {}),
            ...(selectedUnit
              ? { unitId: selectedUnit.id, unitNumber: selectedUnit.unitNumber }
              : {}),
          })}
          onSubmit={(sourceText) => {
            if (!onAssistantSubmit) return false;
            onAssistantSubmit({
              origin: 'assistant',
              returnFocus: selectedUnit
                ? { triggerId: 'w1r-assistant-input', unitId: selectedUnit.id }
                : { triggerId: 'w1r-assistant-input' },
              sourceText,
              ...(detailPanel === 'paint' || detailPanel === 'clean'
                ? { trade: detailPanel }
                : {}),
              ...(selectedUnit
                ? { unitId: selectedUnit.id, unitNumber: selectedUnit.unitNumber }
                : {}),
            });
            return true;
          }}
        /> : null}
      </div>

      <NeedsMeSheet
        open={openSheet?.kind === 'needs-me'}
        projections={projections}
        sourceMode={sourceMode}
        onDismiss={closeSheet}
        onOpenUnit={openUnit}
      />
      {sectionSheet ? (
        <SectionActionSheet
          key={`${sectionSheet.record.id}:${openSheet?.kind}`}
          open
          record={sectionSheet.record}
          sourceMode={sourceMode}
          sourceCoverageComplete={validateJul28SourceCoverage(sectionSheet.unit).complete}
          unit={sectionSheet.unit}
          onAction={(selectedAction) => {
            const proposal = createBoardFirstActionProposal(
              sectionSheet.unit.id,
              sectionSheet.record.trade,
              sectionSheet.record.section,
              selectedAction,
            );
            const receipt = nextReceipt('action');
            appendLocalActivity(createBoardFirstActionActivityItem(
              proposal,
              sectionSheet.unit.unitNumber,
              receipt.receiptId,
              receipt.recordedAt,
            ));
            onActionProposal?.(proposal);
            if (selectedAction.captureKind) {
              queueCapture({
                kind: selectedAction.captureKind,
                origin: 'section-sheet',
                returnFocus: {
                  triggerId: sheetOriginRef.current?.id
                    ?? `w1r-section-${sectionSheet.unit.id}-${sectionSheet.record.trade}-${sectionSheet.record.section}`,
                  unitId: sectionSheet.unit.id,
                },
                unitId: sectionSheet.unit.id,
                unitNumber: sectionSheet.unit.unitNumber,
                trade: sectionSheet.record.trade,
                section: sectionSheet.record.section,
              });
            }
          }}
          onDismiss={closeSheet}
          onOpenAssignment={() => openAssignment(
            sectionSheet.unit.id,
            sectionSheet.record.trade,
            sectionSheet.record.section,
          )}
        />
      ) : null}
      {openSheet?.kind === 'assignment' && assignmentUnit ? (
        <AssignmentSheet
          key={`${assignmentUnit.id}:${openSheet.trade}:${openSheet.initialSection ?? 'all'}`}
          crewOptions={crewOptions[openSheet.trade]}
          initialSection={openSheet.initialSection}
          open
          sourceMode={sourceMode}
          trade={openSheet.trade}
          unit={assignmentUnit}
          onConfirm={(proposal) => {
            const receipt = nextReceipt('assignment');
            appendLocalActivity(createBoardFirstAssignmentActivityItem(
              proposal,
              assignmentUnit.unitNumber,
              receipt.receiptId,
              receipt.recordedAt,
            ));
            onAssignmentProposal?.(proposal);
          }}
          onDismiss={closeSheet}
        />
      ) : null}
      <PlusSheet
        open={openSheet?.kind === 'plus'}
        onDismiss={closeSheet}
        onSelect={(kind) => queueCapture({
          kind,
          origin: 'plus-sheet',
          returnFocus: selectedUnit
            ? { triggerId: 'w1r-assistant-plus', unitId: selectedUnit.id }
            : { triggerId: 'w1r-assistant-plus' },
          ...(selectedUnit
            ? { unitId: selectedUnit.id, unitNumber: selectedUnit.unitNumber }
            : {}),
        })}
      />
    </div>
  );
}
