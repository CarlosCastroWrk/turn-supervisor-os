import { ChevronRight, Link, ShieldCheck } from 'lucide-react';
import type { PersonalActivityViewModel } from './types';
import { NativeSheet } from './NativeSheet';

export interface PersonalActivityCardProps {
  item: PersonalActivityViewModel;
  onOpen: (item: PersonalActivityViewModel) => void;
}

export interface PersonalActivityDetailSheetProps {
  item: PersonalActivityViewModel | null;
  onDismiss: () => void;
  onOpenUnit?: (unitId: string) => void;
}

const formatActivityTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

export function PersonalActivityCard({
  item,
  onOpen,
}: PersonalActivityCardProps) {
  return (
    <button
      aria-label={`Open personal note${item.unitNumber ? ` for Unit ${item.unitNumber}` : ''}`}
      className="tc-activity-card"
      data-track-c-critical-target="true"
      onClick={() => onOpen(item)}
      type="button"
    >
      <span>
        <strong>{item.activity.action}</strong>
        <small>
          {item.unitNumber ? `Unit ${item.unitNumber}` : item.projectLabel}
          {' · '}
          {formatActivityTime(item.activity.createdAt)}
        </small>
        <span>{item.activity.note}</span>
      </span>
      <ChevronRight aria-hidden="true" size={19} />
    </button>
  );
}

export function PersonalActivityDetailSheet({
  item,
  onDismiss,
  onOpenUnit,
}: PersonalActivityDetailSheetProps) {
  if (!item) return null;
  return (
    <NativeSheet
      description="Inspectable personal Activity. This record does not represent official completion or approval."
      onDismiss={onDismiss}
      title="Personal Note"
    >
      <article className="tc-activity-detail">
        <div className="tc-activity-detail__meta">
          <strong>{item.activity.action}</strong>
          <time dateTime={item.activity.createdAt}>
            {formatActivityTime(item.activity.createdAt)}
          </time>
        </div>
        <p>{item.activity.note}</p>
        <dl>
          <div>
            <dt>Project</dt>
            <dd>{item.projectLabel}</dd>
          </div>
          <div>
            <dt>Context</dt>
            <dd>{item.unitNumber ? `Unit ${item.unitNumber}` : 'Project Activity'}</dd>
          </div>
        </dl>
        {item.unitId && onOpenUnit ? (
          <button
            className="tc-unit-link"
            data-track-c-critical-target="true"
            onClick={() => onOpenUnit(item.unitId!)}
            type="button"
          >
            <Link aria-hidden="true" size={18} />
            Open Unit {item.unitNumber}
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        ) : null}
        <p className="tc-safety-copy">
          <ShieldCheck aria-hidden="true" size={17} />
          Personal app record. Paper remains authoritative.
        </p>
      </article>
    </NativeSheet>
  );
}
