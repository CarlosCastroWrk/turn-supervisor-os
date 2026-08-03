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
    availability: 'hidden',
    reason: 'Camera intake is not included in this candidate.',
  },
  files: {
    availability: 'hidden',
    reason: 'File intake is not included in this candidate.',
  },
  'import-work': {
    availability: 'available',
  },
  'assign-units': {
    availability: 'available',
  },
  note: { availability: 'available' },
  'paste-text': {
    availability: 'hidden',
    reason: 'Paste Text intake is not included in this candidate.',
  },
  photos: {
    availability: 'hidden',
    reason: 'Photo intake is not included in this candidate.',
  },
};

// The integrated host must opt a legacy-backed action in explicitly after its
// destination receives an accepted native implementation. Safe is the default.
export const TRACK_C_COMPATIBILITY_PLUS_ACTIONS =
  TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS;
