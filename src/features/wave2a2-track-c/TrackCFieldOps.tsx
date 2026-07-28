import {
  ClipboardList,
  ListChecks,
  MapPinned,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  readonly initialState: TrackCState;
  readonly initialView?: TrackCView;
  readonly onStateChange?: (state: TrackCState, reason: string) => void;
  readonly onCrewEditRequested?: (crewId: string) => void;
  readonly onCrewContactRequested?: (crewId: string) => void;
  readonly now?: () => string;
}

export const TrackCFieldOps = ({
  initialState,
  initialView = 'board',
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
  const sequenceRef = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const mirrorCancelRef = useRef<HTMLButtonElement>(null);
  const mirrorTriggerRef = useRef<HTMLElement | null>(null);

  const createId = useCallback((prefix: string) => {
    sequenceRef.current += 1;
    return `${prefix}-${sequenceRef.current}`;
  }, []);

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
  }, [mirrorTarget]);

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

  return (
    <div
      className="track-c-shell"
      data-testid="track-c-field-ops"
      ref={shellRef}
      tabIndex={-1}
    >
      <header className="track-c-shell__header">
        <div>
          <strong>Turn OS</strong>
          <span>Personal field companion</span>
        </div>
        <span>{state.propertyName}</span>
      </header>
      <main className="track-c-shell__main">
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
      </main>
      {notice ? (
        <div className="track-c-notice" role="status">
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
          onKeyDown={(event) => {
            if (event.key === 'Escape') dismissMirror();
          }}
        >
          <section
            aria-describedby="track-c-mirror-description"
            aria-label="Confirm personal paper mirror"
            aria-modal="true"
            className="track-c-confirm-card track-c-shell__confirm"
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
      <nav aria-label="Track C field operations" className="track-c-nav">
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
