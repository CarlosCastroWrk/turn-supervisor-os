import type { TrackCPlusAction } from '../wave2a1-native/track-c/types';

export type TrackCPlusActionAvailability = 'available' | 'hidden' | 'unavailable';

export interface TrackCPlusActionDisposition {
  readonly availability: TrackCPlusActionAvailability;
  readonly reason?: string;
}

export type TrackCPlusActionAvailabilityMap = Partial<
  Readonly<Record<TrackCPlusAction, TrackCPlusActionDisposition>>
>;

export const TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS: Readonly<
  Record<TrackCPlusAction, TrackCPlusActionDisposition>
> = {
  blocker: { availability: 'available' },
  camera: {
    availability: 'unavailable',
    reason: 'Camera intake is not included in this candidate.',
  },
  files: {
    availability: 'unavailable',
    reason: 'File intake is not included in this candidate.',
  },
  'import-work': {
    availability: 'unavailable',
    reason: 'The Import upgrade is not included in this candidate.',
  },
  note: { availability: 'available' },
  'paste-text': {
    availability: 'unavailable',
    reason: 'Paste Text intake is not included in this candidate.',
  },
  photos: {
    availability: 'unavailable',
    reason: 'Photo intake is not included in this candidate.',
  },
};

// The integrated host must opt a legacy-backed action in explicitly after its
// destination receives an accepted native implementation. Safe is the default.
export const TRACK_C_COMPATIBILITY_PLUS_ACTIONS =
  TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS;
