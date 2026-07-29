import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { seedData } from '../data/seed';
import type { AppData } from '../types';
import { applyActivityLogRetention } from './activityRetention';
import { parseJsonBackup } from './backups';
import { createCoalescedWriter } from './coalescedWriter';
import { normalizeAppData } from './dataMigrations';
import { createFieldDraftStore } from './fieldDraft';
import { applyLegacyPhotoMigration, clearPhotoBlobs, migrateLegacyPhotoPayloads } from './photoStorage';
import {
  clearLastAuthenticatedUserId,
  clearLocalCacheOwner,
} from './supabase/cacheOwnership';
import type { CoalescedWriter, CoalescedWriteState } from './coalescedWriter';

const STORAGE_KEY = 'turn-supervisor-os:v0.1';
const CORRUPT_STORAGE_KEY = `${STORAGE_KEY}:corrupt`;
export const APP_DATA_SAVE_INTERVAL_MS = 500;

export interface AppDataSaveStatus {
  state: 'saved' | 'pending' | 'failed';
  canRetry: boolean;
}

const saveStatusListeners = new Set<() => void>();
let appDataSaveStatus: AppDataSaveStatus = { state: 'saved', canRetry: false };
let appDataLoadBlocked = false;

const setAppDataSaveStatus = (state: AppDataSaveStatus['state'], canRetry: boolean) => {
  if (appDataSaveStatus.state === state && appDataSaveStatus.canRetry === canRetry) {
    return;
  }
  appDataSaveStatus = { state, canRetry };
  saveStatusListeners.forEach((listener) => listener());
};

export const getAppDataSaveStatus = () => appDataSaveStatus;

export const subscribeToAppDataSaveStatus = (listener: () => void) => {
  saveStatusListeners.add(listener);
  return () => saveStatusListeners.delete(listener);
};

export const useAppDataSaveStatus = () =>
  useSyncExternalStore(subscribeToAppDataSaveStatus, getAppDataSaveStatus, getAppDataSaveStatus);

export const hasStoredAppData = () => Boolean(window.localStorage.getItem(STORAGE_KEY));

export const loadAppData = (): AppData => {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  try {
    if (!stored) {
      appDataLoadBlocked = false;
      setAppDataSaveStatus('saved', false);
      return normalizeAppData(seedData);
    }

    const parsed = parseJsonBackup(stored);
    appDataLoadBlocked = false;
    setAppDataSaveStatus('saved', false);
    return parsed;
  } catch (error) {
    appDataLoadBlocked = true;
    setAppDataSaveStatus('failed', false);
    console.warn(
      'Failed to validate local Turn Supervisor OS data. Preserving the stored payload and blocking replacement writes.',
      error,
    );
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

export const saveAppData = (data: AppData) => {
  if (appDataLoadBlocked) {
    console.warn('Turn Supervisor OS data was not saved because the existing local payload failed validation.');
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applyActivityLogRetention(data)));
    return true;
  } catch (error) {
    console.warn('Failed to save Turn Supervisor OS data.', error);
    return false;
  }
};

const handleQueuedWriteState = (state: CoalescedWriteState) => {
  if (appDataLoadBlocked) {
    setAppDataSaveStatus('failed', false);
    return;
  }
  if (state === 'saved') {
    setAppDataSaveStatus('saved', false);
    return;
  }

  if (state === 'failed' || appDataSaveStatus.state === 'failed') {
    setAppDataSaveStatus('failed', appDataWriter.hasPending());
    return;
  }

  setAppDataSaveStatus('pending', appDataWriter.hasPending());
};

const appDataWriter: CoalescedWriter<AppData> = createCoalescedWriter(
  saveAppData,
  APP_DATA_SAVE_INTERVAL_MS,
  undefined,
  handleQueuedWriteState,
);

export const retryPendingAppDataSave = () => {
  if (appDataLoadBlocked) {
    return false;
  }
  if (!appDataWriter.hasPending()) {
    return false;
  }
  return appDataWriter.flush();
};

export const persistAppDataNow = (data: AppData) => {
  const saved = saveAppData(data);
  if (saved) {
    appDataWriter.cancel();
    setAppDataSaveStatus('saved', false);
    return true;
  }

  setAppDataSaveStatus('failed', appDataWriter.hasPending());
  return false;
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
  const rememberedAccountCleared = clearLastAuthenticatedUserId();
  let recordsCleared = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    recordsCleared = !hasStoredAppData();
    if (recordsCleared) {
      appDataLoadBlocked = false;
      setAppDataSaveStatus('saved', false);
    }
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
  return ownerCleared && rememberedAccountCleared && recordsCleared && photosCleared;
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

  const saveStatus = useAppDataSaveStatus();
  const retrySave = useCallback(() => retryPendingAppDataSave(), []);

  return useMemo(
    () => ({ data, setData, hasStoredData, retrySave, saveStatus }),
    [data, hasStoredData, retrySave, saveStatus, setData],
  );
};
