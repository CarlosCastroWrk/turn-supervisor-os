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
import {
  parseJsonBackup,
  parseStoredAppData,
  StoredAppDataValidationError,
  type StoredAppDataValidationIssue,
} from './backups';
import { createCoalescedWriter } from './coalescedWriter';
import { normalizeAppData } from './dataMigrations';
import { createFieldDraftStore } from './fieldDraft';
import { applyLegacyPhotoMigration, clearPhotoBlobs, migrateLegacyPhotoPayloads } from './photoStorage';
import {
  clearLastAuthenticatedUserId,
  clearLocalCacheOwner,
} from './supabase/cacheOwnership';
import type { CoalescedWriter, CoalescedWriteState } from './coalescedWriter';

export const APP_DATA_STORAGE_KEY = 'turn-supervisor-os:v0.1';
const STORAGE_KEY = APP_DATA_STORAGE_KEY;
const CORRUPT_STORAGE_KEY = `${STORAGE_KEY}:corrupt`;
export const APP_DATA_SAVE_INTERVAL_MS = 500;

// Practical localStorage ceiling on iOS Safari is ~5 MB measured in UTF-16
// characters; keep a safety margin so the warning fires well before writes
// start throwing mid-field-day. (The scale test guards backups under 4.5M chars.)
const STORAGE_BUDGET_CHARS = 4_500_000;

export type StorageUsageLevel = 'ok' | 'watch' | 'critical';

export interface StorageUsageEstimate {
  characters: number;
  approxMb: number;
  percentUsed: number;
  level: StorageUsageLevel;
}

// Reads how much of the on-device budget the app is using so the Storage screen
// can warn Los BEFORE the ceiling is hit — never discover the limit by writes
// silently failing. Counts every key so drafts and any corrupt snapshot count too.
export const estimateStorageUsage = (): StorageUsageEstimate | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    let characters = 0;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      characters += key.length + (window.localStorage.getItem(key)?.length ?? 0);
    }
    const percentUsed = Math.min(100, Math.round((characters / STORAGE_BUDGET_CHARS) * 100));
    const level: StorageUsageLevel = percentUsed >= 85 ? 'critical' : percentUsed >= 70 ? 'watch' : 'ok';
    return {
      characters,
      approxMb: Math.round((characters / 1_000_000) * 10) / 10,
      percentUsed,
      level,
    };
  } catch {
    return null;
  }
};

export interface AppDataSaveStatus {
  state: 'saved' | 'pending' | 'failed';
  canRetry: boolean;
}

const saveStatusListeners = new Set<() => void>();
let appDataSaveStatus: AppDataSaveStatus = { state: 'saved', canRetry: false };
let appDataLoadBlocked = false;

export interface AppDataRecoveryState {
  readonly capturedAt: string;
  readonly issues: readonly StoredAppDataValidationIssue[];
  readonly originalKey: string;
  readonly rawPayload: string;
}

export type BrowserStoragePersistence =
  | 'checking'
  | 'persistent'
  | 'best-effort'
  | 'unsupported'
  | 'failed';

interface AppDataLoadResult {
  readonly data: AppData;
  readonly hasStoredData: boolean;
  readonly recovery: AppDataRecoveryState | null;
  readonly warnings: readonly StoredAppDataValidationIssue[];
}

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

export const hasStoredAppData = () => {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
};

export const loadAppDataResult = (): AppDataLoadResult => {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      appDataLoadBlocked = false;
      setAppDataSaveStatus('saved', false);
      return {
        data: normalizeAppData(seedData),
        hasStoredData: false,
        recovery: null,
        warnings: [],
      };
    }

    const parsed = parseStoredAppData(stored);
    appDataLoadBlocked = false;
    setAppDataSaveStatus('saved', false);
    return {
      data: parsed.data,
      hasStoredData: true,
      recovery: null,
      warnings: parsed.warnings,
    };
  } catch (error) {
    appDataLoadBlocked = true;
    setAppDataSaveStatus('failed', false);
    console.warn(
      'Failed to validate local Turn Supervisor OS data. Preserving the stored payload and blocking replacement writes.',
      error,
    );
    if (stored !== null) {
      try {
        window.localStorage.setItem(CORRUPT_STORAGE_KEY, stored);
      } catch (preserveError) {
        console.warn('Failed to preserve corrupt Turn Supervisor OS data.', preserveError);
      }
    }
    const issues = error instanceof StoredAppDataValidationError
      ? error.issues
      : [{
          message: error instanceof Error ? error.message : 'Browser storage could not be read.',
          path: 'browser storage',
        }];
    return {
      data: normalizeAppData(seedData),
      hasStoredData: Boolean(stored),
      recovery: {
        capturedAt: new Date().toISOString(),
        issues,
        originalKey: STORAGE_KEY,
        rawPayload: stored ?? '',
      },
      warnings: [],
    };
  }
};

export const loadAppData = (): AppData => loadAppDataResult().data;

// Browser storage (~5MB in Safari) is shared by the operational ledger AND
// every convenience cache. When a save hits the quota, the caches are the
// sacrifice — chat history and prefills go, the field record NEVER does.
const CONVENIENCE_KEYS = [
  'turn-os:chat-threads-v1',
  'turn-os:chat-thread',
  'turn-os:intake-prefill',
  'turn-os:intake-memo',
];

// Emergency space to reclaim, in order of least regret, when a real save hits
// the quota. Chat/prefill caches first; then the ':corrupt' snapshot — a FULL
// duplicate of the ledger left by a past bad-load, which permanently eats
// ~half the remaining budget and is redundant (the loader hands the raw
// payload to Recovery Mode directly). The field ledger itself is NEVER here.
const freeEmergencyStorage = (): boolean => {
  let freed = false;
  for (const key of [...CONVENIENCE_KEYS, CORRUPT_STORAGE_KEY]) {
    try {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        freed = true;
      }
    } catch { /* keep trying the rest */ }
  }
  return freed;
};

// True after a save was refused for lack of space AND the emergency free-up
// couldn't rescue it — the host raises an unmissable, non-dismissable prompt
// off this, because a silently dropped tap is a silently wrong pay count.
let lastSaveHitQuota = false;
export const didLastSaveHitQuota = () => lastSaveHitQuota;

export const saveAppData = (data: AppData) => {
  if (appDataLoadBlocked) {
    console.warn('Turn Supervisor OS data was not saved because the existing local payload failed validation.');
    return false;
  }
  const serialized = JSON.stringify(applyActivityLogRetention(data));
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    lastSaveHitQuota = false;
    return true;
  } catch (error) {
    console.warn('Failed to save Turn Supervisor OS data — freeing space and retrying.', error);
    if (freeEmergencyStorage()) {
      try {
        window.localStorage.setItem(STORAGE_KEY, serialized);
        console.warn('Save succeeded after freeing caches/corrupt snapshot.');
        lastSaveHitQuota = false;
        return true;
      } catch (retryError) {
        console.warn('Save still failing after freeing space.', retryError);
      }
    }
    lastSaveHitQuota = true;
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

export const restoreAppDataNow = (data: AppData) => {
  const retained = applyActivityLogRetention(data);
  try {
    const serialized = JSON.stringify(retained);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    const readback = window.localStorage.getItem(STORAGE_KEY);
    if (readback !== serialized) {
      throw new Error('Saved data did not match browser-storage readback.');
    }
    parseJsonBackup(readback);
    appDataWriter.cancel();
    appDataLoadBlocked = false;
    setAppDataSaveStatus('saved', false);
    return true;
  } catch (error) {
    appDataLoadBlocked = true;
    setAppDataSaveStatus('failed', false);
    console.warn('Restored data could not be durably verified.', error);
    return false;
  }
};

export const prepareAppDataUpdate = (
  current: AppData,
  update: SetStateAction<AppData>,
) => applyActivityLogRetention(
  typeof update === 'function' ? update(current) : update,
);

export type AppDataImmediateCommitResult =
  | { readonly ok: true; readonly data: AppData }
  | { readonly ok: false; readonly data: AppData };

export const commitAppDataUpdateNow = (
  current: AppData,
  update: SetStateAction<AppData>,
  persist: (data: AppData) => boolean = persistAppDataNow,
): AppDataImmediateCommitResult => {
  const next = prepareAppDataUpdate(current, update);
  try {
    return persist(next)
      ? { data: next, ok: true }
      : { data: current, ok: false };
  } catch {
    return { data: current, ok: false };
  }
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
    window.localStorage.removeItem(CORRUPT_STORAGE_KEY);
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
  const [initialLoad] = useState(() => loadAppDataResult());
  const [hasStoredData, setHasStoredData] = useState(initialLoad.hasStoredData);
  const [data, setStoredData] = useState<AppData>(initialLoad.data);
  const [recovery, setRecovery] = useState<AppDataRecoveryState | null>(
    initialLoad.recovery,
  );
  const [loadWarnings, setLoadWarnings] = useState(initialLoad.warnings);
  const [storagePersistence, setStoragePersistence] =
    useState<BrowserStoragePersistence>('checking');
  const dataRef = useRef(data);
  const initiallyLoadedDataRef = useRef(data);
  const immediatelyPersistedDataRef = useRef<AppData | null>(null);
  const migrationInFlight = useRef(false);
  const attemptedLegacyPhotoIds = useRef(new Set<string>());
  const setData = useCallback<Dispatch<SetStateAction<AppData>>>((update) => {
    setStoredData((current) => {
      const next = prepareAppDataUpdate(current, update);
      dataRef.current = next;
      return next;
    });
  }, []);
  const commitDataNow = useCallback((
    update: SetStateAction<AppData>,
  ) => {
    const result = commitAppDataUpdateNow(dataRef.current, update);
    if (!result.ok) return false;

    dataRef.current = result.data;
    immediatelyPersistedDataRef.current = result.data;
    setStoredData(result.data);
    setHasStoredData(true);
    return true;
  }, []);
  const restoreDataNow = useCallback((restoredData: AppData) => {
    if (!restoreAppDataNow(restoredData)) return false;
    dataRef.current = restoredData;
    immediatelyPersistedDataRef.current = restoredData;
    setStoredData(restoredData);
    setHasStoredData(true);
    setLoadWarnings([]);
    setRecovery(null);
    return true;
  }, []);

  const resetToDemo = useCallback(async () => {
    if (!await clearAppData()) return false;
    const demo = normalizeAppData(seedData);
    if (!restoreAppDataNow(demo)) return false;
    dataRef.current = demo;
    immediatelyPersistedDataRef.current = demo;
    setStoredData(demo);
    setHasStoredData(true);
    setLoadWarnings([]);
    setRecovery(null);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storageManager = navigator.storage;
    if (!storageManager?.persist) {
      setStoragePersistence('unsupported');
      return;
    }
    void storageManager.persist()
      .then((persistent) => {
        if (!cancelled) {
          setStoragePersistence(persistent ? 'persistent' : 'best-effort');
        }
      })
      .catch(() => {
        if (!cancelled) setStoragePersistence('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (recovery) return;
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
  }, [data.photoNotes, recovery, setData]);

  useEffect(() => {
    if (recovery) return;
    dataRef.current = data;
    if (loadWarnings.length > 0 && data === initiallyLoadedDataRef.current) {
      return;
    }
    if (immediatelyPersistedDataRef.current === data) {
      immediatelyPersistedDataRef.current = null;
      setHasStoredData(true);
      return;
    }
    immediatelyPersistedDataRef.current = null;
    appDataWriter.schedule(data);
    setHasStoredData(true);
  }, [data, loadWarnings.length, recovery]);

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
    () => ({
      commitDataNow,
      data,
      setData,
      hasStoredData,
      loadWarnings,
      recovery,
      resetToDemo,
      restoreDataNow,
      retrySave,
      saveStatus,
      storagePersistence,
    }),
    [
      commitDataNow,
      data,
      hasStoredData,
      loadWarnings,
      recovery,
      resetToDemo,
      restoreDataNow,
      retrySave,
      saveStatus,
      setData,
      storagePersistence,
    ],
  );
};
