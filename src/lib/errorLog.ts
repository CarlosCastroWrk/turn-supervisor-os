// A tiny on-device problem log. Until now the app had NO error capture: when
// something broke in the field, Los knew because he noticed. Every uncaught
// error, unhandled promise rejection, root crash, refused save, and sync
// failure now lands here (newest first, capped small so it can never crowd the
// ledger out of the 5MB budget), and More → Storage can hand the whole thing
// to Claude as plain text in one tap.
//
// Rules: never throw, never import storage.ts (storage imports this), keep it
// synchronous — it runs inside failure paths.

export const ERROR_LOG_STORAGE_KEY = 'turn-os:error-log-v1';
export const ERROR_LOG_MAX_ENTRIES = 40;
const MAX_MESSAGE_CHARS = 400;
const MAX_DETAIL_CHARS = 600;

export type ErrorLogKind = 'error' | 'rejection' | 'crash' | 'save' | 'sync';

export interface ErrorLogEntry {
  at: string; // ISO timestamp (UTC), when it was recorded
  kind: ErrorLogKind;
  message: string;
  detail?: string;
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const describe = (value: unknown): { message: string; detail?: string } => {
  if (value instanceof Error) {
    return {
      message: `${value.name}: ${value.message}`,
      detail: value.stack ? clip(value.stack, MAX_DETAIL_CHARS) : undefined,
    };
  }
  if (typeof value === 'string') return { message: value };
  try {
    return { message: JSON.stringify(value) ?? String(value) };
  } catch {
    return { message: String(value) };
  }
};

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const readErrorLog = (): ErrorLogEntry[] => {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(ERROR_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ErrorLogEntry =>
      typeof item === 'object' && item !== null
      && typeof (item as ErrorLogEntry).at === 'string'
      && typeof (item as ErrorLogEntry).kind === 'string'
      && typeof (item as ErrorLogEntry).message === 'string');
  } catch {
    return [];
  }
};

const listeners = new Set<() => void>();
export const subscribeToErrorLog = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const notify = () => { listeners.forEach((listener) => { try { listener(); } catch { /* never */ } }); };

const write = (entries: ErrorLogEntry[]) => {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(ERROR_LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, ERROR_LOG_MAX_ENTRIES)));
  } catch {
    // Out of space: drop the oldest half and try once more, then give up —
    // the log must never be the thing that fails.
    try {
      store.setItem(ERROR_LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, Math.ceil(ERROR_LOG_MAX_ENTRIES / 2))));
    } catch { /* give up */ }
  }
};

export const logError = (kind: ErrorLogKind, problem: unknown, context?: string): void => {
  try {
    const described = describe(problem);
    const entry: ErrorLogEntry = {
      at: new Date().toISOString(),
      kind,
      message: clip(context ? `${context} — ${described.message}` : described.message, MAX_MESSAGE_CHARS),
      ...(described.detail ? { detail: described.detail } : {}),
    };
    const current = readErrorLog();
    // Collapse a tight repeat (same kind + message as the newest entry) so a
    // render loop can't fill the whole log with one line.
    if (current[0] && current[0].kind === entry.kind && current[0].message === entry.message) {
      current[0] = { ...entry, detail: current[0].detail ?? entry.detail };
      write(current);
    } else {
      write([entry, ...current]);
    }
    notify();
  } catch { /* never throw from a failure path */ }
};

export const clearErrorLog = (): void => {
  const store = storage();
  if (!store) return;
  try { store.removeItem(ERROR_LOG_STORAGE_KEY); } catch { /* ignore */ }
  notify();
};

let installed = false;
// Wire the two browser-level nets once. Safe to call more than once.
export const installGlobalErrorCapture = (): void => {
  if (installed || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  installed = true;
  window.addEventListener('error', (event) => {
    const source = event.filename ? ` (${event.filename.split('/').pop()}:${event.lineno})` : '';
    logError('error', event.error ?? event.message, `Uncaught${source}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    logError('rejection', event.reason ?? 'Unhandled promise rejection');
  });
};

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

// iPhone: the share sheet (Messages / Notes / paste to Claude). Anywhere else:
// the clipboard. Never throws.
export const shareProblemReport = async (text: string): Promise<ShareOutcome> => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text, title: 'Turn OS problem report' });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch { /* fall through */ }
  return 'failed';
};

export interface ProblemReportContext {
  build: string;
  storage?: { percentUsed: number; approxMb: number } | null;
  counts?: Record<string, number>;
  saveStatus?: string;
}

// Plain text Los can paste to Claude or text to himself. No pay, no names —
// just what broke, when, and the shape of the device.
export const buildProblemReport = (context: ProblemReportContext, entries = readErrorLog()): string => {
  const lines: string[] = [
    'Turn OS problem report',
    `Sent: ${new Date().toISOString()}`,
    `Build: ${context.build}`,
  ];
  if (typeof navigator !== 'undefined' && navigator.userAgent) lines.push(`Device: ${navigator.userAgent}`);
  if (context.storage) lines.push(`Storage: ${context.storage.percentUsed}% (~${context.storage.approxMb} MB)`);
  if (context.saveStatus) lines.push(`Last save: ${context.saveStatus}`);
  if (context.counts) {
    lines.push(`Records: ${Object.entries(context.counts).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  }
  lines.push('', entries.length === 0 ? 'No problems recorded.' : `Problems (${entries.length}, newest first):`);
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. [${entry.kind}] ${entry.at} — ${entry.message}`);
    if (entry.detail) lines.push(`   ${entry.detail.split('\n').slice(0, 4).join('\n   ')}`);
  });
  return lines.join('\n');
};
