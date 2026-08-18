export type TrackBToolDestination =
  | 'backup-restore'
  | 'close-turn'
  | 'crews'
  | 'demo-turn'
  | 'day-history'
  | 'my-notes'
  | 'official-pds-forms'
  | 'field-standard'
  | 'help'
  | 'portal'
  | 'privacy'
  | 'profile'
  | 'setup'
  | 'storage'
  | 'sync'
  | 'unit-import'
  | 'activity';

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
      { id: 'my-notes', label: 'My Notes', detail: 'Every note, newest first — searchable' },
      { id: 'activity', label: 'Activity', detail: 'Every update, in order \u2014 the receipts' },
      {
        id: 'day-history',
        label: 'Day History',
        detail: 'Every day of this Turn — released, passed, accepted',
      },
      {
        id: 'field-standard',
        label: 'The Standard',
        detail: 'Clean + paint pass bar, change-order + pay rules — one tap on a walk',
      },
      {
        id: 'official-pds-forms',
        label: 'Official PDS Forms',
        detail: 'Open reviewed company destinations when configured',
      },
      {
        id: 'portal',
        label: 'Property Portal',
        detail: 'Read-only live board link for Joseph and Paige',
      },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    items: [
      { id: 'setup', label: 'Project Setup', detail: 'Property, dates, contacts, crews, roster \u2014 edit anytime' },
      { id: 'unit-import', label: 'Add Today’s Work', detail: 'Quick-add grid, photo, or paste — what Joseph released' },
      {
        id: 'close-turn',
        label: 'Close Turn',
        detail: 'Turn finished? Seal it read-only — browse forever, reopen anytime',
      },
      {
        id: 'demo-turn',
        label: 'Demo Turn',
        detail: 'A fake tower to practice and show — nothing real gets touched',
      },
    ],
  },
  {
    id: 'data-safety',
    label: 'Data and Safety',
    items: [
      {
        id: 'backup-restore',
        label: 'Backups',
        detail: 'Save tonight\u2019s Turn file, or restore one — your off-phone copy',
      },
      { id: 'sync', label: 'Sync', detail: 'Cloud copy of the whole turn — ledger included, sign in to link' },
      { id: 'privacy', label: 'Privacy', detail: 'Everything stays on this phone unless you share it' },
      { id: 'storage', label: 'Storage', detail: 'Review records and files on this device' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'profile', label: 'Profile', detail: 'Personal details and app preferences' },
      { id: 'help', label: 'Help', detail: 'The daily loop, the queues, payroll, and what to do when stuck' },
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

// Device data status chips (Backups / Sync on the Storage page). Lived in
// ReportsAndProof.tsx until that page was retired in the Aug 2026 purge.
export interface TrackBDataStatus {
  label: string;
  detail: string;
  tone: 'ready' | 'attention' | 'unknown';
}

