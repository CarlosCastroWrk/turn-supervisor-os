interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="progress-wrap" aria-label={label ?? 'Progress'}>
      <div className="progress-meta">
        <span>{label ?? 'Progress'}</span>
        <strong>{clamped}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

