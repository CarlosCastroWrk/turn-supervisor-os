export interface FieldDraftStorage {
  readonly length: number;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

interface StoredFieldDraft {
  baseValue: string;
  draftValue: string;
}

const FIELD_DRAFT_PREFIX = 'turn-supervisor-os:field-draft:';

export const createFieldDraftStore = (storage: FieldDraftStorage) => {
  const storageKey = (draftKey: string) => `${FIELD_DRAFT_PREFIX}${draftKey}`;

  return {
    read(draftKey: string, currentValue: string) {
      const key = storageKey(draftKey);
      try {
        const raw = storage.getItem(key);
        if (!raw) {
          return undefined;
        }

        const stored = JSON.parse(raw) as Partial<StoredFieldDraft>;
        if (
          typeof stored.baseValue !== 'string' ||
          typeof stored.draftValue !== 'string' ||
          stored.baseValue !== currentValue
        ) {
          storage.removeItem(key);
          return undefined;
        }

        return stored.draftValue;
      } catch {
        try {
          storage.removeItem(key);
        } catch {
          // Session draft recovery is best-effort; AppData remains authoritative.
        }
        return undefined;
      }
    },
    write(draftKey: string, baseValue: string, draftValue: string) {
      try {
        storage.setItem(storageKey(draftKey), JSON.stringify({ baseValue, draftValue } satisfies StoredFieldDraft));
        return true;
      } catch {
        return false;
      }
    },
    clear(draftKey: string) {
      try {
        storage.removeItem(storageKey(draftKey));
      } catch {
        // Private browsing can reject session storage; the in-memory draft still works.
      }
    },
    clearAll() {
      try {
        const keys: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(FIELD_DRAFT_PREFIX)) {
            keys.push(key);
          }
        }
        keys.forEach((key) => storage.removeItem(key));
        return keys.length;
      } catch {
        return 0;
      }
    },
  };
};
