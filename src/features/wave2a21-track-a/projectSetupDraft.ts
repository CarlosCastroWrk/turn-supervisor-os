import type { ProjectActivationDraft } from './contracts';
import { clampProjectSetupStep } from './projectSetup';

export interface ProjectSetupDraftStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export interface StoredProjectSetupDraft {
  readonly draft: ProjectActivationDraft;
  readonly step: number;
  readonly version: 1;
}

const SETUP_DRAFT_PREFIX = 'turn-supervisor-os:project-setup-draft:';

const storageKey = (ownerKey: string) =>
  `${SETUP_DRAFT_PREFIX}${encodeURIComponent(ownerKey)}`;

const isProjectActivationDraft = (
  value: unknown,
): value is ProjectActivationDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ProjectActivationDraft>;
  return Boolean(
    draft.project
      && typeof draft.project === 'object'
      && typeof draft.project.id === 'string'
      && draft.project.id.trim()
      && Array.isArray(draft.contacts)
      && draft.configuration
      && typeof draft.configuration === 'object',
  );
};

export const createProjectSetupDraftStore = (
  storage: ProjectSetupDraftStorage,
) => ({
  clear(ownerKey: string) {
    try {
      storage.removeItem(storageKey(ownerKey));
    } catch {
      // The in-memory Setup draft remains usable when browser storage is unavailable.
    }
  },
  read(ownerKey: string): StoredProjectSetupDraft | undefined {
    try {
      const raw = storage.getItem(storageKey(ownerKey));
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as Partial<StoredProjectSetupDraft>;
      if (stored.version !== 1 || !isProjectActivationDraft(stored.draft)) {
        storage.removeItem(storageKey(ownerKey));
        return undefined;
      }
      return {
        draft: stored.draft,
        step: clampProjectSetupStep(stored.step ?? 0),
        version: 1,
      };
    } catch {
      try {
        storage.removeItem(storageKey(ownerKey));
      } catch {
        // A malformed browser draft cannot block a fresh Setup flow.
      }
      return undefined;
    }
  },
  write(ownerKey: string, draft: ProjectActivationDraft, step: number) {
    try {
      storage.setItem(storageKey(ownerKey), JSON.stringify({
        draft,
        step: clampProjectSetupStep(step),
        version: 1,
      } satisfies StoredProjectSetupDraft));
      return true;
    } catch {
      return false;
    }
  },
});
