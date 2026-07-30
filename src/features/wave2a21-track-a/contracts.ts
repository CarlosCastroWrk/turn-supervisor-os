import type {
  AppData,
  FieldEvent,
  FieldSection,
  Project,
} from '../../types';
import type {
  TodayTask,
  TodayTaskProgress,
  TodayTaskQueueId,
} from '../wave2a2-track-b/types';
import type {
  TrackCState,
  TrackCTrade,
  TrackCWorkProjection,
  TrackCWorkTarget,
} from '../wave2a2-track-c/model';
import type { ActivityItem } from '../operational-memory/contracts';

export const TRACK_A_PROJECT_ROLES = ['turn-supervisor'] as const;
export type TrackAProjectRole = (typeof TRACK_A_PROJECT_ROLES)[number];

export const PROPERTY_CONTACT_ROLES = [
  'Property Manager',
  'Maintenance',
  'Field Lead / Market Partner',
  'Runner',
  'Other',
] as const;
export type PropertyContactRole = (typeof PROPERTY_CONTACT_ROLES)[number];

export interface PropertyContact {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly title: string;
  readonly phone?: string;
  readonly isPrimary: boolean;
  readonly activeForProject?: boolean;
  readonly note?: string;
  readonly role?: PropertyContactRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectDefaultSchedule {
  readonly workStartTime: string;
  readonly workEndTime: string;
  readonly walkthroughTime?: string;
}

export interface ProjectConfiguration {
  readonly version: 1;
  readonly status: 'active';
  readonly projectId: string;
  readonly activatedAt: string;
  readonly activatedBy: string;
  readonly role: TrackAProjectRole;
  readonly enabledTrades: {
    readonly paint: boolean;
    readonly clean: boolean;
  };
  readonly defaultCrewIdsByTrade: {
    readonly paint: readonly string[];
    readonly clean: readonly string[];
  };
  readonly defaultWorkingHoursWording: string;
  readonly defaultWalkthroughScheduleWording: string;
  readonly defaultPropertyContactId: string;
  readonly permissions: {
    readonly personalAppData: 'synthetic-or-explicitly-approved-only';
    readonly photos: 'not-confirmed' | 'permitted' | 'prohibited';
    readonly paperTurnBoardAuthoritative: true;
    readonly payrollCalculations: false;
    readonly officialApprovals: false;
  };
}

export type BrowserPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'
  | 'unknown';

export interface ProjectRosterUnitOption {
  readonly applicableSections: readonly FieldSection[];
  readonly building?: string;
  readonly floor?: string;
  readonly id: string;
  readonly unitNumber: string;
  readonly unitType: string;
}

export interface TrackACrewOption {
  readonly active?: boolean;
  readonly id: string;
  readonly name: string;
  readonly trade: 'paint' | 'clean';
}

export interface TrackASetupCrew {
  readonly active: boolean;
  readonly id: string;
  readonly name: string;
  readonly phone?: string;
  readonly projectId: string;
  readonly trade: 'paint' | 'clean';
}

export interface TrackASetupUnit {
  readonly building: string;
  readonly floor: string;
  readonly id: string;
  readonly projectId: string;
  readonly unitNumber: string;
  readonly unitType: 1 | 2 | 3 | 4 | 5;
}

/** @deprecated Use ProjectConfiguration. Kept as a feature-local compatibility alias. */
export type ProjectFieldConfiguration = ProjectConfiguration;

export interface TrackAProject extends Project {
  readonly fieldConfiguration?: ProjectConfiguration;
}

export interface TrackAAppData extends Omit<AppData, 'projects'> {
  readonly projects: TrackAProject[];
  readonly propertyContacts?: PropertyContact[];
}

export interface ProjectActivationDraft {
  readonly project: TrackAProject;
  readonly configuration: ProjectFieldConfiguration;
  readonly contacts: readonly PropertyContact[];
  readonly crews?: readonly TrackASetupCrew[];
  readonly units?: readonly TrackASetupUnit[];
  readonly confirmOverwrite: boolean;
}

export type ProjectActivationFailureCode =
  | 'invalid-project'
  | 'invalid-configuration'
  | 'invalid-contacts'
  | 'overwrite-confirmation-required';

export interface ProjectActivationRetryState {
  readonly sourceData: TrackAAppData;
  readonly draft: ProjectActivationDraft;
}

export type ProjectActivationPreparationResult =
  | {
      readonly ok: true;
      readonly stage: 'prepared';
      readonly data: TrackAAppData;
      readonly event: FieldEvent;
      readonly changed: boolean;
      readonly retry: ProjectActivationRetryState;
    }
  | {
      readonly ok: false;
      readonly stage: 'preparation';
      readonly code: ProjectActivationFailureCode;
      readonly errors: readonly string[];
    };

export type PreparedProjectActivation = Extract<
  ProjectActivationPreparationResult,
  { readonly ok: true }
>;

export type ProjectActivationPersistenceCallback = (
  data: Readonly<TrackAAppData>,
) => boolean | Promise<boolean>;

export interface ProjectActivationPersistenceReceipt {
  readonly acknowledgement: 'durable-save-succeeded';
  readonly activatedAt: string;
  readonly changed: boolean;
  readonly eventId: string;
  readonly projectId: string;
}

export type ProjectActivationPersistenceResult =
  | {
      readonly ok: true;
      readonly stage: 'persisted';
      readonly data: TrackAAppData;
      readonly event: FieldEvent;
      readonly receipt: ProjectActivationPersistenceReceipt;
    }
  | {
      readonly ok: false;
      readonly stage: 'persistence';
      readonly code: 'persistence-failed';
      readonly errors: readonly string[];
      readonly retry: ProjectActivationRetryState;
    };

export type StartDayValueSource =
  | 'saved-project-default'
  | 'today-only-override';

export interface StartDayResolvedValue<T> {
  readonly value: T;
  readonly source: StartDayValueSource;
}

export interface StartDayResolvedValues {
  readonly activeCrewIdsByTrade: {
    readonly Paint: StartDayResolvedValue<readonly string[]>;
    readonly Clean: StartDayResolvedValue<readonly string[]>;
  };
  readonly propertyContact: StartDayResolvedValue<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly walkthroughScheduleWording: StartDayResolvedValue<string>;
  readonly workingHoursWording: StartDayResolvedValue<string>;
}

export interface TrackAFieldActivity extends ActivityItem {
  readonly sourceEventId: string;
  readonly boundary: FieldEvent['boundary'];
}

export interface CanonicalCrewCurrentWork {
  readonly crewId: string;
  readonly crewName: string;
  readonly trade: 'paint' | 'clean';
  readonly currentAssignments: number;
  readonly waiting: number;
  readonly callbacks: number;
}

export interface CanonicalTodayTaskProjection {
  readonly task: TodayTask | null;
  readonly progress: TodayTaskProgress;
  readonly queueCounts: Readonly<Record<TodayTaskQueueId, number>>;
}

export type CanonicalWorkQueueId =
  | 'working'
  | 'waiting'
  | 'callbacks'
  | 'ready-to-walk';

export interface CanonicalWorkRecord {
  readonly id: string;
  readonly target: TrackCWorkTarget;
  readonly unitNumber: string;
  readonly unitType: string;
  readonly locationLabel: string;
  readonly trade: TrackCTrade;
  readonly crewId?: string;
  readonly crewName?: string;
  readonly queue?: CanonicalWorkQueueId;
  readonly waitingReasons: readonly string[];
  readonly projection: TrackCWorkProjection;
}

export interface CanonicalFieldProjection {
  readonly projectId: string;
  readonly daySessionId?: string;
  readonly counts: {
    readonly working: number;
    readonly waiting: number;
    readonly callbacks: number;
    readonly ready: number;
    readonly unitsTouched: number;
    readonly activity: number;
  };
  readonly grains: {
    readonly activity: 'events';
    readonly crewCurrentWork: 'section-trades';
    readonly queues: 'section-trades';
    readonly todayTaskProgress: 'sections';
    readonly unitsTouched: 'units';
  };
  readonly activity: readonly TrackAFieldActivity[];
  readonly workRecords: readonly CanonicalWorkRecord[];
  readonly queues: Readonly<Record<
    CanonicalWorkQueueId,
    readonly CanonicalWorkRecord[]
  >>;
  readonly releasedWork: readonly CanonicalWorkRecord[];
  readonly walkCandidates: readonly CanonicalWorkRecord[];
  readonly assignmentConflicts: readonly CanonicalWorkRecord[];
  readonly crewCurrentWork: readonly CanonicalCrewCurrentWork[];
  readonly trackCState: TrackCState;
  readonly todayTask: CanonicalTodayTaskProjection;
  readonly boundaries: {
    readonly paperTurnBoardAuthoritative: true;
    readonly officialApprovalMutated: false;
    readonly payrollCalculated: false;
  };
}

export interface CanonicalFieldProjectionInput {
  readonly accountId: string;
  readonly projectId: string;
  readonly activeDaySessionId?: string;
  readonly trackCState: TrackCState;
  readonly todayTask: TodayTask | null;
  readonly fieldEvents: readonly FieldEvent[];
}
