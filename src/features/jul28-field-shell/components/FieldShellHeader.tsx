import { Bell, MapPin, UserRound } from 'lucide-react';
import type { RefObject } from 'react';
import type { FieldTodayContext } from '../types';

interface FieldShellHeaderProps {
  attentionCount: number;
  context: FieldTodayContext;
  bellRef?: RefObject<HTMLButtonElement | null>;
  onOpenNeedsMe: () => void;
}

export function FieldShellHeader({
  attentionCount,
  context,
  bellRef,
  onOpenNeedsMe,
}: FieldShellHeaderProps) {
  const attentionLabel = attentionCount === 1 ? '1 item needs you' : `${attentionCount} items need you`;

  return (
    <header className="j28-header">
      <div className="j28-brand" aria-label="Turn OS, Supervisor">
        <strong>Turn <span>OS</span></strong>
        <small><UserRound size={16} aria-hidden="true" /> Supervisor</small>
      </div>
      <div className="j28-header__context" aria-label={`Current property ${context.propertyName}. ${context.dateLabel}.`}>
        <MapPin size={17} aria-hidden="true" />
        <span>
          <strong>{context.propertyName}</strong>
          <time dateTime={context.dateISO}>{context.dateLabel}</time>
        </span>
      </div>
      <button
        ref={bellRef}
        className="j28-bell"
        data-j28-touch="true"
        type="button"
        onClick={onOpenNeedsMe}
        aria-label={`Open Needs Me. ${attentionLabel}.`}
        aria-haspopup="dialog"
      >
        <Bell size={24} aria-hidden="true" />
        {attentionCount > 0 ? <span aria-hidden="true">{attentionCount}</span> : null}
      </button>
    </header>
  );
}
