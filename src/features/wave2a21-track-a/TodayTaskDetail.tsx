import { NativeDetailShell } from '../wave2a1-native/track-b/NativeDetailShell';
import type { TodayTaskQueueId } from '../wave2a2-track-b/types';
import type {
  CanonicalFieldProjection,
  StartDayResolvedValues,
  StartDayValueSource,
} from './contracts';
import './trackA.css';

const QUEUE_LABELS: Readonly<Record<TodayTaskQueueId, string>> = {
  callbacks: 'Callbacks',
  'needs-crew': 'Needs Crew',
  'needs-inspection': 'Needs Inspection',
  'ready-to-walk': 'Ready for property walk',
  waiting: 'Waiting',
  working: 'Working',
};

export interface TodayTaskDetailProps {
  readonly onBack: () => void;
  readonly onOpenQueue: (queueId: TodayTaskQueueId) => void;
  readonly onOpenUnit?: (unitId: string) => void;
  readonly todayUnits?: readonly {
    readonly sectionCount: number;
    readonly unitId: string;
    readonly unitNumber: string;
  }[];
  readonly onReviewStartDay: () => void;
  readonly projection: CanonicalFieldProjection;
  readonly startDayValues: StartDayResolvedValues;
}

const SOURCE_LABELS: Readonly<Record<StartDayValueSource, string>> = {
  'saved-project-default': 'Saved project default',
  'today-only-override': 'Today-only override',
};

export function TodayTaskDetail({
  onBack,
  onOpenQueue,
  onOpenUnit,
  onReviewStartDay,
  projection,
  startDayValues,
  todayUnits = [],
}: TodayTaskDetailProps) {
  const progress = projection.todayTask.progress;
  const startDayRows = [
    {
      id: 'property-contact',
      label: 'Property contact',
      source: startDayValues.propertyContact.source,
      value: startDayValues.propertyContact.value.name,
    },
    {
      id: 'working-hours',
      label: 'Working hours',
      source: startDayValues.workingHoursWording.source,
      value: startDayValues.workingHoursWording.value,
    },
    {
      id: 'walkthrough',
      label: 'Walkthrough',
      source: startDayValues.walkthroughScheduleWording.source,
      value: startDayValues.walkthroughScheduleWording.value,
    },
    {
      id: 'paint-crews',
      label: 'Paint crews',
      source: startDayValues.activeCrewIdsByTrade.Paint.source,
      value: `${startDayValues.activeCrewIdsByTrade.Paint.value.length} active`,
    },
    {
      id: 'clean-crews',
      label: 'Clean crews',
      source: startDayValues.activeCrewIdsByTrade.Clean.source,
      value: `${startDayValues.activeCrewIdsByTrade.Clean.value.length} active`,
    },
  ] as const;

  return (
    <NativeDetailShell
      backLabel="Back from Today’s Task"
      description="Personal view of today’s confirmed release and field events."
      eyebrow="Today"
      onBack={onBack}
      statusLabel={`${progress.percentage}% inspected`}
      title="Today’s Task"
    >
      <div className="w2a21a-task-detail" data-track-a-today-task-detail="true">
        <section aria-labelledby="w2a21a-task-progress">
          <h2 id="w2a21a-task-progress">Progress</h2>
          <p>{progress.copy}</p>
          <progress
            aria-label={progress.copy}
            max={progress.target || 1}
            value={progress.actual}
          />
          <p>{progress.scopeLabel}. Crew completion does not mean Los inspected or property accepted.</p>
        </section>

        {todayUnits.length > 0 ? (
          <section aria-labelledby="w2a21a-task-units">
            <h2 id="w2a21a-task-units">Units released today · {todayUnits.length}</h2>
            <div className="w2a21a-task-detail__queues">
              {todayUnits.map((unit) => (
                <button
                  key={unit.unitId}
                  onClick={() => onOpenUnit?.(unit.unitId)}
                  type="button"
                >
                  <span>Unit {unit.unitNumber}</span>
                  <strong>{unit.sectionCount} sections</strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="w2a21a-task-queues">
          <h2 id="w2a21a-task-queues">Field queues</h2>
          <div className="w2a21a-task-detail__queues">
            {(Object.keys(QUEUE_LABELS) as TodayTaskQueueId[]).map((queueId) => (
              <button
                key={queueId}
                onClick={() => onOpenQueue(queueId)}
                type="button"
              >
                <span>{QUEUE_LABELS[queueId]}</span>
                <strong>{projection.todayTask.queueCounts[queueId]}</strong>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="w2a21a-task-defaults">
          <h2 id="w2a21a-task-defaults">Start Day choices</h2>
          <dl>
            {startDayRows.map((row) => (
              <div
                data-start-day-source={row.source}
                data-start-day-value={row.id}
                key={row.id}
              >
                <dt>
                  {row.label}
                  <small>{SOURCE_LABELS[row.source]}</small>
                </dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <button onClick={onReviewStartDay} type="button">Review Start Day choices</button>
          <p>
            Changing a saved project default or today-only override does not change today’s confirmed release,
            the paper TurnBoard, property approval, or payroll.
          </p>
        </section>
      </div>
    </NativeDetailShell>
  );
}
