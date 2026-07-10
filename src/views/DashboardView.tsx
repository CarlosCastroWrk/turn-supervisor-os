import { AlertTriangle, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import type { AppNavigate } from '../lib/routing';
import type { ActivityLog, AppData, Issue, SmartSuggestion, Unit } from '../types';
import { generateSmartSuggestions } from '../lib/ai/suggestions';
import { formatDate, localISODateFromDateTime, todayISO } from '../lib/constants';
import {
  getActiveProject,
  getPriorityIssues,
  getProjectIssues,
  getProjectUnits,
  getUnitSummary,
  isBlockedUnit,
} from '../lib/metrics';
import { ProgressBar } from '../components/ProgressBar';
import { Section } from '../components/Section';
import { StatCard } from '../components/StatCard';

interface DashboardViewProps {
  data: AppData;
  onNavigate: AppNavigate;
}

const getTurnDay = (startDate: string, endDate: string) => {
  if (!startDate) {
    return 'Dates not set';
  }

  const start = new Date(`${startDate}T12:00:00`);
  const now = new Date(`${todayISO()}T12:00:00`);
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
  const totalDays = end ? Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1) : null;

  if (day < 1) {
    return `Starts in ${Math.abs(day - 1)} day${Math.abs(day - 1) === 1 ? '' : 's'}`;
  }

  return totalDays ? `Day ${Math.min(day, totalDays)} of ${totalDays}` : `Day ${day}`;
};

const firstLines = (value: string, count = 3) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count);

const formatActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const relativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(value.slice(0, 10));
};

export function DashboardView({ data, onNavigate }: DashboardViewProps) {
  const project = getActiveProject(data);
  const units = getProjectUnits(data);
  const projectIssues = getProjectIssues(data);
  const issues = getPriorityIssues(projectIssues);
  const summary = getUnitSummary(units);
  const todayLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === todayISO());
  const priorities = firstLines(todayLog?.tomorrowPriorities || todayLog?.morningPlan || '', 4);
  const smartSuggestions = generateSmartSuggestions(data)
    .filter((suggestion) => suggestion.relatedEntityType !== 'dailyLog')
    .slice(0, 4);
  const issueUnitIds = new Set(issues.map((issue) => issue.unitId).filter(Boolean));
  const blockedUnits = units.filter((unit) => isBlockedUnit(unit) && !issueUnitIds.has(unit.id));
  const projectCrew = data.crewMembers.filter((crew) => crew.projectId === project.id);
  const todayActivity = data.activityLogs
    .filter((activity) => activity.projectId === project.id && localISODateFromDateTime(activity.createdAt) === todayISO())
    .slice(0, 7);

  const navigateToIssue = (issue: Issue) => {
    onNavigate('issues', undefined, { issueId: issue.id });
  };

  const navigateToSuggestion = (suggestion: SmartSuggestion) => {
    if (suggestion.relatedEntityType === 'unit' && suggestion.relatedEntityId) {
      onNavigate('unitDetail', suggestion.relatedEntityId);
      return;
    }

    if (suggestion.relatedEntityType === 'issue' && suggestion.relatedEntityId) {
      onNavigate('issues', undefined, { issueId: suggestion.relatedEntityId });
      return;
    }

    if (suggestion.relatedEntityType === 'assignment') {
      onNavigate('assignments');
      return;
    }

    onNavigate(suggestion.type === 'access_bottleneck' ? 'issues' : 'units');
  };

  const navigateToActivity = (activity: ActivityLog) => {
    if (activity.entityType === 'Unit') {
      onNavigate('unitDetail', activity.entityId);
      return;
    }
    if (activity.entityType === 'Issue') {
      onNavigate('issues', undefined, { issueId: activity.entityId });
      return;
    }
    if (activity.entityType === 'Assignment') {
      onNavigate('assignments');
      return;
    }
    if (activity.entityType === 'PhotoNote') {
      const photo = data.photoNotes.find((item) => item.id === activity.entityId);
      if (photo?.unitId) {
        onNavigate('unitDetail', photo.unitId);
      }
    }
  };

  const attentionItems = [
    ...issues.slice(0, 5).map((issue) => {
      const unit = issue.unitId ? units.find((item) => item.id === issue.unitId) : undefined;
      return {
        id: `issue_${issue.id}`,
        unit: unit ? `Unit ${unit.unitNumber}` : issue.category,
        title: issue.title,
        owner: issue.owner || 'Unassigned',
        updated: relativeTime(issue.updatedAt),
        onClick: () => navigateToIssue(issue),
      };
    }),
    ...blockedUnits.slice(0, 3).map((unit) => {
      const assignedCrew = unit.assignedCrewIds
        .map((crewId) => projectCrew.find((crew) => crew.id === crewId)?.name)
        .filter(Boolean)
        .join(', ');
      return {
        id: `blocked_${unit.id}`,
        unit: `Unit ${unit.unitNumber}`,
        title: unit.notes || unit.overallStatus,
        owner: assignedCrew || 'No crew assigned',
        updated: relativeTime(unit.updatedAt),
        onClick: () => onNavigate('unitDetail', unit.id),
      };
    }),
  ].slice(0, 6);

  const activityUnitLabel = (activity: ActivityLog) => {
    if (activity.entityType !== 'Unit') return activity.entityType;
    const unit = units.find((item: Unit) => item.id === activity.entityId);
    return unit ? `Unit ${unit.unitNumber}` : 'Unit';
  };

  return (
    <div className="page page--dashboard">
      <section className="field-home-header">
        <div>
          <h1>{project.name}</h1>
          <p>{project.propertyName || project.location || 'Current Turn'}</p>
        </div>
        <div className="field-home-header__meta">
          <span>{getTurnDay(project.startDate, project.endDate)}</span>
          <small>{project.mode === 'real' ? 'Real Turn' : 'Demo Mode'} · {formatDate(todayISO())}</small>
        </div>
      </section>

      <section className="readiness-panel" aria-label="Turn readiness overview">
        <ProgressBar value={summary.percentComplete} label="Readiness overview" />
        <div className="readiness-panel__legend" aria-hidden="true">
          <span className="is-ready">{summary.ready} Ready</span>
          <span className="is-progress">{summary.inProgress} In Progress</span>
          <span className="is-blocked">{summary.blocked} Blocked</span>
          <span className="is-inspection">{summary.inspection} Inspection</span>
          <span>{summary.notStarted} Not Started</span>
        </div>
      </section>

      <div className="stats-grid field-home-stats">
        <StatCard label="Units" value={summary.totalUnits} detail="All units" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'All' })} />
        <StatCard label="Ready" value={summary.ready} detail={`${summary.percentComplete}%`} tone="success" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Ready' })} />
        <StatCard label="In Progress" value={summary.inProgress} detail="Moving now" tone="info" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'In Progress' })} />
        <StatCard label="Blocked" value={summary.blocked} detail="Need attention" tone="danger" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Blocked' })} />
        <StatCard label="Inspection" value={summary.inspection} detail="Need final eyes" tone="warning" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Needs Inspection' })} />
      </div>

      <div className="field-home-grid">
        <Section
          title="Needs attention"
          action={<button className="section-link" type="button" onClick={() => onNavigate('issues')}>View all <ArrowRight size={15} aria-hidden="true" /></button>}
          className="field-home-panel"
        >
          <div className="attention-list">
            {attentionItems.map((item) => (
              <button key={item.id} type="button" onClick={item.onClick}>
                <AlertTriangle size={17} aria-hidden="true" />
                <span className="attention-list__unit">{item.unit}</span>
                <span className="attention-list__issue">{item.title}</span>
                <small>{item.owner}</small>
                <time>{item.updated}</time>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
            {attentionItems.length === 0 ? (
              <div className="field-home-empty"><CheckCircle2 size={20} aria-hidden="true" /><span>No active blockers or open issues.</span></div>
            ) : null}
          </div>
        </Section>

        <Section title="Today's movement" className="field-home-panel">
          <div className="movement-list">
            {todayActivity.map((activity) => (
              <button key={activity.id} type="button" onClick={() => navigateToActivity(activity)}>
                <time>{formatActivityTime(activity.createdAt)}</time>
                <span><i aria-hidden="true" />{activity.action}</span>
                <small>{activityUnitLabel(activity)}</small>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
            {todayActivity.length === 0 ? (
              <div className="field-home-empty"><Clock3 size={20} aria-hidden="true" /><span>Your approved captures will appear here.</span></div>
            ) : null}
          </div>
        </Section>
      </div>

      <Section title="Next actions" className="field-home-panel field-home-next">
        <div className="next-action-list">
          {smartSuggestions.map((suggestion) => (
            <button key={suggestion.id} type="button" onClick={() => navigateToSuggestion(suggestion)}>
              <span>{suggestion.title}</span>
              <small>{suggestion.description}</small>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          ))}
          {smartSuggestions.length === 0 && priorities.map((priority) => (
            <div key={priority}>
              <CheckCircle2 size={17} aria-hidden="true" />
              <span>{priority}</span>
            </div>
          ))}
          {smartSuggestions.length === 0 && priorities.length === 0 ? (
            <div className="field-home-empty"><CheckCircle2 size={20} aria-hidden="true" /><span>No next action queued. Capture the next field update when it happens.</span></div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
