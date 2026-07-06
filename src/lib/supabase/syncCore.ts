import type { PhotoNote } from '../../types';

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
