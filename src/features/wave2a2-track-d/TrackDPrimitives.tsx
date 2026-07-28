import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { TrackDSaveReceipt } from './model';

export interface TrackDPageProps {
  children: ReactNode;
  description: string;
  onBack?: () => void;
  statusLabel?: string;
  title: string;
}

export function TrackDPage({
  children,
  description,
  onBack,
  statusLabel,
  title,
}: TrackDPageProps) {
  return (
    <div className="w2a2d-page" data-track-d-page={title}>
      <header className="w2a2d-page__bar">
        <span className="w2a2d-page__bar-side">
          {onBack ? (
            <button
              aria-label={`Back from ${title}`}
              className="w2a2d-icon-button"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={23} />
            </button>
          ) : null}
        </span>
        <strong className="w2a2d-page__compact-title">{title}</strong>
        <span className="w2a2d-page__bar-side" />
      </header>
      <div className="w2a2d-page__content">
        <header className="w2a2d-page__heading">
          <h1>{title}</h1>
          <p>{description}</p>
          {statusLabel ? (
            <p className="w2a2d-status-pill">{statusLabel}</p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export interface TrackDSectionProps {
  children: ReactNode;
  footer?: string;
  label: string;
}

export function TrackDSection({
  children,
  footer,
  label,
}: TrackDSectionProps) {
  return (
    <section className="w2a2d-group">
      <h2>{label}</h2>
      <div className="w2a2d-group__card">{children}</div>
      {footer ? <p className="w2a2d-group__footer">{footer}</p> : null}
    </section>
  );
}

export interface TrackDRowProps {
  danger?: boolean;
  detail?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onActivate?: () => void;
  value?: string;
}

export function TrackDRow({
  danger = false,
  detail,
  disabled = false,
  icon,
  label,
  onActivate,
  value,
}: TrackDRowProps) {
  const content = (
    <>
      {icon ? (
        <span className="w2a2d-row__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="w2a2d-row__copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {value ? <span className="w2a2d-row__value">{value}</span> : null}
      {onActivate && !disabled ? (
        <ChevronRight aria-hidden="true" className="w2a2d-row__chevron" size={19} />
      ) : null}
    </>
  );

  if (!onActivate) {
    return (
      <div
        className={`w2a2d-row${danger ? ' w2a2d-row--danger' : ''}${
          disabled ? ' w2a2d-row--disabled' : ''
        }`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      className={`w2a2d-row${danger ? ' w2a2d-row--danger' : ''}${
        disabled ? ' w2a2d-row--disabled' : ''
      }`}
      disabled={disabled}
      onClick={onActivate}
      type="button"
    >
      {content}
    </button>
  );
}

interface TrackDReceiptProps {
  onDismiss: () => void;
  onUndo: (recordId: string) => void;
  onView: (recordId: string) => void;
  receipt: TrackDSaveReceipt;
}

export function TrackDReceipt({
  onDismiss,
  onUndo,
  onView,
  receipt,
}: TrackDReceiptProps) {
  return (
    <aside
      aria-label={receipt.message}
      aria-live="polite"
      className="w2a2d-receipt"
      role="status"
    >
      <strong>{receipt.message}</strong>
      <span className="w2a2d-receipt__actions">
        <button
          data-track-d-critical-target="receipt-action"
          onClick={() => onView(receipt.recordId)}
          type="button"
        >
          View
        </button>
        <button
          data-track-d-critical-target="receipt-action"
          onClick={() => onUndo(receipt.recordId)}
          type="button"
        >
          Undo
        </button>
        <button
          aria-label={`Dismiss ${receipt.message}`}
          className="w2a2d-receipt__dismiss"
          data-track-d-critical-target="receipt-action"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </span>
    </aside>
  );
}

const focusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.tabIndex >= 0,
  );

interface TrackDSheetProps {
  children: ReactNode;
  description: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  title: string;
}

export function TrackDSheet({
  children,
  description,
  initialFocusRef,
  onDismiss,
  title,
}: TrackDSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTarget = initialFocusRef?.current ?? closeRef.current;
    window.requestAnimationFrame(() =>
      focusTarget?.focus({ preventScroll: true }),
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      const focusable = focusableElements(sheetRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      origin?.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  return (
    <div
      className="w2a2d-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w2a2d-sheet"
        ref={sheetRef}
        role="dialog"
      >
        <div className="w2a2d-sheet__grabber" aria-hidden="true" />
        <header className="w2a2d-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            aria-label={`Close ${title}`}
            className="w2a2d-icon-button"
            onClick={onDismiss}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={21} />
          </button>
        </header>
        <div className="w2a2d-sheet__body">{children}</div>
      </section>
    </div>
  );
}
