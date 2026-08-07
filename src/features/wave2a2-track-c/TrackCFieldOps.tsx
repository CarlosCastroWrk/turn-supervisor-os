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
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { appendContactLog } from '../../lib/contactLog';
import type { PhotoNote } from '../../types';
import { AssignmentView } from './AssignmentView';
import { BoardView, type UnitNoteKind } from './BoardView';
import { CrewView } from './CrewView';
import type {
  TrackCSection,
  TrackCState,
  TrackCTrade,
  TrackCWorkTarget,
} from './model';
import { trackCSectionLabel } from './model';
import {
  crewCallbackTextBody,
  crewMessageHref,
  crewUnitsTextBody,
  readWhatsappCrews,
  writeCrewTextLang,
  type CrewCallbackRow,
  type CrewTextLang,
  type CrewTextSection,
} from './crewTextTemplates';
import {
  applyTrackCSectionAction,
  changeTrackCCrew,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  recordTrackCDirectPropertyAcceptance,
  recordTrackCPersonalPdsMirror,
  type TrackCSectionAction,
} from './operations';
import { projectTrackCUnitWork, projectTrackCWork } from './projections';
import {
  WalkView,
  type TrackCWalkIntegration,
} from './WalkView';
import './trackCFieldOps.css';

export type TrackCView = 'board' | 'crews' | 'assign' | 'walk';

export interface TrackCRouteState {
  readonly view: TrackCView;
  readonly unitId?: string;
  readonly unitTrade?: TrackCTrade;
  readonly crewId?: string;
  readonly walkSessionId?: string;
}

export interface TrackCFieldOpsProps {
  readonly embedded?: boolean;
  readonly idFactory?: (prefix: string) => string;
  readonly initialState: TrackCState;
  readonly initialView?: TrackCView;
  readonly onDialogOpenChange?: (open: boolean) => void;
  readonly onStateChange?: (state: TrackCState, reason: string) => boolean | void;
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
  readonly onToggleCrewActive?: (crewId: string, active: boolean) => void;
  readonly onSetUnitBeds?: (unitId: string, beds: number) => void;
  readonly onMoveUnitTrade?: (sourceUnitId: string, trade: TrackCTrade, targetUnitNumber: string) => void;
  readonly onNavigate?: (route: TrackCRouteState) => void;
  readonly onRequestUnitNote?: () => void;
  readonly onAddUnitNote?: (unitId: string, kind: UnitNoteKind, text: string) => boolean;
  readonly onEditUnitNote?: (noteId: string, text: string) => boolean;
  readonly onDeleteUnitNote?: (noteId: string) => boolean;
  readonly now?: () => string;
  readonly routeState?: TrackCRouteState;
  readonly walkIntegration?: TrackCWalkIntegration;
  readonly unitNotes?: readonly { id: string; unitId: string; kind?: UnitNoteKind; text: string; createdAt: string }[];
  readonly unitPhotos?: readonly PhotoNote[];
  readonly onCommitUnitPhoto?: (photo: PhotoNote) => boolean | Promise<boolean>;
  readonly onUnblockUnit?: (unitId: string, trade: TrackCTrade) => void;
  readonly onRequestBlock?: (unitId: string, trade: TrackCTrade) => void;
  readonly onSetSectionWorkType?: (
    target: TrackCWorkTarget,
    workType: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean',
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
  onToggleCrewActive,
  onSetUnitBeds,
  onMoveUnitTrade,
  onNavigate,
  onRequestUnitNote,
  onAddUnitNote,
  onEditUnitNote,
  onDeleteUnitNote,
  now = () => new Date().toISOString(),
  routeState,
  walkIntegration,
  unitNotes,
  unitPhotos,
  onCommitUnitPhoto,
  onUnblockUnit,
  onRequestBlock,
  onSetSectionRelease,
  onSetSectionWorkType,
  onSetTradeRelease,
}: TrackCFieldOpsProps) => {
  const [state, setState] = useState(initialState);
  const [localView, setLocalView] = useState<TrackCView>(initialView);
  const [localSelectedUnitId, setLocalSelectedUnitId] = useState<string>();
  const [localSelectedCrewId, setLocalSelectedCrewId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [noticeAction, setNoticeAction] = useState<{ label: string; view: TrackCView }>();
  // "Text them what I just assigned" — assignments pile up per crew until Los
  // sends the text or dismisses; device-local, never in the ledger.
  const [textPrompts, setTextPrompts] = useState<Record<string, TrackCWorkTarget[]>>({});
  const queueTextPrompt = (crewId: string, targets: readonly TrackCWorkTarget[]) => {
    if (targets.length === 0) return;
    setTextPrompts((current) => {
      const seen = new Set(
        (current[crewId] ?? []).map((target) => `${target.unitId}:${target.trade}:${target.section}`),
      );
      const merged = [
        ...(current[crewId] ?? []),
        ...targets.filter((target) => !seen.has(`${target.unitId}:${target.trade}:${target.section}`)),
      ];
      return { ...current, [crewId]: merged };
    });
  };
  // Callback texts: when Los opens a callback on a room, the crew that DID that
  // room gets queued a "come back and fix it" text with the reason per room.
  const [callbackPrompts, setCallbackPrompts] = useState<
    Record<string, { unitId: string; unitNumber: string; section: TrackCSection; reason: string }[]>
  >({});
  const queueCallbackPrompt = (
    crewId: string,
    entry: { unitId: string; unitNumber: string; section: TrackCSection; reason: string },
  ) => {
    setCallbackPrompts((current) => {
      const list = current[crewId] ?? [];
      if (list.some((existing) => existing.unitId === entry.unitId && existing.section === entry.section)) {
        return { ...current, [crewId]: list.map((existing) =>
          existing.unitId === entry.unitId && existing.section === entry.section ? entry : existing) };
      }
      return { ...current, [crewId]: [...list, entry] };
    });
  };
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
      // If the host can't SAVE this change, don't show it — otherwise the unit
      // page shows an assignment the board never got (Los's "assigned but says
      // needs crew"). The host raises a loud, sticky warning explaining why.
      const persisted = onStateChange ? onStateChange(nextState, reason) : true;
      if (persisted === false) {
        setNotice('That didn’t save — check the warning at the top. Nothing was recorded.');
        return;
      }
      setState(nextState);
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
    } else if (action === 'open-callback') {
      // Rapid-fire checking must stay silent — the row's state IS the feedback.
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

  const pdsApprove = (unitId: string, trade: TrackCTrade) => {
    const result = recordTrackCDirectPropertyAcceptance(state, {
      idFactory: createId,
      recordedAt: now(),
      recordedBy: 'Los',
      trade,
      unitId,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(
      `${trade === 'paint' ? 'Paint' : 'Clean'} PDS approved for this unit — it counts as walked and accepted.`,
    );
    commitState(result.value, `pds-approved-${trade}`);
  };

  // Open a callback on ONE room — the room that failed Los's walk. Only that
  // room goes back into callback (and the unit drops out of ready-to-walk),
  // so Los knows exactly which room to send the crew back to.
  const openSectionCallback = (
    unitId: string,
    trade: TrackCTrade,
    section: TrackCSection,
    reason?: string,
  ) => {
    const target = { unitId, trade, section };
    const work = projectTrackCWork(state, target);
    if (!work || work.release !== 'released'
      || !(work.execution === 'crew-reported-complete' || work.inspection === 'los-passed'
        || work.property === 'property-accepted')) {
      setNotice('That room has no completed work to call back yet.');
      return;
    }
    const trimmedReason = reason?.trim();
    const result = applyTrackCSectionAction(state, {
      action: 'open-callback',
      eventId: createId('track-c-callback'),
      note: trimmedReason
        ? `Callback: ${trimmedReason}`
        : undefined,
      recordedAt: now(),
      recordedBy: 'Los',
      target,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    // Text the crew that DID this room to come back — with the reason.
    const crewId = work.responsibleCrewId;
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (crewId && unit) {
      queueCallbackPrompt(crewId, {
        reason: trimmedReason ?? '',
        section,
        unitId,
        unitNumber: unit.unitNumber,
      });
    }
    setNotice(
      `Callback on ${section === 'common' ? 'Common' : section} — ${crewId ? 'text the crew below to come back.' : 'the crew fixes that room, then it walks again.'}`,
    );
    commitState(result.value, 'section-callback');
  };

  // Open a callback on work Los already passed OR the property already
  // accepted — the crew has to come back and fix it. Opening a callback undoes
  // the acceptance (property found a problem), which is exactly the field truth.
  const openTradeCallback = (unitId: string, trade: TrackCTrade) => {
    const targets = projectTrackCUnitWork(state, unitId)
      .filter((work) => work.trade === trade
        && work.release === 'released'
        && (work.execution === 'crew-reported-complete' || work.inspection === 'los-passed'))
      .map((work) => ({ section: work.section, trade: work.trade, unitId: work.unitId }));
    if (targets.length === 0) {
      setNotice('No completed work to call back on this trade yet.');
      return;
    }
    let nextState = state;
    for (const target of targets) {
      const result = applyTrackCSectionAction(nextState, {
        action: 'open-callback',
        eventId: createId('track-c-callback'),
        recordedAt: now(),
        recordedBy: 'Los',
        target,
      });
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      nextState = result.value;
    }
    setNotice(
      `${trade === 'paint' ? 'Paint' : 'Clean'} callback opened — the crew fixes it, then it walks again.`,
    );
    commitState(nextState, 'trade-callback');
  };

  // Callback fixed and it looks good — clear the whole trade's open callback in
  // one tap (correction ready -> reinspection pass), landing it back at Los
  // passed / ready to walk. Needed for clean (no per-room rows), handy for paint.
  const resolveTradeCallback = (unitId: string, trade: TrackCTrade) => {
    const targets = projectTrackCUnitWork(state, unitId)
      .filter((work) => work.trade === trade && work.callbackOpen)
      .map((work) => ({ section: work.section, trade: work.trade, unitId: work.unitId }));
    if (targets.length === 0) {
      setNotice('No open callback on this trade.');
      return;
    }
    let nextState = state;
    // A section under callback can be at "callback open" (needs correction
    // reported) OR "reinspection pending" (needs the pass) — both keep
    // callbackOpen true. Advance whatever step it's on until it clears, so one
    // tap always lands it back at Los passed / ready to walk.
    //
    // CRITICAL: the two steps (correction reported -> reinspection passed) must
    // stay in causal order when the ledger is re-sorted. Event sort breaks
    // timestamp ties with the random event id, so if both steps share a
    // millisecond the replay can put "resolved" before "correction reported"
    // and the callback reads OPEN again after it syncs back. Stamp each step
    // with a strictly increasing time so their order can never be scrambled.
    let stepMs = new Date(now()).getTime();
    for (const target of targets) {
      for (let guard = 0; guard < 3; guard += 1) {
        const projected = projectTrackCWork(nextState, target);
        if (!projected || !projected.callbackOpen) break;
        const action = projected.inspection === 'reinspection-pending'
          ? 'record-reinspection-pass'
          : 'record-correction-ready';
        const result = applyTrackCSectionAction(nextState, {
          action,
          eventId: createId('track-c-cb-resolve'),
          recordedAt: new Date(stepMs).toISOString(),
          recordedBy: 'Los',
          target,
        });
        if (!result.ok) {
          setNotice(result.error.message);
          return;
        }
        nextState = result.value;
        stepMs += 1;
      }
    }
    setNotice(
      `${trade === 'paint' ? 'Paint' : 'Clean'} callback cleared — ready to walk with the property.`,
    );
    commitState(nextState, 'trade-callback-resolved');
  };

  // Clear the callback on ONE room — when several rooms are in callback Los
  // fixes and clears them one at a time as the crew finishes each, instead of
  // clearing all of them at once.
  const resolveSectionCallback = (unitId: string, trade: TrackCTrade, section: TrackCSection) => {
    const target = { unitId, trade, section };
    let nextState = state;
    let stepMs = new Date(now()).getTime();
    for (let guard = 0; guard < 3; guard += 1) {
      const projected = projectTrackCWork(nextState, target);
      if (!projected || !projected.callbackOpen) break;
      const action = projected.inspection === 'reinspection-pending'
        ? 'record-reinspection-pass'
        : 'record-correction-ready';
      const result = applyTrackCSectionAction(nextState, {
        action,
        eventId: createId('track-c-cb-resolve'),
        recordedAt: new Date(stepMs).toISOString(),
        recordedBy: 'Los',
        target,
      });
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      nextState = result.value;
      stepMs += 1;
    }
    setNotice(`${section === 'common' ? 'Common' : section} cleared — back to ready to walk.`);
    commitState(nextState, 'section-callback-resolved');
  };

  // Record Los's inspection pass on a whole trade from the unit page — needed
  // for clean (whole-unit, no per-room rows), handy for paint. Only sections
  // the crew has reported complete move to passed.
  const recordTradeLosPass = (unitId: string, trade: TrackCTrade) => {
    const targets = projectTrackCUnitWork(state, unitId)
      .filter((work) => work.trade === trade
        && work.release === 'released'
        && work.inspection === 'needs-los-inspection')
      .map((work) => ({ section: work.section, trade: work.trade, unitId: work.unitId }));
    if (targets.length === 0) {
      setNotice('Nothing waiting for your inspection on this trade yet.');
      return;
    }
    let nextState = state;
    for (const target of targets) {
      const result = applyTrackCSectionAction(nextState, {
        action: 'record-los-pass',
        eventId: createId('track-c-los-pass'),
        recordedAt: now(),
        recordedBy: 'Los',
        target,
      });
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      nextState = result.value;
    }
    setNotice(
      `${trade === 'paint' ? 'Paint' : 'Clean'} passed your inspection — ready to walk with the property.`,
    );
    commitState(nextState, 'trade-los-pass');
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
    queueTextPrompt(crewId, result.value.receipt.assignedTargets);
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
    queueTextPrompt(
      toCrewId,
      projectTrackCUnitWork(result.value, unitId)
        .filter((work) => work.trade === trade && work.activeCrewIds.includes(toCrewId))
        .map((work) => ({ section: work.section, trade: work.trade, unitId: work.unitId })),
    );
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
            focusTradeHint={routeState?.unitTrade}
            onCloseUnit={() => {
              onNavigate?.({ view: 'board' });
              setLocalSelectedUnitId(undefined);
            }}
            onOpenUnit={(unitId, trade) => {
              onNavigate?.({ unitId, unitTrade: trade, view: 'board' });
              setLocalSelectedUnitId(unitId);
            }}
            onQuickAssign={quickAssign}
            onChangeCrew={changeCrew}
            onRequestNote={onRequestUnitNote}
            onAddNote={onAddUnitNote}
            onEditNote={onEditUnitNote}
            onDeleteNote={onDeleteUnitNote}
            onRequestAssign={(trade) => {
              setAssignInitialTrade(trade);
              navigate('assign');
            }}
            onRequestMirror={requestMirror}
            onSectionAction={runSectionAction}
            onTradeComplete={recordTradeComplete}
            selectedUnitId={selectedUnitId}
            state={state}
            unitNotes={unitNotes}
            unitPhotos={unitPhotos}
            onCommitUnitPhoto={onCommitUnitPhoto}
            onPdsApprove={pdsApprove}
            onOpenCallback={openTradeCallback}
            onOpenSectionCallback={openSectionCallback}
            onTradePass={recordTradeLosPass}
            onResolveCallback={resolveTradeCallback}
            onResolveSectionCallback={resolveSectionCallback}
            onUnblockUnit={onUnblockUnit}
            onRequestBlock={onRequestBlock}
            onSetSectionRelease={onSetSectionRelease}
            onSetSectionWorkType={onSetSectionWorkType}
            onSetUnitBeds={onSetUnitBeds}
            onMoveUnitTrade={onMoveUnitTrade}
            onSetTradeRelease={onSetTradeRelease}
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
            onQuickAssign={quickAssign}
            onOpenUnit={(unitId, trade) => {
              onNavigate?.({ unitId, unitTrade: trade, view: 'board' });
              setLocalSelectedUnitId(unitId);
            }}
            onToggleCrewActive={onToggleCrewActive}
            selectedCrewId={selectedCrewId}
            state={state}
          />
        ) : null}
        {view === 'assign' ? (
          <AssignmentView
            createId={createId}
            initialCrewId={assignInitialCrew}
            onAssigned={queueTextPrompt}
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
      {Object.entries(textPrompts)
        .filter(([, targets]) => targets.length > 0)
        .map(([crewId, targets]) => {
          const crew = state.crews.find((candidate) => candidate.id === crewId);
          if (!crew) return null;
          const phone = crewDirectory?.[crewId]?.phone?.trim();
          const byUnit = new Map<string, CrewTextSection[]>();
          for (const target of targets) {
            const unit = state.units.find((candidate) => candidate.id === target.unitId);
            if (!unit) continue;
            const fact = unit.workFacts.find(
              (candidate) => candidate.trade === target.trade && candidate.section === target.section,
            );
            const sections = byUnit.get(unit.unitNumber) ?? [];
            sections.push(
              target.section === 'common'
                ? { kind: 'common', workType: fact?.workType }
                : { bed: trackCSectionLabel(target.section), kind: 'bed', workType: fact?.workType },
            );
            byUnit.set(unit.unitNumber, sections);
          }
          const rows = [...byUnit.entries()].map(([unitNumber, sections]) => ({
            sections,
            unitNumber,
          }));
          const unitNumbers = rows
            .map((row) => row.unitNumber)
            .sort(compareUnitTopFloorFirst);
          const bodyFor = (lang: CrewTextLang) => crewUnitsTextBody(crew.name, lang, rows);
          const dismiss = () => setTextPrompts((current) => {
            const next = { ...current };
            delete next[crewId];
            return next;
          });
          return (
            <div className="track-c-text-prompt" key={crewId} role="status">
              <span>
                <strong>{unitNumbers.join(', ')}</strong> → {crew.name}
              </span>
              {phone ? (
                (['es', 'en'] as const).map((lang) => {
                  const whatsapp = readWhatsappCrews().has(crewId);
                  return (
                    <a
                      data-track-c-critical-target="true"
                      href={crewMessageHref(phone, whatsapp, bodyFor(lang))}
                      key={lang}
                      onClick={() => {
                        writeCrewTextLang(lang);
                        appendContactLog({ crewId, kind: 'text', name: crew.name });
                        dismiss();
                      }}
                      rel="noreferrer"
                      target={whatsapp ? '_blank' : undefined}
                    >
                      {lang === 'es' ? 'Español' : 'English'}
                      {whatsapp ? ' · WhatsApp' : ''}
                    </a>
                  );
                })
              ) : onCrewContactRequested ? (
                <button
                  data-track-c-critical-target="true"
                  onClick={() => onCrewContactRequested(crewId)}
                  type="button"
                >
                  Add number
                </button>
              ) : null}
              <button
                aria-label={`Dismiss text reminder for ${crew.name}`}
                onClick={dismiss}
                type="button"
              >
                Not now
              </button>
            </div>
          );
        })}
      {Object.entries(callbackPrompts)
        .filter(([, entries]) => entries.length > 0)
        .map(([crewId, entries]) => {
          const crew = state.crews.find((candidate) => candidate.id === crewId);
          if (!crew) return null;
          const phone = crewDirectory?.[crewId]?.phone?.trim();
          const byUnit = new Map<string, { unitNumber: string; sections: { label: string; reason?: string }[] }>();
          for (const entry of entries) {
            const row = byUnit.get(entry.unitNumber)
              ?? { sections: [], unitNumber: entry.unitNumber };
            row.sections.push({
              label: entry.section === 'common' ? 'common' : entry.section,
              reason: entry.reason || undefined,
            });
            byUnit.set(entry.unitNumber, row);
          }
          const rows: CrewCallbackRow[] = [...byUnit.values()];
          const unitNumbers = rows.map((row) => row.unitNumber).sort(compareUnitTopFloorFirst);
          const bodyFor = (lang: CrewTextLang) => crewCallbackTextBody(crew.name, lang, rows);
          const dismiss = () => setCallbackPrompts((current) => {
            const next = { ...current };
            delete next[crewId];
            return next;
          });
          return (
            <div className="track-c-text-prompt track-c-text-prompt--callback" key={crewId} role="status">
              <span>
                <strong>↩ Callback · {unitNumbers.join(', ')}</strong> → {crew.name}
              </span>
              {phone ? (
                (['es', 'en'] as const).map((lang) => {
                  const whatsapp = readWhatsappCrews().has(crewId);
                  return (
                    <a
                      data-track-c-critical-target="true"
                      href={crewMessageHref(phone, whatsapp, bodyFor(lang))}
                      key={lang}
                      onClick={() => {
                        writeCrewTextLang(lang);
                        appendContactLog({ crewId, kind: 'text', name: crew.name });
                        dismiss();
                      }}
                      rel="noreferrer"
                      target={whatsapp ? '_blank' : undefined}
                    >
                      {lang === 'es' ? 'Español' : 'English'}
                      {whatsapp ? ' · WhatsApp' : ''}
                    </a>
                  );
                })
              ) : onCrewContactRequested ? (
                <button
                  data-track-c-critical-target="true"
                  onClick={() => onCrewContactRequested(crewId)}
                  type="button"
                >
                  Add number
                </button>
              ) : null}
              <button
                aria-label={`Dismiss callback text for ${crew.name}`}
                onClick={dismiss}
                type="button"
              >
                Not now
              </button>
            </div>
          );
        })}
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
