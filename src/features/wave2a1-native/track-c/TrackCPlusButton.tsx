import { Plus } from 'lucide-react';

interface TrackCPlusButtonProps {
  label?: string;
  onClick: () => void;
}

export function TrackCPlusButton({
  label = 'Open add menu',
  onClick,
}: TrackCPlusButtonProps) {
  return (
    <button
      aria-label={label}
      className="tc-plus-button"
      data-track-c-critical-target="true"
      onClick={onClick}
      type="button"
    >
      <Plus aria-hidden="true" size={25} strokeWidth={2.2} />
    </button>
  );
}
