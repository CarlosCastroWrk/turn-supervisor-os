import type {
  LaunchBlockerSummary,
  LaunchDailyGoalViewModel,
  LaunchHomeCounts,
  LaunchNotificationItem,
  LaunchSearchGroup,
} from './types';

export const LAUNCH_SYNTHETIC_CONTEXT = {
  dateLabel: 'Mon, Jul 27',
  propertyName: 'Moon Tower · Synthetic',
} as const;

export const LAUNCH_SYNTHETIC_GOAL: LaunchDailyGoalViewModel = {
  actual: 18,
  dateISO: '2026-07-27',
  dateLabel: 'Monday, July 27',
  metric: 'Sections',
  milestone: 'Los inspected',
  target: 32,
};

export const LAUNCH_SYNTHETIC_COUNTS: LaunchHomeCounts = {
  blocked: 3,
  callbacks: 2,
  readyToWalk: 7,
  working: 9,
};

export const LAUNCH_SYNTHETIC_BLOCKERS: readonly LaunchBlockerSummary[] = [
  {
    conciseReason: 'Access needs clarification',
    destinationId: 'unit:602:blocker:access',
    id: 'synthetic-blocker-602',
    unitLabel: 'Unit 602',
  },
  {
    conciseReason: 'Paint scope needs review',
    destinationId: 'unit:604:blocker:scope',
    id: 'synthetic-blocker-604',
    unitLabel: 'Unit 604',
  },
  {
    conciseReason: 'Crew response pending',
    destinationId: 'unit:1305:blocker:crew',
    id: 'synthetic-blocker-1305',
    unitLabel: 'Unit 1305',
  },
];

export const LAUNCH_SYNTHETIC_RECENTS = [
  'Unit 602',
  'Ready to walk',
  'Paint crew',
] as const;

export const LAUNCH_SYNTHETIC_SEARCH_GROUPS: readonly LaunchSearchGroup[] = [
  {
    id: 'units',
    label: 'Units',
    results: [
      {
        destinationId: 'unit:602',
        id: 'synthetic-search-unit-602',
        keywords: ['paint', 'level 6'],
        meta: 'Level 6 · Paint needs attention',
        title: 'Unit 602',
      },
      {
        destinationId: 'unit:604',
        id: 'synthetic-search-unit-604',
        keywords: ['clean', 'callback'],
        meta: 'Level 6 · Callback open',
        title: 'Unit 604',
      },
    ],
  },
  {
    id: 'crews',
    label: 'Crews',
    results: [
      {
        destinationId: 'crew:synthetic-north-paint',
        id: 'synthetic-search-crew-paint',
        keywords: ['paint'],
        meta: 'Synthetic Paint crew · 3 active Units',
        title: 'North Paint Team',
      },
    ],
  },
  {
    id: 'notes-activity',
    label: 'Notes / Activity',
    results: [
      {
        destinationId: 'activity:synthetic-note-602',
        id: 'synthetic-search-note-602',
        keywords: ['inspection', 'common'],
        meta: 'Synthetic personal note · Unit 602',
        title: 'Verify Common on next walk',
      },
    ],
  },
  {
    id: 'callbacks',
    label: 'Callbacks',
    results: [
      {
        destinationId: 'unit:604:callback:paint-c',
        id: 'synthetic-search-callback-604',
        keywords: ['paint', 'section c'],
        meta: 'Unit 604 · Paint C',
        title: 'Touch-up review',
      },
    ],
  },
  {
    id: 'blockers',
    label: 'Blockers',
    results: [
      {
        destinationId: 'unit:602:blocker:access',
        id: 'synthetic-search-blocker-602',
        keywords: ['access'],
        meta: 'Unit 602 · Access',
        title: 'Access needs clarification',
      },
    ],
  },
];

export const LAUNCH_SYNTHETIC_NOTIFICATIONS: readonly LaunchNotificationItem[] = [
  {
    category: 'conflicts',
    destinationId: 'unit:604:paint:C',
    destinationLabel: 'Unit 604 · Paint C',
    group: 'important',
    id: 'synthetic-notification-conflict-604',
    read: false,
    reason: 'Two synthetic crew claims need review',
    timeLabel: '8:42 AM',
    tradeSection: 'Paint · C',
    unitLabel: 'Unit 604',
  },
  {
    category: 'inspections',
    destinationId: 'unit:602:clean:common',
    destinationLabel: 'Unit 602 · Clean Common',
    group: 'today',
    id: 'synthetic-notification-inspection-602',
    read: false,
    reason: 'Ready for your personal walk',
    timeLabel: '8:18 AM',
    tradeSection: 'Clean · Common',
    unitLabel: 'Unit 602',
  },
  {
    category: 'callbacks',
    destinationId: 'unit:603:paint:A',
    destinationLabel: 'Unit 603 · Paint A',
    group: 'today',
    id: 'synthetic-notification-callback-603',
    read: true,
    reason: 'Synthetic callback follow-up due',
    timeLabel: '7:55 AM',
    tradeSection: 'Paint · A',
    unitLabel: 'Unit 603',
  },
  {
    category: 'inspections',
    destinationId: 'unit:1305:paint:common',
    destinationLabel: 'Unit 1305 · Paint Common',
    group: 'earlier',
    id: 'synthetic-notification-earlier-1305',
    read: true,
    reason: 'Personal inspection remains open',
    timeLabel: 'Yesterday',
    tradeSection: 'Paint · Common',
    unitLabel: 'Unit 1305',
  },
];
