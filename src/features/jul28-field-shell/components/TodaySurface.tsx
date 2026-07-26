import {
  ChevronRight,
  CircleAlert,
  FileCheck2,
  HardDrive,
  KeyRound,
  PaintRoller,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { orderFieldTasks, summarizeNeedsMe } from '../projection';
import type { FieldTask, NeedsMeCategory, NeedsMeItem } from '../types';

interface TodaySurfaceProps {
  needsMe: NeedsMeItem[];
  tasks: FieldTask[];
  onOpenNeedsMe: () => void;
  onSelectNeed: (item: NeedsMeItem) => void;
  onSelectTask: (task: FieldTask) => void;
}

const slotLabels = {
  current: 'Now',
  next: 'Next',
  backup: 'Backup',
};

const categoryIcons: Record<NeedsMeCategory, React.ElementType> = {
  'ready-for-my-walk': CircleAlert,
  'missing-follow-up-owner': UserRound,
  'needs-paper-review': FileCheck2,
  'saved-on-this-device': HardDrive,
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

export function TodaySurface({
  needsMe,
  tasks,
  onOpenNeedsMe,
  onSelectNeed,
  onSelectTask,
}: TodaySurfaceProps) {
  const orderedTasks = orderFieldTasks(tasks);
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

        <div className="j28-task-list">
          {orderedTasks.map((task) => (
            <article key={task.id} className={`j28-task j28-task--${task.slot}`}>
              <span className="j28-task__slot">{slotLabels[task.slot]}</span>
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
    </div>
  );
}
