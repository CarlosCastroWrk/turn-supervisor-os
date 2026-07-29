import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssignmentView } from '../AssignmentView';
import { CrewView } from '../CrewView';
import { createSyntheticTrackCState } from '../fixtures';
import type { TrackCState } from '../model';
import { TrackCFieldOps } from '../TrackCFieldOps';
import '../preview.css';
import '../trackCFieldOps.css';
import './phase2TrackB.css';
import type { Phase2AdditionalScopeRecord } from './contracts';

const ADDITIONAL_SCOPE_STORAGE_KEY =
  'turn-os:synthetic-phase2-track-b:additional-scopes';

const readAdditionalScopes = (): Phase2AdditionalScopeRecord[] => {
  try {
    const value = window.localStorage.getItem(ADDITIONAL_SCOPE_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

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
      additionalScopeCommitAttempts: number;
      failNextAdditionalScopeCommit: boolean;
    };
  }
}

window.__phase2TrackBPreview = {
  reasons: [],
  latestEventCount: 0,
  additionalScopeRecords: readAdditionalScopes(),
  assignCrewRequests: [],
  crewEditRequests: [],
  crewContactRequests: [],
  changeOrderRequests: [],
  additionalScopeCommitAttempts: 0,
  failNextAdditionalScopeCommit: false,
};

export const Phase2TrackBPreview = () => {
  const [state, setState] = useState<TrackCState>(() =>
    createSyntheticTrackCState(),
  );
  const [view, setView] = useState<'assign' | 'crews' | 'field'>('assign');
  const [selectedCrewId, setSelectedCrewId] = useState<string>();
  const [initialAssignmentCrewId, setInitialAssignmentCrewId] =
    useState<string>();
  const [additionalScopes, setAdditionalScopes] = useState<
    readonly Phase2AdditionalScopeRecord[]
  >(() => readAdditionalScopes());
  const additionalScopeCommitEnabled =
    new URLSearchParams(window.location.search).get('scopeStorage') !==
    'unavailable';
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
        <button
          aria-current={view === 'field' ? 'page' : undefined}
          data-track-c-critical-target="true"
          onClick={() => setView('field')}
          type="button"
        >
          Field
        </button>
      </nav>
      <main className="track-c-shell__main">
        {view === 'assign' ? (
          <AssignmentView
            additionalScopes={additionalScopes}
            createId={createId}
            initialCrewId={initialAssignmentCrewId}
            now={() => '2026-07-29T16:00:00.000Z'}
            onAdditionalScopeCommit={additionalScopeCommitEnabled
              ? async (record) => {
                  const preview = window.__phase2TrackBPreview;
                  if (preview) {
                    preview.additionalScopeCommitAttempts += 1;
                    if (preview.failNextAdditionalScopeCommit) {
                      preview.failNextAdditionalScopeCommit = false;
                      return {
                        ok: false,
                        error: 'Synthetic durable commit failed.',
                      };
                    }
                  }

                  try {
                    const next = [
                      ...readAdditionalScopes().filter(
                        (candidate) => candidate.id !== record.id,
                      ),
                      record,
                    ];
                    window.localStorage.setItem(
                      ADDITIONAL_SCOPE_STORAGE_KEY,
                      JSON.stringify(next),
                    );
                    setAdditionalScopes(next);
                    if (preview) preview.additionalScopeRecords = [...next];
                    return {
                      ok: true,
                      receipt: {
                        committedAt: '2026-07-29T16:00:00.000Z',
                        durable: true,
                        recordId: record.id,
                      },
                    };
                  } catch {
                    return {
                      ok: false,
                      error: 'Synthetic local storage was unavailable.',
                    };
                  }
                }
              : undefined}
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
        ) : view === 'crews' ? (
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
        ) : (
          <TrackCFieldOps
            additionalScopes={additionalScopes}
            embedded
            idFactory={createId}
            initialState={state}
            now={() => '2026-07-29T16:00:00.000Z'}
            onStateChange={(nextState, reason) => {
              setState(nextState);
              if (!window.__phase2TrackBPreview) return;
              window.__phase2TrackBPreview.reasons.push(reason);
              window.__phase2TrackBPreview.latestEventCount =
                nextState.events.length;
            }}
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
