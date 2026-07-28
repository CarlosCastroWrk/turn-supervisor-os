import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import './trackB.css';

export interface NativeDetailShellProps {
  children: ReactNode;
  title: string;
  backLabel?: string;
  description?: string;
  eyebrow?: string;
  statusLabel?: string;
  trailingAction?: ReactNode;
  onBack?: () => void;
}
export function NativeDetailShell({
  backLabel = 'Back',
  children,
  description,
  eyebrow,
  onBack,
  statusLabel,
  title,
  trailingAction,
}: NativeDetailShellProps) {
  const titleId = useId();

  return (
    <section
      className="w2a1b-page"
      data-track-b-native-shell="true"
      aria-labelledby={titleId}
    >
      <header className="w2a1b-page__bar">
        <div className="w2a1b-page__bar-side">
          {onBack ? (
            <button
              aria-label={backLabel}
              className="w2a1b-icon-button"
              type="button"
              onClick={onBack}
            >
              <ArrowLeft aria-hidden="true" size={22} />
            </button>
          ) : null}
        </div>
        <strong className="w2a1b-page__compact-title">{title}</strong>
        <div className="w2a1b-page__bar-side w2a1b-page__bar-side--trailing">
          {trailingAction}
        </div>
      </header>

      <div className="w2a1b-page__content">
        <div className="w2a1b-page__heading">
          {eyebrow ? <p className="w2a1b-eyebrow">{eyebrow}</p> : null}
          <h1 id={titleId}>{title}</h1>
          {description ? <p>{description}</p> : null}
          {statusLabel ? (
            <p className="w2a1b-status-pill" role="status">{statusLabel}</p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export interface GroupedInsetSectionProps {
  children: ReactNode;
  label?: string;
  footer?: string;
}

export function GroupedInsetSection({
  children,
  footer,
  label,
}: GroupedInsetSectionProps) {
  return (
    <section className="w2a1b-group" aria-label={label}>
      {label ? <h2>{label}</h2> : null}
      <div className="w2a1b-group__card">{children}</div>
      {footer ? <p className="w2a1b-group__footer">{footer}</p> : null}
    </section>
  );
}

export interface GroupedInsetRowProps {
  label: string;
  detail?: string;
  icon?: ReactNode;
  value?: string;
  danger?: boolean;
  tone?: 'attention' | 'ready' | 'unknown';
  onActivate?: () => void;
}

export function GroupedInsetRow({
  danger = false,
  detail,
  icon,
  label,
  onActivate,
  tone,
  value,
}: GroupedInsetRowProps) {
  const className = [
    'w2a1b-row',
    danger ? 'w2a1b-row--danger' : '',
    tone ? `w2a1b-row--${tone}` : '',
  ].filter(Boolean).join(' ');
  const content = (
    <>
      {icon ? <span className="w2a1b-row__icon" aria-hidden="true">{icon}</span> : null}
      <span className="w2a1b-row__copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {value ? <span className="w2a1b-row__value">{value}</span> : null}
      {onActivate ? <ChevronRight className="w2a1b-row__chevron" aria-hidden="true" size={20} /> : null}
    </>
  );

  if (onActivate) {
    return (
      <button
        className={className}
        type="button"
        onClick={onActivate}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}
