import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onSelect: () => void | Promise<void>;
}

export interface ToastOptions {
  tone?: ToastTone;
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastApi {
  notify: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.');
  }
  return context;
};
