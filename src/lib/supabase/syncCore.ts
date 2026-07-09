import type { PhotoNote } from '../../types';

const TIMESTAMP_FIELDS = new Set([
  'archivedAt',
  'archived_at',
  'appliedAt',
  'applied_at',
  'completedAt',
  'completed_at',
  'createdAt',
  'created_at',
  'lastUsedAt',
  'last_used_at',
  'readAt',
  'read_at',
  'scheduledFor',
  'scheduled_for',
  'sentAt',
  'sent_at',
  'updatedAt',
  'updated_at',
]);

export interface SyncStampedRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  appliedAt?: string;
  completedAt?: string;
  status?: string;
}

const DRAFT_ACTION_STATUS_RANK: Record<string, number> = {
  pending: 0,
  approved: 1,
  failed: 2,
  rejected: 3,
  applied: 4,
};

export const comparableStamp = (item: SyncStampedRow) =>
  item.updatedAt ?? item.appliedAt ?? item.completedAt ?? item.createdAt ?? '';

export const stampToTime = (stamp: string) => {
  const time = Date.parse(stamp);
  return Number.isFinite(time) ? time : 0;
};

export const compareSyncStamps = (a: SyncStampedRow, b: SyncStampedRow) =>
  stampToTime(comparableStamp(a)) - stampToTime(comparableStamp(b));

const canonicalValue = (value: unknown, key?: string): unknown => {
  if (typeof value === 'string' && key && TIMESTAMP_FIELDS.has(key)) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, entryValue]) => [entryKey, canonicalValue(entryValue, entryKey)]),
    );
  }

  return value;
};

export const syncRowFingerprint = (row: Record<string, unknown>) => JSON.stringify(canonicalValue(row));

export const compareSyncRows = <T extends SyncStampedRow>(a: T, b: T) => {
  const stampDifference = compareSyncStamps(a, b);
  if (stampDifference !== 0) {
    return stampDifference;
  }

  const aDraftRank = a.status ? DRAFT_ACTION_STATUS_RANK[a.status] : undefined;
  const bDraftRank = b.status ? DRAFT_ACTION_STATUS_RANK[b.status] : undefined;
  if (aDraftRank !== undefined && bDraftRank !== undefined && aDraftRank !== bDraftRank) {
    return aDraftRank - bDraftRank;
  }

  const aFingerprint = syncRowFingerprint(a as unknown as Record<string, unknown>);
  const bFingerprint = syncRowFingerprint(b as unknown as Record<string, unknown>);
  if (aFingerprint === bFingerprint) {
    return 0;
  }
  return aFingerprint > bFingerprint ? 1 : -1;
};

export const mergeRows = <T extends SyncStampedRow>(
  localRows: T[],
  remoteRows: T[],
  reconcileRemoteWinner: (local: T, remote: T) => T = (_local, remote) => remote,
) => {
  const byId = new Map(localRows.map((item) => [item.id, item]));

  remoteRows.forEach((remote) => {
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      return;
    }

    if (compareSyncRows(remote, local) > 0) {
      byId.set(remote.id, reconcileRemoteWinner(local, remote));
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    const stampDiff = compareSyncStamps(b, a);
    return stampDiff === 0 ? a.id.localeCompare(b.id) : stampDiff;
  });
};

export const mergePhotoNotes = (localRows: PhotoNote[], remoteRows: PhotoNote[]) => {
  const localById = new Map(localRows.map((photo) => [photo.id, photo]));
  const remoteById = new Map(remoteRows.map((photo) => [photo.id, photo]));

  return mergeRows(localRows, remoteRows, (local, remote) => ({
    ...remote,
    imageData: remote.imageData ?? local.imageData,
    localImageAvailable: remote.localImageAvailable ?? local.localImageAvailable,
    imageMimeType: remote.imageMimeType ?? local.imageMimeType,
    imageByteSize: remote.imageByteSize ?? local.imageByteSize,
    storagePath: remote.storagePath ?? local.storagePath,
  })).map((winner) => {
    const local = localById.get(winner.id);
    const remote = remoteById.get(winner.id);
    return {
      ...winner,
      imageData: winner.imageData ?? local?.imageData,
      localImageAvailable: winner.localImageAvailable ?? local?.localImageAvailable,
      imageMimeType: winner.imageMimeType ?? local?.imageMimeType,
      imageByteSize: winner.imageByteSize ?? local?.imageByteSize,
      storagePath: winner.storagePath ?? remote?.storagePath ?? local?.storagePath,
    };
  });
};
