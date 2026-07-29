export type TrackCSection14RouteId =
  | 'activity'
  | 'assign-crews'
  | 'backup'
  | 'callback-list'
  | 'crew-detail'
  | 'crew-list'
  | 'daily-release'
  | 'end-day'
  | 'home'
  | 'import-work'
  | 'more'
  | 'notes'
  | 'notifications'
  | 'official-forms'
  | 'paste-text'
  | 'photos'
  | 'privacy'
  | 'profile'
  | 'ready-list'
  | 'reports'
  | 'search'
  | 'setup'
  | 'start-day'
  | 'start-walk'
  | 'sync'
  | 'todays-task'
  | 'turnboard'
  | 'unit-detail'
  | 'waiting-list'
  | 'working-list';

export type TrackCPrimaryDisposition =
  | 'accepted-native'
  | 'external-only'
  | 'host-route'
  | 'unavailable';

export interface TrackCSection14RouteInventoryItem {
  readonly id: TrackCSection14RouteId;
  readonly label: string;
  readonly primaryDisposition: TrackCPrimaryDisposition;
  readonly unifiedThemeRequired: true;
}

const hostRoute = (
  id: TrackCSection14RouteId,
  label: string,
): TrackCSection14RouteInventoryItem => ({
  id,
  label,
  primaryDisposition: 'host-route',
  unifiedThemeRequired: true,
});

export const TRACK_C_SECTION_14_ROUTE_INVENTORY: readonly TrackCSection14RouteInventoryItem[] = [
  hostRoute('home', 'Home'),
  hostRoute('turnboard', 'TurnBoard'),
  hostRoute('unit-detail', 'Unit detail'),
  hostRoute('working-list', 'Working list'),
  hostRoute('waiting-list', 'Waiting list'),
  hostRoute('callback-list', 'Callback list'),
  hostRoute('ready-list', 'Ready list'),
  hostRoute('activity', 'Activity'),
  hostRoute('more', 'More'),
  hostRoute('setup', 'Setup'),
  hostRoute('start-day', 'Start Day'),
  hostRoute('end-day', 'End Day'),
  hostRoute('daily-release', 'Daily Release'),
  hostRoute('todays-task', 'Today’s Task'),
  hostRoute('assign-crews', 'Assign Crews'),
  hostRoute('crew-list', 'Crew list'),
  hostRoute('crew-detail', 'Crew detail'),
  hostRoute('start-walk', 'Start Walk'),
  hostRoute('reports', 'Reports'),
  hostRoute('profile', 'Profile'),
  hostRoute('privacy', 'Privacy'),
  hostRoute('sync', 'Sync'),
  hostRoute('backup', 'Backup'),
  {
    id: 'official-forms',
    label: 'Official Forms',
    primaryDisposition: 'external-only',
    unifiedThemeRequired: true,
  },
  hostRoute('search', 'Search'),
  hostRoute('notifications', 'Notifications'),
  {
    id: 'notes',
    label: 'Notes',
    primaryDisposition: 'accepted-native',
    unifiedThemeRequired: true,
  },
  {
    id: 'photos',
    label: 'Photos',
    primaryDisposition: 'unavailable',
    unifiedThemeRequired: true,
  },
  {
    id: 'paste-text',
    label: 'Paste Text',
    primaryDisposition: 'unavailable',
    unifiedThemeRequired: true,
  },
  {
    id: 'import-work',
    label: 'Import Work',
    primaryDisposition: 'unavailable',
    unifiedThemeRequired: true,
  },
];

export const TRACK_C_OFFICIAL_FORMS_AVAILABILITY = {
  available: true,
  externalOnly: true,
  prefill: false,
  submit: false,
} as const;

export const TRACK_C_LEGACY_ROUTE_QUARANTINE = [
  {
    disposition: 'host-compatibility-only',
    pattern: '#/copilot',
    primaryEntryAllowed: false,
    reason: 'The host normalizes this bookmark to the single Capture owner.',
  },
  {
    disposition: 'legacy-personal-unit',
    pattern: '#/unit/:unitId',
    primaryEntryAllowed: false,
    reason: 'Primary TurnBoard navigation must use the accepted board Unit route.',
  },
  {
    disposition: 'legacy-assignment-import',
    pattern: '#/assignments',
    primaryEntryAllowed: false,
    reason: 'The primary Plus menu cannot expose the old Import Work route.',
  },
] as const;

export const getTrackCSection14Route = (id: TrackCSection14RouteId) =>
  TRACK_C_SECTION_14_ROUTE_INVENTORY.find((item) => item.id === id);

export const canExposeTrackCPrimaryRoute = (id: TrackCSection14RouteId) =>
  getTrackCSection14Route(id)?.primaryDisposition !== 'unavailable';

export const isTrackCLegacyPrimaryRoute = (hash: string) => {
  const normalized = hash.split('?')[0];
  return TRACK_C_LEGACY_ROUTE_QUARANTINE.some(({ pattern }) => {
    if (!pattern.includes(':unitId')) return normalized === pattern;
    return /^#\/unit\/[^/]+$/u.test(normalized);
  });
};
