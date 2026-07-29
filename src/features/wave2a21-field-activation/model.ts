import type { AppData } from '../../types';
import type {
  ProjectActivationDraft,
  ProjectConfiguration,
  PropertyContact,
  TrackAProject,
} from '../wave2a21-track-a';

const projectContacts = (
  data: Readonly<AppData>,
  projectId: string,
): readonly PropertyContact[] => (
  (data.propertyContacts ?? [])
    .filter((contact) => contact.projectId === projectId)
    .map((contact) => structuredClone(contact))
);

const defaultCrewIds = (
  data: Readonly<AppData>,
  projectId: string,
  trade: 'Cleaner' | 'Painter',
) => data.crewMembers
  .filter((crew) =>
    crew.projectId === projectId
    && crew.active
    && crew.trade === trade)
  .map((crew) => crew.id);

const safePermissions: ProjectConfiguration['permissions'] = {
  officialApprovals: false,
  paperTurnBoardAuthoritative: true,
  payrollCalculations: false,
  personalAppData: 'synthetic-or-explicitly-approved-only',
  photos: 'not-confirmed',
};

const normalizedPrimaryContacts = (
  contacts: readonly PropertyContact[],
  defaultContactId?: string,
) => {
  const selectedId = contacts.some((contact) => contact.id === defaultContactId)
    ? defaultContactId
    : contacts.find((contact) => contact.isPrimary)?.id
      ?? contacts[0]?.id;
  return contacts.map((contact) => ({
    ...structuredClone(contact),
    isPrimary: contact.id === selectedId,
  }));
};

export function createProjectActivationDraft(
  data: Readonly<AppData>,
  activatedAt: string,
  activatedBy: string,
): ProjectActivationDraft {
  const project = data.projects.find((candidate) => candidate.id === data.activeProjectId);
  if (!project) {
    throw new Error('The active personal project is unavailable.');
  }

  const existingConfiguration = project.fieldConfiguration;
  const existingContacts = projectContacts(data, project.id);
  const fallbackContact: PropertyContact = {
    createdAt: activatedAt,
    id: `property-contact:${project.id}:primary`,
    isPrimary: true,
    name: project.projectManagerName?.trim() ?? '',
    projectId: project.id,
    title: 'Property contact',
    updatedAt: activatedAt,
  };
  const contacts = normalizedPrimaryContacts(
    existingContacts.length > 0 ? existingContacts : [fallbackContact],
    existingConfiguration?.defaultPropertyContactId,
  );
  const defaultPropertyContactId = contacts.find((contact) => contact.isPrimary)?.id ?? '';
  const configuration: ProjectConfiguration = existingConfiguration
    ? {
        ...structuredClone(existingConfiguration),
        activatedAt,
        activatedBy,
        defaultPropertyContactId,
        permissions: safePermissions,
      }
    : {
        activatedAt,
        activatedBy,
        defaultCrewIdsByTrade: {
          clean: defaultCrewIds(data, project.id, 'Cleaner'),
          paint: defaultCrewIds(data, project.id, 'Painter'),
        },
        defaultPropertyContactId,
        defaultWalkthroughScheduleWording: '',
        defaultWorkingHoursWording: '',
        enabledTrades: { clean: true, paint: true },
        permissions: safePermissions,
        projectId: project.id,
        role: 'turn-supervisor',
        status: 'active',
        version: 1,
      };

  return {
    configuration,
    confirmOverwrite: false,
    contacts,
    project: structuredClone(project) as TrackAProject,
  };
}

export function prepareDraftForActivationAttempt(
  draft: ProjectActivationDraft,
  activatedAt: string,
  activatedBy: string,
): ProjectActivationDraft {
  return {
    ...structuredClone(draft),
    configuration: {
      ...structuredClone(draft.configuration),
      activatedAt,
      activatedBy,
      permissions: safePermissions,
    },
    contacts: draft.contacts.map((contact) => ({
      ...structuredClone(contact),
      updatedAt: activatedAt,
    })),
    project: {
      ...structuredClone(draft.project),
      updatedAt: activatedAt,
    },
  };
}

export function addProjectContact(
  draft: ProjectActivationDraft,
  contactId: string,
  recordedAt: string,
): ProjectActivationDraft {
  const isPrimary = draft.contacts.length === 0;
  const contact: PropertyContact = {
    createdAt: recordedAt,
    id: contactId,
    isPrimary,
    name: '',
    projectId: draft.project.id,
    title: '',
    updatedAt: recordedAt,
  };
  return {
    ...draft,
    configuration: isPrimary
      ? { ...draft.configuration, defaultPropertyContactId: contactId }
      : draft.configuration,
    contacts: [...draft.contacts, contact],
  };
}

export function removeProjectContact(
  draft: ProjectActivationDraft,
  contactId: string,
): ProjectActivationDraft {
  const retained = draft.contacts.filter((contact) => contact.id !== contactId);
  const removedWasPrimary = draft.contacts.some((contact) =>
    contact.id === contactId && contact.isPrimary);
  const nextPrimaryId = removedWasPrimary
    ? retained[0]?.id ?? ''
    : retained.find((contact) => contact.isPrimary)?.id
      ?? retained[0]?.id
      ?? '';
  return {
    ...draft,
    configuration: {
      ...draft.configuration,
      defaultPropertyContactId: nextPrimaryId,
    },
    contacts: retained.map((contact) => ({
      ...contact,
      isPrimary: contact.id === nextPrimaryId,
    })),
  };
}
