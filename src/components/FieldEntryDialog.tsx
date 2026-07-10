import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface FieldEntryDialogProps {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}

export function FieldEntryDialog({ title, description, children, onClose }: FieldEntryDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="field-entry-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="field-entry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-entry-title"
        aria-describedby="field-entry-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="field-entry-dialog__header">
          <div>
            <h2 id="field-entry-title">{title}</h2>
            <p id="field-entry-description">{description}</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="field-entry-dialog__body">{children}</div>
      </section>
    </div>
  );
}
