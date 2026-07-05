interface QuickActionProps {
  icon: React.ElementType;
  label: string;
  helper?: string;
  onClick: () => void;
}

export function QuickAction({ icon: Icon, label, helper, onClick }: QuickActionProps) {
  return (
    <button className="quick-action" type="button" onClick={onClick}>
      <Icon size={22} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {helper ? <small>{helper}</small> : null}
      </span>
    </button>
  );
}

