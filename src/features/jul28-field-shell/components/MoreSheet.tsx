import { ChevronRight, Download, FileText, Settings, ShieldCheck, Users } from 'lucide-react';
import { FieldBottomSheet } from './FieldBottomSheet';
import type { MoreDestination } from '../types';

interface MoreSheetProps {
  destinations: MoreDestination[];
  open: boolean;
  onDismiss: () => void;
  onSelect: (destination: MoreDestination) => void;
}

const icons: Record<MoreDestination['id'], React.ElementType> = {
  crews: Users,
  reports: FileText,
  setup: Settings,
  backup: Download,
  sync: ShieldCheck,
};

export function MoreSheet({ destinations, open, onDismiss, onSelect }: MoreSheetProps) {
  return (
    <FieldBottomSheet
      description="Secondary Turn OS tools available in the existing app."
      open={open}
      title="More"
      onDismiss={onDismiss}
    >
      <div className="j28-more-list">
        {destinations.map((destination) => {
          const Icon = icons[destination.id];
          return (
            <button
              key={destination.id}
              data-j28-touch="true"
              type="button"
              onClick={() => onSelect(destination)}
            >
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{destination.label}</strong>
                <small>{destination.detail}</small>
              </span>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </FieldBottomSheet>
  );
}
