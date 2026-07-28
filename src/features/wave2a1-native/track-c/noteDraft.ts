import type { EntityId } from '../../../types';
import type { PersonalNoteSession, StoredPersonalNoteDraft } from './types';

const NOTE_DRAFT_KEY_PREFIX = 'turn-os:wave2a1:personal-note-draft';

export interface NoteDraftStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export interface PersonalNoteDraftStore {
  clear: () => void;
  hasDraft: () => boolean;
  read: () => StoredPersonalNoteDraft | null;
  save: (session: PersonalNoteSession, updatedAt?: string) => StoredPersonalNoteDraft | null;
}

export const createMemoryNoteDraftStorage = (): NoteDraftStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const memorySessionDraftStorage = createMemoryNoteDraftStorage();

const isStoredDraft = (
  value: unknown,
  projectId: EntityId,
): value is StoredPersonalNoteDraft => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredPersonalNoteDraft>;
  return (
    candidate.version === 1 &&
    candidate.projectId === projectId &&
    typeof candidate.wording === 'string' &&
    Boolean(candidate.wording.trim()) &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.unitId === undefined || typeof candidate.unitId === 'string')
  );
};

export const personalNoteDraftKey = (projectId: EntityId) =>
  `${NOTE_DRAFT_KEY_PREFIX}:${encodeURIComponent(projectId)}`;

export const createBlankPersonalNoteSession = (
  unitId?: EntityId,
): PersonalNoteSession => ({
  source: 'new',
  unitId,
  wording: '',
});

export const createPersonalNoteDraftStore = (
  storage: NoteDraftStorage | null,
  projectId: EntityId,
): PersonalNoteDraftStore => {
  const key = personalNoteDraftKey(projectId);

  const clear = () => {
    try {
      storage?.removeItem(key);
    } catch {
      // Session drafts are best-effort and never affect AppData.
    }
  };

  const read = (): StoredPersonalNoteDraft | null => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (isStoredDraft(parsed, projectId)) return parsed;
    } catch {
      // An invalid session draft is disposable and must never block a new note.
    }
    clear();
    return null;
  };

  return {
    clear,
    hasDraft: () => read() !== null,
    read,
    save: (session, updatedAt = new Date().toISOString()) => {
      if (!storage || !session.wording.trim()) {
        if (session.source === 'resumed') clear();
        return null;
      }
      const draft: StoredPersonalNoteDraft = {
        version: 1,
        projectId,
        wording: session.wording,
        updatedAt,
        ...(session.unitId ? { unitId: session.unitId } : {}),
      };
      try {
        storage.setItem(key, JSON.stringify(draft));
        return draft;
      } catch {
        return null;
      }
    },
  };
};

export const resumePersonalNoteSession = (
  store: PersonalNoteDraftStore,
): PersonalNoteSession | null => {
  const draft = store.read();
  if (!draft) return null;
  return {
    source: 'resumed',
    unitId: draft.unitId,
    wording: draft.wording,
  };
};

export const browserSessionDraftStorage = (): NoteDraftStorage | null => {
  if (typeof window === 'undefined') return memorySessionDraftStorage;
  try {
    const session = window.sessionStorage;
    return {
      getItem: (key) => {
        try {
          return session.getItem(key) ?? memorySessionDraftStorage.getItem(key);
        } catch {
          return memorySessionDraftStorage.getItem(key);
        }
      },
      removeItem: (key) => {
        memorySessionDraftStorage.removeItem(key);
        try {
          session.removeItem(key);
        } catch {
          // The in-memory session copy was still cleared.
        }
      },
      setItem: (key, value) => {
        try {
          session.setItem(key, value);
          memorySessionDraftStorage.removeItem(key);
        } catch {
          memorySessionDraftStorage.setItem(key, value);
        }
      },
    };
  } catch {
    return memorySessionDraftStorage;
  }
};
