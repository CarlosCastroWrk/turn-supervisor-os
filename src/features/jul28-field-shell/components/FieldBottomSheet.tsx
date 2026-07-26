import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface FieldBottomSheetProps {
  children: ReactNode;
  description: string;
  open: boolean;
  title: string;
  onDismiss: () => void;
}

const getFocusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));

export function FieldBottomSheet({
  children,
  description,
  open,
  title,
  onDismiss,
}: FieldBottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
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
  }, [onDismiss, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="j28-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="j28-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="j28-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            ref={closeRef}
            className="j28-icon-button"
            data-j28-touch="true"
            type="button"
            onClick={onDismiss}
            aria-label={`Close ${title}`}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="j28-sheet__body">{children}</div>
      </section>
    </div>
  );
}
