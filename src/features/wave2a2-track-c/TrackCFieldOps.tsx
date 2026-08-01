import {
  ClipboardList,
  ListChecks,
  MapPinned,
  UsersRound,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createId as createAppId } from '../../lib/constants';
import { AssignmentView } from './AssignmentView';
import { BoardView } from './BoardView';
import { CrewView } from './CrewView';
import type {
  TrackCState,
  TrackCTrade,
  TrackCWorkTarget,
} from './model';
import {
  applyTrackCSectionAction,
  changeTrackCCrew,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  recordTrackCPersonalPdsMirror,
  type TrackCSectionAction,
} from './operations';
import { projectTrackCUnitWork } from './projections';
import {
  WalkView,
  type TrackCWalkIntegration,
} from './WalkView';
import './trackCFieldOps.css';

export type TrackCView = 'board' | 'crews' | 'assign' | 'walk';

export interface TrackCRouteState {
  readonly view: TrackCView;
  readonly unitId?: string;
  readonly crewId?: string;
  readonly walkSessionId?: string;
}

export interface TrackCFieldOpsProps {
  readonly embedded?: boolean;
  readonly idFactory?: (prefix: string) => string;
  readonly initialState: TrackCState;
  readonly initialView?: TrackCView;
  readonly onDialogOpenChange?: (open: boolean) => void;
  readonly onStateChange?: (state: TrackCState, reason: string) => void;
  readonly onCrewEditRequested?: (crewId: string) => void;
  readonly onAddCrewRequested?: () => void;
  readonly crewDirectory?: Readonly<Record<string, { phone?: string }>>;
  readonly propertyContacts?: readonly {
    id: string;
    name: string;
    role?: string;
    phone?: string;
  }[];
  readonly onCrewContactRequested?: (crewId: string) => void;
  readonly onNavigate?: (route: TrackCRouteState) => void;
  readonly onRequestUnitNote?: () => void;
  readonly now?: () => string;
  readonly routeState?: TrackCRouteState;
  readonly walkIntegration?: TrackCWalkIntegration;
}

export const TrackCFieldOps = ({
  embedded = false,
  idFactory = createAppId,
  initialState,
  initialView = 'board',
  onDialogOpenChange,
  onStateChange,
  onCrewEditRequested,
  onAddCrewRequested,
  crewDirectory,
  propertyContacts,
  onCrewContactRequested,
  onNavigate,
  onRequestUnitNote,
  now = () => new Date().toISOString(),
  routeState,
  walkIntegration,
}: TrackCFieldOpsProps) => {
  const [state, setState] = useState(initialState);
  const [localView, setLocalView] = useState<TrackCView>(initialView);
  const [localSelectedUnitId, setLocalSelectedUnitId] = useState<string>();
  const [localSelectedCrewId, setLocalSelectedCrewId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [noticeAction, setNoticeAction] = useState<{ label: string; view: TrackCView }>();
  const [mirrorTarget, setMirrorTarget] = useState<TrackCWorkTarget>();
  const [assignInitialTrade, setAssignInitialTrade] = useState<TrackCTrade>();
  const [assignInitialCrew, setAssignInitialCrew] = useState<string>();
  const shellRef = useRef<HTMLDivElement>(null);
  const mirrorDialogRef = useRef<HTMLElement>(null);
  const mirrorCancelRef = useRef<HTMLButtonElement>(null);
  const mirrorTriggerRef = useRef<HTMLElement | null>(null);
  const view = routeState?.view ?? localView;
  const selectedUnitId = routeState ? routeState.unitId : localSelectedUnitId;
  const selectedCrewId = routeState ? routeState.crewId : localSelectedCrewId;

  const createId = useCallback((prefix: string) => {
    return idFactory(prefix);
  }, [idFactory]);

  const commitState = useCallback(
    (nextState: TrackCState, reason: string) => {
      setState(nextState);
      onStateChange?.(nextState, reason);
      if (reason === 'walk-started' && nextState.activeWalk) {
        onNavigate?.({
          view: 'walk',
          walkSessionId: nextState.activeWalk.id,
        });
      }
      if (reason === 'walk-ended') {
        onNavigate?.({ view: 'walk' });
      }
    },
    [onNavigate, onStateChange],
  );

  const navigate = (nextView: TrackCView) => {
    onNavigate?.(
      nextView === 'walk' && state.activeWalk
        ? { view: 'walk', walkSessionId: state.activeWalk.id }
        : { view: nextView },
    );
    setLocalView(nextView);
    setLocalSelectedUnitId(undefined);
    setLocalSelectedCrewId(undefined);
    setNotice(undefined);
    setNoticeAction(undefined);
    setMirrorTarget(undefined);
    if (nextView !== 'assign') { setAssignInitialTrade(undefined); setAssignInitialCrew(undefined); }
  };

  const runSectionAction = (
    target: TrackCWorkTarget,
    action: TrackCSectionAction,
  ) => {
    const result = applyTrackCSectionAction(state, {
      eventId: createId(`track-c-${action}`),
      action,
      target,
      recordedAt: now(),
      recordedBy: 'Los',
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    const unitAfter = result.value.units.find((unit) => unit.id === target.unitId);
    const unitWork = projectTrackCUnitWork(result.value, target.unitId)
      .filter((work) => work.release === 'released');
    const isPassed = (work: (typeof unitWork)[number]) =>
      work.inspection === 'los-passed' || work.property === 'property-accepted';
    const allPassed = unitWork.length > 0 && unitWork.every(isPassed);
    const tradeWork = unitWork.filter((work) => work.trade === target.trade);
    const tradeComplete = tradeWork.length > 0 && tradeWork.every(isPassed);
    const isPassAction = action === 'record-los-pass' || action === 'record-reinspection-pass';
    const tradeLabel = target.trade === 'paint' ? 'Paint' : 'Clean';
    if (allPassed && isPassAction) {
      // Whole unit done — the one moment worth an action.
      setNotice(`Unit ${unitAfter?.unitNumber ?? ''} is fully passed — Ready to Walk.`);
      setNoticeAction({ label: 'Start Walk now', view: 'walk' });
    } else if (tradeComplete && isPassAction) {
      // A full trade finished — a single notice, not one per bed.
      setNotice(`Unit ${unitAfter?.unitNumber ?? ''} ${tradeLabel} fully passed.`);
      setNoticeAction(undefined);
    } else if (isPassAction) {
      // Mid-trade pass: stay quiet so the toast never gets in the way.
      setNotice('');
      setNoticeAction(undefined);
    } else {
      setNotice('Personal record saved. Paper and payroll remain unchanged.');
      setNoticeAction(undefined);
    }
    commitState(result.value, `section-${action}`);
  };

  const recordTradeComplete = (
    unitId: string,
    trade: TrackCTrade,
  ) => {
    const eligibleTargets = state.units
      .find((unit) => unit.id === unitId)
      ?.workFacts
      .filter((fact) => fact.trade === trade && fact.release === 'released')
      .map((fact) => ({
        section: fact.section,
        trade: fact.trade,
        unitId: fact.unitId,
      }))
      .filter((target) => {
        const unit = state.units.find((candidate) => candidate.id === unitId);
        const fact = unit?.workFacts.find(
          (candidate) =>
            candidate.trade === target.trade &&
            candidate.section === target.section,
        );
        if (!fact) return false;
        const targetEvents = state.events.filter(
          (event) =>
            event.target.unitId === target.unitId &&
            event.target.trade === target.trade &&
            event.target.section === target.section,
        );
        const latestExecutionEvent = [...targetEvents].reverse().find((event) =>
          event.eventType === 'assignment-confirmed' ||
          event.eventType === 'assignment-cleared' ||
          event.eventType === 'work-started' ||
          event.eventType === 'crew-reported-complete');
        return latestExecutionEvent?.eventType !== 'crew-reported-complete';
      }) ?? [];

    if (eligibleTargets.length === 0) {
      setNotice('No assigned released sections are waiting for a crew completion report.');
      return;
    }

    let nextState = state;
    for (const target of eligibleTargets) {
      const result = applyTrackCSectionAction(nextState, {
        eventId: createId(`track-c-${trade}-complete-${target.section}`),
        action: 'record-crew-complete',
        target,
        recordedAt: now(),
        recordedBy: 'Los',
      });
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      nextState = result.value;
    }
    setNotice(
      `${trade === 'paint' ? 'Paint' : 'Clean'} crew completion saved for ${
        eligibleTargets.length
      } section${eligibleTargets.length === 1 ? '' : 's'}. Los inspection remains separate.`,
    );
    commitState(nextState, `trade-${trade}-crew-complete`);
  };

  const quickAssign = (
    unitId: string,
    trade: TrackCTrade,
    crewId: string,
  ) => {
    const proposal = createTrackCBulkAssignmentProposal(state, {
      createdAt: now(),
      createdBy: 'Los',
      crewId,
      proposalId: createId('track-c-quick-assign-proposal'),
      sectionMode: 'all-released',
      sections: [],
      trade,
      unitIds: [unitId],
    });
    const result = confirmTrackCBulkAssignmentProposal(state, proposal, {
      confirmed: true,
      eventIdPrefix: createId('track-c-quick-assign'),
      recordedAt: now(),
      recordedBy: 'Los',
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    let nextState = result.value.state;
    for (const target of result.value.receipt.assignedTargets) {
      const started = applyTrackCSectionAction(nextState, {
        action: 'start-work',
        eventId: createId('track-c-quick-start'),
        recordedAt: now(),
        recordedBy: 'Los',
        target,
      });
      if (started.ok) nextState = started.value;
    }
    const crewName = state.crews.find((crew) => crew.id === crewId)?.name ?? 'Crew';
    setNotice(`${crewName} assigned — ${result.value.receipt.assignedTargets.length} section${result.value.receipt.assignedTargets.length === 1 ? '' : 's'} Working.`);
    commitState(nextState, 'bulk-assignment-confirmed');
  };

  const changeCrew = (
    unitId: string,
    trade: TrackCTrade,
    toCrewId: string,
  ) => {
    const result = changeTrackCCrew(state, {
      eventIdPrefix: createId('track-c-change-crew'),
      recordedAt: now(),
      recordedBy: 'Los',
      toCrewId,
      trade,
      unitId,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    const crewName = state.crews.find((crew) => crew.id === toCrewId)?.name ?? 'New crew';
    setNotice(`${crewName} now owns this work — history from the previous crew is kept.`);
    commitState(result.value, 'bulk-assignment-confirmed');
  };

  const requestMirror = useCallback((target: TrackCWorkTarget) => {
    mirrorTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMirrorTarget(target);
  }, []);

  const dismissMirror = useCallback(() => {
    const trigger = mirrorTriggerRef.current;
    setMirrorTarget(undefined);
    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        shellRef.current?.focus();
      }
    });
  }, []);

  useEffect(() => {
    if (mirrorTarget) mirrorCancelRef.current?.focus();
    onDialogOpenChange?.(Boolean(mirrorTarget));
    return () => onDialogOpenChange?.(false);
  }, [mirrorTarget, onDialogOpenChange]);

  useEffect(() => {
    setLocalView(initialView);
  }, [initialView]);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const handleMirrorKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissMirror();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = mirrorDialogRef.current;
    const focusable = dialog
      ? Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.hidden)
      : [];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirmMirror = () => {
    if (!mirrorTarget) return;
    const result = recordTrackCPersonalPdsMirror(state, {
      eventId: createId('track-c-personal-mirror'),
      target: mirrorTarget,
      recordedAt: now(),
      recordedBy: 'Los',
      confirmed: true,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(
      `Personal ${state.terminology.personalMirrorLabel} recorded. ${state.terminology.paperReminder}`,
    );
    dismissMirror();
    commitState(result.value, 'personal-pds-mirror-recorded');
  };
  const ContentElement = embedded ? 'section' : 'main';

  return (
    <div
      className={`track-c-shell ${embedded ? 'is-embedded' : ''}`}
      data-navigation-owner={embedded ? 'host' : 'track-c'}
      data-testid="track-c-field-ops"
      ref={shellRef}
      tabIndex={-1}
    >
      <header
        aria-hidden={mirrorTarget ? true : undefined}
        className="track-c-shell__header"
        hidden={embedded}
        inert={mirrorTarget ? true : undefined}
      >
        <div>
          <strong>Turn OS</strong>
          <span>Personal field companion</span>
        </div>
        <span>{state.propertyName}</span>
      </header>
      <ContentElement
        aria-label={embedded ? 'Field operations' : undefined}
        aria-hidden={mirrorTarget ? true : undefined}
        className="track-c-shell__main"
        inert={mirrorTarget ? true : undefined}
      >
        {view === 'board' ? (
          <BoardView
            onCloseUnit={() => {
              onNavigate?.({ view: 'board' });
              setLocalSelectedUnitId(undefined);
            }}
            onOpenUnit={(unitId) => {
              onNavigate?.({ unitId, view: 'board' });
              setLocalSelectedUnitId(unitId);
            }}
            onQuickAssign={quickAssign}
            onChangeCrew={changeCrew}
            onRequestNote={onRequestUnitNote}
            onRequestAssign={(trade) => {
              setAssignInitialTrade(trade);
              navigate('assign');
            }}
            onRequestMirror={requestMirror}
            onSectionAction={runSectionAction}
            onTradeComplete={recordTradeComplete}
            selectedUnitId={selectedUnitId}
            state={state}
          />
        ) : null}
        {view === 'crews' ? (
          <CrewView
            onCloseCrew={() => {
              onNavigate?.({ view: 'crews' });
              setLocalSelectedCrewId(undefined);
            }}
            onContactCrew={onCrewContactRequested}
            crewDirectory={crewDirectory}
            onAddCrewRequested={onAddCrewRequested}
            onAssignCrew={(crewId) => {
              const crew = state.crews.find((candidate) => candidate.id === crewId);
              if (crew) setAssignInitialTrade(crew.trade);
              setAssignInitialCrew(crewId);
              navigate('assign');
            }}
            propertyContacts={propertyContacts}
            onEditCrew={onCrewEditRequested}
            onOpenCrew={(crewId) => {
              onNavigate?.({ crewId, view: 'crews' });
              setLocalSelectedCrewId(crewId);
            }}
            selectedCrewId={selectedCrewId}
            state={state}
          />
        ) : null}
        {view === 'assign' ? (
          <AssignmentView
            createId={createId}
            initialCrewId={assignInitialCrew}
            initialTrade={assignInitialTrade}
            key={`${assignInitialTrade ?? 'any'}:${assignInitialCrew ?? 'any'}`}
            now={now}
            onBack={() => navigate('board')}
            onStateChange={commitState}
            state={state}
          />
        ) : null}
        {view === 'walk' ? (
          <WalkView
            createId={createId}
            integration={{
              ...walkIntegration,
              onReturnToBoard:
                walkIntegration?.onReturnToBoard ??
                (() => navigate('board')),
              onViewWorkNeedingInspection:
                walkIntegration?.onViewWorkNeedingInspection ??
                (() => navigate('board')),
            }}
            now={now}
            onRequestMirror={requestMirror}
            onStateChange={commitState}
            state={state}
          />
        ) : null}
      </ContentElement>
      {notice ? (
        <div
          aria-hidden={mirrorTarget ? true : undefined}
          className="track-c-notice"
          inert={mirrorTarget ? true : undefined}
          role="status"
        >
          <span>{notice}</span>
          <button
            aria-label="Dismiss notice"
            data-track-c-critical-target="true"
            onClick={() => setNotice(undefined)}
            type="button"
          >
            Dismiss
          </button>
                  {noticeAction ? (
            <button
              className="track-c-notice__action"
              data-track-c-critical-target="true"
              onClick={() => navigate(noticeAction.view)}
              type="button"
            >
              {noticeAction.label}
            </button>
          ) : null}
</div>
      ) : null}
      {mirrorTarget ? (
        <div
          className="track-c-dialog-layer"
          onKeyDown={handleMirrorKeyDown}
        >
          <section
            aria-describedby="track-c-mirror-description"
            aria-labelledby="track-c-mirror-heading"
            aria-modal="true"
            className="track-c-confirm-card track-c-shell__confirm"
            ref={mirrorDialogRef}
            role="dialog"
          >
            <h2 id="track-c-mirror-heading">Confirm personal mirror</h2>
            <p id="track-c-mirror-description">
              Property acceptance is recorded. This adds a personal timestamp only
              and reminds you to update paper.
            </p>
            <div className="track-c-action-row">
              <button
                data-track-c-critical-target="true"
                onClick={dismissMirror}
                ref={mirrorCancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className="is-positive"
                data-track-c-critical-target="true"
                onClick={confirmMirror}
                type="button"
              >
                Confirm personal mirror
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {embedded ? null : (
        <nav
          aria-hidden={mirrorTarget ? true : undefined}
          aria-label="Track C field operations"
          className="track-c-nav"
          inert={mirrorTarget ? true : undefined}
        >
          {[
            { view: 'board' as const, label: 'TurnBoard', Icon: ClipboardList },
            { view: 'crews' as const, label: 'Crews', Icon: UsersRound },
            { view: 'assign' as const, label: 'Assign', Icon: ListChecks },
            { view: 'walk' as const, label: 'Walk', Icon: MapPinned },
          ].map(({ view: nextView, label, Icon }) => (
            <button
              aria-current={view === nextView ? 'page' : undefined}
              data-track-c-critical-target="true"
              key={nextView}
              onClick={() => navigate(nextView)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};
