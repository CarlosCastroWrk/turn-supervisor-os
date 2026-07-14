import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { seedData } from '../data/seed';
import type { AppData } from '../types';
import { applyActivityLogRetention } from './activityRetention';
import { createCoalescedWriter } from './coalescedWriter';
import { normalizeAppData } from './dataMigrations';
import { createFieldDraftStore } from './fieldDraft';
import { applyLegacyPhotoMigration, clearPhotoBlobs, migrateLegacyPhotoPayloads } from './photoStorage';
import { clearLocalCacheOwner } from './supabase/cacheOwnership';

const STORAGE_KEY = 'turn-supervisor-os:v0.1';
const CORRUPT_STORAGE_KEY = `${STORAGE_KEY}:corrupt`;
export const APP_DATA_SAVE_INTERVAL_MS = 500;

export const hasStoredAppData = () => Boolean(window.localStorage.getItem(STORAGE_KEY));

export const loadAppData = (): AppData => {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  try {
    if (!stored) {
      return normalizeAppData(seedData);
    }

    return normalizeAppData({ ...seedData, ...JSON.parse(stored) } as AppData);
  } catch (error) {
    console.warn('Failed to load local Turn Supervisor OS data. Falling back to seed data.', error);
    if (stored) {
      try {
        window.localStorage.setItem(CORRUPT_STORAGE_KEY, stored);
      } catch (preserveError) {
        console.warn('Failed to preserve corrupt Turn Supervisor OS data.', preserveError);
      }
    }
    return normalizeAppData(seedData);
  }
};

let storageFailureWarned = false;

export const saveAppData = (data: AppData) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applyActivityLogRetention(data)));
    storageFailureWarned = false;
    return true;
  } catch (error) {
    console.warn('Failed to save Turn Supervisor OS data.', error);
    if (!storageFailureWarned) {
      storageFailureWarned = true;
      window.alert(
        'Saving failed — browser record storage is likely full. Export a JSON backup now from Export before making more changes.',
      );
    }
    return false;
  }
};

const appDataWriter = createCoalescedWriter(saveAppData, APP_DATA_SAVE_INTERVAL_MS);

export const persistAppDataNow = (data: AppData) => {
  appDataWriter.cancel();
  return saveAppData(data);
};

export const clearInFlightFieldDrafts = () => {
  try {
    return createFieldDraftStore(window.sessionStorage).clearAll();
  } catch {
    return 0;
  }
};

export const clearAppData = async () => {
  appDataWriter.cancel();
  clearInFlightFieldDrafts();
  const ownerCleared = clearLocalCacheOwner();
  let recordsCleared = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    recordsCleared = !hasStoredAppData();
  } catch (error) {
    console.warn('Failed to clear local Turn Supervisor OS records during device reset.', error);
  }

  let photosCleared = false;
  try {
    await clearPhotoBlobs();
    photosCleared = true;
  } catch (error) {
    console.warn('Failed to clear local photo files during device reset.', error);
  }
  return ownerCleared && recordsCleared && photosCleared;
};

export const usePersistentAppData = () => {
  const [hasStoredData, setHasStoredData] = useState(() => hasStoredAppData());
  const [data, setStoredData] = useState<AppData>(() => loadAppData());
  const migrationInFlight = useRef(false);
  const attemptedLegacyPhotoIds = useRef(new Set<string>());
  const setData = useCallback<Dispatch<SetStateAction<AppData>>>((update) => {
    setStoredData((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      return applyActivityLogRetention(next);
    });
  }, []);

  useEffect(() => {
    if (migrationInFlight.current) {
      return;
    }

    const legacyPhotos = data.photoNotes.filter(
      (photo) => Boolean(photo.imageData) && !attemptedLegacyPhotoIds.current.has(photo.id),
    );
    if (legacyPhotos.length === 0) {
      return;
    }

    legacyPhotos.forEach((photo) => attemptedLegacyPhotoIds.current.add(photo.id));
    migrationInFlight.current = true;

    void migrateLegacyPhotoPayloads(legacyPhotos)
      .then((result) => {
        if (result.migrated.length > 0) {
          setData((current) => ({
            ...current,
            photoNotes: applyLegacyPhotoMigration(current.photoNotes, result.migrated),
          }));
        }
        if (result.failedIds.length > 0) {
          console.warn(
            `Kept ${result.failedIds.length} legacy photo payload(s) in fallback browser storage because IndexedDB migration failed.`,
          );
        }
      })
      .finally(() => {
        migrationInFlight.current = false;
      });
  }, [data.photoNotes, setData]);

  useEffect(() => {
    appDataWriter.schedule(data);
    setHasStoredData(true);
  }, [data]);

  useEffect(() => {
    const flushPendingData = () => {
      appDataWriter.flush();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingData();
      }
    };

    window.addEventListener('pagehide', flushPendingData);
    document.addEventListener('visibilitychange', flushWhenHidden);

    return () => {
      window.removeEventListener('pagehide', flushPendingData);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushPendingData();
    };
  }, []);

  return useMemo(() => ({ data, setData, hasStoredData }), [data, hasStoredData, setData]);
};
