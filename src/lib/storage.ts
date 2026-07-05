import { useEffect, useMemo, useState } from 'react';
import { seedData } from '../data/seed';
import type { AppData } from '../types';

const STORAGE_KEY = 'turn-supervisor-os:v0.1';

export const hasStoredAppData = () => Boolean(window.localStorage.getItem(STORAGE_KEY));

export const loadAppData = (): AppData => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return seedData;
    }

    return { ...seedData, ...JSON.parse(stored) } as AppData;
  } catch (error) {
    console.warn('Failed to load local Turn Supervisor OS data. Falling back to seed data.', error);
    return seedData;
  }
};

let storageFailureWarned = false;

export const saveAppData = (data: AppData) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageFailureWarned = false;
  } catch (error) {
    console.warn('Failed to save Turn Supervisor OS data.', error);
    if (!storageFailureWarned) {
      storageFailureWarned = true;
      window.alert(
        'Saving failed — browser storage is likely full. Export a JSON backup now (Export tab) and remove old photos, or new changes will be lost.',
      );
    }
  }
};

export const clearAppData = () => {
  window.localStorage.removeItem(STORAGE_KEY);
};

export const usePersistentAppData = () => {
  const [hasStoredData, setHasStoredData] = useState(() => hasStoredAppData());
  const [data, setData] = useState<AppData>(() => loadAppData());

  useEffect(() => {
    saveAppData(data);
    setHasStoredData(true);
  }, [data]);

  return useMemo(() => ({ data, setData, hasStoredData }), [data, hasStoredData]);
};
