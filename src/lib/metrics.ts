import type { AppData, Assignment, Building, Floor, Issue, Project, Unit } from '../types';

export const getActiveProject = (data: AppData): Project => {
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  return project ?? data.projects[0];
};

export const getProjectUnits = (data: AppData) => data.units.filter((unit) => unit.projectId === data.activeProjectId);
export const getProjectBuildings = (data: AppData) =>
  data.buildings.filter((building) => building.projectId === data.activeProjectId);
export const getProjectIssues = (data: AppData) => data.issues.filter((issue) => issue.projectId === data.activeProjectId);
export const getProjectAssignments = (data: AppData) =>
  data.assignments.filter((assignment) => assignment.projectId === data.activeProjectId);

export const isBlockedUnit = (unit: Unit) =>
  unit.overallStatus.includes('Blocked') ||
  unit.paintStatus === 'Blocked' ||
  unit.cleanStatus === 'Blocked' ||
  unit.repairStatus === 'Blocked' ||
  unit.trashStatus === 'Blocked';

export const isInProgressUnit = (unit: Unit) =>
  ['Painting', 'Cleaning', 'Maintenance In Progress', 'Punch List', 'Rework Needed'].includes(unit.overallStatus);

export const isInspectionUnit = (unit: Unit) =>
  unit.overallStatus === 'Inspection Needed' || unit.inspectionStatus === 'Ready' || unit.inspectionStatus === 'Needed';

export const isReadyUnit = (unit: Unit) => unit.overallStatus === 'Ready';

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

