import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  CloudOff,
  FileCheck2,
  Footprints,
  History,
  KeyRound,
  MapPin,
  PaintRoller,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { orderPersonalPlan, summarizeNeedsMe } from '../projection';
import type {
  FieldPersonalPlan,
  FieldRecentActivityItem,
  FieldScheduleItem,
  FieldTask,
  FieldTaskSlot,
  FieldTodayContext,
  FieldWorkItem,
  FieldWorkspaceDestination,
  NeedsMeCategory,
  NeedsMeItem,
} from '../types';

interface TodaySurfaceProps {
  assignedWork: FieldWorkItem[];
  context: FieldTodayContext;
  endOfDayPaperReconciliation: FieldScheduleItem;
  needsMe: NeedsMeItem[];
  nextPropertyWalk: FieldScheduleItem;
  personalPlan: FieldPersonalPlan;
  progressingWork: FieldWorkItem[];
  recentActivity: FieldRecentActivityItem[];
  onOpenNeedsMe: () => void;
  onOpenWorkspace: (destination: FieldWorkspaceDestination) => void;
  onSelectNeed: (item: NeedsMeItem) => void;
  onSelectTask: (task: FieldTask) => void;
}

const slotLabels: Record<FieldTaskSlot, string> = {
  now: 'Now',
  next: 'Next',
  backup: 'Backup',
};

const categoryIcons: Record<NeedsMeCategory, React.ElementType> = {
  'needs-confirmation': CircleHelp,
  'needs-my-inspection': ClipboardCheck,
  callbacks: RotateCcw,
  'property-walks': Footprints,
  'assignment-conflicts': ShieldAlert,
  'access-blockers': KeyRound,
  'maintenance-blockers': Wrench,
  'save-or-sync-problems': CloudOff,
  'paper-reconciliation': FileCheck2,
};

const TaskIcon = ({ task }: { task: FieldTask }) => {
  if (task.trade === 'Paint') {
    return <PaintRoller aria-hidden="true" />;
  }
  if (task.trade === 'Clean') {
    return <Sparkles aria-hidden="true" />;
  }
  return <KeyRound aria-hidden="true" />;
};

const WorkList = ({
  heading,
  items,
  onOpenWorkspace,
}: {
  heading: string;
  items: FieldWorkItem[];
  onOpenWorkspace: (destination: FieldWorkspaceDestination) => void;
}) => (
  <section className="j28-work-group" aria-label={heading}>
    <div className="j28-work-group__heading">
      <h3>{heading}</h3>
      <span>{items.length}</span>
    </div>
    {items.length > 0 ? (
      <div className="j28-work-list">
        {items.map((item) => (
          <button
            key={item.id}
            data-j28-touch="true"
            type="button"
            onClick={() => onOpenWorkspace(item.destination)}
            aria-label={`Open ${item.destination.label}. Unit ${item.unitNumber}, ${item.trade}, scope ${item.scope.join(', ')}.`}
          >
            <span className={`j28-work-list__icon ${item.trade === 'Clean' ? 'is-clean' : ''}`}>
              {item.trade === 'Paint'
                ? <PaintRoller size={20} aria-hidden="true" />
                : <Sparkles size={20} aria-hidden="true" />}
            </span>
            <span>
              <strong>Unit {item.unitNumber}</strong>
              <small>{item.trade} · {item.scope.join(', ')}</small>
              <span>{item.detail}</span>
              {item.responsibleCrew ? <em>Responsible crew: {item.responsibleCrew}</em> : null}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
    ) : (
      <p className="j28-empty">No personal work is listed here.</p>
    )}
  </section>
);

const ScheduleCard = ({
  item,
  onOpenWorkspace,
}: {
  item: FieldScheduleItem;
  onOpenWorkspace: (destination: FieldWorkspaceDestination) => void;
}) => (
  <button
    className="j28-schedule-card"
    data-j28-touch="true"
    type="button"
    onClick={() => onOpenWorkspace(item.destination)}
    aria-label={`${item.title}, ${item.timeLabel}, Unit ${item.unitNumber}. Open ${item.destination.label}.`}
  >
    <CalendarClock size={22} aria-hidden="true" />
    <span>
      <small>{item.timeLabel}</small>
      <strong>{item.title}</strong>
      <span>Unit {item.unitNumber} · {item.detail}</span>
      <em>Opens {item.destination.label}</em>
    </span>
    <ChevronRight size={19} aria-hidden="true" />
  </button>
);

export function TodaySurface({
  assignedWork,
  context,
  endOfDayPaperReconciliation,
  needsMe,
  nextPropertyWalk,
  personalPlan,
  progressingWork,
  recentActivity,
  onOpenNeedsMe,
  onOpenWorkspace,
  onSelectNeed,
  onSelectTask,
}: TodaySurfaceProps) {
  const personalPlanEntries = orderPersonalPlan(personalPlan);
  const needsSummary = summarizeNeedsMe(needsMe);

  return (
    <div className="j28-today">
      <section className="j28-today__plan" aria-labelledby="j28-today-title">
        <div className="j28-section-heading">
          <div>
            <p>Personal supervisor plan</p>
            <h1 id="j28-today-title">Today</h1>
          </div>
          <span>Paper remains authoritative</span>
        </div>

        <div className="j28-today-context" aria-label={`Current property ${context.propertyName}. ${context.dateLabel}.`}>
          <MapPin size={19} aria-hidden="true" />
          <span>
            <strong>{context.propertyName}</strong>
            <time dateTime={context.dateISO}>{context.dateLabel}</time>
          </span>
        </div>

        <div className="j28-task-list">
          {personalPlanEntries.map(({ slot, task }) => (
            <article key={slot} className={`j28-task j28-task--${slot}`}>
              <span className="j28-task__slot">{slotLabels[slot]}</span>
              {task ? (
                <button
                  data-j28-touch="true"
                  type="button"
                  onClick={() => onSelectTask(task)}
                  aria-label={`Open personal task: Unit ${task.unitNumber}, ${task.label}`}
                >
                  <span className="j28-task__icon"><TaskIcon task={task} /></span>
                  <span className="j28-task__content">
                    <strong>Unit {task.unitNumber}</strong>
                    <span>{task.label}</span>
                    <small>Scope: {task.scope.join(', ')}</small>
                    {task.warning ? <em><CircleAlert size={15} aria-hidden="true" />{task.warning}</em> : null}
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              ) : (
                <div className="j28-task__empty">No personal {slotLabels[slot].toLowerCase()} task selected.</div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="j28-needs-summary" aria-labelledby="j28-needs-summary-title">
        <div className="j28-section-heading j28-section-heading--compact">
          <div>
            <p>Actionable reminders</p>
            <h2 id="j28-needs-summary-title">Needs Me</h2>
          </div>
          <button data-j28-touch="true" type="button" onClick={onOpenNeedsMe}>Open all</button>
        </div>

        {needsSummary.length > 0 ? (
          <div className="j28-needs-summary__list">
            {needsSummary.map((summary) => {
              const Icon = categoryIcons[summary.category];
              const firstItem = needsMe.find((item) => item.category === summary.category);
              return (
                <button
                  key={summary.category}
                  data-j28-touch="true"
                  type="button"
                  onClick={() => firstItem && onSelectNeed(firstItem)}
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{summary.label}</span>
                  <strong aria-label={`${summary.count} items`}>{summary.count}</strong>
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="j28-empty">Nothing is waiting in your personal list.</p>
        )}
        <p className="j28-safety-copy">These are personal prompts. Confirm scope and marks on the paper TurnBoard.</p>
      </section>

      <section className="j28-today-work" aria-labelledby="j28-today-work-title">
        <div className="j28-section-heading j28-section-heading--compact">
          <div>
            <p>Variable work lists</p>
            <h2 id="j28-today-work-title">Today&apos;s work</h2>
          </div>
        </div>
        <div className="j28-today-work__grid">
          <WorkList heading="Today's assigned work" items={assignedWork} onOpenWorkspace={onOpenWorkspace} />
          <WorkList heading="Work progressing" items={progressingWork} onOpenWorkspace={onOpenWorkspace} />
        </div>
      </section>

      <section className="j28-schedule" aria-labelledby="j28-schedule-title">
        <div className="j28-section-heading j28-section-heading--compact">
          <div>
            <p>Schedule & closeout</p>
            <h2 id="j28-schedule-title">Keep the day aligned</h2>
          </div>
        </div>
        <div className="j28-schedule__list">
          <ScheduleCard item={nextPropertyWalk} onOpenWorkspace={onOpenWorkspace} />
          <ScheduleCard item={endOfDayPaperReconciliation} onOpenWorkspace={onOpenWorkspace} />
        </div>
      </section>

      <details className="j28-recent-activity" data-testid="recent-activity">
        <summary data-j28-touch="true">
          <History size={20} aria-hidden="true" />
          <span>
            <strong>Recent activity</strong>
            <small>Collapsed by default · {recentActivity.length} personal records</small>
          </span>
          <ChevronDown size={19} aria-hidden="true" />
        </summary>
        <div className="j28-recent-activity__list">
          {recentActivity.map((item) => (
            <button
              key={item.id}
              data-j28-touch="true"
              type="button"
              onClick={() => onOpenWorkspace(item.destination)}
            >
              <time>{item.timeLabel}</time>
              <span><strong>Unit {item.unitNumber}</strong>{item.summary}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
