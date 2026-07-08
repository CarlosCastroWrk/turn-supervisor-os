import {
  Camera,
  ClipboardPlus,
  FileText,
  ListTodo,
  MessageSquareText,
  UserCheck,
} from 'lucide-react';
import type { AppNavigate } from '../lib/routing';
import type { AppData, DailyLog, Issue, SmartSuggestion, Unit } from '../types';
import { generateSmartSuggestions } from '../lib/ai/suggestions';
import { formatDate, todayISO } from '../lib/constants';
import {
  getActiveProject,
  getPriorityIssues,
  getProjectAssignments,
  getProjectIssues,
  getProjectUnits,
  getTodayAssignments,
  getUnitSummary,
  isBlockedUnit,
} from '../lib/metrics';
import { ProgressBar } from '../components/ProgressBar';
import { QuickAction } from '../components/QuickAction';
import { Section } from '../components/Section';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardViewProps {
  data: AppData;
  onNavigate: AppNavigate;
}

const getTurnDay = (startDate: string) => {
  if (!startDate) {
    return 'Not set';
  }

  const start = new Date(`${startDate}T12:00:00`);
  const now = new Date(`${todayISO()}T12:00:00`);
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;

  if (day < 1) {
    return `Starts in ${Math.abs(day - 1)} day(s)`;
  }

  return `Day ${day}`;
};

const firstLines = (value: string, count = 3) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count);

const unitLabel = (unit?: Unit) => (unit ? `Unit ${unit.unitNumber}` : 'Unit');

export function DashboardView({ data, onNavigate }: DashboardViewProps) {
  const project = getActiveProject(data);
  const units = getProjectUnits(data);
  const issues = getPriorityIssues(getProjectIssues(data));
  const assignments = getTodayAssignments(getProjectAssignments(data), todayISO());
  const summary = getUnitSummary(units);
  const todayLog = data.dailyLogs.find((log): log is DailyLog => log.projectId === project.id && log.date === todayISO());
  const priorities = firstLines(todayLog?.tomorrowPriorities || todayLog?.morningPlan || '', 4);
  const checkedIn = assignments.filter((assignment) => ['Checked In', 'In Progress', 'Complete'].includes(assignment.status));
  const smartSuggestions = generateSmartSuggestions(data).slice(0, 4);
  const blockedUnits = units.filter(isBlockedUnit);

  const navigateToIssue = (issue: Issue) => {
    onNavigate('issues', undefined, { issueId: issue.id });
  };

  const navigateToSuggestion = (suggestion: SmartSuggestion) => {
    if (suggestion.relatedEntityType === 'unit' && suggestion.relatedEntityId) {
      onNavigate('unitDetail', suggestion.relatedEntityId);
      return;
    }

    if (suggestion.relatedEntityType === 'issue' && suggestion.relatedEntityId) {
      const linkedIssue = issues.find((issue) => issue.id === suggestion.relatedEntityId) ?? getProjectIssues(data).find((issue) => issue.id === suggestion.relatedEntityId);
      if (linkedIssue) {
        navigateToIssue(linkedIssue);
        return;
      }
      onNavigate('issues');
      return;
    }

    if (suggestion.relatedEntityType === 'assignment') {
      onNavigate('assignments');
      return;
    }

    if (suggestion.relatedEntityType === 'dailyLog') {
      onNavigate('daily');
      return;
    }

    if (suggestion.type === 'access_bottleneck') {
      onNavigate('issues');
    }
  };

  const attentionItems = [
    ...(!todayLog
      ? [
          {
            id: 'attention_daily_log',
            title: 'Daily log not started',
            detail: 'Capture blockers, progress, and tomorrow priorities.',
            priority: 'Medium' as const,
            onClick: () => onNavigate('daily'),
          },
        ]
      : []),
    ...blockedUnits.slice(0, 3).map((unit) => ({
      id: `attention_blocked_${unit.id}`,
      title: `${unitLabel(unit)} blocked`,
      detail: unit.notes || `Current status: ${unit.overallStatus}`,
      priority: 'High' as const,
      onClick: () => onNavigate('unitDetail', unit.id),
    })),
    ...issues.slice(0, 3).map((issue) => {
      const unit = issue.unitId ? units.find((item) => item.id === issue.unitId) : undefined;
      return {
        id: `attention_issue_${issue.id}`,
        title: issue.title,
        detail: unit ? `${unitLabel(unit)} - ${issue.status}` : `${issue.category} - ${issue.status}`,
        priority: issue.priority,
        onClick: () => navigateToIssue(issue),
      };
    }),
  ].slice(0, 6);

  return (
    <div className="page page--dashboard">
      <section className="hero-panel">
        <div>
          <span className="quiet-label">{formatDate(todayISO())}</span>
          <span className={`mode-pill mode-pill--${project.mode}`}>{project.mode === 'real' ? 'Real Turn Mode' : 'Demo Mode'}</span>
          <h1>{project.name}</h1>
          <p>{project.propertyName}</p>
        </div>
        <div className="turn-day">
          <span>{getTurnDay(project.startDate)}</span>
          <strong>{summary.percentComplete}% Ready</strong>
        </div>
      </section>

      <ProgressBar value={summary.percentComplete} label="Overall readiness" />

      <div className="stats-grid">
        <StatCard label="Units" value={summary.totalUnits} detail="All units" onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'All' })} />
        <StatCard
          label="Ready"
          value={summary.ready}
          detail="Final-ready units"
          tone="success"
          onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Ready' })}
        />
        <StatCard
          label="In Progress"
          value={summary.inProgress}
          detail="Moving now"
          tone="info"
          onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'In Progress' })}
        />
        <StatCard
          label="Blocked"
          value={summary.blocked}
          detail="Need attention"
          tone="danger"
          onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Blocked' })}
        />
        <StatCard
          label="Inspection"
          value={summary.inspection}
          detail="Need final eyes"
          tone="warning"
          onClick={() => onNavigate('units', undefined, { unitStatusFilter: 'Needs Inspection' })}
        />
      </div>

      <Section title="Quick Actions" kicker="1-3 taps">
        <div className="quick-grid">
          <QuickAction icon={ListTodo} label="Add Unit Update" helper="Change status fast" onClick={() => onNavigate('units')} />
          <QuickAction icon={ClipboardPlus} label="Add Issue" helper="Never rely on memory" onClick={() => onNavigate('issues')} />
          <QuickAction icon={Camera} label="Add Photo/Note" helper="Work-only capture" onClick={() => onNavigate('units')} />
          <QuickAction icon={UserCheck} label="Check In Crew" helper="Who is where" onClick={() => onNavigate('assignments')} />
          <QuickAction icon={MessageSquareText} label="Create Daily Log" helper="Capture learning" onClick={() => onNavigate('daily')} />
          <QuickAction icon={FileText} label="Generate Report" helper="Copy to Tony" onClick={() => onNavigate('reports')} />
        </div>
      </Section>

      <div className="dashboard-columns">
        <Section title="Needs Attention" kicker={`${attentionItems.length} active`}>
          <div className="stack">
            {attentionItems.map((item) => (
              <button className="list-card list-card--button" key={item.id} type="button" onClick={item.onClick}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <StatusBadge value={item.priority} size="sm" />
              </button>
            ))}
            {attentionItems.length === 0 ? <p className="muted">No active attention items.</p> : null}
          </div>
        </Section>

        <Section title="Smart Suggestions" kicker="Deterministic">
          <div className="stack">
            {smartSuggestions.map((suggestion) => (
              <button className="list-card list-card--button" key={suggestion.id} type="button" onClick={() => navigateToSuggestion(suggestion)}>
                <div>
                  <strong>{suggestion.title}</strong>
                  <small>{suggestion.description}</small>
                </div>
                <StatusBadge value={suggestion.priority} size="sm" />
              </button>
            ))}
            {smartSuggestions.length === 0 ? <p className="muted">No smart suggestions active.</p> : null}
          </div>
        </Section>

        <Section title="Crews Today" kicker={`${checkedIn.length}/${assignments.length} checked in`}>
          <div className="stack">
            {assignments.map((assignment) => (
              <article className="list-card" key={assignment.id}>
                <div>
                  <strong>{assignment.teamName}</strong>
                  <small>{assignment.scope}</small>
                </div>
                <StatusBadge value={assignment.status} size="sm" />
              </article>
            ))}
            {assignments.length === 0 ? <p className="muted">No assignments scheduled for today.</p> : null}
          </div>
        </Section>
      </div>

      <Section title="Top Priorities" kicker="Today">
        {priorities.length > 0 ? (
          <ol className="priority-list">
            {priorities.map((priority, index) => (
              <li key={`${index}-${priority}`}>{priority}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">Add priorities in Daily Log.</p>
        )}
      </Section>
    </div>
  );
}
