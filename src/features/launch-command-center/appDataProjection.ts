import type {
  ActivityLog,
  AppData,
  FollowUpTask,
  Issue,
  Project,
  Unit,
} from '../../types';
import { isBlockedUnit, isInProgressUnit } from '../../lib/metrics';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { getProjectFollowUpTasks } from '../../lib/projectScope';
import type { TurnCommandUnitOption } from '../../lib/turnCommand';
import type { BoardFirstActivityItem } from '../wave1r-board-first';
import type { NativeHomeRecord } from '../wave2a1-native/track-a';
import type {
  LaunchBlockerSummary,
  LaunchHomeCounts,
  LaunchNotificationItem,
  LaunchSearchGroup,
} from './types';

const OPEN_FOLLOW_UP_STATES = new Set(['open', 'in_progress']);
const OPEN_ISSUE_STATES = new Set(['Open', 'In Progress', 'Waiting']);
const CALLBACK_PATTERN = /\bcallback\b/iu;
const CONFLICT_PATTERN = /\b(conflict|duplicate|double[-\s]?assign(?:ed|ment)?)\b/iu;
const INSPECTION_PATTERN = /\b(inspect(?:ion)?|walkthrough)\b/iu;
const READY_TO_WALK_PATTERN = /\bready\s+to\s+walk\b/iu;

const localISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fieldDateLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);

const conciseTimeLabel = (value: string, now: Date) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Time not recorded';
  if (localISODate(parsed) === localISODate(now)) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
};

const activeProject = (data: Readonly<AppData>) =>
  data.projects.find((project) => project.id === data.activeProjectId && !project.archivedAt);

const activeUnits = (data: Readonly<AppData>) =>
  data.units.filter((unit) => unit.projectId === data.activeProjectId);

const openIssues = (data: Readonly<AppData>) =>
  data.issues.filter((issue) =>
    issue.projectId === data.activeProjectId && OPEN_ISSUE_STATES.has(issue.status)
  );

const openFollowUps = (data: Readonly<AppData>) =>
  getProjectFollowUpTasks(data, data.activeProjectId)
    .filter((task) => OPEN_FOLLOW_UP_STATES.has(task.status));

const issueText = (issue: Issue) => `${issue.title} ${issue.notes} ${issue.resolutionNotes}`;
const followUpText = (task: FollowUpTask) => `${task.title} ${task.description}`;

const unitNumberById = (units: readonly Unit[]) =>
  new Map(units.map((unit) => [unit.id, unit.unitNumber]));

const unitLabel = (unitId: string | undefined, numbers: ReadonlyMap<string, string>) =>
  unitId && numbers.get(unitId) ? `Unit ${numbers.get(unitId)}` : 'Property';

const followUpUnitId = (task: FollowUpTask) =>
  task.relatedEntityType === 'unit' ? task.relatedEntityId : undefined;

const activityKind = (activity: ActivityLog): BoardFirstActivityItem['kind'] => {
  const action = activity.action.toLocaleLowerCase();
  if (action.includes('assign')) return 'assignment';
  if (action.includes('inspect')) return 'los-inspection';
  if (action.includes('walk')) return 'property-walk';
  return 'note';
};

export interface LaunchAppDataProjection {
  activityItems: readonly BoardFirstActivityItem[];
  blockers: readonly LaunchBlockerSummary[];
  commandUnits: readonly TurnCommandUnitOption[];
  counts: LaunchHomeCounts;
  dateISO: string;
  dateLabel: string;
  homeRecords: readonly NativeHomeRecord[];
  notifications: readonly LaunchNotificationItem[];
  project?: Project;
  propertyName: string;
  searchGroups: readonly LaunchSearchGroup[];
}

export const projectLaunchAppData = (
  data: Readonly<AppData>,
  now: Date,
  readNotificationIds: ReadonlySet<string> = new Set(),
): LaunchAppDataProjection => {
  const project = activeProject(data);
  const units = activeUnits(data);
  const unitNumbers = unitNumberById(units);
  const issues = openIssues(data);
  const followUps = openFollowUps(data);
  const callbackIssues = issues.filter((issue) => CALLBACK_PATTERN.test(issueText(issue)));
  const callbackFollowUps = followUps.filter((task) => CALLBACK_PATTERN.test(followUpText(task)));
  const readyToWalkFollowUps = followUps.filter((task) =>
    READY_TO_WALK_PATTERN.test(followUpText(task))
  );
  const workingUnits = units.filter(isInProgressUnit);

  const issueUnitIds = new Set(issues.flatMap((issue) => issue.unitId ? [issue.unitId] : []));
  const blockedUnitIds = new Set([
    ...units.filter(isBlockedUnit).map((unit) => unit.id),
    ...issueUnitIds,
  ]);

  const blockers: LaunchBlockerSummary[] = issues.map((issue) => ({
    conciseReason: issue.title,
    destinationId: `issue:${issue.id}`,
    id: `issue:${issue.id}`,
    unitLabel: unitLabel(issue.unitId, unitNumbers),
  }));
  for (const unit of units.filter(isBlockedUnit)) {
    if (issueUnitIds.has(unit.id)) continue;
    blockers.push({
      conciseReason: 'Personal Unit record is blocked.',
      destinationId: `unit:${unit.id}`,
      id: `unit-blocked:${unit.id}`,
      unitLabel: `Unit ${unit.unitNumber}`,
    });
  }

  const waitingRecords: NativeHomeRecord[] = [...blockedUnitIds].map((unitId) => {
    const unit = units.find((candidate) => candidate.id === unitId);
    const issue = issues.find((candidate) => candidate.unitId === unitId);
    return {
      destinationId: issue ? `issue:${issue.id}` : `unit:${unitId}`,
      id: `home-waiting:${unitId}`,
      meta: issue?.title ?? 'Personal Unit record is blocked.',
      summaryStates: ['waiting'],
      unitLabel: unit ? `Unit ${unit.unitNumber}` : unitLabel(unitId, unitNumbers),
    };
  });
  const homeRecords: NativeHomeRecord[] = [
    ...workingUnits.map((unit): NativeHomeRecord => ({
      destinationId: `unit:${unit.id}`,
      id: `home-working:${unit.id}`,
      meta: `${unit.paintStatus} Paint · ${unit.cleanStatus} Clean`,
      summaryStates: ['working'],
      unitLabel: `Unit ${unit.unitNumber}`,
    })),
    ...waitingRecords,
    ...callbackIssues.map((issue): NativeHomeRecord => ({
      destinationId: `issue:${issue.id}`,
      id: `home-callback-issue:${issue.id}`,
      meta: issue.title,
      summaryStates: ['callbacks'],
      unitLabel: unitLabel(issue.unitId, unitNumbers),
    })),
    ...callbackFollowUps.map((task): NativeHomeRecord => ({
      destinationId: followUpUnitId(task)
        ? `unit:${followUpUnitId(task)}`
        : 'activity',
      id: `home-callback-follow-up:${task.id}`,
      meta: task.title,
      summaryStates: ['callbacks'],
      unitLabel: unitLabel(followUpUnitId(task), unitNumbers),
    })),
    ...readyToWalkFollowUps.map((task): NativeHomeRecord => ({
      destinationId: followUpUnitId(task)
        ? `unit:${followUpUnitId(task)}`
        : 'activity',
      id: `home-ready-to-walk:${task.id}`,
      meta: task.title,
      summaryStates: ['ready-to-walk'],
      unitLabel: unitLabel(followUpUnitId(task), unitNumbers),
    })),
  ];

  const activityItems = data.activityLogs
    .filter((activity) => activity.projectId === data.activeProjectId)
    .map((activity): BoardFirstActivityItem => {
      const relatedUnitId = activity.entityType === 'Unit' && unitNumbers.has(activity.entityId)
        ? activity.entityId
        : undefined;
      return {
        id: `app-data:${activity.id}`,
        kind: activityKind(activity),
        recordedAt: activity.createdAt,
        sourceLabel: 'Personal AppData activity',
        synthetic: project?.mode === 'demo',
        title: activity.action,
        wording: activity.note || activity.action,
        unitId: relatedUnitId,
        unitNumber: relatedUnitId ? unitNumbers.get(relatedUnitId) : undefined,
      };
    })
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

  const searchGroups: LaunchSearchGroup[] = [
    {
      id: 'units',
      label: 'Units',
      results: units.map((unit) => ({
        destinationId: `unit:${unit.id}`,
        id: `unit:${unit.id}`,
        keywords: [
          unit.overallStatus,
          unit.paintStatus,
          unit.cleanStatus,
        ],
        meta: [
          data.floors.find((floor) => floor.id === unit.floorId)?.name,
          data.buildings.find((building) => building.id === unit.buildingId)?.name,
        ].filter(Boolean).join(' · ') || 'Location not recorded',
        title: `Unit ${unit.unitNumber}`,
      })),
    },
    {
      id: 'crews',
      label: 'Crews',
      results: data.crewMembers
        .filter((crew) => crew.active && (!crew.projectId || crew.projectId === data.activeProjectId))
        .map((crew) => ({
          destinationId: 'crews',
          id: `crew:${crew.id}`,
          keywords: [crew.company, crew.language, crew.assignedLocation],
          meta: `${crew.trade}${crew.company ? ` · ${crew.company}` : ''}`,
          title: crew.name,
        })),
    },
    {
      id: 'notes-activity',
      label: 'Notes / Activity',
      results: activityItems.map((activity) => ({
        destinationId: activity.unitId ? `unit:${activity.unitId}` : 'activity',
        id: `activity:${activity.id}`,
        keywords: [activity.wording, activity.unitNumber ?? ''],
        meta: activity.unitNumber
          ? `Unit ${activity.unitNumber} · ${conciseTimeLabel(activity.recordedAt, now)}`
          : conciseTimeLabel(activity.recordedAt, now),
        title: activity.title,
      })),
    },
    {
      id: 'callbacks',
      label: 'Callbacks',
      results: [
        ...callbackIssues.map((issue) => ({
          destinationId: `issue:${issue.id}`,
          id: `callback-issue:${issue.id}`,
          keywords: [issue.notes, issue.owner],
          meta: `${unitLabel(issue.unitId, unitNumbers)} · ${issue.owner || 'Owner not recorded'}`,
          title: issue.title,
        })),
        ...callbackFollowUps.map((task) => ({
          destinationId: task.relatedEntityType === 'unit' && task.relatedEntityId
            ? `unit:${task.relatedEntityId}`
            : 'activity',
          id: `callback-follow-up:${task.id}`,
          keywords: [task.description, task.owner],
          meta: `${unitLabel(followUpUnitId(task), unitNumbers)} · ${task.owner || 'Owner not recorded'}`,
          title: task.title,
        })),
      ],
    },
    {
      id: 'blockers',
      label: 'Blockers',
      results: blockers.map((blocker) => ({
        destinationId: blocker.destinationId,
        id: `blocker:${blocker.id}`,
        keywords: [blocker.conciseReason],
        meta: blocker.conciseReason,
        title: blocker.unitLabel,
      })),
    },
  ];

  const notifications: LaunchNotificationItem[] = [];
  for (const task of followUps) {
    const text = followUpText(task);
    const category = CALLBACK_PATTERN.test(text)
      ? 'callbacks' as const
      : INSPECTION_PATTERN.test(text)
        ? 'inspections' as const
        : null;
    if (!category) continue;
    const id = `follow-up:${task.id}`;
    const dueAt = task.dueAt || task.createdAt;
    notifications.push({
      category,
      destinationId: followUpUnitId(task) ? `unit:${followUpUnitId(task)}` : 'activity',
      destinationLabel: followUpUnitId(task) ? unitLabel(followUpUnitId(task), unitNumbers) : 'Activity',
      group: task.priority === 'Critical' || task.priority === 'High'
        ? 'important'
        : localISODate(new Date(dueAt)) === localISODate(now)
          ? 'today'
          : 'earlier',
      id,
      read: readNotificationIds.has(id),
      reason: task.title,
      timeLabel: conciseTimeLabel(dueAt, now),
      unitLabel: unitLabel(followUpUnitId(task), unitNumbers),
    });
  }
  for (const issue of issues.filter((candidate) => CONFLICT_PATTERN.test(issueText(candidate)))) {
    const id = `issue-conflict:${issue.id}`;
    notifications.push({
      category: 'conflicts',
      destinationId: `issue:${issue.id}`,
      destinationLabel: issue.unitId ? unitLabel(issue.unitId, unitNumbers) : 'Issues',
      group: issue.priority === 'Critical' || issue.priority === 'High' ? 'important' : 'today',
      id,
      read: readNotificationIds.has(id),
      reason: issue.title,
      timeLabel: conciseTimeLabel(issue.updatedAt, now),
      unitLabel: unitLabel(issue.unitId, unitNumbers),
    });
  }

  return {
    activityItems,
    blockers,
    commandUnits: units
      .map((unit) => ({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        buildingName: data.buildings.find((building) => building.id === unit.buildingId)?.name ?? '',
        floorName: data.floors.find((floor) => floor.id === unit.floorId)?.name ?? '',
      }))
      .sort((left, right) => compareUnitTopFloorFirst(left.unitNumber, right.unitNumber)),
    counts: {
      blocked: waitingRecords.length,
      callbacks: callbackIssues.length + callbackFollowUps.length,
      readyToWalk: readyToWalkFollowUps.length,
      working: workingUnits.length,
    },
    dateISO: localISODate(now),
    dateLabel: fieldDateLabel(now),
    homeRecords,
    notifications: notifications.sort((left, right) => {
      const groupRank = { important: 0, today: 1, earlier: 2 };
      return groupRank[left.group] - groupRank[right.group];
    }),
    project,
    propertyName: project?.propertyName || 'Personal field workspace',
    searchGroups,
  };
};
