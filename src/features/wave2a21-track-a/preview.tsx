import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { seedData } from '../../data/seed';
import type {
  CanonicalFieldProjection,
  ProjectActivationDraft,
  ProjectConfiguration,
  PropertyContact,
} from './contracts';
import { ProfilePrivacyScrollRegion } from './ProfilePrivacyScrollRegion';
import {
  ProjectSetupFlow,
  type ProjectSetupCrewOption,
} from './ProjectSetupFlow';
import { TodayTaskDetail } from './TodayTaskDetail';
import { resolveStartDayValues } from './startDayDefaults';
import '../../styles.css';
import './preview.css';

type PreviewScreen = 'setup' | 'today' | 'profile-privacy';

const PROJECT_ID = 'qa-wave2a21-track-a';
const ACTIVATED_AT = '2026-07-29T09:00:00.000-05:00';

const contacts: readonly PropertyContact[] = [{
  createdAt: ACTIVATED_AT,
  id: 'qa-contact-primary',
  isPrimary: true,
  name: 'Synthetic Property Contact',
  projectId: PROJECT_ID,
  title: 'Property contact',
  updatedAt: ACTIVATED_AT,
}];

const configuration: ProjectConfiguration = {
  activatedAt: ACTIVATED_AT,
  activatedBy: 'Los',
  defaultCrewIdsByTrade: {
    clean: ['qa-clean-default'],
    paint: ['qa-paint-default'],
  },
  defaultPropertyContactId: 'qa-contact-primary',
  defaultWalkthroughScheduleWording: 'Saved walkthrough at noon.',
  defaultWorkingHoursWording: 'Saved working hours: 10 AM–5 PM.',
  enabledTrades: { clean: true, paint: true },
  permissions: {
    officialApprovals: false,
    paperTurnBoardAuthoritative: true,
    payrollCalculations: false,
    personalAppData: 'synthetic-or-explicitly-approved-only',
    photos: 'not-confirmed',
  },
  projectId: PROJECT_ID,
  role: 'turn-supervisor',
  status: 'active',
  version: 1,
};

const initialDraft: ProjectActivationDraft = {
  configuration,
  confirmOverwrite: false,
  contacts,
  project: {
    ...structuredClone(seedData.projects[0]),
    createdAt: ACTIVATED_AT,
    endDate: '2026-08-15',
    id: PROJECT_ID,
    location: 'Synthetic Austin property',
    mode: 'real',
    name: 'Synthetic Turn project',
    projectManagerName: 'Synthetic Property Contact',
    propertyName: 'Synthetic Moon Tower',
    startDate: '2026-08-01',
    supervisorName: 'Los',
    updatedAt: ACTIVATED_AT,
  },
};

const crewOptions: readonly ProjectSetupCrewOption[] = [
  { id: 'qa-paint-default', name: 'Paint Crew Alpha', trade: 'paint' },
  { id: 'qa-paint-today', name: 'Paint Crew Today', trade: 'paint' },
  { id: 'qa-clean-default', name: 'Clean Crew Beta', trade: 'clean' },
];

const startDayValues = resolveStartDayValues(configuration, contacts, {
  activeCrewIdsByTrade: { Paint: ['qa-paint-today'] },
  workingHoursWording: 'Today only: 9 AM–4 PM.',
});

const projection: CanonicalFieldProjection = {
  activity: [],
  assignmentConflicts: [],
  boundaries: {
    officialApprovalMutated: false,
    paperTurnBoardAuthoritative: true,
    payrollCalculated: false,
  },
  counts: {
    activity: 0,
    callbacks: 1,
    ready: 1,
    unitsTouched: 3,
    waiting: 1,
    working: 2,
  },
  crewCurrentWork: [],
  daySessionId: 'qa-day-session',
  grains: {
    activity: 'events',
    crewCurrentWork: 'section-trades',
    queues: 'section-trades',
    todayTaskProgress: 'sections',
    unitsTouched: 'units',
  },
  projectId: PROJECT_ID,
  queues: {
    callbacks: [],
    'ready-to-walk': [],
    waiting: [],
    working: [],
  },
  releasedWork: [],
  todayTask: {
    progress: {
      actual: 2,
      copy: '2 of 4 released sections inspected by Los.',
      metric: 'sections',
      milestone: 'los-inspected',
      percentage: 50,
      scope: 'today-confirmed-release',
      scopeLabel: 'Today’s confirmed release',
      target: 4,
    },
    queueCounts: {
      callbacks: 1,
      'ready-to-walk': 1,
      waiting: 1,
      working: 2,
    },
    task: null,
  },
  trackCState: {
    completedWalks: [],
    crews: [],
    events: [],
    propertyId: PROJECT_ID,
    propertyName: 'Synthetic Moon Tower',
    terminology: {
      boardName: 'TurnBoard',
      paperReminder: 'Paper remains authoritative.',
      personalMirrorLabel: 'PDS Approved',
      propertyAcceptanceLabel: 'Property accepted',
    },
    units: [],
  },
  walkCandidates: [],
  workRecords: [],
};

const detailRows = Array.from(
  { length: 18 },
  (_, index) => `Synthetic detail row ${index + 1}`,
);

const initialStepFromUrl = () => {
  const value = new URLSearchParams(window.location.search).get('step');
  return value === null ? 0 : Number(value);
};

export function TrackABehaviorHarness() {
  const [screen, setScreen] = useState<PreviewScreen>('setup');
  const [currentStep, setCurrentStep] = useState(initialStepFromUrl);
  const [draft, setDraft] = useState<ProjectActivationDraft>(initialDraft);
  const [status, setStatus] = useState(
    'Synthetic package harness. No AppData is persisted here.',
  );

  return (
    <div className="w2a21a-preview" data-track-a-behavior-harness="true">
      <nav aria-label="Track A test surfaces" className="w2a21a-preview__nav">
        <button onClick={() => setScreen('setup')} type="button">Setup</button>
        <button onClick={() => setScreen('today')} type="button">Today task</button>
        <button onClick={() => setScreen('profile-privacy')} type="button">
          Profile / Privacy
        </button>
      </nav>
      <output aria-live="polite" className="w2a21a-preview__status">
        {status}
      </output>
      <main
        className={[
          'w2a21a-preview__surface',
          screen === 'today' ? 'w2a21a-preview__surface--scrollable' : '',
        ].filter(Boolean).join(' ')}
      >
        {screen === 'setup' ? (
          <ProjectSetupFlow
            crewOptions={crewOptions}
            currentStep={currentStep}
            draft={draft}
            onActivate={() => setStatus(
              'Activation requested. A host persistence acknowledgement is still required.',
            )}
            onAddContact={() => setStatus('Add contact requested.')}
            onDraftChange={setDraft}
            onRemoveContact={(contactId) => setDraft((current) => ({
              ...current,
              contacts: current.contacts.filter((contact) => contact.id !== contactId),
            }))}
            onStepChange={setCurrentStep}
          />
        ) : null}
        {screen === 'today' ? (
          <TodayTaskDetail
            onBack={() => setStatus('Back from Today’s Task requested.')}
            onOpenQueue={(queueId) => setStatus(`Opened ${queueId} queue.`)}
            onReviewStartDay={() => setStatus('Start Day review requested.')}
            projection={projection}
            startDayValues={startDayValues}
          />
        ) : null}
        {screen === 'profile-privacy' ? (
          <div className="w2a21a-preview__scroll-grid">
            <section
              aria-label="Profile scroll ownership test"
              className="w2a21a-preview__scroll-panel"
            >
              <ProfilePrivacyScrollRegion kind="profile">
                <h1>Profile</h1>
                {detailRows.map((row) => (
                  <div className="w2a21a-preview__scroll-row" key={`profile-${row}`}>
                    {row}
                  </div>
                ))}
              </ProfilePrivacyScrollRegion>
            </section>
            <section
              aria-label="Privacy scroll ownership test"
              className="w2a21a-preview__scroll-panel"
            >
              <ProfilePrivacyScrollRegion kind="privacy">
                <h1>Privacy</h1>
                {detailRows.map((row) => (
                  <div className="w2a21a-preview__scroll-row" key={`privacy-${row}`}>
                    {row}
                  </div>
                ))}
              </ProfilePrivacyScrollRegion>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackABehaviorHarness />
  </StrictMode>,
);
