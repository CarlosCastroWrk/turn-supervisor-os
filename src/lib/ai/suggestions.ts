import type { AppData, SmartSuggestion, Unit } from '../../types';
import { createId, nowISO, todayISO } from '../constants';
import { getProjectAssignments, getProjectIssues, getProjectUnits, getUnitBlockingReasons, isBlockedUnit } from '../metrics';

const hoursSince = (iso: string) => {
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) {
    return 0;
  }
  return (Date.now() - value) / 3_600_000;
};

const staleUnitSuggestion = (unit: Unit): SmartSuggestion => ({
  id: createId('suggestion_stale'),
  type: 'stale_unit',
  title: `Unit ${unit.unitNumber} has not been updated in 3+ hours`,
  description: `Last update was about ${Math.floor(hoursSince(unit.updatedAt))} hour(s) ago. Walk it or confirm status if it still matters today.`,
  priority: 'Medium',
  relatedEntityType: 'unit',
  relatedEntityId: unit.id,
  status: 'active',
  createdAt: nowISO(),
});

export const generateSmartSuggestions = (data: AppData): SmartSuggestion[] => {
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data).filter((issue) => !['Closed', 'Resolved'].includes(issue.status));
  const assignments = getProjectAssignments(data).filter((assignment) => assignment.date === todayISO());
  const suggestions: SmartSuggestion[] = [];

  issues
    .filter((issue) => issue.priority === 'Critical')
    .forEach((issue) => {
      suggestions.push({
        id: createId('suggestion_critical'),
        type: 'critical_issue',
        title: `Critical issue: ${issue.title}`,
        description: issue.owner ? `Owner: ${issue.owner}. Status: ${issue.status}.` : 'No owner recorded. Assign an owner before it gets lost.',
        priority: 'Critical',
        relatedEntityType: 'issue',
        relatedEntityId: issue.id,
        status: 'active',
        createdAt: nowISO(),
      });
    });

  issues
    .filter((issue) => !issue.owner.trim() && issue.priority !== 'Critical')
    .forEach((issue) => {
      suggestions.push({
        id: createId('suggestion_owner'),
        type: 'issue_missing_owner',
        title: `Issue needs an owner: ${issue.title}`,
        description: 'Blocked work is easier to follow up when every issue has a responsible person.',
        priority: issue.priority,
        relatedEntityType: 'issue',
        relatedEntityId: issue.id,
        status: 'active',
        createdAt: nowISO(),
      });
    });

  units
    .filter((unit) => !['Ready'].includes(unit.overallStatus) && hoursSince(unit.updatedAt) >= 3)
    .slice(0, 8)
    .forEach((unit) => suggestions.push(staleUnitSuggestion(unit)));

  units
    .filter((unit) => unit.cleanStatus === 'Complete' && !['Ready', 'Complete'].includes(unit.inspectionStatus))
    .forEach((unit) => {
      suggestions.push({
        id: createId('suggestion_inspection'),
        type: 'needs_inspection',
        title: `Unit ${unit.unitNumber} may need inspection`,
        description: 'Cleaning is complete, but inspection is not complete.',
        priority: 'High',
        relatedEntityType: 'unit',
        relatedEntityId: unit.id,
        status: 'active',
        createdAt: nowISO(),
      });
    });

  const accessIssues = issues.filter((issue) => ['Access', 'Keys'].includes(issue.category) || /key|access/i.test(`${issue.title} ${issue.notes}`));
  if (accessIssues.length >= 2) {
    suggestions.push({
      id: createId('suggestion_access'),
      type: 'access_bottleneck',
      title: 'Access may be a bottleneck',
      description: `${accessIssues.length} open issue(s) mention keys or access. Consider batching these for Tony/property staff.`,
      priority: 'High',
      status: 'active',
      createdAt: nowISO(),
    });
  }

  assignments
    .filter((assignment) => ['Delayed', 'No Show'].includes(assignment.status))
    .forEach((assignment) => {
      suggestions.push({
        id: createId('suggestion_assignment'),
        type: 'assignment_delay',
        title: `${assignment.teamName} is ${assignment.status.toLowerCase()}`,
        description: assignment.scope || 'Confirm coverage or reassign work.',
        priority: assignment.status === 'No Show' ? 'Critical' : 'High',
        relatedEntityType: 'assignment',
        relatedEntityId: assignment.id,
        status: 'active',
        createdAt: nowISO(),
      });
    });

  const hour = new Date().getHours();
  const hasTodayLog = data.dailyLogs.some((log) => log.projectId === data.activeProjectId && log.date === todayISO());
  if (hour >= 17 && !hasTodayLog) {
    suggestions.push({
      id: createId('suggestion_daily_log'),
      type: 'daily_log_missing',
      title: 'Daily log not created yet',
      description: 'Capture blockers, lessons, and tomorrow priorities before the day gets fuzzy.',
      priority: 'Medium',
      relatedEntityType: 'dailyLog',
      status: 'active',
      createdAt: nowISO(),
    });
  }

  units.filter(isBlockedUnit).slice(0, 4).forEach((unit) => {
    const blockedBy = getUnitBlockingReasons(unit)
      .map(({ label, status }) => `${label}: ${status}`)
      .join('; ');
    suggestions.push({
      id: createId('suggestion_blocked'),
      type: 'blocked_unit',
      title: `Blocked unit: ${unit.unitNumber}`,
      description: `${blockedBy}. Correct the field check or confirm an owner and follow-up time.`,
      priority: 'High',
      relatedEntityType: 'unit',
      relatedEntityId: unit.id,
      status: 'active',
      createdAt: nowISO(),
    });
  });

  return suggestions.slice(0, 16);
};
