import { CalendarDays, ListChecks, MoreHorizontal } from 'lucide-react';
import { FIELD_NAVIGATION } from '../projection';
import type { FieldDestination } from '../types';

interface FieldNavigationProps {
  activeDestination: FieldDestination;
  dialogOpen?: boolean;
  onNavigate: (destination: FieldDestination) => void;
}

const icons = {
  today: CalendarDays,
  turnboard: ListChecks,
  more: MoreHorizontal,
};

export function FieldNavigation({
  activeDestination,
  dialogOpen = false,
  onNavigate,
}: FieldNavigationProps) {
  return (
    <nav
      className="j28-nav"
      aria-label="Turn OS navigation"
      aria-hidden={dialogOpen || undefined}
      inert={dialogOpen || undefined}
    >
      {FIELD_NAVIGATION.map((item) => {
        const Icon = icons[item.id];
        const active = item.id === activeDestination;
        return (
          <button
            key={item.id}
            className={active ? 'is-active' : undefined}
            data-j28-touch="true"
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            aria-haspopup={item.id === 'more' ? 'dialog' : undefined}
          >
            <Icon size={22} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
