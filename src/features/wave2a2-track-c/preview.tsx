import {
  StrictMode,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSyntheticTrackCState,
  createTrackCScaleState,
} from './fixtures';
import type { TrackCState } from './model';
import type { TrackCWalkDraft } from './phase2WalkWorkflow';
import {
  TrackCFieldOps,
  type TrackCRouteState,
} from './TrackCFieldOps';
import type { TrackCWalkLifecycleEvent } from './WalkView';
import './preview.css';

declare global {
  interface Window {
    __trackCPreview?: {
      reasons: string[];
      latestEventCount: number;
      crewEditRequests: string[];
      crewContactRequests: string[];
      walkLifecycleEvents: TrackCWalkLifecycleEvent[];
      signOffRequests: string[];
    };
  }
}

window.__trackCPreview = {
  reasons: [],
  latestEventCount: 0,
  crewEditRequests: [],
  crewContactRequests: [],
  walkLifecycleEvents: [],
  signOffRequests: [],
};

const params = new URLSearchParams(window.location.search);
const scale = params.get('scale');
const scenario = params.get('scenario');
const storageScope = scale === '500' ? 'scale-500' : scenario ?? 'standard';
const stateStorageKey = `track-c-preview-state:${storageScope}`;
const draftStorageKey = `track-c-preview-walk-draft:${storageScope}`;

const parseStored = <T,>(key: string): T | undefined => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
};

const createInitialState = (): TrackCState => {
  if (scale === '500') return createTrackCScaleState(500);
  const state = createSyntheticTrackCState();
  if (scenario !== 'walk-zero') return state;
  return {
    ...state,
    events: state.events.filter(
      (event) =>
        event.eventType !== 'los-passed' &&
        event.eventType !== 'callback-resolved',
    ),
  };
};

const parseRoute = (): TrackCRouteState => {
  const path = window.location.hash.replace(/^#/, '');
  const walkMatch = path.match(/^\/walk\/([^/]+)$/u);
  if (walkMatch) {
    return { view: 'walk', walkSessionId: decodeURIComponent(walkMatch[1]) };
  }
  const unitMatch = path.match(/^\/turnboard\/([^/]+)$/u);
  if (unitMatch) {
    return { view: 'board', unitId: decodeURIComponent(unitMatch[1]) };
  }
  const crewMatch = path.match(/^\/crews\/([^/]+)$/u);
  if (crewMatch) {
    return { view: 'crews', crewId: decodeURIComponent(crewMatch[1]) };
  }
  if (path === '/crews') return { view: 'crews' };
  if (path === '/assign') return { view: 'assign' };
  if (path === '/walk') return { view: 'walk' };
  return { view: 'board' };
};

const routeHash = (route: TrackCRouteState): string => {
  if (route.view === 'walk') {
    return route.walkSessionId
      ? `#/walk/${encodeURIComponent(route.walkSessionId)}`
      : '#/walk';
  }
  if (route.view === 'crews') {
    return route.crewId
      ? `#/crews/${encodeURIComponent(route.crewId)}`
      : '#/crews';
  }
  if (route.view === 'assign') return '#/assign';
  return route.unitId
    ? `#/turnboard/${encodeURIComponent(route.unitId)}`
    : '#/turnboard';
};

export const Preview = () => {
  const [state, setState] = useState<TrackCState>(
    () => parseStored<TrackCState>(stateStorageKey) ?? createInitialState(),
  );
  const [route, setRoute] = useState<TrackCRouteState>(() => parseRoute());
  const [walkDraft, setWalkDraft] = useState<TrackCWalkDraft | undefined>(
    () => parseStored<TrackCWalkDraft>(draftStorageKey),
  );

  useEffect(() => {
    const syncRoute = () => setRoute(parseRoute());
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const navigate = (nextRoute: TrackCRouteState) => {
    const hash = routeHash(nextRoute);
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
    setRoute(nextRoute);
  };

  return (
    <TrackCFieldOps
      initialState={state}
      now={() => '2026-07-28T20:00:00.000Z'}
      onCrewContactRequested={(crewId) =>
        window.__trackCPreview?.crewContactRequests.push(crewId)}
      onCrewEditRequested={(crewId) =>
        window.__trackCPreview?.crewEditRequests.push(crewId)}
      onNavigate={navigate}
      onStateChange={(nextState, reason) => {
        setState(nextState);
        localStorage.setItem(stateStorageKey, JSON.stringify(nextState));
        if (!window.__trackCPreview) return;
        window.__trackCPreview.reasons.push(reason);
        window.__trackCPreview.latestEventCount = nextState.events.length;
      }}
      routeState={route}
      walkIntegration={{
        contacts: [
          {
            id: 'contact-jordan-lee',
            isPrimary: true,
            name: 'Jordan Lee',
            role: 'Property Manager',
          },
          {
            id: 'contact-riley-morgan',
            name: 'Riley Morgan',
            role: 'Maintenance',
          },
        ],
        restoredDraft: walkDraft,
        onDraftChange: (draft) => {
          setWalkDraft(draft);
          if (draft) {
            localStorage.setItem(draftStorageKey, JSON.stringify(draft));
          } else {
            localStorage.removeItem(draftStorageKey);
          }
        },
        onLifecycleEvent: (event) =>
          window.__trackCPreview?.walkLifecycleEvents.push(event),
        onOpenTurnSignOff: (walkSessionId) =>
          window.__trackCPreview?.signOffRequests.push(walkSessionId),
      }}
    />
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
