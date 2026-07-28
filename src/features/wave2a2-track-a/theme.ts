import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

export type TurnThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTurnTheme = Exclude<TurnThemePreference, 'system'>;

const THEME_STORAGE_PREFIX = 'turn-os:appearance:v1';
const DEVICE_THEME_STORAGE_KEY = `${THEME_STORAGE_PREFIX}:device`;
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

const THEME_COLORS: Record<ResolvedTurnTheme, string> = {
  dark: '#000000',
  light: '#f2f4f7',
};

const isThemePreference = (value: string | null): value is TurnThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const normalizeScope = (scopeId?: string) => {
  const normalized = scopeId?.trim().replace(/[^a-zA-Z0-9._-]+/gu, '-');
  return normalized && normalized !== 'local-unconfigured-device'
    ? normalized.slice(0, 96)
    : undefined;
};

export const getThemePreferenceStorageKey = (scopeId?: string) => {
  const normalized = normalizeScope(scopeId);
  return normalized
    ? `${THEME_STORAGE_PREFIX}:account:${normalized}`
    : DEVICE_THEME_STORAGE_KEY;
};

const readStorageValue = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const readThemePreference = (scopeId?: string): TurnThemePreference => {
  const scopedValue = readStorageValue(getThemePreferenceStorageKey(scopeId));
  if (isThemePreference(scopedValue)) return scopedValue;

  const deviceValue = readStorageValue(DEVICE_THEME_STORAGE_KEY);
  return isThemePreference(deviceValue) ? deviceValue : 'system';
};

export const resolveTurnTheme = (
  preference: TurnThemePreference,
  systemPrefersDark: boolean,
): ResolvedTurnTheme => (
  preference === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : preference
);

const currentSystemThemeIsDark = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(DARK_MEDIA_QUERY).matches;

export const applyTurnThemeToDocument = (
  preference: TurnThemePreference,
  resolvedTheme = resolveTurnTheme(preference, currentSystemThemeIsDark()),
) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.turnTheme = resolvedTheme;
  root.dataset.turnThemePreference = preference;
  root.style.colorScheme = resolvedTheme;

  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    document.head.append(themeColor);
  }
  themeColor.content = THEME_COLORS[resolvedTheme];
};

export const initializeTurnTheme = () => {
  const preference = readThemePreference();
  applyTurnThemeToDocument(preference);
  return preference;
};

const writeThemePreference = (
  preference: TurnThemePreference,
  scopeId?: string,
) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_THEME_STORAGE_KEY, preference);
    const scopedKey = getThemePreferenceStorageKey(scopeId);
    if (scopedKey !== DEVICE_THEME_STORAGE_KEY) {
      window.localStorage.setItem(scopedKey, preference);
    }
  } catch {
    // Appearance remains usable for this session when storage is unavailable.
  }
};

export interface TurnThemeState {
  preference: TurnThemePreference;
  reducedMotion: boolean;
  resolvedTheme: ResolvedTurnTheme;
  setPreference: (preference: TurnThemePreference) => void;
}

export function useTurnTheme(scopeId?: string): TurnThemeState {
  const [preference, setPreferenceState] = useState<TurnThemePreference>(
    () => readThemePreference(scopeId),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    currentSystemThemeIsDark,
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => (
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
    ),
  );

  useLayoutEffect(() => {
    setPreferenceState(readThemePreference(scopeId));
  }, [scopeId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const darkQuery = window.matchMedia(DARK_MEDIA_QUERY);
    const motionQuery = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
    const handleDarkChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    const handleMotionChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    darkQuery.addEventListener('change', handleDarkChange);
    motionQuery.addEventListener('change', handleMotionChange);
    return () => {
      darkQuery.removeEventListener('change', handleDarkChange);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  const resolvedTheme = resolveTurnTheme(preference, systemPrefersDark);

  useLayoutEffect(() => {
    applyTurnThemeToDocument(preference, resolvedTheme);
    document.documentElement.dataset.turnReducedMotion = String(reducedMotion);
  }, [preference, reducedMotion, resolvedTheme]);

  const setPreference = useCallback((nextPreference: TurnThemePreference) => {
    writeThemePreference(nextPreference, scopeId);
    setPreferenceState(nextPreference);
  }, [scopeId]);

  return {
    preference,
    reducedMotion,
    resolvedTheme,
    setPreference,
  };
}

initializeTurnTheme();
