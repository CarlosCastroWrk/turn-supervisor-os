export type TrackBToolDestination =
  | 'backup-restore'
  | 'crews'
  | 'daily-goal'
  | 'official-pds-forms'
  | 'privacy'
  | 'profile'
  | 'reports-and-proof'
  | 'setup'
  | 'storage'
  | 'sync'
  | 'unit-import';

export type TrackBMoreAction = TrackBToolDestination | 'sign-out';

export interface TrackBMoreItem {
  id: TrackBMoreAction;
  label: string;
  detail: string;
}

export interface TrackBMoreGroup {
  id: 'work' | 'project' | 'data-safety' | 'account';
  label: string;
  items: readonly TrackBMoreItem[];
}

export const TRACK_B_MORE_GROUPS: readonly TrackBMoreGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'crews', label: 'Crews', detail: 'People available for Paint and Clean' },
      {
        id: 'reports-and-proof',
        label: 'Reports and Proof',
        detail: 'Review recorded field counts and device status',
      },
      {
        id: 'official-pds-forms',
        label: 'Official PDS Forms',
        detail: 'Open reviewed company destinations when configured',
      },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    items: [
      { id: 'setup', label: 'Setup', detail: 'Property, schedule, permissions, and review' },
      { id: 'unit-import', label: 'Unit Import', detail: 'Review a source before adding Units' },
      { id: 'daily-goal', label: 'Daily Goal', detail: 'Set one metric, milestone, and target' },
    ],
  },
  {
    id: 'data-safety',
    label: 'Data and Safety',
    items: [
      {
        id: 'backup-restore',
        label: 'Backup and Restore',
        detail: 'Review device backup and recovery tools',
      },
      { id: 'sync', label: 'Sync', detail: 'Review connectivity and pending changes' },
      { id: 'privacy', label: 'Privacy', detail: 'Review allowed personal-app data' },
      { id: 'storage', label: 'Storage', detail: 'Review records and files on this device' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'profile', label: 'Profile', detail: 'Personal details and app preferences' },
      { id: 'sign-out', label: 'Sign Out', detail: 'End the current Turn OS session' },
    ],
  },
] as const;

export type TrackBSetupQuestionId =
  | 'property'
  | 'dates'
  | 'trades'
  | 'contacts'
  | 'work-hours'
  | 'walkthrough-time'
  | 'unit-import'
  | 'unit-types-sections'
  | 'crews'
  | 'data-photo-permissions'
  | 'official-forms'
  | 'daily-goal'
  | 'review';

export interface TrackBSetupQuestion {
  id: TrackBSetupQuestionId;
  title: string;
  prompt: string;
}

export const TRACK_B_SETUP_QUESTIONS: readonly TrackBSetupQuestion[] = [
  {
    id: 'property',
    title: 'Property',
    prompt: 'Which property is this personal Turn OS workspace supporting?',
  },
  {
    id: 'dates',
    title: 'Dates',
    prompt: 'What are the confirmed start, move-out, completion, and move-in dates?',
  },
  {
    id: 'trades',
    title: 'Trades',
    prompt: 'Which confirmed trades apply to this project?',
  },
  {
    id: 'contacts',
    title: 'Contacts',
    prompt: 'Who are the confirmed client and market-partner contacts?',
  },
  {
    id: 'work-hours',
    title: 'Work hours',
    prompt: 'What working-hour restrictions must Los follow?',
  },
  {
    id: 'walkthrough-time',
    title: 'Walkthrough time',
    prompt: 'What recurring management walkthrough time is confirmed?',
  },
  {
    id: 'unit-import',
    title: 'Unit import',
    prompt: 'Which reviewed Unit source will be used?',
  },
  {
    id: 'unit-types-sections',
    title: 'Unit types and sections',
    prompt: 'Which Unit types and section labels are confirmed?',
  },
  {
    id: 'crews',
    title: 'Crews',
    prompt: 'Which Paint and Clean crews are available for this project?',
  },
  {
    id: 'data-photo-permissions',
    title: 'Data and photo permissions',
    prompt: 'What personal-app data and photo permissions have been confirmed?',
  },
  {
    id: 'official-forms',
    title: 'Official forms',
    prompt: 'Which reviewed official form destinations may be linked?',
  },
  {
    id: 'daily-goal',
    title: 'Daily goal',
    prompt: 'Which metric, milestone, and target should guide today?',
  },
  {
    id: 'review',
    title: 'Review',
    prompt: 'Review every answer before activating this personal setup.',
  },
] as const;

export type TrackBCrewTrade = 'Paint' | 'Clean';

export interface TrackBCrewDraft {
  name: string;
  trade: TrackBCrewTrade;
  phone?: string;
  activeToday: boolean;
}

export interface TrackBCrewRecord extends TrackBCrewDraft {
  id: string;
}

export const TRACK_B_CREW_FIELDS = [
  'name',
  'trade',
  'phone',
  'activeToday',
] as const satisfies readonly (keyof TrackBCrewDraft)[];

export const validateTrackBCrewDraft = (draft: TrackBCrewDraft) => ({
  valid: draft.name.trim().length > 0,
  errors: draft.name.trim().length > 0 ? [] : ['Name is required.'],
});

export const getTrackBCrewInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
};

export interface TrackBReportCounts {
  unitsTouched: number;
  sectionsInspected: number;
  working: number;
  waiting: number;
  callbacksFound: number;
  callbacksResolved: number;
  readyToWalk: number;
  activityCount: number;
}

export const TRACK_B_REPORT_METRICS = [
  { id: 'unitsTouched', label: 'Units touched' },
  { id: 'sectionsInspected', label: 'Sections inspected' },
  { id: 'working', label: 'Working' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'callbacksFound', label: 'Callbacks found' },
  { id: 'callbacksResolved', label: 'Callbacks resolved' },
  { id: 'readyToWalk', label: 'Ready to walk' },
  { id: 'activityCount', label: 'Activity count' },
] as const satisfies readonly {
  id: keyof TrackBReportCounts;
  label: string;
}[];
