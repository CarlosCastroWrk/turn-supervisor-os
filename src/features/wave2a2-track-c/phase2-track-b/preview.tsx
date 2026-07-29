import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssignmentView } from '../AssignmentView';
import { CrewView } from '../CrewView';
import { createSyntheticTrackCState } from '../fixtures';
import type { TrackCState } from '../model';
import '../preview.css';
import '../trackCFieldOps.css';
import './phase2TrackB.css';
import type { Phase2AdditionalScopeRecord } from './contracts';

declare global {
  interface Window {
    __phase2TrackBPreview?: {
      reasons: string[];
      latestEventCount: number;
      additionalScopeRecords: Phase2AdditionalScopeRecord[];
      assignCrewRequests: string[];
      crewEditRequests: string[];
      crewContactRequests: string[];
      changeOrderRequests: string[];
    };
  }
}

window.__phase2TrackBPreview = {
  reasons: [],
  latestEventCount: 0,
  additionalScopeRecords: [],
  assignCrewRequests: [],
  crewEditRequests: [],
  crewContactRequests: [],
  changeOrderRequests: [],
};

export const Phase2TrackBPreview = () => {
  const [state, setState] = useState<TrackCState>(() =>
    createSyntheticTrackCState(),
  );
  const [view, setView] = useState<'assign' | 'crews'>('assign');
  const [selectedCrewId, setSelectedCrewId] = useState<string>();
  const [initialAssignmentCrewId, setInitialAssignmentCrewId] =
    useState<string>();
  const [additionalScopes, setAdditionalScopes] = useState<
    readonly Phase2AdditionalScopeRecord[]
  >([]);
  const idSequence = useRef(0);
  const createId = (prefix: string) => {
    idSequence.current += 1;
    return `${prefix}-${idSequence.current}`;
  };

  return (
    <div className="track-c-shell is-embedded phase2-track-b-preview">
      <nav
        aria-label="Phase 2 Track B preview"
        className="phase2-track-b-preview__nav"
      >
        <button
          aria-current={view === 'assign' ? 'page' : undefined}
          data-track-c-critical-target="true"
          onClick={() => setView('assign')}
          type="button"
        >
          Assign
        </button>
        <button
          aria-current={view === 'crews' ? 'page' : undefined}
          data-track-c-critical-target="true"
          onClick={() => setView('crews')}
          type="button"
        >
          Crews
        </button>
      </nav>
      <main className="track-c-shell__main">
        {view === 'assign' ? (
          <AssignmentView
            additionalScopes={additionalScopes}
            createId={createId}
            initialCrewId={initialAssignmentCrewId}
            now={() => '2026-07-29T16:00:00.000Z'}
            onAdditionalScopeCreate={(record) => {
              setAdditionalScopes((current) => [...current, record]);
              window.__phase2TrackBPreview?.additionalScopeRecords.push(record);
            }}
            onOpenChangeOrder={(record) =>
              window.__phase2TrackBPreview?.changeOrderRequests.push(record.id)}
            onStateChange={(nextState, reason) => {
              setState(nextState);
              if (!window.__phase2TrackBPreview) return;
              window.__phase2TrackBPreview.reasons.push(reason);
              window.__phase2TrackBPreview.latestEventCount =
                nextState.events.length;
            }}
            state={state}
          />
        ) : (
          <CrewView
            onAssignCrew={(crewId) => {
              window.__phase2TrackBPreview?.assignCrewRequests.push(crewId);
              setInitialAssignmentCrewId(crewId);
              setSelectedCrewId(undefined);
              setView('assign');
            }}
            onCloseCrew={() => setSelectedCrewId(undefined)}
            onContactCrew={(crewId) =>
              window.__phase2TrackBPreview?.crewContactRequests.push(crewId)}
            onEditCrew={(crewId) =>
              window.__phase2TrackBPreview?.crewEditRequests.push(crewId)}
            onOpenCrew={setSelectedCrewId}
            selectedCrewId={selectedCrewId}
            state={state}
          />
        )}
      </main>
    </div>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Phase2TrackBPreview />
  </StrictMode>,
);
