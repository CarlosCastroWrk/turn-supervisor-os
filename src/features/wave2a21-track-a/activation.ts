import { z } from 'zod';
import type {
  Building,
  CrewMember,
  FieldEvent,
  Floor,
  Unit,
} from '../../types';
import type {
  PreparedProjectActivation,
  ProjectActivationDraft,
  ProjectActivationPersistenceCallback,
  ProjectActivationPersistenceResult,
  ProjectActivationPreparationResult,
  PropertyContact,
  TrackAAppData,
  TrackAProject,
  TrackASetupCrew,
  TrackASetupUnit,
} from './contracts';
import { PROPERTY_CONTACT_ROLES } from './contracts';
import { resolveProjectDefaultSchedule } from './phase2Workflow';

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
  crews: readonly TrackASetupCrew[],
  units: readonly TrackASetupUnit[],
) => stableJson({
  configuration: project.fieldConfiguration,
  contacts: [...contacts].sort((left, right) => left.id.localeCompare(right.id)),
  crews: [...crews].sort((left, right) => left.id.localeCompare(right.id)),
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
  units: [...units].sort((left, right) => left.id.localeCompare(right.id)),
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
  const schedule = resolveProjectDefaultSchedule(configuration);
  if (!schedule.workStartTime || !schedule.workEndTime) {
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
    if (contact.role && !PROPERTY_CONTACT_ROLES.includes(contact.role)) {
      errors.push(`Property contact ${contact.id} has an unsupported role.`);
    }
  }
  const primaryContacts = draft.contacts.filter((contact) => contact.isPrimary);
  if (primaryContacts.length !== 1) {
    errors.push('Exactly one property contact must be primary.');
  }
  if (!draft.contacts.some((contact) =>
    contact.id === draft.configuration.defaultPropertyContactId
    && contact.isPrimary
    && contact.activeForProject !== false)) {
    errors.push('The default property contact must be active and primary for this project.');
  }
  return errors;
};

const validateCrews = (draft: ProjectActivationDraft): readonly string[] => {
  if (draft.crews === undefined) return [];
  const crews = draft.crews ?? [];
  const errors: string[] = [];
  if (!unique(crews.map((crew) => crew.id))) {
    errors.push('Crew IDs must be unique.');
  }
  for (const crew of crews) {
    if (crew.projectId !== draft.project.id) {
      errors.push(`Crew ${crew.id || '(missing ID)'} belongs to another project.`);
    }
    if (!nonEmpty(crew.id) || !nonEmpty(crew.name)) {
      errors.push('Every crew requires an ID and name.');
    }
  }
  for (const trade of ['paint', 'clean'] as const) {
    if (
      draft.configuration.enabledTrades[trade]
      && !crews.some((crew) => crew.active && crew.trade === trade)
    ) {
      errors.push(`At least one active ${trade === 'paint' ? 'Paint' : 'Clean'} crew is required.`);
    }
    const configuredIds = draft.configuration.defaultCrewIdsByTrade[trade];
    if (configuredIds.some((crewId) =>
      !crews.some((crew) =>
        crew.id === crewId && crew.active && crew.trade === trade))) {
      errors.push(`Default ${trade === 'paint' ? 'Paint' : 'Clean'} crews must match active setup crews.`);
    }
  }
  return errors;
};

const validateUnits = (draft: ProjectActivationDraft): readonly string[] => {
  if (draft.units === undefined) return [];
  const units = draft.units ?? [];
  const errors: string[] = [];
  if (units.length === 0) {
    return ['At least one Unit is required in the property roster.'];
  }
  if (!unique(units.map((unit) => unit.id))) {
    errors.push('Unit IDs must be unique.');
  }
  if (!unique(units.map((unit) => unit.unitNumber.trim().toLocaleLowerCase()))) {
    errors.push('Unit numbers must be unique within this personal project.');
  }
  for (const unit of units) {
    if (unit.projectId !== draft.project.id) {
      errors.push(`Unit ${unit.id || '(missing ID)'} belongs to another project.`);
    }
    if (
      !nonEmpty(unit.id)
      || !nonEmpty(unit.unitNumber)
      || !nonEmpty(unit.building)
      || !nonEmpty(unit.floor)
    ) {
      errors.push('Every Unit requires an ID, number, building, and floor.');
    }
    if (![0, 1, 2, 3, 4, 5].includes(unit.unitType)) {
      // 0 = Studio (common area only).
      errors.push(`Unit ${unit.unitNumber || '(missing number)'} has an unsupported Unit type.`);
    }
  }
  return errors;
};

const setupCrewsFromData = (
  data: Readonly<TrackAAppData>,
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

const setupUnitsFromData = (
  data: Readonly<TrackAAppData>,
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
      unitType: Math.min(5, Math.max(0, unit.bedCount)) as 0 | 1 | 2 | 3 | 4 | 5,
    }));
};

const stableEntityPart = (value: string) =>
  encodeURIComponent(value.trim().toLocaleLowerCase());

const candidateSetupRecords = (
  draft: ProjectActivationDraft,
): {
  readonly buildings: readonly Building[];
  readonly crews: readonly CrewMember[];
  readonly floors: readonly Floor[];
  readonly units: readonly Unit[];
} => {
  const recordedAt = draft.configuration.activatedAt;
  const buildingByName = new Map<string, Building>();
  const floorByKey = new Map<string, Floor>();
  for (const setupUnit of draft.units ?? []) {
    const buildingKey = setupUnit.building.trim().toLocaleLowerCase();
    if (!buildingByName.has(buildingKey)) {
      buildingByName.set(buildingKey, {
        createdAt: recordedAt,
        id: `${draft.project.id}:building:${stableEntityPart(setupUnit.building)}`,
        name: setupUnit.building.trim(),
        notes: '',
        projectId: draft.project.id,
        updatedAt: recordedAt,
      });
    }
    const building = buildingByName.get(buildingKey);
    if (!building) continue;
    const floorKey = `${building.id}:${setupUnit.floor.trim().toLocaleLowerCase()}`;
    if (!floorByKey.has(floorKey)) {
      floorByKey.set(floorKey, {
        buildingId: building.id,
        createdAt: recordedAt,
        id: `${building.id}:floor:${stableEntityPart(setupUnit.floor)}`,
        name: setupUnit.floor.trim(),
        notes: '',
        updatedAt: recordedAt,
      });
    }
  }
  const units = (draft.units ?? []).map((setupUnit): Unit => {
    const building = buildingByName.get(setupUnit.building.trim().toLocaleLowerCase());
    const floor = building
      ? floorByKey.get(`${building.id}:${setupUnit.floor.trim().toLocaleLowerCase()}`)
      : undefined;
    if (!building || !floor) {
      throw new Error(`Unit ${setupUnit.unitNumber} could not resolve its building and floor.`);
    }
    return {
      assignedCrewIds: [],
      bathroomCount: setupUnit.unitType,
      bedCount: setupUnit.unitType,
      buildingId: building.id,
      cleanStatus: 'Not Started',
      createdAt: recordedAt,
      floorId: floor.id,
      flooringStatus: 'Not Applicable',
      hasCommonArea: true,
      id: setupUnit.id,
      inspectionStatus: 'Not Started',
      notes: '',
      overallStatus: 'Not Started',
      paintStatus: 'Not Started',
      projectId: draft.project.id,
      repairStatus: 'Not Applicable',
      trashStatus: 'Not Applicable',
      unitNumber: setupUnit.unitNumber.trim(),
      updatedAt: recordedAt,
    };
  });
  const crews = (draft.crews ?? []).map((crew): CrewMember => ({
    active: crew.active,
    assignedLocation: '',
    company: '',
    createdAt: recordedAt,
    id: crew.id,
    language: '',
    name: crew.name.trim(),
    notes: '',
    phone: crew.phone?.trim() ?? '',
    projectId: draft.project.id,
    trade: crew.trade === 'paint' ? 'Painter' : 'Cleaner',
    updatedAt: recordedAt,
  }));
  return {
    buildings: [...buildingByName.values()],
    crews,
    floors: [...floorByKey.values()],
    units,
  };
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
  const crewErrors = validateCrews(draft);
  if (crewErrors.length > 0) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-configuration',
      errors: crewErrors,
    };
  }
  const unitErrors = validateUnits(draft);
  if (unitErrors.length > 0) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-project',
      errors: unitErrors,
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
  let setupRecords: ReturnType<typeof candidateSetupRecords>;
  try {
    setupRecords = candidateSetupRecords(draft);
  } catch (error) {
    return {
      ok: false,
      stage: 'preparation',
      code: 'invalid-project',
      errors: [
        error instanceof Error
          ? error.message
          : 'The property roster could not be prepared safely.',
      ],
    };
  }
  const alreadyMatches = existingProject
    ? activationFingerprint(
        existingProject,
        currentContacts,
        draft.crews === undefined ? [] : setupCrewsFromData(data, draft.project.id),
        draft.units === undefined ? [] : setupUnitsFromData(data, draft.project.id),
      ) === activationFingerprint(
        candidateProject,
        candidateContacts,
        draft.crews ?? [],
        draft.units ?? [],
      )
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
  const setupCrewIds = new Set(setupRecords.crews.map((crew) => crew.id));
  const setupBuildingIds = new Set(setupRecords.buildings.map((building) => building.id));
  const setupFloorIds = new Set(setupRecords.floors.map((floor) => floor.id));
  const setupUnitIds = new Set(setupRecords.units.map((unit) => unit.id));
  return {
    ok: true,
    stage: 'prepared',
    changed: true,
    data: {
      ...next,
      activeProjectId: draft.project.id,
      buildings: [
        ...next.buildings.filter((building) => !setupBuildingIds.has(building.id)),
        ...setupRecords.buildings,
      ],
      crewMembers: [
        ...next.crewMembers.filter((crew) => !setupCrewIds.has(crew.id)),
        ...setupRecords.crews,
      ],
      fieldEvents: eventExists ? next.fieldEvents : [...next.fieldEvents, event],
      floors: [
        ...next.floors.filter((floor) => !setupFloorIds.has(floor.id)),
        ...setupRecords.floors,
      ],
      projects: nextProjects,
      propertyContacts: [...retainedContacts, ...candidateContacts],
      units: [
        ...next.units.filter((unit) => !setupUnitIds.has(unit.id)),
        ...setupRecords.units,
      ],
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
