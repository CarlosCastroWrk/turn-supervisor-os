import { AlertTriangle, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import type { AppNavigate } from '../lib/routing';
import type { AppDataSaveStatus } from '../lib/storage';
import type { SyncController } from '../lib/supabase/sync';
import type { ActivityLog, AppData, SmartSuggestion, Unit } from '../types';
import { generateSmartSuggestions } from '../lib/ai/suggestions';
import { formatDate, localISODateFromDateTime, todayISO } from '../lib/constants';
import {
  getActiveProject,
  getProjectUnits,
  getUnitSummary,
} from '../lib/metrics';
import { buildTodayProjection, type TodayActionItem } from '../lib/todayProjection';
import { ProgressBar } from '../components/ProgressBar';
import { Section } from '../components/Section';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardViewProps {
  data: AppData;
  onNavigate: AppNavigate;
  saveStatus: AppDataSaveStatus;
  sync: Pick<SyncController, 'message' | 'status'>;
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

export function DashboardView({ data, onNavigate, saveStatus, sync }: DashboardViewProps) {
  const project = getActiveProject(data);
  const units = getProjectUnits(data);
  const summary = getUnitSummary(units);
  const today = buildTodayProjection(data, saveStatus, sync);
  const todayLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === todayISO());
  const priorities = firstLines(todayLog?.tomorrowPriorities || todayLog?.morningPlan || '', 4);
  const smartSuggestions = generateSmartSuggestions(data)
    .filter((suggestion) => suggestion.relatedEntityType !== 'dailyLog')
    .slice(0, 4);
  const todayActivity = data.activityLogs
    .filter((activity) => activity.projectId === project.id && localISODateFromDateTime(activity.createdAt) === todayISO())
    .slice(0, 7);

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

  const openTodayItem = (item: TodayActionItem) => {
    if (item.target.view === 'unitDetail') {
      onNavigate('unitDetail', item.target.recordId);
      return;
    }
    if (item.target.view === 'issues' && item.target.recordId) {
      onNavigate('issues', undefined, { issueId: item.target.recordId });
      return;
    }
    onNavigate(item.target.view);
  };

  const activityUnitLabel = (activity: ActivityLog) => {
    if (activity.entityType !== 'Unit') return activity.entityType;
    const unit = units.find((item: Unit) => item.id === activity.entityId);
    return unit ? `Unit ${unit.unitNumber}` : 'Unit';
  };

  return (
    <div className="page page--dashboard">
      <section className="field-home-header">
        <div>
          <span className="quiet-label">Los&apos;s personal field view</span>
          <h1>TODAY</h1>
          <p>{project.name} · {project.propertyName || project.location || 'Current Turn'}</p>
        </div>
        <div className="field-home-header__meta">
          <span>{getTurnDay(project.startDate, project.endDate)}</span>
          <small>{project.mode === 'real' ? 'Real Turn' : 'Demo Mode'} · {formatDate(todayISO())}</small>
        </div>
      </section>

      <Section
        title="What needs your attention"
        kicker="Personal app records only"
        action={<button className="section-link" type="button" onClick={() => onNavigate('review')}>Open Review <ArrowRight size={15} aria-hidden="true" /></button>}
        className="today-action-panel"
      >
        <div className="today-counts" aria-label="Today attention counts">
          <span><strong>{today.draftCount}</strong> Drafts</span>
          <span><strong>{today.issueCount}</strong> Issues</span>
          <span><strong>{today.followUpCount}</strong> Follow-ups</span>
          <span><strong>{today.reliabilityCount}</strong> Save / Sync</span>
        </div>
        <div className="today-action-list">
          {today.items.slice(0, 8).map((item) => (
            <button key={item.id} type="button" onClick={() => openTodayItem(item)}>
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <StatusBadge value={item.sourceStatus} size="sm" />
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
          {today.items.length === 0 ? (
            <div className="field-home-empty">
              <CheckCircle2 size={20} aria-hidden="true" />
              <span>No unresolved personal app items are visible right now. Verify the paper TurnBoard separately.</span>
            </div>
          ) : null}
        </div>
        <div className="today-action-panel__links">
          <button type="button" onClick={() => onNavigate('units')}>Open TurnBoard</button>
          <button type="button" onClick={() => onNavigate('review')}>Open full Review</button>
        </div>
      </Section>

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
