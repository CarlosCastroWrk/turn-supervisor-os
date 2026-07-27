const CACHE_OWNER_KEY = 'turn-supervisor-os:cache-owner:v1';
const LAST_AUTHENTICATED_USER_KEY = 'turn-supervisor-os:last-authenticated-user:v1';

export interface SyncIdentity {
  generation: number;
  userId: string;
}

export class SyncSessionChangedError extends Error {
  constructor() {
    super('The Supabase account changed while sync was running.');
    this.name = 'SyncSessionChangedError';
  }
}

export const getLocalCacheOwner = () => {
  try {
    return window.localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
};

export const setLocalCacheOwner = (userId: string) => {
  try {
    window.localStorage.setItem(CACHE_OWNER_KEY, userId);
    return window.localStorage.getItem(CACHE_OWNER_KEY) === userId;
  } catch {
    return false;
  }
};

export const clearLocalCacheOwner = () => {
  try {
    window.localStorage.removeItem(CACHE_OWNER_KEY);
    return window.localStorage.getItem(CACHE_OWNER_KEY) === null;
  } catch {
    return false;
  }
};

export const getLastAuthenticatedUserId = () => {
  try {
    return window.localStorage.getItem(LAST_AUTHENTICATED_USER_KEY);
  } catch {
    return null;
  }
};

export const setLastAuthenticatedUserId = (userId: string) => {
  try {
    window.localStorage.setItem(LAST_AUTHENTICATED_USER_KEY, userId);
    return window.localStorage.getItem(LAST_AUTHENTICATED_USER_KEY) === userId;
  } catch {
    return false;
  }
};

export const clearLastAuthenticatedUserId = () => {
  try {
    window.localStorage.removeItem(LAST_AUTHENTICATED_USER_KEY);
    return window.localStorage.getItem(LAST_AUTHENTICATED_USER_KEY) === null;
  } catch {
    return false;
  }
};

export const cacheBelongsToUser = (userId: string) => getLocalCacheOwner() === userId;

export const assertSyncIdentity = (
  expected: SyncIdentity,
  currentUserId: string | null,
  currentGeneration: number,
) => {
  if (
    currentUserId !== expected.userId ||
    currentGeneration !== expected.generation ||
    !cacheBelongsToUser(expected.userId)
  ) {
    throw new SyncSessionChangedError();
  }
};
