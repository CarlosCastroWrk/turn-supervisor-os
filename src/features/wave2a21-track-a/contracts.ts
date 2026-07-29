import type {
  AppData,
  FieldEvent,
  Project,
} from '../../types';
import type {
  TodayTask,
  TodayTaskProgress,
  TodayTaskQueueId,
} from '../wave2a2-track-b/types';
import type {
  TrackCState,
} from '../wave2a2-track-c/model';
import type { ActivityItem } from '../operational-memory/contracts';

export const TRACK_A_PROJECT_ROLES = ['turn-supervisor'] as const;
export type TrackAProjectRole = (typeof TRACK_A_PROJECT_ROLES)[number];

export interface PropertyContact {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly title: string;
  readonly phone?: string;
  readonly isPrimary: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly confirmOverwrite: boolean;
}

export type ProjectActivationFailureCode =
  | 'invalid-project'
  | 'invalid-configuration'
  | 'invalid-contacts'
  | 'overwrite-confirmation-required';

export type ProjectActivationResult =
  | {
      readonly ok: true;
      readonly data: TrackAAppData;
      readonly event: FieldEvent;
      readonly changed: boolean;
    }
  | {
      readonly ok: false;
      readonly code: ProjectActivationFailureCode;
      readonly errors: readonly string[];
    };

export interface StartDaySavedDefaults {
  readonly activeCrewIdsByTrade: {
    readonly Paint: readonly string[];
    readonly Clean: readonly string[];
  };
  readonly propertyContact: string;
  readonly propertyContactId: string;
  readonly walkthroughScheduleWording: string;
  readonly workingHoursWording: string;
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

export interface CanonicalFieldProjection {
  readonly projectId: string;
  readonly daySessionId?: string;
  readonly counts: {
    readonly working: number;
    readonly waiting: number;
    readonly callbacks: number;
    readonly ready: number;
    readonly unitsTouched: number;
  };
  readonly grains: {
    readonly activity: 'events';
    readonly crewCurrentWork: 'section-trades';
    readonly queues: 'sections';
    readonly todayTaskProgress: 'sections';
    readonly unitsTouched: 'units';
  };
  readonly activity: readonly TrackAFieldActivity[];
  readonly crewCurrentWork: readonly CanonicalCrewCurrentWork[];
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
