import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

interface NativeSheetProps {
  children: ReactNode;
  description: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  title: string;
}

const focusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => (
    !element.hasAttribute('hidden')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex >= 0
  ));

export function NativeSheet({
  children,
  description,
  initialFocusRef,
  onDismiss,
  title,
}: NativeSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTarget = initialFocusRef?.current ?? closeRef.current;
    window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      const focusable = focusableElements(sheetRef.current);
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
  }, [initialFocusRef]);

  return (
    <div
      className="tc-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="tc-sheet"
        data-track-c-dialog="true"
        ref={sheetRef}
        role="dialog"
      >
        <div className="tc-sheet__grabber" aria-hidden="true" />
        <header className="tc-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            aria-label={`Close ${title}`}
            className="tc-icon-button"
            data-track-c-critical-target="true"
            onClick={onDismiss}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={21} />
          </button>
        </header>
        <div className="tc-sheet__body">{children}</div>
      </section>
    </div>
  );
}
