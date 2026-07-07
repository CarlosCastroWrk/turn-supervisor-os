import type { PhotoNote } from '../../types';

const TIMESTAMP_FIELDS = new Set([
  'applied_at',
  'completed_at',
  'created_at',
  'last_used_at',
  'read_at',
  'scheduled_for',
  'sent_at',
  'updated_at',
]);

export interface SyncStampedRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export const comparableStamp = (item: SyncStampedRow) => item.updatedAt ?? item.completedAt ?? item.createdAt ?? '';

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

    if (compareSyncStamps(remote, local) > 0) {
      byId.set(remote.id, reconcileRemoteWinner(local, remote));
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    const stampDiff = compareSyncStamps(b, a);
    return stampDiff === 0 ? a.id.localeCompare(b.id) : stampDiff;
  });
};

export const mergePhotoNotes = (localRows: PhotoNote[], remoteRows: PhotoNote[]) =>
  mergeRows(localRows, remoteRows, (local, remote) => ({
    ...remote,
    imageData: remote.imageData ?? local.imageData,
  }));
