import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { seedData } from '../../data/seed';
import type {
  CanonicalFieldProjection,
  ProjectActivationDraft,
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
} from './contracts';
import { FastStartDayFlow } from './FastStartDayFlow';
import { ProfilePrivacyScrollRegion } from './ProfilePrivacyScrollRegion';
import {
  ProjectSetupFlow,
  type ProjectSetupCrewOption,
} from './ProjectSetupFlow';
import { TodayTaskDetail } from './TodayTaskDetail';
import { resolveStartDayValues } from './startDayDefaults';
import '../../styles.css';
import './preview.css';

type PreviewScreen = 'setup' | 'start-day' | 'today' | 'profile-privacy';

const PROJECT_ID = 'qa-wave2a21-track-a';
const ACTIVATED_AT = '2026-07-29T09:00:00.000-05:00';

const contacts: readonly PropertyContact[] = [{
  createdAt: ACTIVATED_AT,
  id: 'qa-contact-primary',
  isPrimary: true,
  name: 'Synthetic Property Contact',
  activeForProject: true,
  role: 'Property Manager',
  projectId: PROJECT_ID,
  title: 'Property Manager',
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
  defaultWalkthroughScheduleWording: '12:00',
  defaultWorkingHoursWording: '08:00–18:00',
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

const rosterUnits: readonly ProjectRosterUnitOption[] = [
  {
    applicableSections: ['common', 'A', 'B', 'C', 'D'],
    building: 'Tower',
    floor: '1',
    id: 'qa-unit-101',
    unitNumber: '101',
    unitType: '4 bedroom',
  },
  {
    applicableSections: ['common', 'A', 'B'],
    building: 'Tower',
    floor: '2',
    id: 'qa-unit-202',
    unitNumber: '202',
    unitType: '2 bedroom',
  },
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

const initialStartDayStepFromUrl = () => {
  const value = new URLSearchParams(window.location.search).get('startDayStep');
  return value === null ? 0 : Number(value);
};

const initialScreenFromUrl = (): PreviewScreen => {
  const value = new URLSearchParams(window.location.search).get('screen');
  return value === 'start-day' || value === 'today' || value === 'profile-privacy'
    ? value
    : 'setup';
};

export function TrackABehaviorHarness() {
  const [screen, setScreen] = useState<PreviewScreen>(initialScreenFromUrl);
  const [currentStep, setCurrentStep] = useState(initialStepFromUrl);
  const [startDayStep, setStartDayStep] = useState(initialStartDayStepFromUrl);
  const [draft, setDraft] = useState<ProjectActivationDraft>(initialDraft);
  const [status, setStatus] = useState(
    'Synthetic package harness. No AppData is persisted here.',
  );
  const [startFailureConsumed, setStartFailureConsumed] = useState(false);
  const failStartOnce = new URLSearchParams(window.location.search)
    .get('failStartOnce') === '1';

  return (
    <div className="w2a21a-preview" data-track-a-behavior-harness="true">
      <nav aria-label="Track A test surfaces" className="w2a21a-preview__nav">
        <button onClick={() => setScreen('setup')} type="button">Setup</button>
        <button onClick={() => setScreen('start-day')} type="button">Start Day</button>
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
            cameraPermissionState="prompt"
            crewOptions={crewOptions}
            currentStep={currentStep}
            draft={draft}
            onActivate={() => setStatus(
              'Activation requested. A host persistence acknowledgement is still required.',
            )}
            onAddContact={() => setDraft((current) => {
              const contactNumber = current.contacts.length + 1;
              return {
                ...current,
                contacts: [
                  ...current.contacts,
                  {
                    activeForProject: true,
                    createdAt: ACTIVATED_AT,
                    id: `qa-contact-${contactNumber}`,
                    isPrimary: false,
                    name: `Synthetic Contact ${contactNumber}`,
                    projectId: PROJECT_ID,
                    role: 'Other',
                    title: 'Other',
                    updatedAt: ACTIVATED_AT,
                  },
                ],
              };
            })}
            onDraftChange={setDraft}
            onRemoveContact={(contactId) => setDraft((current) => ({
              ...current,
              contacts: current.contacts.filter((contact) => contact.id !== contactId),
            }))}
            onStepChange={setCurrentStep}
            rosterUnits={rosterUnits}
          />
        ) : null}
        {screen === 'start-day' ? (
          <FastStartDayFlow
            configuration={draft.configuration}
            contacts={draft.contacts}
            crewOptions={crewOptions}
            currentDate="2026-08-01"
            currentStep={startDayStep}
            onCancel={() => setStatus('Start Day cancelled.')}
            onStepChange={(nextStep) => {
              setStartDayStep(nextStep);
              const nextUrl = new URL(window.location.href);
              nextUrl.searchParams.set('startDayStep', String(nextStep));
              window.history.replaceState(null, '', nextUrl);
            }}
            onStartDay={(submission) => {
              if (failStartOnce && !startFailureConsumed) {
                setStartFailureConsumed(true);
                setStatus(
                  `Synthetic host rejected ${submission.release.items.length} release items.`,
                );
                return false;
              }
              setStatus(
                `Synthetic host atomically accepted ${submission.release.items.length} release items.`,
              );
              return true;
            }}
            projectId={PROJECT_ID}
            propertyName={draft.project.propertyName}
            rosterUnits={rosterUnits}
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
