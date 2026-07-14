import type { AppData, AppView, SmartSuggestion, SuggestionPriority, UnitStatusFilter } from '../types';
import { generateSmartSuggestions } from './ai/suggestions';
import { localISODateFromDateTime, todayISO } from './constants';
import {
  getActiveProject,
  getIssuesForProject,
  getUnitSummary,
  getUnitsForProject,
} from './metrics';

export interface TurnPulseTarget {
  view: AppView;
  issueId?: string;
  unitId?: string;
  unitStatusFilter?: UnitStatusFilter;
}

export interface TurnPulseAction {
  id: string;
  title: string;
  reason: string;
  priority: SuggestionPriority;
  target: TurnPulseTarget;
}

export interface TurnPulse {
  date: string;
  headline: string;
  evidence: string;
  actions: TurnPulseAction[];
}

const priorityWeight: Record<SuggestionPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const typeWeight: Record<string, number> = {
  critical_issue: 8,
  assignment_delay: 7,
  blocked_unit: 6,
  needs_inspection: 5,
  access_bottleneck: 4,
  issue_missing_owner: 3,
  stale_unit: 2,
  daily_log_missing: 1,
};

const suggestionTarget = (suggestion: SmartSuggestion): TurnPulseTarget => {
  if (suggestion.relatedEntityType === 'issue' && suggestion.relatedEntityId) {
    return { view: 'issues', issueId: suggestion.relatedEntityId };
  }
  if (suggestion.relatedEntityType === 'unit' && suggestion.relatedEntityId) {
    return { view: 'unitDetail', unitId: suggestion.relatedEntityId };
  }
  if (suggestion.relatedEntityType === 'assignment') {
    return { view: 'assignments' };
  }
  if (suggestion.relatedEntityType === 'dailyLog') {
    return { view: 'daily' };
  }
  if (suggestion.type === 'access_bottleneck') {
    return { view: 'issues' };
  }
  return { view: 'units', unitStatusFilter: 'All' };
};

const stableActionId = (suggestion: SmartSuggestion) =>
  `turn_pulse_${suggestion.type}_${suggestion.relatedEntityId ?? 'general'}`;

const actionKey = (suggestion: SmartSuggestion) =>
  suggestion.relatedEntityType && suggestion.relatedEntityId
    ? `${suggestion.relatedEntityType}:${suggestion.relatedEntityId}`
    : suggestion.type;

const rankedActions = (suggestions: SmartSuggestion[]) => {
  const seen = new Set<string>();
  return [...suggestions]
    .sort((a, b) =>
      priorityWeight[b.priority] - priorityWeight[a.priority] ||
      (typeWeight[b.type] ?? 0) - (typeWeight[a.type] ?? 0) ||
      a.title.localeCompare(b.title),
    )
    .filter((suggestion) => {
      const key = actionKey(suggestion);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((suggestion) => ({
      id: stableActionId(suggestion),
      title: suggestion.title,
      reason: suggestion.description,
      priority: suggestion.priority,
      target: suggestionTarget(suggestion),
    }));
};

const plural = (count: number, singular: string, pluralValue = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralValue}`;

export const buildTurnPulse = (data: AppData, now = new Date()): TurnPulse => {
  const project = getActiveProject(data);
  const scopedData = project.id === data.activeProjectId ? data : { ...data, activeProjectId: project.id };
  const units = getUnitsForProject(data, project.id);
  const issues = getIssuesForProject(data, project.id).filter((issue) => !['Closed', 'Resolved'].includes(issue.status));
  const summary = getUnitSummary(units);
  const criticalIssues = issues.filter((issue) => issue.priority === 'Critical').length;
  const date = localISODateFromDateTime(now.toISOString()) || todayISO();
  const activityCount = data.activityLogs.filter(
    (activity) => activity.projectId === project.id && localISODateFromDateTime(activity.createdAt) === date,
  ).length;

  let headline = `${summary.ready} of ${summary.totalUnits} units are Ready.`;
  if (summary.totalUnits === 0) {
    headline = 'Set up this Turn to start a live field pulse.';
  } else if (criticalIssues > 0) {
    headline = `${plural(criticalIssues, 'critical issue')} ${criticalIssues === 1 ? 'needs' : 'need'} attention now.`;
  } else if (summary.blocked > 0) {
    headline = `${plural(summary.blocked, 'blocked unit')} ${summary.blocked === 1 ? 'needs' : 'need'} an owner or next step.`;
  } else if (summary.inspection > 0) {
    headline = `${plural(summary.inspection, 'unit')} ${summary.inspection === 1 ? 'is' : 'are'} waiting for final inspection.`;
  } else if (summary.ready === summary.totalUnits) {
    headline = `All ${plural(summary.totalUnits, 'unit')} are marked Ready.`;
  }

  const actions: TurnPulseAction[] = summary.totalUnits === 0
    ? [{
        id: 'turn_pulse_setup_active_turn',
        title: 'Finish Turn setup',
        reason: 'Add this property’s buildings and units before relying on the field pulse.',
        priority: 'High',
        target: { view: 'setup' },
      }]
    : rankedActions(generateSmartSuggestions(scopedData));

  return {
    date,
    headline,
    evidence: `${plural(activityCount, 'recorded update')} today · ${plural(issues.length, 'open issue')} · ${summary.percentComplete}% ready`,
    actions,
  };
};
