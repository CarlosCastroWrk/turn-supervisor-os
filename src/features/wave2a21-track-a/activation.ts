import { z } from 'zod';
import type { FieldEvent } from '../../types';
import type {
  PreparedProjectActivation,
  ProjectActivationDraft,
  ProjectActivationPersistenceCallback,
  ProjectActivationPersistenceResult,
  ProjectActivationPreparationResult,
  PropertyContact,
  TrackAAppData,
  TrackAProject,
} from './contracts';

const nonEmpty = (value: string) => value.trim().length > 0;
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const offsetIsoTimestamp = z.iso.datetime({ offset: true });

const stableJson = (value: unknown) => JSON.stringify(value, (_key, candidate) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
  return Object.fromEntries(
    Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)),
  );
});

const activationFingerprint = (
  project: TrackAProject,
  contacts: readonly PropertyContact[],
) => stableJson({
  configuration: project.fieldConfiguration,
  contacts: [...contacts].sort((left, right) => left.id.localeCompare(right.id)),
  project: {
    aiBudgetUsd: project.aiBudgetUsd,
    endDate: project.endDate,
    estimatedBeds: project.estimatedBeds,
    estimatedBuildings: project.estimatedBuildings,
    estimatedCommonAreas: project.estimatedCommonAreas,
    estimatedUnits: project.estimatedUnits,
    id: project.id,
    location: project.location,
    mode: project.mode,
    name: project.name,
    notes: project.notes,
    projectManagerName: project.projectManagerName,
    propertyName: project.propertyName,
    startDate: project.startDate,
    supervisorName: project.supervisorName,
  },
});

const validateProject = (project: TrackAProject): readonly string[] => {
  const errors: string[] = [];
  if (!nonEmpty(project.id)) errors.push('Project ID is required.');
  if (!nonEmpty(project.name)) errors.push('Project name is required.');
  if (!nonEmpty(project.propertyName)) errors.push('Property name is required.');
  if (!nonEmpty(project.location)) errors.push('Property location is required.');
  if (!nonEmpty(project.startDate) || !nonEmpty(project.endDate)) {
    errors.push('Project start and end dates are required.');
  } else if (project.startDate > project.endDate) {
    errors.push('Project start date cannot be after the end date.');
  }
  if (!nonEmpty(project.supervisorName)) errors.push('Supervisor name is required.');
  if (project.mode !== 'demo' && project.mode !== 'real') {
    errors.push('Project mode must be demo or real.');
  }
  return errors;
};

const validateConfiguration = (draft: ProjectActivationDraft): readonly string[] => {
  const configuration = draft.configuration;
  const errors: string[] = [];
  if (configuration.version !== 1 || configuration.status !== 'active') {
    errors.push('Project configuration must be an active version 1 record.');
  }
  if (!offsetIsoTimestamp.safeParse(configuration.activatedAt).success) {
    errors.push('Activation time must be an offset-capable ISO timestamp.');
  }
  if (!nonEmpty(configuration.activatedBy)) {
    errors.push('Activation actor is required.');
  }
  if (configuration.projectId !== draft.project.id) {
    errors.push('Project configuration must match the project being activated.');
  }
  if (configuration.role !== 'turn-supervisor') {
    errors.push('Project configuration must use the Turn supervisor role.');
  }
  if (!configuration.enabledTrades.paint && !configuration.enabledTrades.clean) {
    errors.push('At least one personal field trade must be enabled.');
  }
  if (!unique(configuration.defaultCrewIdsByTrade.paint)) {
    errors.push('Default Paint crew IDs must be unique.');
  }
  if (!unique(configuration.defaultCrewIdsByTrade.clean)) {
    errors.push('Default Clean crew IDs must be unique.');
  }
  if (!nonEmpty(configuration.defaultWorkingHoursWording)) {
    errors.push('Default working hours are required.');
  }
  if (!nonEmpty(configuration.defaultWalkthroughScheduleWording)) {
    errors.push('Default walkthrough schedule is required.');
  }
  if (!nonEmpty(configuration.defaultPropertyContactId)) {
    errors.push('A default property contact is required.');
  }
  if (
    !configuration.permissions.paperTurnBoardAuthoritative
    || configuration.permissions.officialApprovals
    || configuration.permissions.payrollCalculations
    || configuration.permissions.personalAppData !== 'synthetic-or-explicitly-approved-only'
    || !['not-confirmed', 'permitted', 'prohibited'].includes(configuration.permissions.photos)
  ) {
    errors.push('The personal-app authority boundary cannot be weakened.');
  }
  return errors;
};

const validateContacts = (draft: ProjectActivationDraft): readonly string[] => {
  const errors: string[] = [];
  if (draft.contacts.length === 0) {
    return ['At least one property contact is required.'];
  }
  if (!unique(draft.contacts.map((contact) => contact.id))) {
    errors.push('Property contact IDs must be unique.');
  }
  for (const contact of draft.contacts) {
    if (contact.projectId !== draft.project.id) {
      errors.push(`Property contact ${contact.id || '(missing ID)'} belongs to another project.`);
    }
    if (!nonEmpty(contact.id) || !nonEmpty(contact.name) || !nonEmpty(contact.title)) {
      errors.push('Every property contact requires an ID, name, and title.');
    }
  }
  const primaryContacts = draft.contacts.filter((contact) => contact.isPrimary);
  if (primaryContacts.length !== 1) {
    errors.push('Exactly one property contact must be primary.');
  }
  if (!draft.contacts.some((contact) =>
    contact.id === draft.configuration.defaultPropertyContactId && contact.isPrimary)) {
    errors.push('The default property contact must be the primary project contact.');
  }
  return errors;
};

const projectActivationEvent = (draft: ProjectActivationDraft): FieldEvent => ({
  actorId: draft.configuration.activatedBy,
  actorType: 'los',
  boundary: 'personal-record',
  eventType: 'project-activated',
  id: `project-activated:${draft.project.id}:${draft.configuration.activatedAt}`,
  projectId: draft.project.id,
  recordedAt: draft.configuration.activatedAt,
  recordedBy: draft.configuration.activatedBy,
  sourceId: draft.project.id,
  sourceType: 'project-setup',
  summary: `Activated the personal Turn OS project for ${draft.project.propertyName}. The paper TurnBoard remains authoritative.`,
});

export function prepareProjectActivation(
  data: Readonly<TrackAAppData>,
  draft: ProjectActivationDraft,
): ProjectActivationPreparationResult {
  const projectErrors = validateProject(draft.project);
  if (projectErrors.length > 0) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-project',
      errors: projectErrors,
    };
  }
  const configurationErrors = validateConfiguration(draft);
  if (configurationErrors.length > 0) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-configuration',
      errors: configurationErrors,
    };
  }
  const contactErrors = validateContacts(draft);
  if (contactErrors.length > 0) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-contacts',
      errors: contactErrors,
    };
  }

  const matchingProjects = data.projects.filter((project) => project.id === draft.project.id);
  if (matchingProjects.length > 1) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-project',
      errors: ['Project activation requires exactly one existing record for a matching project ID.'],
    };
  }
  const currentContacts = (data.propertyContacts ?? []).filter(
    (contact) => contact.projectId === draft.project.id,
  );
  const existingProject = data.projects.find((project) => project.id === draft.project.id);
  const candidateProject: TrackAProject = {
    ...structuredClone(draft.project),
    createdAt: existingProject?.createdAt ?? draft.project.createdAt,
    fieldConfiguration: structuredClone(draft.configuration),
    updatedAt: draft.configuration.activatedAt,
  };
  const candidateContacts = draft.contacts.map((contact) => structuredClone(contact));
  const alreadyMatches = existingProject
    ? activationFingerprint(existingProject, currentContacts)
      === activationFingerprint(candidateProject, candidateContacts)
    : false;

  if (existingProject && !alreadyMatches && !draft.confirmOverwrite) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'overwrite-confirmation-required',
      errors: ['This project already exists. Confirm before replacing its personal setup defaults.'],
    };
  }

  const event = projectActivationEvent(draft);
  const existingEvent = data.fieldEvents.find((candidate) => candidate.id === event.id);
  if (existingEvent && stableJson(existingEvent) !== stableJson(event)) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-configuration',
      errors: ['Project activation event ID conflicts with a different durable field event.'],
    };
  }
  const eventExists = Boolean(existingEvent);
  const activeProjectMatches = data.activeProjectId === draft.project.id;
  const retry = {
    draft: structuredClone(draft),
    sourceData: structuredClone(data) as TrackAAppData,
  };
  if (alreadyMatches && eventExists && activeProjectMatches) {
    return {
      ok: true,
      stage: 'prepared',
      changed: false,
      data: structuredClone(data) as TrackAAppData,
      event,
      retry,
    };
  }

  const next = structuredClone(data) as TrackAAppData;
  const nextProjects = existingProject
    ? next.projects.map((project) =>
      project.id === candidateProject.id ? candidateProject : project)
    : [...next.projects, candidateProject];
  const retainedContacts = (next.propertyContacts ?? []).filter(
    (contact) => contact.projectId !== draft.project.id,
  );
  return {
    ok: true,
    stage: 'prepared',
    changed: true,
    data: {
      ...next,
      activeProjectId: draft.project.id,
      fieldEvents: eventExists ? next.fieldEvents : [...next.fieldEvents, event],
      projects: nextProjects,
      propertyContacts: [...retainedContacts, ...candidateContacts],
    },
    event,
    retry,
  };
}

export async function persistPreparedProjectActivation(
  prepared: PreparedProjectActivation,
  persist: ProjectActivationPersistenceCallback,
): Promise<ProjectActivationPersistenceResult> {
  let saved = false;
  try {
    saved = await persist(prepared.data);
  } catch {
    saved = false;
  }

  if (!saved) {
    return {
      ok: false,
      stage: 'persistence',
      code: 'persistence-failed',
      errors: [
        'Project activation was prepared but could not be saved. Retry from the preserved setup draft.',
      ],
      retry: prepared.retry,
    };
  }

  return {
    ok: true,
    stage: 'persisted',
    data: prepared.data,
    event: prepared.event,
    receipt: {
      acknowledgement: 'durable-save-succeeded',
      activatedAt: prepared.event.recordedAt,
      changed: prepared.changed,
      eventId: prepared.event.id,
      projectId: prepared.event.projectId,
    },
  };
}
