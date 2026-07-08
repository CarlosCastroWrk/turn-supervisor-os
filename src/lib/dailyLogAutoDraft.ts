import type { AppData, DailyLog, Project } from '../types';
import { buildDailyActivitySnapshot } from './exporters';
import { getUnitSummary, isBlockedUnit, isInProgressUnit, isInspectionUnit } from './metrics';

type DailyLogTextField =
  | 'morningPlan'
  | 'middayUpdate'
  | 'endOfDayReflection'
  | 'completedSummary'
  | 'blockers'
  | 'lessons'
  | 'tomorrowPriorities';

export interface DailyLogAutoDraftResult {
  changedFields: DailyLogTextField[];
  dailyLog: DailyLog;
  sourceCount: number;
}

const activeIssueStatuses = new Set(['Open', 'In Progress', 'Waiting']);

const bullets = (items: string[]) => items.filter(Boolean).map((item) => `- ${item}`).join('\n');

const firstLines = (items: string[], limit: number) => items.slice(0, limit);

const hasText = (value: string) => value.trim().length > 0;

export const buildDailyLogAutoDraft = (
  data: AppData,
  project: Project,
  date: string,
  current: DailyLog,
): DailyLogAutoDraftResult => {
  const projectUnits = data.units.filter((unit) => unit.projectId === project.id);
  const unitById = new Map(projectUnits.map((unit) => [unit.id, unit]));
  const summary = getUnitSummary(projectUnits);
  const activitySnapshot = buildDailyActivitySnapshot(data, project, date);
  const activityItems = activitySnapshot.items.filter((item) => !item.startsWith('No recorded app activity'));
  const assignments = data.assignments.filter((assignment) => assignment.projectId === project.id && assignment.date === date);
  const activeIssues = data.issues.filter((issue) => issue.projectId === project.id && activeIssueStatuses.has(issue.status));
  const blockedUnits = projectUnits.filter(isBlockedUnit);
  const inProgressUnits = projectUnits.filter(isInProgressUnit);
  const inspectionUnits = projectUnits.filter(isInspectionUnit);
  const previousLog = data.dailyLogs
    .filter((log) => log.projectId === project.id && log.date < date)
    .sort((left, right) => right.date.localeCompare(left.date))[0];
  const previousPriorities = previousLog?.tomorrowPriorities
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean) ?? [];

  const assignmentLines = firstLines(
    assignments.map((assignment) =>
      [assignment.teamName || assignment.trade, assignment.scope, assignment.status].filter(Boolean).join(' - '),
    ),
    5,
  );
  const issueLines = firstLines(
    activeIssues.map((issue) => {
      const unit = issue.unitId ? unitById.get(issue.unitId) : undefined;
      return `${unit ? `Unit ${unit.unitNumber}: ` : ''}${issue.title}${issue.owner ? ` (${issue.owner})` : ''}`;
    }),
    6,
  );
  const blockedUnitLines = firstLines(
    blockedUnits.map((unit) => `Unit ${unit.unitNumber}: ${unit.notes || unit.overallStatus}`),
    6,
  );
  const tomorrowLines = [
    blockedUnits.length > 0 ? `Clear ${blockedUnits.length} blocked unit${blockedUnits.length === 1 ? '' : 's'}.` : '',
    activeIssues.length > 0 ? `Follow up on ${activeIssues.length} open issue${activeIssues.length === 1 ? '' : 's'}.` : '',
    inspectionUnits.length > 0
      ? `Walk ${inspectionUnits.length} unit${inspectionUnits.length === 1 ? '' : 's'} waiting on inspection.`
      : '',
    inProgressUnits.length > 0
      ? `Check ${inProgressUnits.length} unit${inProgressUnits.length === 1 ? '' : 's'} still moving.`
      : '',
  ].filter(Boolean);

  const generated: Record<DailyLogTextField, string> = {
    morningPlan:
      previousPriorities.length > 0
        ? `Carry over from previous log:\n${bullets(firstLines(previousPriorities, 5))}`
        : assignmentLines.length > 0
          ? `Crew plan:\n${bullets(assignmentLines)}`
          : '',
    middayUpdate:
      activityItems.length > 0
        ? `Recorded updates:\n${bullets(firstLines(activityItems, 8))}`
        : projectUnits.length > 0
          ? `Current board state: ${summary.ready} ready, ${summary.inProgress} moving, ${summary.blocked} blocked, ${summary.inspection} inspection.`
          : '',
    endOfDayReflection: '',
    completedSummary: activityItems.length > 0 ? `Recorded today:\n${bullets(firstLines(activityItems, 8))}` : '',
    blockers: [...blockedUnitLines, ...issueLines].length > 0 ? bullets([...blockedUnitLines, ...issueLines]) : '',
    lessons: '',
    tomorrowPriorities: tomorrowLines.length > 0 ? `Suggested from current board:\n${bullets(tomorrowLines)}` : '',
  };

  const changedFields: DailyLogTextField[] = [];
  const nextDailyLog = { ...current, projectId: project.id, date };

  (Object.keys(generated) as DailyLogTextField[]).forEach((field) => {
    const generatedText = generated[field].trim();
    if (!generatedText || hasText(nextDailyLog[field])) {
      return;
    }

    nextDailyLog[field] = generatedText;
    changedFields.push(field);
  });

  return {
    changedFields,
    dailyLog: nextDailyLog,
    sourceCount:
      activitySnapshot.total + assignments.length + activeIssues.length + blockedUnits.length + (projectUnits.length > 0 ? 1 : 0),
  };
};
