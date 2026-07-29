import { NativeDetailShell } from '../wave2a1-native/track-b/NativeDetailShell';
import type { TodayTaskQueueId } from '../wave2a2-track-b/types';
import type {
  CanonicalFieldProjection,
  StartDaySavedDefaults,
} from './contracts';
import './trackA.css';

const QUEUE_LABELS: Readonly<Record<TodayTaskQueueId, string>> = {
  callbacks: 'Callbacks',
  'ready-to-walk': 'Ready for property walk',
  waiting: 'Waiting',
  working: 'Working',
};

export interface TodayTaskDetailProps {
  readonly defaults: StartDaySavedDefaults;
  readonly onBack: () => void;
  readonly onEditDefaults: () => void;
  readonly onOpenQueue: (queueId: TodayTaskQueueId) => void;
  readonly projection: CanonicalFieldProjection;
}

export function TodayTaskDetail({
  defaults,
  onBack,
  onEditDefaults,
  onOpenQueue,
  projection,
}: TodayTaskDetailProps) {
  const progress = projection.todayTask.progress;
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
          <h2 id="w2a21a-task-defaults">Saved day defaults</h2>
          <dl>
            <div><dt>Property contact</dt><dd>{defaults.propertyContact}</dd></div>
            <div><dt>Working hours</dt><dd>{defaults.workingHoursWording}</dd></div>
            <div><dt>Walkthrough</dt><dd>{defaults.walkthroughScheduleWording}</dd></div>
            <div>
              <dt>Default crews</dt>
              <dd>
                Paint {defaults.activeCrewIdsByTrade.Paint.length}
                {' · '}
                Clean {defaults.activeCrewIdsByTrade.Clean.length}
              </dd>
            </div>
          </dl>
          <button onClick={onEditDefaults} type="button">Edit personal defaults</button>
          <p>
            Editing personal defaults does not change today’s confirmed release,
            the paper TurnBoard, property approval, or payroll.
          </p>
        </section>
      </div>
    </NativeDetailShell>
  );
}
