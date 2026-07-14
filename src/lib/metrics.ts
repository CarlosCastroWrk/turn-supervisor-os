import type { AppData, Assignment, Building, Floor, Issue, Project, Unit, WorkStatus } from '../types';

export const isArchivedProject = (project: Project) => Boolean(project.archivedAt);

export const getVisibleProjects = (projects: Project[]) => projects.filter((project) => !isArchivedProject(project));

export const getActiveProject = (data: AppData): Project => {
  const visibleProjects = getVisibleProjects(data.projects);
  const project = visibleProjects.find((item) => item.id === data.activeProjectId);
  return project ?? visibleProjects[0] ?? data.projects[0];
};

export const getUnitsForProject = (data: AppData, projectId: string) =>
  data.units.filter((unit) => unit.projectId === projectId);
export const getBuildingsForProject = (data: AppData, projectId: string) =>
  data.buildings.filter((building) => building.projectId === projectId);
export const getIssuesForProject = (data: AppData, projectId: string) =>
  data.issues.filter((issue) => issue.projectId === projectId);
export const getAssignmentsForProject = (data: AppData, projectId: string) =>
  data.assignments.filter((assignment) => assignment.projectId === projectId);
export const getCrewMembersForProject = (data: AppData, projectId: string) =>
  data.crewMembers.filter((crew) => crew.projectId === projectId);

export const getProjectUnits = (data: AppData) => getUnitsForProject(data, data.activeProjectId);
export const getProjectBuildings = (data: AppData) => getBuildingsForProject(data, data.activeProjectId);
export const getProjectIssues = (data: AppData) => getIssuesForProject(data, data.activeProjectId);
export const getProjectAssignments = (data: AppData) => getAssignmentsForProject(data, data.activeProjectId);
export const getProjectCrewMembers = (data: AppData) => getCrewMembersForProject(data, data.activeProjectId);

export interface UnitStatusReason {
  label: string;
  status: string;
}

const workIsComplete = (status: WorkStatus) => status === 'Complete' || status === 'Not Applicable';

const explicitOverallBlockers = new Set<Unit['overallStatus']>([
  'Access Blocked',
  'Punch List',
  'Rework Needed',
  'Hold / Blocked',
]);

const workChecks: Array<{ label: string; key: keyof Pick<Unit, 'paintStatus' | 'cleanStatus' | 'repairStatus' | 'flooringStatus' | 'trashStatus'> }> = [
  { label: 'Paint', key: 'paintStatus' },
  { label: 'Clean', key: 'cleanStatus' },
  { label: 'Maintenance', key: 'repairStatus' },
  { label: 'Flooring', key: 'flooringStatus' },
  { label: 'Trash out', key: 'trashStatus' },
];

export const getUnitBlockingReasons = (unit: Unit): UnitStatusReason[] => {
  const reasons: UnitStatusReason[] = [];
  if (unit.overallStatus.includes('Blocked')) {
    reasons.push({ label: 'Overall', status: unit.overallStatus });
  }
  workChecks.forEach(({ label, key }) => {
    if (unit[key] === 'Blocked') {
      reasons.push({ label, status: unit[key] });
    }
  });
  return reasons;
};

export const getUnitReadyConflicts = (unit: Unit): UnitStatusReason[] => {
  const conflicts: UnitStatusReason[] = [];
  if (explicitOverallBlockers.has(unit.overallStatus)) {
    conflicts.push({ label: 'Overall', status: unit.overallStatus });
  }
  workChecks.forEach(({ label, key }) => {
    if (!workIsComplete(unit[key])) {
      conflicts.push({ label, status: unit[key] });
    }
  });
  if (!workIsComplete(unit.inspectionStatus)) {
    conflicts.push({ label: 'Inspection', status: unit.inspectionStatus });
  }
  return conflicts;
};

export const getMarkReadyBlockers = (unit: Unit): UnitStatusReason[] => {
  const blockers = getUnitReadyConflicts(unit).filter(({ label }) => label !== 'Inspection');
  if (unit.inspectionStatus === 'Blocked' || unit.inspectionStatus === 'Rework Needed') {
    blockers.push({ label: 'Inspection', status: unit.inspectionStatus });
  }
  return blockers;
};

export const isBlockedUnit = (unit: Unit) => getUnitBlockingReasons(unit).length > 0;

export const isInProgressUnit = (unit: Unit) =>
  ['Painting', 'Cleaning', 'Maintenance In Progress', 'Punch List', 'Rework Needed'].includes(unit.overallStatus);

export const isInspectionUnit = (unit: Unit) =>
  unit.overallStatus === 'Inspection Needed' || unit.inspectionStatus === 'Ready' || unit.inspectionStatus === 'Needed';

export const isReadyUnit = (unit: Unit) =>
  unit.overallStatus === 'Ready' && getUnitReadyConflicts(unit).length === 0;

export const getUnitSummary = (units: Unit[]) => {
  const totalUnits = units.length;
  const totalBeds = units.reduce((sum, unit) => sum + Number(unit.bedCount || 0), 0);
  const totalCommonAreas = units.filter((unit) => unit.hasCommonArea).length;
  const ready = units.filter(isReadyUnit).length;
  const blocked = units.filter(isBlockedUnit).length;
  const inProgress = units.filter(isInProgressUnit).length;
  const inspection = units.filter(isInspectionUnit).length;
  const notStarted = units.filter((unit) => unit.overallStatus === 'Not Started').length;
  const percentComplete = totalUnits === 0 ? 0 : Math.round((ready / totalUnits) * 100);

  return { totalUnits, totalBeds, totalCommonAreas, ready, blocked, inProgress, inspection, notStarted, percentComplete };
};

export const getBuildingSummary = (building: Building, floors: Floor[], units: Unit[], issues: Issue[]) => {
  const buildingFloors = floors.filter((floor) => floor.buildingId === building.id);
  const floorIds = new Set(buildingFloors.map((floor) => floor.id));
  const buildingUnits = units.filter((unit) => unit.buildingId === building.id || floorIds.has(unit.floorId));
  const buildingIssues = issues.filter((issue) => issue.buildingId === building.id && !['Closed', 'Resolved'].includes(issue.status));

  return {
    ...getUnitSummary(buildingUnits),
    floors: buildingFloors,
    units: buildingUnits,
    openIssues: buildingIssues.length,
    criticalIssues: buildingIssues.filter((issue) => issue.priority === 'Critical').length,
  };
};

export const getTodayAssignments = (assignments: Assignment[], date: string) =>
  assignments.filter((assignment) => assignment.date === date);

export const getPriorityIssues = (issues: Issue[]) =>
  issues
    .filter((issue) => ['Open', 'In Progress', 'Waiting'].includes(issue.status))
    .sort((a, b) => {
      const weight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      return weight[b.priority] - weight[a.priority];
    });
