import type { DailyGoalConfiguration } from './goals';

export const LAUNCH_SETUP_TRADES = ['paint', 'clean'] as const;
export type LaunchSetupTrade = (typeof LAUNCH_SETUP_TRADES)[number];

export type PermissionDecision = 'not-reviewed' | 'disallowed' | 'allowed';

export interface DataPhotoPermissionSettings {
  assignmentSourceStorage: PermissionDecision;
  workPhotoStorage: PermissionDecision;
  personalCloudSync: PermissionDecision;
  evidenceLabel?: string;
  protectedData: {
    tenantData: 'prohibited';
    signatures: 'prohibited';
    w9AndPaycardData: 'prohibited';
    accessCredentials: 'prohibited';
  };
}

export interface DataPhotoCapabilities {
  mayStoreAssignmentSources: boolean;
  mayStoreWorkPhotos: boolean;
  maySyncPersonalConfiguration: boolean;
  protectedDataMayBeStored: false;
}

export const createConservativePermissionSettings = (): DataPhotoPermissionSettings => ({
  assignmentSourceStorage: 'not-reviewed',
  workPhotoStorage: 'not-reviewed',
  personalCloudSync: 'not-reviewed',
  protectedData: {
    tenantData: 'prohibited',
    signatures: 'prohibited',
    w9AndPaycardData: 'prohibited',
    accessCredentials: 'prohibited',
  },
});

export const resolveDataPhotoCapabilities = (
  settings: DataPhotoPermissionSettings,
): DataPhotoCapabilities => ({
  mayStoreAssignmentSources: settings.assignmentSourceStorage === 'allowed',
  mayStoreWorkPhotos: settings.workPhotoStorage === 'allowed',
  maySyncPersonalConfiguration: settings.personalCloudSync === 'allowed',
  protectedDataMayBeStored: false,
});

export interface PersonalPropertyIdentity {
  propertyName: string;
  locationLabel?: string;
}

export interface TurnDateRange {
  startDate: string;
  endDate: string;
}

export interface TradeSelection {
  trades: LaunchSetupTrade[];
}

export interface PropertyContactReference {
  id: string;
  displayName: string;
  roleLabel: string;
}

export interface PropertyContactsConfiguration {
  contacts: PropertyContactReference[];
  needsConfirmation: boolean;
}

export interface AllowedWorkWindow {
  id: string;
  label: string;
  startTimeLocal: string;
  endTimeLocal: string;
}

export interface WorkHoursConfiguration {
  windows: AllowedWorkWindow[];
  needsConfirmation: boolean;
}

export interface WalkthroughConfiguration {
  localTime?: string;
  contactLabel?: string;
  needsConfirmation: boolean;
}

export interface UnitImportPreference {
  method: 'later' | 'manual' | 'file' | 'photo';
  preserveOriginalSource: true;
}

export interface UnitTypeSectionTemplate {
  id: string;
  label: string;
  sectionLabels: string[];
}

export interface UnitTypesSectionsConfiguration {
  templates: UnitTypeSectionTemplate[];
  needsConfirmation: boolean;
}

export interface CrewReference {
  id: string;
  displayName: string;
  trades: LaunchSetupTrade[];
}

export interface CrewConfiguration {
  crews: CrewReference[];
  needsConfirmation: boolean;
}

export interface OfficialFormsConfiguration {
  status: 'not-configured' | 'references-recorded';
  referenceLabels: string[];
  automaticSubmission: false;
}

export interface ReviewActivationAcknowledgement {
  personalAppOnly: boolean;
  paperRemainsAuthoritative: boolean;
  noAutomaticOperationalMutation: boolean;
}

export interface PersonalPropertyConfiguration {
  source: 'personal-launch-setup';
  property: PersonalPropertyIdentity;
  dates: TurnDateRange;
  trades: TradeSelection;
  contacts: PropertyContactsConfiguration;
  workHours: WorkHoursConfiguration;
  walkthrough: WalkthroughConfiguration;
  unitImport: UnitImportPreference;
  unitTypesAndSections: UnitTypesSectionsConfiguration;
  crews: CrewConfiguration;
  permissions: DataPhotoPermissionSettings;
  officialForms: OfficialFormsConfiguration;
  dailyGoal: DailyGoalConfiguration;
  personalAppOnly: true;
  paperRemainsAuthoritative: true;
}
