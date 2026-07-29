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
  TrackCWalkOutcome,
  TrackCWorkTarget,
} from './model';
import {
  applyTrackCSectionAction,
  recordTrackCPersonalPdsMirror,
  type TrackCSectionAction,
} from './operations';
import { WalkView } from './WalkView';
import './trackCFieldOps.css';

export type TrackCView = 'board' | 'crews' | 'assign' | 'walk';

export interface TrackCFieldOpsProps {
  readonly embedded?: boolean;
  readonly idFactory?: (prefix: string) => string;
  readonly initialState: TrackCState;
  readonly initialView?: TrackCView;
  readonly onDialogOpenChange?: (open: boolean) => void;
  readonly onStateChange?: (state: TrackCState, reason: string) => void;
  readonly onCrewEditRequested?: (crewId: string) => void;
  readonly onCrewContactRequested?: (crewId: string) => void;
  readonly now?: () => string;
}

export const TrackCFieldOps = ({
  embedded = false,
  idFactory = createAppId,
  initialState,
  initialView = 'board',
  onDialogOpenChange,
  onStateChange,
  onCrewEditRequested,
  onCrewContactRequested,
  now = () => new Date().toISOString(),
}: TrackCFieldOpsProps) => {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<TrackCView>(initialView);
  const [selectedUnitId, setSelectedUnitId] = useState<string>();
  const [selectedCrewId, setSelectedCrewId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [mirrorTarget, setMirrorTarget] = useState<TrackCWorkTarget>();
  const [walkOutcomes, setWalkOutcomes] = useState<
    Readonly<Record<string, TrackCWalkOutcome>>
  >({});
  const shellRef = useRef<HTMLDivElement>(null);
  const mirrorDialogRef = useRef<HTMLElement>(null);
  const mirrorCancelRef = useRef<HTMLButtonElement>(null);
  const mirrorTriggerRef = useRef<HTMLElement | null>(null);

  const createId = useCallback((prefix: string) => {
    return idFactory(prefix);
  }, [idFactory]);

  const commitState = useCallback(
    (nextState: TrackCState, reason: string) => {
      setState(nextState);
      onStateChange?.(nextState, reason);
    },
    [onStateChange],
  );

  const navigate = (nextView: TrackCView) => {
    setView(nextView);
    setSelectedUnitId(undefined);
    setSelectedCrewId(undefined);
    setNotice(undefined);
    setMirrorTarget(undefined);
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
    setNotice('Personal section record saved. Paper and payroll remain unchanged.');
    commitState(result.value, `section-${action}`);
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
    setView(initialView);
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
            onCloseUnit={() => setSelectedUnitId(undefined)}
            onOpenUnit={setSelectedUnitId}
            onRequestMirror={requestMirror}
            onSectionAction={runSectionAction}
            selectedUnitId={selectedUnitId}
            state={state}
          />
        ) : null}
        {view === 'crews' ? (
          <CrewView
            onCloseCrew={() => setSelectedCrewId(undefined)}
            onContactCrew={onCrewContactRequested}
            onEditCrew={onCrewEditRequested}
            onOpenCrew={setSelectedCrewId}
            selectedCrewId={selectedCrewId}
            state={state}
          />
        ) : null}
        {view === 'assign' ? (
          <AssignmentView
            createId={createId}
            now={now}
            onStateChange={commitState}
            state={state}
          />
        ) : null}
        {view === 'walk' ? (
          <WalkView
            createId={createId}
            now={now}
            onOutcomesChange={setWalkOutcomes}
            onRequestMirror={requestMirror}
            onStateChange={commitState}
            outcomes={walkOutcomes}
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
    </div>
  );
};
