import type { AppData } from '../../types';
import type {
  ProjectActivationDraft,
  ProjectConfiguration,
  PropertyContact,
  TrackAProject,
  TrackASetupCrew,
  TrackASetupUnit,
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

const personalProjectId = (activatedAt: string) =>
  `project-personal-${activatedAt.replace(/[^0-9A-Za-z]/g, '')}`;

const existingSetupCrews = (
  data: Readonly<AppData>,
  projectId: string,
): readonly TrackASetupCrew[] => data.crewMembers
  .filter((crew) =>
    crew.projectId === projectId
    && (crew.trade === 'Painter' || crew.trade === 'Cleaner'))
  .map((crew) => ({
    active: crew.active,
    id: crew.id,
    name: crew.name,
    phone: crew.phone || undefined,
    projectId,
    trade: crew.trade === 'Painter' ? 'paint' : 'clean',
  }));

const existingSetupUnits = (
  data: Readonly<AppData>,
  projectId: string,
): readonly TrackASetupUnit[] => {
  const buildingNames = new Map(
    data.buildings
      .filter((building) => building.projectId === projectId)
      .map((building) => [building.id, building.name]),
  );
  const floorNames = new Map(
    data.floors
      .filter((floor) => buildingNames.has(floor.buildingId))
      .map((floor) => [floor.id, floor.name]),
  );
  return data.units
    .filter((unit) => unit.projectId === projectId)
    .map((unit) => ({
      building: buildingNames.get(unit.buildingId) ?? 'Building',
      floor: floorNames.get(unit.floorId) ?? 'Floor',
      id: unit.id,
      projectId,
      unitNumber: unit.unitNumber,
      unitType: Math.min(5, Math.max(1, unit.bedCount)) as 1 | 2 | 3 | 4 | 5,
    }));
};

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

  const startsFromDemo = project.mode === 'demo';
  const projectId = startsFromDemo ? personalProjectId(activatedAt) : project.id;
  const draftProject: TrackAProject = startsFromDemo
    ? {
        aiBudgetUsd: project.aiBudgetUsd,
        createdAt: activatedAt,
        endDate: '',
        estimatedBeds: 0,
        estimatedBuildings: 0,
        estimatedCommonAreas: 0,
        estimatedUnits: 0,
        id: projectId,
        location: '',
        mode: 'real',
        name: '',
        notes: '',
        projectManagerName: '',
        propertyName: '',
        startDate: '',
        supervisorName: activatedBy,
        updatedAt: activatedAt,
      }
    : structuredClone(project) as TrackAProject;
  const existingConfiguration = startsFromDemo ? undefined : project.fieldConfiguration;
  const existingContacts = startsFromDemo ? [] : projectContacts(data, projectId);
  const fallbackContact: PropertyContact = {
    createdAt: activatedAt,
    id: `property-contact:${projectId}:primary`,
    isPrimary: true,
    name: draftProject.projectManagerName?.trim() ?? '',
    projectId,
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
          clean: startsFromDemo ? [] : defaultCrewIds(data, projectId, 'Cleaner'),
          paint: startsFromDemo ? [] : defaultCrewIds(data, projectId, 'Painter'),
        },
        defaultPropertyContactId,
        // Sensible field defaults so first-time setup never blocks on the
        // schedule step; Los can adjust them any time.
        defaultWalkthroughScheduleWording: 'Walkthrough at 16:00',
        defaultWorkingHoursWording: 'Work 08:00\u201319:00',
        enabledTrades: { clean: true, paint: true },
        permissions: safePermissions,
        projectId,
        role: 'turn-supervisor',
        status: 'active',
        version: 1,
      };

  return {
    configuration,
    confirmOverwrite: false,
    contacts,
    crews: startsFromDemo ? [] : existingSetupCrews(data, projectId),
    project: draftProject,
    units: startsFromDemo ? [] : existingSetupUnits(data, projectId),
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
