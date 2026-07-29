import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DayTaskWorkspace } from './DayTaskWorkspace';
import {
  SYNTHETIC_ACCOUNT_ID,
  SYNTHETIC_CREWS,
  SYNTHETIC_DATE,
  createSyntheticActiveSession,
  createSyntheticEvents,
  createSyntheticRelease,
  createSyntheticRoster,
  createSyntheticTodayTask,
} from './fixtures';
import './preview.css';

type PreviewScenario = 'active' | 'no-release' | 'not-started' | 'rollover';

const query = new URLSearchParams(window.location.search);
const requestedScenario = query.get('scenario');
const scenario: PreviewScenario = (
  requestedScenario === 'active'
  || requestedScenario === 'no-release'
  || requestedScenario === 'rollover'
)
  ? requestedScenario
  : 'not-started';

const roster = createSyntheticRoster(500);
const release = createSyntheticRelease(roster, 40);
const activeResult = createSyntheticActiveSession(release, roster);

if (!activeResult.session) {
  throw new Error('The synthetic active Day Session fixture is invalid.');
}

const activeSession = activeResult.session;
const task = createSyntheticTodayTask(roster, release, activeSession.daySessionId);
const currentDate = scenario === 'rollover' ? '2026-08-04' : SYNTHETIC_DATE;
const releases = scenario === 'no-release' ? [] : [release];
const existingSessions = scenario === 'active' || scenario === 'rollover'
  ? [activeSession]
  : [];
const initialTask = scenario === 'active' || scenario === 'rollover'
  ? task
  : undefined;
const events = existingSessions.length > 0 ? createSyntheticEvents(activeSession) : [];

export function TrackBPreview() {
  return (
    <main className="w2a2b-preview" data-preview-scenario={scenario}>
      <p className="w2a2b-preview__notice">
        Synthetic Track B preview · no real property data
      </p>
      <DayTaskWorkspace
        accountId={SYNTHETIC_ACCOUNT_ID}
        crews={SYNTHETIC_CREWS}
        currentDate={currentDate}
        events={events}
        existingSessions={existingSessions}
        idFactory={() => 'day-session-preview-new'}
        initialTask={initialTask}
        now={() => '2026-08-03T17:30:00.000Z'}
        propertyRoster={roster}
        releases={releases}
        startedBy="Los"
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackBPreview />
  </StrictMode>,
);
