import type { ActivityLog, EntityId } from '../../../types';

export type TrackCPlusAction =
  | 'note'
  | 'blocker'
  | 'camera'
  | 'photos'
  | 'files'
  | 'paste-text'
  | 'import-work'
  | 'assign-units'
  | 'tell-os';

export type TrackCNativeFileAction = Extract<TrackCPlusAction, 'camera' | 'photos' | 'files'>;

export interface PersonalNoteSession {
  source: 'new' | 'resumed';
  unitId?: EntityId;
  wording: string;
}

export interface StoredPersonalNoteDraft {
  version: 1;
  projectId: EntityId;
  unitId?: EntityId;
  wording: string;
  updatedAt: string;
}

export interface PersonalActivityViewModel {
  activity: ActivityLog;
  projectLabel: string;
  unitId?: EntityId;
  unitNumber?: string;
}

export interface TrackCNativeFileSelection {
  files: readonly File[];
  kind: TrackCNativeFileAction;
}
