// Device-local "who did I contact" log. Deliberately NOT part of the event
// ledger (schema freeze during the Turn) — a lost log entry costs nothing
// operationally, so localStorage is the right grain.

const CONTACT_LOG_KEY = 'turn-os:contact-log:v1';
import { localDayOf } from './localDay';
const CONTACT_LOG_CAP = 300;

export interface ContactLogEntry {
  at: string;
  crewId: string;
  name: string;
  kind: 'call' | 'text' | 'ai-text';
}

export const readContactLog = (): ContactLogEntry[] => {
  try {
    const raw = window.localStorage.getItem(CONTACT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ContactLogEntry =>
      Boolean(entry)
      && typeof (entry as ContactLogEntry).at === 'string'
      && typeof (entry as ContactLogEntry).crewId === 'string'
      && typeof (entry as ContactLogEntry).name === 'string'
      && ['call', 'text', 'ai-text'].includes((entry as ContactLogEntry).kind));
  } catch {
    return [];
  }
};

export const appendContactLog = (
  entry: Omit<ContactLogEntry, 'at'>,
): ContactLogEntry[] => {
  const next = [
    { ...entry, at: new Date().toISOString() },
    ...readContactLog(),
  ].slice(0, CONTACT_LOG_CAP);
  try {
    window.localStorage.setItem(CONTACT_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full — the in-memory copy still reflects the tap.
  }
  return next;
};

const localDateOf = (iso: string) => {
  const date = new Date(iso);
  return localDayOf(date);
};

export const contactsToday = (log: readonly ContactLogEntry[]): ContactLogEntry[] => {
  const today = localDateOf(new Date().toISOString());
  return log.filter((entry) => localDateOf(entry.at) === today);
};

export const lastContactTodayFor = (
  log: readonly ContactLogEntry[],
  crewId: string,
): ContactLogEntry | undefined =>
  contactsToday(log).find((entry) => entry.crewId === crewId);
