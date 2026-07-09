import type { ActivityLog, AppData, DailyLog, FollowUpTask, Issue, Project, Unit } from '../types';
import { formatDate, todayISO } from './constants';
import { getPriorityIssues, getProjectAssignments, getProjectIssues, getProjectUnits, getUnitSummary } from './metrics';

const escapeCsv = (value: unknown) => {
  const raw = String(value ?? '');
  return `"${raw.replaceAll('"', '""')}"`;
};

export const toCsv = <T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; label: string }[]) => {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(',')).join('\n');
  return [header, body].filter(Boolean).join('\n');
};

export const downloadTextFile = (filename: string, text: string, type = 'text/plain') => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

interface JsonBackupPhotoSummary {
  includedLocalPhotoFiles: number;
  missingLocalPhotoFiles: number;
  totalPhotoRecords: number;
}

export const buildJsonBackup = (data: AppData, photoFiles?: JsonBackupPhotoSummary) =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      ...(photoFiles ? { photoFiles } : {}),
      data,
    },
    null,
    2,
  );

export const buildUnitsCsv = (units: Unit[]) =>
  toCsv(
    units as unknown as Record<string, unknown>[],
    [
      { key: 'unitNumber', label: 'Unit' },
      { key: 'bedCount', label: 'Beds' },
      { key: 'bathroomCount', label: 'Bathrooms' },
      { key: 'overallStatus', label: 'Overall Status' },
      { key: 'paintStatus', label: 'Paint' },
      { key: 'cleanStatus', label: 'Clean' },
      { key: 'repairStatus', label: 'Repair' },
      { key: 'inspectionStatus', label: 'Inspection' },
      { key: 'notes', label: 'Notes' },
      { key: 'updatedAt', label: 'Last Updated' },
    ],
  );

export const buildIssuesCsv = (issues: Issue[]) =>
  toCsv(
    issues as unknown as Record<string, unknown>[],
    [
      { key: 'title', label: 'Issue' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'owner', label: 'Owner' },
      { key: 'status', label: 'Status' },
      { key: 'dueAt', label: 'Due' },
      { key: 'notes', label: 'Notes' },
      { key: 'resolutionNotes', label: 'Resolution' },
      { key: 'updatedAt', label: 'Last Updated' },
    ],
  );

export const buildFollowUpsCsv = (tasks: FollowUpTask[]) =>
  toCsv(
    tasks as unknown as Record<string, unknown>[],
    [
      { key: 'title', label: 'Task' },
      { key: 'description', label: 'Description' },
      { key: 'priority', label: 'Priority' },
      { key: 'owner', label: 'Owner' },
      { key: 'dueAt', label: 'Due' },
      { key: 'status', label: 'Status' },
      { key: 'relatedEntityType', label: 'Related Type' },
      { key: 'relatedEntityId', label: 'Related ID' },
      { key: 'createdAt', label: 'Created' },
      { key: 'completedAt', label: 'Completed' },
    ],
  );

export const buildCopilotMarkdown = (data: AppData) => `# Turn Supervisor OS Copilot Export

Exported: ${new Date().toISOString()}

## Draft Actions

${
  data.draftActions.length > 0
    ? data.draftActions
        .map(
          (draft) => `### ${draft.title}

- Type: ${draft.type}
- Status: ${draft.status}
- Target: ${draft.targetEntityType}${draft.targetEntityId ? ` (${draft.targetEntityId})` : ''}
- Confidence: ${Math.round(draft.confidence * 100)}%
- Created: ${draft.createdAt}
- Applied: ${draft.appliedAt || '-'}
- Summary: ${draft.summary}
- Why: ${draft.why}
- Error: ${draft.error || '-'}
- Source: ${draft.sourceText || '-'}

\`\`\`json
${JSON.stringify(draft.payload, null, 2)}
\`\`\`
`,
        )
        .join('\n')
    : '- No draft actions recorded.'
}

## Memory Candidates

${
  data.memoryCandidates.length > 0
    ? data.memoryCandidates
        .map(
          (candidate) => `- [${candidate.status}] ${candidate.memoryType}: ${candidate.content}
  - Source: ${candidate.source}
  - Confidence: ${Math.round(candidate.confidence * 100)}%
`,
        )
        .join('\n')
    : '- No memory candidates recorded.'
}

## Approved Memories

${
  data.memories.length > 0
    ? data.memories
        .map(
          (memory) => `- [${memory.approved ? 'active' : 'inactive'}] ${memory.memoryType}: ${memory.content}
  - Source: ${memory.source}
  - Confidence: ${Math.round(memory.confidence * 100)}%
  - Last used: ${memory.lastUsedAt || '-'}
`,
        )
        .join('\n')
    : '- No memories recorded.'
}

## Follow-Up Tasks

${
  data.followUpTasks.length > 0
    ? data.followUpTasks
        .map(
          (task) => `- [${task.status}] ${task.priority}: ${task.title}
  - Owner: ${task.owner || '-'}
  - Due: ${task.dueAt || '-'}
  - Description: ${task.description || '-'}
`,
        )
        .join('\n')
    : '- No follow-up tasks recorded.'
}

## Ask The OS Conversations

${
  data.copilotConversations.length > 0
    ? data.copilotConversations
        .map(
          (message) => `### ${message.role} - ${message.createdAt}

${message.content}

Supporting records:
${message.supportingRecords.length > 0 ? message.supportingRecords.map((record) => `- ${record}`).join('\n') : '-'}

Suggested next actions:
${message.suggestedNextActions.length > 0 ? message.suggestedNextActions.map((action) => `- ${action}`).join('\n') : '-'}
`,
        )
        .join('\n')
    : '- No conversations recorded.'
}

## Agent Runs

${
  data.agentRuns.length > 0
    ? data.agentRuns
        .map((run) => `- [${run.status}] ${run.mode} at ${run.createdAt}${run.error ? ` - ${run.error}` : ''}`)
        .join('\n')
    : '- No agent runs recorded.'
}
`;

export const buildDailyLogsMarkdown = (logs: DailyLog[]) =>
  logs
    .map(
      (log) => `# Daily Log - ${formatDate(log.date)}

## Morning Plan
${log.morningPlan || '-'}

## Midday Update
${log.middayUpdate || '-'}

## End-of-Day Reflection
${log.endOfDayReflection || '-'}

## Completed Summary
${log.completedSummary || '-'}

## Blockers
${log.blockers || '-'}

## Lessons
${log.lessons || '-'}

## Tomorrow Priorities
${log.tomorrowPriorities || '-'}
`,
    )
    .join('\n---\n');

const reportFieldOrMissing = (value: string | undefined, label: string) => {
  const trimmed = value?.trim();
  return trimmed || `- No ${label} saved for this date.`;
};

const reportLinesOrMissing = (value: string | undefined, label: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [`No ${label} saved for this date.`];
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const operationalActivityTypes = new Set<ActivityLog['entityType']>([
  'Project',
  'Unit',
  'CrewMember',
  'Assignment',
  'Issue',
  'PhotoNote',
  'FollowUpTask',
]);

const toLocalDate = (dateTime: string) => {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatActivityTime = (dateTime: string) => {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
};

export const buildDailyActivitySnapshot = (data: AppData, project: Project, reportDate: string) => {
  const activityLogs = data.activityLogs
    .filter(
      (log) =>
        log.projectId === project.id &&
        toLocalDate(log.createdAt) === reportDate &&
        operationalActivityTypes.has(log.entityType),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const shownLogs = activityLogs.slice(0, 8);
  const items = shownLogs.map((log) => {
    const time = formatActivityTime(log.createdAt);
    const note = log.note.trim();
    const detail = note ? `${log.action}: ${note}` : log.action;
    return time ? `${time} - ${detail}` : detail;
  });

  if (activityLogs.length > shownLogs.length) {
    items.push(`${activityLogs.length - shownLogs.length} more recorded update(s) not shown.`);
  }

  return {
    total: activityLogs.length,
    items: items.length > 0 ? items : ['No recorded app activity for this date.'],
  };
};

export interface DailyReportPreviewMetric {
  label: string;
  value: string;
  helper: string;
}

export interface DailyReportPreviewSection {
  title: string;
  subtitle: string;
  items: string[];
}

export interface DailyReportPreview {
  title: string;
  summary: string;
  reportDateLabel: string;
  status: string;
  isMissingDailyLog: boolean;
  propertyName: string;
  projectName: string;
  supervisorName: string;
  projectManagerName: string;
  location: string;
  metrics: DailyReportPreviewMetric[];
  sections: DailyReportPreviewSection[];
}

export const buildDailyReportPreview = (data: AppData, project: Project, reportDate = todayISO(), dailyLog?: DailyLog): DailyReportPreview => {
  const units = getProjectUnits(data);
  const issues = getPriorityIssues(getProjectIssues(data));
  const assignments = getProjectAssignments(data).filter((assignment) => assignment.date === reportDate);
  const summary = getUnitSummary(units);
  const activitySnapshot = buildDailyActivitySnapshot(data, project, reportDate);
  const checkedIn = assignments.filter((assignment) => ['Checked In', 'In Progress', 'Complete'].includes(assignment.status));
  const missing = assignments.filter((assignment) => ['No Show', 'Delayed'].includes(assignment.status));
  const painterCount = checkedIn.filter((assignment) => assignment.trade === 'Painter').length;
  const cleanerCount = checkedIn.filter((assignment) => assignment.trade === 'Cleaner').length;
  const reassignedCount = assignments.filter((assignment) => assignment.status === 'Reassigned').length;
  const issueCount = issues.length;
  const progressSummary = `${summary.ready} of ${summary.totalUnits} units ready, ${summary.inProgress} moving, ${summary.blocked} blocked, ${summary.inspection} waiting on inspection.`;

  return {
    title: 'Turn Supervisor Daily Report',
    summary: dailyLog
      ? `${progressSummary} ${issueCount > 0 ? `${issueCount} priority issue${issueCount === 1 ? '' : 's'} still need follow-up.` : 'No high-priority open issues are logged.'}`
      : `Draft shell for ${formatDate(reportDate)}. ${progressSummary} Add a Daily Log before treating this as the final field report.`,
    reportDateLabel: formatDate(reportDate),
    status: dailyLog
      ? 'DRAFT - Saved daily log found for this date. Review before sending.'
      : 'DRAFT - Missing Daily Log for selected date. Do not send as a completed field report until this date has a saved Daily Log.',
    isMissingDailyLog: !dailyLog,
    propertyName: project.propertyName,
    projectName: project.name,
    supervisorName: project.supervisorName,
    projectManagerName: project.projectManagerName,
    location: project.location,
    metrics: [
      { label: 'Total units', value: String(summary.totalUnits), helper: 'Current board state' },
      { label: 'Ready', value: String(summary.ready), helper: `${summary.percentComplete}% ready now` },
      { label: 'In progress', value: String(summary.inProgress), helper: 'Current board state' },
      { label: 'Blocked', value: String(summary.blocked), helper: 'Current board state' },
      { label: 'Inspection', value: String(summary.inspection), helper: 'Current board state' },
    ],
    sections: [
      {
        title: 'Activity Snapshot',
        subtitle: `Recorded updates for ${formatDate(reportDate)}`,
        items: activitySnapshot.items,
      },
      {
        title: 'Completed Today',
        subtitle: 'Progress recorded for this date',
        items: reportLinesOrMissing(dailyLog?.completedSummary, 'completed summary'),
      },
      {
        title: 'Open Issues',
        subtitle: 'Items still requiring follow-up',
        items:
          issues.length > 0
            ? issues.slice(0, 8).map((issue) => `${issue.title}: ${issue.status}${issue.owner ? ` (${issue.owner})` : ''}`)
            : ['No open high-priority issues logged.'],
      },
      {
        title: 'Crew Notes',
        subtitle: 'Crew check-in signal',
        items: [
          `Painters checked in: ${painterCount}`,
          `Cleaners checked in: ${cleanerCount}`,
          `Missing/no-show/delayed: ${missing.length}`,
          `Reassigned: ${reassignedCount}`,
        ],
      },
      {
        title: 'Tomorrow Priorities',
        subtitle: 'Next-shift priorities',
        items: reportLinesOrMissing(dailyLog?.tomorrowPriorities, 'tomorrow priorities'),
      },
      {
        title: 'Questions / Needs',
        subtitle: 'Blockers, decisions, or asks',
        items: reportLinesOrMissing(dailyLog?.blockers, 'blockers or questions'),
      },
    ],
  };
};

export const buildDailyReport = (data: AppData, project: Project, reportDate = todayISO(), dailyLog?: DailyLog) => {
  const units = getProjectUnits(data);
  const issues = getPriorityIssues(getProjectIssues(data));
  const assignments = getProjectAssignments(data).filter((assignment) => assignment.date === reportDate);
  const summary = getUnitSummary(units);
  const activitySnapshot = buildDailyActivitySnapshot(data, project, reportDate);
  const checkedIn = assignments.filter((assignment) => ['Checked In', 'In Progress', 'Complete'].includes(assignment.status));
  const missing = assignments.filter((assignment) => ['No Show', 'Delayed'].includes(assignment.status));
  const reportStatus = dailyLog
    ? 'DRAFT - Saved daily log found for this date. Review before sending.'
    : 'DRAFT - Missing Daily Log for selected date. Do not send as a completed field report until this date has a saved Daily Log.';

  return `Turn Supervisor Daily Report

Date: ${formatDate(reportDate)}
Status: ${reportStatus}
Property: ${project.propertyName}
Supervisor: ${project.supervisorName}

Progress (current board state):
- Total units: ${summary.totalUnits}
- Units ready: ${summary.ready}
- Units in progress: ${summary.inProgress}
- Units blocked: ${summary.blocked}
- Units needing inspection: ${summary.inspection}

Activity Snapshot (${formatDate(reportDate)}):
${activitySnapshot.items.map((item) => `- ${item}`).join('\n')}

Completed Today:
${reportFieldOrMissing(dailyLog?.completedSummary, 'completed summary')}

Open Issues:
${
  issues.length > 0
    ? issues
        .slice(0, 8)
        .map((issue) => `- ${issue.title}: ${issue.status}${issue.owner ? ` (${issue.owner})` : ''}`)
        .join('\n')
    : '- No open high-priority issues logged.'
}

Crew Notes:
- Painters checked in: ${checkedIn.filter((assignment) => assignment.trade === 'Painter').length}
- Cleaners checked in: ${checkedIn.filter((assignment) => assignment.trade === 'Cleaner').length}
- Missing/no-show/delayed: ${missing.length}
- Reassigned: ${assignments.filter((assignment) => assignment.status === 'Reassigned').length}

Tomorrow Priorities:
${reportFieldOrMissing(dailyLog?.tomorrowPriorities, 'tomorrow priorities')}

Questions / Needs:
${reportFieldOrMissing(dailyLog?.blockers, 'blockers or questions')}
`;
};
