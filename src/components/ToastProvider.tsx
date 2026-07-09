import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createId } from '../lib/constants';
import { ToastContext, type ToastAction, type ToastOptions } from './toast-context';

interface ToastItem extends Required<Pick<ToastOptions, 'tone' | 'durationMs'>> {
  id: string;
  message: string;
  action?: ToastAction;
}

const durationFor = (options?: ToastOptions) => {
  if (options?.durationMs) {
    return options.durationMs;
  }
  if (options?.action) {
    return 10_000;
  }
  return options?.tone === 'error' ? 7_000 : 5_000;
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return;
    }

    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.durationMs, toast.id]);

  const runAction = async () => {
    onDismiss(toast.id);
    try {
      await toast.action?.onSelect();
    } catch (error) {
      console.error('Toast action failed.', error);
    }
  };

  return (
    <div
      className={`field-toast field-toast--${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <p>{toast.message}</p>
      <div className="field-toast__actions">
        {toast.action ? (
          <button className="field-toast__action" type="button" onClick={() => void runAction()}>
            {toast.action.label}
          </button>
        ) : null}
        <button className="field-toast__dismiss" type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, options?: ToastOptions) => {
    const id = createId('toast');
    const toast: ToastItem = {
      id,
      message,
      tone: options?.tone ?? 'info',
      durationMs: durationFor(options),
      action: options?.action,
    };
    setToasts((current) => [...current, toast].slice(-3));
    return id;
  }, []);

  const api = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="field-toast-viewport">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
