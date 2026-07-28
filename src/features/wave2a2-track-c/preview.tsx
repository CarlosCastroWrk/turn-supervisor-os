import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSyntheticTrackCState } from './fixtures';
import { TrackCFieldOps } from './TrackCFieldOps';
import './preview.css';

declare global {
  interface Window {
    __trackCPreview?: {
      reasons: string[];
      latestEventCount: number;
      crewEditRequests: string[];
      crewContactRequests: string[];
    };
  }
}

window.__trackCPreview = {
  reasons: [],
  latestEventCount: 0,
  crewEditRequests: [],
  crewContactRequests: [],
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <TrackCFieldOps
      initialState={createSyntheticTrackCState()}
      now={() => '2026-07-28T20:00:00.000Z'}
      onCrewContactRequested={(crewId) =>
        window.__trackCPreview?.crewContactRequests.push(crewId)}
      onCrewEditRequested={(crewId) =>
        window.__trackCPreview?.crewEditRequests.push(crewId)}
      onStateChange={(state, reason) => {
        if (!window.__trackCPreview) return;
        window.__trackCPreview.reasons.push(reason);
        window.__trackCPreview.latestEventCount = state.events.length;
      }}
    />
  </StrictMode>,
);
