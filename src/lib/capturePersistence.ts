import { persistAppDataNow } from './storage';
import type { AppData } from '../types';

export type CapturePersistenceResult =
  | { ok: true; data: AppData }
  | { ok: false; data: AppData };

export function persistCaptureSnapshot(
  current: AppData,
  buildNext: (latest: AppData) => AppData,
  persist: (data: AppData) => boolean = persistAppDataNow,
): CapturePersistenceResult {
  const next = buildNext(current);
  if (!persist(next)) {
    return { ok: false, data: current };
  }
  return { ok: true, data: next };
}
